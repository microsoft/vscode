/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { DocumentHighlight, DocumentHighlightKind, DocumentHighlightProvider } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IModelService } from '../../../../common/services/model.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { TextualDocumentHighlightProvider } from '../../browser/textualHighlightProvider.js';
import { getOccurrencesAtPosition, WordHighlighterContribution } from '../../browser/wordHighlighter.js';

suite('DocumentHighlightProviders', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const position = new Position(1, 2);
	const first: DocumentHighlight = { range: new Range(1, 1, 1, 5), kind: DocumentHighlightKind.Read };
	const second: DocumentHighlight = { range: new Range(1, 6, 1, 10), kind: DocumentHighlightKind.Write };
	let registry: LanguageFeatureRegistry<DocumentHighlightProvider>;
	let model: ITextModel;

	setup(() => {
		registry = new LanguageFeatureRegistry<DocumentHighlightProvider>();
		model = store.add(createTextModel('word word word\nword'));
	});

	test('keeps the first answer when merging is disabled', async () => {
		const calls: string[] = [];
		store.add(registry.register('*', {
			provideDocumentHighlights: () => { calls.push('lower'); return [second]; }
		}));
		store.add(registry.register('plaintext', {
			provideDocumentHighlights: () => { calls.push('higher'); return [first]; }
		}));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, false);
		assert.deepStrictEqual({ calls, highlights: result?.get(model.uri) }, { calls: ['higher'], highlights: [first] });
	});

	test('an empty answer still stops the default provider search', async () => {
		const calls: string[] = [];
		store.add(registry.register('*', {
			provideDocumentHighlights: () => { calls.push('lower'); return [second]; }
		}));
		store.add(registry.register('plaintext', {
			provideDocumentHighlights: () => { calls.push('higher'); return []; }
		}));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, false);
		assert.deepStrictEqual({ calls, highlights: result?.get(model.uri) }, { calls: ['higher'], highlights: [] });
	});

	test('queries different priorities concurrently and deduplicates ranges in provider order', async () => {
		const calls: string[] = [];
		const higher = new DeferredPromise<DocumentHighlight[]>();
		const lower = new DeferredPromise<DocumentHighlight[]>();
		const text: DocumentHighlight = { range: new Range(1, 11, 1, 15), kind: DocumentHighlightKind.Text };
		const unspecified: DocumentHighlight = { range: new Range(2, 1, 2, 5) };
		const overlapping: DocumentHighlight = { range: new Range(1, 2, 1, 5), kind: DocumentHighlightKind.Write };
		const higherHighlights = [first, first, text, unspecified];
		Object.freeze(higherHighlights);

		store.add(registry.register('*', {
			provideDocumentHighlights: () => { calls.push('lower'); return lower.p; }
		}));
		store.add(registry.register('plaintext', {
			provideDocumentHighlights: () => { calls.push('higher'); return higher.p; }
		}));

		const pending = getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		const callsBeforeCompletion = [...calls];
		await lower.complete([
			{ range: first.range, kind: DocumentHighlightKind.Write },
			second,
			{ range: text.range, kind: DocumentHighlightKind.Read },
			{ range: unspecified.range, kind: DocumentHighlightKind.Write },
			overlapping
		]);
		await higher.complete(higherHighlights);
		const result = await pending;

		assert.deepStrictEqual(
			{ calls: callsBeforeCompletion, highlights: result?.get(model.uri) },
			{ calls: ['higher', 'lower'], highlights: [first, text, unspecified, second, overlapping] }
		);
	});

	for (const { name, value } of [
		{ name: 'undefined', value: undefined },
		{ name: 'null', value: null },
		{ name: 'an empty array', value: [] }
	]) {
		test(`merges other providers when a higher-priority provider returns ${name}`, async () => {
			store.add(registry.register('*', { provideDocumentHighlights: () => [second] }));
			store.add(registry.register('plaintext', { provideDocumentHighlights: () => value }));

			const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
			assert.deepStrictEqual(result?.get(model.uri), [second]);
		});

		test(`does not use textual fallback when a matching provider returns ${name}`, async () => {
			store.add(registry.register('*', new TextualDocumentHighlightProvider()));
			store.add(registry.register('plaintext', { provideDocumentHighlights: () => value }));

			const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
			assert.deepStrictEqual(result?.get(model.uri), value === null ? undefined : value);
		});
	}

	test('reports provider failures without discarding successful results', async () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		store.add(toDisposable(() => setUnexpectedErrorHandler(originalErrorHandler)));
		const errors: Error[] = [];
		setUnexpectedErrorHandler(error => {
			assert.ok(error instanceof Error);
			errors.push(error);
		});
		const synchronousError = new Error('synchronous failure');
		const asynchronousError = new Error('asynchronous failure');
		store.add(registry.register('plaintext', { provideDocumentHighlights: () => [first] }));
		store.add(registry.register('plaintext', { provideDocumentHighlights: () => { throw new CancellationError(); } }));
		store.add(registry.register('plaintext', { provideDocumentHighlights: () => Promise.reject(asynchronousError) }));
		store.add(registry.register('plaintext', { provideDocumentHighlights: () => { throw synchronousError; } }));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		assert.deepStrictEqual(
			{ errors, highlights: result?.get(model.uri) },
			{ errors: [synchronousError, asynchronousError], highlights: [first] }
		);
	});

	test('uses textual fallback only when no other provider matches', async () => {
		let nonMatchingCalls = 0;
		store.add(registry.register('javascript', {
			provideDocumentHighlights: () => { nonMatchingCalls++; return [first]; }
		}));
		store.add(registry.register('*', new TextualDocumentHighlightProvider()));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		assert.deepStrictEqual({ nonMatchingCalls, highlights: result?.get(model.uri) }, {
			nonMatchingCalls: 0,
			highlights: [
				{ range: new Range(1, 1, 1, 5), kind: DocumentHighlightKind.Text },
				{ range: new Range(1, 6, 1, 10), kind: DocumentHighlightKind.Text },
				{ range: new Range(1, 11, 1, 15), kind: DocumentHighlightKind.Text },
				{ range: new Range(2, 1, 2, 5), kind: DocumentHighlightKind.Text }
			]
		});
	});

	test('keeps wildcard extension providers but excludes the built-in textual provider', async () => {
		store.add(registry.register('*', { provideDocumentHighlights: () => [first] }));
		store.add(registry.register('*', new TextualDocumentHighlightProvider()));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		assert.deepStrictEqual(result?.get(model.uri), [first]);
	});

	test('preserves textual fallback after a declined answer when merging is disabled', async () => {
		store.add(registry.register('*', new TextualDocumentHighlightProvider()));
		store.add(registry.register('plaintext', { provideDocumentHighlights: () => undefined }));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, false);
		assert.deepStrictEqual(result?.get(model.uri)?.map(highlight => highlight.range), [
			new Range(1, 1, 1, 5), new Range(1, 6, 1, 10), new Range(1, 11, 1, 15), new Range(2, 1, 2, 5)
		]);
	});

	test('preserves exclusive document selectors', async () => {
		const calls: string[] = [];
		store.add(registry.register('*', {
			provideDocumentHighlights: () => { calls.push('wildcard'); return [second]; }
		}));
		store.add(registry.register({ language: 'plaintext', exclusive: true }, {
			provideDocumentHighlights: () => { calls.push('exclusive'); return [first]; }
		}));

		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		assert.deepStrictEqual({ calls, highlights: result?.get(model.uri) }, { calls: ['exclusive'], highlights: [first] });
	});

	test('returns an empty map without providers', async () => {
		const result = await getOccurrencesAtPosition(registry, model, position, CancellationToken.None, true);
		assert.strictEqual(result?.size, 0);
	});

});

suite('WordHighlighterContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const first: DocumentHighlight = { range: new Range(1, 1, 1, 5), kind: DocumentHighlightKind.Read };
	const second: DocumentHighlight = { range: new Range(1, 6, 1, 10), kind: DocumentHighlightKind.Write };

	function withHighlighter(options: IEditorOptions, run: (editor: ITestCodeEditor, contribution: WordHighlighterContribution, services: TestInstantiationService) => Promise<void>): Promise<void> {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const services = createCodeEditorServices(store, new ServiceCollection(
				[IConfigurationService, new TestConfigurationService({ 'editor.occurrencesHighlightDelay': 0 })]
			));
			const model = store.add(services.get(IModelService).createModel('word word word', null));
			const editor = store.add(instantiateTestCodeEditor(services, model, options));
			const contribution = store.add(editor.registerAndInstantiateContribution(WordHighlighterContribution.ID, WordHighlighterContribution));
			try {
				await run(editor, contribution, services);
			} finally {
				editor.setModel(null);
			}
		});
	}

	test('cancels in-flight merged results when the setting is disabled', async () => {
		await withHighlighter({ occurrencesHighlightFromAllProviders: true }, async (editor, contribution, services) => {
			const providers = services.get(ILanguageFeaturesService).documentHighlightProvider;
			const pending = new DeferredPromise<DocumentHighlight[]>();
			let requestToken: CancellationToken | undefined;
			store.add(providers.register('*', {
				provideDocumentHighlights: (_model, _position, token) => { requestToken = token; return pending.p; }
			}));
			store.add(providers.register('plaintext', { provideDocumentHighlights: () => [first] }));

			contribution.wordHighlighter?.trigger();
			await timeout(0);
			editor.updateOptions({ occurrencesHighlightFromAllProviders: false });
			await timeout(0);
			await pending.complete([second]);
			await timeout(0);
			contribution.moveNext();

			assert.deepStrictEqual(
				{ cancelled: requestToken?.isCancellationRequested, column: editor.getPosition().column },
				{ cancelled: true, column: 1 }
			);
		});
	});

	test('does not start highlighting when occurrences are disabled', async () => {
		await withHighlighter({ occurrencesHighlight: 'off' }, async (editor, contribution, services) => {
			let calls = 0;
			store.add(services.get(ILanguageFeaturesService).documentHighlightProvider.register('*', {
				provideDocumentHighlights: () => { calls++; return [first]; }
			}));

			editor.updateOptions({ occurrencesHighlightFromAllProviders: true });
			await timeout(0);
			assert.deepStrictEqual({ calls, hasHighlights: contribution.saveViewState() }, { calls: 0, hasHighlights: false });
		});
	});

	test('discards merged results from a replaced model', async () => {
		await withHighlighter({ occurrencesHighlightFromAllProviders: true }, async (editor, contribution, services) => {
			const initialModel = editor.getModel();
			const pending = new DeferredPromise<DocumentHighlight[]>();
			let initialToken: CancellationToken | undefined;
			const providers = services.get(ILanguageFeaturesService).documentHighlightProvider;
			store.add(providers.register('*', {
				provideDocumentHighlights: (model, _position, token) => {
					if (model === initialModel) {
						initialToken = token;
						return pending.p;
					}
					return [second];
				}
			}));
			store.add(providers.register('plaintext', { provideDocumentHighlights: () => [first] }));

			contribution.wordHighlighter?.trigger();
			await timeout(0);
			const replacement = store.add(services.get(IModelService).createModel('word word word', null));
			editor.setModel(replacement);
			await timeout(0);
			await pending.complete([{ range: new Range(1, 11, 1, 15), kind: DocumentHighlightKind.Text }]);
			await timeout(0);
			contribution.moveNext();

			assert.deepStrictEqual(
				{ cancelled: initialToken?.isCancellationRequested, column: editor.getPosition().column },
				{ cancelled: true, column: 6 }
			);
		});
	});
});
