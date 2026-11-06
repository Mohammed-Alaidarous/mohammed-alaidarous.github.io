export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = (code = 'not_found') => new HttpError(404, code);
export const badRequest = (code: string) => new HttpError(400, code);
export const conflict = (code: string) => new HttpError(409, code);
export const unauthorized = (code = 'unauthenticated') => new HttpError(401, code);
