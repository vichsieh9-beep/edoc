// Builds small .docx files for tests: a real zip (deflate entries) with WordprocessingML parts.
import { crc32, deflateRawSync } from 'node:zlib';

export function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const t = (text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
export const para = (runs, { style, num } = {}) => {
  const pPr = style || num ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num ? `<w:numPr><w:ilvl w:val="${num[1]}"/><w:numId w:val="${num[0]}"/></w:numPr>` : ''}</w:pPr>` : '';
  return `<w:p>${pPr}${typeof runs === 'string' ? t(runs) : runs.join('')}</w:p>`;
};
export const run = (text, { b, i } = {}) => `<w:r>${b || i ? `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

// Localized style ids (as a Chinese Word writes them): the heading level comes from w:name.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>
<w:style w:type="paragraph" w:styleId="a0"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="a3"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>
<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/rules" TargetMode="External"/>
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
</Relationships>`;

export function docx(bodyXml, { extra = {} } = {}) {
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`,
    'word/styles.xml': STYLES,
    'word/numbering.xml': NUMBERING,
    'word/_rels/document.xml.rels': RELS,
    ...extra,
  });
}

/** A Word file using everything the converter knows, plus parts it leaves out. */
export function sampleDocx() {
  const body = [
    para('Mini Game 規格書', { style: 'a3' }),
    para('玩法說明', { style: '1' }),
    para([run('每局 '), run('3 回合', { b: true }), run('，可選擇'), run('加倍', { i: true }), run('。詳見'),
      '<w:hyperlink r:id="rId9">' + run('規則') + '</w:hyperlink>', run('與'), '<w:hyperlink r:id="rId10">' + run('壞連結') + '</w:hyperlink>', run('。')]),
    para('第一點', { num: [1, 0] }),
    para('子項目', { num: [1, 1] }),
    para('第二點', { style: 'ListBullet' }),
    para('步驟一', { num: [2, 0] }),
    para('步驟二', { num: [2, 0] }),
    para('細節', { style: '2' }),
    para([run('保留'), '<w:ins w:id="1" w:author="A">' + run('新增字') + '</w:ins>', '<w:del w:id="2" w:author="A"><w:r><w:delText>刪除字</w:delText></w:r></w:del>',
      '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"/></w:drawing></w:r>']),
    '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>' + para('合併標題') + '</w:tc></w:tr>'
      + '<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>' + para('跨列') + '</w:tc><w:tc>' + para('A') + '</w:tc></w:tr>'
      + '<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>' + para('') + '</w:tc><w:tc>' + para('B') + para('C') + '</w:tc></w:tr></w:tbl>',
    para(['<w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent>' + para('方塊') + '</w:txbxContent></v:textbox></v:shape></w:pict></w:r>', run('結尾'), '<w:r><w:br/></w:r>', run('第二行')]),
    para(''),
  ].join('');
  return docx(body, {
    extra: {
      'word/header1.xml': `<w:hdr ${NS}/>`,
      'word/footer1.xml': `<w:ftr ${NS}/>`,
      'word/comments.xml': `<w:comments ${NS}><w:comment w:id="0"/><w:comment w:id="1"/></w:comments>`,
    },
  });
}
