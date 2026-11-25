// Liaison avec le service ML ExamGuard AI (ml/service.py, FastAPI).
// Appele uniquement cote serveur (routes API) : le navigateur n'envoie jamais rien directement au service ML.
import { prisma } from "@/lib/prisma";

export const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:8000";
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 20000);
const MAX_FRAMES = 3000;

export type WebcamFrame = Record<string, number>;

export interface ProctoringPayload {
  consentWebcam?: boolean;
  questionSeconds?: Record<string, number>; // temps cumule par question (s), mesure dans le navigateur
  frames?: WebcamFrame[];                     // indicateurs MediaPipe (26 nombres par image), jamais d'image
  events?: Record<string, number>;            // compteurs d'evenements navigateur
}

export interface GradedQuestion {
  id: string;
  answered: boolean;
  correct: boolean;
}

const EVENT_KEYS = ["tabSwitches", "windowBlur", "copy", "paste", "cut", "contextMenu", "hiddenSeconds"] as const;

export function sanitizeEvents(events: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!events || typeof events !== "object") return out;
  for (const key of EVENT_KEYS) {
    const value = Number((events as Record<string, unknown>)[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = Math.min(Math.round(value), 1_000_000);
  }
  return out;
}

function sanitizeFrames(frames: unknown): WebcamFrame[] {
  if (!Array.isArray(frames)) return [];
  return frames.slice(0, MAX_FRAMES).filter((f) => f && typeof f === "object") as WebcamFrame[];
}

/** Appelle le service ML puis enregistre le rapport. Ne leve jamais : une panne du service ML
 *  ne doit pas empecher la remise de la copie (le rapport est alors marque ML_UNAVAILABLE). */
export async function scoreAndStoreReport(opts: {
  submissionId: string;
  questions: GradedQuestion[];
  sessionSeconds: number;
  payload: ProctoringPayload | undefined;
}) {
  const payload = opts.payload ?? {};
  const seconds = payload.questionSeconds ?? {};
  const answers = opts.questions
    .filter((q) => q.answered)
    .map((q) => ({ seconds: Math.max(0, Math.min(86400, Number(seconds[q.id]) || 0)), correct: q.correct }));
  const frames = payload.consentWebcam ? sanitizeFrames(payload.frames) : [];
  const browserEvents = sanitizeEvents(payload.events);
  const body = {
    exam_mode: "remote",
    tot_question: Math.max(1, opts.questions.length),
    session_seconds: Math.max(0, Math.min(86400, Math.round(opts.sessionSeconds))),
    answers,
    frames,
    k: 5,
  };

  let data: Record<string, unknown> | null = null;
  let mlStatus = "OK";
  let errorText: string | null = null;
  try {
    const res = await fetch(`${ML_API_URL}/score-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (res.ok) data = await res.json();
    else { mlStatus = "ERROR"; errorText = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`; }
  } catch (error) {
    mlStatus = "ML_UNAVAILABLE";
    errorText = (error as Error).message;
  }

  const fusion = (data?.fusion ?? {}) as Record<string, unknown>;
  const navigateur = (data?.navigateur ?? {}) as { prediction?: { probabilite_deploiement?: number } };
  const webcam = (data?.webcam ?? null) as { probabilite_deploiement?: number; n_images?: number } | null;
  const report = {
    mlStatus,
    consentWebcam: Boolean(payload.consentWebcam),
    browserScore: navigateur.prediction?.probabilite_deploiement ?? null,
    webcamScore: webcam?.probabilite_deploiement ?? null,
    fusedScore: typeof fusion.score === "number" ? fusion.score : null,
    threshold: typeof fusion.seuil === "number" ? fusion.seuil : null,
    alert: fusion.alerte === true,
    fusionMode: typeof fusion.mode === "string" ? fusion.mode : null,
    webcamFrames: webcam?.n_images ?? 0,
    browserEvents: JSON.stringify(browserEvents),
    details: JSON.stringify(data ?? { erreur: errorText, requete: { ...body, frames: `${frames.length} images` } }),
  };
  return prisma.proctoringReport.upsert({
    where: { submissionId: opts.submissionId },
    create: { submissionId: opts.submissionId, ...report },
    update: report,
  });
}
