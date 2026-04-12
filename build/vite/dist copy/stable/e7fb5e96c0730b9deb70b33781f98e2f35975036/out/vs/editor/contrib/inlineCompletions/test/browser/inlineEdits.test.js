/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AnnotatedText, InlineEditContext, MockSearchReplaceCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from './utils.js';
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
    async function runTest(cb) {
        const provider = new MockSearchReplaceCompletionsProvider();
        await withAsyncTestCodeEditorAndInlineCompletionsModel(val.value, { fakeClock: true, provider, inlineSuggest: { enabled: true } }, async (ctx) => {
            const view = new InlineEditContext(ctx.model, ctx.editor);
            ctx.store.add(view);
            await cb(ctx, provider, view);
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL3Rlc3QvYnJvd3Nlci9pbmxpbmVFZGl0cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBcUQsb0NBQW9DLEVBQUUsZ0RBQWdELEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFek0sS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7SUFDMUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLGFBQWEsQ0FBQzs7Ozs7Ozs7Ozs7O0NBWTlCLENBQUMsQ0FBQztJQUVGLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBc0o7UUFDNUssTUFBTSxRQUFRLEdBQUcsSUFBSSxvQ0FBb0MsRUFBRSxDQUFDO1FBQzVELE1BQU0sZ0RBQWdELENBQUMsR0FBRyxDQUFDLEtBQUssRUFDL0QsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFDL0QsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQ2IsTUFBTSxJQUFJLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxRCxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQixN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