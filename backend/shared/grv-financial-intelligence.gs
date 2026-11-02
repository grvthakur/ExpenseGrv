/**
 * GRV Financial Intelligence — deterministic context for AI explanations.
 * Read-only: computes bounded facts from aiRows_ output; never writes or
 * changes expense, salary, card, Sweetie, settlement or billing calculations.
 */
function grvFinancialIntelligenceContext_(rows, question, todayText) {
  const q = String(question || "");
  if (!/(spend|spent|expense|kharch|budget|trend|compare|comparison|increase|decrease|overspend|category|monthly|month|saving|unpaid|pending|due|card bill|where.*money)/i.test(q)) return "";
  const today = new Date(String(todayText || "") + "T12:00:00+05:30");
  if (isNaN(today.getTime())) return "";
  const start = new Date(today.getTime() - 89 * 86400000);
  const validDate = (v) => {
    const d = new Date(String(v || "") + "T12:00:00+05:30");
    return !isNaN(d.getTime()) ? d : null;
  };
  const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const expenses = (rows || []).filter(r => r && r.src === "expense" && r.spend === true && !r.dup);
  const recent = expenses.filter(r => { const d = validDate(r.date); return d && d >= start && d <= today; });
  const categoryTotals = {};
  recent.forEach(r => { const k = String(r.cat || "Uncategorized").trim() || "Uncategorized"; categoryTotals[k] = (categoryTotals[k] || 0) + (Number(r.amount) || 0); });
  const topCategories = Object.keys(categoryTotals).map(k => ({ category:k, amount:money(categoryTotals[k]) })).sort((a,b) => b.amount-a.amount).slice(0,6);
  const cards = (rows || []).filter(r => r && r.src === "card" && r.spend === true && !r.dup);
  const unpaidCards = cards.filter(r => String(r.status || "").toUpperCase() !== "PAID");
  const cardPending = money(unpaidCards.reduce((n,r) => n + (Number(r.amount)||0), 0));
  const total90 = money(recent.reduce((n,r) => n + (Number(r.amount)||0), 0));
  const currentMonth = String(todayText).slice(0,7);
  const monthRows = recent.filter(r => String(r.date || "").slice(0,7) === currentMonth);
  const monthTotal = money(monthRows.reduce((n,r) => n + (Number(r.amount)||0), 0));
  return [
    "DETERMINISTIC FINANCIAL CONTEXT (read-only; use as cross-check, not as a substitute for exact query filters):",
    "Expense-sheet spend in trailing 90 calendar days: ₹" + total90 + " (rows=" + recent.length + ").",
    "Expense-sheet spend in current calendar month through today: ₹" + monthTotal + " (rows=" + monthRows.length + ").",
    "Top expense-sheet categories in trailing 90 days: " + (topCategories.length ? topCategories.map(x => x.category + " ₹" + x.amount).join("; ") : "none"),
    "Own card rows marked not PAID: ₹" + cardPending + " (rows=" + unpaidCards.length + "; do not treat as current cash expense or add to expense-sheet totals).",
    "Scope note: expenses and credit-card records are reported separately to avoid double counting; Sweetie, salary, received, loan and savings are not included in expense-sheet spend.",
    "Never claim these bounded summaries answer a different period/person/category. Compute exact requested results from the underlying rows."
  ].join("\\n");
}
