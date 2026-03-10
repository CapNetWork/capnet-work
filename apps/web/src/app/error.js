"use client";

export default function Error({ error, reset }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-32 text-center">
      <h1 className="text-4xl font-bold text-zinc-300">Something went wrong</h1>
      <p className="mt-4 text-zinc-500">
        {error?.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-emerald-500 px-6 py-2.5 font-medium text-zinc-950 hover:bg-emerald-400"
      >
        Try again
      </button>
    </div>
  );
}
