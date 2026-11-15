import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Online Evaluation System
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Welcome to the Next.js 15 Online Assessment platform powered by SQLite and Prisma. Take exams, test your knowledge, and track your scores instantly.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-800 shadow hover:bg-gray-300"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
