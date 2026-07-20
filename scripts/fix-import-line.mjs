import fs from "fs";

const p = "src/hooks/useLioraState.ts";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  if (
    lines[i].includes('settings.locale === "en"') &&
    i + 1 < lines.length &&
    lines[i + 1].includes("Imported")
  ) {
    // rewrite next lines as full labels block
    // find the broken zh template line
  }
  if (lines[i].includes("Imported (${mode})") || lines[i].includes("Imported (")) {
    // next line should be zh
    if (i + 1 < lines.length && lines[i + 1].includes("mode ===")) {
      lines[i] = '            ? `Imported (${mode})`';
      lines[i + 1] =
        '            : `已导入（${mode === "merge" ? "合并" : "覆盖"}）`,';
    }
  }
  // also single-line broken
  if (lines[i].includes("mode ===") && lines[i].includes("merge") && lines[i].includes(":")) {
    if (lines[i].includes("Imported")) continue;
    if (!lines[i].includes("已导入") && lines[i].trim().startsWith(":")) {
      lines[i] =
        '            : `已导入（${mode === "merge" ? "合并" : "覆盖"}）`,';
    }
  }
}

// comments with broken dash
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("Clear usage meter")) {
    lines[i] =
      "  /** Clear usage meter — new/switched chats do not inherit previous turn's fill. */";
  }
  if (lines[i].includes("Already warmed")) {
    lines[i] =
      "    // Already warmed / used this session — skip redundant load (expensive)";
  }
  if (lines[i].includes("GGUF rename")) {
    lines[i] =
      "   * (common after GGUF rename or deleted tags → Ollama 404).";
  }
  if (lines[i].includes("Interrupted by a new chat")) {
    lines[i] =
      "          // Interrupted by a new chat turn — leave pending if set by send()";
  }
  if (lines[i].includes("memory jobs defer")) {
    lines[i] =
      "  /** True only while assistant stream is running — memory jobs defer in this window. */";
  }
}

fs.writeFileSync(p, lines.join("\n"), "utf8");
const t = fs.readFileSync(p, "utf8");
console.log("ticks", (t.match(/`/g) || []).length, "even", (t.match(/`/g) || []).length % 2 === 0);
console.log("import zh", t.includes("已导入"));
const odd = t.split(/\n/).filter((L) => (L.match(/`/g) || []).length % 2);
console.log("odd lines", odd.length, odd.slice(0, 3).map((x) => x.slice(0, 80)));
