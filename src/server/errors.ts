export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public currentRevision?: number,
  ) {
    super(message);
  }
}
export function notFound(): never {
  throw new AppError(404, "NOT_FOUND", "Innehållet finns inte.");
}
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "23505";
}
