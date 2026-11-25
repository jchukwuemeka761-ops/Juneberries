import type { DifficultyLevel, ExamTemplateType, QuestionOption, QuestionType } from './types';

export interface ParsedDocumentQuestion {
  index: number;
  questionType: QuestionType;
  topic: string;
  difficulty: DifficultyLevel;
  marks: number;
  questionText: string;
  options: QuestionOption[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface DocumentParseIssue {
  index: number;
  message: string;
  preview: string;
}

export interface DocumentParseResult {
  questions: ParsedDocumentQuestion[];
  issues: DocumentParseIssue[];
  detectedAnswerKeyCount: number;
}

/**
 * Extracts a numbered Answer Key section from the bottom (or anywhere) of a document, e.g.:
 *   ANSWER KEY:
 *   1. B   2. A   3. True   4. Lagos
 */
export function extractAnswerKeyMap(rawText: string): {
  bodyText: string;
  answerMap: Map<number, string>;
} {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const keyHeadingRegex = /(?:^|\n)\s*(?:ANSWER\s*KEY|ANSWERS|MARKING\s*SCHEME|SOLUTIONS?)\s*:?\s*\n([\s\S]+)$/i;
  const match = normalized.match(keyHeadingRegex);

  const answerMap = new Map<number, string>();
  if (!match || match.index === undefined) {
    return { bodyText: normalized, answerMap };
  }

  const bodyText = normalized.slice(0, match.index).trim();
  const keySection = match[1];

  // Match patterns like "1. B", "1) True", "Q1: Lagos", "12 - A"
  const pairRegex = /(?:^|[\s,;])(?:Q\s*)?(\d{1,3})\s*[.):\-–]\s*([^\n,;]+?)(?=(?:\s+(?:Q\s*)?\d{1,3}\s*[.):\-–])|[\n,;]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(keySection)) !== null) {
    const qNum = Number(m[1]);
    const val = m[2].trim();
    if (qNum > 0 && val) {
      answerMap.set(qNum, val);
    }
  }

  return { bodyText, answerMap };
}

function normalizeInlineChoices(text: string): string {
  // Put inline options like "A. foo  B. bar  C. baz  D. qux" onto separate lines cleanly
  return text.replace(
    /\s+(?=(?:\(?[A-D]\)|[A-D][.):])\s+\S)/g,
    '\n'
  );
}

export function parseExamDocumentText(params: {
  rawText: string;
  template: ExamTemplateType;
  defaultTopic?: string;
  defaultMarks?: number;
  defaultDifficulty?: DifficultyLevel;
}): DocumentParseResult {
  const {
    rawText,
    template,
    defaultTopic = 'General Assessment',
    defaultMarks = 2,
    defaultDifficulty = 'medium',
  } = params;

  const { bodyText, answerMap } = extractAnswerKeyMap(rawText);
  const issues: DocumentParseIssue[] = [];
  const questions: ParsedDocumentQuestion[] = [];

  // Split blocks starting at numbered items ("1.", "1)", "Q1.", "Question 1:")
  const cleanBody = bodyText
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!cleanBody) {
    return { questions: [], issues: [{ index: 0, message: 'Uploaded document contains no readable text.', preview: '' }], detectedAnswerKeyCount: 0 };
  }

  // Ensure numbered question markers start on clean lines even if PDF extraction collapsed newlines,
  // while never splitting sentence-ending numbers followed by a newline (e.g. "problem set 1.\nA.").
  const segmented = cleanBody.replace(
    /(?:^|\n|[ \t]+)(?=(?:Question[ \t]+)?\d{1,3}[.)][ \t]+\S)/gi,
    '\n'
  );

  const rawBlocks = segmented
    .split(/\n(?=(?:Question[ \t]+)?\d{1,3}[.)][ \t]+)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];
    const numMatch = block.match(/^(?:Question\s+)?(\d{1,3})\s*[.)]\s*([\s\S]+)$/i);
    if (!numMatch) {
      continue;
    }

    const qNum = Number(numMatch[1]);
    let content = numMatch[2].trim();

    // Extract inline Explanation if provided
    let explanation: string | undefined;
    const expMatch = content.match(/\n?\s*(?:Explanation|Exp|Note)\s*:\s*([^\n]+)/i);
    if (expMatch) {
      explanation = expMatch[1].trim();
      content = content.replace(expMatch[0], '').trim();
    }

    // Extract inline Answer if provided
    let inlineAnswer = '';
    const ansMatch = content.match(
      /(?:\n|\s)(?:Answer|Ans|Correct(?:\s+Answer)?|Key)\s*[:\-–]\s*([^\n]+)$/im
    );
    if (ansMatch) {
      inlineAnswer = ansMatch[1].trim();
      content = content.slice(0, ansMatch.index).trim();
    }

    const resolvedAnswerRaw = inlineAnswer || answerMap.get(qNum) || '';

    // Expand inline options onto lines
    const expanded = normalizeInlineChoices(content);
    const lines = expanded
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedOptions: QuestionOption[] = [];
    const stemLines: string[] = [];

    for (const line of lines) {
      const optMatch = line.match(/^(?:\(([A-Da-d])\)|([A-Da-d])[.):])\s*(.+)$/);
      if (optMatch) {
        const letter = (optMatch[1] || optMatch[2]).toUpperCase();
        parsedOptions.push({
          id: letter,
          label: letter,
          text: optMatch[3].trim(),
        });
      } else if (parsedOptions.length === 0) {
        stemLines.push(line);
      } else {
        // Continuation of previous option text
        const prev = parsedOptions[parsedOptions.length - 1];
        prev.text = `${prev.text} ${line}`.trim();
      }
    }

    const questionText = stemLines.join(' ').trim();
    if (!questionText) {
      issues.push({
        index: qNum,
        message: `Question ${qNum} has empty prompt text.`,
        preview: block.slice(0, 80),
      });
      continue;
    }

    // Resolve QuestionType & normalize according to teacher's selected template
    let targetType: QuestionType;
    let finalOptions: QuestionOption[] = parsedOptions;
    let finalAnswer: string;
    let acceptedAnswers: string[] | undefined;

    if (template === 'true_false') {
      targetType = 'true_false';
      finalOptions = [
        { id: 'True', label: 'A', text: 'True' },
        { id: 'False', label: 'B', text: 'False' },
      ];
      const norm = resolvedAnswerRaw.toLowerCase();
      if (norm === 't' || norm === 'true' || norm === 'a') finalAnswer = 'True';
      else if (norm === 'f' || norm === 'false' || norm === 'b') finalAnswer = 'False';
      else {
        issues.push({
          index: qNum,
          message: `Question ${qNum} missing valid True/False answer (found "${resolvedAnswerRaw || 'none'}").`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
    } else if (template === 'fill_in_gap') {
      targetType = 'fill_in_gap';
      finalOptions = [];
      if (!resolvedAnswerRaw) {
        issues.push({
          index: qNum,
          message: `Question ${qNum} missing fill-in-the-blank answer.`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
      acceptedAnswers = resolvedAnswerRaw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      finalAnswer = acceptedAnswers[0] || resolvedAnswerRaw;
    } else if (template === 'mcq_2_ab') {
      targetType = 'mcq';
      finalOptions = parsedOptions.filter((o) => o.id === 'A' || o.id === 'B').slice(0, 2);
      if (finalOptions.length < 2) {
        issues.push({
          index: qNum,
          message: `Question ${qNum} requires Option A and Option B for the A–B template.`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
      const key = resolvedAnswerRaw.trim().toUpperCase().replace(/[^AB]/g, '').slice(0, 1);
      if (key !== 'A' && key !== 'B') {
        issues.push({
          index: qNum,
          message: `Question ${qNum} missing valid answer A or B (found "${resolvedAnswerRaw || 'none'}").`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
      finalAnswer = key;
    } else if (template === 'mcq_4') {
      targetType = 'mcq';
      if (finalOptions.length < 2) {
        issues.push({
          index: qNum,
          message: `Question ${qNum} requires options A–D (or A–B).`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
      const key = resolvedAnswerRaw.trim().toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
      const validIds = new Set(finalOptions.map((o) => o.id));
      if (!key || !validIds.has(key)) {
        issues.push({
          index: qNum,
          message: `Question ${qNum} answer "${resolvedAnswerRaw || 'missing'}" does not match provided options.`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
      finalAnswer = key;
    } else {
      // 'mixed' auto-detect
      const normAns = resolvedAnswerRaw.trim().toLowerCase();
      if (parsedOptions.length >= 2) {
        targetType = 'mcq';
        const key = resolvedAnswerRaw.trim().toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
        const validIds = new Set(parsedOptions.map((o) => o.id));
        if (!key || !validIds.has(key)) {
          issues.push({
            index: qNum,
            message: `Question ${qNum} answer "${resolvedAnswerRaw || 'missing'}" does not match A–D options.`,
            preview: questionText.slice(0, 80),
          });
          continue;
        }
        finalAnswer = key;
      } else if (normAns === 'true' || normAns === 'false') {
        targetType = 'true_false';
        finalOptions = [
          { id: 'True', label: 'A', text: 'True' },
          { id: 'False', label: 'B', text: 'False' },
        ];
        finalAnswer = normAns === 'true' ? 'True' : 'False';
      } else if (resolvedAnswerRaw) {
        targetType = 'fill_in_gap';
        finalOptions = [];
        acceptedAnswers = resolvedAnswerRaw
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
        finalAnswer = acceptedAnswers[0] || resolvedAnswerRaw;
      } else {
        issues.push({
          index: qNum,
          message: `Question ${qNum} could not detect options or an answer key.`,
          preview: questionText.slice(0, 80),
        });
        continue;
      }
    }

    questions.push({
      index: qNum,
      questionType: targetType,
      topic: defaultTopic.trim() || 'General Assessment',
      difficulty: defaultDifficulty,
      marks: defaultMarks > 0 ? defaultMarks : 2,
      questionText,
      options: finalOptions,
      correctAnswer: finalAnswer,
      acceptedAnswers,
      explanation,
    });
  }

  return {
    questions,
    issues,
    detectedAnswerKeyCount: answerMap.size,
  };
}

export function generateSampleTemplateDocument(
  template: ExamTemplateType,
  subjectName: string = 'General Studies',
  questionCount: number = 5
): string {
  const lines: string[] = [
    `JUNEBERRIES INTERNATIONAL SCHOOLS — ${subjectName.toUpperCase()} CBT EXAM TEMPLATE`,
    '',
  ];

  for (let i = 1; i <= questionCount; i++) {
    if (template === 'mcq_2_ab') {
      lines.push(`${i}. Sample ${subjectName} Question #${i}: Which option correctly states the key concept?`);
      lines.push(`A. Correct principle for item ${i}`);
      lines.push(`B. Alternative distractor for item ${i}`);
      lines.push(`Answer: ${i % 2 === 0 ? 'B' : 'A'}`);
      lines.push('');
    } else if (template === 'true_false') {
      lines.push(`${i}. Sample ${subjectName} Statement #${i}: Core scientific principles remain constant under standard conditions.`);
      lines.push(`Answer: ${i % 2 === 0 ? 'False' : 'True'}`);
      lines.push('');
    } else if (template === 'fill_in_gap') {
      lines.push(`${i}. Sample ${subjectName} Gap-Fill #${i}: The fundamental unit measured in topic ${i} is ____.`);
      lines.push(`Answer: Unit${i}`);
      lines.push('');
    } else {
      lines.push(`${i}. Sample ${subjectName} Question #${i}: Identify the accurate answer for problem set ${i}.`);
      lines.push(`A. First choice (${i}a)`);
      lines.push(`B. Second choice (${i}b)`);
      lines.push(`C. Third choice (${i}c)`);
      lines.push(`D. Fourth choice (${i}d)`);
      const letter = ['A', 'B', 'C', 'D'][(i - 1) % 4];
      lines.push(`Answer: ${letter}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
