// Renders docs/SOP.md as a Word document — real heading styles, a cover page,
// a contents list, and formatted tables.
//
//   npm i --no-save docx
//   node scripts/docs/build-sop-docs.mjs docs/SOP.md docs/Worker-Dashboard-SOP.docx
//
// For the PDF, convert the .docx (keeps both formats identical):
//   soffice --headless --convert-to pdf --outdir docs docs/Worker-Dashboard-SOP.docx
import fs from "node:fs";

// `docx` is a build-time-only dependency, not part of the app.
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, ExternalHyperlink,
} = await import(process.env.DOCX_PATH ?? "docx");

const SRC = process.argv[2];
const OUT = process.argv[3];

const CONTENT_W = 9360; // 8.5in letter minus 1in margins, in DXA
const INK = "1F2328";
const MUTED = "5B6570";
const ACCENT = "1D4ED8";
const RULE = "D0D7DE";
const HEAD_BG = "EEF2F7";
const CODE_BG = "F1F3F5";

const md = fs.readFileSync(SRC, "utf8");

// ---- inline markdown -> TextRun[] -----------------------------------------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(...runs(tok.slice(2, -2), { ...base, bold: true }));
    } else if (tok.startsWith("`")) {
      out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Consolas", size: 19, shading: { type: ShadingType.CLEAR, fill: CODE_BG } }));
    } else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (/^https?:/.test(href)) {
        out.push(new ExternalHyperlink({
          link: href,
          children: [new TextRun({ ...base, text: label, color: ACCENT, underline: {} })],
        }));
      } else {
        out.push(new TextRun({ ...base, text: label }));
      }
    } else {
      out.push(...runs(tok.slice(1, -1), { ...base, italics: true }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: "" })];
}

const body = (text, opts = {}) =>
  new Paragraph({ children: runs(text), spacing: { after: 140, line: 288 }, ...opts });

// ---- table ----------------------------------------------------------------
function buildTable(rows) {
  const cols = rows[0].length;
  // Weight columns by their longest cell, so a "Field | Meaning" table gives the
  // prose column the room it needs.
  const plain = (r, c) => (r[c] ?? "").replace(/[*`]/g, "");
  const weights = Array.from({ length: cols }, (_, c) =>
    Math.max(8, ...rows.map((r) => plain(r, c).length))
  );
  // A column must at least fit its longest single word, or short label columns
  // hyphenate ("Supervis / or").
  const floors = Array.from({ length: cols }, (_, c) =>
    Math.min(3400, 340 + 170 * Math.max(4, ...rows.flatMap((r) => plain(r, c).split(/\s+/).map((w) => w.length))))
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w, c) => Math.max(floors[c], Math.round((w / total) * CONTENT_W)));
  const drift = CONTENT_W - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += drift;

  const cell = (text, c, header) =>
    new TableCell({
      width: { size: widths[c], type: WidthType.DXA },
      shading: header ? { type: ShadingType.CLEAR, fill: HEAD_BG } : undefined,
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      children: [
        new Paragraph({
          children: runs(text, header ? { bold: true, color: INK } : {}),
          spacing: { after: 0, line: 264 },
        }),
      ],
    });

  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    },
    rows: rows.map((r, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: r.map((t, c) => cell(t, c, i === 0)),
      })
    ),
  });
}

// A wrapped continuation of the list item that started at `indent`: indented
// further than the marker, and not itself the start of a new block.
function isContinuation(line, indent) {
  const lead = line.length - line.trimStart().length;
  if (!line.trim() || lead <= indent) return false;
  return !/^(\s*)([-*+]\s|\d+\.\s|[|>#]|```)/.test(line);
}

const splitRow = (line) =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((s) => s.trim());

// ---- document body ---------------------------------------------------------
const lines = md.split("\n");
const children = [];
// Index of the first "## " heading — everything before it is the markdown title
// block, which the cover page replaces.
let firstHeading = -1;
// Each numbered block gets its own numbering instance so "1." restarts rather
// than continuing from the previous list.
const numberings = [];
const sections = [];
let i = 0;
let skippingContents = false;

while (i < lines.length) {
  const line = lines[i];
  const t = line.trim();

  // Drop the markdown "Contents" list — a real TOC field replaces it.
  if (/^## Contents\s*$/.test(t)) {
    skippingContents = true;
    i++;
    continue;
  }
  if (skippingContents) {
    if (/^##\s/.test(t)) skippingContents = false;
    else { i++; continue; }
  }

  if (t === "" || t === "---") { i++; continue; }

  // Fenced code
  if (t.startsWith("```")) {
    i++;
    const buf = [];
    while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
    i++;
    buf.forEach((l, n) =>
      children.push(new Paragraph({
        children: [new TextRun({ text: l || " ", font: "Consolas", size: 18, color: INK })],
        shading: { type: ShadingType.CLEAR, fill: CODE_BG },
        spacing: { before: n === 0 ? 100 : 0, after: n === buf.length - 1 ? 160 : 0, line: 260 },
        indent: { left: 220, right: 220 },
      }))
    );
    continue;
  }

  // Table
  if (t.startsWith("|") && (lines[i + 1] ?? "").trim().startsWith("|") && /^\|[\s:|-]+\|$/.test((lines[i + 1] ?? "").trim())) {
    const rows = [splitRow(lines[i])];
    i += 2;
    while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
    children.push(buildTable(rows));
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    continue;
  }

  // Headings
  if (/^# /.test(t)) {
    children.push(new Paragraph({
      children: [new TextRun({ text: t.slice(2), bold: true, size: 44, color: INK })],
      spacing: { after: 120 },
    }));
    i++;
    continue;
  }
  if (/^## /.test(t)) {
    if (firstHeading < 0) firstHeading = children.length;
    sections.push(t.slice(3));
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: t.slice(3), bold: true, size: 30, color: INK })],
      spacing: { before: 380, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
    }));
    i++;
    continue;
  }
  if (/^### /.test(t)) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: t.slice(4), bold: true, size: 24, color: INK })],
      spacing: { before: 260, after: 120 },
    }));
    i++;
    continue;
  }

  // Blockquote (callout)
  if (/^> /.test(t)) {
    const buf = [];
    while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
    children.push(new Paragraph({
      children: runs(buf.join(" ").trim()),
      shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
      indent: { left: 180, right: 180 },
      spacing: { before: 120, after: 200, line: 288 },
    }));
    continue;
  }

  // Bullets (one nesting level) and numbered steps
  const bullet = line.match(/^(\s*)- (.*)$/);
  if (bullet) {
    const indent = bullet[1].length;
    const parts = [bullet[2]];
    i++;
    // Markdown wraps long bullets onto indented continuation lines — fold them
    // back into one paragraph before building it.
    while (i < lines.length && isContinuation(lines[i], indent)) parts.push(lines[i++].trim());
    children.push(new Paragraph({
      children: runs(parts.join(" ")),
      bullet: { level: indent >= 2 ? 1 : 0 },
      spacing: { after: 90, line: 276 },
    }));
    continue;
  }
  const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
  if (numbered) {
    // A blank line or non-list content ended the previous block, so start a new
    // numbering instance whenever this item is the first of its run.
    const fresh = !(children.length && children[children.length - 1].__numbered);
    if (fresh) numberings.push(`steps-${numberings.length}`);
    const ref = numberings[numberings.length - 1];
    const parts = [numbered[2]];
    i++;
    while (i < lines.length && isContinuation(lines[i], numbered[1].length)) parts.push(lines[i++].trim());
    const para = new Paragraph({
      children: runs(parts.join(" ")),
      numbering: { reference: ref, level: 0 },
      spacing: { after: 90, line: 276 },
    });
    para.__numbered = true;
    children.push(para);
    continue;
  }

  // Paragraph, folding wrapped lines
  const buf = [t];
  i++;
  while (i < lines.length) {
    const n = lines[i].trim();
    if (n === "" || /^[-|>#`]/.test(n) || /^\d+\.\s/.test(n)) break;
    buf.push(n);
    i++;
  }
  children.push(body(buf.join(" ")));
}

// Title page furniture, then the TOC, then the body.
const front = [
  new Paragraph({ text: "", spacing: { after: 2600 } }),
  new Paragraph({
    children: [new TextRun({ text: "Worker Dashboard", bold: true, size: 60, color: INK })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Standard Operating Procedure", size: 34, color: MUTED })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 380 },
  }),
  new Paragraph({
    children: [new TextRun({
      text: "How to run the warehouse board day to day: who signs in, what each tab does, how the wall displays are managed, and how the Opendock dock schedule works.",
      size: 22, color: MUTED,
    })],
    alignment: AlignmentType.CENTER,
    indent: { left: 900, right: 900 },
    spacing: { after: 300, line: 300 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Written for supervisors, leads and admins.", size: 22, color: MUTED, italics: true })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    children: [new TextRun({ text: "Contents", bold: true, size: 30, color: INK })],
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  }),
  // A written-out list rather than a TOC field: a field shows blank until the
  // reader updates it, and this document is meant to be opened and read.
  ...sections.map((title) =>
    new Paragraph({
      children: runs(title),
      spacing: { after: 80, line: 276 },
      indent: { left: 240 },
    })
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

const doc = new Document({
  creator: "Worker Dashboard",
  title: "Worker Dashboard — Standard Operating Procedure",
  description: "Operating procedure for the warehouse board and admin panel",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: INK } },
    },
  },
  numbering: {
    config: numberings.map((reference) => ({
      reference,
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 520, hanging: 300 } } },
      }],
    })),
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: "Worker Dashboard — Standard Operating Procedure", size: 16, color: MUTED })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: MUTED })],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: [...front, ...children.slice(firstHeading)],
  }],
});

fs.writeFileSync(OUT, await Packer.toBuffer(doc));
console.log("wrote", OUT);
