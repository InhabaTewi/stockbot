export function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "--";
  const n = Number(x);
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

export function fmtNum(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "--";
  return Number(x).toFixed(3).replace(/\.?0+$/, "");
}

export function buildDisplay(it) {
  const sym = it?.symbol || "";
  const cn = it?.cn_name || it?.name || sym;

  let shown = sym;
  if (it?.stock_code) {
    const isHK = (it?.market || "").toUpperCase() === "HK" || sym.toUpperCase().endsWith(".HK");
    if (isHK) shown = `${it.stock_code}.HK`;
  }
  return `${cn}（${shown}）`;
}
