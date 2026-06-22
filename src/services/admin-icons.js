import * as lucideIcons from "lucide-static";

const fallbackIcon = lucideIcons.CircleHelp || "";

export function icon(name, className = "", options = {}) {
  const source = lucideIcons[name] || fallbackIcon;
  const size = options.size || 18;
  const strokeWidth = options.strokeWidth || 1.9;
  if (!source) return "";
  return source
    .replace("<svg", `<svg class="${className}" width="${size}" height="${size}"`)
    .replaceAll('stroke-width="2"', `stroke-width="${strokeWidth}"`)
    .replaceAll("<svg>", `<svg class="${className}" width="${size}" height="${size}">`);
}
