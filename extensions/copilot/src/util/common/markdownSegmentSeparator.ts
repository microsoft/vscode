/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sink-agnostic helper that emits a paragraph separator (typically `\n\n`)
 * when an upstream model SDK starts a new logical text segment within the
 * same turn.
 *
 * Background: model SDKs model a turn as discrete items (content blocks,
 * output-index tagged events, messageId-tagged messages). The natural way
 * to write a handler — `for (item) stream.markdown(item.text)` — silently
 * fuses consecutive items into a single run-on paragraph
 * (e.g. `"...wiring:Now add..."`). This helper makes the segment-boundary
 * an explicit operation at every call site.
 *
 * Usage:
 *
 * ```ts
 * const separator = new MarkdownSegmentSeparator(() => stream.markdown('\n\n'));
 * // when receiving a new text fragment from segment `segmentKey`:
 * separator.onSegment(segmentKey);
 * stream.markdown(text);
 * ```
 */
export class MarkdownSegmentSeparator {

	private lastSegmentKey: string | number | undefined;

	constructor(private readonly emitSeparator: () => void) { }

	/**
	 * Call before emitting text from `segmentKey`. Emits the separator if
	 * the segment has changed since the previous emission (and this is not
	 * the first emission).
	 *
	 * If `segmentKey` is `undefined` the call is a no-op: the last known
	 * key is preserved and no separator is emitted. This keeps the legacy
	 * fallback (no key on either side) silent.
	 */
	onSegment(segmentKey: string | number | undefined): void {
		if (segmentKey === undefined) {
			return;
		}
		if (
			this.lastSegmentKey !== undefined &&
			segmentKey !== this.lastSegmentKey
		) {
			this.emitSeparator();
		}
		this.lastSegmentKey = segmentKey;
	}

	/**
	 * Reset internal state. Call at request/turn boundaries to avoid
	 * spurious separators bleeding across turns when the same instance is
	 * reused.
	 */
	reset(): void {
		this.lastSegmentKey = undefined;
	}
}
