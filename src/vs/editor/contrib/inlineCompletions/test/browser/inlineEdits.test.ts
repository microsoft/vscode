/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AnnotatedText, InlineEditContext, IWithAsyncTestCodeEditorAndInlineCompletionsModel, MockSearchReplaceCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from './utils.js';

suite('Inline Edits', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const val = new AnnotatedText(`
class Point {
	constructor(public x: number, public y: number) {}

	getLength2D(): number {
		return↓ Math.sqrt(this.x * this.x + this.y * this.y↓);
	}

	getJson(): string {
		return ↓Ü;
	}
}
`);

	async function runTest(cb: (ctx: IWithAsyncTestCodeEditorAndInlineCompletionsModel, provider: MockSearchReplaceCompletionsProvider, view: InlineEditContext) => Promise<void>): Promise<void> {
		const provider = new MockSearchReplaceCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel(val.value,
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async (ctx) => {
				const view = new InlineEditContext(ctx.model, ctx.editor);
				ctx.store.add(view);
				await cb(ctx, provider, view);
			}
		);
	}

	test('Can Accept Inline Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);

			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			model.accept();

			assert.deepStrictEqual(editor.getValue(), `
class Point {
	constructor(public x: number, public y: number) {}

	getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	getJson(): string {
		return Ü;
	}
}
`);
		});
	});

	test('Can Type Inline Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			editor.setPosition(val.getMarkerPosition(1));
			editorViewModel.type(' + t');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...this.y + t❰his.z...his.z❱);\n'
			]));

			editorViewModel.type('his.z * this.z');
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...'
			]));
		});
	});

	test('Inline Edit Is Correctly Shifted When Typing', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add('Ü', '{x: this.x, y: this.y}');
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'...\n\t\treturn ❰Ü↦{x: t...is.y}❱;\n'
			]));
			editor.setPosition(val.getMarkerPosition(2));
			editorViewModel.type('{');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'...\t\treturn {❰Ü↦x: th...is.y}❱;\n'
			]));
		});
	});

	test('Inline Edit Stays On Unrelated Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			editor.setPosition(val.getMarkerPosition(0));
			editorViewModel.type('/* */');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined
			]));
		});
	});
});
