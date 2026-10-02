import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const COURSE = '409368';
const BASE = `https://lisdtx.instructure.com/courses/${COURSE}`;
const ZONE = 'America/Chicago';
const user = process.env.LISD_USERNAME;
const password = process.env.LISD_PASSWORD;
let browser;

function note(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
function fail(reason) { throw new Error(reason); }
function localDate(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: 'short', day: 'numeric' }).formatToParts(date);
  return Object.fromEntries(p.map(x => [x.type, x.value]));
}
function localClock(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(':', ''));
}
function sameDueDate(row, today) {
  const due = row.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s+by\s+11:59pm\b/);
  return !!due && due[1] === today.month && Number(due[2]) === Number(today.day);
}
function answerFor(question, options) {
  const q = question.replace(/\s+/g, ' ').trim().replace(/^\d+\s+/, '').toLowerCase();
  const exact = options.map(x => x.trim());
  if (q === 'a semicolon may join two related independent clauses.' && exact.includes('True')) return 'True';
  if (q === 'which phrase is an oxymoron?' && exact.includes('Deafening silence')) return 'Deafening silence';
  if (/^a sonnet has 14 lines\.?$/.test(q) && exact.includes('True')) return 'True';
  return null;
}

try {
  if (!user || !password) fail('Missing LISD_USERNAME or LISD_PASSWORD GitHub secret.');
  const now = new Date();
  const today = localDate(now);
  const hm = localClock(now);
  if (hm < 1 || hm > 2200) fail('Outside the stated 12:01 a.m.–10 p.m. Central course window.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://login.classlink.com/my/lisd', { waitUntil: 'domcontentloaded' });
  await page.getByText('Username', { exact: true }).waitFor({ timeout: 15000 }).catch(() => {});
  if (await page.locator('input[type=password]').count()) {
    await page.getByRole('textbox', { name: /username/i }).fill(user);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  const canvasLink = page.getByRole('link', { name: 'Canvas', exact: true });
  try { await canvasLink.waitFor({ timeout: 20000 }); }
  catch { fail('ClassLink did not sign in; check credentials or a school verification challenge.'); }
  await canvasLink.click();
  let canvas;
  for (let i = 0; i < 20; i++) {
    canvas = context.pages().find(p => p.url().startsWith('https://lisdtx.instructure.com/'));
    if (canvas) break;
    await page.waitForTimeout(500);
  }
  if (!canvas) fail('Canvas SSO did not open.');
  await canvas.goto(`${BASE}/grades`, { waitUntil: 'domcontentloaded' });
  await canvas.getByRole('row').first().waitFor();
  const rows = await canvas.getByRole('row').allTextContents();
  const matches = rows.filter(r => /^A-[^\n]+:\s*Attendance Day \d+\b/.test(r.trim()) && sameDueDate(r, today));
  if (matches.length !== 1) fail(`Expected one Attendance row due ${today.month} ${today.day}; found ${matches.length}.`);
  const row = matches[0];
  const title = row.match(/A-[^\n]+:\s*Attendance Day \d+/)?.[0];
  if (!title) fail('Could not read the dated attendance title.');
  const dueIndex = row.search(/\b[A-Z][a-z]{2}\s+\d{1,2}\s+by\s+11:59pm\b/);
  const afterDue = row.slice(dueIndex);
  if (/\b[A-Z][a-z]{2}\s+\d{1,2}\s+at\s+\d{1,2}:\d{2}(?:am|pm)\b/.test(afterDue)) {
    note(`${title}: already submitted; skipped.`);
    process.exitCode = 0;
  } else {
    await canvas.goto(`${BASE}/modules`, { waitUntil: 'domcontentloaded' });
    if (!(await canvas.locator('body').innerText()).includes('Attendance -- First Nine Weeks')) fail('Current nine-weeks attendance module not found.');
    const link = canvas.getByRole('link', { name: title, exact: true });
    if (await link.count() !== 1) fail(`Expected one module link for ${title}.`);
    await link.click();
    await canvas.waitForLoadState('domcontentloaded');
    await canvas.waitForTimeout(5000);
    let body = await canvas.locator('body').innerText();
    if (/locked until|not available/i.test(body)) fail(`${title} is locked or unavailable.`);
    if (!body.includes('Complete the following question during your scheduled course time')) {
      const relevant = body.split('\n').map(x => x.trim()).filter(x => /attendance|scheduled|course time|question|instructions/i.test(x)).slice(-10).map(x => x.slice(0, 200));
      const frames = canvas.frames().map(frame => ({ url: frame.url().split('?')[0], name: frame.name() }));
      fail(`Attendance instructions changed; review required. URL: ${canvas.url()}. Relevant page lines: ${JSON.stringify(relevant)}. Visible page: ${JSON.stringify(body.slice(0, 1400))}. Frames: ${JSON.stringify(frames)}`);
    }
    const start = canvas.getByRole('button', { name: /^(Begin|Resume)$/ });
    if (await start.count() === 1 && await start.isVisible()) await start.click();
    else {
      const buttons = await canvas.getByRole('button').allTextContents();
      fail(`No Begin or Resume button on attendance page; review required. Buttons: ${JSON.stringify(buttons.map(x => x.trim()).filter(Boolean).slice(-15))}. Visible page: ${JSON.stringify(body.slice(-1600))}`);
    }
    await canvas.getByRole('radio').first().waitFor({ timeout: 20000 });
    body = await canvas.locator('body').innerText();
    const positionCount = (body.match(/Question at position \d+\s*\n\d+\s*\n/g) || []).length;
    if (positionCount !== 1 || await canvas.getByRole('radio').count() !== 2) fail(`Quiz layout or question count changed; no answer submitted. Visible quiz: ${JSON.stringify(body.slice(-1600))}`);
    const options = await canvas.getByRole('radio').evaluateAll(radios => radios.map(radio => {
      const label = radio.closest('label') || (radio.id && document.querySelector(`label[for="${CSS.escape(radio.id)}"]`));
      return label?.textContent?.trim() || '';
    }));
    if (options.some(x => !x) || new Set(options).size !== 2) fail('Could not read two distinct quiz answers; no answer submitted.');
    const questionStart = body.lastIndexOf('Question at position 1');
    const optionStart = body.indexOf(options[0], questionStart);
    const question = questionStart >= 0 && optionStart > questionStart
      ? body.slice(questionStart + 'Question at position 1'.length, optionStart).trim()
      : null;
    if (!question) fail('Could not isolate the full question; no answer submitted.');
    const answer = answerFor(question, options);
    if (!answer) fail(`Unrecognized question for ${title}; human review required. No answer submitted. Question: ${JSON.stringify(question)}. Options: ${JSON.stringify(options)}`);
    const chosen = canvas.getByRole('radio').nth(options.indexOf(answer));
    await chosen.check();
    if (!(await chosen.isChecked())) fail('Chosen answer did not register.');
    await canvas.getByRole('button', { name: 'Submit', exact: true }).last().click();
    await canvas.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
    await canvas.waitForURL(/\/results/, { timeout: 20000 });
    await canvas.goto(`${BASE}/grades`, { waitUntil: 'domcontentloaded' });
    const verified = await canvas.getByRole('row').filter({ hasText: title }).innerText();
    if (!/\bComplete\b/.test(verified) || !/\b[A-Z][a-z]{2}\s+\d{1,2}\s+at\s+\d{1,2}:\d{2}(?:am|pm)\b/.test(verified)) fail('Submitted but Grades verification did not confirm Complete; inspect Canvas manually.');
    note(`${title}: submitted and verified Complete in Canvas Grades.`);
  }
} catch (error) {
  note(`Blocked: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
