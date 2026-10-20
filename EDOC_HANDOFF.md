# EDoc 專案交接文件

> 對象：Claude Code  
> 狀態：產品規格已初步定型，現有 Prototype 可運作；下一階段請接手工程化、測試、GitHub Pages 發布與後續維護。  
> SSOT 方向：GitHub Repository。  
> 公開展示：GitHub Pages。  
> 目前示範文件：`【QA】資深遊戲測試工程師`。

---

## 2026-10-21 參考 Mac Pages 的新功能（Engine R2.18，Vic 確認頁 v01 5 項通過）

- 章節目錄（`src/ui/sections.js`）：標頭版本選單旁「章節 ▾」，列出標題 2（標題 3 縮排），打開時反白目前讀到的那一節，點一下捲過去；桌面、手機同一個選單，沒有標題 2 的文件不顯示。修訂中也能用（跟著草稿更新）；紅色刪除文字裡的標題不列入。不做側欄：桌面右側是修訂對照，1280 寬左邊只剩約 100px。
- 章節連結：選單每列與桌面閱讀時滑過標題出現的 🔗 複製 `<頁面>#sec=<章節名稱>`（去掉【】；同名加 -2、-3）。打開時捲到該節並淡黃標示約 2 秒（頁面上的覆蓋層，文件內容不動）；找不到時顯示「找不到「X」這一節」。連結開最新版本，與 `#edit=` 編輯連結互不影響。
- PDF 書籤：`page.pdf({ outline: true, tagged: true })`（Chromium 要有無障礙標記才產生書籤），書籤＝標題＋各章節；檔案約大 13%。所有 PDF 下次部署時重產，內容與 SHA-256 不變。已知：標題在 PDF 裡換行處的英文空白，書籤文字會黏在一起（Chromium 行為，aria-label 也改不了）。Word 檔本來就用標題樣式，不用改。
- 以這版內容修訂（還原舊版本）：看歷史版本時版本卡上的按鈕（只有能直接發布的人；修訂建議模式不提供）。確認後開草稿，內容與文件格式＝那一版，跟最新版比較；摘要開頭「還原 vX：」、詳細變更「還原自：vX」、草稿面板顯示「還原自 vX」。有未完成的草稿時先問（可下載備份）。歷史版本不動。
- 順手：在草稿裡打字後馬上切去看別的版本，草稿會立刻存進瀏覽器（原本要等 0.6 秒）。
- 這版不改 Worker。

---

## 2026-10-20 Word 基本文書功能第二期（Engine R2.17，Vic 確認頁 v01 8 項＋v02 2 項通過）

- 文件格式（B1，`src/engine/layout.js`、`src/ui/layout-panel.js`）：整份文件一個設定＝預設字型、內文字級、行距（1.0／1.15／1.5／1.7 預設／2.0）、段落間距（緊／標準／寬）、首行縮排（無／2 字）。工具列最右「文件格式」面板，按「套用」才生效，跟草稿一起暫存、一起發布。每個版本把它存成 `layout`（只存與預設不同的欄位；全預設就沒有這個欄位＝R2.16 以前的外觀）。網頁、PDF 用同一支 `layoutCss()`，Word 檔對應到 docDefaults（行距用「最少」＝PDF 行高，所以 1.0／1.15 在 Word 會是 Word 自己的單行高度）。版本差異與摘要寫「文件格式：行距 1.7→1.5」，只改格式也能發布；版本卡統計多「文件格式變更」。SHA-256＝`cleanSnapshot(html)`＋`\n<edoc-layout k=v;…>`（沒有 layout 時不加，舊版本雜湊不變）。Worker `validateVersion` 只收正規化後的值（非物件 400），修訂建議發布沿用基準版的 layout，複製文件沿用來源版本的 layout。修訂建議模式不能改文件格式（按鈕停用）。不做逐段行距／首行縮排：WebKit 在清單項目上復原逐段樣式會刪掉整個清單（試做實測）。已知限制：文件預設字型改成宋體後，工具列選「思源黑體」不會寫進內容（內容模型不存預設字型）。
- 完整字級（B2）：Word 的 8～72。7 個舊級距仍走瀏覽器 fontSize，其餘一段一段 insertHTML（`wrapSelection`，每段一步復原）。
- 上標／下標按鈕（⌘= ／⇧⌘=）與分頁符號（B4）：`<hr data-edoc-break="page">`，網頁顯示虛線「分頁（PDF 從這裡換新頁）」、PDF `break-after:page`、Word `w:br type=page`；新增／刪除分頁算一處。分頁、分隔線、表格一律插在「目前段落、清單或表格」之後（瀏覽器會把放在區塊之間的游標移進下一個清單項目，所以改放段落結尾或下一段開頭；都沒有時先補一個空段落，空段落不算內容）。
- 表格（B3，`src/ui/table-tools.js`）：「插入 ▾」選列×欄（最多 6×6，第一列是表頭）；游標在表格內時上方出現小工具列（上方／下方加列、左方／右方加欄、刪除列／欄／表格），Tab／⇧Tab 換格、最後一格 Tab 加一列。每次改動用一次 insertHTML 換掉整張表（一步復原）；選取範圍延伸到下一個段落、中間的分隔線與清單原樣重插（否則 Chromium／WebKit 會吃掉表格後的分隔線或把表格塞進後面的清單）。匯入的合併儲存格保留，加列／欄會延伸合併、刪除會縮小。網頁、PDF、Word 同一套框線：滿版等寬欄、0.6pt 灰框、3pt×5pt 內距、表頭灰底粗體；Word 表頭列每頁重複。表格內停用清單按鈕；修訂標記的左側紅線在儲存格內畫，不蓋掉框線。
- 尋找與取代（B5，`src/ui/find-replace.js`）：放大鏡或 ⇧⌘H（Windows Ctrl+H）開面板（桌面在右上、寬 440px；手機從底部拉起約六成）。全部符合標黃、目前這筆標橘；上一筆／下一筆／取代／全部取代橫排；下方「搜尋結果總覽」列出每筆的章節與前後約 14 字，點一筆文件捲到該處。不分英文大小寫；紅色刪除文字不會被找到。取代是原生打字（一筆一步復原），照常標成修改；全部取代從最後一筆往前做。
- 格式刷（B7，`src/ui/format-painter.js`）：複製游標所在文字的粗斜底刪、上下標、色彩、螢光、字型、字級（不含段落樣式與對齊），選取後放開滑鼠／手指套用；按一下用一次，按兩下連續套用到 Esc。
- Word 匯入保留格式（B8，`src/engine/docx.js`）：底線、刪除線、上下標、色盤色、螢光、字型（對應 5 款）、清單內字級、對齊、標題 3。Word 檔的內文字型與字級（字數最多的那組）改用文件預設；黑色視為自動。轉換結果列出保留了哪些格式、哪些顏色／字型／字級沒保留。PDF 匯入不變。
- 修正 R2.16 的漏洞：整段已是粗體的字再改顏色，瀏覽器把顏色寫在 `<b style>` 上，內容模型會丟掉；現在移到內層 span（既有 19 版內容不變，stored-content 測試通過）。
- 手機：上下標、格式刷、插入、尋找取代、文件格式收進底部列「⋯」面板。
- 不做：字數統計（B6，Vic 同意）、ODF（B9）。WebKit 原生復原會把「腳本指令＋緊接著打的字」合成一步（表格、格式同理），一次復原可能退得比 Chromium 多，但一定退到完整的先前狀態、重做可回來（測試鎖住）。

---

## 2026-10-20 Word 基本文書功能第一期（Engine R2.16，Vic 確認頁 8 項全部通過）

- 修訂中才出現的格式工具列（`src/ui/toolbar.js`）：復原／重做、段落樣式（內文／標題 1–3，新增 h3）、字型 5 款、字級 7 級、粗體／斜體／底線／刪除線、文字色彩、螢光筆、清除格式、四種對齊、項目符號／編號、清單內 Tab／⇧Tab 縮排、連結（⌘K）。桌面在標頭第三列，手機在畫面底部＋「Aa」面板。全部用瀏覽器原生編輯指令（保留原生復原），指令前先清掉比較片段。
- 格式資料模型（`src/engine/content-model.js`）：語意標籤（strong/b、em/i、u、s、sup、sub）＋只在 span 上的受限樣式（色盤色、螢光色、5 款字型、7 級 pt 字級）與段落的 text-align。值只能來自封閉清單、由清單重寫輸出，`url()`、`!important`、定位等一律擋下；class 只留修訂標記。網頁與 Worker（linkedom）共用同一支，輸出逐位元相同（linkedom 會把新增屬性排在前面，引擎寫多個屬性時一律用 `sortAttributes`）。
- 格式感知 diff：base 與草稿先過同一套清洗（修掉 ⌘U 底線存進去後下一版仍是藍的 bug）；字相同時再比格式，只把格式不同的字包 `span.format-changed[data-edoc-fmt]`；對齊、段落樣式、清單類型與縮排在段落本身標 `format-changed`，標題↔段落可配對，不再顯示成刪一段＋加一段。統計多「N 處格式變更」，只改格式也能發布。既有版本的雜湊、golden 輸出與 19 個既有版本的 clean／顯示／trusted 內容全部不變（`tests/stored-content.spec.js` 鎖住）。
- 修訂標記：新增＝藍字雙底線、刪除＝紅字粗刪除線、只改格式＝原色＋藍色虛線底線。
- 字型：網站自帶 @fontsource 開源字型（OFL，版本鎖定）：思源黑體（文件預設）、思源宋體、霞鶩文楷、Arimo、Tinos。`npm run build` 產生 `fonts/`（不進版控，CI 組站時複製），依字切片、頁面只下載用到的字；文件頁以 `../../fonts/fonts.css` 載入。這是「單一自足 HTML」規則的唯一例外（Vic 2026-10-19 同意）。
- 共用字級表（`src/engine/typography.js`）：內文 12pt、標題 1／2／3＝20／15／13pt，螢幕與 PDF 相同；`.doc` 左右邊界 20mm＝PDF，換行位置一致。所有歷史版本 PDF 下次部署時改用新排版（內容與雜湊不變，Vic 同意）。PDF 內文用同一套字型（測試檢查內嵌 NotoSansTC）。
- 貼上（`normalizePastedHtml`）：Word／Google 文件的粗斜底刪、色盤色、字級、對齊保留，常見字型對應（Arial→Arimo、Times New Roman→Tinos、新細明體→思源宋體、標楷體→霞鶩文楷），其餘丟掉；從 EDoc 本身複製的修訂標記與刪除文字不帶入。⌘⇧V 貼成純文字。複製全文保留格式。
- Worker：舊發布路徑與新增文件在存檔前跑同一支清洗並回傳實際存入的 html，網頁直接採用。部署順序照舊：先 Worker 再 Pages。
- 輸出格式（Vic v02 確認頁 E1–E3 通過）：標頭「下載 PDF」改為「下載 ▾」選單＝PDF（正式版）／Word（.docx）／圖片（PNG）。部署時 `npm run pdf` 每版同時產生 `documents/<slug>/export/<v>.docx` 與 PNG（從正式 PDF 以 poppler `pdftoppm` 150 dpi 逐頁轉出；一頁＝`<v>.png`，多頁＝`<v>.zip`，網頁先 HEAD `.png` 再退 `.zip`）。Word 由 `scripts/lib/docx-export.mjs` 自己寫 OOXML（`scripts/lib/zip.mjs`，固定時間戳、同內容同位元組）：乾淨正文不含修訂標記、標題 1–3、清單編號、對齊、粗斜底刪上下標、色彩、螢光、字型、字級、連結、表格；頁尾「版本｜SHA-256 前後 8 碼｜正式版以 PDF 為準」；fontTable 註明每款字型類型與常見替代字型。CI 兩個 job 都安裝 poppler-utils，組站複製 `export/`。改過的 Word 檔只能用文件庫「上傳 Word」建立新文件。Word 換行、分頁由 Word 自己排；對方沒裝思源字型時換字（macOS Quick Look 實測換成襯線字；Microsoft Word 未實測）。
- 未做（移第二期）：行距、首行縮排、完整字級清單——需要 EDoc 自管復原（S2），本期不做；WebKit（Safari）原生復原會把「打字＋緊接的格式指令」合成一步，這是瀏覽器行為。刪除文字保留原格式也未做（只影響刪除線文字是否顯示粗體，避免改動既有 golden 輸出）。

---

## 2026-10-19 新增文件可上傳 PDF（Engine R2.15，Vic 拍板 P1）

- 文件庫「新增文件」的「上傳 Word」改為「上傳 Word／PDF」一個分頁：拖進 .docx 或 .pdf，依副檔名自動轉換，先顯示轉換結果與預覽，按「建立文件」才成為 v0.1。v0.1 記錄「建立方式：上傳 PDF（檔名）」。
- 只保存轉換後的可編輯內容；原始 PDF 不上傳、不保存（repo 公開，Vic 選定）。
- PDF 轉換（`src/engine/pdf.js`）用 pdf.js（`pdfjs-dist`，固定版本），以文字形式包進文件庫頁、第一次轉換才啟動，文件庫首頁因此約 1.8 MB（壓縮傳輸約 0.5 MB）。依字級判斷標題、文字或繪製的項目符號與「1.」判斷條列、字型名稱判斷粗體斜體、換行接回同段、去除重複的頁首頁尾與頁碼。
- 表格、多欄排版、圖片不還原；沒有文字層的掃描檔直接擋下，請先 OCR。Worker 新增 `pdf` 建立方式，需先部署 Worker 再部署 Pages。

---

## 2026-10-02 修訂建議正式上線（Engine R2.14）

本節優先於下方舊版說明。

- 新增可逐項採納／不採納的「修訂建議」，部分採納後由具發布權限者確認發布；未採納、待討論、備註及具名歷程保留。
- 私人資料存入 Cloudflare SQLite Durable Object `COLLABORATION` / `CollaborationHub`；正式文件與歷史仍是 GitHub `document.json`，公開 HTML/PDF 不含私人提案紀錄。
- 文件的「分享權限」可啟用修訂建議；預設保持原直接更新模式，啟用後既有一般編輯者只能提出建議，主控者保留管理／採納／發布權限。可事後調整、停用或輪替具名連結。
- 所有標記在正文顯示紅色刪除線／藍色底線；簡單標記顯示黑字與側邊紅線。左右編號可雙向定位，編號顯示採納狀態；已決定的卡片自動收合，備註可獨立收合。
- 切換標記清除修訂選取；返回正式版先確認且不刪除建議；完整歷程可開關；輸入後即時還原比較片段以減少跳行。
- AI 自動摘要仍未啟用，不呼叫付費 AI。Codex 更新正式文件仍遵守 AGENTS.md 的完整差異與摘要規則。
- 部署順序：先 Worker 與 SQLite migration，再 Pages。不得直接回退到無協作資料庫的舊 Worker，避免繞過啟用中的權限。維運細節見 `docs/operations/revision-suggestions.md`。

---

## 0. 2026-09-24 方向調整（Engine R2.7，Vic 拍板）

本節優先於下方原文；原文保留作為歷史脈絡。

- **編輯改在公開網址上進行**：持有「編輯連結」（名字綁在連結上）的人可以在網頁上修訂並發布新版本；新版本由 Cloudflare Worker 直接寫進 GitHub 的 `document.json`，CI 自動重新部署。一般網址只能看。通知對方用 LINE 等外部管道，系統不發通知。
- **取消離線修改與檔案往返**：拿掉「匯出審閱版」「匯出修訂包」「匯入修訂」「列印」與編輯者設定。第 5 節的外部審閱流程、第 7 節的編輯者設定、第 10 節對應功能已被取代。
- **正式交付改為系統產生的 A4 PDF**：每個版本一份，頁尾附 SHA-256 與公開網址，最後一頁附驗證資訊；不等同電子簽章（第 6 節仍適用）。
- **介面**：白底 A4 紙張；標頭分為名稱、閱讀區（版本選單、顯示變更）、編輯區（有權限才出現：狀態、開始修訂、完成修訂-版本更新、放棄修訂）、分享區（複製公開網址、複製全文、下載 PDF）。引擎版號移到頁尾；拿掉 Published 標記。
- **第 8.2、11 節**：「公開網頁不能直接寫回 GitHub」已由 Worker 解決；權杖只存在 Worker，網頁內仍不放任何金鑰。第 12 節 Phase 1～5 皆已完成。

### 0.1 2026-09-29 多文件文件庫（Engine R2.8，Vic 拍板 K1＋C1＋U1）

- **EDoc 是多份文件的系統**：文件庫首頁列出所有公開文件（名稱、目前版本、最後更新日期與編輯者），可搜尋；文件頁左上角有「← 文件庫」。
- **管理員連結**：Vic 在終端機產生一次（`npm run edit-link -- new --name Vic --admin`）；用它打開文件庫才出現管理功能。**只有管理員能新增文件**（C1）。
- **新增文件四種方式**：空白、複製現有文件（最新版內容，不帶歷史）、貼上文字、上傳 Word（.docx，在瀏覽器內轉換、檔案不上傳；R2.15 起同一分頁也收 PDF）。新文件網址由系統自動產生 `documents/d-xxxx/`（U1），改名只改名稱、不產生新版本、網址不變。
- **刪除＝封存、可還原**：封存後文件庫隱藏，公開網址改顯示「此文件已封存」（K1），所有版本保留；網頁上不提供永久刪除。repo 是公開的，封存或刪除後內容仍在 git 歷史，機密內容不要放進 EDoc。
- **編輯連結改在網頁上發**：文件庫「分享」可產生（只顯示一次，GitHub 只存雜湊）與停用每份文件的編輯連結；管理員連結只能在終端機停用。

---

### 0.2 2026-09-30 Word 式修訂顯示（R2.9）

- Vic 選定 Word 式正文＋修訂側欄。所有標記：新增字藍色底線、刪除內容移至右側卡片；簡單標記：正文使用正常色、保留頁邊紅線。窄螢幕將修訂欄置於正文下方。
- Draft 與正式版共用 snapshot 差異結果；Draft 用 CSS Highlight API 標示新增範圍，不替換編輯中的文字節點，避免干擾游標與輸入法。
- 版本 JSON、雜湊與正式比對算法不變；不增加逐字作者、接受／拒絕修訂等未實作能力。
- 刪除卡片顯示所屬章節，點選可跳至附近正文；複製及列印仍輸出乾淨內容。

## 1. 專案目的

EDoc = **Editable Document**。

用途是處理需要反覆修訂、多人審閱、但又必須維持內容一致性與版本可追溯的文件，例如：

- 合約、法務文件
- JD
- GDD
- 規格書
- 制度文件
- 提案
- 其他需多輪 Review 的文件

核心不是做另一個 Google Docs，而是提供一個：

> **可公開分享、可離線攜帶、可建立修訂、可保留版本差異、可追溯每版變更的輕量文件系統。**

---

## 2. 核心產品原則（不可破壞）

### 2.1 正式版本永遠唯讀

正式版本如 `v0.7`、`v0.8` 一旦建立，即視為 Snapshot。

- 不允許直接修改正式版本。
- 修改必須先進入 Draft / Revision。
- 歷史版本只能查看。
- Current 是最新版正式版本，不代表可以直接編輯。

### 2.2 Zero-input Revision

使用者按：

`開始修訂`

就應直接進入 Draft。

**不可要求使用者先填：**

- 修訂者
- 角色
- 修訂摘要

理由：這些前置欄位會提高摩擦，最後使用者會乾脆不改。

### 2.3 人只負責改內容

以下資訊由系統負責：

- Base Version
- 新版本號
- Diff
- 新增／刪除／修改統計
- Changelog
- 建立時間
- SHA-256
- Conflict 判斷

「編輯者」為**選填**，可存在 localStorage，且不影響開始修訂。

### 2.4 Diff 必須是真正的差異

這是目前最重要的品質要求。

版本 `vN` 顯示的 Diff 永遠是：

`vN vs vN-1`

規則：

- 白色：前一版已存在且本版未修改
- 藍色底線：本版新增／格式變更
- 右側刪除線卡片：本版刪除（R2.9 起；舊版曾在正文用紅色刪除線）
- 上一版的藍字到了下一版，若未再次修改，必須恢復白色
- 切回歷史版時，要重新看到「當時那一版相較前一版」的新增／刪除 Diff

**禁止出現：只改數個字，建立新版本後整份文件全部變藍。**

此 Bug 曾發生過，原因是程式載入整份 DOM 時被 MutationObserver 誤判成使用者修改。

目前 Prototype 的修正方向是：

1. 系統載入 DOM 時暫停 observer。
2. Draft 編輯時可做即時提示。
3. **建立正式版本時，再重新用 Base Version 與 Draft 做一次正式 Diff。**
4. 正式版本使用重新計算的 Diff，不信任 Draft 過程中的暫時標記。

### 2.5 文件版本與 EDoc Engine 版本分離

未來請正式拆分：

- `documentVersion`：例如 `v0.7`、`v0.8`
- `engineVersion`：例如 `R2.2`

單純修改 EDoc UI、Diff engine、Toolbar、發布能力：

**不可因此提升文件內容版本。**

只有文件正文發生正式修改才增加 `documentVersion`。

---

## 3. 版本系統

### 3.1 從 v0.1 開始

第一份正式文件為：

`v0.1`

v0.1 沒有前一版，因此：

- 全文正常顯示
- 不顯示 Diff

之後：

- v0.2 對 v0.1
- v0.3 對 v0.2
- …
- v1.0 對前一版

### 3.2 每版需要保存

每個正式版本至少保存：

```js
{
  summary,
  details,
  previous,
  html,
  hash,
  aiSummary
}
```

目前 Prototype 使用內嵌 JSON。

### 3.3 Version Menu

Toolbar 要有版本清單。

每一項至少顯示：

- 版本號
- Current（若為最新版）
- 一行摘要

選取版本後，正文上方顯示：

- `vX.X｜版本摘要`
- 比較基準
- Current / 歷史版唯讀
- SHA-256
- 詳細 Changelog

---

## 4. 版本摘要策略

### 4.1 機械式摘要：本機自動完成

HTML / JS 本身先依 Diff 產生：

- 哪些章節被修改
- 修改幾處
- 新增幾處
- 刪除幾處
- 新增／刪除約多少字

例如：

> 需求條件 2 處修改；加分項目 1 處刪除

### 4.2 AI 語意摘要：由 AI 後補

離線 HTML 不自行呼叫 AI API。

回到 ChatGPT / Claude Code / 其他 AI 環境時，再依完整 Diff 產生語意摘要，例如：

> 強化 Bug 分級能力要求，並精簡 WebSocket 相關加分條件。

不要求一般使用者自己寫摘要。

---

## 5. 修訂流程

### 5.1 本機修訂

```text
v0.7 Current（唯讀）
        ↓
    開始修訂
        ↓
Draft · Base v0.7
        ↓
     編輯內容
        ↓
   建立新版本
        ↓
系統重新正式 Diff
        ↓
v0.8 Current（唯讀）
```

若沒有實際變更：

- 不建立新版本。

### 5.2 外部審閱

公開／匯出的 EDoc 可交給：

- 客戶
- 法務
- 組員
- PM
- 其他審閱者

對方：

1. 開啟 EDoc
2. 按「開始修訂」
3. 修改
4. 匯出 Revision 或審閱版 HTML
5. 回傳

### 5.3 匯入修訂

Revision 應保存：

```js
{
  documentId,
  baseVersion,
  baseHash,
  author,
  createdAt,
  status,
  html
}
```

匯入時檢查：

- `documentId`
- `baseVersion`
- `baseHash`

如果對方基於舊版本修改：

例如：

- 對方 Base = v1.2
- Current = v1.4

必須提示 Conflict。

**不可直接覆蓋最新版。**

---

## 6. Hash / 完整性

目前使用 SHA-256。

用途：

- 確認 Revision 的 Base Snapshot 是否與目前資料一致
- 協助偵測版本內容被意外修改
- Conflict 判斷

注意：

> SHA-256 在此是版本完整性輔助，不是法律上的電子簽署或不可否認性。

正式合約簽署仍需外部電子簽署／文件管理方案。

---

## 7. 編輯者身份

「編輯者」是選填。

Prototype：

- 點 Toolbar 的 `編輯者：未設定`
- 使用自製 Dialog
- 儲存在 localStorage
- 不使用瀏覽器原生 `prompt()`，因為 ChatGPT 內嵌預覽曾阻擋 prompt

規則：

- 未設定身份仍可修訂
- 不得阻止使用者編輯
- 未設定時記為 `未設定` 或 `Anonymous`

---

## 8. 公開發布：GitHub Pages

已決定主要方向：

> **GitHub Repo = SSOT**
>
> **GitHub Pages = 公開網址**

不以 ChatGPT Sites 作為主要 SSOT。

### 8.1 目前建議 Repo

Owner：

`vichsieh9-beep`

建議 Repo：

`edoc`

預期公開網址：

```text
https://vichsieh9-beep.github.io/edoc/
```

QA 文件：

```text
https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/
```

目前 GitHub connector 只能看到既有：

`vichsieh9-beep/miro-align-tool`

尚未建立 `edoc` Repo。

### 8.2 Publish UI

文件以 `file://` 開啟：

- 顯示 `Local`
- 「複製公開網址」disabled

在 `http://` / `https://`：

- 顯示 `Published`
- 啟用「複製公開網址」
- 複製 `location.href`

---

## 9. GitHub Pages 目前網站結構

目前 Prototype Bundle：

```text
/
├── index.html
├── .nojekyll
├── README.md
├── .github/
│   └── workflows/
│       └── pages.yml
└── documents/
    └── qa-senior-game-qa/
        └── index.html
```

首頁 `index.html` 是 EDoc Library。

每份文件使用：

```text
/documents/<document-id>/index.html
```

---

## 10. 現有 Prototype 功能

目前 QA EDoc 已具備：

- 深色單頁 UI
- Current / 歷史版本
- Version Menu
- 每版摘要
- 詳細 Changelog
- 藍色新增／修改
- 紅色刪除線
- 顯示變更 / 乾淨版
- 正式版唯讀
- Zero-input「開始修訂」
- Draft
- 選填編輯者
- localStorage 編輯者保存
- 建立新版本
- SHA-256
- Revision Export
- Revision Import
- Review HTML Export
- Base Version Conflict
- GitHub Pages Published / Local 判斷
- 複製公開網址
- 列印 / PDF
- 複製全文

---

## 11. 已知問題 / 技術債

### P0：Diff correctness

這是第一優先。

需要 Automated Tests 驗證：

1. 只刪 2 個中文字，只有那 2 個字紅色刪除線。
2. 只加 2 個字，只有新增文字藍色。
3. 修改一句話，不可整份文件變藍。
4. 修改一個 list item，不影響其他 list item。
5. 新增整個 list item，只新 item 藍色。
6. 刪除整個 list item，原 item 紅色刪除線。
7. v0.8 的藍字到了 v0.9 若沒再改，要恢復白色。
8. 切回 v0.8 時，仍能看到 v0.8 vs v0.7 的 Diff。
9. 系統 `innerHTML` 載入、切換版本，不得觸發 change tracking。

建議用 Playwright 建 smoke / regression tests。

### P0：DOM Diff 邊界

目前 Prototype 是：

- Block ID
- Token LCS
- MutationObserver
- 建立正式版時重新 Formal Diff

需要補測：

- Nested `<ul>`
- `<strong>` / inline formatting
- 表格
- 圖片
- Heading reorder
- Copy / paste 多段內容
- Safari `contenteditable`
- Chrome
- Edge

### P1：單檔 Prototype 太大

目前所有：

- CSS
- UI
- Version data
- Diff engine
- Revision engine
- Publish logic

都塞在同一份 HTML。

建議 Source Code 工程化：

```text
src/
├── engine/
│   ├── diff.js
│   ├── revision.js
│   ├── version.js
│   ├── hash.js
│   └── publish.js
├── ui/
│   ├── toolbar.js
│   ├── version-menu.js
│   └── styles.css
├── templates/
└── build/
```

但 Build Output 仍可產生：

> **單一 self-contained HTML**

因為「單檔可攜」仍是 EDoc 的重要需求。

### P1：AI Summary

目前只留 placeholder：

`語意摘要：待回到 ChatGPT 後依完整 Diff 自動補充`

後續可設計：

- CLI command 產 summary
- Claude Code / ChatGPT 讀 Git diff 後回寫 `aiSummary`
- 不要把 API key 放進公開 HTML

### P1：公開網頁不能直接寫回 GitHub

GitHub Pages 是 Static Site。

公開使用者在瀏覽器修改後，目前應：

- Export Revision
- 回傳
- Maintainer Import

如果未來要做：

`提交修訂`

則需要：

- Backend / Serverless Function
- GitHub OAuth / GitHub App
- 或建立 PR 的安全流程

**禁止把 GitHub PAT/token 放在前端 HTML。**

---

## 12. 下一階段建議執行順序

### Phase 1 — GitHub Pages 上線

1. 建立 Public Repo：`vichsieh9-beep/edoc`
2. 將目前 `edoc-site` Bundle push 到 `main`
3. GitHub Pages Source 設成 GitHub Actions
4. 確認 Actions deploy 成功
5. 驗證：
   - Library URL
   - QA document URL
   - Published badge
   - Copy public URL

### Phase 2 — Regression Tests

先不要大 refactor。

先為目前 Prototype 建 Playwright tests，至少覆蓋第 11 節 P0 cases。

**先鎖住行為，再重構。**

### Phase 3 — Engine Refactor

將單檔拆成 source modules。

要求：

- Source 可維護
- Build 後仍可輸出 self-contained HTML
- 現有 Regression tests 全過

### Phase 4 — AI Changelog

讓 Claude Code / ChatGPT：

1. 讀 Base / Current Diff
2. 產生一行 AI Summary
3. 產生 detailed semantic changelog
4. 回寫版本資料

### Phase 5 — 外部 Submit Revision（選配）

若真的有高頻外部協作需求，再評估：

- GitHub App
- Cloudflare Worker
- Serverless endpoint
- PR workflow

現在不需要先做。

---

## 13. 文件內容：QA JD 的目前產品意圖

此 EDoc Prototype 目前載的是 QA JD。

職稱：

> **資深遊戲測試工程師 (Senior Game QA Engineer)**

核心能力優先順序：

> **邏輯分析 > 系統／遊戲架構理解 > Test Case 設計**

重要方向：

- iGaming
- Mini Game / Special Game
- Slot
- 骰寶
- 視訊類遊戲
- 後台與第三方串接
- Log 判讀
- DevTools
- API / JSON
- 生成式 AI 協作
- Bug Severity / Priority 分級與風險判斷

不要重新加入：

- 預設 Lead
- 未來帶 1–2 人承諾
- Manager 經驗門檻

原因：

- 團隊是否擴編未定
- 不希望縮小人才池
- 不希望用空頭職涯承諾吸引候選人
- 現階段找的是資深 Individual Contributor

生成式 AI 要求：

> 不只是「會用 ChatGPT」，而是能把生成式 AI 納入 QA Workflow，例如需求理解、Test Case / Edge Case、測試資料、Log 分析、Automation、Regression。

Bug 分級：

> 不只是會套 Severity 表，而是能依影響範圍、發生頻率、核心流程、玩家體驗、資料正確性、上線風險等條件判斷 Severity / Priority，並理解不同產品需要不同分級標準，可檢視與優化制度。

---

## 14. Claude Code 接手時的第一個任務

請先：

1. 建立／確認 GitHub Repo `vichsieh9-beep/edoc`
2. 將目前 site bundle 放入 repo
3. 部署 GitHub Pages
4. 不改 UX，先確保功能 parity
5. 建立 Playwright Regression Test
6. 重現並保護以下案例：

> Base v0.7 → Start Revision → 刪除 2~3 個字 → 建立 v0.8  
> 預期：只有被刪除的文字顯示紅色刪除線，其餘全文白色。

7. 測試通過後，再開始模組化 EDoc Engine。

---

## 15. Engineering Rule

如果產品規格與目前 Prototype 實作衝突：

> **以本文件的產品規則為準。**

如果不確定 UX，不要自行增加表單或步驟。

EDoc 的核心原則是：

> **人只負責改內容；系統負責版本管理。**
