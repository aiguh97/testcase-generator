/**
 * AI Test Case Generator — script.js
 * All logic runs client-side; no external dependencies.
 */

// ============================================================
// Test Case Template Bank
// Keyed by category. Each entry is a function that receives the
// requirement text and a sequential index, and returns a test
// case object ready for rendering.
// ============================================================

/**
 * Extract a short "feature label" from the requirement text.
 * Used to make generated scenarios feel contextual.
 * @param {string} req - Raw requirement string.
 * @returns {string}
 */
function deriveFeatureLabel(req) {
  // Trim and truncate so labels stay short in table cells
  const clean = req.trim().replace(/["""]/g, '"');
  return clean.length > 70 ? clean.slice(0, 67) + '…' : clean;
}

/**
 * Template definitions per category.
 * Each function returns a plain object with the test case fields.
 * @param {string} req   - The user's requirement text.
 * @param {number} index - Sequence counter for unique IDs.
 */
const TEMPLATES = {
  Functional: [
    (req, i) => ({
      id:       `TC-F${String(i).padStart(3, '0')}`,
      scenario: `Verify that the system fulfills the requirement: "${deriveFeatureLabel(req)}"`,
      type:     'Functional',
      input:    'Valid, expected inputs as specified in the requirement',
      expected: 'The system processes the input correctly and returns the specified outcome',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-F${String(i).padStart(3, '0')}`,
      scenario: `Confirm all required fields or parameters are accepted correctly`,
      type:     'Functional',
      input:    'All mandatory fields populated with valid data',
      expected: 'No validation errors; feature executes successfully end-to-end',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-F${String(i).padStart(3, '0')}`,
      scenario: `Verify the system response time is within acceptable limits under normal load`,
      type:     'Functional',
      input:    'Single valid request submitted by one user',
      expected: 'System responds within 2 seconds and returns the correct result',
      priority: 'Medium',
    }),
    (req, i) => ({
      id:       `TC-F${String(i).padStart(3, '0')}`,
      scenario: `Validate that the success/confirmation feedback is displayed to the user`,
      type:     'Functional',
      input:    'Valid inputs that trigger the feature\'s success path',
      expected: 'A clear success message, redirect, or visual confirmation is shown',
      priority: 'Medium',
    }),
    (req, i) => ({
      id:       `TC-F${String(i).padStart(3, '0')}`,
      scenario: `Verify the feature persists or propagates data correctly after execution`,
      type:     'Functional',
      input:    'Valid inputs; check stored/transmitted data afterward',
      expected: 'Data is correctly saved, returned, or forwarded as defined by the requirement',
      priority: 'High',
    }),
  ],

  Negative: [
    (req, i) => ({
      id:       `TC-N${String(i).padStart(3, '0')}`,
      scenario: `Attempt to trigger the feature with all required fields left empty`,
      type:     'Negative',
      input:    'No input provided; all fields blank',
      expected: 'System displays appropriate validation error; feature does not execute',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-N${String(i).padStart(3, '0')}`,
      scenario: `Submit invalid or malformed data for the primary input`,
      type:     'Negative',
      input:    'Malformed data (e.g., wrong format, special characters, SQL injection attempt)',
      expected: 'System rejects the input and returns a clear, specific error message',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-N${String(i).padStart(3, '0')}`,
      scenario: `Test feature behavior when required dependencies or services are unavailable`,
      type:     'Negative',
      input:    'Valid inputs, but a dependent service/resource is offline or returns an error',
      expected: 'System gracefully handles the failure and shows a user-friendly error message',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-N${String(i).padStart(3, '0')}`,
      scenario: `Attempt the action with an unauthorized user role or missing permissions`,
      type:     'Negative',
      input:    'Credentials or session for a user without the required permission level',
      expected: 'Access is denied; system returns a 403/Unauthorized response or equivalent UI feedback',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-N${String(i).padStart(3, '0')}`,
      scenario: `Submit duplicate or already-processed data to test idempotency`,
      type:     'Negative',
      input:    'Exact same request or data submitted a second time',
      expected: 'System detects the duplicate and either rejects or handles it without corruption',
      priority: 'Medium',
    }),
  ],

  Boundary: [
    (req, i) => ({
      id:       `TC-B${String(i).padStart(3, '0')}`,
      scenario: `Provide input at the minimum allowed boundary value`,
      type:     'Boundary',
      input:    'Value set exactly at the minimum acceptable limit (e.g., 1 character, 0, min date)',
      expected: 'System accepts the minimum value and processes it correctly',
      priority: 'Medium',
    }),
    (req, i) => ({
      id:       `TC-B${String(i).padStart(3, '0')}`,
      scenario: `Provide input at the maximum allowed boundary value`,
      type:     'Boundary',
      input:    'Value set exactly at the maximum acceptable limit (e.g., 255 chars, max integer)',
      expected: 'System accepts the maximum value and processes it correctly',
      priority: 'Medium',
    }),
    (req, i) => ({
      id:       `TC-B${String(i).padStart(3, '0')}`,
      scenario: `Submit input one unit below the minimum allowed boundary`,
      type:     'Boundary',
      input:    'Value just below the minimum threshold (e.g., 0 characters, -1, one day before min date)',
      expected: 'System rejects the input and returns a validation error indicating the lower limit',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-B${String(i).padStart(3, '0')}`,
      scenario: `Submit input one unit above the maximum allowed boundary`,
      type:     'Boundary',
      input:    'Value just above the maximum threshold (e.g., 256 chars, max+1, one day after max date)',
      expected: 'System rejects the input and returns a validation error indicating the upper limit',
      priority: 'High',
    }),
    (req, i) => ({
      id:       `TC-B${String(i).padStart(3, '0')}`,
      scenario: `Test with an empty string or null/zero value at the boundary`,
      type:     'Boundary',
      input:    'Null, empty string, or zero — the edge of the valid range',
      expected: 'System correctly validates and rejects or accepts the boundary edge as per business rules',
      priority: 'Low',
    }),
  ],
};

// ============================================================
// Core generation logic
// ============================================================

/**
 * Generate test cases for the given categories and requirement.
 * @param {string}   requirement - User input text.
 * @param {string[]} categories  - Array of selected category names.
 * @returns {{ id, scenario, type, input, expected, priority }[]}
 */
function generateTestCases(requirement, categories) {
  const results = [];
  let counter = 1;

  for (const category of categories) {
    const templates = TEMPLATES[category];
    if (!templates) continue;

    for (const templateFn of templates) {
      results.push(templateFn(requirement, counter));
      counter++;
    }
  }

  return results;
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
    // ID and type/priority cells use innerHTML for the tag wrappers;
    // plain text cells use textContent for XSS safety.
    if (idx === 2 || idx === 5) {
      td.innerHTML = content;
    } else {
      td.textContent = content;
    }
    tr.appendChild(td);
  });

  return tr;
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

// ============================================================
// Render results into the table
// ============================================================

/**
 * Populate the results table and make it visible.
 * @param {{ id, scenario, type, input, expected, priority }[]} testCases
 */
function renderResults(testCases) {
  const tbody        = document.getElementById('results-body');
  const section      = document.getElementById('results-section');
  const countEl      = document.getElementById('results-count');
  const btnCopy      = document.getElementById('btn-copy');

  // Clear previous rows
  tbody.innerHTML = '';

  testCases.forEach(tc => tbody.appendChild(buildRow(tc)));

  countEl.textContent = `${testCases.length} test case${testCases.length !== 1 ? 's' : ''} generated`;
  setVisible(section, true);

  // Enable copy button
  btnCopy.disabled = false;
  btnCopy.removeAttribute('aria-disabled');

  // Scroll results into view
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// Copy results as plain text
// ============================================================

/**
 * Convert the current table to a tab-separated plain-text string.
 * @returns {string}
 */
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

/**
 * Validate user inputs before generation.
 * @param {string}   requirement
 * @param {string[]} categories
 * @returns {{ valid: boolean, message: string }}
 */
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

function handleGenerate() {
  const requirementEl  = document.getElementById('requirement');
  const validationEl   = document.getElementById('validation-msg');
  const requirement    = requirementEl.value;

  // Collect checked categories in display order
  const categories = Array.from(
    document.querySelectorAll('input[name="category"]:checked')
  ).map(cb => cb.value);

  // Validate
  const { valid, message } = validate(requirement, categories);

  if (!valid) {
    validationEl.textContent = message;
    setVisible(validationEl, true);
    requirementEl.focus();
    return;
  }

  // Clear any previous validation message
  setVisible(validationEl, false);

  // Generate and render
  const testCases = generateTestCases(requirement, categories);
  renderResults(testCases);
}

function handleClear() {
  // Reset textarea
  document.getElementById('requirement').value = '';

  // Hide validation message
  const validationEl = document.getElementById('validation-msg');
  setVisible(validationEl, false);

  // Hide results section
  setVisible(document.getElementById('results-section'), false);

  // Reset copy button
  const btnCopy = document.getElementById('btn-copy');
  btnCopy.disabled = true;
  btnCopy.setAttribute('aria-disabled', 'true');

  // Clear table body for good measure
  document.getElementById('results-body').innerHTML = '';

  // Return focus to textarea
  document.getElementById('requirement').focus();
}

function handleCopy() {
  const text = tableToText();

  if (!navigator.clipboard) {
    // Fallback for older browsers
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

/** Briefly change the copy button label to give feedback. */
function showCopyFeedback(success) {
  const btn = document.getElementById('btn-copy');
  const originalText = 'Copy Results';
  btn.textContent = success ? '✓ Copied!' : '✗ Failed';
  setTimeout(() => { btn.textContent = originalText; }, 2000);
}

// ============================================================
// Initial example (pre-loaded on page open)
// ============================================================

function loadInitialExample() {
  const exampleRequirement =
    'Users must be able to log in using an email address and password.';

  document.getElementById('requirement').value = exampleRequirement;

  // Check all three categories for the demo
  ['cat-functional', 'cat-negative', 'cat-boundary'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = true;
  });

  // Auto-generate so the app is immediately demonstrable
  handleGenerate();
}

// ============================================================
// Bootstrap — wire up events on DOM ready
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-generate').addEventListener('click', handleGenerate);
  document.getElementById('btn-clear').addEventListener('click', handleClear);
  document.getElementById('btn-copy').addEventListener('click', handleCopy);

  // Allow Ctrl+Enter / Cmd+Enter inside the textarea to generate
  document.getElementById('requirement').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  });

  // Load initial example
  loadInitialExample();
});
