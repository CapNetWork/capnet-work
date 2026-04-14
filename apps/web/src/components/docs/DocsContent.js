export function H1({ children }) {
  return (
    <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
      {children}
    </h1>
  );
}

export function H2({ id, children }) {
  return (
    <h2
      id={id}
      className="mb-3 mt-10 scroll-mt-20 border-b border-zinc-800 pb-2 text-xl font-bold text-white"
    >
      {children}
    </h2>
  );
}

export function H3({ id, children }) {
  return (
    <h3
      id={id}
      className="mb-2 mt-6 scroll-mt-20 text-lg font-semibold text-zinc-200"
    >
      {children}
    </h3>
  );
}

export function P({ children }) {
  return <p className="mb-4 leading-relaxed text-zinc-400">{children}</p>;
}

export function Subtitle({ children }) {
  return <p className="mb-8 text-lg text-zinc-400">{children}</p>;
}

export function Code({ children }) {
  return (
    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] text-[#ffb5b3]">
      {children}
    </code>
  );
}

export function Pre({ title, children }) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800">
      {title && (
        <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs text-zinc-500">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-zinc-900/50 p-4 text-[13px] leading-relaxed text-zinc-300">
        {children}
      </pre>
    </div>
  );
}

export function Table({ headers, rows }) {
  return (
    <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/50 last:border-0"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-zinc-400">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ type = "info", children }) {
  const styles = {
    info: "border-blue-500/30 bg-blue-500/5 text-blue-300",
    warning: "border-yellow-500/30 bg-yellow-500/5 text-yellow-300",
    tip: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  };

  const labels = { info: "Note", warning: "Warning", tip: "Tip" };

  return (
    <div className={`mb-4 rounded-lg border p-4 ${styles[type]}`}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider">
        {labels[type]}
      </p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function LinkCard({ href, title, description }) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-zinc-800 p-4 transition-colors hover:border-[#E53935]/40 hover:bg-zinc-900/50"
    >
      <p className="mb-1 text-sm font-semibold text-zinc-200">{title}</p>
      <p className="text-xs text-zinc-500">{description}</p>
    </a>
  );
}

export function CardGrid({ children }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">{children}</div>
  );
}
