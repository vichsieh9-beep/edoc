# 狀態編號與修訂卡收合（本機）

26/10/02，依已確認設計完成既有修訂建議介面調整；範圍僅本機，沒有發布授權。

實作：

- 正文與右卡編號保持 32px 同欄排列。私人建議的編號用綠色 ✓ 表示採納、灰色 × 表示不採納、中性色 · 表示待討論；選取以藍色外框表示，不覆蓋決定狀態。完整決定者與狀態放在正文編號 title／無障礙名稱，篩選隱藏卡片時仍保留。
- 右卡新增可鍵盤操作的單行展開／收合按鈕，顯示編號、狀態與內容開頭；省略號只裁切顯示。修改／新增取建議內容，整段刪除取原文。完整修改前後內容、決定者與操作按鈕保留在展開區。
- 待討論預設展開；已處理預設收合。只有決定儲存成功並讀回最新建議後才更新呈現；失敗仍展開。重新點選相同決定也收合，改回待討論則展開。
- 展開選擇只留在目前瀏覽器記憶體，不寫入文件或伺服器。篩選與其他項目決定不會關閉手動展開的卡片；重新開啟建議或重載頁面後回到預設。
- 點正文編號／正文修訂或右卡可展開並雙向定位，篩選隱藏的卡片會先切回全部。按卡片標題也可收合。成功決定後保持目前右卡的捲動位置，鍵盤焦點移至該卡標題。
- 保留草稿／正式版本的一般編號樣式；沒有改寫版本、凍結項目、權限、具名歷程或發布規則。

驗證：

- tests/suggestion-collapse.spec.js 新增 6 個行為案例 × Chromium／WebKit。有效 RED 12 項失敗，/tmp/edoc-collapse-red.log。
- 初次實作後 86 項通過、6 項失敗：兩個測試 fixture 問題（503 回應未使用真正 API message 欄位、長文共同文字被既有比較引擎配成修改），以及既有操作案例需要先展開已處理卡再按「改回待討論」。已修正 fixture／操作步驟，沒有移除原本前後內容、具名歷程及發布斷言。
- 新增篩選後具名提示、重新選擇相同決定的檢查，再取得有效 RED 4 項失敗；修正狀態描述不依可見卡取得、成功儲存明確重設該項收合選擇。/tmp/edoc-collapse-edge-red.log。
- 相關 96 項通過（29.2 秒），/tmp/edoc-collapse-green-final.log，包含原編號定位、游標穩定性、編輯與部分採納發布。最終全套 346 項通過、2 項既有 WebKit 剪貼簿案例略過（1.3 分鐘，2 workers），/tmp/edoc-collapse-full.log。
- npm run build 與 git diff --check 通過。
- 實際 Codex 預覽只操作假資料：01 採納、02 不採納、03 待討論；左側三個編號 left 均為 144px，右卡展開狀態依序 false／false／true。點左側 02 可展開完整對照與 Vic 已不採納，再點標題收合。截圖 /tmp/edoc-status-collapsed.png、/tmp/edoc-status-expanded.png。

交付預覽：http://127.0.0.1:64070/documents/qa-senior-game-qa/#edit=edoc-admin-token-0123456789abcdef 。PID 18078，工具 session 57333，Codex 分頁 7 保留供使用者試用。假 GitHub／記憶體 SQLite，沒有官方 PDF。舊 64060～64069 服務、使用者測試資料與分頁均未重啟或改寫。

使用既有 dirty worktree；原 checkout 只保留既有未追蹤 docs／.playwright-cli，HEAD 仍為 4f7c2e807cedf70effff962153b5d230293596d9。正式 document.json、歷史版本、生產 binding、CI、engineVersion 無變更。未 Commit、Push、部署、建立雲端資源或呼叫付費 AI。

收尾程序檢查：測試 Chromium／WebKit、worker runtime 與臨時 profile 已退出；使用者正常 Chrome PID 34908 保留。僅交付用 Codex 預覽分頁及本機服務保留，供後續試用。
