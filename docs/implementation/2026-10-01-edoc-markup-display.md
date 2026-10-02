# 所有／簡單標記修正（本機）

26/10/01。修改顯示層，不更新正式文件版本、建議決定或私人歷程。

所有標記：非編輯正文顯示刪除內容，紅字＋刪除線；新增維持藍字＋底線。簡單標記：隱藏刪除內容、新增文字回正文色與無底線，保留側邊紅線。整段刪除的紅線標在相鄰前一個仍保留的區塊，避免隱藏原文後完全看不到修改提示。

兩種模式均保留右側修訂卡與前後對照。選取已刪除段落不再凌駕簡單標記的隱藏規則。草稿編輯保留原有不插入刪除字到可編輯DOM的機制，CSS Highlight繼續標新增；列印仍隱藏刪除與右欄，不產生帶刪除文字的正式PDF。

已修正正文無條件隱藏deleted的CSS，以及正式檢視simple模式隱藏右欄的設定；同步圖例說明，正式右欄的刪除文字也使用紅色。

驗證：先重現所有標記刪除仍隱藏（2failed）再修正，Chromium/WebKit相關52項通過（11.1s）；全套264passed、2既有skipped（30.6s）。其後新增整段刪除simple紅線測試，Chromium/WebKit2項通過；build及diffcheck通過。切換不更改fake repo資料、私人決定仍pending；印刷模式刪除隱藏。

實際本機預覽與截圖：/tmp/edoc-all-markup.png、/tmp/edoc-simple-markup.png；最新http://127.0.0.1:64063/documents/qa-senior-game-qa/，舊預覽及使用者測試資料未清除。僅新64063服務在本輪內重新載入最後樣式。

未Commit、Push、部署、建立雲端資源或呼叫付費AI；正式JSON、歷史版本、生產binding/CI/engineVersion未改。


## 本輪補充：草稿整句刪除原位呈現

使用者指出截圖處於 Draft 修訂中，前輪唯讀修正未覆蓋此模式。本輪補上非可編輯的整段比較片段：所有標記在原位置顯示紅字刪除線；簡單標記隱藏它，保留相鄰正文側邊紅線及右側修訂卡。清單、表格列與巢狀清單依原結構定位；原生 div 段落可對映至比較模型的 p。

這些呈現片段由前後快照差異產生，draftSurfaceHtml 從草稿暫存、備份來源及離開編輯時排除；送出仍經 cleanSnapshot，不恢復已刪除內容。原有空段落保留於草稿／建議模型，未因本輪顯示調整改變資料規則。

為保留原生文字游標與 undo，草稿中的局部刪字仍維持右側修訂卡；正文新增文字繼續用 CSS Highlights。未將局部刪字插入編輯文字節點。整句／整段刪除則使用非可編輯的獨立區塊，支援復原與重做。本輪沒有變更唯讀正式版的局部紅字刪除線行為。

驗證：先重現 Draft 整段刪除沒有正文片段；Chromium/WebKit 18 項相關測試通過（14.5s）；全套 278 passed、2 既有 skipped（31.0s），build/diffcheck 通過。實際 loopback 頁面全標記及簡單標記截圖已檢視：/tmp/edoc-draft-all-markup.png、/tmp/edoc-draft-simple-markup.png。

獨立只讀審查發現刪除容器篩選、巢狀祖先對映兩項 P2；已修正並新增清單、表格列、巢狀清單、div 段落位置回歸案例。曾嘗試草稿局部刪字插入，但瀏覽器游標／復原測試揭露問題，因此移除該路徑，未交付。

最新預覽 http://127.0.0.1:64064/documents/qa-senior-game-qa/（PID13442），僅本輪新服務重新載入最終程式；64060～64063 及既有使用者假資料保留。測試瀏覽器已關閉；預覽服務保留供手動檢視。沒有 Commit、Push、部署、雲端資源或付費 AI；原 checkout、正式 document.json、歷史版本、binding、CI、engineVersion 不变。


## 最新補充：草稿局部與整段刪除規則統一

使用者截圖指出「善用」局部刪除只出現在右側，「主動溝通風險」整句刪除卻出現在正文。前輪刻意略過草稿局部文字，造成呈現不一致；本輪取消此例外，所有標記中的兩種刪除都以原位紅字刪除線顯示，簡單標記隱藏它們，右側卡片保留。

draft-deletions 追蹤自己分割的原始 Text 物件與片段，繪製及還原時把文字／Element 邊界選取轉成穩定位置。編輯前移除呈現片段並重接原始 Text，避免原生 undo 引用失效；輸入後再依快照差異重建標記。鍵盤、剪貼簿、組字與拖曳事件提前清除片段；沒有前置鍵盤事件的文字、換行及刪除輸入，依 beforeinput 的原始目標範圍重發 native 編輯命令。history undo/redo 仍由瀏覽器處理（WebKit 不允許在其 beforeinput 中巢狀 undo）。不攔截付費 AI 或更新正式版本。

獨立審查兩項 P2：空白落在刪文前後錯邊、Element child-index 選取在分割後跳位；已修正並補開始／尾端 Word 空白、全段選取、無鍵盤前置編輯回歸。Safari 原生 undo 可合併兩次相鄰刪除，測試檢查原文恢復及 redo 結果，尊重瀏覽器原生步數，不強制每次刪除一個 undo step。

驗證：原始局部刪文不存在 RED4；修正後全套 292 passed、2 既有 skipped（35.0s），build/diffcheck 通過。涵蓋局部替換後續輸入、中文組字、原生 undo/redo、多個同 Text 分割、換行、Element 選取、無 keyboard preparation 的刪除／undo／換行、混合整段與局部刪除、兩種標記、列印、暫存恢復與送出內容隔離。

最新 loopback http://127.0.0.1:64065/documents/qa-senior-game-qa/，PID24416/session83477。實際截圖 /tmp/edoc-mixed-deletions-all.png、/tmp/edoc-mixed-deletions-simple.png 已驗證：善用與主動溝通風險兩處正文刪文都存在，simple 皆隱藏。64064 與更早預覽保留，不清除使用者現有記憶體假資料；64064 仍執行上一輪程式，新修正須看64065。

未 Commit、Push、部署、建立雲端資源或付費 AI；未改正式 document.json、版本歷程、生產 bindings/CI/engineVersion 或原 checkout。測試瀏覽器已關閉，預覽服務保留供使用者手動檢視。本章取代前章「草稿局部刪字仍只在右欄」的限制。

## 最新補充：右側完整新增／修改／刪除卡

使用者在 64065 的 Draft 截圖指出正文新增與修改未出現在右欄。原因是右欄只遍歷刪除 marks。本輪改為讀取既有 formal diff 已對齊的段落／清單項目／表格格子：同段的局部新增、刪除合為一張修改卡，顯示「修改前／修訂後」，真正新增與刪除段落獨立列卡；保留所在章節。只為文字實際差異上色：刪除紅字刪除線、新增藍字底線，未改字仍黑色。兩種標記模式都保留右欄，點卡可定位正文；還原修改後對應卡消失。

採用呈現層 helper revision-cards.js，不改建議 ID、逐項決定、版本資料或儲存內容。初始候選用另一套建議配對規則，將新增段落誤配到相鄰修改段落；回歸測試揭露後改用正文相同的 formal diff 對齊結果，避免右欄與正文矛盾。編輯器留下的空 caret 段落不列內容卡，本輪沒有改既有統計／空段落正規化規則。

獨立只讀審查 complete_rail_review 發現 div 段落定位 P2 與巢狀 hr 重複卡 P3，兩項皆採納。新增對應測試先重現 4 failed（兩個瀏覽器），修正 live div 定位與 hr 單一歸屬後，相關 Chromium／WebKit 38 項通過（32.0s）。既有 pure image src 替換不產生 formal marks 屬 engine 能力缺口，未納入本輪文字修訂側欄調整。

真實 loopback 預覽 64066 顯示手機／案例兩處局部新增、了解多類型遊戲整段新增、善用局部刪除、主動溝通風險整段刪除，共 3 修改＋1 新增＋1 刪除卡；simple 模式卡保留、正文黑字且刪文隱藏，無 pageerror。截圖 /tmp/edoc-complete-rail-all.png、/tmp/edoc-complete-rail-simple.png 已檢視。測試瀏覽器已關閉，64066/PID35486/session71702 預覽保留供手動驗收；64060～64065 及既有假資料全部保留，64065 仍為上一輪凍結 bundle。

全套並行第一次 297 passed／2 既有 skipped／1 failed（重啟立即期待 saved，收到 writing），單獨同一案例重跑 3 次通過；第二次並行另一次備份恢復立即期待 saved，亦收到 writing。保留兩次證據於 /tmp/edoc-rail-full.log、/tmp/edoc-rail-full-final.log；未更動後端或放寬 assertions。序列完整驗證 295 passed／2 既有 skipped／3 failed，run 耗時 28.8m，失敗為 Worker beforeEach、瀏覽器 page setup、WebKit undo/redo 逾時，未將主機延遲原因視為已證實。其殘留的孤兒 Wrangler 精確以本次 runtime group39375 終止，使用者 Chrome 與各 preview 不受影響。

最終重查 markup.spec、suggestions.spec、publication-recovery.spec（2 workers）共 101 passed（38.5s），涵蓋三次全套失敗的所有案例；記錄 /tmp/edoc-rail-recheck.log。完整 suite 不能宣告全綠，重啟 writing 時序仍屬發布前須確認的驗收穩定性限制；本輪右欄文字修訂驗證已完成。

build 與 diffcheck 通過；沒有 Commit、Push、部署、建立雲端資源或呼叫付費 AI。正式 document.json、歷史版本、生產 binding/CI/engineVersion、原 checkout 皆未更動。
