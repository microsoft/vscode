/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The state of the markdown preview that is persisted while the preview is not shown.
 *
 * The webview of the preview is disposed of whenever the preview is hidden and is created
 * again when the preview is shown. Its state is restored at that point.
 */
export interface MarkdownPreviewState {
	/**
	 * The resource of the document that was previewed.
	 */
	resource?: string;

	/**
	 * The line of the document that was shown at the top of the preview.
	 *
	 * The line anchors the scroll position in the content of the document instead of in
	 * pixels. The preview can therefore be shown at the same place again, even when the
	 * document has changed in the meantime. This is the same approach that the text editor
	 * uses to restore the position of a file that is opened again.
	 */
	line?: number;

	/**
	 * The fragment of the document that was shown.
	 */
	fragment?: string;
}

/**
 * Describes what a render of the preview asks for.
 */
export interface MarkdownPreviewRender {
	/**
	 * The line of the document that the render asks the preview to show.
	 */
	readonly line: number | undefined;

	/**
	 * The fragment of the document that the render asks the preview to show.
	 */
	readonly fragment: string | undefined;
}

/**
 * The position that the preview should be shown at.
 */
export type MarkdownPreviewPosition =
	| { readonly kind: 'fragment'; readonly fragment: string }
	| { readonly kind: 'restored'; readonly line: number }
	| { readonly kind: 'line'; readonly line: number }
	| { readonly kind: 'start' };

/**
 * The state of the preview and the position that it should be shown at.
 */
export interface ResolvedPreviewState {
	/**
	 * The state that the preview persists.
	 */
	readonly state: MarkdownPreviewState;

	/**
	 * The position that the preview should be shown at.
	 */
	readonly position: MarkdownPreviewPosition;
}

/**
 * Computes the state and the position of the preview that is being loaded.
 *
 * The position of the previous run of the preview is restored whenever it still applies.
 * The preview then keeps the place it was left at, even when the document has been edited
 * in the meantime, because the position is anchored in the content of the document.
 *
 * @param persisted The state that the preview persisted when it was last shown.
 * @param current The state of the preview that is being loaded.
 * @param render What the render of the preview asks for.
 */
export function resolvePreviewState(
	persisted: MarkdownPreviewState,
	current: MarkdownPreviewState,
	render: MarkdownPreviewRender,
): ResolvedPreviewState {
	const position = resolvePreviewPosition(persisted, current, render);
	return {
		position,
		state: {
			resource: current.resource,
			// The line is the anchor of the scroll position. It is only known once the preview
			// has been scrolled to a place, or when the previous position has been restored.
			line: position.kind === 'restored' ? position.line : undefined,
			fragment: position.kind === 'fragment' ? position.fragment : undefined,
		},
	};
}

/**
 * Computes the position that the preview should be shown at.
 *
 * @param persisted The state that the preview persisted when it was last shown.
 * @param current The state of the preview that is being loaded.
 * @param render What the render of the preview asks for.
 */
export function resolvePreviewPosition(
	persisted: MarkdownPreviewState,
	current: MarkdownPreviewState,
	render: MarkdownPreviewRender,
): MarkdownPreviewPosition {
	// A fragment is an explicit request to show a certain place of the document.
	if (render.fragment) {
		return { kind: 'fragment', fragment: render.fragment };
	}

	// Restore the position of the previous run of the preview. It only applies when the same
	// document is previewed again.
	if (current.resource !== undefined && persisted.resource === current.resource && isValidLine(persisted.line)) {
		return { kind: 'restored', line: persisted.line };
	}

	// Otherwise show the line that the render asks for.
	if (isValidLine(render.line)) {
		return { kind: 'line', line: render.line };
	}

	// Otherwise start at the top of the document.
	return { kind: 'start' };
}

function isValidLine(line: number | undefined): line is number {
	return typeof line === 'number' && !isNaN(line);
}
