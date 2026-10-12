const MAX = 48;
const MAX_INFLIGHT = 2;

const entries = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let inflight = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      inflight++;
      resolve();
    });
  });
}

function release(): void {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

export function getCachedSegment(url: string): Buffer | undefined {
  const hit = entries.get(url);
  if (!hit) return undefined;
  entries.delete(url);
  entries.set(url, hit);
  return hit;
}

export function putCachedSegment(url: string, body: Buffer): void {
  if (entries.has(url)) entries.delete(url);
  entries.set(url, body);
  while (entries.size > MAX) {
    const oldest = entries.keys().next().value;
    if (oldest == null) break;
    entries.delete(oldest);
  }
}

export function coalesceSegment(url: string, work: () => Promise<Buffer>): Promise<Buffer> {
  const hit = getCachedSegment(url);
  if (hit) return Promise.resolve(hit);
  const existing = pending.get(url);
  if (existing) return existing;
  const job = (async () => {
    await acquire();
    try {
      const body = await work();
      putCachedSegment(url, body);
      return body;
    } finally {
      release();
    }
  })().finally(() => {
    pending.delete(url);
  });
  pending.set(url, job);
  return job;
}
