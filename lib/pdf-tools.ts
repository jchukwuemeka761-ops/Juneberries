import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import type { ExamTemplateType } from './types';
import { generateSampleTemplateDocument } from './document-parser';

let workerConfigured = false;
function ensurePdfWorker() {
  if (workerConfigured || typeof window === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  workerConfigured = true;
}

/**
 * Extracts readable line-preserved text from a browser File (.pdf, .txt, .csv)
 * so numbered questions, A-D/A-B options, and Answer Keys remain properly structured.
 */
export async function extractTextFromUploadedFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.pdf') && file.type !== 'application/pdf') {
    return file.text();
  }

  ensurePdfWorker();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items by vertical Y coordinate to preserve line breaks accurately
    const linesMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const rawItem of content.items) {
      if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
      const item = rawItem as { str: string; transform?: number[] };
      const text = item.str;
      if (!text.trim()) continue;
      const x = item.transform?.[4] ?? 0;
      const y = Math.round((item.transform?.[5] ?? 0) / 4) * 4;
      const row = linesMap.get(y) || [];
      row.push({ x, str: text });
      linesMap.set(y, row);
    }

    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines = sortedYs.map((y) => {
      const items = (linesMap.get(y) || []).sort((a, b) => a.x - b.x);
      return items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    });

    pageTexts.push(lines.filter(Boolean).join('\n'));
  }

  return pageTexts.join('\n\n');
}

/**
 * Generates and downloads a real, formatted PDF exam template that teachers can
 * fill out or upload back into the CBT Question & Exam Studio for automatic parsing and marking.
 */
export function downloadExamTemplatePdf(
  template: ExamTemplateType,
  subjectName: string = 'General Studies',
  questionCount: number = 10
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const textContent = generateSampleTemplateDocument(template, subjectName, questionCount);
  const lines = doc.splitTextToSize(textContent, 510) as string[];

  let y = 52;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);

  for (const line of lines) {
    if (y > 780) {
      doc.addPage();
      y = 52;
    }
    doc.text(line, 42, y);
    y += 15;
  }

  const safeName = subjectName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  doc.save(`Juneberries_${template}_${safeName}_${questionCount}Q_Template.pdf`);
}
