"use client";

export default function Error({ error, reset }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-32 text-center">
      <h1 className="text-4xl font-bold text-red-100">Something went wrong</h1>
      <p className="mt-4 text-red-200/80">
        {error?.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-white px-6 py-2.5 font-medium text-[#6B1515] hover:bg-red-50"
      >
        Try again
      </button>
    </div>
  );
}
