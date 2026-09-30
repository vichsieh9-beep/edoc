# EDoc Current priority 更新提案

狀態：2026-09-30 Vic「照提案 GO」核准；已套用至 CLAUDE.md 的 Current priority。
提案建立時基準：main ebb170f；當時 PDF 按鈕修正與 R2.10 已在本機準備，尚未提交或部署。

建議以以下內容取代 CLAUDE.md 的 Current priority：

1. Protect diff correctness: keep golden and P0 regression tests passing. Fix correctness before adding features or refactoring; extend coverage for nested lists, inline formatting, tables, images, heading reordering and multi-block paste.
2. Complete and validate the publish-to-PDF flow: after the public page goes live, the newly published version's PDF must be downloadable without reloading. Preserve draft restrictions and historical-version downloads.
3. Protect public editing and library administration: keep secrets out of client code, enforce admin/document-scoped permissions in the Worker, and sanitize stored/imported HTML before rendering.
4. Require Vic's approval of a current-vs-proposed comparison before changes to visual presentation. Preserve immutable formal versions and separate document versions from engine versions.
5. Maintain operational readiness: keep GitHub Pages/CI regression checks healthy and track renewal of the GitHub credential due in September 2027. Treat completed deployment and modularization work as baseline, not pending tasks.

對照 CC 草稿：保留 diff、安全與畫面核准原則；將 PDF 工作明列為完整發布流程的驗收要求，而非修完仍列為未修 bug。憑證到期資訊源自 CC 待辦卡，未讀取或變更憑證。

確認後只替換 Current priority 區塊，其他規則保留，並追加跨工具異動日誌。此核准不包含 Commit、Push 或部署。
