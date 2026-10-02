# 游標導航時修訂畫面穩定性（本機）

26/10/02。使用者錄影「螢幕錄影 2026-10-01 23.48.17.mov」約 8.8 秒，顯示草稿按左右方向鍵時，整句刪除標記消失後重新出現，導致正文及編號上下移位。

原因：doc-surface.js 的 prepareEditing 原先對所有 keydown 呼叫 clearDraftDeletions，再發 edoc-markup-invalidated。整段比較片段先移除、局部文字拆分先合回，150ms 後 refreshDraftStats 重建比較片段與定位欄。導航不修改文件，也觸發此流程。

修正：在 keydown 前置處理中略過方向鍵、Home／End、PageUp／PageDown、Shift／Control／Alt／Meta、CapsLock／Escape／Tab，以及 Ctrl／Cmd+A。正常導航／選取採原生行為，不清標記、不重建修訂卡。輸入、Backspace／Delete、Enter、貼上／剪下、IME 及 undo／redo 保留原有前置清理；beforeinput 仍處理沒有 keydown 的輸入。未改編輯模型、版本資料、序列化或比較規則。

驗證：

- 新增 tests/caret-navigation.spec.js，混合新增、整句刪除與局部刪字，在所有／簡單標記下記錄正文／定位欄／右卡的 MutationObserver、保留節點及逐幀段落文件座標。
- 修正前 Chromium／WebKit 4 項重現：比較片段被移除、節點斷開、正文位移。初次啟動受已不存在的瀏覽器快取阻擋，恢復官方 Playwright Chromium／WebKit 快取後才取得有效重現結果。
- 修正後 64 項相關驗證通過（25.9 秒），包含移游標、選取、文字輸入、undo／redo、IME、定位、儲存與提交。幾何量測使用 top + scrollY，排除原生 Home／End／文件邊界導航造成的正常頁面捲動。
- 最終全套 324 通過、2 項既有 WebKit 剪貼簿案例略過（1.3 分鐘，2 workers），記錄 /tmp/edoc-caret-full.log；npm run build 與 git diff --check 通過。
- 實際 Chromium loopback 64068 混合修改草稿連續 24 次左右鍵，正文 mutations=0；整句「能獨立規劃測試。」及局部「協」均持續保留，pageerror=0。截圖 /tmp/edoc-caret-stable.png；驗證錄影 /tmp/edoc-caret-video/proof/page@a281eac0349bc9ed286eb9d3db0e6fc8.webm。

新預覽： http://127.0.0.1:64068/documents/qa-senior-game-qa/#edit=edoc-admin-token-0123456789abcdef 。PID 38646，工具 session 65396；假 GitHub／記憶體 SQLite，沒有雲端、付費 AI 或官方 PDF。Codex 新分頁 5 已留在乾淨的可編輯草稿供試用；準備分頁時輸入的測試內容已復原，並確認「未偵測到內容變更」。既有 64060～64067 服務與使用者測試資料保留；沒有自動搬移 64067 草稿至新 origin。

測試瀏覽器已關閉，user Chrome 未終止；只有交付用的 Codex 預覽分頁／本機服務保留。既有 dirty worktree、原 checkout、HEAD、正式 document.json、歷史版本、生產 binding／CI／engineVersion 未變。未 Commit、Push、部署、建立雲端資源或呼叫付費 AI。
