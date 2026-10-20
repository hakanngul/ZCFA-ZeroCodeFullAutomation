export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(`${message} (${code})`);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-ZeroCode-Client": "local-ui",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.message ?? "İşlem başarısız.",
      result.code ?? String(response.status),
    );
  return result as T;
}
