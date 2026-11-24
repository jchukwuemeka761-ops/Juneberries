import type {
  AcademicClass,
  AcademicSession,
  AcademicTerm,
  AuditLog,
  Department,
  Examination,
  ExaminationAssignment,
  ExaminationAttempt,
  ExaminationQuestion,
  ExaminationResult,
  NotificationItem,
  Profile,
  Question,
  QuestionApproval,
  QuestionBank,
  SchoolDatabase,
  SchoolSettings,
  StaffRecord,
  StudentAnswer,
  StudentEnrollment,
  StudentRecord,
  Subject,
  TeacherAssignment,
} from '../types';
import { hashPassword } from './security';

export function createInitialEmptyDb(): SchoolDatabase {
  const now = new Date().toISOString();

  const settings: SchoolSettings = {
    id: 'settings_default',
    schoolName: 'JUNEBERRIES INTERNATIONAL SCHOOLS',
    motto: 'Integrity, Scholarship & Global Excellence',
    address: 'Plot 14, Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
    email: 'registrar@juneberries.edu.ng',
    phone: '+234 (0) 800 586 3237',
    logoUrl: '/images/juneberry_crest.jpg',
    primaryColor: '#0A1E3D',
    accentColor: '#B8860B',
    defaultInstructions:
      'Read each question carefully before selecting or entering your response. Your answers save automatically to the examination server. Do not switch tabs, refresh unnecessarily, or leave the examination window. When the server timer reaches 00:00:00, your script will be submitted automatically.',
    gradingScale: [
      { grade: 'A', minScore: 70, maxScore: 100, remark: 'Distinction' },
      { grade: 'B', minScore: 60, maxScore: 69, remark: 'Very Good' },
      { grade: 'C', minScore: 50, maxScore: 59, remark: 'Credit' },
      { grade: 'D', minScore: 45, maxScore: 49, remark: 'Pass' },
      { grade: 'E', minScore: 40, maxScore: 44, remark: 'Fair' },
      { grade: 'F', minScore: 0, maxScore: 39, remark: 'Needs Improvement' },
    ],
    allowPartialMultipleSelect: true,
    enableNegativeMarkingDefault: false,
    autoSubmitOnTabLimit: 5,
    allowStudentSelfRegistration: true,
    requireAdminApprovalForStudents: false,
    allowUnapprovedQuestionsByAdmin: false,
    updatedAt: now,
  };

  const departments: Department[] = [
    {
      id: 'dept_primary',
      name: 'Nursery & Primary Department',
      code: 'PRI',
      description: 'Foundational literacy, numeracy, and elementary sciences (Primary 1–6).',
      isActive: true,
      createdAt: now,
    },
    {
      id: 'dept_jss',
      name: 'Junior Secondary Department',
      code: 'JSS',
      description: 'Upper Basic 7–9 curriculum preparing students for BECE.',
      isActive: true,
      createdAt: now,
    },
    {
      id: 'dept_sss',
      name: 'Senior Secondary Department',
      code: 'SSS',
      description: 'Senior secondary coordination across Science, Arts, and Commercial streams.',
      isActive: true,
      createdAt: now,
    },
    {
      id: 'dept_science',
      name: 'Science & Technology Department',
      code: 'SCI',
      description: 'Mathematics, Physics, Chemistry, Biology, Agricultural & Computer Sciences.',
      isActive: true,
      createdAt: now,
    },
    {
      id: 'dept_arts',
      name: 'Arts & Humanities Department',
      code: 'ART',
      description: 'English Language, Literature, Government, Civic Education & Religious Studies.',
      isActive: true,
      createdAt: now,
    },
    {
      id: 'dept_commercial',
      name: 'Commercial & Business Department',
      code: 'COM',
      description: 'Economics, Accounting, Commerce & Business Studies.',
      isActive: true,
      createdAt: now,
    },
  ];

  const classes: AcademicClass[] = [
    { id: 'cls_p1', name: 'Primary 1', code: 'PRY1', levelGroup: 'primary', levelOrder: 1, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_p2', name: 'Primary 2', code: 'PRY2', levelGroup: 'primary', levelOrder: 2, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_p3', name: 'Primary 3', code: 'PRY3', levelGroup: 'primary', levelOrder: 3, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_p4', name: 'Primary 4', code: 'PRY4', levelGroup: 'primary', levelOrder: 4, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_p5', name: 'Primary 5', code: 'PRY5', levelGroup: 'primary', levelOrder: 5, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_p6', name: 'Primary 6', code: 'PRY6', levelGroup: 'primary', levelOrder: 6, departmentId: 'dept_primary', capacity: 35, isActive: true, createdAt: now },
    { id: 'cls_jss1', name: 'JSS 1', code: 'JSS1', levelGroup: 'junior_secondary', levelOrder: 7, departmentId: 'dept_jss', capacity: 40, isActive: true, createdAt: now },
    { id: 'cls_jss2', name: 'JSS 2', code: 'JSS2', levelGroup: 'junior_secondary', levelOrder: 8, departmentId: 'dept_jss', capacity: 40, isActive: true, createdAt: now },
    { id: 'cls_jss3', name: 'JSS 3', code: 'JSS3', levelGroup: 'junior_secondary', levelOrder: 9, departmentId: 'dept_jss', capacity: 40, isActive: true, createdAt: now },
    { id: 'cls_sss1', name: 'SSS 1', code: 'SSS1', levelGroup: 'senior_secondary', levelOrder: 10, departmentId: 'dept_sss', capacity: 40, isActive: true, createdAt: now },
    { id: 'cls_sss2', name: 'SSS 2', code: 'SSS2', levelGroup: 'senior_secondary', levelOrder: 11, departmentId: 'dept_sss', capacity: 40, isActive: true, createdAt: now },
    { id: 'cls_sss3', name: 'SSS 3', code: 'SSS3', levelGroup: 'senior_secondary', levelOrder: 12, departmentId: 'dept_sss', capacity: 40, isActive: true, createdAt: now },
  ];

  const priIds = ['cls_p1', 'cls_p2', 'cls_p3', 'cls_p4', 'cls_p5', 'cls_p6'];
  const jssIds = ['cls_jss1', 'cls_jss2', 'cls_jss3'];
  const sssIds = ['cls_sss1', 'cls_sss2', 'cls_sss3'];

  const subjects: Subject[] = [
    // Primary
    { id: 'sub_pri_math', name: 'Mathematics (Primary)', code: 'PRI-MTH', departmentId: 'dept_primary', levelGroup: 'primary', applicableClassIds: priIds, isActive: true, createdAt: now },
    { id: 'sub_pri_eng', name: 'English Studies', code: 'PRI-ENG', departmentId: 'dept_primary', levelGroup: 'primary', applicableClassIds: priIds, isActive: true, createdAt: now },
    { id: 'sub_pri_sci', name: 'Basic Science (Primary)', code: 'PRI-BSC', departmentId: 'dept_primary', levelGroup: 'primary', applicableClassIds: priIds, isActive: true, createdAt: now },
    { id: 'sub_pri_civic', name: 'Civic Education (Primary)', code: 'PRI-CIV', departmentId: 'dept_primary', levelGroup: 'primary', applicableClassIds: priIds, isActive: true, createdAt: now },
    { id: 'sub_pri_comp', name: 'Computer Studies (Primary)', code: 'PRI-ICT', departmentId: 'dept_primary', levelGroup: 'primary', applicableClassIds: priIds, isActive: true, createdAt: now },
    // Junior Secondary
    { id: 'sub_jss_math', name: 'Mathematics (JSS)', code: 'JSS-MTH', departmentId: 'dept_science', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_eng', name: 'English Language (JSS)', code: 'JSS-ENG', departmentId: 'dept_arts', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_sci', name: 'Basic Science', code: 'JSS-BSC', departmentId: 'dept_science', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_tech', name: 'Basic Technology', code: 'JSS-BTC', departmentId: 'dept_science', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_bus', name: 'Business Studies', code: 'JSS-BUS', departmentId: 'dept_commercial', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_civic', name: 'Civic Education (JSS)', code: 'JSS-CIV', departmentId: 'dept_arts', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    { id: 'sub_jss_ict', name: 'Computer Studies (JSS)', code: 'JSS-ICT', departmentId: 'dept_science', levelGroup: 'junior_secondary', applicableClassIds: jssIds, isActive: true, createdAt: now },
    // Senior Secondary
    { id: 'sub_sss_math', name: 'Mathematics (SSS)', code: 'SSS-MTH', departmentId: 'dept_science', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_eng', name: 'English Language (SSS)', code: 'SSS-ENG', departmentId: 'dept_arts', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_bio', name: 'Biology', code: 'SSS-BIO', departmentId: 'dept_science', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_chem', name: 'Chemistry', code: 'SSS-CHM', departmentId: 'dept_science', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_phy', name: 'Physics', code: 'SSS-PHY', departmentId: 'dept_science', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_econ', name: 'Economics', code: 'SSS-ECN', departmentId: 'dept_commercial', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_gov', name: 'Government', code: 'SSS-GOV', departmentId: 'dept_arts', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_lit', name: 'Literature in English', code: 'SSS-LIT', departmentId: 'dept_arts', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_acc', name: 'Financial Accounting', code: 'SSS-ACC', departmentId: 'dept_commercial', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
    { id: 'sub_sss_ict', name: 'Computer Studies (SSS)', code: 'SSS-ICT', departmentId: 'dept_science', levelGroup: 'senior_secondary', applicableClassIds: sssIds, isActive: true, createdAt: now },
  ];

  const sessions: AcademicSession[] = [
    {
      id: 'sess_2026_2027',
      name: '2026/2027 Academic Session',
      startDate: '2026-09-14',
      endDate: '2027-07-23',
      isCurrent: true,
      createdAt: now,
    },
  ];

  const terms: AcademicTerm[] = [
    {
      id: 'term_1',
      sessionId: 'sess_2026_2027',
      name: 'First Term',
      startDate: '2026-09-14',
      endDate: '2026-12-18',
      isCurrent: true,
      createdAt: now,
    },
    {
      id: 'term_2',
      sessionId: 'sess_2026_2027',
      name: 'Second Term',
      startDate: '2027-01-11',
      endDate: '2027-04-09',
      isCurrent: false,
      createdAt: now,
    },
    {
      id: 'term_3',
      sessionId: 'sess_2026_2027',
      name: 'Third Term',
      startDate: '2027-04-26',
      endDate: '2027-07-23',
      isCurrent: false,
      createdAt: now,
    },
  ];

  return {
    initialized: false,
    settings,
    profiles: [],
    students: [],
    staff: [],
    departments,
    classes,
    subjects,
    sessions,
    terms,
    enrollments: [],
    teacherAssignments: [],
    questionBanks: [],
    questions: [],
    attachments: [],
    questionApprovals: [],
    examinations: [],
    examinationQuestions: [],
    examinationAssignments: [],
    attempts: [],
    answers: [],
    results: [],
    resultApprovals: [],
    notifications: [],
    incidents: [],
    auditLogs: [],
    passwordResetTokens: [],
  };
}

export function applySampleSchoolSeed(
  db: SchoolDatabase,
  samplePassword: string,
  adminProfileId: string
): void {
  const now = new Date().toISOString();
  const sampleHash = hashPassword(samplePassword);

  const staffSpecs: Array<{
    id: string;
    profileId: string;
    email: string;
    fullName: string;
    role: Profile['role'];
    staffNumber: string;
    departmentId?: string;
    designation: string;
  }> = [
    {
      id: 'staff_principal',
      profileId: 'prof_principal',
      email: 'principal@juneberryschools.edu.ng',
      fullName: 'Dr. Folake Adeyemi',
      role: 'principal',
      staffNumber: 'JBS/STF/002',
      designation: 'Principal',
    },
    {
      id: 'staff_exam_officer',
      profileId: 'prof_exam_officer',
      email: 'exams@juneberryschools.edu.ng',
      fullName: 'Mr. Chukwudi Okafor',
      role: 'exam_officer',
      staffNumber: 'JBS/STF/003',
      designation: 'Chief Examination Officer',
    },
    {
      id: 'staff_hod_sci',
      profileId: 'prof_hod_sci',
      email: 'hod.science@juneberryschools.edu.ng',
      fullName: 'Mrs. Amina Bello',
      role: 'hod',
      staffNumber: 'JBS/STF/004',
      departmentId: 'dept_science',
      designation: 'HOD, Science & Technology',
    },
    {
      id: 'staff_teacher_bio',
      profileId: 'prof_teacher_bio',
      email: 'teacher.biology@juneberryschools.edu.ng',
      fullName: 'Mr. Babatunde Ogunleye',
      role: 'teacher',
      staffNumber: 'JBS/STF/005',
      departmentId: 'dept_science',
      designation: 'Senior Biology & Basic Science Teacher',
    },
    {
      id: 'staff_teacher_math',
      profileId: 'prof_teacher_math',
      email: 'teacher.maths@juneberryschools.edu.ng',
      fullName: 'Ms. Ngozi Eze',
      role: 'teacher',
      staffNumber: 'JBS/STF/006',
      departmentId: 'dept_science',
      designation: 'Mathematics & Physics Teacher',
    },
    {
      id: 'staff_invigilator',
      profileId: 'prof_invigilator',
      email: 'invigilator@juneberryschools.edu.ng',
      fullName: 'Mr. Ibrahim Danjuma',
      role: 'invigilator',
      staffNumber: 'JBS/STF/007',
      designation: 'CBT Hall Invigilator',
    },
  ];

  for (const s of staffSpecs) {
    const emailTaken = db.profiles.some((p) => p.email.toLowerCase() === s.email.toLowerCase());
    const staffNoTaken = db.staff.some((st) => st.staffNumber.toUpperCase() === s.staffNumber.toUpperCase());
    if (!db.profiles.some((p) => p.id === s.profileId) && !emailTaken) {
      db.profiles.push({
        id: s.profileId,
        email: s.email,
        fullName: s.fullName,
        role: s.role,
        isActive: true,
        passwordHash: sampleHash,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!db.staff.some((st) => st.id === s.id) && !staffNoTaken && !emailTaken) {
      db.staff.push({
        id: s.id,
        profileId: s.profileId,
        staffNumber: s.staffNumber,
        departmentId: s.departmentId,
        designation: s.designation,
        isSampleData: true,
        createdAt: now,
      });
    }
  }

  // Link HOD to Science Dept
  const sciDept = db.departments.find((d) => d.id === 'dept_science');
  if (sciDept) sciDept.hodStaffId = 'staff_hod_sci';

  // Teacher assignments
  const assignments: TeacherAssignment[] = [
    { id: 'ta_1', staffId: 'staff_teacher_bio', classId: 'cls_sss2', subjectId: 'sub_sss_bio', sessionId: 'sess_2026_2027', createdAt: now },
    { id: 'ta_2', staffId: 'staff_teacher_bio', classId: 'cls_jss3', subjectId: 'sub_jss_sci', sessionId: 'sess_2026_2027', createdAt: now },
    { id: 'ta_3', staffId: 'staff_teacher_math', classId: 'cls_sss2', subjectId: 'sub_sss_phy', sessionId: 'sess_2026_2027', createdAt: now },
    { id: 'ta_4', staffId: 'staff_teacher_math', classId: 'cls_sss2', subjectId: 'sub_sss_math', sessionId: 'sess_2026_2027', createdAt: now },
    { id: 'ta_5', staffId: 'staff_teacher_math', classId: 'cls_p6', subjectId: 'sub_pri_math', sessionId: 'sess_2026_2027', createdAt: now },
  ];
  for (const a of assignments) {
    if (!db.teacherAssignments.some((x) => x.id === a.id)) db.teacherAssignments.push(a);
  }

  // Sample students across Primary 6, JSS 3, SSS 1, SSS 2, SSS 3
  const studentSpecs: Array<{
    id: string;
    profileId: string;
    email: string;
    fullName: string;
    admissionNumber: string;
    classId: string;
    departmentId: string;
    gender: 'Male' | 'Female';
    status: StudentRecord['accountStatus'];
  }> = [
    { id: 'stu_1', profileId: 'prof_stu_1', email: 'chidinma.nwosu@student.juneberryschools.edu.ng', fullName: 'Chidinma Nwosu', admissionNumber: 'JBS/2026/001', classId: 'cls_sss2', departmentId: 'dept_science', gender: 'Female', status: 'active' },
    { id: 'stu_2', profileId: 'prof_stu_2', email: 'adebayo.salami@student.juneberryschools.edu.ng', fullName: 'Adebayo Salami', admissionNumber: 'JBS/2026/002', classId: 'cls_sss2', departmentId: 'dept_science', gender: 'Male', status: 'active' },
    { id: 'stu_3', profileId: 'prof_stu_3', email: 'zainab.musa@student.juneberryschools.edu.ng', fullName: 'Zainab Musa', admissionNumber: 'JBS/2026/003', classId: 'cls_jss3', departmentId: 'dept_jss', gender: 'Female', status: 'active' },
    { id: 'stu_4', profileId: 'prof_stu_4', email: 'emeka.okoro@student.juneberryschools.edu.ng', fullName: 'Emeka Okoro', admissionNumber: 'JBS/2026/004', classId: 'cls_p6', departmentId: 'dept_primary', gender: 'Male', status: 'active' },
    { id: 'stu_5', profileId: 'prof_stu_5', email: 'temitope.balogun@student.juneberryschools.edu.ng', fullName: 'Temitope Balogun', admissionNumber: 'JBS/2026/005', classId: 'cls_sss3', departmentId: 'dept_science', gender: 'Female', status: 'active' },
    { id: 'stu_6', profileId: 'prof_stu_6', email: 'yusuf.abdullahi@student.juneberryschools.edu.ng', fullName: 'Yusuf Abdullahi', admissionNumber: 'JBS/2026/006', classId: 'cls_sss1', departmentId: 'dept_commercial', gender: 'Male', status: 'pending_activation' },
  ];

  for (const st of studentSpecs) {
    const emailTaken = db.profiles.some((p) => p.email.toLowerCase() === st.email.toLowerCase());
    const admTaken = db.students.some((x) => x.admissionNumber.toUpperCase() === st.admissionNumber.toUpperCase());
    if (!db.profiles.some((p) => p.id === st.profileId) && !emailTaken) {
      db.profiles.push({
        id: st.profileId,
        email: st.email,
        fullName: st.fullName,
        role: 'student',
        isActive: st.status === 'active',
        passwordHash: sampleHash,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!db.students.some((x) => x.id === st.id) && !admTaken && !emailTaken) {
      db.students.push({
        id: st.id,
        profileId: st.profileId,
        admissionNumber: st.admissionNumber,
        classId: st.classId,
        departmentId: st.departmentId,
        gender: st.gender,
        guardianName: `Parent of ${st.fullName}`,
        guardianPhone: '+234 803 000 1122',
        accountStatus: st.status,
        isSampleData: true,
        createdAt: now,
      });
      const enrollment: StudentEnrollment = {
        id: `enr_${st.id}`,
        studentId: st.id,
        sessionId: 'sess_2026_2027',
        termId: 'term_1',
        classId: st.classId,
        subjectIds: db.subjects
          .filter((sub) => sub.applicableClassIds.includes(st.classId))
          .map((sub) => sub.id),
        status: 'enrolled',
        createdAt: now,
      };
      db.enrollments.push(enrollment);
    }
  }

  // Question banks
  const banks: QuestionBank[] = [
    { id: 'qb_bio_sss2', title: 'SSS 2 Biology Core Question Bank', subjectId: 'sub_sss_bio', classId: 'cls_sss2', departmentId: 'dept_science', createdByProfileId: 'prof_teacher_bio', createdAt: now },
    { id: 'qb_phy_sss2', title: 'SSS 2 Physics Mechanics & Electricity', subjectId: 'sub_sss_phy', classId: 'cls_sss2', departmentId: 'dept_science', createdByProfileId: 'prof_teacher_math', createdAt: now },
    { id: 'qb_mth_p6', title: 'Primary 6 Quantitative Numeracy Bank', subjectId: 'sub_pri_math', classId: 'cls_p6', departmentId: 'dept_primary', createdByProfileId: 'prof_teacher_math', createdAt: now },
  ];
  for (const b of banks) {
    if (!db.questionBanks.some((x) => x.id === b.id)) db.questionBanks.push(b);
  }

  // Questions covering all 8 question types
  const sampleQuestions: Question[] = [
    {
      id: 'q_bio_1',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Cell Structure & Function',
      subtopic: 'Plant Organelles',
      difficulty: 'medium',
      marks: 2,
      questionType: 'image_based',
      questionText: 'Examine the eukaryotic plant cell diagram. Which organelle labelled D houses the genetic material (DNA) and coordinates cellular activities?',
      options: [
        { id: 'A', label: 'A', text: 'Cell Wall' },
        { id: 'B', label: 'B', text: 'Chloroplast' },
        { id: 'C', label: 'C', text: 'Mitochondrion' },
        { id: 'D', label: 'D', text: 'Nucleus' },
      ],
      correctAnswer: 'D',
      explanation: 'Label D points to the nucleus, which contains chromatin/DNA.',
      imageUrl: '/images/diagram_plant_cell.jpg',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_2',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Cell Structure & Function',
      subtopic: 'Turgidity & Osmosis',
      difficulty: 'easy',
      marks: 1,
      questionType: 'true_false',
      questionText: 'A plant cell placed in a hypotonic solution becomes turgid without bursting because of its rigid cellulose cell wall.',
      options: [
        { id: 'True', label: 'A', text: 'True' },
        { id: 'False', label: 'B', text: 'False' },
      ],
      correctAnswer: 'True',
      explanation: 'The cellulose cell wall exerts turgor pressure that prevents lysis.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_3',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Cellular Respiration',
      subtopic: 'Organelles',
      difficulty: 'medium',
      marks: 3,
      questionType: 'multiple_select',
      questionText: 'Select ALL organelles in the plant cell that possess a double membrane AND their own circular DNA.',
      options: [
        { id: 'A', label: 'A', text: 'Chloroplast' },
        { id: 'B', label: 'B', text: 'Golgi Apparatus' },
        { id: 'C', label: 'C', text: 'Mitochondrion' },
        { id: 'D', label: 'D', text: 'Central Vacuole' },
      ],
      correctAnswer: ['A', 'C'],
      explanation: 'Both chloroplasts and mitochondria are semi-autonomous double-membrane organelles.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_4',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Photosynthesis',
      subtopic: 'Pigments',
      difficulty: 'easy',
      marks: 2,
      questionType: 'fill_in_gap',
      questionText: 'The primary green pigment inside chloroplasts responsible for absorbing light energy during photosynthesis is called ____.',
      options: [],
      correctAnswer: 'chlorophyll',
      acceptedAnswers: ['chlorophyll', 'chlorophyll a'],
      explanation: 'Chlorophyll absorbs red and blue wavelengths of sunlight.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_5',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Cell Organelles',
      subtopic: 'Functions',
      difficulty: 'medium',
      marks: 4,
      questionType: 'matching',
      questionText: 'Match each cellular structure on the left with its primary biological function on the right.',
      options: [],
      matchingPairs: [
        { id: 'mp_1', left: 'Mitochondrion', right: 'ATP synthesis via aerobic respiration' },
        { id: 'mp_2', left: 'Ribosome', right: 'Protein synthesis' },
        { id: 'mp_3', left: 'Golgi Body', right: 'Modification and packaging of proteins' },
        { id: 'mp_4', left: 'Vacuole', right: 'Maintenance of osmotic turgor pressure' },
      ],
      correctAnswer: {
        Mitochondrion: 'ATP synthesis via aerobic respiration',
        Ribosome: 'Protein synthesis',
        'Golgi Body': 'Modification and packaging of proteins',
        Vacuole: 'Maintenance of osmotic turgor pressure',
      },
      explanation: 'Standard organelle structure-function pairings.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_6',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Transport in Plants',
      subtopic: 'Transpiration',
      difficulty: 'hard',
      marks: 8,
      questionType: 'essay',
      questionText: 'Explain four environmental factors that increase the rate of transpiration in flowering plants and describe how stomata regulate water loss.',
      options: [],
      correctAnswer: 'Temperature, wind speed, low relative humidity, light intensity, and guard cell turgor regulation.',
      markingGuide: 'Award 1.5 marks per factor explained (6 marks) + 2 marks for stomatal guard cell mechanism.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_bio_pending',
      bankId: 'qb_bio_sss2',
      subjectId: 'sub_sss_bio',
      classId: 'cls_sss2',
      topic: 'Ecology',
      subtopic: 'Nutrient Cycles',
      difficulty: 'medium',
      marks: 2,
      questionType: 'mcq',
      questionText: 'Which bacteria convert atmospheric nitrogen into nitrates in root nodules of leguminous plants?',
      options: [
        { id: 'A', label: 'A', text: 'Rhizobium' },
        { id: 'B', label: 'B', text: 'Nitrosomonas' },
        { id: 'C', label: 'C', text: 'Azotobacter' },
        { id: 'D', label: 'D', text: 'Pseudomonas' },
      ],
      correctAnswer: 'A',
      explanation: 'Rhizobium forms symbiotic relationships in legume root nodules.',
      teacherProfileId: 'prof_teacher_bio',
      approvalStatus: 'submitted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_phy_1',
      bankId: 'qb_phy_sss2',
      subjectId: 'sub_sss_phy',
      classId: 'cls_sss2',
      topic: 'Current Electricity',
      subtopic: 'Parallel Circuits',
      difficulty: 'medium',
      marks: 2,
      questionType: 'image_based',
      questionText: 'In the circuit diagram shown, if R1 = 6 ohms and R2 = 3 ohms, what is the combined equivalent resistance between junctions J1 and J2?',
      options: [
        { id: 'A', label: 'A', text: '9.0 ohms' },
        { id: 'B', label: 'B', text: '4.5 ohms' },
        { id: 'C', label: 'C', text: '2.0 ohms' },
        { id: 'D', label: 'D', text: '1.5 ohms' },
      ],
      correctAnswer: 'C',
      explanation: '1/R = 1/6 + 1/3 = 3/6 = 1/2, hence R = 2.0 ohms.',
      imageUrl: '/images/diagram_circuit_physics.jpg',
      teacherProfileId: 'prof_teacher_math',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_phy_2',
      bankId: 'qb_phy_sss2',
      subjectId: 'sub_sss_phy',
      classId: 'cls_sss2',
      topic: 'Current Electricity',
      subtopic: 'Kirchhoff Laws',
      difficulty: 'easy',
      marks: 2,
      questionType: 'short_answer',
      questionText: 'State the SI unit of electrical resistance.',
      options: [],
      correctAnswer: 'Ohm',
      acceptedAnswers: ['ohm', 'ohms'],
      explanation: 'Electrical resistance is measured in Ohms.',
      teacherProfileId: 'prof_teacher_math',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q_pri_1',
      bankId: 'qb_mth_p6',
      subjectId: 'sub_pri_math',
      classId: 'cls_p6',
      topic: 'Fractions & Percentages',
      difficulty: 'easy',
      marks: 2,
      questionType: 'mcq',
      questionText: 'A pupil scored 18 out of 25 in a Mathematics quiz. What is this score as a percentage?',
      options: [
        { id: 'A', label: 'A', text: '64%' },
        { id: 'B', label: 'B', text: '72%' },
        { id: 'C', label: 'C', text: '75%' },
        { id: 'D', label: 'D', text: '82%' },
      ],
      correctAnswer: 'B',
      explanation: '(18 / 25) * 100 = 72%.',
      teacherProfileId: 'prof_teacher_math',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const q of sampleQuestions) {
    if (!db.questions.some((x) => x.id === q.id)) db.questions.push(q);
  }

  const approvalRecord: QuestionApproval = {
    id: 'qa_1',
    questionId: 'q_bio_1',
    reviewerProfileId: 'prof_hod_sci',
    action: 'approved',
    comment: 'Diagram clarity and WAEC-aligned phrasing verified.',
    createdAt: now,
  };
  if (!db.questionApprovals.some((x) => x.id === approvalRecord.id)) {
    db.questionApprovals.push(approvalRecord);
  }

  // Examinations
  const exams: Examination[] = [
    {
      id: 'exam_sss2_bio_mid',
      title: 'SSS 2 First Term Mid-Term Biology CBT',
      sessionId: 'sess_2026_2027',
      termId: 'term_1',
      classId: 'cls_sss2',
      subjectId: 'sub_sss_bio',
      examType: 'mid_term',
      examDate: '2026-11-24',
      startTime: '08:00',
      endTime: '18:00',
      durationMinutes: 45,
      totalMarks: 20,
      questionCount: 6,
      passMarkPercent: 50,
      maxAttempts: 1,
      instructions:
        'Answer all 6 questions (including the Plant Cell diagram and Essay section). Objective marks calculate automatically; Essay scripts are graded by Mr. Ogunleye.',
      assignedStudentIds: ['stu_1', 'stu_2'],
      assignedTeacherProfileIds: ['prof_teacher_bio'],
      assignedInvigilatorProfileIds: ['prof_invigilator'],
      randomiseQuestions: false,
      randomiseOptions: false,
      restrictNavigation: false,
      enableNegativeMarking: false,
      negativeMarkPenalty: 0,
      autoPublishObjectiveResults: false,
      status: 'active',
      createdByProfileId: 'prof_exam_officer',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'exam_sss2_phy_ca',
      title: 'SSS 2 Physics Continuous Assessment 1',
      sessionId: 'sess_2026_2027',
      termId: 'term_1',
      classId: 'cls_sss2',
      subjectId: 'sub_sss_phy',
      examType: 'continuous_assessment',
      examDate: '2026-11-24',
      startTime: '08:00',
      endTime: '20:00',
      durationMinutes: 20,
      totalMarks: 4,
      questionCount: 2,
      passMarkPercent: 50,
      maxAttempts: 2,
      instructions:
        'Review the circuit diagram carefully before selecting your answers. Automatic marking applies immediately upon submission.',
      assignedStudentIds: ['stu_1', 'stu_2'],
      assignedTeacherProfileIds: ['prof_teacher_math'],
      assignedInvigilatorProfileIds: ['prof_invigilator'],
      randomiseQuestions: false,
      randomiseOptions: false,
      restrictNavigation: false,
      enableNegativeMarking: false,
      negativeMarkPenalty: 0,
      autoPublishObjectiveResults: true,
      status: 'active',
      createdByProfileId: 'prof_exam_officer',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'exam_p6_math_quiz',
      title: 'Primary 6 Weekly Quantitative Quiz',
      sessionId: 'sess_2026_2027',
      termId: 'term_1',
      classId: 'cls_p6',
      subjectId: 'sub_pri_math',
      examType: 'weekly_test',
      examDate: '2026-11-28',
      startTime: '09:00',
      endTime: '11:00',
      durationMinutes: 25,
      totalMarks: 2,
      questionCount: 1,
      passMarkPercent: 50,
      maxAttempts: 1,
      instructions: 'Show neat working on your rough sheet and select the correct option.',
      assignedStudentIds: ['stu_4'],
      assignedTeacherProfileIds: ['prof_teacher_math'],
      assignedInvigilatorProfileIds: ['prof_invigilator'],
      randomiseQuestions: false,
      randomiseOptions: false,
      restrictNavigation: false,
      enableNegativeMarking: false,
      negativeMarkPenalty: 0,
      autoPublishObjectiveResults: true,
      status: 'scheduled',
      createdByProfileId: 'prof_exam_officer',
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const ex of exams) {
    if (!db.examinations.some((x) => x.id === ex.id)) db.examinations.push(ex);
  }

  const examQuestions: ExaminationQuestion[] = [
    { id: 'eq_1', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_1', orderIndex: 0 },
    { id: 'eq_2', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_2', orderIndex: 1 },
    { id: 'eq_3', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_3', orderIndex: 2 },
    { id: 'eq_4', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_4', orderIndex: 3 },
    { id: 'eq_5', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_5', orderIndex: 4 },
    { id: 'eq_6', examinationId: 'exam_sss2_bio_mid', questionId: 'q_bio_6', orderIndex: 5 },
    { id: 'eq_7', examinationId: 'exam_sss2_phy_ca', questionId: 'q_phy_1', orderIndex: 0 },
    { id: 'eq_8', examinationId: 'exam_sss2_phy_ca', questionId: 'q_phy_2', orderIndex: 1 },
    { id: 'eq_9', examinationId: 'exam_p6_math_quiz', questionId: 'q_pri_1', orderIndex: 0 },
  ];
  for (const eq of examQuestions) {
    if (!db.examinationQuestions.some((x) => x.id === eq.id)) db.examinationQuestions.push(eq);
  }

  const examAssignments: ExaminationAssignment[] = [
    { id: 'ea_1', examinationId: 'exam_sss2_bio_mid', studentId: 'stu_1', eligible: true, createdAt: now },
    { id: 'ea_2', examinationId: 'exam_sss2_bio_mid', studentId: 'stu_2', eligible: true, createdAt: now },
    { id: 'ea_3', examinationId: 'exam_sss2_phy_ca', studentId: 'stu_1', eligible: true, createdAt: now },
    { id: 'ea_4', examinationId: 'exam_sss2_phy_ca', studentId: 'stu_2', eligible: true, createdAt: now },
    { id: 'ea_5', examinationId: 'exam_p6_math_quiz', studentId: 'stu_4', eligible: true, createdAt: now },
  ];
  for (const ea of examAssignments) {
    if (!db.examinationAssignments.some((x) => x.id === ea.id)) db.examinationAssignments.push(ea);
  }

  // One completed & published sample attempt for stu_2 (Adebayo Salami) so analytics & monitoring show live records immediately
  const sampleAttempt: ExaminationAttempt = {
    id: 'att_sample_adebayo',
    examinationId: 'exam_sss2_phy_ca',
    studentId: 'stu_2',
    attemptNumber: 1,
    status: 'graded',
    questionOrder: ['q_phy_1', 'q_phy_2'],
    optionOrders: { q_phy_1: ['A', 'B', 'C', 'D'] },
    startedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    deadlineAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    submittedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    connectionInterruptions: 0,
    tabVisibilityChanges: 1,
    focusLosses: 0,
    pageRefreshes: 0,
    createdAt: now,
  };
  if (!db.attempts.some((a) => a.id === sampleAttempt.id)) {
    db.attempts.push(sampleAttempt);
    const ans1: StudentAnswer = {
      id: 'ans_sample_1',
      attemptId: 'att_sample_adebayo',
      questionId: 'q_phy_1',
      response: 'C',
      flaggedForReview: false,
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: 2,
      updatedAt: now,
    };
    const ans2: StudentAnswer = {
      id: 'ans_sample_2',
      attemptId: 'att_sample_adebayo',
      questionId: 'q_phy_2',
      response: 'Ohm',
      flaggedForReview: false,
      isObjectiveMarked: true,
      requiresManualMarking: false,
      marksAwarded: 2,
      updatedAt: now,
    };
    db.answers.push(ans1, ans2);

    const res: ExaminationResult = {
      id: 'res_sample_1',
      attemptId: 'att_sample_adebayo',
      examinationId: 'exam_sss2_phy_ca',
      studentId: 'stu_2',
      sessionId: 'sess_2026_2027',
      termId: 'term_1',
      classId: 'cls_sss2',
      subjectId: 'sub_sss_phy',
      objectiveScore: 4,
      subjectiveScore: 0,
      totalScore: 4,
      totalPossibleMarks: 4,
      percentage: 100,
      grade: 'A',
      remark: 'Distinction',
      passed: true,
      status: 'published',
      manualGradingCompleted: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.results.push(res);
  }

  // Notifications
  const notifs: NotificationItem[] = [
    {
      id: 'notif_1',
      recipientProfileId: 'prof_stu_1',
      title: 'SSS 2 Biology Mid-Term CBT is Now Open',
      message: 'Your SSS 2 First Term Mid-Term Biology CBT is active. Duration: 45 minutes.',
      category: 'exam',
      isRead: false,
      linkView: 'student-exams',
      createdAt: now,
    },
    {
      id: 'notif_2',
      recipientProfileId: 'prof_hod_sci',
      title: '1 Biology Question Awaiting Review',
      message: 'Mr. Babatunde Ogunleye submitted a new Ecology question for HOD approval.',
      category: 'question',
      isRead: false,
      linkView: 'hod-approvals',
      createdAt: now,
    },
    {
      id: 'notif_3',
      recipientProfileId: adminProfileId,
      title: '1 Pending Student Account Activation',
      message: 'Yusuf Abdullahi (JBS/2026/006) is awaiting administrator account activation.',
      category: 'account',
      isRead: false,
      linkView: 'admin-students',
      createdAt: now,
    },
  ];
  for (const n of notifs) {
    if (!db.notifications.some((x) => x.id === n.id)) db.notifications.push(n);
  }

  const audit: AuditLog = {
    id: `aud_seed_${Date.now()}`,
    actorProfileId: adminProfileId,
    actorName: 'System Initializer',
    actorRole: 'super_admin',
    action: 'SEED_SAMPLE_DATA',
    entityType: 'system',
    entityId: 'juneberry',
    details: 'Initialized Juneberry International Schools sample curriculum, staff, students, question bank, and examinations.',
    createdAt: now,
  };
  db.auditLogs.unshift(audit);
}
