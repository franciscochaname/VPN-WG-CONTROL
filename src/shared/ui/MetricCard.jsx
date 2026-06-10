function MetricCard({ label, value, trend, icon: Icon }) {
  return (
    <article className="rounded-lg border border-warm-line bg-warm-panel p-4 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-warm-amber/70">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
          <Icon size={18} />
        </div>
        <span className="rounded-full bg-[#edf5ef] px-2.5 py-1 text-xs font-semibold text-warm-mint">{trend}</span>
      </div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-warm-muted">{label}</p>
    </article>
  );
}

export default MetricCard;
