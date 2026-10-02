# EDoc「修訂建議」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本計畫建議由主 Agent 依序執行；不預設委派。實作、Commit、Push、部署與建立雲端資源均須依當時使用者授權分開處理。

**Goal:** 成員提出具名修訂建議，授權者逐項採納或不採納，發布者僅將採納內容併入下一正式版本，所有建議及決定可追溯。

**Architecture:** 保留 GitHub／Pages／PDF 正式發布管線，新增 Worker 私有協作服務。建議使用 SQLite-backed Durable Object 保存權限、建議、追加式事件與待發布工作；第一階段每個 repo 使用一個協作物件，資料均以文件隔離，每份文件只有一個未結束發布工作。瀏覽器只提交建議與選擇，正式正文、統計與版號由伺服器產生。

**Tech Stack:** 現有 JavaScript ES modules、esbuild、Playwright；建議新增 `linkedom/worker` 作伺服器 DOM adapter，以及 Wrangler 本機 Durable Object 測試環境。新套件在任務 1／2 鎖定當時驗證通過的精確版本與 lockfile；本輪未安裝依賴或建立資源。

**Spec:** `/Users/hsiehkailin/dev/EDoc/docs/superpowers/specs/2026-10-01-edoc-revision-suggestions-design.md`。使用者已於 26/10/01 確認；原文件「本版建議」預設納入此計畫。上述雲端儲存產品及新增依賴是本計畫的技術建議，尚非啟用授權。

日期：26/10/01。計畫版本：0.1。狀態：計畫交付，尚未實作。

## Global Constraints

- 功能名稱「修訂建議」；按鈕「送出修訂建議」「採納」「不採納」「確認並發布」。
- 正式版本不可覆寫；建議編號 S001 不占正式版號。新版只比較緊接前版。
- 每人具名連結；檢視／提出／採納／發布／管理能力可分別開關。允許自我採納，不強制雙人簽署。
- 採納只形成預覽，確認發布成功才追加正式版。每次發布只處理一份建議。
- 支援部分發布；未採納、待討論、撤回、被取代內容與歷程均保留。
- 未發布正文、私下留言、完整事件及新分享權限不得進公開 repo／HTML／PDF。
- 無強制修訂摘要或理由表單；操作者及時間來自伺服器，日期顯示 `26/10/01`。
- 正式版本卡只顯示名稱、修改／新增／刪除統計、變更說明；採納項數不得冒充正文統計。
- 不新增電子簽章、即時共同編輯、AI 自動採納、通知或過時建議自動合併。
- 舊文件預設不啟用；模式中 `/versions` 不得繞過採納流程。模式查詢故障應拒絕寫入，不能當成未啟用。
- AI 摘要依實際啟用狀態運作，不自行啟用付費 API。Codex 更新正式版須遵守 AGENTS.md 的完整差異／aiSummary 流程。
- 本輪只新增這份計畫；下列核取方塊全部是未來任務，不代表已執行。

## Review Focus

1. 中文輸入法、跨格式文字及同段兩處替換：送出與預覽不得丟字、誤改未採納範圍。任務 1、7 驗證。
2. 舊連結、舊分頁與停權同時發生：伺服器最新權限生效，保存草稿，不能繞過發布。任務 3、6 驗證。
3. 表格、巢狀清單、圖片與結構重排：相依範圍整組決定，不產生破碎 HTML。任務 1 驗證。
4. 送出或發布成功後回應遺失：重試不重複建議／版號／事件；同 ID 不同 payload 被拒絕。任務 4、5 驗證。
5. 部分發布後他人更新基準：未決內容完整留存，必須重新比較與重新決定。任務 4、5、8 驗證。

## 現場基準與執行入口

本輪只讀查核：本機 `main` HEAD 與 `git ls-remote origin refs/heads/main` 均為 `4f7c2e807cedf70effff962153b5d230293596d9`；`src/engine/meta.js` 為 R2.13。`/versions` 仍直接追加正式版，`/session` 只回 admin/editor；本機未見新建議流程。未驗證目前公開站引擎或 AI 啟用狀態，不沿用先前記憶中的部署結論。

執行前先查 AGENTS.md、CLAUDE.md、EDOC_HANDOFF.md、最新遠端與所有工作樹。現有 `.playwright-cli/`、`docs/` 未追蹤內容不是可刪除的暫存。實作建議用隔離 worktree；重新確認正式 JSON 與線上版本，保留人工修改，不能直接在舊基準工作。

## 檔案責任與資料契約

所有下列相對路徑均以 `/Users/hsiehkailin/dev/EDoc/` 為根；若使用隔離 worktree，改以實際 worktree 根目錄執行。新檔只在獲實作授權後建立。

| 範圍 | 新增／修改檔案 | 責任 |
|---|---|---|
| 可重用 diff | 修改 `src/engine/dom.js`、`revision.js`、`diff.js`；新增 `src/engine/dom-context.js`、`suggestion-patches.js` | 注入 DOM context、產生穩定補丁、只套用選定範圍 |
| Worker HTML | 新增 `worker/src/content.js` | Worker DOM adapter、清理、正式 diff 與 hash；不污染 global DOM |
| 私有服務 | 新增 `worker/src/collaboration/{contracts,store,hub,permissions,suggestions,publication}.js`、`schema.sql` | schema、原子狀態＋事件、工作恢復 |
| Worker 接線 | 修改 `worker/src/index.js`；新增 `worker/src/github.js` | 分流認證、現有 GitHub adapter 提取、保留舊 API 行為 |
| 瀏覽器 | 新增 `src/ui/{suggestions,suggestion-view,publication-preview,sharing-permissions}.js` | 清單、逐項決定、預覽、分享能力 |
| 既有 UI | 修改 `src/main.js`、`src/ui/{state,access,api,draft,edit-bar,elements,share,publish-status}.js`、`src/library/share.js` | 模式分流、草稿保存、能力檢查、發布狀態 |
| 外觀 | 修改 `templates/document.html`、`src/ui/styles.css` | 沿用 Word 正文＋右欄，新增建議／歷程入口 |
| 本機測試 | 新增 `tests/{suggestion-patches,collaboration-store,collaboration-api,suggestions,publication-recovery,sharing-permissions}.spec.js`、`tests/collaboration-fixture.js`、`tests/worker-runtime.mjs`、`worker/wrangler.test.toml` | fake GitHub 與真正本機 SQLite DO 測試分開；不連 production |
| 設定／交付 | 修改 `package.json`、lockfile、`worker/wrangler.toml`、`playwright.config.js`、`.gitignore`；新增 `docs/operations/revision-suggestions.md` | 精確依賴、獨立本機 binding、資源／發布／恢復操作指南 |

資料契約用 JS JSDoc 定義於 `contracts.js`，不為本功能轉 TypeScript：

- `Capabilities = {view, propose, decide, publish, manage:boolean}`；除了 view，其餘都依賴 view。
- `Actor = {id,name,company,linkId}`；來源為伺服器 tokenHash 查詢，前端不能傳可信姓名。
- `DocumentPolicy = {doc,enabled,ownerId,policyRevision}`；owner 必須是有效 manage actor，轉移時交易內檢查，不撤掉最後管理者。
- `Suggestion = {id,doc,baseVersion,baseHash,proposedHash,baseHtml,proposedHtml,revision,sourceSuggestionId,status}`。正文是清理後快照；送出凍結。
- `Item = {id,suggestionId,section,type,patch,dependencyGroup,before,after,decision,publishedIn,sourceItemIds}`；decision 為 `pending|adopt|decline`，伺服器生成 ID 與 patch。
- `Event = {id,doc,suggestionId,itemIds,actorSnapshot,time,action,beforeState,afterState,note,publicationId}`；追加式；文字關聯快照，不複製密碼/token。
- `Publication = {id,doc,suggestionId,itemIds,baseVersion,baseHash,suggestionRevision,contentHash,formalHtml,versionKey,status,commit,attempts,nextAttemptAt}`；狀態 `accepted|writing|reconciling|saved|conflict|failed`。公開站/PDF/摘要另有狀態，不把 saved 冒充 live。
- `requestId`：修改請求 UUID，唯一鍵 `(doc,actorId,requestId)`，保存 operation/payloadHash/result；同 ID 同內容回原結果，同 ID 不同內容回 409。
- 所有修改使用 expectedRevision 比較；失配回 409 與最新 revision。每份文件一個 active publication 的資料庫唯一約束；外部 fetch 不放在 SQLite 交易內。

協作 API 繼續 POST text/plain JSON、沿用 site origin allowlist；每次請求包含 `{token,doc}`，修改另外含 requestId。回應私有資料加 `Cache-Control: no-store`，錯誤回 `{error,message}`。讀取分頁上限 50，使用事件序號 cursor；回應不包含 tokenHash。

| 路徑 | 輸入（不含共用欄位） | 結果／能力 |
|---|---|---|
| `/session` | scope | `{name,role,capabilities,policy}`；原 library 契約保留 |
| `/collaboration/settings` | enabled,ownerId,expectedRevision（設定時） | DocumentPolicy；manage；首次 bootstrap 須舊 admin |
| `/collaboration/links/list` | cursor | 具名連結公開欄位；manage |
| `/collaboration/links/create` | name,company?,capabilities | 新 link ID 與僅此次顯示的 token；manage |
| `/collaboration/links/update` | id,capabilities?,enabled?,name?,company?,expectedRevision | 最新 link revision；manage |
| `/suggestions/create` | baseVersion,baseHash,proposedHtml,sourceSuggestionId?,sourceItemIds? | Suggestion 與 items；propose |
| `/suggestions/list`、`/suggestions/get` | cursor／id | 建議與項目；view |
| `/suggestions/comment` | id,itemIds?,text | Event；view；text 1～2000 字 |
| `/suggestions/decide` | id,itemIds,decision,note?,expectedRevision | 最新 revision、項目決定；decide；整批原子保存 |
| `/suggestions/withdraw` | id,expectedRevision | 已撤回及 Event；propose 且本人、沒有已發布項目 |
| `/suggestions/history` | id?,cursor | 事件與來源關聯；view |
| `/suggestions/preview` | id,itemIds,expectedRevision | Preview `{baseVersion,baseHash,revision,contentHash,html,stats,decisionCounts}`；view |
| `/suggestions/publish` | id,itemIds,expectedRevision,previewHash | Publication；publish；伺服器再計算並驗證 |
| `/suggestions/publication` | publicationId | Publication 與 saved 狀態；view |

## 任務 1：可驗證的建議補丁與伺服器正文計算

**Files:** 上表 diff／Worker HTML；`tests/suggestion-patches.spec.js`、既有 engine/diff/golden/markup 測試；package/lockfile。

**Interfaces:** `createSuggestionItems(baseHtml,proposedHtml,context):ItemDraft[]`；`applySuggestionItems(baseHtml,items,selectedIds,context):cleanHtml`；`buildPublishedContent(baseHtml,cleanHtml):{html,hash,summary,details}`。context 由 browser 或 `linkedom/worker` adapter 提供。既有 `buildFormalDiff`／`cleanSnapshot` 預設 browser context，呼叫端不必全面改名。

- [ ] 先寫 `replacement_is_atomic`、`five_items_apply_three`、`two_edits_one_paragraph`、`structural_dependency_group`、`worker_browser_parity`。斷言全部採納回復 proposed clean snapshot；零採納等於 base；替換不能只刪／加一半；只採納 3 項不含其餘 2 項。
- [ ] 執行 `npx playwright test tests/suggestion-patches.spec.js --project=chromium`，確認缺介面失敗。
- [ ] 建立 context 注入與 Worker adapter，沿用 diff token／block alignment；文字 patch 用基準節點路徑＋文字區間＋原文校驗，從後往前套用。結構／格式修改用最小完整子樹；祖先相依範圍合為一組，不能重疊偷偷覆蓋。ID 在保存時固定，排序不重新編號。
- [ ] 清理 script、handler、危險 URL、偽造修訂標記；html 上限沿用 1,000,000 字元。先做受支持模型標準化，再建補丁；unsupported DOM 差異回明確 422，不猜測。鎖定 linkedom 精確版本；若 adapter 無法達成 parity，停止此任務，修正 adapter／標準化後再進後續，不跳過驗證。
- [ ] 執行上述測試及 `npx playwright test tests/engine.spec.js tests/diff.spec.js tests/golden.spec.js tests/markup.spec.js --project=chromium`。涵蓋表格、巢狀清單、圖片、粗體、中文符號、重排與惡意 HTML，原 golden 不得為了通過任意更新。

## 任務 2：私有 SQLite 儲存與原子歷程

**Files:** `contracts.js`、`schema.sql`、`store.js`、`hub.js`、wrangler test 設定／測試 runtime／gitignore；`tests/collaboration-store.spec.js`。

**Interfaces:** `CollaborationHub.fetch(request)`／`alarm()`；store `transact(fn)`、`appendEvent(event)`、`readEvents(doc,cursor,limit)`、`getRequestResult(key,payloadHash)`。後續領域服務消費 store 與注入 clock/IDs，API domain 不直接 import cloudflare:workers，讓既有 Node Worker tests 可維持。

- [ ] 寫 `decision_event_rollback`、`permission_event_rollback`、`restart_keeps_history`、`same_request_replay`；斷言故障時狀態與事件全無或全有，同 ID 異內容 409。
- [ ] 建立本機 runtime runner：啟動鎖版 Wrangler `dev --local --config worker/wrangler.test.toml`，只使用 loopback fake GitHub，臨時獨立 persistence 目錄；測試結束關閉程序。加入 `npm run test:collaboration -- <filter>`，以此命令先驗證缺服務失敗。
- [ ] 建表 policies、actors、links、grants、suggestions、items、events、requests、publications；使用參數化 SQL、revision、唯一鍵；以 `transactionSync` 保存狀態與事件。schemaVersion 遷移可重跑，不重建／刪舊資料。
- [ ] 真正本機 DO 測試重啟服務驗證持久化、交易故障及跨文件隔離；再跑 `npm run test:collaboration -- store`。mock 不能代替本任務 runtime 驗收。

## 任務 3：具名連結、可變能力與舊模式保護

**Files:** `permissions.js`、Worker route/session、store；`tests/collaboration-api.spec.js`、`tests/worker.spec.js`。

**Interfaces:** `resolveActor(token,doc,legacyAuth):Actor`；`requireCapability(store,actor,doc,capability)`；`updateGrant(actor,input):Grant`；`setPolicy(actor,input):DocumentPolicy`。

- [ ] 寫 `revocation_next_request`、`cross_doc_denied`、`legacy_editor_cannot_publish`、`own_suggestion_can_adopt`、`last_owner_protected`、`storage_failure_never_falls_back`；先跑 `npm run test:collaboration -- permissions` 確認失敗。
- [ ] 新協作 tokenHash／能力只存私有資料；Worker 先解析私有連結，再驗證既有 GitHub link。舊 link 保留原 ID，首次 bootstrap 複製有效具名資訊並記錄來源；舊 link 每次仍查 GitHub 撤銷狀態，私有 grant 是啟用文件的有效能力，不依 admin/editor 自動覆蓋。
- [ ] 所有文件寫入先查權威 policy；binding/查詢失敗回 503，不走 legacy publish。未啟用的文件走原路徑，新協作 link 不得越權管理 library。啟用／停用、主控轉移、改名／輪替／撤銷同交易留事件；停用不刪資料。
- [ ] 模式啟用必須等待已受理的 legacy 發布結束；所有 `/versions`（包括未啟用模式）先在同一 Hub 排他門受理並查 policy，不能先查 disabled、離開協調服務後才直接寫 GitHub。未完 legacy 工作須可恢復，模式切換不可跨過它；測試 `enable_races_legacy_publish` 斷言啟用後不再受理直接發布。
- [ ] 舊 `/links`／`list`／`revoke` 在協作文件分流至同一私有服務，避免權限雙軌；終端停用 legacy token 仍有效。若最後 owner 的 legacy link 被外部撤銷，只允許有效全域 admin 具名恢復 owner並留事件，不自動把任何 editor 升權。
- [ ] 跑 `npm run test:collaboration -- permissions` 與既有 worker/edit-link tests，斷言舊文件行為不變、客戶端姓名不能偽造、改名不變舊事件、token不出現在日誌／public JSON。

## 任務 4：送出、逐項處理、完整歷程與重新比較

**Files:** `suggestions.js`、route；`tests/collaboration-api.spec.js`、patch/store tests。

**Interfaces:** `createSuggestion(actor,input)`、`decideItems(actor,input)`、`withdrawSuggestion(actor,input)`、`buildSuggestionPreview(actor,input)`。每個修改都是 requestId＋revision 契約，事件與狀態一起保存。

- [ ] 寫 `submission_no_formal_version`、`batch_decision_cas`、`declined_keeps_text`、`withdraw_keeps_snapshot`、`successor_keeps_lineage`、`old_base_rejected_preserves_draft`；先跑 `npm run test:collaboration -- suggestions`。
- [ ] 服務端讀最新 GitHub 正式版，清理 proposedHtml、驗證 baseHash、生成 patches與固定 S001／S001-01；不接受前端 patch／姓名／時間。相依組必須完整選擇，未知/重複 ID／越過該建議範圍拒絕。無有效差異不建立建議。
- [ ] 送出凍結正文，改決定追加事件；撤回只改狀態，已發布項不能撤回或改決定；發布工作鎖住的項目不能撤回／修改，未鎖項才可繼續處理；留言2000字、選填理由2000字、不重複保存同請求。採納自己的建議按同權限規則處理。
- [ ] 重新比較由原 proposed/base 範圍與最新正式版生成新草稿，遇衝突保留兩方內容供編輯者確認；再送出產生 successor 與 sourceItemIds。新項目全部 pending，不繼承舊採納；原建議及未決項保留，不暗中標不採納。
- [ ] 跑上述測試，驗證狀態推導、全部不採納可完成且沒有新版、整批處理不波及未選/隱藏項；查看分頁仍能找回原建議與決定。

## 任務 5：只發布採納內容與故障恢復

**Files:** `publication.js`、`github.js`、hub alarm；Worker `/versions` guard；`tests/publication-recovery.spec.js`、fake GitHub。

**Interfaces:** `acceptPublication(actor,input):Publication`、`advancePublication(publicationId):Publication`、`reconcilePublication(publicationId):Publication`；原 GitHub `readJson`／`writeJson` 原樣提取並注入 fake fetch。`beginDocumentWrite(doc,kind)`／`finishDocumentWrite(doc,id)` 提供所有版本寫入與模式切換共用的持久排他門。

- [ ] 寫 `five_three_two_publish_once`、`response_lost_retry_once`、`github_saved_private_confirmation_lost`、`decision_changed_after_preview`、`revocation_before_after_acceptance`、`pending_rebase_after_partial`；先跑 `npm run test:collaboration -- publication`。
- [ ] 交易內再次查有效能力、revision、previewHash，重新計算採納正文與統計，保留限流10正式版/文件/小時；鎖定選定決定，保存publicationId／待執行工作。受理後關權限不取消此工作；其餘項仍可處理，但不能改已鎖項決定。
- [ ] 不在交易內 await GitHub：寫入前重讀 SHA／最新基準，附加 nextVersion；只將正式 diff、前版、引擎統計／details、aiSummary及不含身分的隨機 publicationId/contentHash寫入新正式版。validateVersion白名單明確容許這兩個恢復欄位，舊版保持原樣；不公開S001、item IDs或操作者協作事件。
- [ ] GitHub 寫入結果未知先 reconcile：搜尋版本 publicationId及hash，已存在就補私有成功事件；只在確認未寫入且基準一致時重試。SHA變動但正文基準未變（例如摘要回寫）重讀後重試；正式latest變動轉conflict。正式寫入後永不刪版。
- [ ] 持久工作由 alarm及狀態查詢推進；暫時失敗30秒／2分鐘／10分鐘，最多3次自動寫入嘗試，未知寫入先核對；最後failed保留工作和歷程，可人工明確重試同 publicationId。alarm無工作就不續排，重試不形成永久迴圈。
- [ ] saved後建立publishedIn與成功事件；剩餘未決需重新比較。全部未採納／無正文變動不建空版本。跑recovery tests，注入每個外部I/O斷點、同文件同時發布、已保存後舊基準續發；斷言歷史JSON逐版不變。

## 任務 6：分享權限介面與即時授權回饋

**Files:** `sharing-permissions.js`、`src/library/share.js`、`access.js`、`api.js`、`state.js`；`tests/sharing-permissions.spec.js`、collaboration fixture。

**Interfaces:** `loadCollaborationSession()`、`renderSharingPermissions(container,links)`、`refreshCapabilities()`；session擴充capabilities/policy，不改 library admin契約。

- [ ] 寫瀏覽器測試：建立具名連結預設view/propose；開關decide/publish/manage；另一舊分頁下一次請求被拒絕且Draft仍在；顯示名稱改了舊歷程不變。
- [ ] 跑 `npx playwright test tests/sharing-permissions.spec.js --project=chromium` 確認新UI尚缺而失敗。
- [ ] 分享面板每列顯示名字／選填公司／有效狀態／能力；新token只顯示一次且不持久保存原token；若建立成功但回應遺失，requestId回傳既有link ID與「連結已建立，需重新產生」狀態，透過具名輪替停用舊link再發新token，不為重試把原token存入事件／request result。測試此情境不產生兩條有效連結。401/403重新查session、顯示原因與可重試操作；不重新渲染正在編輯的正文。mode啟用前呈現舊權限映射及owner確認，關閉列出未結清建議。
- [ ] 執行上述測試與library/edit-link回歸；確認管理不同文件隔離、依賴能力自動帶入、停用不刪建議，頁面不能只靠hidden按鈕授權。

## 任務 7：送出建議、Word 逐項處理與完整歷程 UI

**Files:** `suggestions.js`、`suggestion-view.js`、draft/edit-bar/main/elements、template/styles；`tests/suggestions.spec.js`。

**Interfaces:** `submitActiveDraft()`、`loadSuggestion(id)`、`renderSuggestionView(suggestion)`、`renderSuggestionHistory(events)`；建議view獨立狀態，不放進state.versions。

- [ ] 寫 `submit_keeps_version_menu`、`right_panel_decisions`、`filter_bulk_scope`、`withdraw_history`、`composition_not_interrupted`、`mobile_history_readable`；先跑 `npx playwright test tests/suggestions.spec.js --project=chromium`。
- [ ] 開模式後finishRevision分流送出建議；成功response才清該草稿。失敗/斷線維持DOM、游標與localStorage；重試用同requestId，修改payload則換ID。開始修訂記住原base，不偷偷換成當前latest。
- [ ] 建議清單、原文/建議Word標記、右欄採納/不採納/待討論及討論、來源/發布關聯；點卡定位，整批按可見ID範圍。沿用已選Word設計，進一步視覺改版須先給比較。
- [ ] 待討論／不採納可完整展開；公開view不預載私有資料。已送出建議改字建立新草稿，不能直接重寫凍結正文。所有歷程日期用既有date formatter，顯示名字與操作文字，不只用顏色。
- [ ] Chromium及WebKit測試包含中文IME、連續貼上／粗體／表格、窄螢幕與鍵盤操作；規格UI新增是功能驗收，正式卡保持原樣。

## 任務 8：採納後預覽、部分發布與PDF／摘要銜接

**Files:** `publication-preview.js`、`publish-status.js`、`share.js`、`version-view.js`；suggestions/recovery瀏覽器測試。

**Interfaces:** `openPublicationPreview(suggestionId,itemIds)`、`trackSuggestionPublication(publicationId)`；採納後預覽與正式view明確分開，share/PDF只指正式版本。

- [ ] 寫 B5/A3採納2不採納完整UI流程；另測3採納2待討論、發布中停權、saved但Pages尚未live、PDF稍後完成、preview過期及零異動。
- [ ] 執行 `npx playwright test tests/suggestions.spec.js tests/publication-recovery.spec.js --project=chromium` 確認相應流程失敗後再接UI。
- [ ] 確認畫面列base與預期新版、採納/不採納/待討論數、真正選定範圍；發布成功前不塞假正式版。saved後載入伺服器正式snapshot，沿用站點/PDF輪詢，恢復publicationId讓重新開頁可續查。
- [ ] 只在乾淨正式版顯示正式PDF；私人建議／預覽不生成官方PDF，不複製未採納文字作正式全文。PDF live後免重整可下載，保留歷史版下載。
- [ ] 正式summary／stats由最終正文重算，aiSummary與現有規則銜接：服務未啟用顯示「變更說明尚未補寫」，已啟用才追蹤待生成；採納流程不觸發付費API或私下建議摘要。確有現成已部署摘要服務時才整合，不能直接搬舊worktree推定上線。
- [ ] 跑UI/worker/PDF/site/changelog回歸，確認B的未採納記錄留在協作區、正式卡只有實際變更，部分發布後其餘內容可重新比較而不丟失。

## 任務 9：整體驗收與獨立上線準備（另需授權）

**Files:** `docs/operations/revision-suggestions.md`、package scripts、CI、wrangler正式binding；必要engine/meta與handoff更新只在核准發布範圍內。

- [ ] 本機整合後跑 `npm test`、`npm run test:collaboration`、`npm run build`、`npm run pdf`、`git diff --check`；執行規格13節14案例，產出實際通過／失敗／未驗證報告。新增協作工具測試限定chromium，UI保留WebKit；不能只靠fake DO標完成。
- [ ] 驗證public輸出與GitHub寫入快照沒有建議／未採納原文／私下留言／token，所有舊versions與JSON內容保持；新schema恢復欄位能被build/PDF/changelog忽略或讀取。
- [ ] 運維文件列私有資料備份／restore演練（在獨立本機資料副本）、schema升級、工作重試、權限恢復、模式停用；備份不是公開artifact，雲端PITR恢復不能倒退已成立正式版，須核對publicationId再補歷程。
- [ ] 寫上線核對清單：查帳戶支援、資源費用與配額；部署前選定／核准DO binding及migration。完整功能本機完成不等於雲端資源或部署授權；未獲授權停在可review結果。
- [ ] 獲後續部署授權才做：先部署預設關閉的Worker且驗證舊API，再發布相容UI/CI；只在明確授權測試文件啟用模式。main push直接部署Pages，沒有UAT，故真實測試使用授權sandbox，不用QA正式文件製造版本。
- [ ] 逐文件人工啟用；對外發布前實際驗證B提出5/A採納3及保留2、改權限、history、公開版本與PDF。故障先停新建議入口／發布，保留私有服務與read-only歷程；不得退回允許舊API繞過模式的Worker。
- [ ] 真正發布引擎版本時才依最新基準增加R2.x，不在計畫鎖死下一號。Commit／Push僅按獨立授權精確staging，不加入其他docs或.playwright-cli。

## 依賴、階段交付與自檢

順序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9。先完成可本機測試的完整後端，再開UI；每任務需所列測試通過並自審，未授權Commit就保留本機差異，不照技能預設自動Commit。

- 第一個可驗收交付：任務1～5，本機API證明5建議只發布3、歷程完整且重試不重複。
- 第二個可驗收交付：任務6～8，主控分享／成員建議／Word逐項決定／發布／歷程的完整本機操作。
- 第三個交付：任務9的驗收報告及上線準備；雲端啟用與公開部署另外授權。

規格覆蓋：§2模式/legacy→3；§3用語→6～8；§4能力/具名→2、3、6；§5建議狀態→4、5、7；§6逐項→1、4、7；§7部分發布/摘要→5、8；§8歷程→2、4、7；§9介面→6～8；§10一致性→2、3、5、9；§11衝突→1、4、5、8；§12非目標→Global Constraints；§13驗收→9。

計畫自檢已完成：權限與模式權威一致；client不可提交正式正文；state/event原子保存；未知GitHub寫入先核對；保存/Pages/PDF/摘要分開；未採納與未決歷程仍留存；格式相依不拆半；所有跨任務介面由契約定義。以上是文件自檢，功能測試均尚未執行。

建議執行方式：主Agent依序執行，每階段交付可檢視結果；不預設新chat或平行agent。下一步可先授權任務1～5本機實作，仍不Commit／Push／部署／建立雲端資源／呼叫付費AI。

## 技術來源

本計畫選DO是EDoc的設計建議。官方文件確認SQLite-backed DO支援交易與私有物件storage；alarm可能重試，所以發布必須自己實作冪等性。DOM adapter採用linkedom的Worker入口，但它不宣稱完整browser DOM相容，故任務1的跨runtime parity是前置阻擋條件。

- [Cloudflare SQLite-backed Durable Object Storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Cloudflare Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [LinkeDOM官方原始碼與Worker入口](https://github.com/WebReflection/linkedom)
