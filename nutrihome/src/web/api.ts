import type { ApiErrorBody } from '../shared/api-types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public issues: ApiErrorBody['issues'] = [],
  ) {
    super(code);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: { 'x-nutrihome': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'server_error', data.issues);
  return data;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body?: unknown) => call<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => call<T>('PUT', url, body),
  del: (url: string) => call<void>('DELETE', url),
};

const MESSAGES: Record<string, string> = {
  network: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة ثانية.',
  server_error: 'صار خطأ في الخادم. حاول مرة ثانية.',
  unauthenticated: 'انتهت الجلسة. سجّل الدخول من جديد.',
  invalid_credentials: 'البريد أو كلمة المرور غير صحيحة.',
  too_many_attempts: 'محاولات كثيرة. انتظر قليلاً ثم حاول.',
  email_taken: 'هذا البريد مسجل مسبقاً.',
  invalid_invite: 'رمز الدعوة غير صحيح.',
  household_full: 'هذا البيت مكتمل (عضوان فقط).',
  not_found: 'العنصر غير موجود.',
  food_not_found: 'هذا الطعام لم يعد موجوداً.',
  serving_not_found: 'الحصة المختارة لم تعد موجودة.',
  invalid_unit: 'الوحدة لا تناسب هذا الطعام.',
  csrf: 'طلب غير مسموح.',
  validation: 'تحقق من الحقول المظللة.',
};

export const ISSUE_MESSAGES: Record<string, string> = {
  macros_exceed_100g: 'مجموع البروتين والكارب والدهون أكبر من 100 غ لكل 100 غ — راجع الملصق.',
  exceeds_per_100_maximum: 'القيمة أكبر من الممكن لكل 100.',
  sugar_exceeds_carbs: 'السكر لا يمكن أن يكون أكثر من الكارب.',
  required_for_per_serving: 'اكتب اسم الحصة (مثل: حبة، علبة).',
  required_for_manual: 'مطلوب في الأهداف اليدوية.',
  age_out_of_range: 'العمر يجب أن يكون بين 13 و100 سنة.',
  invalid_date: 'تاريخ غير صحيح.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? MESSAGES.server_error!;
  return MESSAGES.server_error!;
}

/** Maps server validation issues to { fieldPath: arabic message }. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError) {
    for (const i of e.issues ?? []) out[i.path] ??= ISSUE_MESSAGES[i.message] ?? 'قيمة غير صحيحة.';
  }
  return out;
}
