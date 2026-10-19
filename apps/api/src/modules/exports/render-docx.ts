// docx: biblioteca open source que gera arquivos Word (.docx) em Node, sem depender do Office.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Block, DocModel } from './document-model.js';

const PRIMARY = '1F3A5F';
const MUTED = '6B7280';
const HEADER_FILL = 'EEF2F7';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text: string, opts: { header?: boolean; widthPct?: number } = {}): TableCell {
  return new TableCell({
    borders: BORDERS,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header
      ? { type: ShadingType.CLEAR, color: 'auto', fill: HEADER_FILL }
      : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: text.split('\n').map(
      (line) => new Paragraph({ children: [new TextRun({ text: line, bold: opts.header, size: 18 })] }),
    ),
  });
}

function blockToChildren(block: Block): Array<Paragraph | Table> {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: block.text, bold: true, color: PRIMARY, size: 24 })],
        }),
      ];
    case 'paragraph':
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, color: block.muted ? MUTED : undefined, size: 18 })],
        }),
      ];
    case 'fields':
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            ([label, value]) =>
              new TableRow({
                children: [cell(label, { header: true, widthPct: 28 }), cell(value, { widthPct: 72 })],
              }),
          ),
        }),
      ];
    case 'table': {
      const total = block.widths.reduce((a, b) => a + b, 0);
      const pct = block.widths.map((w) => Math.round((w / total) * 100));
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: block.header.map((h, i) => cell(h, { header: true, widthPct: pct[i] })),
            }),
            ...block.rows.map(
              (r) => new TableRow({ children: r.map((c, i) => cell(c, { widthPct: pct[i] })) }),
            ),
          ],
        }),
      ];
    }
    case 'signatures':
      return block.people.flatMap((p) => [
        new Paragraph({ spacing: { before: 480 }, children: [new TextRun('_______________________________________')] }),
        new Paragraph({ children: [new TextRun({ text: p.name || ' ', bold: true, size: 18 })] }),
        new Paragraph({
          children: [new TextRun({ text: `${p.role} · Data: ____/____/______`, color: MUTED, size: 16 })],
        }),
      ]);
  }
}

export async function renderDocx(model: DocModel): Promise<Buffer> {
  const doc = new Document({
    title: `${model.title} — ${model.subtitle}`,
    creator: 'PEI',
    styles: { default: { document: { run: { font: 'Calibri', size: 18 } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 900, bottom: 900, left: 800, right: 800 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [new TextRun({ text: model.footer, size: 14, color: MUTED })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], size: 14 }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: model.title, bold: true, color: PRIMARY, size: 32 })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: model.subtitle, color: MUTED, size: 20 })],
          }),
          ...model.blocks.flatMap(blockToChildren),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
