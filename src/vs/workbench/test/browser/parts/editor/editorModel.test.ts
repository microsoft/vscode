/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { BaseTextEditorModel } from '../../../../common/editor/textEditorModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { ITextBufferFactory } from '../../../../../editor/common/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { createTextBufferFactory } from '../../../../../editor/common/model/textModel.js';
import { ITextResourcePropertiesService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestStorageService, TestTextResourcePropertiesService } from '../../../common/workbenchTestServices.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { LanguageDetectionService } from '../../../../services/languageDetection/browser/languageDetectionWorkerServiceImpl.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestEditorService, TestEnvironmentService } from '../../workbenchTestServices.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestTreeSitterLibraryService } from '../../../../../editor/test/common/services/testTreeSitterLibraryService.js';

suite('EditorModel', () => {

	class MyEditorModel extends EditorModel { }
	class MyTextEditorModel extends BaseTextEditorModel {
		testCreateTextEditorModel(value: ITextBufferFactory, resource?: URI, preferredLanguageId?: string) {
			return super.createTextEditorModel(value, resource, preferredLanguageId);
		}

		override isReadonly(): boolean {
			return false;
		}
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		const dialogService = new TestDialogService();
		const notificationService = new TestNotificationService();
		const undoRedoService = new UndoRedoService(dialogService, notificationService);
		instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(instantiationService.get(IConfigurationService)));
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(IUndoRedoService, undoRedoService);
		instantiationService.stub(IEditorService, disposables.add(new TestEditorService()));
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
		instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
		instantiationService.stub(ITreeSitterLibraryService, new TestTreeSitterLibraryService());

		return disposables.add(instantiationService.createInstance(ModelService));
	}

	let instantiationService: TestInstantiationService;
	let languageService: ILanguageService;

	const disposables = new DisposableStore();

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		languageService = instantiationService.stub(ILanguageService, LanguageService);
	});

	teardown(() => {
		disposables.clear();
	});

	test('basics', async () => {
		let counter = 0;

		const model = disposables.add(new MyEditorModel());

		disposables.add(model.onWillDispose(() => {
			assert(true);
			counter++;
		}));

		await model.resolve();
		assert.strictEqual(model.isDisposed(), false);
		assert.strictEqual(model.isResolved(), true);
		model.dispose();
		assert.strictEqual(counter, 1);
		assert.strictEqual(model.isDisposed(), true);
	});

	test('BaseTextEditorModel', async () => {
		const modelService = stubModelService(instantiationService);

		const model = disposables.add(new MyTextEditorModel(modelService, languageService, disposables.add(instantiationService.createInstance(LanguageDetectionService)), instantiationService.createInstance(TestAccessibilityService)));
		await model.resolve();

		disposables.add(model.testCreateTextEditorModel(createTextBufferFactory('foo'), null!, Mimes.text));
		assert.strictEqual(model.isResolved(), true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
