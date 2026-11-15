import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = '123456789';

async function main() {
  console.log('🌱 Seeding MongoDB with realistic platform data...');
  const password = await bcrypt.hash(PASSWORD, 10);

  // ─── 1. Users ────────────────────────────────────────────────────────────
  console.log('Creating users...');
  const mk = (email: string, name: string, role: string) =>
    prisma.user.upsert({
      where: { email },
      update: { name, role, password },
      create: { email, name, role, password },
    });

  const admin = await mk('admin@gmail.com', 'Karim Admin', 'ADMIN');
  const teachers = await Promise.all([
    mk('teacher@gmail.com', 'Prof. Jean Dupont', 'TEACHER'),
    mk('prof.martin@onlineeval.com', 'Prof. Sophie Martin', 'TEACHER'),
    mk('prof.haddad@onlineeval.com', 'Dr. Karim Haddad', 'TEACHER'),
  ]);
  const [t1, t2, t3] = teachers;

  const studentData: [string, string][] = [
    ['student@gmail.com', 'Alice Martin'],
    ['yassine.benali@student.com', 'Yassine Benali'],
    ['emma.dubois@student.com', 'Emma Dubois'],
    ['omar.farsi@student.com', 'Omar Farsi'],
    ['lina.khoury@student.com', 'Lina Khoury'],
    ['noah.petit@student.com', 'Noah Petit'],
    ['sara.elamrani@student.com', 'Sara El Amrani'],
    ['adam.bouzid@student.com', 'Adam Bouzid'],
    ['mia.bernard@student.com', 'Mia Bernard'],
    ['ilias.tazi@student.com', 'Ilias Tazi'],
  ];
  const students: { id: string; name: string; email: string }[] = [];
  for (const [email, name] of studentData) {
    const u = await mk(email, name, 'STUDENT');
    students.push({ id: u.id, name: u.name, email: u.email });
  }
  // One inactive student for realism
  await mk('inactive.student@onlineeval.com', 'Inactive Student', 'STUDENT');
  await prisma.user.updateMany({ where: { email: 'inactive.student@onlineeval.com' }, data: { isActive: false } });

  // ─── 2. Classes & enrollments ────────────────────────────────────────────
  console.log('Creating classes & enrollments...');
  const classDefs = [
    { name: 'Web Development Bootcamp', description: 'Full-stack web development with Next.js, React and TypeScript.', joinCode: 'WEB2026', teacherId: t1.id, students: [0, 1, 2, 3, 4], pending: [5] },
    { name: 'Data Science Fundamentals', description: 'Python, pandas and data visualization for beginners.', joinCode: 'DATA101', teacherId: t2.id, students: [1, 4, 6, 7], pending: [] },
    { name: 'Mobile Apps with React Native', description: 'Cross-platform mobile development for iOS and Android.', joinCode: 'MOBL55', teacherId: t3.id, students: [0, 2, 5, 8, 9], pending: [3] },
    { name: 'Cybersecurity Essentials', description: 'Network security, OWASP and ethical hacking basics.', joinCode: 'CYBR77', teacherId: t1.id, students: [6, 7, 9], pending: [] },
    { name: 'UI/UX Design Studio', description: 'Figma, design systems and usability testing.', joinCode: 'UIDX99', teacherId: t2.id, students: [2, 4, 8], pending: [0, 1] },
  ];

  const classes: { id: string; name: string; joinCode: string; teacherId: string | null }[] = [];
  for (const c of classDefs) {
    let cls = await prisma.schoolClass.findFirst({ where: { joinCode: c.joinCode } });
    if (!cls) {
      cls = await prisma.schoolClass.create({
        data: { name: c.name, description: c.description, joinCode: c.joinCode, teacherId: c.teacherId },
      });
    } else {
      cls = await prisma.schoolClass.update({ where: { id: cls.id }, data: { teacherId: c.teacherId } });
    }
    classes.push(cls);
    for (const idx of c.students) {
      const s = students[idx];
      const ex = await prisma.classEnrollment.findFirst({ where: { classId: cls.id, userId: s.id } });
      if (!ex) await prisma.classEnrollment.create({ data: { classId: cls.id, userId: s.id, status: 'APPROVED' } });
    }
    for (const idx of c.pending) {
      const s = students[idx];
      const ex = await prisma.classEnrollment.findFirst({ where: { classId: cls.id, userId: s.id } });
      if (!ex) await prisma.classEnrollment.create({ data: { classId: cls.id, userId: s.id, status: 'PENDING' } });
    }
  }

  // ─── 3. Badges ───────────────────────────────────────────────────────────
  console.log('Creating badges...');
  const badgeDefs = [
    ['Top Performer', 'Scored above 90% on any published exam.'],
    ['Fast Finisher', 'Completed an exam in under half the allotted time.'],
    ['Perfect Score', 'Achieved 100% on an exam.'],
    ['Consistent Learner', 'Submitted exams in 5 different classes.'],
    ['Rising Star', 'Improved score by 20+ points between two attempts.'],
    ['Early Adopter', 'Enrolled in the platform during its first month.'],
  ];
  const badges = [];
  for (const [name, description] of badgeDefs) {
    const b = await prisma.badge.upsert({ where: { name }, update: { description }, create: { name, description } });
    badges.push(b);
  }

  // ─── 4. Exams, questions, options ────────────────────────────────────────
  console.log('Creating exams & questions...');
  type Q = { text: string; points: number; type?: string; options: [string, boolean][] };
  const examDefs: { title: string; description: string; duration: number; passing: number; classIdx: number; teacherId: string; published: boolean; questions: Q[] }[] = [
    {
      title: 'React Fundamentals Quiz', description: 'Core React concepts: components, props, state and hooks.', duration: 20, passing: 60, classIdx: 0, teacherId: t1.id, published: true,
      questions: [
        { text: 'What does JSX stand for?', points: 2, options: [['JavaScript XML', true], ['Java Syntax Extension', false], ['JSON XML', false], ['Java Script X', false]] },
        { text: 'Which hook manages local component state?', points: 2, options: [['useEffect', false], ['useState', true], ['useContext', false], ['useMemo', false]] },
        { text: 'Props in React are:', points: 3, options: [['Mutable', false], ['Read-only', true], ['Global', false], ['Async', false]] },
        { text: 'What triggers a re-render in React?', points: 2, options: [['DOM manipulation', false], ['State or props change', true], ['CSS change', false], ['Console.log', false]] },
        { text: 'useEffect runs:', points: 1, options: [['Before render', false], ['After render / on mount', true], ['Never', false], ['Only in production', false]] },
      ],
    },
    {
      title: 'Next.js App Router Deep Dive', description: 'Server Components, routing, data fetching and caching in Next.js 15.', duration: 30, passing: 70, classIdx: 0, teacherId: t1.id, published: true,
      questions: [
        { text: 'By default, components in the App Router are:', points: 3, options: [['Client Components', false], ['Server Components', true], ['Static HTML', false], ['Web Components', false]] },
        { text: 'Which file defines a dynamic route segment?', points: 2, options: [['page.tsx', false], ['[id]/page.tsx', true], ['route.tsx', false], ['layout.tsx', false]] },
        { text: 'Server Actions are used for:', points: 3, options: [['Styling', false], ['Form submissions & mutations', true], ['SEO only', false], ['Caching', false]] },
        { text: 'fetch() requests are cached by default in:', points: 2, options: [['All environments', false], ['Production only', true], ['Development only', false], ['Never', false]] },
      ],
    },
    {
      title: 'TypeScript Essentials', description: 'Types, interfaces, generics and type safety.', duration: 25, passing: 65, classIdx: 0, teacherId: t1.id, published: false,
      questions: [
        { text: 'Which keyword defines a structural contract for objects?', points: 2, options: [['class', false], ['interface', true], ['type alias only', false], ['enum', false]] },
        { text: 'Generics allow:', points: 2, options: [['Dynamic imports', false], ['Reusable typed functions', true], ['CSS injection', false], ['Async only', false]] },
        { text: 'A union type uses which operator?', points: 1, options: [['&', false], ['|', true], ['&&', false], ['?', false]] },
      ],
    },
    {
      title: 'Python & Pandas Basics', description: 'Variables, lists, dataframes and first visualizations.', duration: 30, passing: 60, classIdx: 1, teacherId: t2.id, published: true,
      questions: [
        { text: 'Which library is used for data manipulation in Python?', points: 2, options: [['NumPy only', false], ['pandas', true], ['React', false], ['Express', false]] },
        { text: 'A pandas DataFrame is best described as:', points: 2, options: [['A 1D array', false], ['A 2D labeled data structure', true], ['A JSON file', false], ['A function', false]] },
        { text: 'How do you read a CSV file in pandas?', points: 3, options: [['pd.load()', false], ['pd.read_csv()', true], ['pd.open()', false], ['pd.import()', false]] },
        { text: 'What does df.head() return?', points: 1, options: [['Last 5 rows', false], ['First 5 rows', true], ['Column names', false], ['Summary stats', false]] },
        { text: 'Boolean indexing in pandas is used to:', points: 2, options: [['Sort data', false], ['Filter rows by condition', true], ['Rename columns', false], ['Plot charts', false]] },
      ],
    },
    {
      title: 'Data Visualization with Matplotlib', description: 'Charts, subplots and styling for data storytelling.', duration: 20, passing: 55, classIdx: 1, teacherId: t2.id, published: true,
      questions: [
        { text: 'Which function creates a line plot?', points: 2, options: [['plt.plot()', true], ['plt.bar()', false], ['plt.scatter()', false], ['plt.hist()', false]] },
        { text: 'plt.show() is used to:', points: 2, options: [['Save figure', false], ['Display the figure', true], ['Clear data', false], ['Import library', false]] },
        { text: 'A histogram is best for showing:', points: 1, options: [['Correlations', false], ['Distribution of numeric data', true], ['Text data', false], ['Networks', false]] },
      ],
    },
    {
      title: 'React Native Navigation', description: 'Stack navigators, tabs and deep linking.', duration: 25, passing: 60, classIdx: 2, teacherId: t3.id, published: true,
      questions: [
        { text: 'Which library is the standard navigator for React Native?', points: 3, options: [['React Navigation', true], ['Vue Router', false], ['Express Router', false], ['Flutter Nav', false]] },
        { text: 'A Stack Navigator is used for:', points: 2, options: [['Hierarchical screens', true], ['Bottom tabs', false], ['Drawers only', false], ['Web routing', false]] },
        { text: 'FlatList is preferred over ScrollView for:', points: 2, options: [['Short lists', false], ['Long, scrollable lists', true], ['Images only', false], ['Forms', false]] },
      ],
    },
    {
      title: 'Networking Security Quiz', description: 'Threats, defenses and secure protocols.', duration: 20, passing: 70, classIdx: 3, teacherId: t1.id, published: true,
      questions: [
        { text: 'What does HTTPS add over HTTP?', points: 2, options: [['Faster speed', false], ['Encryption via TLS', true], ['Better SEO', false], ['Caching', false]] },
        { text: 'Phishing attacks primarily target:', points: 2, options: [['Servers', false], ['Users via deceptive messages', true], ['Routers', false], ['Firewalls', false]] },
        { text: 'A firewall primarily:', points: 1, options: [['Encrypts files', false], ['Filters network traffic', true], ['Scans viruses', false], ['Backs up data', false]] },
      ],
    },
    {
      title: 'Figma Prototyping', description: 'Components, auto-layout and interactive prototypes.', duration: 25, passing: 60, classIdx: 4, teacherId: t2.id, published: false,
      questions: [
        { text: 'What is Auto Layout in Figma?', points: 2, options: [['A grid system', false], ['Automatic responsive spacing & resizing', true], ['A plugin', false], ['A font style', false]] },
        { text: 'Components in Figma allow:', points: 2, options: [['Only drawing', false], ['Reusable design elements', true], ['Code export', false], ['Animation', false]] },
      ],
    },
  ];

  const exams: { id: string; title: string; classId: string | null }[] = [];
  const allQuestions: { id: string; examId: string; points: number; options: { id: string; isCorrect: boolean }[] }[] = [];

  for (const def of examDefs) {
    const cls = classes[def.classIdx];
    const existing = await prisma.exam.findFirst({ where: { title: def.title } });
    const exam = existing
      ? await prisma.exam.update({ where: { id: existing.id }, data: { published: def.published, classId: cls.id, createdById: def.teacherId } })
      : await prisma.exam.create({
          data: {
            title: def.title,
            description: def.description,
            duration: def.duration,
            passingScore: def.passing,
            classId: cls.id,
            published: def.published,
            createdById: def.teacherId,
          },
        });
    exams.push(exam);

    // Seed questions only if the exam has none yet
    const qCount = await prisma.question.count({ where: { examId: exam.id } });
    if (qCount === 0) {
      for (const q of def.questions) {
        const question = await prisma.question.create({
          data: { examId: exam.id, text: q.text, points: q.points, questionType: q.type || 'SINGLE' },
        });
        const qOptions = [];
        for (const [text, isCorrect] of q.options) {
          qOptions.push(await prisma.option.create({ data: { questionId: question.id, text, isCorrect } }));
        }
        allQuestions.push({ id: question.id, examId: exam.id, points: q.points, options: qOptions });
      }
    } else {
      const qs = await prisma.question.findMany({ where: { examId: exam.id } });
      for (const q of qs) {
        const opts = await prisma.option.findMany({ where: { questionId: q.id } });
        allQuestions.push({ id: q.id, examId: exam.id, points: q.points, options: opts });
      }
    }
  }

  // ─── 5. Submissions, answers, badges, certificates ───────────────────────
  console.log('Creating submissions, answers, badges & certificates...');
  const feedbacks = [
    'Great work! Review the questions you missed.',
    'Solid effort — keep practicing the core concepts.',
    'Excellent result. You clearly mastered this topic.',
    'Good attempt. Focus on the sections you struggled with.',
  ];

  const reactExam = exams.find((e) => e.title === 'React Fundamentals Quiz')!;
  const reactQuestions = allQuestions.filter((q) => q.examId === reactExam.id);
  const totalReact = reactQuestions.reduce((s, q) => s + q.points, 0);

  for (const s of students) {
    if (s.email === 'inactive.student@onlineeval.com') continue;
    const seedNum = parseInt(s.id.slice(-4), 16) % 5;

    const existingSub = await prisma.submission.findFirst({ where: { examId: reactExam.id, userId: s.id } });
    if (!existingSub) {
      const correctCount = 3 + (seedNum % 3);
      const sub = await prisma.submission.create({
        data: {
          examId: reactExam.id,
          userId: s.id,
          status: 'GRADED',
          score: 0,
          totalScore: totalReact,
          completedAt: new Date(Date.now() - seedNum * 86400000),
          feedback: feedbacks[seedNum % feedbacks.length],
        },
      });
      let score = 0;
      for (let i = 0; i < reactQuestions.length; i++) {
        const q = reactQuestions[i];
        const isCorrect = i < correctCount;
        const chosen = isCorrect ? q.options.find((o) => o.isCorrect)! : q.options.find((o) => !o.isCorrect)!;
        if (isCorrect) score += q.points;
        await prisma.answer.create({
          data: {
            submissionId: sub.id,
            questionId: q.id,
            selectedOptionId: chosen.id,
            score: isCorrect ? q.points : 0,
          },
        });
      }
      await prisma.submission.update({ where: { id: sub.id }, data: { score } });
    }

    // One in-progress submission on the pandas exam for variety
    const pandasExam = exams.find((e) => e.title === 'Python & Pandas Basics');
    if (pandasExam && seedNum === 0) {
      const inProg = await prisma.submission.findFirst({ where: { examId: pandasExam.id, userId: s.id } });
      if (!inProg) {
        await prisma.submission.create({ data: { examId: pandasExam.id, userId: s.id, status: 'IN_PROGRESS', score: 0, totalScore: 10 } });
      }
    }

    // Award badges to a few students
    const badgeAssignments: [number, number][] = [[0, 0], [1, 0], [2, 3], [3, 4], [4, 1], [5, 2], [6, 0], [7, 5]];
    for (const [si, bi] of badgeAssignments) {
      if (students.indexOf(s) === si) {
        const ex = await prisma.userBadge.findFirst({ where: { userId: s.id, badgeId: badges[bi].id } });
        if (!ex) await prisma.userBadge.create({ data: { userId: s.id, badgeId: badges[bi].id } });
      }
    }
  }

  // ─── 6. Certificates ─────────────────────────────────────────────────────
  console.log('Creating certificates...');
  const certTemplates = [
    { title: 'Certificat de Réussite — Standard', description: 'Default completion certificate', issuerName: 'Online Evaluation Platform' },
    { title: 'Certificat d\'Excellence', description: 'Awarded for scores above 90%', issuerName: 'Faculty Board' },
    { title: 'Certificat de Participation', description: 'For completing a course regardless of score', issuerName: 'Online Evaluation Platform' },
  ];
  for (const t of certTemplates) {
    await prisma.certificateTemplate.upsert({ where: { title: t.title }, update: t, create: t });
  }

  const certPairs: [number, number, string][] = [
    [0, 0, 'CERT-2026-0001'], [1, 0, 'CERT-2026-0002'], [2, 0, 'CERT-2026-0003'],
    [3, 0, 'CERT-2026-0004'], [4, 0, 'CERT-2026-0005'], [5, 0, 'CERT-2026-0006'],
    [6, 0, 'CERT-2026-0007'], [7, 0, 'CERT-2026-0008'],
  ];
  for (const [si, ei, code] of certPairs) {
    const s = students[si];
    const exam = exams[ei];
    const ex = await prisma.certificate.findFirst({ where: { code } });
    if (!ex) {
      await prisma.certificate.create({
        data: {
          code,
          userId: s.id,
          examTitle: exam.title,
          description: `Awarded to ${s.name} for successfully completing "${exam.title}".`,
          issuerName: teachers[0].name,
        },
      });
    }
  }

  // ─── 7. Settings & audit logs ────────────────────────────────────────────
  console.log('Creating settings & audit logs...');
  const settings: [string, string][] = [
    ['platformName', 'Online Evaluation'],
    ['supportEmail', 'support@onlineeval.com'],
    ['maintenanceMode', 'false'],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  const auditEntries: [string | null, string, string, string][] = [
    [admin.id, 'PLATFORM_SETTINGS_UPDATED', 'SystemSetting', 'platformName, supportEmail'],
    [t1.id, 'EXAM_CREATED', 'Exam', 'React Fundamentals Quiz'],
    [t1.id, 'EXAM_CREATED', 'Exam', 'Next.js App Router Deep Dive'],
    [t2.id, 'EXAM_CREATED', 'Exam', 'Python & Pandas Basics'],
    [t3.id, 'EXAM_CREATED', 'Exam', 'React Native Navigation'],
    [admin.id, 'USER_UPDATED', students[0].id, JSON.stringify({ role: 'STUDENT' })],
    [t1.id, 'CERTIFICATES_ISSUED', 'Certificate', 'Batch of 8 certificates'],
  ];
  for (const [actorId, action, target, details] of auditEntries) {
    const exists = await prisma.auditLog.findFirst({ where: { action, target, actorId: actorId || null } });
    if (!exists) await prisma.auditLog.create({ data: { actorId, action, target, details } });
  }

  console.log('✅ Seeding completed!');
  console.log('');
  console.log('Login credentials (password for all: ' + PASSWORD + '):');
  console.log('  Admin:   admin@gmail.com');
  console.log('  Teacher: teacher@gmail.com / prof.martin@onlineeval.com / prof.haddad@onlineeval.com');
  console.log('  Student: student@gmail.com (+ 9 more student accounts)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
