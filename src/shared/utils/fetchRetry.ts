interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeout?: number;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retry: RetryOptions = {},
): Promise<Response> {
  const { maxAttempts = 4, baseDelayMs = 1000, timeout = 30_000 } = retry;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok && attempt < maxAttempts) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("fetchWithRetry: exhausted attempts");
}
