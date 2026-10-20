/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePreviewState, type MarkdownPreviewState } from '../src/preview/previewScrollState.ts';

const resource = 'file:///workspace/document.md';

/**
 * Mimics how the preview webview computes its state: the state persisted by the previous
 * run of the webview is merged with the state the extension provided for this render.
 */
function render(
	persisted: MarkdownPreviewState,
	settings: { readonly line?: number; readonly renderId?: string },
	dataState: Partial<MarkdownPreviewState> = {},
): MarkdownPreviewState {
	return resolvePreviewState(persisted, { ...persisted, ...dataState }, {
		line: settings.line,
		renderId: settings.renderId,
	});
}

describe('Markdown preview scroll state', () => {
	it('restores the scroll position when the preview is shown again', () => {
		// The preview is opened at line 0 and scrolled down to line 200.
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
			renderId: '1',
		};

		// Switching to another tab and back renders the same content again.
		const state = render(persisted, { line: 0, renderId: '1' }, { resource, line: 0 });

		assert.equal(state.scrollProgress, 0.42, 'the scroll position should be restored');
		assert.equal(state.line, 200, 'the preview should show the line it was showing');
		assert.equal(state.renderId, '1');
	});

	it('restores the scroll position when the same content is rendered again', () => {
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
			renderId: '1',
		};

		// Forcing a refresh renders the same content again.
		const state = render(persisted, { line: 200, renderId: '1' }, { resource, line: 200 });

		assert.equal(state.scrollProgress, 0.42, 'the scroll position should be restored');
		assert.equal(state.line, 200);
	});

	it('does not restore a stale scroll position when returning to the opening line', () => {
		// The preview is opened at line 0 and scrolled down to line 200.
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
			renderId: '1',
		};

		// The preview is hidden, the source is scrolled back to line 0 and the document is
		// edited. The hidden refresh renders the new content and asks for line 0.
		const state = render(persisted, { line: 0, renderId: '2' }, { resource, line: 0 });

		assert.equal(state.scrollProgress, undefined, 'the stale scroll position should be dropped');
		assert.equal(state.line, 0, 'the preview should show the requested line');
		assert.equal(state.renderId, '2');
	});

	it('drops the scroll position when another document is previewed', () => {
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
			renderId: '1',
		};

		const state = render(persisted, { line: 0, renderId: '1' }, { resource: 'file:///workspace/other.md', line: 0 });

		assert.equal(state.scrollProgress, undefined, 'the scroll position should be dropped');
		assert.equal(state.line, 0);
	});

	it('does not restore a scroll position that was saved without a render id', () => {
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
		};

		const state = render(persisted, { line: 0, renderId: '1' }, { resource, line: 0 });

		assert.equal(state.scrollProgress, undefined, 'the scroll position should be dropped');
		assert.equal(state.line, 0);
	});

	it('does not restore a scroll position when no line was requested', () => {
		const persisted: MarkdownPreviewState = {
			scrollProgress: 0.42,
			resource,
			line: 200,
			renderId: '1',
		};

		const state = render(persisted, { renderId: '2' }, { resource });

		assert.equal(state.scrollProgress, 0, 'the preview should start at the top');
	});

	it('remembers the render id of the content that is rendered', () => {
		const state = render({}, { line: 0, renderId: '7' }, { resource, line: 0 });

		assert.equal(state.scrollProgress, undefined, 'there is no scroll position to restore');
		assert.equal(state.line, 0);
		assert.equal(state.renderId, '7');
	});
});
