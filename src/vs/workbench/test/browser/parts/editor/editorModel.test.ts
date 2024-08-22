/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { BaseTextEditorModel } from '../../../../common/editor/textEditorModel';
import { IModelService } from '../../../../../editor/common/services/model';
import { ILanguageService } from '../../../../../editor/common/languages/language';
import { LanguageService } from '../../../../../editor/common/services/languageService';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService';
import { ModelService } from '../../../../../editor/common/services/modelService';
import { ITextBufferFactory } from '../../../../../editor/common/model';
import { URI } from '../../../../../base/common/uri';
import { createTextBufferFactory } from '../../../../../editor/common/model/textModel';
import { ITextResourcePropertiesService } from '../../../../../editor/common/services/textResourceConfiguration';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService';
import { INotificationService } from '../../../../../platform/notification/common/notification';
import { TestStorageService, TestTextResourcePropertiesService } from '../../../common/workbenchTestServices';
import { IThemeService } from '../../../../../platform/theme/common/themeService';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService';
import { EditorModel } from '../../../../common/editor/editorModel';
import { Mimes } from '../../../../../base/common/mime';
import { LanguageDetectionService } from '../../../../services/languageDetection/browser/languageDetectionWorkerServiceImpl';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService';
import { TestEditorService, TestEnvironmentService } from '../../workbenchTestServices';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService';
import { IEditorService } from '../../../../services/editor/common/editorService';
import { IStorageService } from '../../../../../platform/storage/common/storage';
import { DisposableStore } from '../../../../../base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';

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
