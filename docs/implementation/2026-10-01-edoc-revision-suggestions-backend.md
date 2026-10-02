# EDoc「修訂建議」任務 1～5 本機實作報告

日期：26/10/01。實作位於 `/Users/hsiehkailin/.codex/worktrees/revision-suggestions/EDoc`；基準 HEAD `4f7c2e807cedf70effff962153b5d230293596d9`。尚未提交。

## 已完成範圍

| 任務 | 本機結果 |
|---|---|
| 1 正文與補丁 | 瀏覽器／Worker 共用內容計算；文字替換可獨立選擇，格式／結構以完整範圍處理，清理危險 HTML 與偽造修訂樣式；正式統計由伺服器重算。 |
| 2 私有儲存 | SQLite Durable Object 本機 runtime、可重跑 schema、追加式事件、交易回滾、請求去重、重啟後保存與文件隔離。 |
| 3 權限 | 具名連結與五種能力可後續調整；每次檢查撤銷；主控轉移與明確恢復；啟用模式不能透過舊發布路徑繞過。 |
| 4 建議與歷程 | 凍結 S001 快照、逐項／批次採納或不採納、留言、撤回、分頁歷程、後續建議關聯；被拒絕與未決原文保留。 |
| 5 部分發布 | 只合併採納項、伺服器產生正文及下一版號；持久排他門、發布核對、限次重試、alarm、失敗後明確重試與併發保護。 |

例如 B 提出五項，A 採納三項、不採納兩項：只發布三項正文，其餘兩項的內容、提出者與決定者仍存在私有歷程。正式公開資料不包含建議 ID、私下留言及操作歷程。

## 審查與修正

獨立 reviewer 提出兩項 Important，均接受並完成 RED→GREEN 修正：

- 混合格式的純文字含 `<x>` 或 `&copy;`，序列化時可能丟字或變義：文字節點現在先跳脫 HTML。
- 舊模式發布失敗且原連結撤銷後可能永久鎖住文件：新增有效管理員 `/collaboration/legacy/status` 與 `/collaboration/legacy/retry`，核對既有結果再恢復同一工作；原作者快照保留，恢復者另留具名事件。相同 requestId 重送不重複發布，不同內容回 409。

## 實作決策與限制

1. **不提交並保留證據**：遵照本輪授權，所有變更及測試證據留在隔離 worktree；此 worktree 不可先刪除或封存，以免未提交內容遺失。
2. **可注入的 domain Hub**：Node 回歸採用 SQLite，真正本機 runtime 採用 workerd；domain 不依賴 Cloudflare 專用 import，代價是另維護 adapter。
3. **schema SQL 與 JS 伴隨檔**：避免 Worker 的文字載入器相依；兩檔需同步維護。
4. **清理與複雜度上限**：不信任呼叫端的 diff 樣式；過大計算回 422。較複雜文件可能須拆分修訂。
5. **過時建議須人工重新比較**：API 提供最新草稿及原始建議證據，不猜測跨版本合併，也不繼承舊採納結果；後續 UI 須讓使用者確認新內容。
6. **舊模式也使用排他門**：避免啟用協作與既有發布互相穿越。正式部署必須另外配置 binding；缺 binding 會拒絕寫入，不能直接部署本輪 Worker。
7. **管理員恢復舊工作**：恢復的是先前已受理內容，不把新修改偷換進待執行工作；保留原作者與恢復者。
8. **讀取／核對失敗也計入重試**：防止後端持續故障導致無限 alarm，代價是長時間故障後需要明確重試。

實作者列為後續小型整理：新私有連結建立的額外限流、移除 index.js 中未使用的舊 helper、schema 兩檔一致性自動檢查。審查者未提出其他 Minor；沒有拒絕任何審查意見。

## 未執行

任務 6～8 的分享／Word 修訂欄／預覽介面及任務 9 上線驗收；Commit、Push、部署、正式 Durable Object binding 或雲端資源建立、付費 AI 啟用。

`worker/wrangler.toml`、正式 `documents/*/document.json` 與原 checkout 的既有未追蹤檔案未改。本輪 fake GitHub 操作只在 loopback；測試成功不代表線上功能已更新。新正式版本的 AI 摘要保留未補寫狀態，沒有呼叫付費 AI。

## 本機重跑

```sh
npm run build
npm run test:collaboration
npm test -- --workers=2
git diff --check
```

證據位於本 worktree `.superpowers/sdd/revision-suggestions/`，包含 ledger、review 與各次 RED／GREEN／完整回歸紀錄。

驗證結果：`npm run test:collaboration` 33 passed；完整 Chromium／WebKit 回歸 204 passed、2 skipped（既有跳過）；`npm run build` 與 `git diff --check` 通過。兩個審查缺陷測試共 3 項先失敗後通過。完整套件首次有偵錯埠衝突，改用自動分配埠後重跑全綠；本輪 EDoc 測試子程序均已停止。
