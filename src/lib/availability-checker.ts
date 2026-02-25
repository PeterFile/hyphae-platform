export interface AvailabilityResult {
  isOnline: boolean;
  latencyMs: number;
  lastChecked: string;
  statusCode: number | null;
}

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CONCURRENCY = 5;
const FALLBACK_TO_GET_STATUS = new Set([403, 405]);

function nowIsoString(): string {
  return new Date().toISOString();
}

function normalizeTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}

function normalizeConcurrency(concurrency: number): number {
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    return DEFAULT_CONCURRENCY;
  }

  return Math.floor(concurrency);
}

function createOfflineResult(startMs: number): AvailabilityResult {
  return {
    isOnline: false,
    latencyMs: Date.now() - startMs,
    lastChecked: nowIsoString(),
    statusCode: null,
  };
}

function createLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (activeCount >= concurrency) {
      return;
    }

    const nextTask = queue.shift();
    if (!nextTask) {
      return;
    }

    activeCount += 1;
    nextTask();
  };

  return <T>(task: () => Promise<T>) => {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            activeCount -= 1;
            runNext();
          });
      });

      runNext();
    });
  };
}

async function probeEndpoint(url: string, signal: AbortSignal): Promise<Response> {
  const headResponse = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    signal,
  });

  if (!FALLBACK_TO_GET_STATUS.has(headResponse.status)) {
    return headResponse;
  }

  return fetch(url, {
    method: "GET",
    redirect: "manual",
    signal,
  });
}

export async function checkEndpoint(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<AvailabilityResult> {
  const startMs = Date.now();
  const timeout = normalizeTimeout(timeoutMs);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await probeEndpoint(url, controller.signal);
    return {
      isOnline: true,
      latencyMs: Date.now() - startMs,
      lastChecked: nowIsoString(),
      statusCode: response.status,
    };
  } catch {
    return createOfflineResult(startMs);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkMultiple(
  urls: string[],
  concurrency = DEFAULT_CONCURRENCY,
): Promise<AvailabilityResult[]> {
  if (urls.length === 0) {
    return [];
  }

  const limit = createLimiter(Math.min(normalizeConcurrency(concurrency), urls.length));
  const checks = urls.map((url) => limit(() => checkEndpoint(url)));
  const settled = await Promise.allSettled(checks);

  return settled.map((entry) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }

    return {
      isOnline: false,
      latencyMs: 0,
      lastChecked: nowIsoString(),
      statusCode: null,
    };
  });
}

