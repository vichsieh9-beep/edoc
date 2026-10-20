const IDS=['suggestionsBtn','permissionsBtn','doc','versionButton','versionLabel','versionMenu','versionControl','toggleChanges','barRow','editGroup',
  'whoChip','publishSuggestionBtn','stateChip','newRevisionBtn','finishRevisionBtn','discardRevisionBtn','shareUrlBtn','copyBtn','pdfBtn','downloadBtn','downloadMenu','downloadNote','docxBtn','pngBtn',
  'notice','noticeText','noticeActions','versionCard','cardTitle','compareBadge','statusBadge','publishBadge',
  'cardSummary','cardMeaning','publishNote','versionHash','changeDetails','detailList','revisionPanel','revisionBase',
  'revisionSummary','revisionMeta','revisionHash','versionActions','restoreVersionBtn','restoreHint','revisionRestored','dialog','dialogTitle','dialogSummary','dialogNote','dialogActions','formatBar'];

export const el=Object.fromEntries(IDS.map(id=>[id,document.getElementById(id)]));
