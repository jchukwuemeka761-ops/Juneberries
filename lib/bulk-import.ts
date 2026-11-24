import type { DifficultyLevel, QuestionOption, QuestionType } from './types';

export interface ParsedBulkQuestion {
  rowNumber: number;
  questionType: QuestionType;
  topic: string;
  subtopic?: string;
  difficulty: DifficultyLevel;
  marks: number;
  questionText: string;
  options: QuestionOption[];
  correctAnswer: string | string[];
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface BulkImportIssue {
  rowNumber: number;
  reason: 'missing_field' | 'duplicate' | 'invalid_option' | 'invalid_format';
  message: string;
  rawPreview: string;
}

export interface BulkImportReport {
  totalRows: number;
  successful: ParsedBulkQuestion[];
  failed: BulkImportIssue[];
  duplicatesCount: number;
  missingFieldsCount: number;
  invalidOptionsCount: number;
  invalidFormatCount: number;
}

const VALID_TYPES = new Set<QuestionType>([
  'mcq',
  'true_false',
  'multiple_select',
  'fill_in_gap',
  'short_answer',
  'essay',
]);

const VALID_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'medium', 'hard']);

export function parseCsvLines(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  const clean = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function validateAndParseQuestionRows(
  rows: string[][],
  existingQuestionTexts: string[] = []
): BulkImportReport {
  const report: BulkImportReport = {
    totalRows: 0,
    successful: [],
    failed: [],
    duplicatesCount: 0,
    missingFieldsCount: 0,
    invalidOptionsCount: 0,
    invalidFormatCount: 0,
  };

  if (rows.length < 2) {
    return report;
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  const typeIdx = idx('question_type');
  const topicIdx = idx('topic');
  const difficultyIdx = idx('difficulty');
  const marksIdx = idx('marks');
  const textIdx = idx('question_text');
  const optAIdx = idx('option_a');
  const optBIdx = idx('option_b');
  const optCIdx = idx('option_c');
  const optDIdx = idx('option_d');
  const correctIdx = idx('correct_answer');
  const explanationIdx = idx('explanation');

  if (typeIdx === -1 || textIdx === -1 || correctIdx === -1 || topicIdx === -1) {
    report.failed.push({
      rowNumber: 1,
      reason: 'invalid_format',
      message:
        'Missing required CSV headers: question_type, topic, question_text, correct_answer.',
      rawPreview: rows[0].join(', '),
    });
    report.invalidFormatCount++;
    return report;
  }

  const seenNormalized = new Set(
    existingQuestionTexts.map((t) => t.trim().toLowerCase())
  );

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;
    report.totalRows++;

    const rawPreview = row.slice(0, 5).join(' | ');
    const qType = (row[typeIdx] || '').toLowerCase() as QuestionType;
    const topic = row[topicIdx] || '';
    const diff = ((row[difficultyIdx] || 'medium').toLowerCase()) as DifficultyLevel;
    const marksRaw = Number(row[marksIdx] || '1');
    const qText = row[textIdx] || '';
    const optA = optAIdx >= 0 ? row[optAIdx] || '' : '';
    const optB = optBIdx >= 0 ? row[optBIdx] || '' : '';
    const optC = optCIdx >= 0 ? row[optCIdx] || '' : '';
    const optD = optDIdx >= 0 ? row[optDIdx] || '' : '';
    const correctRaw = row[correctIdx] || '';
    const explanation = explanationIdx >= 0 ? row[explanationIdx] || '' : '';

    if (!qText || !topic || !qType) {
      report.missingFieldsCount++;
      report.failed.push({
        rowNumber,
        reason: 'missing_field',
        message: 'question_type, topic, and question_text are required.',
        rawPreview,
      });
      continue;
    }

    if (!VALID_TYPES.has(qType)) {
      report.invalidFormatCount++;
      report.failed.push({
        rowNumber,
        reason: 'invalid_format',
        message: `Unsupported question_type "${qType}".`,
        rawPreview,
      });
      continue;
    }

    if (!VALID_DIFFICULTIES.has(diff) || Number.isNaN(marksRaw) || marksRaw <= 0) {
      report.invalidFormatCount++;
      report.failed.push({
        rowNumber,
        reason: 'invalid_format',
        message: 'Invalid difficulty or non-positive marks value.',
        rawPreview,
      });
      continue;
    }

    const normText = qText.trim().toLowerCase();
    if (seenNormalized.has(normText)) {
      report.duplicatesCount++;
      report.failed.push({
        rowNumber,
        reason: 'duplicate',
        message: 'Duplicate question text detected in bank or upload batch.',
        rawPreview,
      });
      continue;
    }

    const options: QuestionOption[] = [];
    if (qType === 'mcq' || qType === 'multiple_select') {
      if (optA) options.push({ id: 'A', label: 'A', text: optA });
      if (optB) options.push({ id: 'B', label: 'B', text: optB });
      if (optC) options.push({ id: 'C', label: 'C', text: optC });
      if (optD) options.push({ id: 'D', label: 'D', text: optD });

      if (options.length < 2) {
        report.invalidOptionsCount++;
        report.failed.push({
          rowNumber,
          reason: 'invalid_option',
          message: 'MCQ and Multiple-Select questions require at least 2 options.',
          rawPreview,
        });
        continue;
      }

      const validOptionIds = new Set(options.map((o) => o.id));
      if (qType === 'mcq') {
        const key = correctRaw.trim().toUpperCase();
        if (!validOptionIds.has(key)) {
          report.invalidOptionsCount++;
          report.failed.push({
            rowNumber,
            reason: 'invalid_option',
            message: `Correct answer "${correctRaw}" does not match any provided option (A-D).`,
            rawPreview,
          });
          continue;
        }
        seenNormalized.add(normText);
        report.successful.push({
          rowNumber,
          questionType: qType,
          topic,
          difficulty: diff,
          marks: marksRaw,
          questionText: qText,
          options,
          correctAnswer: key,
          explanation,
        });
        continue;
      } else {
        const keys = correctRaw
          .split(/[;|,]/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (keys.length === 0 || keys.some((k) => !validOptionIds.has(k))) {
          report.invalidOptionsCount++;
          report.failed.push({
            rowNumber,
            reason: 'invalid_option',
            message: `Multiple-select correct answers "${correctRaw}" must match options (e.g. A;C).`,
            rawPreview,
          });
          continue;
        }
        seenNormalized.add(normText);
        report.successful.push({
          rowNumber,
          questionType: qType,
          topic,
          difficulty: diff,
          marks: marksRaw,
          questionText: qText,
          options,
          correctAnswer: keys,
          explanation,
        });
        continue;
      }
    }

    if (qType === 'true_false') {
      options.push({ id: 'True', label: 'A', text: 'True' });
      options.push({ id: 'False', label: 'B', text: 'False' });
      const normBool = correctRaw.trim().toLowerCase();
      if (normBool !== 'true' && normBool !== 'false') {
        report.invalidOptionsCount++;
        report.failed.push({
          rowNumber,
          reason: 'invalid_option',
          message: 'True/False correct_answer must be True or False.',
          rawPreview,
        });
        continue;
      }
      seenNormalized.add(normText);
      report.successful.push({
        rowNumber,
        questionType: qType,
        topic,
        difficulty: diff,
        marks: marksRaw,
        questionText: qText,
        options,
        correctAnswer: normBool === 'true' ? 'True' : 'False',
        explanation,
      });
      continue;
    }

    if ((qType === 'fill_in_gap' || qType === 'short_answer') && !correctRaw.trim()) {
      report.missingFieldsCount++;
      report.failed.push({
        rowNumber,
        reason: 'missing_field',
        message: 'Fill-in-the-gap / Short-answer requires correct_answer.',
        rawPreview,
      });
      continue;
    }

    seenNormalized.add(normText);
    const accepted = correctRaw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    report.successful.push({
      rowNumber,
      questionType: qType,
      topic,
      difficulty: diff,
      marks: marksRaw,
      questionText: qText,
      options: [],
      correctAnswer: accepted[0] || correctRaw,
      acceptedAnswers: accepted,
      explanation,
    });
  }

  return report;
}

export const QUESTION_CSV_TEMPLATE = [
  'question_type,topic,difficulty,marks,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation',
  'mcq,Algebra,medium,2,"Solve for x: 2x + 6 = 14",2,4,6,8,B,"Subtract 6 from both sides then divide by 2."',
  'true_false,Cell Biology,easy,1,"Plant cells possess a cellulose cell wall.",,,,,True,"Cellulose provides structural support to plant cells."',
  'multiple_select,States of Matter,hard,3,"Select all noble gases from the list.",Helium,Nitrogen,Neon,Oxygen,A;C,"Helium and Neon belong to Group 18."',
  'fill_in_gap,Nigerian History,medium,2,"Nigeria gained independence on October 1, ____.",,,,,1960,"October 1, 1960."',
  'essay,Civic Education,hard,10,"Explain three duties of a responsible citizen in a democratic society.",,,,,"Discusses law obedience, tax payment, and civic participation.","Award 3 marks per well-explained point plus 1 mark for clarity."',
].join('\n');
