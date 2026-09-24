const IDS=['doc','versionButton','versionLabel','versionMenu','versionControl','toggleChanges','barRow','editGroup',
  'whoChip','stateChip','newRevisionBtn','finishRevisionBtn','discardRevisionBtn','shareUrlBtn','copyBtn','pdfBtn',
  'notice','noticeText','noticeActions','versionCard','cardTitle','compareBadge','statusBadge','publishBadge',
  'cardSummary','publishNote','versionHash','changeDetails','detailList','revisionPanel','revisionBase',
  'revisionSummary','revisionMeta','revisionHash','dialog','dialogTitle','dialogSummary','dialogNote','dialogActions'];

export const el=Object.fromEntries(IDS.map(id=>[id,document.getElementById(id)]));
