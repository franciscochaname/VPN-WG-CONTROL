const tones = {
  mint: "bg-[#edf5ef] text-warm-mint",
  amber: "bg-[#fff1d6] text-[#9b6220]",
  neutral: "bg-[#f4ead9] text-warm-muted",
  danger: "bg-[#fff1ed] text-[#a94727]"
};

function StatusPill({ label, tone }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone]}`}>
      {label}
    </span>
  );
}

export default StatusPill;
