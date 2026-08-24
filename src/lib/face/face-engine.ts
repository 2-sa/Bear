import type {
  FaceWorkerPayload,
  FaceWorkerResponse,
  FaceWorkerResult,
} from "./face-worker-protocol";
import type { WireFace } from "./match";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  cleanup: () => void;
};

const FACE_ENGINE_BOOT_TIMEOUT_MS = 45_000;
const FACE_ENGINE_REQUEST_TIMEOUT_MS = 30_000;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function rejectPending(reason: Error): void {
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(reason);
  }
  pending.clear();
}

function stopWorker(current: Worker, reason: Error): void {
  current.terminate();
  if (worker !== current) return;
  worker = null;
  readyPromise = null;
  rejectPending(reason);
}

function getWorker(): Worker {
  if (worker) return worker;
  const next = new Worker(new URL("./face-worker.ts", import.meta.url), {
    type: "module",
    name: "harbor-xray-face",
  });
  next.addEventListener("message", (event: MessageEvent<FaceWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    request.cleanup();
    if (response.ok) request.resolve(response.result);
    else request.reject(new Error(response.error));
  });
  next.addEventListener("error", () => {
    stopWorker(next, new Error("X-Ray face worker failed"));
  });
  next.addEventListener("messageerror", () => {
    stopWorker(next, new Error("X-Ray face worker returned an unreadable result"));
  });
  worker = next;
  return next;
}

function request<T extends keyof FaceWorkerPayload>(
  current: Worker,
  message: FaceWorkerPayload[T],
  transfer: Transferable[] = [],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<FaceWorkerResult[T]> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeoutMs = options.timeoutMs ?? FACE_ENGINE_REQUEST_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (worker === current) stopWorker(current, new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    pending.set(id, {
      resolve: (value) => resolve(value as FaceWorkerResult[T]),
      reject,
      cleanup,
    });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      if (worker === current) {
        stopWorker(current, new Error(`X-Ray face worker timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    try {
      current.postMessage({ ...message, id }, transfer);
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function ensureFaceEngine(): Promise<void> {
  if (readyPromise) return readyPromise;
  const current = getWorker();
  readyPromise = request<"ensure">(current, { type: "ensure" }, [], {
    timeoutMs: FACE_ENGINE_BOOT_TIMEOUT_MS,
  })
    .then(() => undefined)
    .catch((error) => {
      if (worker === current) stopWorker(current, error);
      throw error;
    });
  return readyPromise;
}

async function waitForFaceEngine(signal?: AbortSignal): Promise<void> {
  const current = getWorker();
  const ready = ensureFaceEngine();
  if (!signal) return ready;
  if (signal.aborted) {
    stopWorker(current, new DOMException("Aborted", "AbortError"));
    throw new DOMException("Aborted", "AbortError");
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      if (worker === current) stopWorker(current, new DOMException("Aborted", "AbortError"));
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    ready.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    /* The worker may already own this transferred bitmap. */
  }
}

export function releaseFaceEngine(): void {
  if (!worker) {
    readyPromise = null;
    return;
  }
  stopWorker(worker, new Error("X-Ray face worker stopped"));
}

export async function scanFrame(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<WireFace[]> {
  try {
    await waitForFaceEngine(signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const current = worker;
    if (!current) throw new Error("X-Ray face worker is unavailable");
    return await request<"scan">(current, { type: "scan", bitmap, width, height }, [bitmap], {
      signal,
    });
  } catch (error) {
    closeBitmap(bitmap);
    throw error;
  }
}

export async function embedLargestFace(
  bitmap: ImageBitmap,
  signal?: AbortSignal,
): Promise<number[] | null> {
  try {
    await waitForFaceEngine(signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const current = worker;
    if (!current) throw new Error("X-Ray face worker is unavailable");
    return await request<"embed-largest">(current, { type: "embed-largest", bitmap }, [bitmap], {
      signal,
    });
  } catch (error) {
    closeBitmap(bitmap);
    throw error;
  }
}
