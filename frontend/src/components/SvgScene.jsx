export default function SvgScene() {
  return (
    <svg
      className="parallax"
      viewBox="0 0 750 500"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg"
    >

      <defs>
        {/* BACKGROUND GRADIENT */}
        <radialGradient id="bg_grad" cx="375" cy="-30" r="318.69">
          <stop offset="0.1" stopColor="#F5C54E" id="sun" />
          <stop offset="0.2" stopColor="#FFDBA6" />
          <stop offset="0.3" stopColor="#F7BB93" />
          <stop offset="0.5" stopColor="#F2995E" />
          <stop offset="0.7" stopColor="#f07560" />
          <stop offset="0.9" stopColor="#FFAB93" />
        </radialGradient>

        {/* HILLS COLORS */}
        <linearGradient id="hill1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>

        <linearGradient id="hill2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>

      </defs>

      {/* BACKGROUND */}
      <rect id="bg" width="750" height="500" fill="url(#bg_grad)" />

      {/* CLOUDS */}
      <g id="clouds" fill="#ffffff">

        <ellipse id="cloud1" cx="150" cy="100" rx="60" ry="20" />
        <ellipse id="cloud2" cx="350" cy="80" rx="80" ry="25" />
        <ellipse id="cloud3" cx="550" cy="120" rx="70" ry="22" />
        <ellipse id="cloud4" cx="700" cy="90" rx="50" ry="18" />

      </g>

      {/* HILLS LAYER 1 */}
      <g id="hills">

        <path
          id="h1-1"
          d="M0 400 Q150 300 300 400 T600 400 T750 400 V500 H0 Z"
          fill="url(#hill1)"
        />

        <path
          id="h1-2"
          d="M0 420 Q200 320 400 420 T750 420 V500 H0 Z"
          fill="url(#hill2)"
        />

      </g>

      {/* TEXT */}
      <text
        id="info"
        x="50%"
        y="50%"
        textAnchor="middle"
        fill="#2c1810"
        fontSize="30"
        fontWeight="bold"
      >
        Jaya Dhaba Experience
      </text>

    </svg>
  );
}
