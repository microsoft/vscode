/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentRangeSemanticTokensProvider, SemanticTokens, SemanticTokensLegend } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { IModelService } from '../../../../common/services/model.js';
import { ModelService } from '../../../../common/services/modelService.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { TestTextResourcePropertiesService } from '../../../../test/common/services/testTextResourcePropertiesService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';

suite('DocumentRangeSemanticTokensProvider - onDidChangeSemanticTokens', () => {

	const disposables = new DisposableStore();
	let modelService: IModelService;
	let languageService: ILanguageService;
	let languageFeaturesService: ILanguageFeaturesService;

	setup(() => {
		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		const resourcePropertiesService = new TestTextResourcePropertiesService(configService);
		const themeService = new TestThemeService(new TestColorTheme({}, ColorScheme.DARK, true));
		const logService = new NullLogService();

		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IEnvironmentService, <IEnvironmentService>{});
		languageService = instantiationService.createInstance(LanguageService);
		languageFeaturesService = instantiationService.createInstance(LanguageFeaturesService);

		const languageConfigurationService = new TestLanguageConfigurationService();
		modelService = disposables.add(new ModelService(configService, resourcePropertiesService, themeService, logService, new UndoRedoService(new TestDialogService(), new TestNotificationService()), languageService, languageConfigurationService, instantiationService));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('DocumentRangeSemanticTokensProvider can have onDidChangeSemanticTokens event', () => {
		disposables.add(languageService.registerLanguage({ id: 'testMode' }));

		const emitter = new Emitter<void>();
		let changeEventFired = false;

		const provider: DocumentRangeSemanticTokensProvider = {
			onDidChange: emitter.event,
			getLegend(): SemanticTokensLegend {
				return { tokenTypes: ['class'], tokenModifiers: [] };
			},
			provideDocumentRangeSemanticTokens(): SemanticTokens | null {
				return {
					data: new Uint32Array([0, 0, 1, 0, 0])
				};
			}
		};

		// Register the provider
		const registration = disposables.add(languageFeaturesService.documentRangeSemanticTokensProvider.register('testMode', provider));

		// Subscribe to the change event
		const subscription = disposables.add(provider.onDidChange!(() => {
			changeEventFired = true;
		}));

		// Fire the event
		emitter.fire();

		// Verify the event was received
		assert.strictEqual(changeEventFired, true, 'onDidChangeSemanticTokens event should have fired');
	});

	test('DocumentRangeSemanticTokensProvider works without onDidChangeSemanticTokens event', () => {
		disposables.add(languageService.registerLanguage({ id: 'testMode' }));

		const provider: DocumentRangeSemanticTokensProvider = {
			// onDidChange is optional
			getLegend(): SemanticTokensLegend {
				return { tokenTypes: ['class'], tokenModifiers: [] };
			},
			provideDocumentRangeSemanticTokens(): SemanticTokens | null {
				return {
					data: new Uint32Array([0, 0, 1, 0, 0])
				};
			}
		};

		// Register the provider without event
		const registration = disposables.add(languageFeaturesService.documentRangeSemanticTokensProvider.register('testMode', provider));

		// This should work fine without throwing an error
		assert.ok(registration, 'Provider registration should succeed even without onDidChange event');
	});
});