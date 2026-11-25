import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSampleTemplateDocument,
  parseExamDocumentText,
} from './document-parser.ts';

test('parses a 50-question 4-option (A-D) document accurately for bulk CBT import', () => {
  const doc = generateSampleTemplateDocument('mcq_4', 'Mathematics', 50);
  const parsed = parseExamDocumentText({
    rawText: doc,
    template: 'mcq_4',
    defaultTopic: 'Algebra & Geometry',
    defaultMarks: 2,
  });

  assert.equal(parsed.questions.length, 50);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.questions[0].options.length, 4);
  assert.equal(parsed.questions[0].correctAnswer, 'A');
  assert.equal(parsed.questions[1].correctAnswer, 'B');
  assert.equal(parsed.questions[49].index, 50);
});

test('parses 2-option (A-B) template and bottom Answer Key section cleanly', () => {
  const raw = `
1. Nigeria is located in West Africa.
A. Yes, West Africa
B. No, East Africa

2. Water boils at 100 degrees Celsius at standard pressure.
A. Correct
B. Incorrect

ANSWER KEY:
1. A
2. A
  `;
  const parsed = parseExamDocumentText({
    rawText: raw,
    template: 'mcq_2_ab',
    defaultTopic: 'General Science',
  });

  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.detectedAnswerKeyCount, 2);
  assert.equal(parsed.questions[0].options.length, 2);
  assert.equal(parsed.questions[1].correctAnswer, 'A');
});

test('parses True/False and Fill-in-the-Blank CBT templates accurately', () => {
  const tfDoc = `
1. Plants produce oxygen during photosynthesis.
Answer: True
2. The Sun revolves around the Earth.
Answer: False
  `;
  const tfParsed = parseExamDocumentText({ rawText: tfDoc, template: 'true_false' });
  assert.equal(tfParsed.questions.length, 2);
  assert.equal(tfParsed.questions[0].questionType, 'true_false');
  assert.equal(tfParsed.questions[0].correctAnswer, 'True');
  assert.equal(tfParsed.questions[1].correctAnswer, 'False');

  const gapDoc = `
1. The capital city of Nigeria is ____.
Answer: Abuja | abuja
  `;
  const gapParsed = parseExamDocumentText({ rawText: gapDoc, template: 'fill_in_gap' });
  assert.equal(gapParsed.questions.length, 1);
  assert.equal(gapParsed.questions[0].questionType, 'fill_in_gap');
  assert.deepEqual(gapParsed.questions[0].acceptedAnswers, ['Abuja', 'abuja']);
});
