/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The state that the markdown preview webview persists between runs.
 *
 * The webview that renders the preview is disposed of whenever the preview is hidden, so
 * this state is the only way for the preview to remember where it was scrolled to.
 */
export interface MarkdownPreviewState {
	/** How far the preview was scrolled down, as a fraction of the height of the document. */
	scrollProgress?: number;
	/** The resource that was previewed. */
	resource?: string;
	/** The line that was shown at the top of the preview. */
	line?: number;
	/** The fragment that was shown. */
	fragment?: string;
	/** Identifies the content that was rendered. */
	renderId?: string;
}

/**
 * Describes the content that is about to be rendered into the preview.
 */
export interface MarkdownPreviewRender {
	/** The line the preview was asked to scroll to. */
	readonly line: number | undefined;
	/**
	 * Identifies the content that is rendered.
	 *
	 * The same id is rendered again when the preview is hidden and shown again, which lets
	 * the preview tell that it is looking at the same content as it was looking at before.
	 */
	readonly renderId: string | undefined;
}

/**
 * Computes the state the preview should start with.
 *
 * When the preview is hidden, its webview is disposed of and rendered again from scratch
 * once the preview is shown again. Restoring the scroll position of the previous run is
 * only correct if the same content is rendered again: if the content was re-rendered in
 * the meantime, the old scroll position is stale and the requested line should be used
 * instead.
 */
export function resolvePreviewState(
	persisted: MarkdownPreviewState,
	current: MarkdownPreviewState,
	render: MarkdownPreviewRender,
): MarkdownPreviewState {
	const hasRequestedLine = typeof render.line === 'number' && !isNaN(render.line);
	const isSameContent = persisted.resource === current.resource
		&& typeof persisted.renderId === 'string'
		&& persisted.renderId === render.renderId;

	if (typeof persisted.scrollProgress === 'undefined') {
		// There is no scroll position to restore.
		return { ...current, renderId: render.renderId };
	}

	if (isSameContent) {
		// The same content is rendered again, for example because the preview was hidden
		// and shown again. Restore the scroll position the preview had.
		return {
			...current,
			scrollProgress: persisted.scrollProgress,
			line: persisted.line ?? current.line,
			renderId: render.renderId,
		};
	}

	// The content was rendered again, so the persisted scroll position no longer applies.
	return {
		...current,
		scrollProgress: hasRequestedLine ? undefined : 0,
		line: render.line ?? current.line,
		renderId: render.renderId,
	};
}
