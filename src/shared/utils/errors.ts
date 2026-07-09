/**
 * Domain error type + helpers. Services throw these; the root handler in
 * src/index.ts maps `AppError` to an HTTP status + body.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, code?: string) =>
  new AppError(400, msg, code);
export const unauthorized = (msg: string, code?: string) =>
  new AppError(401, msg, code);
export const forbidden = (msg: string, code?: string) =>
  new AppError(403, msg, code);
export const notFound = (msg: string, code?: string) =>
  new AppError(404, msg, code);
export const conflict = (msg: string, code?: string) =>
  new AppError(409, msg, code);
