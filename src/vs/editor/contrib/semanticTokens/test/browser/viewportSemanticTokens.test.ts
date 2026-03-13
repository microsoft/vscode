/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentRangeSemanticTokensProvider, SemanticTokens, SemanticTokensLegend } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { ISemanticTokensStylingService } from '../../../../common/services/semanticTokensStyling.js';
import { SemanticTokensStylingService } from '../../../../common/services/semanticTokensStylingService.js';
import { ViewportSemanticTokensContribution } from '../../browser/viewportSemanticTokens.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('ViewportSemanticTokens', () => {

	const disposables = new DisposableStore();
	let languageService: ILanguageService;
	let languageFeaturesService: ILanguageFeaturesService;
	let serviceCollection: ServiceCollection;

	setup(() => {
		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		const themeService = new TestThemeService();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		languageFeaturesService = new LanguageFeaturesService();
		languageService = disposables.add(new LanguageService(false));

		const logService = new NullLogService();
		const semanticTokensStylingService = new SemanticTokensStylingService(themeService, logService, languageService);
		const envService = new class extends mock<IEnvironmentService>() {
			override isBuilt: boolean = true;
			override isExtensionDevelopment: boolean = false;
		};
		const languageFeatureDebounceService = new LanguageFeatureDebounceService(logService, envService);

		serviceCollection = new ServiceCollection(
			[ILanguageFeaturesService, languageFeaturesService],
			[ILanguageFeatureDebounceService, languageFeatureDebounceService],
			[ISemanticTokensStylingService, semanticTokensStylingService],
			[IThemeService, themeService],
			[IConfigurationService, configService]
		);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('DocumentRangeSemanticTokens provider onDidChange event should trigger refresh', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const inFirstCall = new Barrier();
			const inRefreshCall = new Barrier();

			const emitter = new Emitter<void>();
			let requestCount = 0;
			disposables.add(languageFeaturesService.documentRangeSemanticTokensProvider.register('testMode', new class implements DocumentRangeSemanticTokensProvider {
				onDidChange = emitter.event;
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentRangeSemanticTokens(model: ITextModel, range: Range, token: CancellationToken): Promise<SemanticTokens | null> {
					requestCount++;
					if (requestCount === 1) {
						inFirstCall.open();
					} else if (requestCount === 2) {
						inRefreshCall.open();
					}
					return {
						data: new Uint32Array([0, 1, 1, 1, 1])
					};
				}
			}));

			const textModel = disposables.add(createTextModel('Hello world', 'testMode'));
			const editor = disposables.add(createTestCodeEditor(textModel, { serviceCollection }));
			const instantiationService = new TestInstantiationService(serviceCollection);
			disposables.add(instantiationService.createInstance(ViewportSemanticTokensContribution, editor));

			textModel.onBeforeAttached();

			await inFirstCall.wait();

			assert.strictEqual(requestCount, 1, 'Initial request should have been made');

			// Make sure no other requests are made for a little while
			await timeout(1000);
			assert.strictEqual(requestCount, 1, 'No additional requests should have been made');

			// Fire the provider's onDidChange event
			emitter.fire();

			await inRefreshCall.wait();

			assert.strictEqual(requestCount, 2, 'Provider onDidChange should trigger a refresh of viewport semantic tokens');
		});
	});
});
