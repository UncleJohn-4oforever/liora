import fs from "fs";

const p = "src/hooks/useLioraState.ts";
let t = fs.readFileSync(p, "utf8");

const enNote =
  "\n\n—\n[Stopped early: generation limit reached. Try a larger Context (8K/16K), Concise length off, or turn off Show thinking.]";
const zhNote =
  "\n\n—\n【回答因生成长度上限中途停止。可尝试：更大上下文 8K/16K、关闭「精简」、或关闭「显示思考」以把额度留给正文。】";

// Backup toast
t = t.replace(
  /settings\.locale === "en" \? "Backup downloaded" : "[^"]*"/,
  'settings.locale === "en" ? "Backup downloaded" : "备份已下载"',
);

// Folder prompts
t = t.replace(
  /settings\.locale === "en" \? "Folder name" : "[^"]*"/,
  'settings.locale === "en" ? "Folder name" : "文件夹名称"',
);
t = t.replace(
  /settings\.locale === "en" \? "New folder" : "[^"]*"/g,
  'settings.locale === "en" ? "New folder" : "新建文件夹"',
);

// Compress toast zh (loose)
t = t.replace(
  /: "Compressed older turns into summary"\s*:\s*"[^"]*"/,
  ': "Compressed older turns into summary"\n              : "已将更早对话压缩为摘要"',
);
// also locale === en pattern
t = t.replace(
  /\? "Compressed older turns into summary"\s*:\s*"[^"]*"/,
  '? "Compressed older turns into summary"\n              : "已将更早对话压缩为摘要"',
);

// needLoad comment + assignment (possibly glued on one line)
t = t.replace(
  /\/\/ Only show[\s\S]{0,200}?const needLoad = residentModelRef/,
  "// Only show load when weights not resident; else generating\n    const needLoad = residentModelRef",
);

// truncNote block — match until try {
const truncRe =
  /const truncNote =\s*sNow\.locale === "en"\s*\?[\s\S]{0,800}?:\s*"[\s\S]{0,800}?";\s*\r?\n\s*try \{/;
if (!truncRe.test(t)) {
  console.log("WARN: truncNote pattern not found");
} else {
  t = t.replace(
    truncRe,
    `const truncNote =
      sNow.locale === "en"
        ? ${JSON.stringify(enNote)}
        : ${JSON.stringify(zhNote)};

    try {`,
  );
}

// length includes
t = t.replace(
  /!acc\.includes\("生成[^"]*"\)/,
  '!acc.includes("生成长度上限")',
);
t = t.replace(
  /!acc\.includes\("generation limit"\)/,
  '!acc.includes("generation limit")',
);

fs.writeFileSync(p, t, "utf8");
console.log("ok backup", t.includes("备份已下载"));
console.log("ok folder", t.includes("新建文件夹"));
console.log("ok trunc", t.includes("回答因生成长度上限"));
console.log("ok compress", t.includes("已将更早对话压缩为摘要"));
console.log(
  "ok needLoad",
  t.includes("const needLoad = residentModelRef.current !== model"),
);
