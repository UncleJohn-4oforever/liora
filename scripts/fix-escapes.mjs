import fs from "fs";

const p = "src/hooks/useLioraState.ts";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("humanizeError") && line.includes("not found")) {
    // File should contain: `model '${preferredModel || "?"}' not found`
    lines[i] =
      '      setLastError(humanizeError(`model \'${preferredModel || "?"}\' not found`, sNow.locale));';
    // The above single-quoted string: \' is ', "?" is fine
  }
  if (line.includes("const errText") && line.includes("generateFailed")) {
    // Need ${dict...}\n${friendly} in template — write with double-quoted source
    lines[i] =
      "            const errText = `${dict.generateFailed}\\n${friendly}`;";
  }
}

// Verify by rewriting those lines using Buffer of exact chars
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("humanizeError") && lines[i].includes("not found")) {
    lines[i] =
      "      setLastError(humanizeError(`model '${preferredModel || \"?\"}' not found`, sNow.locale));";
  }
  if (lines[i].includes("const errText") && lines[i].includes("generateFailed")) {
    lines[i] =
      "            const errText = `${dict.generateFailed}\\n${friendly}`;";
  }
}

fs.writeFileSync(p, lines.join("\n"), "utf8");

const check = fs.readFileSync(p, "utf8").split(/\n/);
for (let i = 0; i < check.length; i++) {
  if (check[i].includes("not found") && check[i].includes("humanizeError")) {
    console.log("line", i + 1, JSON.stringify(check[i]));
  }
  if (check[i].includes("const errText") && check[i].includes("generateFailed")) {
    console.log("line", i + 1, JSON.stringify(check[i]));
  }
}
