/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { LanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { IModelService } from '../../../../common/services/model.js';
import { ModelService } from '../../../../common/services/modelService.js';
import { SemanticTokensStylingService } from '../../../../common/services/semanticTokensStylingService.js';
import { DocumentSemanticTokensFeature } from '../../browser/documentSemanticTokens.js';
import { getDocumentSemanticTokens, isSemanticTokens } from '../../common/getSemanticTokens.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { TestTextResourcePropertiesService } from '../../../../test/common/services/testTextResourcePropertiesService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IColorTheme, ITokenStyle } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';
import { ITreeSitterLibraryService } from '../../../../common/services/treeSitter/treeSitterLibraryService.js';
import { TestTreeSitterLibraryService } from '../../../../test/common/services/testTreeSitterLibraryService.js';

class TestThemeChangeEmitter extends Emitter<IColorTheme> {
	get listenerCount(): number {
		return this._size;
	}
}

suite('ModelSemanticColoring', () => {

	const disposables = new DisposableStore();
	let modelService: IModelService;
	let languageService: ILanguageService;
	let languageFeaturesService: ILanguageFeaturesService;
	let themeService: TestThemeService;
	let themeChangeEmitter: TestThemeChangeEmitter;

	setup(() => {
		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		themeService = new TestThemeService();
		themeChangeEmitter = disposables.add(new TestThemeChangeEmitter());
		themeService._onThemeChange = themeChangeEmitter;
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		const logService = new NullLogService();
		languageFeaturesService = new LanguageFeaturesService();
		languageService = disposables.add(new LanguageService(false));
		const semanticTokensStylingService = disposables.add(new SemanticTokensStylingService(themeService, logService, languageService));
		const instantiationService = new TestInstantiationService();
		instantiationService.set(ILanguageService, languageService);
		instantiationService.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
		instantiationService.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
		modelService = disposables.add(new ModelService(
			configService,
			new TestTextResourcePropertiesService(configService),
			new UndoRedoService(new TestDialogService(), new TestNotificationService()),
			instantiationService
		));
		const envService = new class extends mock<IEnvironmentService>() {
			override isBuilt: boolean = true;
			override isExtensionDevelopment: boolean = false;
		};
		disposables.add(new DocumentSemanticTokensFeature(semanticTokensStylingService, modelService, themeService, configService, new LanguageFeatureDebounceService(logService, envService), languageFeaturesService));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('theme listeners do not grow with semantic coloring models', () => {
		const listenerCount = () => themeChangeEmitter.listenerCount;
		const initialCount = listenerCount();
		const models = Array.from({ length: 20 }, () => disposables.add(modelService.createModel('Hello world', null)));
		const afterAddingModels = listenerCount();

		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, false));
		const afterDisabling = listenerCount();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		const afterEnabling = listenerCount();

		for (const model of models) {
			model.dispose();
		}

		assert.deepStrictEqual({
			afterAddingModels,
			afterDisabling,
			afterEnabling,
			afterRemovingModels: listenerCount()
		}, {
			afterAddingModels: initialCount,
			afterDisabling: initialCount,
			afterEnabling: initialCount,
			afterRemovingModels: initialCount
		});
	});

	test('theme changes clear semantic tokens and refetch with the new styling', async () => {
		await runWithFakedTimers({}, async () => {
			const createTheme = (foreground: number) => new class extends TestColorTheme {
				override getTokenStyleMetadata(): ITokenStyle {
					return { foreground, bold: undefined, underline: undefined, strikethrough: undefined, italic: undefined };
				}
			}({}, ColorScheme.DARK, true);
			themeService.setTheme(createTheme(1));
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const lastResultIds: (string | null)[] = [];
			const releasedResultIds: (string | undefined)[] = [];
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', {
				getLegend: () => ({ tokenTypes: ['class'], tokenModifiers: [] }),
				provideDocumentSemanticTokens: (model, lastResultId) => {
					lastResultIds.push(lastResultId);
					return { resultId: String(lastResultIds.length), data: new Uint32Array([0, 0, 5, 0, 0]) };
				},
				releaseDocumentSemanticTokens: resultId => releasedResultIds.push(resultId)
			}));
			const model = disposables.add(modelService.createModel('Hello world', languageService.createById('testMode')));
			model.onBeforeAttached();
			await timeout(1000);
			const initialForeground = model.tokenization.getLineTokens(1).getForeground(0);

			themeService.setTheme(createTheme(2));
			const clearedImmediately = !model.tokenization.hasCompleteSemanticTokens();
			await timeout(1000);

			assert.deepStrictEqual({
				initialForeground,
				clearedImmediately,
				updatedForeground: model.tokenization.getLineTokens(1).getForeground(0),
				lastResultIds,
				releasedResultIds
			}, {
				initialForeground: 1,
				clearedImmediately: true,
				updatedForeground: 2,
				lastResultIds: [null, null],
				releasedResultIds: ['1']
			});
		});
	});

	test('theme changes do not register models disposed by token listeners', () => {
		const firstModel = disposables.add(modelService.createModel('First model', null));
		const secondModel = disposables.add(modelService.createModel('Second model', null));
		const registration = spy(secondModel, 'onDidChangeContent');
		disposables.add({ dispose: () => registration.restore() });
		disposables.add(firstModel.onDidChangeTokens(() => secondModel.dispose()));

		themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT, true));

		assert.strictEqual(registration.callCount, 0);
	});

	test('theme changes continue refreshing models after a provider release error', async () => {
		await runWithFakedTimers({}, async () => {
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));
			const requests: string[] = [];
			const reportedErrors: Error[] = [];
			const releaseError = new Error('Failed to release semantic tokens');
			let throwForResultId: string | undefined;
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', {
				getLegend: () => ({ tokenTypes: ['class'], tokenModifiers: [] }),
				provideDocumentSemanticTokens: model => {
					requests.push(model.id);
					return { resultId: model.id, data: new Uint32Array([0, 0, 5, 0, 0]) };
				},
				releaseDocumentSemanticTokens: resultId => {
					if (resultId === throwForResultId) {
						throwForResultId = undefined;
						throw releaseError;
					}
				}
			}));
			const firstModel = disposables.add(modelService.createModel('First model', languageService.createById('testMode')));
			const secondModel = disposables.add(modelService.createModel('Second model', languageService.createById('testMode')));
			firstModel.onBeforeAttached();
			secondModel.onBeforeAttached();
			await timeout(1000);

			const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler((error: Error) => reportedErrors.push(error));
			try {
				throwForResultId = firstModel.id;
				themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT, true));
				await timeout(1000);

				assert.deepStrictEqual({ requests, reportedErrors }, {
					requests: [firstModel.id, secondModel.id, secondModel.id],
					reportedErrors: [releaseError]
				});
			} finally {
				setUnexpectedErrorHandler(originalErrorHandler);
			}
		});
	});

	test('enabling semantic coloring through a theme immediately fetches only attached models', async () => {
		await runWithFakedTimers({}, async () => {
			themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, false));
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const requestedModels: ITextModel[] = [];
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', {
				getLegend: () => ({ tokenTypes: ['class'], tokenModifiers: [] }),
				provideDocumentSemanticTokens: model => {
					requestedModels.push(model);
					return { data: new Uint32Array([0, 0, 5, 0, 0]) };
				},
				releaseDocumentSemanticTokens: () => { }
			}));
			const visibleModel = disposables.add(modelService.createModel('Hello world', languageService.createById('testMode')));
			disposables.add(modelService.createModel('Hidden model', languageService.createById('testMode')));
			visibleModel.onBeforeAttached();

			themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
			await timeout(1);
			const immediatelyRequested = requestedModels.length;
			await timeout(1000);

			assert.deepStrictEqual({
				immediatelyRequested,
				requestedModelIds: requestedModels.map(model => model.id)
			}, {
				immediatelyRequested: 1,
				requestedModelIds: [visibleModel.id]
			});
		});
	});

	test('DocumentSemanticTokens should be fetched when the result is empty if there are pending changes', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const inFirstCall = new Barrier();
			const delayFirstResult = new Barrier();
			const secondResultProvided = new Barrier();
			let callCount = 0;

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					callCount++;
					if (callCount === 1) {
						assert.ok('called once');
						inFirstCall.open();
						await delayFirstResult.wait();
						await timeout(0); // wait for the simple scheduler to fire to check that we do actually get rescheduled
						return null;
					}
					if (callCount === 2) {
						assert.ok('called twice');
						secondResultProvided.open();
						return null;
					}
					assert.fail('Unexpected call');
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			const textModel = disposables.add(modelService.createModel('Hello world', languageService.createById('testMode')));
			// pretend the text model is attached to an editor (so that semantic tokens are computed)
			textModel.onBeforeAttached();

			// wait for the provider to be called
			await inFirstCall.wait();

			// the provider is now in the provide call
			// change the text buffer while the provider is running
			textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'x' }]);

			// let the provider finish its first result
			delayFirstResult.open();

			// we need to check that the provider is called again, even if it returns null
			await secondResultProvided.wait();

			// assert that it got called twice
			assert.strictEqual(callCount, 2);
		});
	});

	test('issue #149412: VS Code hangs when bad semantic token data is received', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			let lastResult: SemanticTokens | SemanticTokensEdits | null = null;

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					if (!lastResultId) {
						// this is the first call
						lastResult = {
							resultId: '1',
							data: new Uint32Array([4294967293, 0, 7, 16, 0, 1, 4, 3, 11, 1])
						};
					} else {
						// this is the second call
						lastResult = {
							resultId: '2',
							edits: [{
								start: 4294967276,
								deleteCount: 0,
								data: new Uint32Array([2, 0, 3, 11, 0])
							}]
						};
					}
					return lastResult;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			const textModel = disposables.add(modelService.createModel('', languageService.createById('testMode')));
			// pretend the text model is attached to an editor (so that semantic tokens are computed)
			textModel.onBeforeAttached();

			// wait for the semantic tokens to be fetched
			await Event.toPromise(textModel.onDidChangeTokens);
			assert.strictEqual(lastResult!.resultId, '1');

			// edit the text
			textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'foo' }]);

			// wait for the semantic tokens to be fetched again
			await Event.toPromise(textModel.onDidChangeTokens);
			assert.strictEqual(lastResult!.resultId, '2');
		});
	});

	test('issue #322571: semantic token edits cannot delete more data than the previous result contains', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const lastResultIds: (string | null)[] = [];
			const releasedResultIds: (string | undefined)[] = [];
			const recoveredResultProvided = new Barrier();

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					lastResultIds.push(lastResultId);
					if (lastResultIds.length === 1) {
						return {
							resultId: 'full',
							data: new Uint32Array([0, 0, 1, 0, 0])
						};
					}
					if (lastResultIds.length === 2) {
						return {
							resultId: 'invalid-edit',
							edits: [{ start: 0, deleteCount: 6 }]
						};
					}
					if (lastResultIds.length === 3) {
						recoveredResultProvided.open();
						return {
							resultId: 'recovered-full',
							data: new Uint32Array([0, 0, 1, 0, 0])
						};
					}
					assert.fail('Unexpected call');
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
					releasedResultIds.push(resultId);
				}
			}));

			const textModel = disposables.add(modelService.createModel('a', languageService.createById('testMode')));
			textModel.onBeforeAttached();

			await Event.toPromise(textModel.onDidChangeTokens);
			textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'b' }]);
			await recoveredResultProvided.wait();

			assert.deepStrictEqual({
				lastResultIds,
				releasedResultIds
			}, {
				lastResultIds: [null, 'full', null],
				releasedResultIds: ['full', 'invalid-edit']
			});
		});
	});

	test('invalid semantic token edits without a previous result are not retried', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			let requestCount = 0;
			const releasedResultIds: (string | undefined)[] = [];
			const resultProvided = new Barrier();

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokensEdits> {
					requestCount++;
					resultProvided.open();
					return {
						resultId: 'invalid-edit',
						edits: [{ start: 0, deleteCount: 1 }]
					};
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
					releasedResultIds.push(resultId);
				}
			}));

			const textModel = disposables.add(modelService.createModel('a', languageService.createById('testMode')));
			textModel.onBeforeAttached();

			await resultProvided.wait();
			await timeout(1000);

			assert.deepStrictEqual({
				requestCount,
				releasedResultIds
			}, {
				requestCount: 1,
				releasedResultIds: ['invalid-edit']
			});
		});
	});

	test('issue #161573: onDidChangeSemanticTokens doesn\'t consistently trigger provideDocumentSemanticTokens', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const emitter = new Emitter<void>();
			let requestCount = 0;
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				onDidChange = emitter.event;
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					requestCount++;
					if (requestCount === 1) {
						await timeout(1000);
						// send a change event
						emitter.fire();
						await timeout(1000);
						return null;
					}
					return null;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			const textModel = disposables.add(modelService.createModel('', languageService.createById('testMode')));
			// pretend the text model is attached to an editor (so that semantic tokens are computed)
			textModel.onBeforeAttached();

			await timeout(5000);
			assert.deepStrictEqual(requestCount, 2);
		});
	});

	test('DocumentSemanticTokens should be pick the token provider with actual items', async () => {
		await runWithFakedTimers({}, async () => {

			let callCount = 0;
			disposables.add(languageService.registerLanguage({ id: 'testMode2' }));
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode2', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class1'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					callCount++;
					// For a secondary request return a different value
					if (lastResultId) {
						return {
							data: new Uint32Array([2, 1, 1, 1, 1, 0, 2, 1, 1, 1])
						};
					}
					return {
						resultId: '1',
						data: new Uint32Array([0, 1, 1, 1, 1, 0, 2, 1, 1, 1])
					};
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode2', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class2'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					callCount++;
					return null;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			function toArr(arr: Uint32Array): number[] {
				const result: number[] = [];
				for (let i = 0; i < arr.length; i++) {
					result[i] = arr[i];
				}
				return result;
			}

			const textModel = modelService.createModel('Hello world 2', languageService.createById('testMode2'));
			try {
				let result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, null, null, CancellationToken.None);
				assert.ok(result, `We should have tokens (1)`);
				assert.ok(result.tokens, `Tokens are found from multiple providers (1)`);
				assert.ok(isSemanticTokens(result.tokens), `Tokens are full (1)`);
				assert.ok(result.tokens.resultId, `Token result id found from multiple providers (1)`);
				assert.deepStrictEqual(toArr(result.tokens.data), [0, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (1)`);
				assert.deepStrictEqual(callCount, 2, `Called both token providers (1)`);
				assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ['class1'], tokenModifiers: [] }, `Legend matches the tokens (1)`);

				// Make a second request. Make sure we get the secondary value
				result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, result.provider, result.tokens.resultId, CancellationToken.None);
				assert.ok(result, `We should have tokens (2)`);
				assert.ok(result.tokens, `Tokens are found from multiple providers (2)`);
				assert.ok(isSemanticTokens(result.tokens), `Tokens are full (2)`);
				assert.ok(!result.tokens.resultId, `Token result id found from multiple providers (2)`);
				assert.deepStrictEqual(toArr(result.tokens.data), [2, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (2)`);
				assert.deepStrictEqual(callCount, 4, `Called both token providers (2)`);
				assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ['class1'], tokenModifiers: [] }, `Legend matches the tokens (2)`);
			} finally {
				disposables.clear();

				// Wait for scheduler to finish
				await timeout(0);

				// Now dispose the text model
				textModel.dispose();
			}
		});
	});
});
