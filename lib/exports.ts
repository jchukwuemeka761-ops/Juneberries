import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AcademicClass,
  AcademicSession,
  AcademicTerm,
  Examination,
  ExaminationResult,
  PublicProfile,
  SchoolSettings,
  StudentRecord,
  Subject,
} from './types';

function escapeCsv(value: unknown): string {
  const str = String(value ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return safe.includes(',') || safe.includes('"')
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

export function exportRowsToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportRowsToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function downloadStudentResultPdf(params: {
  settings: SchoolSettings;
  studentName: string;
  admissionNumber: string;
  className: string;
  sessionName: string;
  termName: string;
  examTitle: string;
  subjectName: string;
  result: ExaminationResult;
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { settings, result } = params;

  // Header banner
  doc.setFillColor(10, 30, 61);
  doc.rect(0, 0, 595, 96, 'F');
  doc.setFillColor(184, 134, 11);
  doc.rect(0, 96, 595, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.schoolName.toUpperCase(), 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(settings.motto, 40, 60);
  doc.text(`${settings.address} | ${settings.phone}`, 40, 76);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('OFFICIAL EXAMINATION RESULT TRANSCRIPT', 40, 132);

  autoTable(doc, {
    startY: 148,
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    styles: { fontSize: 10, cellPadding: 8 },
    body: [
      ['Student Name', params.studentName, 'Admission No.', params.admissionNumber],
      ['Academic Class', params.className, 'Academic Session', params.sessionName],
      ['Term', params.termName, 'Publication Date', result.publishedAt ? new Date(result.publishedAt).toLocaleDateString() : 'Published'],
    ],
  });

  const afterInfoY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240;

  autoTable(doc, {
    startY: afterInfoY + 20,
    head: [['Subject', 'Examination', 'Objective', 'Essay / Theory', 'Total Score', 'Percentage', 'Grade', 'Status']],
    body: [
      [
        params.subjectName,
        params.examTitle,
        String(result.objectiveScore),
        String(result.subjectiveScore),
        `${result.totalScore} / ${result.totalPossibleMarks}`,
        `${result.percentage}%`,
        result.grade,
        result.passed ? 'PASSED' : 'BELOW PASS MARK',
      ],
    ],
    headStyles: { fillColor: [10, 30, 61], textColor: [255, 255, 255] },
    styles: { fontSize: 9, cellPadding: 7 },
  });

  const afterScoreY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 360;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Examiner Remark: ${result.remark}`, 40, afterScoreY + 28);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated from ${settings.schoolName} CBT Portal · Verification ID: ${result.id}`,
    40,
    790
  );

  doc.save(`Juneberry_Result_${params.admissionNumber.replace(/\//g, '_')}_${result.id}.pdf`);
}

export function downloadSummaryReportPdf(params: {
  settings: SchoolSettings;
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  filename: string;
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

  doc.setFillColor(10, 30, 61);
  doc.rect(0, 0, 842, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`${params.settings.schoolName} — ${params.title}`, 36, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(params.subtitle, 36, 54);

  autoTable(doc, {
    startY: 92,
    head: [params.headers],
    body: params.rows.map((r) => r.map(String)),
    headStyles: { fillColor: [10, 30, 61], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 6 },
  });

  doc.save(params.filename.endsWith('.pdf') ? params.filename : `${params.filename}.pdf`);
}

export function buildResultsExportRows(params: {
  results: ExaminationResult[];
  students: StudentRecord[];
  profiles: PublicProfile[];
  classes: AcademicClass[];
  subjects: Subject[];
  examinations: Examination[];
  sessions: AcademicSession[];
  terms: AcademicTerm[];
}) {
  const headers = [
    'Admission No.',
    'Student Name',
    'Class',
    'Subject',
    'Examination',
    'Session',
    'Term',
    'Objective',
    'Subjective',
    'Total',
    'Out Of',
    'Percentage',
    'Grade',
    'Status',
  ];

  const rows = params.results.map((r) => {
    const stu = params.students.find((s) => s.id === r.studentId);
    const prof = stu ? params.profiles.find((p) => p.id === stu.profileId) : undefined;
    const cls = params.classes.find((c) => c.id === r.classId);
    const sub = params.subjects.find((s) => s.id === r.subjectId);
    const ex = params.examinations.find((e) => e.id === r.examinationId);
    const sess = params.sessions.find((s) => s.id === r.sessionId);
    const term = params.terms.find((t) => t.id === r.termId);

    return [
      stu?.admissionNumber || r.studentId,
      prof?.fullName || 'Unknown Student',
      cls?.name || r.classId,
      sub?.name || r.subjectId,
      ex?.title || r.examinationId,
      sess?.name || r.sessionId,
      term?.name || r.termId,
      r.objectiveScore,
      r.subjectiveScore,
      r.totalScore,
      r.totalPossibleMarks,
      `${r.percentage}%`,
      r.grade,
      r.status.toUpperCase(),
    ];
  });

  return { headers, rows };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
