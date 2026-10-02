# 任務9：本機驗收

26/10/01。隔離 worktree /Users/hsiehkailin/.codex/worktrees/revision-suggestions/EDoc；BASE 4f7c2e807cedf70effff962153b5d230293596d9。沒有 Commit、Push、部署、建立雲端資源或呼叫付費AI。正式 document.json、歷史版本、生產 wrangler、CI 與 engineVersion 未變更。

## 修改

私人建議顯示「修訂建議・唯讀」，採納預覽顯示「採納預覽・尚未發布」，正式文件仍顯示「正式版・唯讀」。切入／返回預覽會同步標籤。Chromium/WebKit 測試驗證正式→建議→預覽→返回與部分發布；先重現原標籤失敗再修正通過。

新增真實本機 workerd/SQLite 備份副本還原演練、公開輸出私密字串隔離驗證、改名停用與封存後歷程驗證。備份測試記錄停止runtime時GitHub尚未寫入的快照，GitHub發布後還原私人快照，再依 publicationId 完成核對，仍只有一份正式新版、一個 saved 事件，三項發布與兩項不採納都留存。測試備份於結束清除。

## 規格§13對照

測試 fixture 使用 v0.7→v0.8，與規格範例 v1.0→v1.1 同一流程；不是更動正式QA文件。

| 案例 | 本機結果 | 證據 |
|---|---|---|
| 1 送5項不加正式版 | 通過 | suggestions-api submission、suggestions submit/menu/PDF |
| 2 採3拒2只出1版 | 通過 | publication-recovery five_three_two；suggestions five proposals |
| 3 採3待2後重比較 | 通過 | pending_rebase_after_partial、UI three adopted two pending |
| 4 全拒／無異動 | 通過 | suggestions-api all declined、UI zero changes |
| 5 無權直接API拒絕／有權具名 | 通過 | collaboration-api legacy_editor、suggestions unknown IDs/self adoption、separate publisher |
| 6 即時權限與保草稿 | 通過 | collaboration-api revocation、sharing-permissions、UI recompare capability loss |
| 7 改決定留前事件／發布鎖定 | 通過 | suggestions-api batch_decision；publication concurrent locked decisions |
| 8 改名停用封存保原署名 | 通過 | suggestions-api renamed revoked author and archived document |
| 9 基準／並行／預覽過時 | 通過 | old_base、decision_changed_after_preview、formal base advance/concurrent publication |
| 10 重試／中斷／還原 | 通過 | same_request_replay、response_lost、runtime restart、isolated private backup |
| 11 公開私密邊界 | 通過（本機） | unique PRIVATE_REJECT/COMMENT/token canary不在fake repo JSON/建置HTML/PDF來源；實際生成A4 PDF；匿名API401、公開頁不取私人資料。PDF使用相同已核對DOM生成，未另做二進位抽字；未核對真實雲端artifact |
| 12 正式卡精簡／統計獨立 | 通過 | 既有版本卡/摘要測試，預覽引擎統計與採納數分列 |
| 13 最終內容摘要／AI不作決定 | 部分驗證 | changelog packet只含採納後的正式差異，aiSummary=null保留待補提示；現有摘要雜湊測試通過。未啟用付費AI，未驗證真實AI生成 |
| 14 桌面窄屏定位／預覽相符 | 通過 | Chromium/WebKit Word rail、narrow withdraw/readability、partial preview vs formal HTML |

## 命令與限制

全套 npm test：241 passed、2 pre-existing skipped（24.3s）。第一次新增artifact測試於about:blank缺少安全來源造成hash未初始化；改為先導向loopback後通過。曾重疊啟動測試造成trace輸出路徑碰撞，最後全套依序重跑通過。

後端 npm run test:collaboration：36 passed（28.9s）；npm run build成功、npm run pdf成功產出16份正式歷史PDF、git diff --check通過。獨立審查指出私人快照還原可能復活已撤權token，操作文件已補還原期間封鎖一般私人存取、保存外部最新權限證據、恢復撤權後才開放授權唯讀；現行應用沒有自動恢復快照之後權限的功能。運作準備見 ../operations/revision-suggestions.md。私人事故停止開關、雲端備份／PITR操作入口、未來schema升級實作、Linux CI及帳戶方案／配額驗證仍屬後續；不可把本機通過當已可公開部署。關閉修訂建議會恢復直接版本更新，不是事故停發功能。

審查Minor亦已補強：快照之後新增私人sentinel，還原後確認消失，再核對正式發布；若restore為no-op會失敗。最後此測試1 passed（3.6s）。本機預覽於同一64060埠重啟（資料重置），實際瀏覽器確認新私人狀態文字。保留預覽服務供使用者檢視。
