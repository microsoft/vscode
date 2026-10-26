/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILineSpan {
	readonly startLine: number;
	readonly endLine: number;
}

/**
 * Whether every line of `span` (inclusive) lies inside a single visible range.
 */
export function isSpanFullyVisible(visibleRanges: readonly ILineSpan[], span: ILineSpan): boolean {
	return visibleRanges.some(r => r.startLine <= span.startLine && span.endLine <= r.endLine);
}

export interface IEditorVisibleLines<TDocument> {
	readonly document: TDocument;
	readonly visibleRanges: readonly ILineSpan[];
}

/**
 * Whether `span` of `document` is fully visible in an editor that could have shown it: the active editor when it
 * shows `document`, otherwise any visible editor of `document`.
 *
 * `document` must be the document `span` is relative to, e.g. the notebook cell rather than the notebook.
 */
export function isSpanFullyVisibleInDocument<TDocument>(
	document: TDocument,
	span: ILineSpan,
	activeEditor: IEditorVisibleLines<TDocument> | undefined,
	visibleEditors: readonly IEditorVisibleLines<TDocument>[],
): boolean {
	const candidates = activeEditor?.document === document
		? [activeEditor]
		: visibleEditors.filter(editor => editor.document === document);
	return candidates.some(editor => isSpanFullyVisible(editor.visibleRanges, span));
}

/**
 * Lines an edit occupies on screen: the replaced lines, extended by the lines of the new text.
 */
export function getEditedLineSpan(replaceStartLine: number, replaceEndLine: number, newText: string): ILineSpan {
	const newTextEndLine = replaceStartLine + newText.split('\n').length - 1;
	return { startLine: replaceStartLine, endLine: Math.max(replaceEndLine, newTextEndLine) };
}
