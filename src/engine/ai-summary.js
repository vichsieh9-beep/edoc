// AI semantic summary attached to a formal version (Phase 4). An AI writes it in a
// Claude Code / Codex session through `npm run changelog`; the offline HTML never calls an AI.
// It is bound to the version's content hash, so a summary can never be shown on other content.
export const AI_SUMMARY_MAX = 60;
export const AI_DETAIL_MAX = 200;
// details line the engine writes when a version is created; replaced on screen by the AI changelog.
export const AI_PLACEHOLDER_PREFIX = '語意摘要：';
const SECTION_PREFIX = /^[^：\s][^：]{0,19}：\S/;
const chars = (s) => [...s].length;

export function aiSummaryErrors(ai, contentHash) {
  if (!ai || typeof ai !== 'object') return ['aiSummary 必須是物件'];
  const errors = [];
  const summary = typeof ai.summary === 'string' ? ai.summary.trim() : '';
  if (!summary) errors.push('summary 不可空白');
  else if (chars(summary) > AI_SUMMARY_MAX) errors.push(`summary 超過 ${AI_SUMMARY_MAX} 字（目前 ${chars(summary)} 字）`);
  if (!Array.isArray(ai.details) || !ai.details.length) errors.push('details 至少要一條');
  else ai.details.forEach((d, i) => {
    const t = typeof d === 'string' ? d.trim() : '';
    if (!t) errors.push(`details[${i}] 不可空白`);
    else if (!SECTION_PREFIX.test(t)) errors.push(`details[${i}] 要以「章節名：」開頭`);
    else if (chars(t) > AI_DETAIL_MAX) errors.push(`details[${i}] 超過 ${AI_DETAIL_MAX} 字`);
  });
  if (typeof ai.model !== 'string' || !ai.model.trim()) errors.push('model 不可空白');
  if (typeof ai.generatedAt !== 'string' || Number.isNaN(Date.parse(ai.generatedAt))) errors.push('generatedAt 必須是 ISO 時間');
  if (ai.contentHash !== contentHash) errors.push('contentHash 與版本內容的 SHA-256 不符');
  return errors;
}

// The AI summary to show for a version, or null if absent, malformed or bound to other content.
export function usableAiSummary(version) {
  const ai = version && version.aiSummary;
  if (!ai || !version.hash) return null;
  return aiSummaryErrors(ai, version.hash).length ? null : ai;
}
