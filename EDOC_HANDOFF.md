# EDoc 專案交接文件

> 對象：Claude Code  
> 狀態：產品規格已初步定型，現有 Prototype 可運作；下一階段請接手工程化、測試、GitHub Pages 發布與後續維護。  
> SSOT 方向：GitHub Repository。  
> 公開展示：GitHub Pages。  
> 目前示範文件：`【QA】資深遊戲測試工程師`。

---

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
- 藍色：本版新增／修改
- 紅色刪除線：本版刪除
- 上一版的藍字到了下一版，若未再次修改，必須恢復白色
- 切回歷史版時，要重新看到「當時那一版相較前一版」的藍／紅 Diff

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

