import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isUploadedImagePath } from "@/lib/uploads";
import { z } from "zod";

const questionSchema = z.object({
  text: z.string().trim().min(1),
  points: z.coerce.number().int().positive(),
  questionType: z.enum(["SINGLE", "MULTIPLE", "BOOLEAN", "TEXT_ESSAY"]).default("SINGLE"),
  imageUrl: z.string().nullable().optional(),
  options: z.array(z.object({
    text: z.string().trim().min(1),
    isCorrect: z.boolean().default(false),
    imageUrl: z.string().nullable().optional(),
  })).default([]),
});

async function getExamWithQuestions(id: string) {
  const exam = await prisma.exam.findUnique({ where: { id } });
  if (!exam) return null;
  const questions = await prisma.question.findMany({ where: { examId: id }, orderBy: { createdAt: "asc" } });
  const options = await prisma.option.findMany({ where: { questionId: { in: questions.map((q) => q.id) } } });
  const optionsByQuestion = new Map<string, typeof options>();
  for (const o of options) {
    const list = optionsByQuestion.get(o.questionId) ?? [];
    list.push(o);
    optionsByQuestion.set(o.questionId, list);
  }
  return {
    ...exam,
    questions: questions.map((q) => ({ ...q, options: optionsByQuestion.get(q.id) ?? [] })),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const exam = await getExamWithQuestions(id);

    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    const hasActiveAttempt = user.role === "STUDENT"
      ? Boolean(await prisma.submission.findFirst({ where: { examId: id, userId: user.id, status: "IN_PROGRESS" }, select: { id: true } }))
      : false;
    if ((!exam.published && user.role === "STUDENT" && !hasActiveAttempt) || (user.role === "TEACHER" && exam.createdById !== user.id)) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (user.role === "STUDENT" && exam.classId && !hasActiveAttempt) {
      const enrollment = await prisma.classEnrollment.findFirst({ where: { classId: exam.classId, userId: user.id }, select: { status: true } });
      if (enrollment?.status !== "APPROVED") return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    const safeExam = user.role === "STUDENT" ? {
      ...exam,
      questions: exam.questions.map(({ options, ...question }) => ({
        ...question,
        options: options.map(({ id, text, imageUrl }) => ({ id, text, imageUrl })),
      })),
    } : exam;
    return NextResponse.json({ exam: safeExam }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN" && user.role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: examId } = await params;
    const parsed = questionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the question text, points, type, and options" }, { status: 400 });
    const { text, points, questionType, options, imageUrl } = parsed.data;

    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, createdById: true } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (user.role === "TEACHER" && exam.createdById !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const type = questionType;
    if (type !== "TEXT_ESSAY" && options.length < 2) {
      return NextResponse.json({ error: "Choice questions need at least two non-empty options" }, { status: 400 });
    }
    if ((type === "SINGLE" || type === "BOOLEAN") && options.filter((option) => option.isCorrect).length !== 1) {
      return NextResponse.json({ error: "Select exactly one correct option" }, { status: 400 });
    }
    if (type === "MULTIPLE" && options.filter((option) => option.isCorrect).length < 1) {
      return NextResponse.json({ error: "Select at least one correct option" }, { status: 400 });
    }
    if (imageUrl !== undefined && imageUrl !== null && imageUrl !== "" && !isUploadedImagePath(imageUrl)) {
      return NextResponse.json({ error: "Upload a question image using the image upload control" }, { status: 400 });
    }
    if (type !== "TEXT_ESSAY" && options.some((option) => option.imageUrl && !isUploadedImagePath(option.imageUrl))) {
      return NextResponse.json({ error: "Upload each option image using the image upload control" }, { status: 400 });
    }

    const question = await prisma.question.create({
      data: {
        examId,
        text: text.trim(),
        imageUrl: isUploadedImagePath(imageUrl) ? imageUrl : null,
        points,
        questionType: type,
      },
    });
    const createdOptions = type === "TEXT_ESSAY" ? [] : await Promise.all(
      options.map((opt) =>
        prisma.option.create({
          data: {
            questionId: question.id,
            text: opt.text.trim(),
            imageUrl: isUploadedImagePath(opt.imageUrl) ? opt.imageUrl : null,
            isCorrect: !!opt.isCorrect,
          },
        })
      )
    );
    await writeAuditLog(user.id, "QUESTION_CREATED", examId, text.trim());

    return NextResponse.json({ message: "Question added successfully", question: { ...question, options: createdOptions } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN" && user.role !== "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const existing = await prisma.exam.findUnique({ where: { id }, select: { createdById: true } });
    if (!existing) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (user.role === "TEACHER" && existing.createdById !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const data: { title?: string; description?: string | null; duration?: number; passingScore?: number; published?: boolean } = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === "string" || body.description === null) data.description = body.description;
    if (body.duration !== undefined && Number.isInteger(Number(body.duration)) && Number(body.duration) > 0 && Number(body.duration) <= 600) data.duration = Number(body.duration);
    if (body.passingScore !== undefined && Number.isFinite(Number(body.passingScore)) && Number(body.passingScore) >= 0 && Number(body.passingScore) <= 100) data.passingScore = Number(body.passingScore);
    if (body.published === true) {
      const questionCount = await prisma.question.count({ where: { examId: id } });
      if (!questionCount) return NextResponse.json({ error: "Add at least one question before publishing" }, { status: 400 });
    }
    if (typeof body.published === "boolean") data.published = body.published;
    if (!Object.keys(data).length) return NextResponse.json({ error: "No valid exam fields provided" }, { status: 400 });
    const exam = await prisma.exam.update({ where: { id }, data });
    await writeAuditLog(user.id, data.published === undefined ? "EXAM_UPDATED" : data.published ? "EXAM_PUBLISHED" : "EXAM_UNPUBLISHED", id, JSON.stringify(data));
    return NextResponse.json({ exam }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
