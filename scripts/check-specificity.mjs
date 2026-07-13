/** Quick offline check for specificity scoring (no browser). */

function scoreSpecificity({ subject, predicate, object }) {
  object = (object ?? "").trim();
  subject = (subject ?? "").trim();
  if (!object || !subject || !predicate?.trim()) return 0;
  let score = 0.35;
  if (/:/.test(subject) || /「|」|"|“|”/.test(object)) score += 0.2;
  if (/\d/.test(object)) score += 0.15;
  if (object.length >= 8) score += 0.1;
  if (object.length >= 16) score += 0.1;
  if (/[A-Za-z]{3,}|[\u4e00-\u9fff]{2,}/.test(object)) score += 0.1;
  if (/^(有只|一只).{0,4}狗$/.test(object)) score = 0.2;
  if (/^用户有只/.test(object)) score = 0.15;
  return Math.max(0, Math.min(1, score));
}

const cases = [
  { subject: "user", predicate: "owns", object: "用户有只狗", expectFail: true },
  {
    subject: "pet:dou_dou",
    predicate: "is",
    object: "柯基犬「豆豆」(约3岁)",
    expectFail: false,
  },
  {
    subject: "user",
    predicate: "prefers",
    object: "技术问答默认要点列表，不超过5条",
    expectFail: false,
  },
];

let ok = true;
for (const c of cases) {
  const s = scoreSpecificity(c);
  const pass = s >= 0.55;
  const good = c.expectFail ? !pass : pass;
  console.log(
    `${good ? "OK" : "FAIL"} score=${s.toFixed(2)} pass=${pass} :: ${c.object}`,
  );
  if (!good) ok = false;
}
process.exit(ok ? 0 : 1);
