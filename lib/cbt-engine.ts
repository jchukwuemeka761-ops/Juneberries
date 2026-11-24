import type {
  GradeBand,
  Question,
  QuestionOption,
  SanitizedQuestion,
  StudentAnswer,
} from './types';

export interface MarkingPolicy {
  allowPartialMultipleSelect: boolean;
  enableNegativeMarking: boolean;
  negativeMarkPenalty: number;
}

export interface MarkEvaluation {
  isObjectiveMarked: boolean;
  requiresManualMarking: boolean;
  marksAwarded: number;
  isCorrect: boolean;
}

export function normalizeTextAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateAnswer(
  question: Question,
  response: string | string[] | Record<string, string> | null | undefined,
  maxMarks: number,
  policy: MarkingPolicy
): MarkEvaluation {
  const empty =
    response === null ||
    response === undefined ||
    (typeof response === 'string' && response.trim() === '') ||
    (Array.isArray(response) && response.length === 0) ||
    (typeof response === 'object' && !Array.isArray(response) && Object.keys(response).length === 0);

  if (
    question.questionType === 'essay' ||
    question.questionType === 'short_answer'
  ) {
    // Short answer can auto-mark if acceptedAnswers are explicitly provided; otherwise manual marking
    if (
      question.questionType === 'short_answer' &&
      question.acceptedAnswers &&
      question.acceptedAnswers.length > 0 &&
      typeof response === 'string'
    ) {
      if (empty) {
        return {
          isObjectiveMarked: true,
          requiresManualMarking: false,
          marksAwarded: 0,
          isCorrect: false,
        };
      }
      const norm = normalizeTextAnswer(response);
      const matched = question.acceptedAnswers.some(
        (ans) => normalizeTextAnswer(ans) === norm
      );
      const penalty = policy.enableNegativeMarking
        ? -Math.abs(policy.negativeMarkPenalty)
        : 0;
      return {
        isObjectiveMarked: true,
        requiresManualMarking: false,
        marksAwarded: matched ? maxMarks : penalty,
        isCorrect: matched,
      };
    }

    return {
      isObjectiveMarked: false,
      requiresManualMarking: true,
      marksAwarded: 0,
      isCorrect: false,
    };
  }

  if (empty) {
    return {
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: 0,
      isCorrect: false,
    };
  }

  if (
    question.questionType === 'mcq' ||
    question.questionType === 'true_false' ||
    question.questionType === 'image_based'
  ) {
    const expected =
      typeof question.correctAnswer === 'string'
        ? normalizeTextAnswer(question.correctAnswer)
        : '';
    const actual = typeof response === 'string' ? normalizeTextAnswer(response) : '';
    const isCorrect = expected !== '' && expected === actual;
    const penalty = policy.enableNegativeMarking
      ? -Math.abs(policy.negativeMarkPenalty)
      : 0;
    return {
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: isCorrect ? maxMarks : penalty,
      isCorrect,
    };
  }

  if (question.questionType === 'fill_in_gap') {
    const candidates = new Set<string>();
    if (typeof question.correctAnswer === 'string' && question.correctAnswer.trim()) {
      candidates.add(normalizeTextAnswer(question.correctAnswer));
    }
    for (const acc of question.acceptedAnswers || []) {
      if (acc.trim()) candidates.add(normalizeTextAnswer(acc));
    }
    const actual = typeof response === 'string' ? normalizeTextAnswer(response) : '';
    const isCorrect = candidates.has(actual);
    const penalty = policy.enableNegativeMarking
      ? -Math.abs(policy.negativeMarkPenalty)
      : 0;
    return {
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: isCorrect ? maxMarks : penalty,
      isCorrect,
    };
  }

  if (question.questionType === 'multiple_select') {
    const expectedArr = Array.isArray(question.correctAnswer)
      ? question.correctAnswer.map(normalizeTextAnswer)
      : [];
    const actualArr = Array.isArray(response)
      ? Array.from(new Set(response.map(normalizeTextAnswer)))
      : [];
    const expectedSet = new Set(expectedArr);
    const actualSet = new Set(actualArr);

    if (expectedSet.size === 0) {
      return {
        isObjectiveMarked: true,
        requiresManualMarking: false,
        marksAwarded: 0,
        isCorrect: false,
      };
    }

    const exactMatch =
      expectedSet.size === actualSet.size &&
      Array.from(expectedSet).every((item) => actualSet.has(item));

    if (exactMatch) {
      return {
        isObjectiveMarked: true,
        requiresManualMarking: false,
        marksAwarded: maxMarks,
        isCorrect: true,
      };
    }

    if (policy.allowPartialMultipleSelect) {
      let correctHits = 0;
      let wrongHits = 0;
      for (const item of actualSet) {
        if (expectedSet.has(item)) correctHits++;
        else wrongHits++;
      }
      const rawRatio = Math.max(0, (correctHits - wrongHits) / expectedSet.size);
      const partialMarks = roundScore(rawRatio * maxMarks);
      return {
        isObjectiveMarked: true,
        requiresManualMarking: false,
        marksAwarded: partialMarks,
        isCorrect: false,
      };
    }

    const penalty = policy.enableNegativeMarking
      ? -Math.abs(policy.negativeMarkPenalty)
      : 0;
    return {
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: penalty,
      isCorrect: false,
    };
  }

  if (question.questionType === 'matching') {
    const expectedMap =
      question.correctAnswer &&
      typeof question.correctAnswer === 'object' &&
      !Array.isArray(question.correctAnswer)
        ? (question.correctAnswer as Record<string, string>)
        : {};
    const actualMap =
      response && typeof response === 'object' && !Array.isArray(response)
        ? (response as Record<string, string>)
        : {};
    const keys = Object.keys(expectedMap);
    if (keys.length === 0) {
      return {
        isObjectiveMarked: true,
        requiresManualMarking: false,
        marksAwarded: 0,
        isCorrect: false,
      };
    }
    let matchedCount = 0;
    for (const key of keys) {
      if (
        actualMap[key] &&
        normalizeTextAnswer(actualMap[key]) === normalizeTextAnswer(expectedMap[key])
      ) {
        matchedCount++;
      }
    }
    const allMatched = matchedCount === keys.length;
    const score = roundScore((matchedCount / keys.length) * maxMarks);
    return {
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: score,
      isCorrect: allMatched,
    };
  }

  return {
    isObjectiveMarked: false,
    requiresManualMarking: true,
    marksAwarded: 0,
    isCorrect: false,
  };
}

export function resolveGrade(
  percentage: number,
  gradingScale: GradeBand[]
): { grade: string; remark: string } {
  const sorted = [...gradingScale].sort((a, b) => b.minScore - a.minScore);
  for (const band of sorted) {
    if (percentage >= band.minScore && percentage <= band.maxScore) {
      return { grade: band.grade, remark: band.remark };
    }
  }
  const rounded = Math.round(percentage);
  for (const band of sorted) {
    if (rounded >= band.minScore && rounded <= band.maxScore) {
      return { grade: band.grade, remark: band.remark };
    }
  }
  const lowest = sorted[sorted.length - 1];
  return lowest
    ? { grade: lowest.grade, remark: lowest.remark }
    : { grade: 'F', remark: 'Needs Improvement' };
}

export function computeRemainingSeconds(deadlineIso: string, nowMs: number = Date.now()): number {
  const deadlineMs = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadlineMs)) return 0;
  return Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
}

export function isAttemptExpired(deadlineIso: string, nowMs: number = Date.now()): boolean {
  const deadlineMs = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadlineMs)) return true;
  return nowMs >= deadlineMs;
}

export function shuffleDeterministically<T>(items: T[], randomise: boolean): T[] {
  const copy = [...items];
  if (!randomise) return copy;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sanitizeQuestionForStudent(
  question: Question,
  optionOrderIds?: string[],
  marksOverride?: number
): SanitizedQuestion {
  let options: QuestionOption[] = question.options ? [...question.options] : [];
  if (optionOrderIds && optionOrderIds.length > 0) {
    const byId = new Map(options.map((opt) => [opt.id, opt]));
    const ordered: QuestionOption[] = [];
    for (const id of optionOrderIds) {
      const found = byId.get(id);
      if (found) ordered.push(found);
    }
    if (ordered.length === options.length) {
      options = ordered;
    }
  }

  let matchingLeftItems: string[] | undefined;
  let matchingRightItems: string[] | undefined;
  if (question.questionType === 'matching' && question.matchingPairs) {
    matchingLeftItems = question.matchingPairs.map((p) => p.left);
    matchingRightItems = [...question.matchingPairs.map((p) => p.right)].sort();
  }

  return {
    id: question.id,
    subjectId: question.subjectId,
    classId: question.classId,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    marks: marksOverride ?? question.marks,
    questionType: question.questionType,
    questionText: question.questionText,
    options,
    matchingLeftItems,
    matchingRightItems,
    imageUrl: question.imageUrl,
  };
}

export function calculateResultTotals(
  answers: StudentAnswer[],
  totalPossibleMarks: number,
  passMarkPercent: number,
  gradingScale: GradeBand[]
) {
  let objectiveScore = 0;
  let subjectiveScore = 0;
  let pendingManualCount = 0;

  for (const ans of answers) {
    if (ans.requiresManualMarking && !ans.isObjectiveMarked && ans.markedByProfileId === undefined) {
      pendingManualCount++;
    }
    if (ans.requiresManualMarking) {
      subjectiveScore += ans.marksAwarded;
    } else {
      objectiveScore += ans.marksAwarded;
    }
  }

  const rawTotal = Math.max(0, roundScore(objectiveScore + subjectiveScore));
  const safePossible = totalPossibleMarks > 0 ? totalPossibleMarks : 1;
  const percentage = roundScore(Math.min(100, (rawTotal / safePossible) * 100));
  const { grade, remark } = resolveGrade(percentage, gradingScale);
  const passed = percentage >= passMarkPercent;

  return {
    objectiveScore: roundScore(Math.max(0, objectiveScore)),
    subjectiveScore: roundScore(Math.max(0, subjectiveScore)),
    totalScore: rawTotal,
    totalPossibleMarks,
    percentage,
    grade,
    remark,
    passed,
    manualGradingCompleted: pendingManualCount === 0,
  };
}
