/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../common/core/range.js';
import { ModelDecorationOptions } from '../../../../common/model/textModel.js';
import { ViewModelDecoration } from '../../../../common/viewModel/viewModelDecoration.js';
import { EditorViewDecorationResolver } from '../../../../browser/viewParts/editorViewGpu/editorViewDecorations.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('EditorViewDecorationResolver', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let editorRoot: HTMLElement;
	let styleElement: HTMLStyleElement;

	setup(() => {
		editorRoot = document.createElement('div');
		editorRoot.className = 'monaco-editor test-theme';
		document.body.append(editorRoot);
		styleElement = document.createElement('style');
		document.head.append(styleElement);
	});

	teardown(() => {
		styleElement.remove();
		editorRoot.remove();
	});

	function resolver(css: string): EditorViewDecorationResolver {
		styleElement.textContent = css;
		return new EditorViewDecorationResolver(editorRoot);
	}

	function decoration(className: string, extra: Partial<{
		inlineClassName: string;
		isWholeLine: boolean;
		showIfCollapsed: boolean;
		zIndex: number;
	}> = {}): ViewModelDecoration {
		return new ViewModelDecoration(
			new Range(2, 3, 4, 5),
			ModelDecorationOptions.register({
				description: 'test',
				className,
				...extra,
			}),
		);
	}

	for (const adoptBeforeConstruction of [false, true]) {
		test(`keeps probes in the main realm and reads owner-document styles (adopt first=${adoptBeforeConstruction})`, () => {
			const iframe = document.createElement('iframe');
			document.body.append(iframe);
			const observer = new MutationObserver(() => { });
			try {
				const ownerDocument = iframe.contentDocument!;
				const ownerStyle = document.createElement('style');
				ownerStyle.textContent = '.monaco-editor .owner-decoration { background-color: #123456; }';
				ownerDocument.head.append(ownerStyle);
				styleElement.textContent = '.monaco-editor .owner-decoration { background-color: #abcdef; }';
				if (adoptBeforeConstruction) {
					ownerDocument.body.append(editorRoot);
				}
				const cssResolver = new EditorViewDecorationResolver(editorRoot);
				if (!adoptBeforeConstruction) {
					ownerDocument.body.append(editorRoot);
				}
				observer.observe(editorRoot, { childList: true });

				const paint = cssResolver.resolve(decoration('owner-decoration'), 1)?.[0].kind;
				const collect = (node: Node): Node[] => [node, ...Array.from(node.childNodes).flatMap(collect)];
				const probes = observer.takeRecords().flatMap(record => Array.from(record.addedNodes).flatMap(collect));
				assert.deepStrictEqual({
					paint,
					probes: probes.map(node => ({
						mainRealm: node instanceof HTMLElement,
						adopted: node.ownerDocument === ownerDocument,
					})),
					remainingChildren: editorRoot.childElementCount,
				}, {
					paint: { kind: 'background', color: 0x123456ff },
					probes: Array.from({ length: 4 }, () => ({ mainRealm: true, adopted: true })),
					remainingChildren: 0,
				});

				ownerStyle.textContent = '.monaco-editor .owner-decoration { background-color: #654321; }';
				cssResolver.clear();
				assert.deepStrictEqual(cssResolver.resolve(decoration('owner-decoration'), 2)?.[0].kind, {
					kind: 'background', color: 0x654321ff,
				});
			} finally {
				observer.disconnect();
				iframe.remove();
			}
		});
	}

	test('resolves the computed cascade without class-name semantics and caches it', () => {
		const cssResolver = resolver(`
			.monaco-editor .extension-background { background-color: rgb(1, 2, 3); }
			.monaco-editor.test-theme .extension-background.emphasized { background-color: rgba(10, 20, 30, 0.5); }
		`);
		const extensionDecoration = decoration('extension-background emphasized', { showIfCollapsed: true, zIndex: 30 });

		assert.deepStrictEqual(cssResolver.resolve(extensionDecoration, 7), [{
			id: 7,
			styleId: 1,
			zIndex: 30,
			startLine: 1,
			startColumn: 2,
			endLine: 3,
			endColumn: 4,
			wholeLine: false,
			fillLineBreak: false,
			includeNewLines: false,
			showIfCollapsed: true,
			kind: { kind: 'background', color: 0x0a141e80 },
		}]);
		styleElement.textContent = '.monaco-editor .extension-background.emphasized { background-color: red; }';
		assert.deepStrictEqual(cssResolver.resolve(extensionDecoration, 8)?.[0].kind, {
			kind: 'background',
			color: 0x0a141e80,
		});
		cssResolver.clear();
		assert.deepStrictEqual(cssResolver.resolve(extensionDecoration, 9)?.[0].kind, {
			kind: 'background',
			color: 0xff0000ff,
		});
	});

	test('keeps only the classic DOM newline geometry exception for findMatch', () => {
		const cssResolver = resolver('.monaco-editor .findMatch { background-color: rgba(234, 92, 0, 0.333); }');
		const result = cssResolver.resolve(decoration('findMatch'), 1);
		assert.deepStrictEqual(result?.[0].kind, { kind: 'background', color: 0xea5c0055 });
		assert.strictEqual(result?.[0].includeNewLines, true);
	});

	test('recognizes the supported SVG wave by computed paint shape', () => {
		const svg = encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 3" height="3" width="6">'
			+ '<g fill="#f14c4c"><polygon points="5.5,0 2.5,3 1.1,3 4.1,0"/>'
			+ '<polygon points="4,0 6,2 6,0.6 5.4,0"/><polygon points="0,2 1,3 2.4,3 0,0.6"/></g></svg>'
		);
		const cssResolver = resolver(`
			.monaco-editor .extension-wave {
				background: url("data:image/svg+xml,${svg}") repeat-x bottom left;
			}
		`);

		assert.deepStrictEqual(cssResolver.resolve(decoration('extension-wave'), 1)?.[0].kind, {
			kind: 'underline',
			color: 0xf14c4cff,
			style: 'wavy',
			width: 3,
			inside: true,
		});
	});

	test('resolves background and supported border paints independently', () => {
		const cssResolver = resolver(`
			.monaco-editor .solid-box {
				background-color: #123456;
				border: 2px solid rgb(255, 0, 0);
				padding: 1px;
				box-sizing: border-box;
			}
			.monaco-editor.test-theme .dotted-box {
				border: 1px dotted rgb(0, 255, 0);
				box-sizing: border-box;
			}
		`);

		assert.deepStrictEqual(cssResolver.resolve(decoration('solid-box', { inlineClassName: 'independent-inline-paint' }), 4)?.map(item => item.kind), [
			{ kind: 'background', color: 0x123456ff },
			{ kind: 'border', color: 0xff0000ff, style: 'solid', width: 2 },
		]);
		assert.deepStrictEqual(cssResolver.resolve(decoration('dotted-box'), 6)?.map(item => item.kind), [
			{ kind: 'border', color: 0x00ff00ff, style: 'dotted', width: 1 },
		]);
	});

	test('resolves solid, dotted and dashed bottom strokes with CSS box placement', () => {
		const cssResolver = resolver(`
			.monaco-editor .solid-underline { border-bottom: 2px solid rgb(255, 0, 0); }
			.monaco-editor .dotted-underline { border-bottom: 1px dotted rgb(0, 255, 0); box-sizing: border-box; }
			.monaco-editor .dashed-underline { border-bottom: 1px dashed rgb(0, 0, 255); box-sizing: border-box; }
		`);

		assert.deepStrictEqual([
			cssResolver.resolve(decoration('solid-underline'), 1)?.[0].kind,
			cssResolver.resolve(decoration('dotted-underline'), 2)?.[0].kind,
			cssResolver.resolve(decoration('dashed-underline'), 3)?.[0].kind,
		], [
			{ kind: 'underline', color: 0xff0000ff, style: 'solid', width: 2, inside: false },
			{ kind: 'underline', color: 0x00ff00ff, style: 'dotted', width: 1, inside: true },
			{ kind: 'underline', color: 0x0000ffff, style: 'dashed', width: 1, inside: true },
		]);
	});

	test('keeps unsupported computed paint on the DOM fallback', () => {
		const cssResolver = resolver(`
			.monaco-editor .mixed-border { border-top: 1px solid red; border-bottom: 2px dashed blue; }
			.monaco-editor .double-border { background-color: #123456; border-bottom: 4px double red; }
			.monaco-editor .dashed-border { border: 1px dashed red; box-sizing: border-box; }
			.monaco-editor .content-box-border { border: 1px solid red; }
			.monaco-editor .pseudo::before { content: ""; display: block; background-color: red; }
			.monaco-editor .pseudo-border::before { content: ""; display: block; border: 2px double red; }
		`);

		assert.strictEqual(cssResolver.resolve(decoration('mixed-border'), 1), undefined, 'mixed border sides');
		assert.strictEqual(cssResolver.resolve(decoration('double-border'), 2), undefined, 'double border');
		assert.strictEqual(cssResolver.resolve(decoration('dashed-border'), 3), undefined, 'full dashed border');
		assert.strictEqual(cssResolver.resolve(decoration('content-box-border'), 3), undefined, 'content-box full border');
		assert.strictEqual(cssResolver.resolve(decoration('pseudo'), 2), undefined, 'painted pseudo-element');
		assert.strictEqual(cssResolver.resolve(decoration('pseudo-border'), 3), undefined, 'bordered pseudo-element');
		assert.strictEqual(cssResolver.resolve(decoration('missing-rule'), 3), undefined, 'unknown CSS');
	});

	test('resolves the text paint inline decorations apply to token spans', () => {
		const inlineResolver = resolver(`
			.monaco-editor .mtk1 { color: rgb(200, 200, 200); }
			.monaco-editor .bracket { color: rgb(255, 215, 0); }
			.monaco-editor .view-line .ghost { color: rgba(255, 255, 255, 0.5); font-style: italic; }
			.monaco-editor .strong { font-weight: bold; }
			.monaco-editor .faded { opacity: 0.25; }
			.monaco-editor .hidden { visibility: hidden; }
		`);
		const style = (className: string) => {
			const resolved = inlineResolver.resolveInlineStyle(className);
			return resolved && { ...resolved, id: undefined };
		};

		assert.deepStrictEqual({
			bracket: style('bracket'),
			ghost: style('ghost'),
			strong: style('strong'),
			faded: style('faded'),
			hidden: style('hidden'),
			combined: style('bracket strong'),
			unknown: style('missing-rule'),
		}, {
			bracket: { id: undefined, foreground: 0xffd700ff },
			ghost: { id: undefined, foreground: 0xffffff80, italic: true },
			strong: { id: undefined, bold: true },
			faded: { id: undefined, opacity: 0.25 },
			hidden: { id: undefined, opacity: 0 },
			combined: { id: undefined, foreground: 0xffd700ff, bold: true },
			unknown: undefined,
		});
		assert.strictEqual(inlineResolver.resolveInlineStyle('bracket'), inlineResolver.resolveInlineStyle('bracket'), 'cached');
		assert.notStrictEqual(inlineResolver.resolveInlineStyle('bracket')!.id, inlineResolver.resolveInlineStyle('strong')!.id);
	});

	test('keeps the token color when a token rule wins the cascade, as in the DOM', () => {
		const inlineResolver = resolver(`
			.monaco-editor .view-lines .view-line .mtk1 { color: rgb(1, 1, 1); }
			.monaco-editor .loses-to-token { color: rgb(0, 0, 255); }
			.monaco-editor .view-lines .view-line .wins { color: rgb(0, 255, 0); }
		`);
		assert.strictEqual(inlineResolver.resolveInlineStyle('loses-to-token'), undefined);
		assert.strictEqual(inlineResolver.resolveInlineStyle('wins')?.foreground, 0x00ff00ff);
	});

	test('leaves inline decorations that need DOM rendering unresolved', () => {
		const inlineResolver = resolver(`
			.monaco-editor .chip { color: red; background-color: rgb(40, 40, 40); }
			.monaco-editor .boxed { color: red; border: 1px solid red; }
			.monaco-editor .padded { color: red; padding: 0 4px; }
			.monaco-editor .small { color: red; font-size: 9px; }
			.monaco-editor .spaced { color: red; letter-spacing: 2px; }
			.monaco-editor .underlined { color: red; text-decoration: underline; }
			.monaco-editor .semibold { font-weight: 600; }
			.monaco-editor .block { color: red; display: inline-block; }
			.monaco-editor .before::before { content: 'x'; }
		`);
		for (const className of ['chip', 'boxed', 'padded', 'small', 'spaced', 'underlined', 'semibold', 'block', 'before']) {
			assert.strictEqual(inlineResolver.resolveInlineStyle(className), undefined, className);
		}
	});
});
