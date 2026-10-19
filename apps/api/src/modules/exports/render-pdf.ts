import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import type { Block, DocModel } from './document-model.js';

const require = createRequire(import.meta.url);
// pdfmake (biblioteca open source que gera PDF a partir de uma definição declarativa).
const pdfmake = require('pdfmake') as {
  setFonts(fonts: unknown): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};
const fonts = require('pdfmake/fonts/Roboto.js') as { Roboto: Record<string, string> };
const fontDir = dirname(fonts.Roboto['normal']!);

pdfmake.setFonts(fonts);
// O documento nunca busca recursos externos nem lê arquivos fora da pasta de fontes.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontDir));

const COLORS = { primary: '#1F3A5F', muted: '#6B7280', border: '#CBD5E1', header: '#EEF2F7' };

function blockToContent(block: Block): Content {
  switch (block.kind) {
    case 'heading':
      return { text: block.text, style: 'h2' };
    case 'paragraph':
      return { text: block.text, color: block.muted ? COLORS.muted : undefined, margin: [0, 0, 0, 6] };
    case 'fields':
      return {
        table: {
          widths: [140, '*'],
          body: block.rows.map(([label, value]) => [
            { text: label, bold: true, fillColor: COLORS.header },
            { text: value },
          ]),
        },
        layout: thinLayout,
        margin: [0, 0, 0, 10],
      };
    case 'table': {
      const total = block.widths.reduce((a, b) => a + b, 0);
      return {
        table: {
          headerRows: 1,
          widths: block.widths.map((w) => `${((w / total) * 100).toFixed(1)}%`),
          body: [
            block.header.map((h) => ({ text: h, bold: true, fillColor: COLORS.header })),
            ...block.rows.map((r) => r.map((c) => ({ text: c }))),
          ],
        },
        layout: thinLayout,
        margin: [0, 0, 0, 10],
      };
    }
    case 'signatures':
      return {
        columns: [0, 1].map((col) => ({
          width: '*',
          stack: block.people
            .filter((_, i) => i % 2 === col)
            .map((p) => ({
              stack: [
                { text: ' ', margin: [0, 28, 0, 0] },
                {
                  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.7 }],
                },
                { text: p.name || ' ', bold: true, margin: [0, 4, 0, 0] },
                { text: p.role, color: COLORS.muted, fontSize: 8 },
                { text: 'Data: ____/____/______', color: COLORS.muted, fontSize: 8 },
              ],
              unbreakable: true,
            })),
        })),
        columnGap: 24,
      };
  }
}

const thinLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLORS.border,
  vLineColor: () => COLORS.border,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

export async function renderPdf(model: DocModel): Promise<Buffer> {
  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 60],
    info: { title: `${model.title} — ${model.subtitle}`, creator: 'PEI' },
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.2 },
    styles: {
      title: { fontSize: 16, bold: true, color: COLORS.primary },
      subtitle: { fontSize: 10, color: COLORS.muted, margin: [0, 2, 0, 14] },
      h2: { fontSize: 12, bold: true, color: COLORS.primary, margin: [0, 10, 0, 6] },
    },
    content: [
      { text: model.title, style: 'title' },
      { text: model.subtitle, style: 'subtitle' },
      ...model.blocks.map(blockToContent),
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: model.footer, fontSize: 7, color: COLORS.muted },
        { text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: 7, width: 40 },
      ],
      margin: [40, 20, 40, 0],
    }),
  };
  return pdfmake.createPdf(definition).getBuffer();
}
