export function normalizeQuery(q) {
  const s = (q || "").trim();
  if (!s) return "";
  return s.toUpperCase();
}

export function rankHKItem(it) {
  const code = (it.stock_code || "").trim();
  const name = (it.cn_name || it.name || "").toUpperCase();
  const symbol = (it.symbol || "").toUpperCase();
  const isHK = (it.market || "").toUpperCase() === "HK" || symbol.endsWith(".HK");
  if (!isHK) return 1000;

  const isWR = name.includes("-WR");
  const isR = name.includes("-R");
  const isSW = name.includes("-SW");

  let score = 0;
  if (!isWR && !isR) score -= 50;
  if (isSW) score += 5;
  if (isR) score += 20;
  if (isWR) score += 30;

  if (code.startsWith("0")) score -= 10;
  if (code.startsWith("8")) score += 10;

  const n = parseInt(code, 10);
  if (!Number.isNaN(n)) score += n / 100000;

  return score;
}