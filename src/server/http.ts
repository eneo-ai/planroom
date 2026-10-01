import { z } from "zod";
import { AppError } from "./errors";
export { AppError } from "./errors";
export { requirePrincipal } from "./auth";
const BODY_LIMIT = 3 * 1024 * 1024;
const BODY_TIMEOUT_MS = 30_000;
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > BODY_LIMIT)
    throw new AppError(413, "BODY_TOO_LARGE", "Dokumentet är för stort.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Använd application/json.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_JSON", "En JSON-kropp krävs.");
  let buffer = Buffer.alloc(8192);
  let size = 0;
  let interrupted: AppError | undefined;
  const interrupt = (error: AppError) => {
    interrupted = error;
    void reader.cancel().catch(() => {});
  };
  const timeout = setTimeout(
    () =>
      interrupt(
        new AppError(408, "BODY_TIMEOUT", "Begäran tog för lång tid att läsa."),
      ),
    BODY_TIMEOUT_MS,
  );
  const aborted = () =>
    interrupt(new AppError(400, "REQUEST_ABORTED", "Begäran avbröts."));
  request.signal.addEventListener("abort", aborted, { once: true });
  if (request.signal.aborted) aborted();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (interrupted) throw interrupted;
      if (done) break;
      const nextSize = size + value.byteLength;
      if (nextSize > BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new AppError(413, "BODY_TOO_LARGE", "Dokumentet är för stort.");
      }
      if (nextSize > buffer.length) {
        const expanded = Buffer.alloc(
          Math.min(BODY_LIMIT, Math.max(nextSize, buffer.length * 2)),
        );
        buffer.copy(expanded, 0, 0, size);
        buffer = expanded;
      }
      buffer.set(value, size);
      size = nextSize;
    }
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", aborted);
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_JSON", "Ogiltig JSON.");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}
export function uuid(value: string): string {
  if (!z.uuid().safeParse(value).success)
    throw new AppError(400, "INVALID_ID", "Ogiltigt id.");
  return value;
}
export function revisionNumber(value: string): number {
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  )
    throw new AppError(400, "INVALID_REVISION", "Ogiltigt versionsnummer.");
  return Number(value);
}
export async function api(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError)
      return json(
        {
          error: {
            code: error.code,
            ...(error.currentVersion === undefined
              ? {}
              : { currentVersion: error.currentVersion }),
            message: error.message,
            ...(error.currentRevision
              ? { currentRevision: error.currentRevision }
              : {}),
          },
        },
        error.status,
      );
    console.error(
      "Request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Tjänsten kunde inte slutföra begäran.",
        },
      },
      500,
    );
  }
}
