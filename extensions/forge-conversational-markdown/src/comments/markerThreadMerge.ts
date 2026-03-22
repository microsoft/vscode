import type { MutableCommentThreadRecord } from './ThreadModel';

/**
 * Previously merged `<!-- forge-cmt:… -->` ranges from the Markdown into threads.
 * Selection comments are now kept only in memory and are not written to the file.
 */
export function mergeDocumentMarkersIntoThreads(
	_source: string,
	_threads: MutableCommentThreadRecord[],
	_nowIso: () => string,
): void {
	// no-op
}
