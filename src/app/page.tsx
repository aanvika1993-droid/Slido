import Link from "next/link";
import { Logo } from "@/components/HostHeader";
import { JoinForm } from "@/components/JoinForm";
import { getCurrentUser } from "@/server/session";

const FEATURES = [
  { title: "Live Q&A", body: "Collect questions from everyone, let the audience upvote the best ones, and moderate before they go live." },
  { title: "Polls & surveys", body: "Multiple choice, word clouds, ratings, open text and ranking, with results updating as votes arrive." },
  { title: "Quizzes", body: "Timed questions, speed-based scoring and a live leaderboard to energize any session." },
  { title: "Present mode", body: "A full-screen view for the projector showing the join code, highlighted questions and live results." },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
              My events
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-gray-700 hover:text-gray-900">
                Log in
              </Link>
              <Link href="/signup" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
                Host an event
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="flex flex-col items-center py-16 text-center sm:py-24">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Make every meeting a <span className="text-brand-600">conversation</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-gray-600">
            Live Q&amp;A, polls and quizzes for meetings, classes and events. Participants join from any device with a code.
          </p>
          <div className="mt-10 flex w-full flex-col items-center gap-2">
            <JoinForm />
            <p className="text-sm text-gray-500">Joining as a participant? No account needed.</p>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
