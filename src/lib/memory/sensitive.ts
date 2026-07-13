/** High-sensitivity heuristics (local only; no cloud). */

const PATTERNS: { re: RegExp; tag: string }[] = [
  { re: /(身份证|护照|社保号|银行卡|信用卡|cvv|密码|口令)/i, tag: "credential" },
  { re: /(住址|家庭住址|门牌|小区|详细地址)/, tag: "address" },
  { re: /(手机号|电话号码|微信|支付宝)|1[3-9]\d{9}/, tag: "contact" },
  { re: /(病历|诊断|艾滋|艾滋|抑郁|癌症|怀孕|HIV)/i, tag: "health" },
  { re: /(工资|年薪|存款|负债|贷款|房产证)/, tag: "finance" },
  { re: /(真名是|我叫[\u4e00-\u9fff]{2,4}[^宠物狗猫]*)/, tag: "realname" },
];

export function detectSensitivity(text: string): {
  sensitive: boolean;
  tags: string[];
} {
  const tags: string[] = [];
  for (const { re, tag } of PATTERNS) {
    if (re.test(text) && !tags.includes(tag)) tags.push(tag);
  }
  return { sensitive: tags.length > 0, tags };
}
