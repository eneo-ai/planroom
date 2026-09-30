import { z } from "zod";

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentRevision: z.number().optional(),
  }),
});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly currentRevision?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Kunde inte ansluta till tjänsten. Kontrollera anslutningen och försök igen.",
      "NETWORK_ERROR",
    );
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (parsed.success)
      throw new ApiError(
        response.status,
        parsed.data.error.message,
        parsed.data.error.code,
        parsed.data.error.currentRevision,
      );
    throw new ApiError(
      response.status,
      response.status === 401
        ? "Din session har gått ut. Logga in igen i en ny flik och försök igen."
        : "Tjänsten kunde inte slutföra begäran. Försök igen.",
      "REQUEST_FAILED",
    );
  }
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Något gick fel. Försök igen.";
}
