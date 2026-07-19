/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A buffering strategy determines how much incoming markdown content
 * must accumulate before a render is triggered.
 *
 * Buffering is separate from animation — it controls *when* we render,
 * while animation controls *how* rendered content appears.
 */
export interface IIncrementalRenderingBuffer {
	/**
	 * Given the full markdown string and the markdown that was last
	 * rendered to the real DOM, return `true` if the buffer should
	 * be handled entirely within _flushRender (e.g. shadow measurement).
	 * In that case the orchestrator should pass everything through
	 * without updating `_renderedMarkdown`.
	 */
	readonly handlesFlush: boolean;

	/**
	 * Determine the renderable prefix of `fullMarkdown`. The returned
	 * string must be a prefix of `fullMarkdown` (or `fullMarkdown`
	 * itself). Content beyond the returned prefix stays buffered.
	 *
	 * @param fullMarkdown The complete markdown accumulated so far.
	 * @param lastRendered The markdown last rendered to the DOM.
	 * @returns The prefix to render now.
	 */
	getRenderable(fullMarkdown: string, lastRendered: string): string;

	/**
	 * For buffers that handle flushing themselves (e.g. line buffer
	 * with shadow DOM measurement), this is called during
	 * `_flushRender` to decide whether to commit the pending content.
	 *
	 * @param markdown The pending markdown to potentially commit.
	 * @returns The markdown to actually commit, or `undefined` to skip.
	 */
	filterFlush?(markdown: string): string | undefined;

	/**
	 * Whether the buffer needs another rAF frame to continue revealing
	 * content (e.g. typewriter drip-feeding words). When `true`, the
	 * orchestrator re-schedules a render after the current flush.
	 */
	readonly needsNextFrame?: boolean;

	/**
	 * Called when the buffer is no longer needed.
	 */
	dispose?(): void;
}
