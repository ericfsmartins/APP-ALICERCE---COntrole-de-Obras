export default function ProgressRing({ percent = 0, size = 120, strokeWidth = 10, label = '' }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference
  const id = `gradient-${size}-${strokeWidth}`

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#1C1F26" />
          <stop offset="100%" stopColor="#C87941" />
        </linearGradient>
      </defs>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#e8e4db" strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring-circle"
      />
      {/* Text */}
      <text
        x="50%" y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#1C1F26"
        fontSize={size * 0.18}
        fontFamily="Syne, sans-serif"
        fontWeight="700"
      >
        {Math.round(percent)}%
      </text>
      {label && (
        <text
          x="50%" y="65%"
          textAnchor="middle"
          fill="#9aa3b5"
          fontSize={size * 0.09}
          fontFamily="IBM Plex Sans, sans-serif"
        >
          {label}
        </text>
      )}
    </svg>
  )
}
