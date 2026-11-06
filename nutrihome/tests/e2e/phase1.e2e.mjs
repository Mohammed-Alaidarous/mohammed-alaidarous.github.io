// End-to-end check of Phase 1 in a real browser against a running server + PostgreSQL.
// Usage: BASE_URL=http://127.0.0.1:3000 SHOTS=/tmp/shots node tests/e2e/phase1.e2e.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const SHOTS = process.env.SHOTS ?? 'test-results';
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now();
const A = { name: 'محمد', email: `a${stamp}@example.com`, password: 'kabsa-and-laban-1' };
const B = { name: 'سارة', email: `b${stamp}@example.com`, password: 'dates-and-coffee-2' };

const errors = [];
// Birth date exactly 28 years before today (minus a day) so the expected targets never drift.
const d28 = new Date(); d28.setFullYear(d28.getFullYear() - 28); d28.setDate(d28.getDate() - 1);
const BIRTH_28 = `${d28.getFullYear()}-${String(d28.getMonth() + 1).padStart(2, '0')}-${String(d28.getDate()).padStart(2, '0')}`;
const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

async function newPage(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar-SA' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Expected API responses (401 before login, 400 for the deliberately invalid food) are logged by the
  // browser as "Failed to load resource"; those are asserted on explicitly, so only real JS errors count here.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}

async function register(page, u, household) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'حساب جديد' }).click();
  await page.getByLabel('اسمك').fill(u.name);
  await page.getByLabel('البريد الإلكتروني').fill(u.email);
  await page.getByLabel('كلمة المرور').fill(u.password);
  if (household.code) {
    await page.getByRole('button', { name: 'عندي رمز دعوة' }).click();
    await page.getByLabel('رمز الدعوة (من حساب الفرد الآخر)').fill(household.code);
  } else {
    await page.getByLabel('اسم البيت').fill(household.name);
  }
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
}

async function fillProfile(page, p) {
  await page.getByLabel('تاريخ الميلاد').fill(p.birth);
  await page.getByLabel('الطول (سم)').fill(p.height);
  await page.getByLabel('الوزن (كجم)').fill(p.weight);
  if (p.female) await page.getByRole('button', { name: 'أنثى' }).click();
  await page.getByLabel('مستوى النشاط').selectOption(p.activity);
  await page.getByLabel('الهدف').selectOption(String(p.goal));
}

const browser = await chromium.launch();
try {
  console.log('User A: register, profile, food, diary');
  const a = await newPage(browser);
  await register(a.page, A, { name: 'بيت التجربة' });
  await a.page.getByRole('heading', { name: /بياناتك/ }).waitFor();
  await a.page.screenshot({ path: `${SHOTS}/01-onboarding-empty.png` });
  await fillProfile(a.page, { birth: BIRTH_28, height: '178', weight: '85', activity: 'moderate', goal: -0.5 });
  await a.page.getByText('2,280').first().waitFor();
  assert(true, 'live targets preview: male, 28 y, 178 cm, 85 kg, moderate, −0.5 kg/wk → 2,280 kcal');
  await a.page.screenshot({ path: `${SHOTS}/02-onboarding-filled.png`, fullPage: true });
  await a.page.getByRole('button', { name: 'ابدأ' }).click();
  await a.page.getByRole('region', { name: 'ملخص اليوم' }).waitFor();
  await a.page.screenshot({ path: `${SHOTS}/03-dashboard-empty.png` });

  // Create a food from label values in the Foods tab
  await a.page.getByRole('button', { name: 'الأطعمة' }).click();
  await a.page.getByRole('button', { name: 'جديد' }).click();
  const sheet = a.page.locator('dialog[open]');
  await sheet.getByLabel('اسم الطعام').fill('زبادي يوناني');
  await sheet.getByLabel('السعرات (kcal)').fill('59');
  await sheet.getByLabel('بروتين (غ)').fill('10.3');
  await sheet.getByLabel('كارب (غ)').fill('3.6');
  await sheet.getByLabel('دهون (غ)').fill('0.4');
  await sheet.getByText('تفاصيل إضافية').click();
  await sheet.getByRole('button', { name: 'إضافة حصة' }).click();
  await sheet.getByLabel('اسم الحصة').fill('علبة');
  await sheet.getByLabel('الكمية بالغرام').fill('170');
  await a.page.screenshot({ path: `${SHOTS}/04-food-form.png` });
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await a.page.getByText('زبادي يوناني').waitFor();

  // Validation: impossible label values are refused
  await a.page.getByRole('button', { name: 'جديد' }).click();
  await sheet.getByLabel('اسم الطعام').fill('خطأ');
  await sheet.getByLabel('السعرات (kcal)').fill('100');
  await sheet.getByLabel('بروتين (غ)').fill('80');
  await sheet.getByLabel('كارب (غ)').fill('30');
  await sheet.getByLabel('دهون (غ)').fill('0');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await sheet.getByText('مجموع البروتين والكارب والدهون أكبر من 100 غ').waitFor();
  assert(true, 'server rejects macros totalling more than 100 g per 100 g');
  await sheet.getByRole('button', { name: 'إغلاق' }).click();

  // Log the food (1 tub = 170 g → 100.3 kcal) and a quick entry
  await a.page.getByRole('button', { name: 'اليوم', exact: true }).click();
  await a.page.getByRole('button', { name: 'إضافة إلى الفطور' }).click();
  await sheet.getByText('زبادي يوناني').click();
  await sheet.locator('.preview').getByText('100').waitFor();
  await a.page.screenshot({ path: `${SHOTS}/05-amount.png` });
  await sheet.getByRole('button', { name: 'إضافة', exact: true }).click();
  await a.page.getByRole('button', { name: 'إضافة إلى الغداء' }).click();
  await sheet.getByRole('button', { name: 'إضافة سريعة' }).click();
  await sheet.getByLabel('الاسم (اختياري)').fill('غداء مطعم');
  await sheet.getByLabel('السعرات').fill('750');
  await sheet.getByLabel('بروتين (غ)').fill('40');
  await sheet.getByLabel('كارب (غ)').fill('80');
  await sheet.getByLabel('دهون (غ)').fill('25');
  await sheet.getByRole('button', { name: 'إضافة', exact: true }).click();
  await a.page.getByText('غداء مطعم').waitFor();
  const kpis = await a.page.locator('.kpis').innerText();
  assert(kpis.includes('850'), `dashboard eaten = 100.3 + 750 → 850 (kpis: ${kpis.replace(/\s+/g, ' ')})`);
  assert(kpis.includes('1,430'), 'remaining = 2,280 − 850 = 1,430');
  await a.page.screenshot({ path: `${SHOTS}/06-dashboard-logged.png`, fullPage: true });

  // Edit amount: 2 tubs → 200.6 kcal
  await a.page.getByRole('button', { name: /زبادي يوناني/ }).click();
  await sheet.getByLabel('الكمية').fill('2');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await a.page.locator('.kpis').getByText('951').waitFor();
  assert(true, 'editing quantity to 2 tubs updates eaten to 951 (200.6 + 750)');

  // Get invite code
  await a.page.getByRole('button', { name: 'حسابي' }).click();
  const code = (await a.page.locator('.code').innerText()).trim();
  assert(/^[A-Z2-9]{8}$/.test(code), `invite code shown: ${code}`);
  await a.page.screenshot({ path: `${SHOTS}/07-account.png`, fullPage: true });

  console.log('User B: join household, private diary');
  const b = await newPage(browser);
  await register(b.page, B, { code });
  await b.page.getByRole('heading', { name: /بياناتك/ }).waitFor();
  await fillProfile(b.page, { birth: '1999-08-01', height: '163', weight: '60', activity: 'light', goal: 0, female: true });
  await b.page.getByRole('button', { name: 'ابدأ' }).click();
  await b.page.getByRole('region', { name: 'ملخص اليوم' }).waitFor();
  const bEntries = await b.page.locator('.entry').count();
  assert(bEntries === 0, 'B’s diary starts empty (A’s entries are not visible)');
  assert(!(await b.page.getByText('غداء مطعم').count()), 'A’s quick entry is not shown to B');
  await b.page.screenshot({ path: `${SHOTS}/08-userB-dashboard.png` });
  await b.page.getByRole('button', { name: 'الأطعمة' }).click();
  await b.page.getByText('زبادي يوناني').waitFor();
  assert(true, 'B sees the household’s shared food list');
  await b.page.getByRole('button', { name: 'اليوم', exact: true }).click();
  await b.page.getByRole('button', { name: 'إضافة إلى العشاء' }).click();
  const bSheet = b.page.locator('dialog[open]');
  await bSheet.getByText('زبادي يوناني').click();
  await bSheet.getByRole('button', { name: 'غ', exact: true }).click();
  await bSheet.getByLabel('الكمية').fill('100');
  await bSheet.getByRole('button', { name: 'إضافة', exact: true }).click();
  await b.page.locator('.kpis').getByText('59').waitFor();
  assert(true, 'B logs 100 g of the shared food → 59 kcal in B’s own diary');
  await b.page.getByRole('button', { name: 'حسابي' }).click();
  const members = await b.page.locator('.rows').last().innerText();
  assert(members.includes('محمد') && members.includes('سارة'), 'household shows both member names');
  assert(!members.includes('@'), 'other member’s email is not shown');

  console.log('Back to A: diary unchanged by B');
  await a.page.reload();
  await a.page.getByRole('button', { name: 'اليوم', exact: true }).click();
  await a.page.getByRole('region', { name: 'ملخص اليوم' }).waitFor();
  const aKpis = await a.page.locator('.kpis').innerText();
  assert(aKpis.includes('951'), 'A still has 951 kcal; B’s 59 kcal did not leak into A’s totals');
  assert((await a.page.locator('.entry').count()) === 2, 'A still has exactly 2 entries');

  // Logout + login
  await a.page.getByRole('button', { name: 'حسابي' }).click();
  await a.page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await a.page.getByRole('button', { name: 'دخول', exact: true }).waitFor();
  await a.page.getByLabel('البريد الإلكتروني').fill(A.email);
  await a.page.getByLabel('كلمة المرور').fill('wrong-password');
  await a.page.getByRole('button', { name: 'دخول', exact: true }).click();
  await a.page.getByText('البريد أو كلمة المرور غير صحيحة.').waitFor();
  assert(true, 'wrong password shows an Arabic error');
  await a.page.screenshot({ path: `${SHOTS}/09-login-error.png` });
  await a.page.getByLabel('كلمة المرور').fill(A.password);
  await a.page.getByRole('button', { name: 'دخول', exact: true }).click();
  await a.page.getByRole('region', { name: 'ملخص اليوم' }).waitFor();
  assert(true, 'A logs back in to the dashboard');

  // RTL / layout sanity on a phone
  const dir = await a.page.evaluate(() => document.documentElement.dir);
  assert(dir === 'rtl', 'document is RTL');
  const overflow = await a.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'no horizontal scrolling at phone width');

  // Dark mode screenshot
  await a.page.emulateMedia({ colorScheme: 'dark' });
  await a.page.screenshot({ path: `${SHOTS}/10-dashboard-dark.png` });

  assert(errors.length === 0, `no console/page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log('E2E PASSED');
} finally {
  await browser.close();
}
