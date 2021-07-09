/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionsProvider, InlineCompletionsProviderRegistry } from 'vs/editor/common/modes';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { InlineCompletionsModel, inlineCompletionToGhostText } from 'vs/editor/contrib/inlineCompletions/inlineCompletionsModel';
import { GhostTextContext, MockInlineCompletionsProvider, renderGhostTextToText } from 'vs/editor/contrib/inlineCompletions/test/utils';
import { ITestCodeEditor, TestCodeEditorCreationOptions, withAsyncTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';
import sinon = require('sinon');
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Inline Completions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('inlineCompletionToGhostText', () => {

		function getOutput(text: string, suggestion: string): unknown {
			const rangeStartOffset = text.indexOf('[');
			const rangeEndOffset = text.indexOf(']') - 1;
			const cleanedText = text.replace('[', '').replace(']', '');
			const tempModel = createTextModel(cleanedText);
			const range = Range.fromPositions(tempModel.getPositionAt(rangeStartOffset), tempModel.getPositionAt(rangeEndOffset));
			const options = ['prefix', 'subword'] as const;
			const result = {} as any;
			for (const option of options) {
				result[option] = renderGhostTextToText(inlineCompletionToGhostText({ text: suggestion, range }, tempModel, option), cleanedText);
			}

			tempModel.dispose();

			if (new Set(Object.values(result)).size === 1) {
				return Object.values(result)[0];
			}

			return result;
		}

		test('Basic', () => {
			assert.deepStrictEqual(getOutput('[foo]baz', 'foobar'), 'foo[bar]baz');
			assert.deepStrictEqual(getOutput('[aaa]aaa', 'aaaaaa'), 'aaa[aaa]aaa');
			assert.deepStrictEqual(getOutput('[foo]baz', 'boobar'), undefined);
			assert.deepStrictEqual(getOutput('[foo]foo', 'foofoo'), 'foo[foo]foo');
			assert.deepStrictEqual(getOutput('foo[]', 'bar\nhello'), 'foo[bar\nhello]');
		});

		test('Empty ghost text', () => {
			assert.deepStrictEqual(getOutput('[foo]', 'foo'), 'foo');
		});

		test('Whitespace (indentation)', () => {
			assert.deepStrictEqual(getOutput('[ foo]', 'foobar'), ' foo[bar]');
			assert.deepStrictEqual(getOutput('[\tfoo]', 'foobar'), '\tfoo[bar]');
			assert.deepStrictEqual(getOutput('[\t foo]', '\tfoobar'), '	 foo[bar]');
			assert.deepStrictEqual(getOutput('[\t]', '\t\tfoobar'), '\t[\tfoobar]');
			assert.deepStrictEqual(getOutput('\t[]', '\t'), '\t[\t]');
			assert.deepStrictEqual(getOutput('\t[\t]', ''), '\t\t');
		});

		test('Whitespace (outside of indentation)', () => {
			assert.deepStrictEqual(getOutput('bar[ foo]', 'foobar'), undefined);
			assert.deepStrictEqual(getOutput('bar[\tfoo]', 'foobar'), undefined);
		});

		test('Unsupported cases', () => {
			assert.deepStrictEqual(getOutput('foo[\n]', '\n'), undefined);
		});

		test('Multi Part Diffing', () => {
			assert.deepStrictEqual(getOutput('foo[()]', '(x);'), { prefix: undefined, subword: 'foo([x])[;]' });
			assert.deepStrictEqual(getOutput('[\tfoo]', '\t\tfoobar'), { prefix: undefined, subword: '\t[\t]foo[bar]' });
		});
	});

	test('Does not trigger automatically by default', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('foo');
				await timeout(1000);

				// Provider is not called, no ghost text is shown.
				assert.deepStrictEqual(provider.getAndClearCallHistory(), []);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['']);
			}
		);
	});

	test('Ghost text is shown after trigger', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('foo');
				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				model.trigger();
				await timeout(1000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'foo[bar]']);
			}
		);
	});

	test('Ghost text is shown automatically when configured', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);
				context.keyboardType('foo');

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				await timeout(1000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'foo[bar]']);
			}
		);
	});

	test('Ghost text is updated automatically', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('foo');
				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				model.trigger();
				await timeout(1000);

				provider.setReturnValue({ text: 'foobizz', range: new Range(1, 1, 1, 6) });
				context.keyboardType('bi');
				await timeout(1000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, },
					{ position: '(1,6)', text: 'foobi', triggerKind: 0, }
				]);
				assert.deepStrictEqual(
					context.getAndClearViewStates(),
					['', 'foo[bar]', 'foob[ar]', 'foobi', 'foobi[zz]']
				);
			}
		);
	});

	test('Unindent whitespace', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('  ');
				provider.setReturnValue({ text: 'foo', range: new Range(1, 2, 1, 3) });
				model.trigger();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['', '  [foo]']);

				model.commitCurrentSuggestion();

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,3)', text: '  ', triggerKind: 0, },
				]);

				assert.deepStrictEqual(context.getAndClearViewStates(), [' foo']);
			}
		);
	});

	test('Unindent tab', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('\t\t');
				provider.setReturnValue({ text: 'foo', range: new Range(1, 2, 1, 3) });
				model.trigger();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['', '\t\t[foo]']);

				model.commitCurrentSuggestion();

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,3)', text: '\t\t', triggerKind: 0, },
				]);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['\tfoo']);
			}
		);
	});

	test('No unindent after indentation', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('buzz  ');
				provider.setReturnValue({ text: 'foo', range: new Range(1, 6, 1, 7) });
				model.trigger();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'buzz  ']);

				model.commitCurrentSuggestion();

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,7)', text: 'buzz  ', triggerKind: 0, },
				]);

				assert.deepStrictEqual(context.getAndClearViewStates(), []);
			}
		);
	});

	test('Next/previous', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('foo');
				provider.setReturnValue({ text: 'foobar1', range: new Range(1, 1, 1, 4) });
				model.trigger();
				await timeout(1000);

				assert.deepStrictEqual(
					context.getAndClearViewStates(),
					['', 'foo[bar1]']
				);

				provider.setReturnValues([
					{ text: 'foobar1', range: new Range(1, 1, 1, 4) },
					{ text: 'foobizz2', range: new Range(1, 1, 1, 4) },
					{ text: 'foobuzz3', range: new Range(1, 1, 1, 4) }
				]);

				model.showNext();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bizz2]']);

				model.showNext();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[buzz3]']);

				model.showNext();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bar1]']);

				model.showPrevious();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[buzz3]']);

				model.showPrevious();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bizz2]']);

				model.showPrevious();
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bar1]']);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, },
					{ position: '(1,4)', text: 'foo', triggerKind: 1, },
				]);

			}
		);
	});

	test('Calling the provider is debounced', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);
				model.trigger();

				context.keyboardType('f');
				await timeout(40);
				context.keyboardType('o');
				await timeout(40);
				context.keyboardType('o');
				await timeout(40);

				// The provider is not called
				assert.deepStrictEqual(provider.getAndClearCallHistory(), []);

				await timeout(400);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, }
				]);

				provider.assertNotCalledTwiceWithin50ms();
			}
		);
	});

	test('Backspace is debounced', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('foo');

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				await timeout(1000);

				for (let j = 0; j < 2; j++) {
					for (let i = 0; i < 3; i++) {
						context.leftDelete();
						await timeout(5);
					}

					context.keyboardType('bar');
				}

				await timeout(400);

				provider.assertNotCalledTwiceWithin50ms();
			}
		);
	});

	test('Forward stability', async function () {
		// The user types the text as suggested and the provider is forward-stable
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				context.keyboardType('foo');
				model.trigger();
				await timeout(1000);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'foo[bar]']);

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 5) });
				context.keyboardType('b');
				assert.deepStrictEqual(context.currentPrettyViewState, 'foob[ar]');
				await timeout(1000);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,5)', text: 'foob', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foob[ar]']);

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 6) });
				context.keyboardType('a');
				assert.deepStrictEqual(context.currentPrettyViewState, 'fooba[r]');
				await timeout(1000);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,6)', text: 'fooba', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['fooba[r]']);
			}
		);
	});

	test('Support forward instability', async function () {
		// The user types the text as suggested and the provider reports a different suggestion.

		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);
				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 4) });
				context.keyboardType('foo');
				model.trigger();
				await timeout(100);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'foo[bar]']);

				provider.setReturnValue({ text: 'foobaz', range: new Range(1, 1, 1, 5) });
				context.keyboardType('b');
				assert.deepStrictEqual(context.currentPrettyViewState, 'foob[ar]');
				await timeout(100);
				// This behavior might change!
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,5)', text: 'foob', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foob[ar]', 'foob[az]']);
			}
		);
	});

	test('Support backward instability', async function () {
		// The user deletes text and the suggestion changes
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);

				context.keyboardType('fooba');

				provider.setReturnValue({ text: 'foobar', range: new Range(1, 1, 1, 6) });

				model.trigger();
				await timeout(1000);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,6)', text: 'fooba', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'fooba[r]']);

				provider.setReturnValue({ text: 'foobaz', range: new Range(1, 1, 1, 5) });
				context.leftDelete();
				await timeout(1000);
				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,5)', text: 'foob', triggerKind: 0, }
				]);
				assert.deepStrictEqual(context.getAndClearViewStates(), [
					/*
						TODO: Remove this flickering. Fortunately, it is not visible.
						It is caused by the text model updating before the cursor position.
					*/
					'foob',
					'foob[ar]',
					'foob[az]'
				]);
			}
		);
	});

	test('No race conditions', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, },
			async ({ editor, editorViewModel, model, context }) => {
				model.setActive(true);
				context.keyboardType('h');
				provider.setReturnValue({ text: 'helloworld', range: new Range(1, 1, 1, 2) }, 1000);

				model.trigger();

				await timeout(1030);
				context.keyboardType('ello');
				provider.setReturnValue({ text: 'helloworld', range: new Range(1, 1, 1, 6) }, 1000);

				// after 20ms: Inline completion provider answers back
				// after 50ms: Debounce is triggered
				await timeout(2000);

				assert.deepStrictEqual(context.getAndClearViewStates(), [
					'',
					'hello[world]',
				]);
			});
	});
});

async function withAsyncTestCodeEditorAndInlineCompletionsModel(
	text: string,
	options: TestCodeEditorCreationOptions & { provider?: InlineCompletionsProvider, fakeClock?: boolean },
	callback: (args: { editor: ITestCodeEditor, editorViewModel: ViewModel, model: InlineCompletionsModel, context: GhostTextContext }) => Promise<void>
): Promise<void> {
	const disposableStore = new DisposableStore();

	if (options.provider) {
		const d = InlineCompletionsProviderRegistry.register({ pattern: '**' }, options.provider);
		disposableStore.add(d);
	}

	let clock: sinon.SinonFakeTimers | undefined;
	if (options.fakeClock) {
		clock = sinon.useFakeTimers();
	}
	try {
		const p = withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
			const model = instantiationService.createInstance(InlineCompletionsModel, editor);
			const context = new GhostTextContext(model, editor);
			await callback({ editor, editorViewModel, model, context });
			context.dispose();
			model.dispose();
		});

		const p2 = clock?.runAllAsync();

		await p;
		await p2;

		if (options.provider instanceof MockInlineCompletionsProvider) {
			options.provider.assertNotCalledTwiceWithin50ms();
		}
	} finally {
		clock?.restore();
		disposableStore.dispose();
	}
}
