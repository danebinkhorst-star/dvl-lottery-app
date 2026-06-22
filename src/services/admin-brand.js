export const brandPalette = {
  forest: "#17110b",
  moss: "#f4b619",
  sage: "#d4940d",
  leaf: "#fff1c7",
  cream: "#f8f0dc",
  paper: "#fffaf0",
  sand: "#eadbc0",
  ink: "#17110b",
  muted: "#6d5a42"
};

export function brandMarkSvg(className = "") {
  return `<svg class="${className}" viewBox="0 0 92 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DVL logo">
    <defs>
      <linearGradient id="dvl-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffd45b" />
        <stop offset="58%" stop-color="#f4b619" />
        <stop offset="100%" stop-color="#c47b00" />
      </linearGradient>
    </defs>
    <path d="M45.5 7c3.1 0 6.2 1 8.8 2.7l20.9 14.2c4 2.7 6.4 7.2 6.4 12.1v23.8c0 16.8-9.8 32-25 39L45.5 103 34.4 98.8c-15.2-7-25-22.2-25-39V36c0-4.9 2.4-9.4 6.4-12.1L36.7 9.7A15.8 15.8 0 0 1 45.5 7Z" fill="#0f0b07" stroke="url(#dvl-gold)" stroke-width="5"/>
    <path d="M47.3 3.5c4.8 2.9 7.1 6.2 6.8 10-0.1 1.8-0.8 3.5-2 4.9 5.6-0.7 10-4.6 11.5-10.5-6 0.7-10.6-0.8-13.9-4.4-.7-.8-1.3-1.6-1.9-2.5-.1.9-.3 1.7-.5 2.5Z" fill="url(#dvl-gold)"/>
    <text x="46" y="48" text-anchor="middle" fill="#fff7e8" font-family="Manrope, Arial, sans-serif" font-size="20" font-weight="900">DVL</text>
    <path d="M24.4 24.8h48.2" stroke="#2f2417" stroke-width="2" opacity=".5"/>
  </svg>`;
}

export function brandWordmarkSvg(className = "") {
  return `<svg class="${className}" viewBox="0 0 280 54" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="De Vlees Loterij">
    <text x="0" y="20" fill="#17110b" font-family="Manrope, Arial, sans-serif" font-size="19" font-weight="900" letter-spacing=".5">DE VLEES</text>
    <text x="0" y="45" fill="#d4940d" font-family="Manrope, Arial, sans-serif" font-size="19" font-weight="900" letter-spacing=".5">LOTERIJ</text>
  </svg>`;
}
