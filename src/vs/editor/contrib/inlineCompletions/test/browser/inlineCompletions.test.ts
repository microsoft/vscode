/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDataChannelService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Range } from '../../../../common/core/range.js';
import { InlineCompletionTriggerKind, InlineCompletions, InlineCompletionsProvider, ProviderId } from '../../../../common/languages.js';
import { InlineCompletionsModel } from '../../browser/model/inlineCompletionsModel.js';
import { InlineCompletionEditorType } from '../../browser/model/provideInlineCompletions.js';
import { InlineCompletionsSource } from '../../browser/model/inlineCompletionsSource.js';
import { IWithAsyncTestCodeEditorAndInlineCompletionsModel, MockInlineCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from './utils.js';
import { ITestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { Selection } from '../../../../common/core/selection.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';

suite('Inline Completions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Emits empty response telemetry after instantiation service disposal', async function () {
		const providerStarted = new DeferredPromise<void>();
		const providerResponse = new DeferredPromise<InlineCompletions>();
		const provider: InlineCompletionsProvider = {
			providerId: ProviderId.fromExtensionId('GitHub.copilot'),
			provideInlineCompletions: () => {
				providerStarted.complete();
				return providerResponse.p;
			},
			disposeInlineCompletions: () => { },
		};
		const sentChannelIds: string[] = [];
		const dataChannelService: IDataChannelService = {
			_serviceBrand: undefined,
			onDidSendData: Event.None,
			getDataChannel: channelId => ({
				sendData: () => sentChannelIds.push(channelId)
			})
		};
		const serviceCollection = new ServiceCollection(
			[IDataChannelService, dataChannelService],
			[IConfigurationService, new TestConfigurationService({
				'github.copilot.enable': { '*': true },
			})],
		);

		await withAsyncTestCodeEditorAndInlineCompletionsModel('', { provider, serviceCollection },
			async ({ editor, model, store, instantiationService }) => {
				const source = store.add(instantiationService.createInstance(
					InlineCompletionsSource,
					model.textModel,
					model._textModelVersionId,
					{ get: () => 0, update: () => 0, default: () => 0 },
					observableValue('testCursorPosition', editor.getPosition()!),
					'github.copilot.enable',
				));
				const request = source.fetch([provider], undefined, {
					triggerKind: InlineCompletionTriggerKind.Explicit,
					selectedSuggestionInfo: undefined,
					earliestShownDateTime: 0,
					includeInlineCompletions: true,
					includeInlineEdits: false,
					requestIssuedDateTime: Date.now(),
				}, undefined, false, observableValue('userJumpedToActiveCompletion', false), {
					startTime: Date.now(),
					sku: undefined,
					editorType: InlineCompletionEditorType.TextEditor,
					languageId: 'plaintext',
					availableProviders: [provider.providerId!],
					reason: '',
					typingInterval: 0,
					typingIntervalCharacterCount: 0,
				});
				await providerStarted.p;
				instantiationService.dispose();
				await providerResponse.complete({ items: [] });
				await request;
			}
		);

		assert.deepStrictEqual(sentChannelIds, ['editTelemetry']);
	});

	test('Does not trigger automatically if disabled', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: false } },
			async ({ editor, editorViewModel, model, context }) => {
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
				context.keyboardType('foo');
				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
				model.triggerExplicitly();
				await timeout(1000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 1, }
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
				context.keyboardType('foo');

				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
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
				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
				context.keyboardType('foo');
				model.triggerExplicitly();
				await timeout(1000);

				provider.setReturnValue({ insertText: 'foobizz', range: new Range(1, 1, 1, 6) });
				context.keyboardType('b');
				context.keyboardType('i');
				await timeout(1000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,4)', text: 'foo', triggerKind: 1, },
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
				context.keyboardType('  ');
				provider.setReturnValue({ insertText: 'foo', range: new Range(1, 2, 1, 3) });
				model.triggerExplicitly();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['', '  [foo]']);

				model.accept(editor);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,3)', text: '  ', triggerKind: 1, },
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
				context.keyboardType('\t\t');
				provider.setReturnValue({ insertText: 'foo', range: new Range(1, 2, 1, 3) });
				model.triggerExplicitly();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['', '\t\t[foo]']);

				model.accept(editor);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,3)', text: '\t\t', triggerKind: 1, },
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
				context.keyboardType('buzz  ');
				provider.setReturnValue({ insertText: 'foo', range: new Range(1, 6, 1, 7) });
				model.triggerExplicitly();
				await timeout(1000);

				assert.deepStrictEqual(context.getAndClearViewStates(), ['']);

				model.accept(editor);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(1,7)', text: 'buzz  ', triggerKind: 1, },
				]);

				assert.deepStrictEqual(context.getAndClearViewStates(), []);
			}
		);
	});

	test('Next/previous', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context, logger }) => {
				context.keyboardType('foo');
				provider.setReturnValue({ insertText: 'foobar1', range: new Range(1, 1, 1, 4) });
				logger.logRun(() => model.trigger());
				await timeout(1000);

				assert.deepStrictEqual(
					context.getAndClearViewStates(),
					['', 'foo[bar1]']
				);

				provider.setReturnValues([
					{ insertText: 'foobar1', range: new Range(1, 1, 1, 4) },
					{ insertText: 'foobizz2', range: new Range(1, 1, 1, 4) },
					{ insertText: 'foobuzz3', range: new Range(1, 1, 1, 4) }
				]);

				logger.logRun(() => model.next());
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bizz2]']);

				logger.logRun(() => model.next());
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[buzz3]']);

				logger.logRun(() => model.next());
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bar1]']);

				logger.logRun(() => model.previous());
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[buzz3]']);

				logger.logRun(() => model.previous());
				await timeout(1000);
				assert.deepStrictEqual(context.getAndClearViewStates(), ['foo[bizz2]']);

				logger.logRun(() => model.previous());
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
				context.keyboardType('foo');

				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
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


	suite('Forward Stability', () => {
		test('Typing agrees', async function () {
			// The user types the text as suggested and the provider is forward-stable
			const provider = new MockInlineCompletionsProvider();
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async ({ editor, editorViewModel, model, context }) => {
					provider.setReturnValue({ insertText: 'foobar', });
					context.keyboardType('foo');
					model.trigger();
					await timeout(1000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,4)', text: 'foo', triggerKind: 0, }
					]);
					assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'foo[bar]']);

					context.keyboardType('b');
					assert.deepStrictEqual(context.getAndClearViewStates(), (['foob[ar]']));
					await timeout(1000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,5)', text: 'foob', triggerKind: 0, }
					]);
					assert.deepStrictEqual(context.getAndClearViewStates(), []);

					context.keyboardType('a');
					assert.deepStrictEqual(context.getAndClearViewStates(), (['fooba[r]']));
					await timeout(1000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,6)', text: 'fooba', triggerKind: 0, }
					]);
					assert.deepStrictEqual(context.getAndClearViewStates(), []);
				}
			);
		});

		async function setupScenario({ editor, editorViewModel, model, context, store }: IWithAsyncTestCodeEditorAndInlineCompletionsModel, provider: MockInlineCompletionsProvider): Promise<void> {
			assert.deepStrictEqual(context.getAndClearViewStates(), ['']);
			provider.setReturnValue({ insertText: 'foo bar' });
			context.keyboardType('f');
			model.triggerExplicitly();
			await timeout(10000);
			assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(1,2)', triggerKind: 1, text: 'f' }]));
			assert.deepStrictEqual(context.getAndClearViewStates(), (['f[oo bar]']));

			provider.setReturnValue({ insertText: 'foo baz' });
			await timeout(10000);
		}

		test('Support forward instability', async function () {
			// The user types the text as suggested and the provider reports a different suggestion.
			const provider = new MockInlineCompletionsProvider();
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async (ctx) => {
					await setupScenario(ctx, provider);

					ctx.context.keyboardType('o');
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ['fo[o bar]']);
					await timeout(10000);

					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,3)', text: 'fo', triggerKind: 0, }
					]);
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ['fo[o baz]']);
				}
			);
		});


		test('when accepting word by word', async function () {
			// The user types the text as suggested and the provider reports a different suggestion.
			// Even when triggering explicitly, we want to keep the suggestion.

			const provider = new MockInlineCompletionsProvider();
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async (ctx) => {
					await setupScenario(ctx, provider);

					await ctx.model.acceptNextWord();
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), (['foo[ bar]']));

					await timeout(10000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(1,4)', triggerKind: 0, text: 'foo' }]));
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ([]));

					await ctx.model.triggerExplicitly(); // reset to provider truth
					await timeout(10000);
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ([]));
				}
			);
		});

		test('when accepting undo', async function () {
			// The user types the text as suggested and the provider reports a different suggestion.

			const provider = new MockInlineCompletionsProvider();
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async (ctx) => {
					await setupScenario(ctx, provider);

					await ctx.model.acceptNextWord();
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), (['foo[ bar]']));

					await timeout(10000);
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ([]));
					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(1,4)', triggerKind: 0, text: 'foo' }]));

					await ctx.editor.getModel().undo();
					await timeout(10000);
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), (['f[oo bar]']));
					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(1,2)', triggerKind: 0, text: 'f' }]));

					await ctx.editor.getModel().redo();
					await timeout(10000);
					assert.deepStrictEqual(ctx.context.getAndClearViewStates(), (['foo[ bar]']));
					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(1,4)', triggerKind: 0, text: 'foo' }]));
				}
			);
		});

		test('Support backward instability', async function () {
			// The user deletes text and the suggestion changes
			const provider = new MockInlineCompletionsProvider();
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async ({ editor, editorViewModel, model, context }) => {
					context.keyboardType('fooba');

					provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 6) });

					model.triggerExplicitly();
					await timeout(1000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,6)', text: 'fooba', triggerKind: 1, }
					]);
					assert.deepStrictEqual(context.getAndClearViewStates(), ['', 'fooba[r]']);

					provider.setReturnValue({ insertText: 'foobaz', range: new Range(1, 1, 1, 5) });
					context.leftDelete();
					await timeout(1000);
					assert.deepStrictEqual(provider.getAndClearCallHistory(), [
						{ position: '(1,5)', text: 'foob', triggerKind: 0, }
					]);
					assert.deepStrictEqual(context.getAndClearViewStates(), [
						'foob[ar]',
						'foob[az]'
					]);
				}
			);
		});

		test('Push item to preserve to front', async function () {
			const provider = new MockInlineCompletionsProvider(true);
			await withAsyncTestCodeEditorAndInlineCompletionsModel('',
				{ fakeClock: true, provider },
				async ({ editor, editorViewModel, model, context }) => {
					provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
					context.keyboardType('foo');
					await timeout(1000);

					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([
						{
							position: '(1,4)',
							triggerKind: 0,
							text: 'foo'
						}
					]));
					assert.deepStrictEqual(context.getAndClearViewStates(),
						([
							'',
							'foo[bar]'
						])
					);

					provider.setReturnValues([{ insertText: 'foobar1', range: new Range(1, 1, 1, 4) }, { insertText: 'foobar', range: new Range(1, 1, 1, 4) }]);

					await model.triggerExplicitly();
					await timeout(1000);

					assert.deepStrictEqual(provider.getAndClearCallHistory(), ([
						{
							position: '(1,4)',
							triggerKind: 1,
							text: 'foo'
						}
					]));
					assert.deepStrictEqual(context.getAndClearViewStates(),
						([])
					);
				}
			);
		});
	});

	test('No race conditions', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('h');
				provider.setReturnValue({ insertText: 'helloworld', range: new Range(1, 1, 1, 2) }, 1000);

				model.triggerExplicitly();

				await timeout(1030);
				context.keyboardType('ello');
				provider.setReturnValue({ insertText: 'helloworld', range: new Range(1, 1, 1, 6) }, 1000);

				// after 20ms: Inline completion provider answers back
				// after 50ms: Debounce is triggered
				await timeout(2000);

				assert.deepStrictEqual(context.getAndClearViewStates(), [
					'',
					'hello[world]',
				]);
			});
	});

	test('Do not reuse cache from previous session (#132516)', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('hello\n');
				context.cursorLeft();
				context.keyboardType('x');
				context.leftDelete();
				provider.setReturnValue({ insertText: 'helloworld', range: new Range(1, 1, 1, 6) }, 1000);
				await timeout(2000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{
						position: '(1,6)',
						text: 'hello\n',
						triggerKind: 0,
					}
				]);

				provider.setReturnValue({ insertText: 'helloworld', range: new Range(2, 1, 2, 6) }, 1000);

				context.cursorDown();
				context.keyboardType('hello');
				await timeout(40);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), []);

				// Update ghost text
				context.keyboardType('w');
				context.leftDelete();

				await timeout(2000);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [
					{ position: '(2,6)', triggerKind: 0, text: 'hello\nhello' },
				]);

				assert.deepStrictEqual(context.getAndClearViewStates(), [
					'',
					'hello[world]\n',
					'hello\n',
					'hello\nhello[world]',
				]);
			});
	});

	test('Additional Text Edits', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('buzz\nbaz');
				provider.setReturnValue({
					insertText: 'bazz',
					range: new Range(2, 1, 2, 4),
					additionalTextEdits: [{
						range: new Range(1, 1, 1, 5),
						text: 'bla'
					}],
				});
				model.triggerExplicitly();
				await timeout(1000);

				model.accept(editor);

				assert.deepStrictEqual(provider.getAndClearCallHistory(), ([{ position: '(2,4)', triggerKind: 1, text: 'buzz\nbaz' }]));

				assert.deepStrictEqual(context.getAndClearViewStates(), [
					'',
					'buzz\nbaz[z]',
					'bla\nbazz',
				]);
			}
		);
	});
});

suite('Multi Cursor Support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Basic', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('console\nconsole\n');
				editor.setSelections([
					new Selection(1, 1000, 1, 1000),
					new Selection(2, 1000, 2, 1000),
				]);
				provider.setReturnValue({
					insertText: 'console.log("hello");',
					range: new Range(1, 1, 1, 1000),
				});
				model.triggerExplicitly();
				await timeout(1000);
				model.accept(editor);
				assert.deepStrictEqual(
					editor.getValue(),
					[
						`console.log("hello");`,
						`console.log("hello");`,
						``
					].join('\n')
				);
			}
		);
	});

	test('Multi Part', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('console.log()\nconsole.log\n');
				editor.setSelections([
					new Selection(1, 12, 1, 12),
					new Selection(2, 1000, 2, 1000),
				]);
				provider.setReturnValue({
					insertText: 'console.log("hello");',
					range: new Range(1, 1, 1, 1000),
				});
				model.triggerExplicitly();
				await timeout(1000);
				model.accept(editor);
				assert.deepStrictEqual(
					editor.getValue(),
					[
						`console.log("hello");`,
						`console.log`,
						``
					].join('\n')
				);
			}
		);
	});

	test('Multi Part and Different Cursor Columns', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('console.log()\nconsole.warn\n');
				editor.setSelections([
					new Selection(1, 12, 1, 12),
					new Selection(2, 14, 2, 14),
				]);
				provider.setReturnValue({
					insertText: 'console.log("hello");',
					range: new Range(1, 1, 1, 1000),
				});
				model.triggerExplicitly();
				await timeout(1000);
				model.accept(editor);
				assert.deepStrictEqual(
					editor.getValue(),
					[
						`console.log("hello");`,
						`console.warn`,
						``
					].join('\n')
				);
			}
		);
	});

	async function acceptNextWord(model: InlineCompletionsModel, editor: ITestCodeEditor, timesToAccept: number = 1): Promise<void> {
		for (let i = 0; i < timesToAccept; i++) {
			model.triggerExplicitly();
			await timeout(1000);
			await model.acceptNextWord();
		}
	}

	test('Basic Partial Completion', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('let\nlet\n');
				editor.setSelections([
					new Selection(1, 1000, 1, 1000),
					new Selection(2, 1000, 2, 1000),
				]);

				provider.setReturnValue({
					insertText: `let a = 'some word'; `,
					range: new Range(1, 1, 1, 1000),
				});

				await acceptNextWord(model, editor, 2);

				assert.deepStrictEqual(
					editor.getValue(),
					[
						`let a`,
						`let a`,
						``
					].join('\n')
				);
			}
		);
	});

	test('Partial Multi-Part Completion', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('for ()\nfor \n');
				editor.setSelections([
					new Selection(1, 5, 1, 5),
					new Selection(2, 1000, 2, 1000),
				]);

				provider.setReturnValue({
					insertText: `for (let i = 0; i < 10; i++) {`,
					range: new Range(1, 1, 1, 1000),
				});

				model.triggerExplicitly();
				await timeout(1000);

				await acceptNextWord(model, editor, 3);

				assert.deepStrictEqual(
					editor.getValue(),
					[
						`for (let i)`,
						`for `,
						``
					].join('\n')
				);
			}
		);
	});

	test('Partial Mutli-Part and Different Cursor Columns Completion', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType(`console.log()\nconsole.warnnnn\n`);
				editor.setSelections([
					new Selection(1, 12, 1, 12),
					new Selection(2, 16, 2, 16),
				]);

				provider.setReturnValue({
					insertText: `console.log("hello" + " " + "world");`,
					range: new Range(1, 1, 1, 1000),
				});

				model.triggerExplicitly();
				await timeout(1000);

				await acceptNextWord(model, editor, 4);

				assert.deepStrictEqual(
					editor.getValue(),
					[
						`console.log("hello" + )`,
						`console.warnnnn`,
						``
					].join('\n')
				);
			}
		);
	});

	test('Change hint is passed from onDidChange to provideInlineCompletions', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('foo');
				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
				model.triggerExplicitly();
				await timeout(1000);

				const firstCallHistory = provider.getAndClearCallHistory();
				assert.strictEqual(firstCallHistory.length, 1);
				assert.strictEqual((firstCallHistory[0] as { changeHint?: unknown }).changeHint, undefined);

				const changeHintData = { reason: 'modelUpdated', version: 42 };
				provider.setReturnValue({ insertText: 'foobaz', range: new Range(1, 1, 1, 4) });
				provider.fireOnDidChange({ data: changeHintData });
				await timeout(1000);

				const secondCallHistory = provider.getAndClearCallHistory();

				assert.deepStrictEqual(
					secondCallHistory,
					[{
						changeHint: {
							data: {
								reason: 'modelUpdated',
								version: 42,
							}
						},
						position: '(1,4)',
						text: 'foo',
						triggerKind: 0
					}]
				);
			}
		);
	});

	test('Change hint is undefined when onDidChange fires without hint', async function () {
		const provider = new MockInlineCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true, triggerCommandOnProviderChange: true } },
			async ({ editor, editorViewModel, model, context }) => {
				context.keyboardType('foo');
				provider.setReturnValue({ insertText: 'foobar', range: new Range(1, 1, 1, 4) });
				model.triggerExplicitly();
				await timeout(1000);

				provider.getAndClearCallHistory();

				provider.setReturnValue({ insertText: 'foobaz', range: new Range(1, 1, 1, 4) });
				provider.fireOnDidChange();
				await timeout(1000);

				const callHistory = provider.getAndClearCallHistory();

				assert.deepStrictEqual(
					callHistory,
					[{
						position: '(1,4)',
						text: 'foo',
						triggerKind: 0
					}]
				);
			}
		);
	});
});

suite('Provider Selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Availability changes do not activate inactive sessions', async function () {
		const availabilityChanged = new Emitter<void>();
		let available = false;
		const provider = Object.assign(new MockInlineCompletionsProvider(), {
			isAvailable: () => available,
			onDidChangeAvailability: availabilityChanged.event,
		});
		provider.setReturnValue({ insertText: 'abc' });

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ context, model, store }) => {
				store.add(availabilityChanged);

				available = true;
				availabilityChanged.fire();
				await timeout(1000);
				const callsBeforeFirstTrigger = provider.getAndClearCallHistory().length;

				context.keyboardType('a');
				await timeout(1000);
				provider.getAndClearCallHistory();
				model.stop();

				available = false;
				availabilityChanged.fire();
				available = true;
				availabilityChanged.fire();
				await timeout(1000);

				assert.deepStrictEqual({
					callsBeforeFirstTrigger,
					callsAfterStop: provider.getAndClearCallHistory().length,
				}, {
					callsBeforeFirstTrigger: 0,
					callsAfterStop: 0,
				});
			}
		);
	});

	test('Availability changes preserve an in-flight explicit request', async function () {
		const availabilityChanged = new Emitter<void>();
		let automaticAvailable = false;
		const provider = Object.assign(new MockInlineCompletionsProvider(), {
			isAvailable: (context: { triggerKind: InlineCompletionTriggerKind }) =>
				context.triggerKind === InlineCompletionTriggerKind.Explicit || automaticAvailable,
			onDidChangeAvailability: availabilityChanged.event,
		});
		provider.setReturnValue({ insertText: 'abc' }, 1000);

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async ({ model, store }) => {
				store.add(availabilityChanged);

				const explicitRequest = model.triggerExplicitly();
				await timeout(0);
				automaticAvailable = true;
				availabilityChanged.fire();
				await timeout(1000);
				await explicitRequest;

				assert.deepStrictEqual(provider.getAndClearCallHistory(), [{
					position: '(1,1)',
					text: '',
					triggerKind: InlineCompletionTriggerKind.Explicit,
				}]);
			}
		);
	});

	test('Content changes from unavailable providers do not replace local suggestions', async function () {
		const localProvider = new MockInlineCompletionsProvider();
		const networkProvider = Object.assign(new MockInlineCompletionsProvider(), {
			isAvailable: (context: { triggerKind: InlineCompletionTriggerKind }) => context.triggerKind === InlineCompletionTriggerKind.Explicit,
		});
		localProvider.setReturnValue({ insertText: 'abc' });
		networkProvider.setReturnValue({ insertText: 'network' });

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider: localProvider, inlineSuggest: { enabled: true, triggerCommandOnProviderChange: true } },
			async ({ context, instantiationService, store }) => {
				const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
				store.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, networkProvider));

				context.keyboardType('a');
				await timeout(1000);
				localProvider.getAndClearCallHistory();
				networkProvider.getAndClearCallHistory();
				const viewBeforeChange = context.currentPrettyViewState;

				networkProvider.fireOnDidChange();
				await timeout(1000);

				assert.deepStrictEqual({
					localProviderCalls: localProvider.getAndClearCallHistory().length,
					networkProviderCalls: networkProvider.getAndClearCallHistory().length,
					viewBeforeChange,
					viewAfterChange: context.currentPrettyViewState,
				}, {
					localProviderCalls: 0,
					networkProviderCalls: 0,
					viewBeforeChange: 'a[bc]',
					viewAfterChange: 'a[bc]',
				});
			}
		);
	});

	test('Provider eligibility is recomputed after debounce', async function () {
		const availabilityChanged = new Emitter<void>();
		let networkAvailable = true;
		const localProvider = Object.assign(new MockInlineCompletionsProvider(), {
			groupId: 'local',
		});
		const networkProvider = Object.assign(new MockInlineCompletionsProvider(), {
			groupId: 'network',
			excludesGroupIds: ['local'],
			debounceDelayMs: 100,
			isAvailable: () => networkAvailable,
			onDidChangeAvailability: availabilityChanged.event,
		});
		localProvider.setReturnValue({ insertText: 'abc' });
		networkProvider.setReturnValue({ insertText: 'network' });

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider: localProvider, inlineSuggest: { enabled: true } },
			async ({ context, instantiationService, store }) => {
				store.add(availabilityChanged);
				const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
				store.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, networkProvider));

				context.keyboardType('a');
				await timeout(0);
				networkAvailable = false;
				availabilityChanged.fire();
				await timeout(1000);

				assert.deepStrictEqual({
					localProviderCalls: localProvider.getAndClearCallHistory().length,
					networkProviderCalls: networkProvider.getAndClearCallHistory().length,
				}, {
					localProviderCalls: 1,
					networkProviderCalls: 0,
				});
			}
		);
	});

	test('Availability changes refresh all newly available providers once', async function () {
		const availabilityChanged = new Emitter<void>();
		let available = false;
		const createProvider = (groupId: string) => Object.assign(new MockInlineCompletionsProvider(), {
			groupId,
			isAvailable: () => available,
			onDidChangeAvailability: availabilityChanged.event,
		});
		const firstProvider = createProvider('first');
		const secondProvider = createProvider('second');
		firstProvider.setReturnValue({ insertText: 'first' });
		secondProvider.setReturnValue({ insertText: 'second' });

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider: firstProvider, inlineSuggest: { enabled: true } },
			async ({ context, instantiationService, store }) => {
				store.add(availabilityChanged);
				const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
				store.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, secondProvider));

				context.keyboardType('a');
				await timeout(1000);
				firstProvider.getAndClearCallHistory();
				secondProvider.getAndClearCallHistory();

				available = true;
				availabilityChanged.fire();
				await timeout(1000);

				assert.deepStrictEqual({
					firstProviderCalls: firstProvider.getAndClearCallHistory().length,
					secondProviderCalls: secondProvider.getAndClearCallHistory().length,
				}, {
					firstProviderCalls: 1,
					secondProviderCalls: 1,
				});
			}
		);
	});

	test('Unavailable providers do not exclude available providers', async function () {
		const localProvider = Object.assign(new MockInlineCompletionsProvider(), {
			groupId: 'local',
		});
		const networkProvider = Object.assign(new MockInlineCompletionsProvider(), {
			groupId: 'network',
			excludesGroupIds: ['local'],
			isAvailable: (context: { triggerKind: InlineCompletionTriggerKind }) => context.triggerKind === InlineCompletionTriggerKind.Explicit,
		});
		localProvider.setReturnValue({ insertText: 'local' });
		networkProvider.setReturnValue({ insertText: 'network' });

		await withAsyncTestCodeEditorAndInlineCompletionsModel('',
			{ fakeClock: true, provider: localProvider, inlineSuggest: { enabled: true } },
			async ({ context, instantiationService, model, store }) => {
				const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
				store.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, networkProvider));

				context.keyboardType('a');
				await timeout(1000);
				const automaticLocalCalls = localProvider.getAndClearCallHistory().length;
				const automaticNetworkCalls = networkProvider.getAndClearCallHistory().length;

				await model.triggerExplicitly();
				const explicitLocalCalls = localProvider.getAndClearCallHistory().length;
				const explicitNetworkCalls = networkProvider.getAndClearCallHistory().length;

				assert.deepStrictEqual({
					automaticLocalCalls,
					automaticNetworkCalls,
					explicitLocalCalls,
					explicitNetworkCalls,
				}, {
					automaticLocalCalls: 1,
					automaticNetworkCalls: 0,
					explicitLocalCalls: 0,
					explicitNetworkCalls: 1,
				});
			}
		);
	});
});
