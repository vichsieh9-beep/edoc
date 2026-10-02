# 修訂編號排列與來源定位修正（本機）

26/10/02。依使用者截圖，01 在正文左側內欄，02、03 卻擠在紙張最左側，並共同定位到 AI 協作段落。

原因有兩項：一般編號與群組編號使用不同的水平座標；凍結建議 S004 的第二、第三項共用正文定位點，第二項實際可對應到獨立的原刪除句「能獨立規劃測試。」。

本輪修正：

- 所有正文編號使用同一固定欄位、32px 寬及等寬數字，包含隱藏刪除與群組。標題／多行段落對齊第一行中心，不對齊整段中心。
- 隱藏刪除與相鄰修改太近時，編號在同欄排列；群組高度受下一個編號位置限制，避免相互覆蓋。
- 私人建議只有在多項共用定位點，且能辨識獨立的原刪除段落時，才改用該段定位。一般替換仍定位到修訂後段落，重複文字仍使用原有路徑。沒有改寫凍結建議、採納決定或歷程。
- 新增 alignment 假資料預覽場景，重現新增「有帶過人」、刪除整句及 AI 協作局部刪字。

驗證：

- 新增 5 案例 × Chromium／WebKit：桌面／390px 窄版、所有／簡單標記、共享定位點、凍結資料不變、標題及多行段落對齊。有效 RED 10 項失敗，記錄 /tmp/edoc-number-alignment-red.log。
- 初次來源定位改得過廣，既有 4 個一般替換／重複文字定位案例失敗；改為僅處理共享定位點後，相關 84 項全通過（26.8 秒）。沒有放寬既有測試，記錄 /tmp/edoc-number-alignment-green.log。
- 全套 334 項通過、2 項既有 WebKit 剪貼簿案例略過（1.3 分鐘，2 workers）；/tmp/edoc-number-alignment-full.log。游標導航穩定性、編輯、undo／redo、提交與歷程驗證仍通過。
- npm run build、git diff --check 通過；正式 document.json、歷史版本、生產 binding、CI、engineVersion 無變更。
- 實際 Codex 預覽：01／02／03 的 left 均為 144px；top 分別為 406.02／492.41／535.60px。02 點擊定位原刪除句與右卡，右卡 03 點擊反向定位 AI 段；簡單標記同欄保留隱藏刪除定位。截圖 /tmp/edoc-number-alignment-all.png、/tmp/edoc-number-alignment-simple.png。

新預覽：http://127.0.0.1:64069/documents/qa-senior-game-qa/#edit=edoc-admin-token-0123456789abcdef 。PID 51365，工具 session 73108；記憶體 SQLite／假 GitHub。Codex 分頁 6 保留完整標記，供使用者檢視。先前本輪尚未交付的 64069 啟動版本已安全關閉並以最終程式重啟；舊 64060～64068 服務與使用者資料均保留，未搬移或改寫使用者 S004。

測試瀏覽器與 worker runtime 已退出，使用者正常 Chrome 保留；僅交付預覽分頁／服務保留。使用既有未提交 worktree，原 checkout 僅有既有未追蹤 docs／.playwright-cli，HEAD 仍為 4f7c2e807cedf70effff962153b5d230293596d9。未 Commit、Push、部署、建立雲端資源或呼叫付費 AI。
