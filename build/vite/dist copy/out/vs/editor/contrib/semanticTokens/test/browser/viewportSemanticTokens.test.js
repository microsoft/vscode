/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { ISemanticTokensStylingService } from '../../../../common/services/semanticTokensStyling.js';
import { SemanticTokensStylingService } from '../../../../common/services/semanticTokensStylingService.js';
import { ViewportSemanticTokensContribution } from '../../browser/viewportSemanticTokens.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
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
    let languageService;
    let languageFeaturesService;
    let serviceCollection;
    setup(() => {
        const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
        const themeService = new TestThemeService();
        themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
        languageFeaturesService = new LanguageFeaturesService();
        languageService = disposables.add(new LanguageService(false));
        const logService = new NullLogService();
        const semanticTokensStylingService = new SemanticTokensStylingService(themeService, logService, languageService);
        const envService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.isBuilt = true;
                this.isExtensionDevelopment = false;
            }
        };
        const languageFeatureDebounceService = new LanguageFeatureDebounceService(logService, envService);
        serviceCollection = new ServiceCollection([ILanguageFeaturesService, languageFeaturesService], [ILanguageFeatureDebounceService, languageFeatureDebounceService], [ISemanticTokensStylingService, semanticTokensStylingService], [IThemeService, themeService], [IConfigurationService, configService]);
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
            const emitter = new Emitter();
            let requestCount = 0;
            disposables.add(languageFeaturesService.documentRangeSemanticTokensProvider.register('testMode', new class {
                constructor() {
                    this.onDidChange = emitter.event;
                }
                getLegend() {
                    return { tokenTypes: ['class'], tokenModifiers: [] };
                }
                async provideDocumentRangeSemanticTokens(model, range, token) {
                    requestCount++;
                    if (requestCount === 1) {
                        inFirstCall.open();
                    }
                    else if (requestCount === 2) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3BvcnRTZW1hbnRpY1Rva2Vucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc2VtYW50aWNUb2tlbnMvdGVzdC9icm93c2VyL3ZpZXdwb3J0U2VtYW50aWNUb2tlbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUtuRyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6SSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDM0csT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RB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