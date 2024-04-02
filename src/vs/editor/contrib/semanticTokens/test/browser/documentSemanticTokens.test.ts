/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Barrier, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { LanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { SemanticTokensStylingService } from 'vs/editor/common/services/semanticTokensStylingService';
import { DocumentSemanticTokensFeature } from 'vs/editor/contrib/semanticTokens/browser/documentSemanticTokens';
import { getDocumentSemanticTokens, isSemanticTokens } from 'vs/editor/contrib/semanticTokens/common/getSemanticTokens';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { TestTextResourcePropertiesService } from 'vs/editor/test/common/services/testTextResourcePropertiesService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { NullLogService } from 'vs/platform/log/common/log';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { TestColorTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';

suite('ModelSemanticColoring', () => {

	const disposables = new DisposableStore();
	let modelService: IModelService;
	let languageService: ILanguageService;
	let languageFeaturesService: ILanguageFeaturesService;

	setup(() => {
		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		const themeService = new TestThemeService();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		const logService = new NullLogService();
		languageFeaturesService = new LanguageFeaturesService();
		languageService = disposables.add(new LanguageService(false));
		const semanticTokensStylingService = disposables.add(new SemanticTokensStylingService(themeService, logService, languageService));
		modelService = disposables.add(new ModelService(
			configService,
			new TestTextResourcePropertiesService(configService),
			new UndoRedoService(new TestDialogService(), new TestNotificationService()),
			languageService,
			new TestLanguageConfigurationService(),
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
