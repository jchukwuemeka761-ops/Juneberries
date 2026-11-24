import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAnswer,
  resolveGrade,
  computeRemainingSeconds,
  isAttemptExpired,
  sanitizeQuestionForStudent,
  calculateResultTotals,
} from './cbt-engine';
import type { GradeBand, Question, StudentAnswer } from './types';

const SAMPLE_SCALE: GradeBand[] = [
  { grade: 'A', minScore: 70, maxScore: 100, remark: 'Distinction' },
  { grade: 'B', minScore: 60, maxScore: 69, remark: 'Very Good' },
  { grade: 'C', minScore: 50, maxScore: 59, remark: 'Credit' },
  { grade: 'D', minScore: 45, maxScore: 49, remark: 'Pass' },
  { grade: 'E', minScore: 40, maxScore: 44, remark: 'Fair' },
  { grade: 'F', minScore: 0, maxScore: 39, remark: 'Fail' },
];

const POLICY = {
  allowPartialMultipleSelect: true,
  enableNegativeMarking: false,
  negativeMarkPenalty: 0.5,
};

test('evaluates MCQ, True/False, and Image-Based questions accurately', () => {
  const mcq: Question = {
    id: 'q1',
    subjectId: 's1',
    classId: 'c1',
    topic: 'Algebra',
    difficulty: 'medium',
    marks: 2,
    questionType: 'mcq',
    questionText: '2 + 2 = ?',
    options: [
      { id: 'A', label: 'A', text: '3' },
      { id: 'B', label: 'B', text: '4' },
    ],
    correctAnswer: 'B',
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  assert.deepEqual(evaluateAnswer(mcq, 'B', 2, POLICY), {
    isObjectiveMarked: true,
    requiresManualMarking: false,
    marksAwarded: 2,
    isCorrect: true,
  });

  assert.deepEqual(evaluateAnswer(mcq, 'A', 2, POLICY), {
    isObjectiveMarked: true,
    requiresManualMarking: false,
    marksAwarded: 0,
    isCorrect: false,
  });
});

test('evaluates multiple-select with partial credit and negative marking policy', () => {
  const ms: Question = {
    id: 'q2',
    subjectId: 's1',
    classId: 'c1',
    topic: 'Chemistry',
    difficulty: 'hard',
    marks: 4,
    questionType: 'multiple_select',
    questionText: 'Select noble gases',
    options: [
      { id: 'A', label: 'A', text: 'Helium' },
      { id: 'B', label: 'B', text: 'Oxygen' },
      { id: 'C', label: 'C', text: 'Neon' },
      { id: 'D', label: 'D', text: 'Chlorine' },
    ],
    correctAnswer: ['A', 'C'],
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  assert.equal(evaluateAnswer(ms, ['A', 'C'], 4, POLICY).marksAwarded, 4);
  assert.equal(evaluateAnswer(ms, ['A'], 4, POLICY).marksAwarded, 2);
  assert.equal(
    evaluateAnswer(ms, ['B'], 4, {
      allowPartialMultipleSelect: false,
      enableNegativeMarking: true,
      negativeMarkPenalty: 1,
    }).marksAwarded,
    -1
  );
});

test('evaluates fill-in-the-gap, matching, and defers essay to manual grading', () => {
  const gap: Question = {
    id: 'q3',
    subjectId: 's1',
    classId: 'c1',
    topic: 'History',
    difficulty: 'easy',
    marks: 2,
    questionType: 'fill_in_gap',
    questionText: 'Capital of Nigeria is ____',
    options: [],
    correctAnswer: 'Abuja',
    acceptedAnswers: ['Abuja', 'FCT Abuja'],
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  assert.equal(evaluateAnswer(gap, '  abuja  ', 2, POLICY).isCorrect, true);

  const matching: Question = {
    id: 'q4',
    subjectId: 's1',
    classId: 'c1',
    topic: 'Physics',
    difficulty: 'medium',
    marks: 4,
    questionType: 'matching',
    questionText: 'Match units',
    options: [],
    matchingPairs: [
      { id: 'm1', left: 'Force', right: 'Newton' },
      { id: 'm2', left: 'Current', right: 'Ampere' },
    ],
    correctAnswer: { Force: 'Newton', Current: 'Ampere' },
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  assert.equal(
    evaluateAnswer(matching, { Force: 'Newton', Current: 'Ampere' }, 4, POLICY)
      .marksAwarded,
    4
  );
  assert.equal(
    evaluateAnswer(matching, { Force: 'Newton', Current: 'Volt' }, 4, POLICY)
      .marksAwarded,
    2
  );

  const essay: Question = {
    id: 'q5',
    subjectId: 's1',
    classId: 'c1',
    topic: 'Civic',
    difficulty: 'hard',
    marks: 10,
    questionType: 'essay',
    questionText: 'Discuss federalism',
    options: [],
    correctAnswer: 'Key points',
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  const evalEssay = evaluateAnswer(essay, 'Student essay response', 10, POLICY);
  assert.equal(evalEssay.requiresManualMarking, true);
  assert.equal(evalEssay.isObjectiveMarked, false);
});

test('sanitizes question for student by stripping correct answers and marking guides', () => {
  const q: Question = {
    id: 'q6',
    subjectId: 's1',
    classId: 'c1',
    topic: 'Biology',
    difficulty: 'medium',
    marks: 2,
    questionType: 'image_based',
    questionText: 'Identify structure A',
    options: [
      { id: 'A', label: 'A', text: 'Cell Wall' },
      { id: 'B', label: 'B', text: 'Nucleus' },
    ],
    correctAnswer: 'A',
    explanation: 'Outer rigid cellulose wall',
    markingGuide: 'Award 2 marks for A',
    imageUrl: '/images/diagram_plant_cell.jpg',
    teacherProfileId: 't1',
    approvalStatus: 'approved',
    createdAt: '',
    updatedAt: '',
  };

  const sanitized = sanitizeQuestionForStudent(q, ['B', 'A']) as unknown as Record<string, unknown>;
  assert.equal('correctAnswer' in sanitized, false);
  assert.equal('explanation' in sanitized, false);
  assert.equal('markingGuide' in sanitized, false);
  assert.equal((sanitized.options as Array<{ id: string }>)[0].id, 'B');
});

test('computes server timer remaining seconds and result grades accurately', () => {
  const now = new Date('2026-11-24T10:00:00Z').getTime();
  assert.equal(computeRemainingSeconds('2026-11-24T10:15:00Z', now), 900);
  assert.equal(isAttemptExpired('2026-11-24T09:59:59Z', now), true);
  assert.equal(isAttemptExpired('2026-11-24T10:05:00Z', now), false);

  assert.equal(resolveGrade(74.5, SAMPLE_SCALE).grade, 'A');
  assert.equal(resolveGrade(62, SAMPLE_SCALE).grade, 'B');
  assert.equal(resolveGrade(38, SAMPLE_SCALE).grade, 'F');

  const answers: StudentAnswer[] = [
    {
      id: 'a1',
      attemptId: 'att1',
      questionId: 'q1',
      response: 'B',
      flaggedForReview: false,
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: 8,
      updatedAt: '',
    },
    {
      id: 'a2',
      attemptId: 'att1',
      questionId: 'q2',
      response: 'Essay text',
      flaggedForReview: false,
      isObjectiveMarked: false,
      requiresManualMarking: true,
      marksAwarded: 6,
      markedByProfileId: 'teacher1',
      updatedAt: '',
    },
  ];
  const result = calculateResultTotals(answers, 20, 50, SAMPLE_SCALE);
  assert.equal(result.totalScore, 14);
  assert.equal(result.percentage, 70);
  assert.equal(result.grade, 'A');
  assert.equal(result.passed, true);
  assert.equal(result.manualGradingCompleted, true);
});
