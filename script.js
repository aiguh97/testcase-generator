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
 * @returns {string}
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

  // Password reset / forgot password (before generic login check)
  if (/(forgot\s*password|reset\s*password|password\s*reset|password\s*recovery)/.test(t)) {
    return 'passwordReset';
  }

  // Authentication / login
  if (/(log\s?in|sign\s?in|authenticate|password|email.*login|login.*email)/.test(t)) {
    return 'login';
  }

  // File upload / attachment
  if (/(upload|file\s*upload|attach|attachment|import\s*file|choose\s*file)/.test(t)) {
    return 'upload';
  }

  // Search / filter / query
  if (/(search|filter|query|find\s+\w|look\s*up|lookup)/.test(t)) {
    return 'search';
  }

  // Payment / checkout / order
  if (/(payment|checkout|purchase|order|cart|billing|credit\s*card|debit\s*card|invoice)/.test(t)) {
    return 'payment';
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
// Language detection — Python vs JavaScript vs natural language
// ============================================================

/**
 * Detect the programming language (or absence of one) in the input.
 *
 * Returns:
 *  'python'     — Python source code detected
 *  'javascript' — JavaScript / TypeScript source code detected
 *  'natural'    — natural-language requirement (no code detected)
 *
 * @param {string} text
 * @returns {'python'|'javascript'|'natural'}
 */
function detectLanguage(text) {
  const t = text.trim();

  // ---- Python signals -------------------------------------------------
  // def keyword, Python-style None/True/False literals, indentation with
  // colons, common stdlib imports, type hints (a: int), print(), f-strings
  const pythonScore = (
    (/\bdef\s+\w+\s*\(/.test(t)         ? 4 : 0) +   // def func():
    (/:\s*\n/.test(t)                    ? 2 : 0) +   // block colon + newline
    (/\bNone\b/.test(t)                  ? 1 : 0) +
    (/\bTrue\b|\bFalse\b/.test(t)        ? 1 : 0) +
    (/\bimport\s+\w/.test(t)             ? 1 : 0) +
    (/\bprint\s*\(/.test(t)              ? 1 : 0) +
    (/\bself\b/.test(t)                  ? 2 : 0) +
    (/f['"]/.test(t)                     ? 1 : 0) +   // f-string
    (/\bexcept\b/.test(t)                ? 1 : 0) +
    (/\belif\b/.test(t)                  ? 2 : 0) +
    (/->/.test(t)                        ? 1 : 0) +   // return type hint
    (/#/.test(t)                         ? 1 : 0)     // Python comment style
  );

  // ---- JavaScript / TypeScript signals --------------------------------
  const jsScore = (
    (/\bfunction\s+\w+\s*\(/.test(t)     ? 4 : 0) +
    (/\bconst\b|\blet\b|\bvar\b/.test(t) ? 3 : 0) +
    (/=>/.test(t)                        ? 2 : 0) +   // arrow function
    (/\bconsole\./.test(t)               ? 2 : 0) +
    (/\bnull\b/.test(t)                  ? 1 : 0) +
    (/\bundefined\b/.test(t)             ? 1 : 0) +
    (/\bNaN\b|\bInfinity\b/.test(t)      ? 1 : 0) +
    (/===|!==/.test(t)                   ? 2 : 0) +   // strict equality
    (/\bthrow\s+new\s+/.test(t)          ? 1 : 0) +
    (/\bPromise\b|\basync\b|\bawait\b/.test(t) ? 2 : 0) +
    (/\/\//.test(t)                      ? 1 : 0)     // JS-style comment
  );

  if (pythonScore === 0 && jsScore === 0) return 'natural';
  if (pythonScore >= jsScore)             return 'python';
  return 'javascript';
}

// ============================================================
// Requirement parser — extract concrete terms for use in templates
// ============================================================

/**
 * Parse a free-text requirement and return concrete terminology
 * that templates can use in place of generic placeholder phrases.
 *
 * Returns an object with:
 *  - action     : primary verb phrase  (e.g. "log in", "submit", "search")
 *  - subject    : acting entity        (e.g. "user", "admin", "customer")
 *  - fields     : array of field names found (e.g. ["email", "password"])
 *  - feature    : short feature label  (e.g. "Login", "Product Search")
 *  - featureFull: full (truncated) requirement string for use in scenario text
 *
 * @param {string} req
 * @returns {{ action:string, subject:string, fields:string[], feature:string, featureFull:string }}
 */
function parseRequirement(req) {
  const t   = req.toLowerCase();
  const raw = req.trim().replace(/["""]/g, '"');

  // ---- Subject / actor ------------------------------------------------
  let subject = 'user';
  if (/\badmin\b/.test(t))      subject = 'admin';
  else if (/\bcustomer\b/.test(t)) subject = 'customer';
  else if (/\bmember\b/.test(t))   subject = 'member';
  else if (/\bguest\b/.test(t))    subject = 'guest';

  // ---- Action verb phrase ---------------------------------------------
  let action = 'use the feature';
  const actionPatterns = [
    [/(log\s?in|sign\s?in)/,              'log in'],
    [/\blog\s?out\b/,                     'log out'],
    [/\bregister\b|\bsign\s?up\b/,        'register'],
    [/\bsubmit\b/,                        'submit'],
    [/\bsearch\b/,                        'search'],
    [/\bfilter\b/,                        'filter'],
    [/\bupload\b/,                        'upload'],
    [/\bdownload\b/,                      'download'],
    [/\bdelete\b|\bremove\b/,             'delete'],
    [/\bedit\b|\bupdate\b|\bmodify\b/,    'update'],
    [/\bcreate\b|\badd\b/,                'create'],
    [/\bview\b|\bsee\b|\bdisplay\b/,      'view'],
    [/\bcheckout\b|\bpurchase\b|\border\b/, 'purchase'],
    [/\breset\b/,                         'reset'],
    [/\bverif/,                           'verify'],
    [/\bcancel\b/,                        'cancel'],
    [/\bbook\b|\breserv/,                 'book'],
  ];
  for (const [pattern, verb] of actionPatterns) {
    if (pattern.test(t)) { action = verb; break; }
  }

  // ---- Fields ---------------------------------------------------------
  const fieldPatterns = [
    'email', 'password', 'username', 'phone', 'mobile', 'address',
    'name', 'first name', 'last name', 'date of birth', 'dob',
    'credit card', 'card number', 'cvv', 'expiry', 'zip', 'postal',
    'file', 'attachment', 'image', 'document',
    'query', 'keyword', 'search term',
    'title', 'description', 'category', 'price', 'quantity', 'amount',
    'token', 'otp', 'code', 'pin',
    'url', 'link', 'id',
  ];
  const fields = fieldPatterns.filter(f => t.includes(f));

  // ---- Feature label --------------------------------------------------
  // Try to build a short label from the action + first detected nouns.
  let feature = action.replace(/\b\w/g, c => c.toUpperCase()); // e.g. "Log In"
  if (fields.length > 0) {
    // Capitalise field names for label
    const fLabel = fields.slice(0, 2).map(f => f.replace(/\b\w/g, c => c.toUpperCase())).join(' & ');
    // Only append field label if it isn't already implied by action
    if (!feature.toLowerCase().includes(fields[0])) {
      feature = `${feature} (${fLabel})`;
    }
  }

  const featureFull = raw.length > 80 ? raw.slice(0, 77) + '…' : raw;

  return { action, subject, fields, feature, featureFull };
}

// ============================================================
// Rule-based template sets (domain-specific)
// ============================================================

/**
 * Builds test cases for the division / bagi domain.
 * @param {string[]} categories
 * @param {'python'|'javascript'|'natural'} lang
 * @returns {object[]}
 */
function divisionTestCases(categories, lang) {
  const isPy = lang !== 'javascript';   // python or natural → Python-style
  const isJs = lang === 'javascript';

  // Language-specific vocabulary
  const nullVal    = isPy ? 'None'                : 'null';
  const divByZero  = isPy ? 'Raises ZeroDivisionError: division by zero'
                          : 'Returns Infinity (integer denominator) or NaN (0.0/0.0)';
  const divByZeroF = isPy ? 'Raises ZeroDivisionError: float division by zero'
                          : 'Returns Infinity';
  const typeErr    = isPy ? 'Raises TypeError; operation does not proceed'
                          : 'Returns NaN (JS coerces strings); or throws TypeError in strict mode';
  const nullErr    = isPy ? `Raises TypeError: unsupported operand type(s) for /: '${nullVal}' and 'int'`
                          : 'Returns NaN; no exception thrown (JS coerces null to 0)';
  const maxInt     = isPy ? 'a = sys.maxsize, b = sys.maxsize'
                          : 'a = Number.MAX_SAFE_INTEGER, b = Number.MAX_SAFE_INTEGER';
  const maxIntExp  = isPy ? 'Returns 1.0 without overflow (Python int is arbitrary precision)'
                          : 'Returns 1; no overflow (floats used internally)';
  const minFloat   = isPy ? 'a = 1, b = sys.float_info.min'
                          : 'a = 1, b = Number.MIN_VALUE';
  const minFloatEx = isPy ? 'Returns a very large float; no exception raised'
                          : 'Returns Infinity (1 / MIN_VALUE overflows to Infinity)';

  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  'Divide two positive integers',
        input:     'a = 10, b = 2',
        expected:  isPy ? 'Returns 5.0 (Python 3 true division)' : 'Returns 5',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  'Divide a positive number by a negative number',
        input:     'a = 10, b = -2',
        expected:  isPy ? 'Returns -5.0' : 'Returns -5',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  'Divide two negative numbers',
        input:     'a = -9, b = -3',
        expected:  isPy ? 'Returns 3.0' : 'Returns 3',
      },
      {
        id: 'TC-F004', type: 'Functional', priority: 'Medium',
        scenario:  'Numerator is zero',
        input:     'a = 0, b = 5',
        expected:  isPy ? 'Returns 0.0' : 'Returns 0',
      },
      {
        id: 'TC-F005', type: 'Functional', priority: 'High',
        scenario:  'Result is a non-integer (floating-point)',
        input:     'a = 7, b = 2',
        expected:  isPy ? 'Returns 3.5' : 'Returns 3.5',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  'Divide by zero — integer denominator',
        input:     'a = 10, b = 0',
        expected:  divByZero,
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  'Divide by zero — float denominator',
        input:     'a = 5.0, b = 0.0',
        expected:  divByZeroF,
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  'Non-numeric string passed as numerator',
        input:     isPy ? 'a = "ten", b = 2' : 'a = "ten", b = 2',
        expected:  typeErr,
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'High',
        scenario:  'Non-numeric string passed as denominator',
        input:     'a = 10, b = "two"',
        expected:  typeErr,
      },
      {
        id: 'TC-N005', type: 'Negative', priority: 'Medium',
        scenario:  `${nullVal} passed as an argument`,
        input:     `a = ${nullVal}, b = 2`,
        expected:  nullErr,
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  'Denominator is the smallest positive float',
        input:     minFloat,
        expected:  minFloatEx,
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'Medium',
        scenario:  'Both arguments are the maximum integer value',
        input:     maxInt,
        expected:  maxIntExp,
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  'Both arguments are -1',
        input:     'a = -1, b = -1',
        expected:  isPy ? 'Returns 1.0' : 'Returns 1',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Low',
        scenario:  'Denominator is 1 (identity)',
        input:     'a = 42, b = 1',
        expected:  isPy ? 'Returns 42.0 (same as numerator)' : 'Returns 42',
      },
      {
        id: 'TC-B005', type: 'Boundary', priority: 'Low',
        scenario:  'Numerator is 0, denominator is 0 (indeterminate)',
        input:     'a = 0, b = 0',
        expected:  isPy ? 'Raises ZeroDivisionError: division by zero (indeterminate form)'
                        : 'Returns NaN (0/0 in JS)',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for general arithmetic / math functions.
 * @param {string}   req
 * @param {string[]} categories
 * @param {'python'|'javascript'|'natural'} lang
 * @returns {object[]}
 */
function mathTestCases(req, categories, lang) {
  const { action, feature, featureFull } = parseRequirement(req);
  const fnName = (() => {
    const m = req.match(/(?:def|function)\s+(\w+)/i);
    return m ? `${m[1]}()` : feature;
  })();

  const isPy = lang !== 'javascript';
  const isJs = lang === 'javascript';

  const nullVal   = isPy ? 'None'                       : 'null';
  const typeErr   = isPy ? 'Raises TypeError; operation does not proceed'
                         : 'Returns NaN (JS coerces the value); throws in strict/typed code';
  const nullErr   = isPy ? `Raises TypeError: unsupported operand; None is not a number`
                         : 'Returns NaN; JS coerces null to 0 — verify intentional behaviour';
  const argErr    = isPy ? 'Raises TypeError: missing or unexpected positional argument'
                         : 'Throws TypeError: wrong number of arguments';
  const maxInt    = isPy ? 'a=sys.maxsize, b=1'         : 'a=Number.MAX_SAFE_INTEGER, b=1';
  const maxIntExp = isPy ? `${fnName} returns result without overflow (Python int is arbitrary precision)`
                         : `${fnName} returns result; verify no silent precision loss beyond MAX_SAFE_INTEGER`;
  const minFlt    = isPy ? 'a=sys.float_info.min, b=1'  : 'a=Number.MIN_VALUE, b=1';
  const minFltExp = isPy ? `${fnName} returns result without underflow to zero`
                         : `${fnName} returns result; verify no underflow to 0`;

  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${fnName} — two positive integer inputs`,
        input:     'Two representative positive integers (e.g., a=6, b=3)',
        expected:  `${fnName} returns the mathematically correct result`,
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${fnName} — mixed positive and negative inputs`,
        input:     'One positive and one negative integer (e.g., a=10, b=-5)',
        expected:  `${fnName} returns the sign-correct result`,
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${fnName} — floating-point inputs`,
        input:     isPy ? 'Two float values (e.g., a=1.5, b=2.5)'
                       : 'Two Number values (e.g., a=1.5, b=2.5)',
        expected:  `${fnName} returns the precise floating-point result without rounding error`,
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${fnName} — non-numeric string passed as an argument`,
        input:     'a="hello", b=3 (string where a number is expected)',
        expected:  typeErr,
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${fnName} — ${nullVal} passed as an argument`,
        input:     `a=${nullVal}, b=2`,
        expected:  nullErr,
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${fnName} — called with wrong number of arguments`,
        input:     `${fnName} invoked with too few or too many positional arguments`,
        expected:  argErr,
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${fnName} — both arguments are zero`,
        input:     'a=0, b=0',
        expected:  `${fnName} returns 0 or raises a domain-specific error per business rules`,
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'Medium',
        scenario:  `${fnName} — maximum platform integer value`,
        input:     maxInt,
        expected:  maxIntExp,
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${fnName} — smallest positive floating-point value`,
        input:     minFlt,
        expected:  minFltExp,
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
  const { action, subject, fields, feature, featureFull } = parseRequirement(req);
  // Build a human-readable list of the detected fields (fall back to "required fields")
  const fieldList  = fields.length > 0
    ? fields.slice(0, 4).join(', ')
    : 'required fields';
  const firstField = fields.length > 0 ? fields[0] : 'name';
  const hasEmail   = fields.includes('email');
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} submits with all required fields valid`,
        input:     `All mandatory fields (${fieldList}) populated with correctly formatted values`,
        expected:  `Form submits successfully; ${subject} receives a success confirmation`,
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — optional fields omitted`,
        input:     `Only the required fields (${fieldList}) filled; optional fields left empty`,
        expected:  'Form submits successfully without validation errors',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — form can be reset after partial input`,
        input:     `${subject} fills some fields then clicks Reset / Clear`,
        expected:  'All fields revert to their default (empty) state',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${feature} — submit with all required fields empty`,
        input:     `All required fields (${fieldList}) left blank`,
        expected:  `Validation error shown for each blank required field; form not submitted`,
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  hasEmail
          ? `${feature} — ${firstField} field contains an invalid format (e.g. missing "@")`
          : `${feature} — ${firstField} field contains an invalid format`,
        input:     hasEmail
          ? `${firstField}: "notanemail" (missing "@" and domain)`
          : `${firstField}: letters entered in a numeric-only field`,
        expected:  `Inline validation error on the ${firstField} field specifying the required format`,
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — XSS payload injected into a text field`,
        input:     `${firstField}: "<script>alert('xss')</script>"`,
        expected:  'Input sanitised or rejected; script tag is not executed; no alert fires',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — SQL injection attempt in a text field`,
        input:     `${firstField}: "' OR '1'='1' --"`,
        expected:  'Input rejected or sanitised; no database error exposed; form submission blocked',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${firstField} field at exactly the minimum allowed length`,
        input:     `${firstField}: string of exactly the minimum character count (e.g. 1 char)`,
        expected:  'Field accepted; form submits successfully if all other fields are valid',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${firstField} field at exactly the maximum allowed length`,
        input:     `${firstField}: string of exactly the maximum character count`,
        expected:  'Field accepted; form submits successfully if all other fields are valid',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${firstField} field one character over the maximum`,
        input:     `${firstField}: string of maximum + 1 characters`,
        expected:  'Validation error shown or input truncated; excess character rejected',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — ${firstField} field contains only whitespace`,
        input:     `${firstField}: "   " (spaces only)`,
        expected:  'Treated as empty after trimming; validation error shown',
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
 * Builds test cases for a search / filter feature.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function searchTestCases(req, categories) {
  const { subject, feature, fields } = parseRequirement(req);
  // Detect what is being searched (product, user, article, etc.)
  const t = req.toLowerCase();
  let entity = 'results';
  if (/product/.test(t))     entity = 'products';
  else if (/user/.test(t))   entity = 'users';
  else if (/article/.test(t)) entity = 'articles';
  else if (/order/.test(t))  entity = 'orders';
  else if (/item/.test(t))   entity = 'items';

  const queryField = fields.includes('keyword') ? 'keyword'
    : fields.includes('query')   ? 'query'
    : 'search term';

  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} searches with a valid ${queryField} that matches existing ${entity}`,
        input:     `${queryField}: a known value that exists in the data set`,
        expected:  `Matching ${entity} are returned; results list is not empty`,
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — search is case-insensitive`,
        input:     `${queryField}: same term entered in ALL CAPS and all lowercase`,
        expected:  `Both queries return identical ${entity}; case does not affect results`,
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — ${subject} searches with a ${queryField} that matches no ${entity}`,
        input:     `${queryField}: a value known not to exist in the data set`,
        expected:  `Empty results list displayed; "No ${entity} found" message shown`,
      },
      {
        id: 'TC-F004', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — results are sorted or ranked correctly`,
        input:     `${queryField}: a value that returns multiple matching ${entity}`,
        expected:  `${entity} are ordered by relevance / default sort; order is consistent`,
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} submits an empty ${queryField}`,
        input:     `${queryField}: "" (empty string)`,
        expected:  `Validation error shown: "${queryField} is required" or all ${entity} returned per spec`,
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${queryField} contains only whitespace`,
        input:     `${queryField}: "   " (spaces only)`,
        expected:  'Treated as empty input after trimming; validation error shown',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — ${queryField} contains special characters / script injection`,
        input:     `${queryField}: "<script>alert(1)</script>" or "' OR 1=1 --"`,
        expected:  'Input sanitised; no script executed; search returns empty or safe results',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${queryField} at exactly 1 character (minimum)`,
        input:     `${queryField}: single character (e.g. "a")`,
        expected:  `Search executes; ${entity} matching that character are returned`,
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${queryField} at the maximum allowed length`,
        input:     `${queryField}: string of exactly the maximum character limit`,
        expected:  `Search executes without error; matching ${entity} returned`,
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — ${queryField} one character over the maximum length`,
        input:     `${queryField}: string of maximum + 1 characters`,
        expected:  `Validation error shown: "${queryField} is too long"; search not executed`,
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — results page number at zero or negative value`,
        input:     'page=0 or page=-1',
        expected:  '400 Bad Request or first page returned, depending on API spec',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for a file upload feature.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function uploadTestCases(req, categories) {
  const { subject, feature } = parseRequirement(req);
  const t = req.toLowerCase();

  // Detect accepted file types from the requirement
  let fileType = 'file';
  if (/image|photo|picture|png|jpg|jpeg/.test(t)) fileType = 'image file (PNG/JPG)';
  else if (/pdf/.test(t))                          fileType = 'PDF document';
  else if (/csv/.test(t))                          fileType = 'CSV file';
  else if (/video|mp4/.test(t))                    fileType = 'video file';
  else if (/document|docx|xlsx/.test(t))           fileType = 'document file';

  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} uploads a valid ${fileType} within size limits`,
        input:     `A valid ${fileType} within the allowed size limit`,
        expected:  'File uploads successfully; confirmation message shown; file stored correctly',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — uploaded ${fileType} is retrievable after upload`,
        input:     `A valid ${fileType} that has been uploaded`,
        expected:  `The ${fileType} can be retrieved / previewed at the returned URL or reference`,
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — upload progress indicator is displayed`,
        input:     `A large valid ${fileType} (close to size limit)`,
        expected:  'Upload progress is visibly indicated; completion status shown on finish',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} uploads a file of an unsupported type`,
        input:     'A file with a disallowed extension (e.g. .exe, .bat, .php)',
        expected:  'Upload rejected; error message specifying allowed file types shown',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} uploads a file exceeding the maximum size`,
        input:     `A ${fileType} larger than the allowed size limit`,
        expected:  'Upload rejected; error message specifying the maximum allowed size shown',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} submits without selecting a file`,
        input:     'No file chosen; upload button clicked',
        expected:  'Validation error: "Please select a file to upload"',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — ${subject} uploads a corrupt or malformed file`,
        input:     `A ${fileType} with corrupted content (invalid headers or truncated data)`,
        expected:  'Upload rejected or processing fails gracefully; error message shown; server not crashed',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${fileType} at exactly the maximum allowed file size`,
        input:     `A valid ${fileType} whose size is exactly the documented limit (e.g. 5 MB)`,
        expected:  'File accepted and uploaded successfully',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${fileType} one byte above the maximum allowed size`,
        input:     `A ${fileType} whose size is max limit + 1 byte`,
        expected:  'Upload rejected; size-limit error message displayed',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — zero-byte (empty) ${fileType}`,
        input:     'A file with 0 bytes of content',
        expected:  'Upload rejected or treated as invalid; error message shown',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — filename at the maximum allowed length`,
        input:     'A valid file whose filename is exactly 255 characters long',
        expected:  'File accepted; filename stored without truncation or error',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for a payment / checkout feature.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function paymentTestCases(req, categories) {
  const { subject, feature } = parseRequirement(req);
  const t = req.toLowerCase();
  const hasCard = /credit\s*card|debit\s*card|card\s*number/.test(t);
  const payMethod = hasCard ? 'credit/debit card' : 'payment method';
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} completes payment with a valid ${payMethod}`,
        input:     hasCard
          ? 'card number: valid test card, expiry: future date, CVV: valid 3-digit code, billing address: valid'
          : 'All payment fields filled with valid, accepted values',
        expected:  'Payment processed successfully; confirmation page and email sent; order status updated to "Paid"',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — payment total is calculated correctly before submission`,
        input:     `${subject} proceeds to ${feature.toLowerCase()} with a known order total`,
        expected:  'Displayed total matches expected amount including taxes and shipping',
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — ${subject} receives payment confirmation`,
        input:     'Successful payment completed with valid credentials',
        expected:  'On-screen confirmation shown; order ID provided; confirmation email delivered',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  hasCard
          ? `${feature} — ${subject} enters an expired card`
          : `${feature} — ${subject} submits with invalid payment credentials`,
        input:     hasCard
          ? 'card number: valid format, expiry: past date (e.g. 01/22), CVV: valid'
          : 'Payment credentials that are known to be invalid or declined',
        expected:  'Payment declined; error message: "Card has expired" or "Payment declined"; order not placed',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  hasCard
          ? `${feature} — ${subject} enters an invalid card number`
          : `${feature} — ${subject} submits with missing required payment fields`,
        input:     hasCard
          ? 'card number: "1234567890123456" (fails Luhn check)'
          : 'One or more required payment fields left blank',
        expected:  'Client-side validation error shown; payment not attempted',
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  `${feature} — payment is submitted with insufficient funds`,
        input:     'Payment method known to have insufficient balance (use declined test card)',
        expected:  'Payment declined; error message shown; order not placed; no duplicate charge',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — ${subject} attempts double-submission by clicking pay twice`,
        input:     'Pay button clicked twice in quick succession',
        expected:  'Only one payment processed; duplicate charge prevented; idempotency enforced',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — payment amount of exactly $0.01 (minimum)`,
        input:     'Order total: $0.01',
        expected:  'Payment accepted; minimum amount processed without error',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — payment amount at the maximum allowed limit`,
        input:     'Order total: at the documented maximum transaction amount',
        expected:  'Payment accepted; amount processed correctly',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  hasCard
          ? `${feature} — card expiry is exactly the current month and year`
          : `${feature} — payment credentials valid only on the current boundary date`,
        input:     hasCard
          ? 'card expiry: current month / current year (e.g. 11/26)'
          : 'Credentials valid on the boundary date',
        expected:  'Payment accepted; card treated as not yet expired',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — zero-value order total`,
        input:     'Order total: $0.00',
        expected:  'Zero-value order handled per business rules (free checkout or blocked)',
      },
    );
  }

  return cases;
}

/**
 * Builds test cases for a password-reset / forgot-password flow.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function passwordResetTestCases(req, categories) {
  const { subject, feature } = parseRequirement(req);
  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} requests a reset link with a registered email`,
        input:     'email: "registered@example.com"',
        expected:  'Password-reset email sent to the registered address; success message shown',
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} sets a new password using a valid reset token`,
        input:     'Valid, unexpired reset token; new password: "NewP@ss123" (meets policy)',
        expected:  `Password updated successfully; ${subject} can log in with the new password`,
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — old password is invalidated after reset`,
        input:     'Log-in attempt using the previous password after a successful reset',
        expected:  'Login rejected; error: "Invalid email or password"',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} requests reset with an unregistered email`,
        input:     'email: "unknown@example.com"',
        expected:  'Generic success message shown (do not reveal whether email exists); no reset email sent',
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} uses an expired reset token`,
        input:     'Reset token that is past its expiry time (e.g. older than 1 hour)',
        expected:  `Error: "Reset link has expired"; ${subject} prompted to request a new one`,
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} uses a previously used (single-use) reset token`,
        input:     'Reset token that was already consumed',
        expected:  'Error: "Reset link is no longer valid"; token cannot be reused',
      },
      {
        id: 'TC-N004', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — new password does not meet the complexity policy`,
        input:     'new password: "password" (no uppercase, no special character, too common)',
        expected:  'Validation error listing the unmet password policy requirements; password not changed',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — new password at exactly the minimum allowed length`,
        input:     'new password: exactly the minimum number of characters (e.g. 8)',
        expected:  'Password accepted if it meets all other policy rules',
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — new password one character below the minimum length`,
        input:     'new password: minimum - 1 characters (e.g. 7 chars)',
        expected:  'Validation error: "Password must be at least 8 characters"',
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — new password at exactly the maximum allowed length`,
        input:     'new password: exactly the maximum character limit (e.g. 128 chars)',
        expected:  'Password accepted; no truncation',
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — reset token used at exactly 1 second before expiry`,
        input:     'Reset token used at expiry_time - 1 second',
        expected:  'Token still valid; password reset succeeds',
      },
    );
  }

  return cases;
}

/**
 * Generic (domain-unknown) test cases — derived from parsed requirement terminology.
 * @param {string}   req
 * @param {string[]} categories
 * @returns {object[]}
 */
function genericTestCases(req, categories) {
  const { action, subject, fields, feature, featureFull } = parseRequirement(req);

  // Build concrete input descriptions from detected fields
  const hasFields  = fields.length > 0;
  const fieldList  = hasFields ? fields.slice(0, 4).join(', ') : 'the required inputs';
  const firstField = hasFields ? fields[0] : 'input';
  const inputDesc  = hasFields
    ? `${fieldList} populated with valid, correctly formatted values`
    : 'all required inputs provided with valid values as described in the requirement';

  const cases = [];

  if (categories.includes('Functional')) {
    cases.push(
      {
        id: 'TC-F001', type: 'Functional', priority: 'High',
        scenario:  `${feature} — ${subject} can ${action} successfully with valid input`,
        input:     inputDesc,
        expected:  `${subject} successfully ${action}s; correct output is produced as described in the requirement`,
      },
      {
        id: 'TC-F002', type: 'Functional', priority: 'High',
        scenario:  `${feature} — all ${hasFields ? fieldList : 'required fields'} are accepted and processed correctly`,
        input:     `${hasFields ? fieldList : 'All required fields'} filled with valid, correctly typed data`,
        expected:  `No validation errors; ${action} completes successfully end-to-end`,
      },
      {
        id: 'TC-F003', type: 'Functional', priority: 'Medium',
        scenario:  `${feature} — repeating the ${action} with the same input produces consistent results`,
        input:     `${subject} performs the ${action} twice with identical valid input`,
        expected:  'Both attempts produce identical, correct results; no unintended side effects',
      },
    );
  }

  if (categories.includes('Negative')) {
    cases.push(
      {
        id: 'TC-N001', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} attempts to ${action} with ${hasFields ? `the ${firstField} field` : 'required input'} empty`,
        input:     hasFields ? `${firstField}: "" (empty string)` : 'All required fields left blank',
        expected:  `Validation error shown: "${firstField} is required"; ${action} not executed`,
      },
      {
        id: 'TC-N002', type: 'Negative', priority: 'High',
        scenario:  `${feature} — ${subject} provides an incorrectly typed value for ${hasFields ? firstField : 'a required field'}`,
        input:     hasFields
          ? `${firstField}: a value of the wrong data type (e.g. number where text expected, or vice versa)`
          : 'A required field receives a value of the wrong data type',
        expected:  `Type-mismatch or format validation error shown; ${action} not executed`,
      },
      {
        id: 'TC-N003', type: 'Negative', priority: 'Medium',
        scenario:  `${feature} — malicious input injected into ${hasFields ? `the ${firstField} field` : 'a text field'}`,
        input:     hasFields
          ? `${firstField}: "<script>alert('xss')</script>" or "' OR 1=1 --"`
          : "<script>alert('xss')</script> or ' OR 1=1 --",
        expected:  'Input sanitised or rejected; script not executed; no database error exposed',
      },
    );
  }

  if (categories.includes('Boundary')) {
    cases.push(
      {
        id: 'TC-B001', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${hasFields ? firstField : 'text input'} at exactly the minimum allowed length`,
        input:     `${hasFields ? firstField : 'Input'}: string of exactly the minimum character count (e.g. 1 char)`,
        expected:  `${firstField || 'Input'} accepted; ${action} proceeds if all other conditions are met`,
      },
      {
        id: 'TC-B002', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${hasFields ? firstField : 'text input'} at exactly the maximum allowed length`,
        input:     `${hasFields ? firstField : 'Input'}: string of exactly the maximum character count`,
        expected:  `${firstField || 'Input'} accepted; ${action} proceeds if all other conditions are met`,
      },
      {
        id: 'TC-B003', type: 'Boundary', priority: 'High',
        scenario:  `${feature} — ${hasFields ? firstField : 'text input'} one character over the maximum`,
        input:     `${hasFields ? firstField : 'Input'}: string of maximum + 1 characters`,
        expected:  `Validation error shown; excess input rejected; ${action} not executed`,
      },
      {
        id: 'TC-B004', type: 'Boundary', priority: 'Medium',
        scenario:  `${feature} — ${hasFields ? firstField : 'input'} contains only whitespace`,
        input:     `${hasFields ? firstField : 'Input'}: "   " (spaces only)`,
        expected:  'Treated as empty after trimming; validation error shown',
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
 * @returns {{ cases: object[], mode: string, domain: string, lang: string }}
 */
function generateRuleBased(requirement, categories) {
  const domain = detectDomain(requirement);
  const lang   = detectLanguage(requirement);   // 'python' | 'javascript' | 'natural'

  let cases;
  switch (domain) {
    case 'division':      cases = divisionTestCases(categories, lang);                    break;
    case 'math':          cases = mathTestCases(requirement, categories, lang);           break;
    case 'login':         cases = loginTestCases(categories);                             break;
    case 'form':          cases = formTestCases(requirement, categories);                 break;
    case 'api':           cases = apiTestCases(requirement, categories);                  break;
    case 'search':        cases = searchTestCases(requirement, categories);               break;
    case 'upload':        cases = uploadTestCases(requirement, categories);               break;
    case 'payment':       cases = paymentTestCases(requirement, categories);              break;
    case 'passwordReset': cases = passwordResetTestCases(requirement, categories);        break;
    default:              cases = genericTestCases(requirement, categories);
  }

  return { cases, mode: 'rule-based', domain, lang };
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
 * @param {string}             [lang]    - Detected language (rule-based only)
 */
function setModeBanner(mode, domain, lang) {
  let banner = document.getElementById('generation-mode-banner');

  if (!banner) {
    banner = document.createElement('p');
    banner.id = 'generation-mode-banner';
    banner.style.cssText =
      'margin-bottom:1rem;padding:0.4rem 0.9rem;border-radius:4px;' +
      'font-size:0.8125rem;font-weight:400;border:1px solid;';

    const header = document.querySelector('#results-section .results-header');
    if (header) header.after(banner);
  }

  if (mode === 'llm') {
    banner.textContent = 'Generated by AI (LLM)';
    banner.style.background  = '#eff6ff';
    banner.style.color       = '#1d4ed8';
    banner.style.borderColor = '#bfdbfe';
  } else {
    // Build a concise, non-distracting status line
    const domainMap = {
      division:      'Division',
      math:          'Math function',
      login:         'Authentication',
      form:          'Form / Registration',
      api:           'REST API',
      search:        'Search / Filter',
      upload:        'File Upload',
      payment:       'Payment / Checkout',
      passwordReset: 'Password Reset',
      generic:       'General',
    };
    const langMap = {
      python:      'Python',
      javascript:  'JavaScript',
      natural:     null,          // don't mention language for prose requirements
    };
    const domainLabel = domainMap[domain] || 'General';
    const langLabel   = langMap[lang]     || null;

    const parts = [`${domainLabel} test cases`];
    if (langLabel) parts.push(langLabel);
    banner.textContent = parts.join(' · ');

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
 * @param {string}  [lang]
 */
function renderResults(testCases, mode, domain, lang) {
  const tbody   = document.getElementById('results-body');
  const section = document.getElementById('results-section');
  const countEl = document.getElementById('results-count');
  const btnCopy = document.getElementById('btn-copy');

  tbody.innerHTML = '';
  testCases.forEach(tc => tbody.appendChild(buildRow(tc)));

  countEl.textContent =
    `${testCases.length} test case${testCases.length !== 1 ? 's' : ''} generated`;
  setVisible(section, true);
  setModeBanner(mode, domain, lang);

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
      const { cases, mode, domain, lang } = generateRuleBased(requirement, categories);
      renderResults(cases, mode, domain, lang);
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
