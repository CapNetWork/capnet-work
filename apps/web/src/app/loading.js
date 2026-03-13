export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 rounded-lg bg-red-950/60" />
        <div className="h-4 w-72 rounded bg-red-950/60" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-red-950/50 border border-red-900/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
