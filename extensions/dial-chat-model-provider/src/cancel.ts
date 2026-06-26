import axios from 'axios';

/** Error shape used when the user or IDE aborts an in-flight request. */
export function abortError(message = 'Operation aborted'): Error {
	const err = new Error(message);
	err.name = 'AbortError';
	return err;
}

export function isAbortError(error: unknown): boolean {
	if (error instanceof Error && error.name === 'AbortError') {
		return true;
	}
	return axios.isCancel(error);
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw abortError();
	}
}

/** Tear down a readable stream (SSE body) after cancel or failure. */
export function destroyStream(stream: { destroyed?: boolean; destroy(error?: Error): void }): void {
	if (stream.destroyed) {
		return;
	}
	stream.destroy(abortError());
}
