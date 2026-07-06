/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PROSEMIRROR_BUNDLE_BASE64 } from '../../browser/prosemirrorBundle.js';

// A minimal handle on the live ProseMirror view - enough to drive edits and read the doc back in a test
// without pulling PM's own types (the bundle is a base64 artifact, not an importable module).
interface ILwdpmView {
	state: { doc: { textContent: string; content: { size: number }; nodeSize: number }; tr: unknown };
	dispatch(tr: unknown): void;
	destroy(): void;
}

// The surface the vendored bundle exposes. The bundle is the SAME artifact shipped into the webview
// (decision 43/46); we exercise it directly so the test proves the real bound-figure node + Markdown
// serialize/parse (and, in the DOM tests, the real history plugin), not a re-implementation.
interface ILwdpmTestSurface {
	roundTrip(markdown: string): string;
	docJSON(markdown: string): unknown;
	mount(parent: HTMLElement, markdown: string, options?: { onChange?: () => void; editable?: boolean }): ILwdpmView;
	toMarkdown(view: ILwdpmView): string;
	cmd(view: ILwdpmView, name: string): boolean;
	setDoc(view: ILwdpmView, markdown: string): void;
	destroy(view: ILwdpmView): void;
}

// Decode + evaluate the vendored IIFE once. It assigns `window.LWDPM`; we hand it a plain object as
// `window` so it never touches the real global. The headless helpers (`roundTrip`/`docJSON`) only use
// the Markdown parser/serializer; the DOM helpers (`mount`/`setDoc`/`cmd`) use the real `document`,
// which is present in this browser test environment.
function loadLwdpm(): ILwdpmTestSurface {
	const code = decodeBase64(PROSEMIRROR_BUNDLE_BASE64).toString();
	const sandbox: { LWDPM?: ILwdpmTestSurface } = {};
	new Function('window', code)(sandbox);
	if (!sandbox.LWDPM) {
		throw new Error('vendored ProseMirror bundle did not define window.LWDPM');
	}
	return sandbox.LWDPM;
}

suite('ProseMirror vendored bundle (LWDPM)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const lwdpm = loadLwdpm();

	test('a bound figure parses to a bound_figure node and round-trips to [label](bind:key)', () => {
		const md = 'Revenue reached [49,800](bind:metrics.mrr.latest) this quarter.';

		// The figure is a first-class atom node (decision 46) carrying the resolved label + its key,
		// sitting inline between the surrounding text runs - not a stripped link or plain text.
		// (Normalize through JSON: ProseMirror's toJSON gives attrs a null prototype.)
		const json = JSON.parse(JSON.stringify(lwdpm.docJSON(md)));
		assert.deepStrictEqual(json, {
			type: 'doc',
			content: [{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Revenue reached ' },
					{ type: 'bound_figure', attrs: { label: '49,800', key: 'metrics.mrr.latest' } },
					{ type: 'text', text: ' this quarter.' }
				]
			}]
		});

		// And it serializes back byte-identically (the on-disk round-trip the keystone needs).
		assert.strictEqual(lwdpm.roundTrip(md).trim(), md);
	});

	test('plain Markdown (heading, emphasis, list) round-trips unchanged', () => {
		const md = '# Heading\n\nA paragraph with **bold** and *italic*.\n\n* one\n* two';
		assert.strictEqual(lwdpm.roundTrip(md).trim(), md.trim());
	});

	test('a normal link stays a normal link (only bind: links become figures)', () => {
		const md = 'Growth of [12%](bind:metrics.growth) beside a [real link](https://example.com).';
		const json = JSON.stringify(lwdpm.docJSON(md));
		// Exactly one bound_figure (the bind: link); the http link is preserved as a link mark.
		assert.strictEqual(json.split('"bound_figure"').length - 1, 1);
		assert.ok(json.includes('https://example.com'), 'normal link href should survive');
		assert.strictEqual(lwdpm.roundTrip(md).trim(), md);
	});

	// --- Keystroke-level history (plan 26 iter 1) --------------------------------
	// These mount a real EditorView so they exercise the actual `history()` plugin + undo/redo commands
	// (not a re-implementation). They run in the browser test environment where `document` exists.
	suite('undo / redo history', () => {
		// Type into the live view the same way a keystroke does: an editable transaction, so the history
		// plugin records it. `tr` from the current state, insertText at the cursor, then dispatch.
		function typeAtEnd(view: ILwdpmView, text: string): void {
			const tr = view.state.tr as { insertText(text: string): unknown };
			view.dispatch(tr.insertText(text));
		}

		test('typing then undo removes it; redo restores it', () => {
			const parent = document.createElement('div');
			const view = lwdpm.mount(parent, 'Seed.', {});
			try {
				typeAtEnd(view, ' typed');
				assert.ok(lwdpm.toMarkdown(view).includes('typed'), 'the typed text should be present');

				assert.strictEqual(lwdpm.cmd(view, 'undo'), true, 'undo should apply');
				assert.ok(!lwdpm.toMarkdown(view).includes('typed'), 'undo should remove the typed text');

				assert.strictEqual(lwdpm.cmd(view, 'redo'), true, 'redo should apply');
				assert.ok(lwdpm.toMarkdown(view).includes('typed'), 'redo should restore the typed text');
			} finally {
				lwdpm.destroy(view);
			}
		});

		test('undo cannot cross a setDoc (service write): after setDoc, undo is a no-op', () => {
			// setDoc is the service-driven body reset after an approve/restore. It must recreate the
			// history so Cmd+Z can never silently revert an approved change without an audit entry.
			const parent = document.createElement('div');
			const view = lwdpm.mount(parent, 'Original body.', {});
			try {
				typeAtEnd(view, ' with a local edit');
				lwdpm.setDoc(view, 'Approved body from the service.');

				const before = lwdpm.toMarkdown(view);
				assert.strictEqual(lwdpm.cmd(view, 'undo'), false, 'undo must be a no-op after setDoc');
				assert.strictEqual(lwdpm.toMarkdown(view), before, 'the body must not change on the no-op undo');
			} finally {
				lwdpm.destroy(view);
			}
		});
	});
});
