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

export const storefrontLogoUrl = "/assets/meat-for-free-logo.png";

export function brandMarkSvg(className = "") {
  return `<img class="${className}" src="${storefrontLogoUrl}" alt="Meat For Free logo" loading="eager" decoding="async">`;
}

export function brandWordmarkSvg(className = "") {
  return `<svg class="${className}" viewBox="0 0 280 54" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Meat For Free">
    <text x="0" y="20" fill="#17110b" font-family="Manrope, Arial, sans-serif" font-size="19" font-weight="900" letter-spacing=".5">MEAT FOR</text>
    <text x="0" y="45" fill="#d4940d" font-family="Manrope, Arial, sans-serif" font-size="19" font-weight="900" letter-spacing=".5">FREE</text>
  </svg>`;
}
