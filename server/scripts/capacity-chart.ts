import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const RowSchema = z.object({
  clients: z.number(),
  intervalMean: z.number(),
  elu: z.number(),
  tickP99: z.number(),
});
const [input = "docs/perf/load.jsonl", output = "docs/img/lab07-capacity.svg"] =
  process.argv.slice(2);
const rows = readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line) => RowSchema.parse(JSON.parse(line)));

const W = 760;
const H = 380;
const left = 60;
const right = 30;
const top = 40;
const bottom = 60;
const plotW = W - left - right;
const plotH = H - top - bottom;
const yMax = 100;
const x = (i: number) => left + (plotW * i) / (rows.length - 1);
const y = (v: number) => top + plotH - (Math.min(v, yMax) / yMax) * plotH;

const line = (values: number[], color: string, dash = "") =>
  `<polyline fill="none" stroke="${color}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ""} points="${values
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")}"/>` +
  values
    .map(
      (v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${color}"/>`,
    )
    .join("");

const grid = [0, 20, 40, 60, 80, 100]
  .map(
    (v) =>
      `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="#3a2a52"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
  )
  .join("");
const labels = rows
  .map(
    (r, i) => `<text x="${x(i)}" y="${H - bottom + 20}" text-anchor="middle">${r.clients}</text>`,
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="13" fill="#e8dcff">
<title>Ємність сервера під навантаженням</title>
<rect width="${W}" height="${H}" fill="#1a0b26"/>
<text x="${left}" y="24" font-size="16" font-weight="bold">Навантаження: клієнти по 8 у кімнаті, 2 vCPU</text>
${grid}${labels}
<text x="${left + plotW / 2}" y="${H - 18}" text-anchor="middle">клієнтів</text>
<line x1="${left}" x2="${W - right}" y1="${y(33.3)}" y2="${y(33.3)}" stroke="#ff5a7a" stroke-width="2" stroke-dasharray="6 5"/>
<text x="${W - right - 4}" y="${y(33.3) + 18}" text-anchor="end" fill="#ff5a7a">бюджет тіку 33.3 мс</text>
${line(
  rows.map((r) => r.intervalMean),
  "#8dff3a",
)}
${line(
  rows.map((r) => r.elu * 100),
  "#c77dff",
  "4 4",
)}
<rect x="${left + 10}" y="${top + 6}" width="14" height="4" fill="#8dff3a"/><text x="${left + 30}" y="${top + 12}">реальний інтервал тіку, мс</text>
<rect x="${left + 10}" y="${top + 24}" width="14" height="4" fill="#c77dff"/><text x="${left + 30}" y="${top + 30}">завантаження event loop, %</text>
</svg>
`;
writeFileSync(output, svg);
console.log(`wrote ${output}`);
