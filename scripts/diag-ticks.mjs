import fs from "fs";

const t = fs.readFileSync("src/hooks/useLioraState.ts", "utf8");
const ticks = (t.match(/`/g) || []).length;
console.log("backticks", ticks, "even", ticks % 2 === 0);

t.split(/\n/).forEach((L, i) => {
  const n = (L.match(/`/g) || []).length;
  if (n % 2) console.log("odd ticks line", i + 1, JSON.stringify(L.slice(0, 140)));
});

const line = t.split(/\n/)[896];
console.log("line897", JSON.stringify(line));
for (let i = 70; i < Math.min(line.length, 105); i++) {
  console.log(i, JSON.stringify(line[i]), line.charCodeAt(i));
}

const line2 = t.split(/\n/)[1062];
console.log("line1063", JSON.stringify(line2));
for (let i = 20; i < Math.min(line2.length, 70); i++) {
  console.log(i, JSON.stringify(line2[i]), line2.charCodeAt(i));
}
