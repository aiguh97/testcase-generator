/**
 * test.mjs — Node.js test runner for script.js logic (no DOM required).
 * Run with:  node test.mjs
 */

// ── Minimal stubs so the browser-only parts don't crash ──────────────────────
globalThis.window = { LLM_API_KEY: undefined };
globalThis.document = {
  getElementById: () => null,
  querySelector:  () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild() {} }),
  addEventListener() {},
};
// navigator is read-only in Node 24; skip the stub

// ── Inline the pure-logic functions from script.js ───────────────────────────
// (We duplicate only the functions we need to test, to avoid DOM bootstrap.)

function detectDomain(text) {
  const t = text.toLowerCase();
  if (/(def\s+\w*bagi|def\s+\w*div|def\s+\w*divis|\/\s*b\b|divide|pembagian|division)/.test(t)) return 'division';
  if (/(def\s+\w*|function\s+\w*)(add|sum|sub|mul|calc|math|arith|plus|minus|kali|tambah|kurang)/.test(t) ||
      /\barithmetic\b|\bcalculate\b|\bcompute\b/.test(t)) return 'math';
  if (/(log\s?in|sign\s?in|authenticate|password|email.*login|login.*email)/.test(t)) return 'login';
  if (/(register|sign\s?up|form|submit|validat|input field)/.test(t)) return 'form';
  if (/(api|endpoint|rest|http|request|response|status code|json)/.test(t)) return 'api';
  return 'generic';
}

function deriveFeatureLabel(req) {
  const clean = req.trim().replace(/["""]/g, '"');
  return clean.length > 70 ? clean.slice(0, 67) + '…' : clean;
}

function divisionTestCases(categories) {
  const cases = [];
  if (categories.includes('Functional')) {
    cases.push(
      { id:'TC-F001', type:'Functional', priority:'High',   scenario:'Divide two positive integers', input:'a = 10, b = 2', expected:'Returns 5.0' },
      { id:'TC-F002', type:'Functional', priority:'High',   scenario:'Divide a positive number by a negative number', input:'a = 10, b = -2', expected:'Returns -5.0' },
      { id:'TC-F003', type:'Functional', priority:'Medium', scenario:'Divide two negative numbers', input:'a = -9, b = -3', expected:'Returns 3.0' },
      { id:'TC-F004', type:'Functional', priority:'Medium', scenario:'Numerator is zero', input:'a = 0, b = 5', expected:'Returns 0.0' },
      { id:'TC-F005', type:'Functional', priority:'High',   scenario:'Result is a non-integer (floating-point)', input:'a = 7, b = 2', expected:'Returns 3.5' },
    );
  }
  if (categories.includes('Negative')) {
    cases.push(
      { id:'TC-N001', type:'Negative', priority:'High',   scenario:'Divide by zero — integer denominator', input:'a = 10, b = 0', expected:'Raises ZeroDivisionError (Python) or returns Infinity/NaN (JS)' },
      { id:'TC-N002', type:'Negative', priority:'High',   scenario:'Divide by zero — float denominator', input:'a = 5.0, b = 0.0', expected:'Raises ZeroDivisionError (Python) or returns Infinity (JS)' },
      { id:'TC-N003', type:'Negative', priority:'High',   scenario:'Non-numeric string passed as numerator', input:'a = "ten", b = 2', expected:'Raises TypeError; operation does not proceed' },
      { id:'TC-N004', type:'Negative', priority:'High',   scenario:'Non-numeric string passed as denominator', input:'a = 10, b = "two"', expected:'Raises TypeError; operation does not proceed' },
      { id:'TC-N005', type:'Negative', priority:'Medium', scenario:'None / null passed as an argument', input:'a = None, b = 2', expected:'Raises TypeError; operation does not proceed' },
    );
  }
  if (categories.includes('Boundary')) {
    cases.push(
      { id:'TC-B001', type:'Boundary', priority:'High',   scenario:'Denominator is the smallest positive float', input:'a = 1, b = 5e-324 (or sys.float_info.min)', expected:'Returns a very large float or Inf without crashing' },
      { id:'TC-B002', type:'Boundary', priority:'Medium', scenario:'Both arguments are the maximum integer / float', input:'a = sys.maxsize, b = sys.maxsize', expected:'Returns 1.0 without overflow' },
      { id:'TC-B003', type:'Boundary', priority:'Medium', scenario:'Both arguments are -1', input:'a = -1, b = -1', expected:'Returns 1.0' },
      { id:'TC-B004', type:'Boundary', priority:'Low',    scenario:'Denominator is 1 (identity)', input:'a = 42, b = 1', expected:'Returns 42.0 (same as numerator)' },
      { id:'TC-B005', type:'Boundary', priority:'Low',    scenario:'Numerator is 0, denominator is 0', input:'a = 0, b = 0', expected:'Raises ZeroDivisionError (indeterminate form)' },
    );
  }
  return cases;
}

function generateRuleBased(requirement, categories) {
  const domain = detectDomain(requirement);
  let cases;
  switch (domain) {
    case 'division': cases = divisionTestCases(categories); break;
    default: cases = []; break;
  }
  return { cases, mode: 'rule-based', domain };
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n=== detectDomain ===');
assert(detectDomain('def bagi(a, b):\n    return a / b') === 'division',  'bagi() detected as division');
assert(detectDomain('def divide(x, y): return x / y')   === 'division',  'divide() detected as division');
assert(detectDomain('pembagian dua angka')               === 'division',  '"pembagian" detected as division');
assert(detectDomain('Users must log in with email and password') === 'login', 'login requirement detected');
assert(detectDomain('Submit the registration form')      === 'form',    'form requirement detected');
assert(detectDomain('GET /api/users endpoint returns JSON') === 'api',  'API requirement detected');
assert(detectDomain('something completely unrelated')   === 'generic', 'unknown falls back to generic');
assert(detectDomain('def calculate(a, b): return a + b') === 'math',   'calculate() detected as math');

console.log('\n=== divisionTestCases — all three categories ===');
const all = divisionTestCases(['Functional', 'Negative', 'Boundary']);
assert(all.length === 15, `15 total cases (5+5+5), got ${all.length}`);
assert(all.some(c => c.input.includes('b = 0') && c.type === 'Negative'),     'has divide-by-zero negative case');
assert(all.some(c => c.input.includes('"ten"') && c.type === 'Negative'),      'has invalid-type (string) case');
assert(all.some(c => c.input.includes('None') && c.type === 'Negative'),       'has None/null argument case');
assert(all.some(c => c.input.includes('a = 0, b = 5') && c.type === 'Functional'), 'has zero-numerator functional case');
assert(all.some(c => c.input.includes('a = 7, b = 2') && c.type === 'Functional'), 'has float-result functional case');
assert(all.some(c => c.scenario.includes('smallest positive float') && c.type === 'Boundary'), 'has tiny-denominator boundary case');

console.log('\n=== divisionTestCases — functional only ===');
const funcOnly = divisionTestCases(['Functional']);
assert(funcOnly.length === 5, `5 functional cases, got ${funcOnly.length}`);
assert(funcOnly.every(c => c.type === 'Functional'), 'all cases are Functional type');

console.log('\n=== divisionTestCases — negative only ===');
const negOnly = divisionTestCases(['Negative']);
assert(negOnly.length === 5, `5 negative cases, got ${negOnly.length}`);
assert(negOnly.every(c => c.type === 'Negative'), 'all cases are Negative type');

console.log('\n=== divisionTestCases — boundary only ===');
const boundOnly = divisionTestCases(['Boundary']);
assert(boundOnly.length === 5, `5 boundary cases, got ${boundOnly.length}`);
assert(boundOnly.every(c => c.type === 'Boundary'), 'all cases are Boundary type');

console.log('\n=== generateRuleBased dispatch ===');
const r1 = generateRuleBased('def bagi(a, b):\n    return a / b', ['Functional', 'Negative', 'Boundary']);
assert(r1.domain === 'division', 'dispatches to division domain');
assert(r1.mode   === 'rule-based', 'mode is rule-based');
assert(r1.cases.length === 15, `15 cases via dispatch, got ${r1.cases.length}`);

console.log('\n=== No hardcoded auth/DB/form in division output ===');
const forbiddenTerms = ['authentication', 'database', 'log in', 'login', 'sign in', 'register',
                        'idempotent', 'duplicate', 'dependency', 'offline', 'permission', 'unauthorized'];
const divisionOutput = JSON.stringify(r1.cases).toLowerCase();
forbiddenTerms.forEach(term => {
  assert(!divisionOutput.includes(term), `Division output must NOT contain "${term}"`);
});

console.log('\n=== deriveFeatureLabel ===');
const short = 'def bagi(a, b): return a / b';
assert(deriveFeatureLabel(short) === short, 'short label returned as-is');
const long = 'a'.repeat(80);
const label = deriveFeatureLabel(long);
assert(label.length <= 70, `long label truncated to ≤70 chars (got ${label.length})`);
assert(label.endsWith('…'), 'long label ends with ellipsis');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
}
