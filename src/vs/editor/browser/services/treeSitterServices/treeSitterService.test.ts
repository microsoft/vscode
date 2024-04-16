/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ITreeSitterService, TreeSitterService } from 'vs/editor/browser/services/treeSitterServices/treeSitterService';
import { LanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { ModelService } from 'vs/editor/common/services/modelService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { NullLogService } from 'vs/platform/log/common/log';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IModelService } from 'vs/editor/common/services/model';
import { IFileService } from 'vs/platform/files/common/files';
/* eslint-disable */
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { TestTextResourcePropertiesService } from 'vs/workbench/test/common/workbenchTestServices';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
/* eslint-enable*/

suite('Testing the Tree-Sitter Service', () => {

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('editor', { 'detectIndentation': false });
	const dialogService = new TestDialogService();
	const notificationService = new TestNotificationService();
	const logService = new NullLogService();
	const nullLogService = new NullLogService();
	const modelService = new ModelService(
		configService,
		new TestTextResourcePropertiesService(configService),
		new TestThemeService(),
		nullLogService,
		new UndoRedoService(dialogService, notificationService),
		new LanguageService(),
		new TestLanguageConfigurationService(),
		new LanguageFeatureDebounceService(logService),
		new LanguageFeaturesService()
	);

	const diskFileSystemProvider = new DiskFileSystemProvider(logService);
	const fileService = new FileService(nullLogService);
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);

	const treeSitterService = new TreeSitterService(modelService, fileService);

	const servicesCollection = new ServiceCollection(
		[IModelService, modelService],
		[IFileService, fileService],
		[ITreeSitterService, treeSitterService]
	);

	const text = [
		'function foo() {',
		'',
		'}',
		'/* comment related to TestClass',
		' end of the comment */',
		'@classDecorator',
		'class TestClass {',
		'// comment related to the function functionOfClass',
		'functionOfClass(){',
		'function function1(){',
		'}',
		'}}',
		'function bar() { function insideBar() {}',
		'}'
	].join('\n');

	const instantiationService = new InstantiationService(servicesCollection);
	const treeSitterServiceInstance = instantiationService.createInstance(TreeSitterService);

	// TODO: fix - test retrieves wrong web-tree-sitter bindings
	test.skip('Checking that parse tree not recomputed if already computed', async () => {

		const model = createTextModel(text, 'typescript');
		const tree = await treeSitterServiceInstance.getTreeSitterTree(model);
		await Promise.all([tree.parseTreeAndCountCalls(), tree.parseTreeAndCountCalls()]).then((values) => {
			console.log('Values returned are : ', values);
		});
		model.dispose();
	});

	// TODO: fix - test retrieves wrong web-tree-sitter bindings
	test.skip('Checking that parse tree is recomputed when edit is made', async () => {
		const model = createTextModel(text, 'typescript');
		const tree = await treeSitterServiceInstance.getTreeSitterTree(model);
		await tree.parseTreeAndCountCalls().then((value: number) => {
			console.log('value 1 : ', value);
		});
		model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		await tree.parseTreeAndCountCalls().then((value: number) => {
			console.log('value 2 : ', value);
		});
		model.dispose();
	});
});
