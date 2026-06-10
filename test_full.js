const http = require('http');

function req(method, path, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5000,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    };
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d), raw: d, cookie: res.headers['set-cookie'] }); }
        catch { resolve({ status: res.statusCode, body: {}, raw: d, cookie: res.headers['set-cookie'] }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: {}, raw: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    fail++;
  }
}

async function run() {
  let r, tc, sc; // teacher cookie, student cookie

  // ── AUTH ──────────────────────────────────────────────────────────────────
  console.log('\n── AUTH ──');

  r = await req('POST', '/auth/login', { email: 'teacher_test@test.com', password: 'test123' });
  check('Teacher login', r.status === 200 && r.body.success, r.raw.substring(0, 100));
  tc = r.cookie?.[0]?.split(';')[0];
  console.log(`  ℹ teacherCookie: "${tc}"`);

  r = await req('POST', '/auth/login', { email: 'student_test@test.com', password: 'test123' });
  check('Student login', r.status === 200 && r.body.success, r.raw.substring(0, 100));
  sc = r.cookie?.[0]?.split(';')[0];
  console.log(`  ℹ studentCookie: "${sc}"`);

  r = await req('GET', '/auth/me', null, tc);
  check('GET /auth/me teacher', r.status === 200 && r.body.user?.role === 'teacher', `status=${r.status} body=${r.raw.substring(0,80)}`);

  r = await req('GET', '/auth/me', null, sc);
  check('GET /auth/me student', r.status === 200 && r.body.user?.role === 'student', `status=${r.status} body=${r.raw.substring(0,80)}`);

  r = await req('GET', '/auth/me', null, null);
  check('GET /auth/me unauth -> 401', r.status === 401);

  // ── DISCIPLINES ───────────────────────────────────────────────────────────
  console.log('\n── DISCIPLINES ──');

  r = await req('POST', '/api/teacher/disciplines', { title: 'Test Discipline Auto', description: 'desc' }, tc);
  check('Create discipline', (r.status === 200 || r.status === 201) && r.body.id, `status=${r.status} ${r.raw.substring(0, 80)}`);
  const discId = r.body.id;

  r = await req('GET', '/api/disciplines', null, tc);
  check('List disciplines (teacher)', r.status === 200 && Array.isArray(r.body));

  r = await req('GET', '/api/disciplines', null, sc);
  check('List disciplines (student)', r.status === 200 && Array.isArray(r.body));

  // ── TESTS ─────────────────────────────────────────────────────────────────
  console.log('\n── TESTS ──');

  r = await req('POST', '/api/teacher/tests', {
    title: 'Auto Full Test', discipline_id: discId,
    passing_score: 60, time_limit: 300, attempts_limit: 3,
    shuffle_questions: false, shuffle_answers: false, is_published: true
  }, tc);
  check('Create test', (r.status === 200 || r.status === 201) && r.body.id, `status=${r.status} ${r.raw.substring(0, 80)}`);
  const testId = r.body.id;

  r = await req('GET', '/api/tests', null, tc);
  check('List tests', r.status === 200 && Array.isArray(r.body));

  // ── QUESTIONS ─────────────────────────────────────────────────────────────
  console.log('\n── QUESTIONS ──');

  // Single choice
  r = await req('POST', `/api/teacher/questions`, {
    test_id: testId, text: 'Single choice question?', type: 'single', weight: 1,
    answers: [
      { text: 'Correct answer', is_correct: true },
      { text: 'Wrong answer 1', is_correct: false },
      { text: 'Wrong answer 2', is_correct: false }
    ]
  }, tc);
  check('Create single question', (r.status === 200 || r.status === 201), `status=${r.status} ${r.raw.substring(0, 80)}`);
  const singleQId = r.body.id;
  let correctSingleAns = r.body.answers?.find(a => a.is_correct)?.id;

  // Multiple choice
  r = await req('POST', `/api/teacher/questions`, {
    test_id: testId, text: 'Multiple choice question?', type: 'multiple', weight: 2,
    answers: [
      { text: 'Correct 1', is_correct: true },
      { text: 'Correct 2', is_correct: true },
      { text: 'Wrong', is_correct: false }
    ]
  }, tc);
  check('Create multiple question', (r.status === 200 || r.status === 201), `status=${r.status} ${r.raw.substring(0, 80)}`);
  const multiQId = r.body.id;
  let correctMultiAns = r.body.answers?.filter(a => a.is_correct).map(a => a.id);

  // Text with etalon (auto-check)
  r = await req('POST', `/api/teacher/questions`, {
    test_id: testId, text: 'What is 2+2?', type: 'text', weight: 1,
    answers: [{ text: '4', is_correct: true }]
  }, tc);
  check('Create text question (auto)', (r.status === 200 || r.status === 201), `status=${r.status} ${r.raw.substring(0, 80)}`);
  const textAutoQId = r.body.id;

  // Text without etalon (manual review)
  r = await req('POST', `/api/teacher/questions`, {
    test_id: testId, text: 'Explain the concept of OOP?', type: 'text', weight: 3,
    answers: []
  }, tc);
  check('Create text question (manual review)', (r.status === 200 || r.status === 201), `status=${r.status} ${r.raw.substring(0, 80)}`);
  const textManualQId = r.body.id;

  // Fetch answer IDs via teacher endpoint (includes is_correct)
  r = await req('GET', `/api/teacher/tests/${testId}/questions`, null, tc);
  if (Array.isArray(r.body)) {
    const sq = r.body.find(q => q.id === singleQId);
    if (sq) correctSingleAns = sq.answers?.find(a => a.is_correct === 1)?.id;
    const mq = r.body.find(q => q.id === multiQId);
    if (mq) correctMultiAns = mq.answers?.filter(a => a.is_correct === 1).map(a => a.id);
  }

  // ── STUDENT ENROLL ────────────────────────────────────────────────────────
  console.log('\n── STUDENT ENROLLMENT ──');

  r = await req('POST', `/api/teacher/disciplines/${discId}/students`, {
    email: 'student_test@test.com'
  }, tc);
  check('Enroll student to discipline', r.status === 200 || r.status === 201, r.raw.substring(0, 100));

  r = await req('GET', '/api/disciplines', null, sc);
  check('Student sees discipline', r.status === 200 && r.body.some?.(d => d.id === discId), r.raw.substring(0, 100));

  // ── ATTEMPT: START ────────────────────────────────────────────────────────
  console.log('\n── TEST ATTEMPT ──');

  // Get test questions as student (after enrollment)
  r = await req('GET', `/api/tests/${testId}/questions`, null, sc);
  check('Get test questions', r.status === 200 && Array.isArray(r.body.questions) && r.body.questions.length === 4, `status=${r.status} len=${r.body?.questions?.length ?? 'n/a'}`);

  r = await req('POST', `/api/student/tests/${testId}/start`, {}, sc);
  check('Start test attempt', r.status === 200 && r.body.attempt_id, r.raw.substring(0, 100));
  const attemptId = r.body.attempt_id;

  // ── ANSWERS ───────────────────────────────────────────────────────────────

  // Single - correct
  r = await req('POST', `/api/student/attempts/${attemptId}/answer`, {
    question_id: singleQId, answer_ids: correctSingleAns
  }, sc);
  check('Answer single (correct)', r.status === 200, r.raw.substring(0, 100));

  // Multiple - correct (both)
  r = await req('POST', `/api/student/attempts/${attemptId}/answer`, {
    question_id: multiQId, answer_ids: correctMultiAns
  }, sc);
  check('Answer multiple (both correct)', r.status === 200, r.raw.substring(0, 100));

  // Text auto - correct
  r = await req('POST', `/api/student/attempts/${attemptId}/answer`, {
    question_id: textAutoQId, text_answer: '4'
  }, sc);
  check('Answer text auto (correct)', r.status === 200, r.raw.substring(0, 100));

  // Text manual - free answer
  r = await req('POST', `/api/student/attempts/${attemptId}/answer`, {
    question_id: textManualQId, text_answer: 'OOP means encapsulation, inheritance and polymorphism'
  }, sc);
  check('Answer text manual (free)', r.status === 200, r.raw.substring(0, 100));

  // ── FINISH ────────────────────────────────────────────────────────────────
  r = await req('POST', `/api/student/attempts/${attemptId}/finish`, {}, sc);
  check('Finish attempt', r.status === 200 && typeof r.body.score === 'number', r.raw.substring(0, 150));
  check('Score > 0 (auto questions scored)', r.body.score > 0, `score=${r.body.score}`);
  check('needs_review = true (manual text question)', r.body.needs_review === true, `needs_review=${r.body.needs_review}`);
  console.log(`  ℹ Score: ${r.body.score}%, correct: ${r.body.correct_answers}/${r.body.total_questions}, needs_review: ${r.body.needs_review}`);

  // ── GET ATTEMPT DETAILS ───────────────────────────────────────────────────
  console.log('\n── ATTEMPT DETAILS ──');
  r = await req('GET', `/api/student/attempts/${attemptId}`, null, sc);
  check('Get attempt details', r.status === 200 && r.body.questions?.length === 4);

  const singleResult = r.body.questions?.find(q => q.id === singleQId);
  const multiResult = r.body.questions?.find(q => q.id === multiQId);
  const textAutoResult = r.body.questions?.find(q => q.id === textAutoQId);
  const textManualResult = r.body.questions?.find(q => q.id === textManualQId);
  
  if (singleResult) console.log(`  ℹ single user_answers: ${JSON.stringify(singleResult.user_answers)}`);
  if (multiResult) console.log(`  ℹ multi user_answers: ${JSON.stringify(multiResult.user_answers)}, correctMultiAns was: ${JSON.stringify(correctMultiAns)}`);

  check('Single: marked correct', singleResult?.user_answers?.[0]?.is_correct === 1, `is_correct=${singleResult?.user_answers?.[0]?.is_correct}`);
  check('Multiple: marked correct (both selected)', multiResult?.user_answers?.every(ua => ua.is_correct === 1), `answers=${JSON.stringify(multiResult?.user_answers?.map(ua => ua.is_correct))}`);
  check('Multiple: 2 answers saved', multiResult?.user_answers?.length === 2, `count=${multiResult?.user_answers?.length}`);
  check('Text auto: marked correct', textAutoResult?.user_answers?.[0]?.is_correct === 1, `is_correct=${textAutoResult?.user_answers?.[0]?.is_correct}`);
  check('Text manual: is_correct is NULL (pending)', textManualResult?.user_answers?.[0]?.is_correct === null, `is_correct=${textManualResult?.user_answers?.[0]?.is_correct}`);

  // ── REVIEW (TEACHER) ──────────────────────────────────────────────────────
  console.log('\n── TEACHER REVIEW ──');

  r = await req('GET', '/api/teacher/review/pending', null, tc);
  check('Review pending list', r.status === 200 && Array.isArray(r.body), r.raw.substring(0, 100));
  check('Attempt in pending list', r.body.some?.(a => a.attempt_id === attemptId), `count=${r.body.length}`);

  r = await req('GET', '/api/teacher/review/pending/count', null, tc);
  check('Review pending count', r.status === 200 && r.body.count >= 1, r.raw.substring(0, 80));

  r = await req('GET', `/api/teacher/review/${attemptId}`, null, tc);
  check('Get review detail', r.status === 200 && r.body.questions?.length > 0, r.raw.substring(0, 100));
  const reviewQuestion = r.body.questions?.[0];
  const userAnswerId = reviewQuestion?.user_answer?.id;

  if (userAnswerId) {
    r = await req('POST', `/api/teacher/review/${attemptId}/answer/${userAnswerId}`, {
      is_correct: true, teacher_comment: 'Отличный ответ'
    }, tc);
    check('Grade answer as correct', r.status === 200, r.raw.substring(0, 100));

    r = await req('POST', `/api/teacher/review/${attemptId}/complete`, {}, tc);
    check('Complete review', r.status === 200 && typeof r.body.score === 'number', r.raw.substring(0, 100));
    console.log(`  ℹ Final score after review: ${r.body.score}%`);
  } else {
    check('Grade answer', false, 'No user_answer id returned');
    check('Complete review', false, 'Skipped');
  }

  // ── REVIEW BADGE COUNT UPDATE ─────────────────────────────────────────────
  r = await req('GET', '/api/teacher/review/pending/count', null, tc);
  check('Pending count = 0 after complete', r.body.count === 0, `count=${r.body.count}`);

  // ── ACCESS CONTROL ────────────────────────────────────────────────────────
  console.log('\n── ACCESS CONTROL ──');

  r = await req('GET', '/api/teacher/review/pending', null, sc);
  check('Student cannot access teacher review -> 403', r.status === 403, r.raw.substring(0, 80));

  r = await req('POST', `/api/teacher/tests/${testId}/questions`, {
    text: 'Hack', type: 'single', weight: 1, answers: []
  }, sc);
  check('Student cannot create questions -> 403', r.status === 403, r.raw.substring(0, 80));

  r = await req('GET', '/api/disciplines', null, null);
  check('Unauthenticated cannot list disciplines -> 401', r.status === 401, r.raw.substring(0, 80));

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(`РЕЗУЛЬТАТ: ${pass} пройдено, ${fail} провалено`);
  if (fail === 0) console.log('✅ ВСЕ ТЕСТЫ ПРОШЛИ');
  else console.log('❌ ЕСТЬ ПРОВАЛЫ — см. выше');
  console.log('══════════════════════════════════════');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
