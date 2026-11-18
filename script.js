/**
 * AI Test Case Generator — script.js
 *
 * Generation strategy:
 *  1. If an LLM API key is configured (window.LLM_API_KEY), call the LLM.
 *  2. Otherwise fall back to rule-based generation that analyses the
 *     requirement text and picks domain-specific test cases.
 *  3. The generation mode (LLM / Rule-based) is shown in the UI so the
 *     user always knows which method was used.
 *
 * To wire up an LLM, set window.LLM_API_KEY and window.LLM_API_URL before
 * this script loads (e.g. via a server-rendered meta tag or env injection).
 */

// ============================================================
// LLM integration (optional — returns null when unconfigured)
// ============================================================

/**
 * Attempt to generate test cases via an LLM API.
 * Returns an array of test-case objects on success, or null if no key is set.
 * @param {string}   requirement
 * @param {string[]} categories
 * @returns {Promise<Array|null>}
 */
async function tryLLMGeneration(requirement, categories) {
  const apiKey = window.LLM_API_KEY;
  const apiUrl = window.LLM_API_URL ||
    'https://api.openai.com/v1/chat/completions';

  if (!apiKey) return null;          // No key → fall through to rule-based

  const categoryList = categories.join(', ');
  const systemPrompt =
    'You are a QA engineer. Output ONLY a JSON array of test case objects. ' +
    'Each object must have exactly these keys: ' +
    '"id" (string, e.g. TC-F001), "scenario" (string), "type" (string), ' +
    '"input" (string), "expected" (string), "priority" ("High"|"Medium"|"Low"). ' +
    'Do not add prose before or after the JSON.';

  const userPrompt =
    `Generate ${categoryList} test cases for the following requirement or code.\n\n` +
    `Requirement / Code:\n${requirement}\n\n` +
    `Rules:\n` +
    `- Generate Functional cases for normal, happy-path scenarios.\n` +
    `- Generate Negative cases for invalid inputs, errors, and edge failures.\n` +
    `- Generate Boundary cases for extreme values (min, max, zero, empty, etc.).\n` +
    `- Make inputs and expected results SPECIFIC to the given requirement/code.\n` +
    `- Use sequential IDs: TC-F001… for Functional, TC-N001… for Negative, TC-B001… for Boundary.`;

  try {
    const res = await fetch(apiUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       window.LLM_MODEL || 'gpt-4o-mini',
        messages:    [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content ?? '';

    // Strip optional ```json fences before parsing
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================
// Input analysis — detect domain from the requirement text
// ============================================================

/**
 * Return a domain tag based on keywords found in the requirement.
 * Domains map directly to rule-based template sets.
 * @param {string} text
 * @returns {string}  One of: 'division'|'math'|'login'|'form'|'api'|'generic'
 */
function detectDomain(text) {
  const t = text.toLowerCase();

  // Arithmetic / division functions
  if (/(def\s+\w*bagi|def\s+\w*div|def\s+\w*divis|\/\s*b\b|divide|pembagian|division)/.test(t)) {
    return 'division';
  }
  if (/(def\s+\w*|function\s+\w*)(add|sum|sub|mul|calc|math|arith|plus|minus|kali|tambah|kurang)/.test(t) ||
      /\barithmetic\b|\bcalculate\b|\bcompute\b/.test(t)) {
    return 'math';
  }

  // Authentication / login
  if (/(log\s?in|sign\s?in|authenticate|password|email.*login|login.*email)/.test(t)) {
    return 'login';
  }

  // Form / registration / input validation
  if (/(register|sign\s?up|form|submit|validat|input field)/.test(t)) {
    return 'form';
  }

  // REST API / endpoint
  if (/(api|endpoint|rest|http|request|response|status code|json)/.test(t)) {
    return 'api';
  }

  return 'generic';
}

// ============================================================
// Rule-based template sets (domain-specific)
// ============================================================

/**
 * Builds a test-case object for the division / bagi domain.
 * @param {string[]} categories
 * @returns {object[]}
 */
function divisionTestCases(categories) {
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  'Divide two positive integers',
        input:     'a = 10, b = 2',
        expected:  'Returns 5.0',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  'Divide a positive number by a negative number',
        input:     'a = 10, b = -2',
        expected:  'Returns -5.0',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  'Divide two negative numbers',
        input:     'a = -9, b = -3',
        expected:  'Returns 3.0',
      },
      {
        id: 'TC-F004', type: 'Functional', priority: 'Medium',
        scenario:  'Numerator is zero',
        input:     'a = 0, b = 5',
        expected:  'Returns 0.0',
      },
      {
        id: 'TC-F005', type: 'Functional', priority: 'High',
        scenario:  'Result is a non-integer (floating-point)',
        input:     'a = 7, b = 2',
        expected:  'Returns 3.5',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  'Divide by zero — integer denominator',
        input:     'a = 10, b = 0',
        expected:  'Raises ZeroDivisionError (Python) or returns Infinity/NaN (JS)',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  'Divide by zero — float denominator',
        input:     'a = 5.0, b = 0.0',
        expected:  'Raises ZeroDivisionError (Python) or returns Infinity (JS)',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  'Non-numeric string passed as numerator',
        input:     'a = "ten", b = 2',
        expected:  'Raises TypeError; operation does not proceed',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'High',
        scenario:  'Non-numeric string passed as denominator',
        input:     'a = 10, b = "two"',
        expected:  'Raises TypeError; operation does not proceed',
      },
      {
        id: 'TC-N005', type: 'Negative', priority: 'Medium',
        scenario:  'None / null passed as an argument',
        input:     'a = None, b = 2',
        expected:  'Raises TypeError; operation does not proceed',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  'Denominator is the smallest positive float',
        input:     'a = 1, b = 5e-324 (or sys.float_info.min)',
        expected:  'Returns a very large float or Inf without crashing',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'Medium',
        scenario:  'Both arguments are the maximum integer / float',
        input:     'a = sys.maxsize, b = sys.maxsize',
        expected:  'Returns 1.0 without overflow',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  'Both arguments are -1',
        input:     'a = -1, b = -1',
        expected:  'Returns 1.0',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Low',
        scenario:  'Denominator is 1 (identity)',
        input:     'a = 42, b = 1',
        expected:  'Returns 42.0 (same as numerator)',
      },
      {
        id: 'TC-B005', type: 'Boundary', priority: 'Low',
        scenario:  'Numerator is 0, denominator is 0',
        input:     'a = 0, b = 0',
        expected:  'Raises ZeroDivisionError (indeterminate form)',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for general arithmetic / math functions.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function mathTestCases(req, categories) {
  const label = deriveFeatureLabel(req);
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${label} — typical positive inputs`,
        input:     'Two representative positive numbers',
        expected:  'Returns the mathematically correct result',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${label} — mixed positive and negative inputs`,
        input:     'One positive, one negative number',
        expected:  'Returns the sign-correct result',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${label} — floating-point inputs`,
        input:     'Two floats (e.g., 1.5, 2.5)',
        expected:  'Returns the precise floating-point result',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${label} — non-numeric string argument`,
        input:     'A string where a number is expected',
        expected:  'Raises TypeError or equivalent error',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${label} — None/null argument`,
        input:     'None or null in place of a number',
        expected:  'Raises TypeError or equivalent error',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${label} — wrong number of arguments`,
        input:     'Function called with too few or too many args',
        expected:  'Raises TypeError for missing/extra positional arguments',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${label} — zero input`,
        input:     '0 (or 0.0)',
        expected:  'Returns mathematically correct result for zero',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'Medium',
        scenario:  `${label} — maximum integer value`,
        input:     'sys.maxsize or Number.MAX_SAFE_INTEGER',
        expected:  'Returns result without overflow or precision loss',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${label} — very small floating-point value`,
        input:     'sys.float_info.min or Number.MIN_VALUE',
        expected:  'Returns result without underflow',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for login / authentication.
 * @param {string[]} categories
 * @returns {object[]}
 */
function loginTestCases(categories) {
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  'Successful login with valid email and password',
        input:     'email: "user@example.com", password: "Correct$1"',
        expected:  'User is authenticated; session token issued; redirect to dashboard',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  'Login is case-insensitive for email',
        input:     'email: "USER@EXAMPLE.COM", password: "Correct$1"',
        expected:  'Login succeeds (email normalised to lowercase)',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  'Session persists after page reload when "Remember me" is checked',
        input:     'Valid credentials; "Remember me" checkbox ticked',
        expected:  'User remains logged in after browser refresh',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  'Login with incorrect password',
        input:     'email: "user@example.com", password: "WrongPass"',
        expected:  'Returns 401; "Invalid email or password" error shown; no session',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  'Login with unregistered email',
        input:     'email: "notexist@example.com", password: "Any$Pass1"',
        expected:  'Returns 401; generic error shown (do not reveal account existence)',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  'Login with empty email and password',
        input:     'email: "", password: ""',
        expected:  'Validation errors shown for both fields; request not sent',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  'SQL injection attempt in email field',
        input:     "email: \"' OR 1=1 --\", password: \"any\"",
        expected:  'Input sanitised; login rejected; no DB error exposed',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  'Password at minimum length (e.g. 8 characters)',
        input:     'email: valid, password: exactly 8 chars',
        expected:  'Login accepted if credentials are correct',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  'Password one character below the minimum',
        input:     'email: valid, password: 7 chars',
        expected:  'Validation error: "Password must be at least 8 characters"',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  'Email at the maximum allowed length (254 chars)',
        input:     'email: 254-char valid address, password: valid',
        expected:  'Login succeeds',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  'Email one character above the maximum (255 chars)',
        input:     'email: 255-char string, password: valid',
        expected:  'Validation error: "Email address is too long"',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for form submission / registration.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function formTestCases(req, categories) {
  const label = deriveFeatureLabel(req);
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${label} — submit with all required fields valid`,
        input:     'All mandatory fields populated with valid, properly formatted data',
        expected:  'Form submits successfully; success confirmation shown',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${label} — optional fields left blank`,
        input:     'Only required fields filled; optional fields empty',
        expected:  'Form submits successfully without errors',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${label} — form is resettable`,
        input:     'Fill in fields, then press Reset/Clear',
        expected:  'All fields return to their default state',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${label} — submit with all required fields empty`,
        input:     'All required fields left blank',
        expected:  'Validation errors shown for each required field; form not submitted',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${label} — invalid format in a constrained field`,
        input:     'e.g. letters in a numeric field, invalid email format',
        expected:  'Inline validation error specifying the expected format',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${label} — XSS attempt in a text field`,
        input:     '<script>alert(1)</script>',
        expected:  'Input sanitised; script tag not executed; form may reject or escape the value',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${label} — text field at minimum allowed length`,
        input:     'Value exactly at the minimum character limit',
        expected:  'Field accepted; form submits if all other fields are valid',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${label} — text field at maximum allowed length`,
        input:     'Value exactly at the maximum character limit',
        expected:  'Field accepted; form submits if all other fields are valid',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'High',
        scenario:  `${label} — text field one character over the maximum`,
        input:     'Value with max+1 characters',
        expected:  'Validation error or input truncated; excess character rejected',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for a REST API endpoint.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function apiTestCases(req, categories) {
  const label = deriveFeatureLabel(req);
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${label} — successful request with valid payload`,
        input:     'Valid HTTP method, headers, and body/query params',
        expected:  '200 OK; response body matches documented schema',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${label} — response Content-Type is correct`,
        input:     'Valid request with Accept: application/json',
        expected:  'Response Content-Type: application/json; body is valid JSON',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${label} — idempotency for safe methods (GET/HEAD)`,
        input:     'Same GET request sent twice',
        expected:  'Both responses are identical; no side effects',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${label} — missing required field in request body`,
        input:     'POST body without a mandatory field',
        expected:  '400 Bad Request; error message names the missing field',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${label} — request without authorisation header`,
        input:     'No Authorization header / no Bearer token',
        expected:  '401 Unauthorized',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  `${label} — request by user without sufficient permissions`,
        input:     'Valid token for a low-privilege user',
        expected:  '403 Forbidden',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  `${label} — resource not found`,
        input:     'Valid request referencing a non-existent ID',
        expected:  '404 Not Found; error message in response body',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${label} — request body at max allowed payload size`,
        input:     'Body exactly at the documented size limit',
        expected:  'Request accepted; 200 OK',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${label} — request body one byte above max size`,
        input:     'Body exceeding the documented size limit by 1 byte',
        expected:  '413 Payload Too Large',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${label} — numeric query parameter at minimum value`,
        input:     'e.g. page=1, limit=1',
        expected:  'Returns first page / single item correctly',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${label} — numeric query parameter at zero`,
        input:     'e.g. limit=0 or page=0',
        expected:  'Returns empty list or 400 Bad Request per API spec',
      },
    );
  }

  return cases;
}

/**
 * Generic (domain-unknown) test cases — clearly labelled as such.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function genericTestCases(req, categories) {
  const label = deriveFeatureLabel(req);
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `Verify that the feature fulfils the stated requirement: "${label}"`,
        input:     'Valid, expected inputs as described in the requirement',
        expected:  'The feature behaves as described; correct output is returned',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  'All required inputs or parameters are accepted correctly',
        input:     'All mandatory fields/params populated with valid data',
        expected:  'No validation errors; feature executes successfully end-to-end',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  'Feature produces consistent output on repeated calls with same input',
        input:     'Same valid input submitted twice',
        expected:  'Both calls return identical, correct results',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  'Submit empty / missing input where data is required',
        input:     'No input provided; all fields blank or null',
        expected:  'Appropriate validation error raised; operation does not execute',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  'Submit data of an unexpected type',
        input:     'Wrong data type (e.g., string where integer expected)',
        expected:  'TypeError or equivalent; clear error message',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  'Inject special characters or script tags into a text input',
        input:     "<script>alert('xss')</script> or ' OR 1=1 --",
        expected:  'Input sanitised or rejected; no unintended execution',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  'Input at the minimum acceptable value',
        input:     'Value at the documented lower boundary (e.g., 0, 1, "" with min-length 0)',
        expected:  'Feature accepts and processes the minimum correctly',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  'Input at the maximum acceptable value',
        input:     'Value at the documented upper boundary (e.g., max int, max length string)',
        expected:  'Feature accepts and processes the maximum correctly',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'High',
        scenario:  'Input one step beyond the maximum boundary',
        input:     'Value just above the documented upper limit',
        expected:  'Feature rejects the value with a clear boundary-violation error',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  'Input at exactly zero (if numeric)',
        input:     '0 or 0.0',
        expected:  'Feature handles zero gracefully (accepts or rejects per business rules)',
      },
    );
  }

  return cases;
}

// ============================================================
// Core generation logic (rule-based dispatcher)
// ============================================================

/**
 * Synchronously generate test cases using rule-based domain detection.
 * @param {string}   requirement
 * @param {string[]} categories
 * @returns {{ cases: object[], mode: string }}
 */
function generateRuleBased(requirement, categories) {
  const domain = detectDomain(requirement);

  let cases;
  switch (domain) {
    case 'division': cases = divisionTestCases(categories);            break;
    case 'math':     cases = mathTestCases(requirement, categories);   break;
    case 'login':    cases = loginTestCases(categories);               break;
    case 'form':     cases = formTestCases(requirement, categories);   break;
    case 'api':      cases = apiTestCases(requirement, categories);    break;
    default:         cases = genericTestCases(requirement, categories);
  }

  return { cases, mode: 'rule-based', domain };
}

// ============================================================
// DOM helpers
// ============================================================

/** Show or hide an element using the hidden attribute. */
function setVisible(el, visible) {
  if (visible) {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}

/** Map a priority string to its CSS badge class. */
function priorityClass(priority) {
  const map = { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
  return map[priority] || 'badge-low';
}

/** Escape special HTML characters to prevent injection. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a single <tr> element for a test case object.
 * @param {{ id, scenario, type, input, expected, priority }} tc
 * @returns {HTMLTableRowElement}
 */
function buildRow(tc) {
  const tr = document.createElement('tr');

  const cells = [
    tc.id,
    tc.scenario,
    `<span class="type-tag">${escapeHtml(tc.type)}</span>`,
    tc.input,
    tc.expected,
    `<span class="badge ${priorityClass(tc.priority)}">${escapeHtml(tc.priority)}</span>`,
  ];

  cells.forEach((content, idx) => {
    const td = document.createElement('td');
    if (idx === 2 || idx === 5) {
      td.innerHTML = content;
    } else {
      td.textContent = content;
    }
    tr.appendChild(td);
  });

  return tr;
}

/**
 * Extract a short "feature label" from the requirement text.
 * @param {string} req
 * @returns {string}
 */
function deriveFeatureLabel(req) {
  const clean = req.trim().replace(/["""]/g, '"');
  return clean.length > 70 ? clean.slice(0, 67) + '…' : clean;
}

// ============================================================
// Generation-mode banner (shown below results header)
// ============================================================

/**
 * Show or update the generation-mode info banner.
 * @param {'llm'|'rule-based'} mode
 * @param {string}             [domain]  - Detected domain tag (rule-based only)
 */
function setModeBanner(mode, domain) {
  let banner = document.getElementById('generation-mode-banner');

  if (!banner) {
    banner = document.createElement('p');
    banner.id = 'generation-mode-banner';
    banner.style.cssText =
      'margin-bottom:1rem;padding:0.4rem 0.9rem;border-radius:4px;' +
      'font-size:0.8125rem;font-weight:500;border:1px solid;';

    const header = document.querySelector('#results-section .results-header');
    if (header) header.after(banner);
  }

  if (mode === 'llm') {
    banner.textContent = '✦ Generated by AI (LLM)';
    banner.style.background  = '#eff6ff';
    banner.style.color       = '#1d4ed8';
    banner.style.borderColor = '#bfdbfe';
  } else {
    const domainLabel = domain && domain !== 'generic'
      ? ` — domain detected: ${domain}`
      : ' — no specific domain detected; using general templates';
    banner.textContent = `⚙ Rule-based generation (no LLM configured)${domainLabel}`;
    banner.style.background  = '#f8fafc';
    banner.style.color       = '#57606a';
    banner.style.borderColor = '#d0d7de';
  }
}

// ============================================================
// Render results into the table
// ============================================================

/**
 * Populate the results table and make it visible.
 * @param {object[]} testCases
 * @param {'llm'|'rule-based'} mode
 * @param {string}  [domain]
 */
function renderResults(testCases, mode, domain) {
  const tbody   = document.getElementById('results-body');
  const section = document.getElementById('results-section');
  const countEl = document.getElementById('results-count');
  const btnCopy = document.getElementById('btn-copy');

  tbody.innerHTML = '';
  testCases.forEach(tc => tbody.appendChild(buildRow(tc)));

  countEl.textContent =
    `${testCases.length} test case${testCases.length !== 1 ? 's' : ''} generated`;
  setVisible(section, true);
  setModeBanner(mode, domain);

  btnCopy.disabled = false;
  btnCopy.removeAttribute('aria-disabled');

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// Copy results as plain text
// ============================================================

function tableToText() {
  const headers = ['ID', 'Scenario', 'Type', 'Test Input', 'Expected Result', 'Priority'];
  const rows    = Array.from(document.querySelectorAll('#results-body tr'));

  const lines = [headers.join('\t')];
  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    lines.push(cells.map(td => td.textContent.trim()).join('\t'));
  });

  return lines.join('\n');
}

// ============================================================
// Validation
// ============================================================

function validate(requirement, categories) {
  if (!requirement.trim()) {
    return { valid: false, message: 'Please enter a feature or requirement before generating test cases.' };
  }
  if (categories.length === 0) {
    return { valid: false, message: 'Please select at least one test category (Functional, Negative, or Boundary).' };
  }
  return { valid: true, message: '' };
}

// ============================================================
// Event Handlers
// ============================================================

async function handleGenerate() {
  const requirementEl = document.getElementById('requirement');
  const validationEl  = document.getElementById('validation-msg');
  const btnGenerate   = document.getElementById('btn-generate');
  const requirement   = requirementEl.value;

  const categories = Array.from(
    document.querySelectorAll('input[name="category"]:checked')
  ).map(cb => cb.value);

  const { valid, message } = validate(requirement, categories);

  if (!valid) {
    validationEl.textContent = message;
    setVisible(validationEl, true);
    requirementEl.focus();
    return;
  }

  setVisible(validationEl, false);

  // Disable button and show loading state while attempting LLM
  btnGenerate.disabled    = true;
  btnGenerate.textContent = 'Generating…';

  try {
    // 1. Try LLM (returns null if no API key configured)
    const llmCases = await tryLLMGeneration(requirement, categories);

    if (llmCases) {
      renderResults(llmCases, 'llm');
    } else {
      // 2. Fall back to rule-based generation
      const { cases, mode, domain } = generateRuleBased(requirement, categories);
      renderResults(cases, mode, domain);
    }
  } finally {
    btnGenerate.disabled    = false;
    btnGenerate.textContent = 'Generate Test Cases';
  }
}

function handleClear() {
  document.getElementById('requirement').value = '';

  const validationEl = document.getElementById('validation-msg');
  setVisible(validationEl, false);

  setVisible(document.getElementById('results-section'), false);

  const btnCopy = document.getElementById('btn-copy');
  btnCopy.disabled = true;
  btnCopy.setAttribute('aria-disabled', 'true');

  document.getElementById('results-body').innerHTML = '';

  // Remove the mode banner so it doesn't persist
  const banner = document.getElementById('generation-mode-banner');
  if (banner) banner.remove();

  document.getElementById('requirement').focus();
}

function handleCopy() {
  const text = tableToText();

  if (!navigator.clipboard) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopyFeedback(true);
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => showCopyFeedback(true),
    () => showCopyFeedback(false)
  );
}

function showCopyFeedback(success) {
  const btn = document.getElementById('btn-copy');
  const originalText = 'Copy Results';
  btn.textContent = success ? '✓ Copied!' : '✗ Failed';
  setTimeout(() => { btn.textContent = originalText; }, 2000);
}

// ============================================================
// Initial example (pre-loaded on page open)
// Uses the division function so the fix is immediately visible.
// ============================================================

function loadInitialExample() {
  const exampleRequirement =
    'def bagi(a, b):\n    return a / b';

  document.getElementById('requirement').value = exampleRequirement;

  // Check all three categories for the demo
  ['cat-functional', 'cat-negative', 'cat-boundary'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = true;
  });

  handleGenerate();
}

// ============================================================
// Bootstrap — wire up events on DOM ready
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-generate').addEventListener('click', handleGenerate);
  document.getElementById('btn-clear').addEventListener('click', handleClear);
  document.getElementById('btn-copy').addEventListener('click', handleCopy);

  document.getElementById('requirement').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  });

  loadInitialExample();
});
