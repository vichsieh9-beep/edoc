# EDoc 修訂建議：操作與發布準備

26/10/01；僅本機準備，未啟用雲端。正式資料仍為 documents/*/document.json；私人建議／決定／留言／權限／工作保存在 SQLite Durable Object，不能放入 GitHub、Pages、PDF 或公共備份。

## 本機驗證

在隔離 worktree 執行 npm test、npm run test:collaboration、npm run build、npm run pdf、git diff --check。preview:collaboration 僅使用 loopback、假 GitHub 與可丟棄 SQLite；重啟資料消失，不能當正式環境或備份。

tests/worker-runtime.mjs 的 backup()/restore() 只處理該測試建立的臨時持久化目錄；先停止 workerd，複製整個目錄以保存 SQLite 與 runtime metadata，再重啟。restore 只接受本測試的快照，結束會清除所有快照。不要複製仍在寫入的 SQLite 單檔。publication-recovery 的 isolated private backup 測試驗證還原後重啟、三項採納與兩項不採納歷程、publicationId 核對及正式版不倒退；這不是 Cloudflare PITR 驗證。

## 私人備份與還原

正式環境需另行核准並建立維運入口；目前沒有可操作的雲端匯出／還原 API。使用限制存取且加密的獨立備份位置，記錄 namespace、documentId、schema 版本、時間、bookmark、發布工作 ID 與 GitHub HEAD；不保存明文分享 token，不把備份放在 repo／_site／CI 公開附件。備份包含個人署名與未採納內容，依約定訂定保留期限及操作人員。

Cloudflare SQLite DO 提供過去 30 天 PITR，且不支援本機 PITR；參見[官方儲存 API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。雲端演練須在另外授權的隔離 namespace 進行。還原前先在外部私人安全位置保存最新 links/grants/policies、撤銷／換連結／主控轉移證據與具名操作紀錄；SQLite快照會同時回滾權限，可能讓已撤銷連結復活。還原期間先封鎖一般成員的私人讀寫及新發布，只保留經維運核准的管理核對入口（不能僅停發布就開放唯讀）。保存還原前 bookmark，選定舊 bookmark，呼叫 onNextSessionRestoreBookmark 後重啟。還原後以 publicationId + contentHash 對照 GitHub 最新正式資料：已有相同發布則補回私人確認；沒有才考慮同一工作重試；基準已變則停止並人工重新比較。核對並恢復最新撤權、連結輪替、主控與能力設定，失效token必須仍被拒絕；若證據不足則持續封鎖私人存取，不猜測權限。以新增具名復原事件記錄差異，原私人快照與外部證據保留。完成權限核對後才開放授權唯讀，再決定是否恢復寫入。不得還原 documents JSON 或刪掉已存在的正式版本來配合私人快照。

限制：若快照早於工作被受理，該工作 ID／決定可能已不在私人庫；不可自動重建採納或偽造舊歷程，須由私人安全備份／稽核紀錄人工核對，保持停止發布直到處理完畢。

## Schema 升級

目前 schema v1 為首次建立，schema.sql 與 schema.js 必須同步；現有資料使用 CREATE IF NOT EXISTS 與 schema_versions，不代表未來 v2 自動遷移已完成。未來升級需新增單調版本、明確遷移步驟、交易與舊資料 fixture，在隔離備份副本驗證前後事件、權限、工作、內容雜湊一致。不得修改／刪除歷史 events。Cloudflare migration tag 是 namespace/class 部署遷移，與應用 SQL schema 版本不同，兩者各自驗證。

## 失敗、主控者復原與模式關閉

發布 accepted/reconciling 表示工作保留；saved 表示 GitHub 內容已確認，不代表 Pages/PDF 已更新。failed 使用 /suggestions/publication/retry 搭配原 publicationId；不要另建相同工作。conflict 需重新比較，不可強制覆蓋正式基準。舊直接發布故障使用 /collaboration/legacy/status、/collaboration/legacy/retry（實際端點以上線前源碼核對為準），全域管理者可復原已受理工作；不把復原當新的內容授權。

主控轉移先指定有效且有 manage 權限的具名連結。原主控無效時，全域管理者使用 /collaboration/settings 的 recoverOwner:true、enabled 與最新 expectedRevision，伺服器驗證舊主控確實失效並保留 before/after 具名事件。不得透過直接改資料解除最後管理權。

模式關閉用管理介面的切換；保留私人建議及歷程、已受理發布仍可核對完成。**關閉修訂建議不是事故停止發布開關**：它恢復原直接版本更新流程。事故時維運須另外阻止新建議／新發布路由，保留已受理工作的核對與授權唯讀歷程；目前尚未提供專用事故開關。不要回退到未經 Durable Object 的直接 GitHub 寫入。

## 發布前待核准清單

- 實際帳戶的 Workers 方案、SQLite DO 支援、配額、帳單與告警尚未驗證。官方 [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) 與 [limits](https://developers.cloudflare.com/durable-objects/platform/limits/) 於26/10/01查閱：Free 支援 SQLite DO，請求 100,000/日、讀列 5,000,000/日、寫列 100,000/日、帳戶儲存 5GB；超限會停止操作。Paid 按用量計費，需核准預算再建立。官方 limits 表與 FAQ 對 Free 單物件上限列值有差異，上線前以帳戶實況／平台確認，不把10GB當Free保證。
- 生產 worker/wrangler.toml **尚未增加 binding**，新版程式的版本寫入在缺少 binding 時回503；不可直接部署這份程式而漏掉 namespace migration。
- 以下僅候選設定，待核准後比對既有 remote migrations、帳戶與類別名稱再採用，不在本輪執行：

```toml
[durable_objects]
bindings = [{ name = "COLLABORATION", class_name = "CollaborationHub" }]
[[migrations]]
tag = "collaboration-v1" # 必須確認未與既有部署標籤衝突
new_sqlite_classes = ["CollaborationHub"]
```

- 先授權部署 Worker（每份文件預設關閉模式），驗證舊 session／連結／直接更新與失敗復原，再發布 UI。現有 main push 會直接觸發 Pages，沒有隱含 UAT；不得提前 Push。發布時才同步 engineVersion、handoff 與生產 CI 修改，採用精準 staging。
- CI 現行 npm test 已包含新 runtime/browser 測試，Pages 組裝只取 index.html、documents/*/index.html、pdf，不取 docs／SQLite。部署前在Linux Node22驗證 wrangler/esbuild、Chromium/WebKit、中文PDF、artifact 隱私與正式 JSON 新欄位支援；本機成功不能代替Linux或雲端驗收。
- 另行核准隔離測試文件啟用模式；以真實 B五項、A採納三項不採納兩項，核對所有具名歷程、即時權限變更、公開 HTML、PDF及舊版完整保留；真實發布摘要只描述已採納內容。
- 付費AI仍未啟用；aiSummary 空白顯示「變更說明尚未補寫」。後續正式版本由Codex更新仍遵循AGENTS完整diff及同次提交摘要流程。

完成上述雲端與維運驗證，才可對外宣稱可上線；本輪僅完成本機驗收及待發布資料。
