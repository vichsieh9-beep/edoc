const IDS=['doc','versionButton','versionLabel','versionMenu','versionControl','versionCard','cardTitle','compareBadge',
  'statusBadge','cardSummary','detailList','versionHash','toggleChanges','editState','newRevisionBtn','editorBtn',
  'editorBackdrop','editorNameInput','clearEditorBtn','cancelEditorBtn','saveEditorBtn','publishStatus','shareUrlBtn',
  'copyBtn','exportReviewBtn','exportRevisionBtn','importRevisionBtn','importFile','acceptRevisionBtn','printBtn',
  'revisionPanel','revisionTitle','revisionBase','revisionStatus','revisionSummary','revisionMeta','revisionHash'];

export const el=Object.fromEntries(IDS.map(id=>[id,document.getElementById(id)]));
