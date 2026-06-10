const tones = {
  mint: "bg-[#edf5ef] text-warm-mint",
  amber: "bg-[#fff1d6] text-[#9b6220]"
};

function StatusPill({ label, tone }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone]}`}>
      {label}
    </span>
  );
}

export default StatusPill;
