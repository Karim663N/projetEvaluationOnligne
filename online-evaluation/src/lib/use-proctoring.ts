'use client';

// Surveillance ExamGuard AI cote navigateur, active uniquement pendant un examen.
// - temps cumule par question (branche B du module ML, regle « temps ideal = 180 s ») ;
// - compteurs d'evenements navigateur (changements d'onglet, copier-coller...) : regles affichees, pas de ML ;
// - webcam (si consentement) : MediaPipe Tasks Vision tourne dans le navigateur et ne produit que
//   26 indicateurs par image (repere 640x480, conventions du jeu Mendeley). Aucune image ne quitte le navigateur.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProctoringPayload, WebcamFrame } from '@/lib/proctoring';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';
const W = 640;
const H = 480;
const FRAME_PERIOD_MS = 2000;
const MAX_FRAMES = 3000;

type Pt = { x: number; y: number };
type Box = { originX: number; originY: number; width: number; height: number };
interface Detector<R> { detect(image: HTMLCanvasElement): R; close?(): void }
interface Tasks {
  face: Detector<{ detections?: { boundingBox: Box; keypoints: Pt[] }[] }>;
  mesh: Detector<{ faceLandmarks?: Pt[][] }>;
  hands: Detector<{ landmarks?: Pt[][]; handedness?: { categoryName: string }[][]; handednesses?: { categoryName: string }[][] }>;
  objs: Detector<{ detections?: { boundingBox: Box }[] }>;
}
type VisionModule = Record<string, { createFromOptions(fs: unknown, options: unknown): Promise<unknown>; forVisionTasks?(path: string): Promise<unknown> }>;

export type WebcamStatus = 'off' | 'loading' | 'on' | 'denied' | 'error';

// Chargement de MediaPipe depuis le CDN via un <script type="module"> (hors du bundler Next.js)
function loadVision(): Promise<VisionModule> {
  const w = window as unknown as { __egVision?: VisionModule };
  if (w.__egVision) return Promise.resolve(w.__egVision);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('MediaPipe : délai dépassé')), 60000);
    window.addEventListener('eg-vision-ready', () => { window.clearTimeout(timer); resolve(w.__egVision as VisionModule); }, { once: true });
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `import * as v from "${MP}/vision_bundle.mjs"; window.__egVision = v; window.dispatchEvent(new Event("eg-vision-ready"));`;
    s.onerror = () => reject(new Error('MediaPipe : chargement impossible'));
    document.head.appendChild(s);
  });
}

// MediaPipe (WebAssembly) ecrit ses messages d'information sur console.error
// (« INFO: Created TensorFlow Lite XNNPACK delegate for CPU. », lignes « I1125 ... » / « W1125 ... »).
// En developpement, Next.js compte chaque console.error comme un « Issue » : on redirige UNIQUEMENT
// ces messages d'information vers console.info. Les vraies erreurs restent des erreurs.
const MEDIAPIPE_INFO = /^(INFO: |[IW]\d{4} \d{2}:\d{2}:\d{2})/;
function quietMediaPipeLogs() {
  const w = window as unknown as { __egQuietLogs?: boolean };
  if (w.__egQuietLogs) return;
  w.__egQuietLogs = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && MEDIAPIPE_INFO.test(args[0])) {
      console.info('[MediaPipe]', ...args);
      return;
    }
    original(...args);
  };
}

async function createTasks(): Promise<Tasks> {
  quietMediaPipeLogs();
  const v = await loadVision();
  const fs = await v.FilesetResolver.forVisionTasks!(`${MP}/wasm`);
  const opt = (path: string) => ({ baseOptions: { modelAssetPath: path, delegate: 'CPU' }, runningMode: 'IMAGE' });
  const [face, mesh, hands, objs] = await Promise.all([
    v.FaceDetector.createFromOptions(fs, { ...opt(`${MODELS}/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`), minDetectionConfidence: 0.5 }),
    v.FaceLandmarker.createFromOptions(fs, { ...opt(`${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`), numFaces: 1 }),
    v.HandLandmarker.createFromOptions(fs, { ...opt(`${MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`), numHands: 2 }),
    v.ObjectDetector.createFromOptions(fs, { ...opt(`${MODELS}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`), scoreThreshold: 0.5, maxResults: 1, categoryAllowlist: ['cell phone'] }),
  ]);
  return { face, mesh, hands, objs } as Tasks;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

// Memes conventions que ml/scripts/demo_page.html et reports/audit_webcam.md
function extract(t: Tasks, img: HTMLCanvasElement): WebcamFrame {
  const f: WebcamFrame = {
    face_present: 0, no_of_face: 0, face_x: 0, face_y: 0, face_w: 0, face_h: 0,
    left_eye_x: 0, left_eye_y: 0, right_eye_x: 0, right_eye_y: 0, nose_tip_x: 0, nose_tip_y: 0,
    mouth_x: 0, mouth_y: 0, hand_count: 0, left_hand_x: 0, left_hand_y: 0, right_hand_x: 0, right_hand_y: 0,
    phone_present: 0, phone_loc_x: 0, phone_loc_y: 0, pupil_left_x: 0, pupil_left_y: 0, pupil_right_x: 0, pupil_right_y: 0,
  };
  const dets = t.face.detect(img).detections || [];
  f.no_of_face = Math.min(dets.length, 10);
  f.face_present = dets.length ? 1 : 0;
  if (dets.length) {
    const d = dets.reduce((a, b) => (b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a));
    const bb = d.boundingBox;
    f.face_x = r2(clamp(bb.originX, -640, 1280)); f.face_y = r2(clamp(bb.originY, -480, 960));
    f.face_w = r2(clamp(bb.width, 0, 1280)); f.face_h = r2(clamp(bb.height, 0, 960));
    const k = d.keypoints;
    const [L, R] = k[0].x <= k[1].x ? [k[0], k[1]] : [k[1], k[0]];
    f.left_eye_x = r2(L.x * W); f.left_eye_y = r2(L.y * H); f.right_eye_x = r2(R.x * W); f.right_eye_y = r2(R.y * H);
    f.nose_tip_x = r2(k[2].x * W); f.nose_tip_y = r2(k[2].y * H); f.mouth_x = r2(k[3].x * W); f.mouth_y = r2(k[3].y * H);
  }
  const lm = (t.mesh.detect(img).faceLandmarks || [])[0];
  if (lm && lm.length > 473) {
    const [L, R] = lm[468].x <= lm[473].x ? [lm[468], lm[473]] : [lm[473], lm[468]];
    f.pupil_left_x = Math.round(clamp(L.x * W, 0, 640)); f.pupil_left_y = Math.round(clamp(L.y * H, 0, 480));
    f.pupil_right_x = Math.round(clamp(R.x * W, 0, 640)); f.pupil_right_y = Math.round(clamp(R.y * H, 0, 480));
  }
  const hr = t.hands.detect(img);
  const hands = hr.landmarks || [];
  const hd = hr.handedness || hr.handednesses || [];
  f.hand_count = Math.min(hands.length, 4);
  hands.forEach((h, i) => {
    const side = hd[i]?.[0]?.categoryName === 'Right' ? 'right' : 'left';
    f[`${side}_hand_x`] = r2(clamp(h[0].x, -0.5, 1.5));
    f[`${side}_hand_y`] = r2(clamp(h[0].y, -0.5, 1.5));
  });
  const ph = (t.objs.detect(img).detections || [])[0];
  if (ph) {
    const b = ph.boundingBox;
    f.phone_present = 1;
    f.phone_loc_x = r2(clamp(b.originX + b.width / 2, 0, 640));
    f.phone_loc_y = r2(clamp(b.originY + b.height / 2, 0, 480));
  }
  return f;
}

export function useProctoring(active: boolean, firstQuestionId: string | null, consentWebcam: boolean) {
  const seconds = useRef<Record<string, number>>({});
  const current = useRef<string | null>(null);
  const events = useRef<Record<string, number>>({});
  const frames = useRef<WebcamFrame[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamStatus, setWebcamStatus] = useState<WebcamStatus>('off');
  const [frameCount, setFrameCount] = useState(0);

  const markActive = useCallback((questionId: string) => { current.current = questionId; }, []);

  // Temps par question + evenements navigateur
  useEffect(() => {
    if (!active) return;
    seconds.current = {};
    events.current = { tabSwitches: 0, windowBlur: 0, copy: 0, paste: 0, cut: 0, contextMenu: 0, hiddenSeconds: 0 };
    current.current = firstQuestionId;
    const inc = (key: string) => { events.current[key] = (events.current[key] || 0) + 1; };
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        const q = current.current;
        if (q) seconds.current[q] = (seconds.current[q] || 0) + 1;
      } else {
        events.current.hiddenSeconds += 1;
      }
    }, 1000);
    const onVisibility = () => { if (document.visibilityState === 'hidden') inc('tabSwitches'); };
    const onBlur = () => inc('windowBlur');
    const onCopy = () => inc('copy');
    const onPaste = () => inc('paste');
    const onCut = () => inc('cut');
    const onContext = () => inc('contextMenu');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('contextmenu', onContext);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [active, firstQuestionId]);

  // Webcam -> indicateurs MediaPipe (uniquement avec consentement)
  useEffect(() => {
    if (!active || !consentWebcam) { setWebcamStatus('off'); return; }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let tasks: Tasks | null = null;
    const videoEl = videoRef.current;
    frames.current = [];
    setFrameCount(0);
    const work = document.createElement('canvas');
    work.width = W; work.height = H;
    const ctx = work.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        setWebcamStatus('loading');
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (stopped) return;
        if (videoEl) { videoEl.srcObject = stream; await videoEl.play().catch(() => undefined); }
        tasks = await createTasks();
        if (stopped) return;
        setWebcamStatus('on');
        timer = window.setInterval(() => {
          const video = videoEl;
          if (!video || !ctx || !tasks || video.videoWidth === 0 || frames.current.length >= MAX_FRAMES) return;
          // recadrage central 4:3 -> 640x480, image en miroir (convention retenue, cf. audit webcam)
          const vw = video.videoWidth, vh = video.videoHeight;
          const sw = Math.min(vw, (vh * 4) / 3), sh = (sw * 3) / 4;
          ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
          ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
          ctx.restore();
          try {
            frames.current.push(extract(tasks, work));
            setFrameCount(frames.current.length);
          } catch { /* image ignoree */ }
        }, FRAME_PERIOD_MS);
      } catch (error) {
        if (!stopped) setWebcamStatus((error as Error).name === 'NotAllowedError' ? 'denied' : 'error');
      }
    })();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [active, consentWebcam]);

  const snapshot = useCallback((): ProctoringPayload => ({
    consentWebcam,
    questionSeconds: { ...seconds.current },
    frames: consentWebcam ? frames.current.slice() : [],
    events: { ...events.current },
  }), [consentWebcam]);

  return { videoRef, webcamStatus, frameCount, markActive, snapshot };
}
