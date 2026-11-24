import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvLines,
  validateAndParseQuestionRows,
  QUESTION_CSV_TEMPLATE,
} from './bulk-import';

test('parses valid template CSV rows cleanly with zero failures', () => {
  const rows = parseCsvLines(QUESTION_CSV_TEMPLATE);
  const report = validateAndParseQuestionRows(rows, []);
  assert.equal(report.totalRows, 5);
  assert.equal(report.successful.length, 5);
  assert.equal(report.failed.length, 0);
});

test('detects duplicates, missing fields, and invalid answer options', () => {
  const csv = [
    'question_type,topic,difficulty,marks,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation',
    'mcq,Algebra,medium,2,"Existing question?",1,2,3,4,B,',
    'mcq,Algebra,medium,2,"",1,2,3,4,A,',
    'mcq,Algebra,medium,2,"New MCQ",1,2,,,D,',
    'mcq,Algebra,medium,2,"Valid new MCQ",10,20,30,40,C,"Good"',
  ].join('\n');

  const rows = parseCsvLines(csv);
  const report = validateAndParseQuestionRows(rows, ['Existing question?']);
  assert.equal(report.totalRows, 4);
  assert.equal(report.duplicatesCount, 1);
  assert.equal(report.missingFieldsCount, 1);
  assert.equal(report.invalidOptionsCount, 1);
  assert.equal(report.successful.length, 1);
});
