export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  isActive: boolean;
  createdAt?: string;
}

export interface PlatformAnalytics {
  students: number;
  teachers: number;
  publishedExams: number;
  submissions: number;
}

export interface BadgeView {
  id: string;
  name: string;
  description: string | null;
  imageUrl?: string | null;
  _count?: { users: number };
  badge?: { name: string; description: string | null; imageUrl?: string | null };
}

export interface ClassView {
  id: string;
  name: string;
  description?: string | null;
  joinCode: string;
  teacherId: string | null;
  teacher?: { id?: string; name: string; email?: string } | null;
  enrollments?: EnrollmentView[];
  _count: { enrollments: number; exams: number };
}

export interface EnrollmentView {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  user?: { id: string; name: string; email: string };
}

export interface OptionView {
  id: string;
  text: string;
  isCorrect?: boolean;
  imageUrl?: string | null;
}

export interface QuestionView {
  id: string;
  text: string;
  points: number;
  questionType: "SINGLE" | "MULTIPLE" | "BOOLEAN" | "TEXT_ESSAY";
  imageUrl?: string | null;
  options?: OptionView[];
}

export interface ExamView {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  passingScore: number;
  published: boolean;
  classId?: string | null;
  createdById?: string;
  _count?: { questions: number };
  questions?: QuestionView[];
  submissions?: Array<{ status: string; score: number; totalScore: number }>; // etudiant : sa tentative
}

export interface StudentSubmissionView {
  id: string;
  score: number;
  totalScore: number;
  status: string;
  submittedAt: string;
  exam?: { title: string };
}

export interface StudentProfileView {
  user?: { name: string; email: string; avatarUrl: string | null };
  badges: Array<{ id: string; badge: BadgeView }>;
  certificates: Array<{ id: string; code: string; examTitle: string; issuedAt: string }>;
  submissions: StudentSubmissionView[];
}

export interface CertificateView {
  id: string;
  code: string;
  examTitle: string;
  description?: string | null;
  issuerName?: string | null;
  issuedAt: string;
  user: { name: string };
}

export interface GradingAnswerView {
  id: string;
  score: number;
  feedback: string | null;
  textResponse: string | null;
  selectedOption?: OptionView | null;
  question: QuestionView;
}

export interface GradingSubmissionView {
  id: string;
  status: string;
  submittedAt: string;
  user: { id: string; name: string; email: string };
  exam: { id: string; title: string; passingScore: number };
  answers: GradingAnswerView[];
}

export interface AuditLogView {
  id: string;
  action: string;
  target: string | null;
  details: string | null;
  createdAt: string;
  actor?: { name: string; email: string } | null;
}

export interface StudentResultView extends StudentSubmissionView {
  exam: { id: string; title: string };
  feedback: string | null;
  answers: Array<GradingAnswerView & { question: QuestionView }>;
}
