/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { AbstractResourceEditorInput } from '../../../../common/editor/resourceEditorInput.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { EditorInputCapabilities, Verbosity } from '../../../../common/editor.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomEditorLabelService, ICustomEditorLabelService } from '../../../../services/editor/common/customEditorLabelService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

suite('ResourceEditorInput', () => {

	const disposables = new DisposableStore();

	class TestResourceEditorInput extends AbstractResourceEditorInput {

		readonly typeId = 'test.typeId';

		constructor(
			resource: URI,
			@ILabelService labelService: ILabelService,
			@IFileService fileService: IFileService,
			@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
			@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
			@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService
		) {
			super(resource, resource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
		}
	}

	async function createServices(): Promise<[IInstantiationService, TestConfigurationService, CustomEditorLabelService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);

		const customEditorLabelService = disposables.add(new CustomEditorLabelService(testConfigurationService, instantiationService.get(IWorkspaceContextService)));
		instantiationService.stub(ICustomEditorLabelService, customEditorLabelService);

		return [instantiationService, testConfigurationService, customEditorLabelService];
	}

	teardown(() => {
		disposables.clear();
	});

	test('basics', async () => {
		const [instantiationService] = await createServices();

		const resource = URI.from({ scheme: 'testResource', path: 'thePath/of/the/resource.txt' });

		const input = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource));

		assert.ok(input.getName().length > 0);

		assert.ok(input.getDescription(Verbosity.SHORT)!.length > 0);
		assert.ok(input.getDescription(Verbosity.MEDIUM)!.length > 0);
		assert.ok(input.getDescription(Verbosity.LONG)!.length > 0);

		assert.ok(input.getTitle(Verbosity.SHORT).length > 0);
		assert.ok(input.getTitle(Verbosity.MEDIUM).length > 0);
		assert.ok(input.getTitle(Verbosity.LONG).length > 0);

		assert.strictEqual(input.hasCapability(EditorInputCapabilities.Readonly), false);
		assert.strictEqual(input.isReadonly(), false);
		assert.strictEqual(input.hasCapability(EditorInputCapabilities.Untitled), true);
	});

	test('custom editor name', async () => {
		const [instantiationService, testConfigurationService, customEditorLabelService] = await createServices();

		const resource1 = URI.from({ scheme: 'testResource', path: 'thePath/of/the/resource.txt' });
		const resource2 = URI.from({ scheme: 'testResource', path: 'theOtherPath/of/the/resource.md' });

		const input1 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource1));
		const input2 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource2));

		await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, {
			'**/theOtherPath/**': 'Label 1',
			'**/*.txt': 'Label 2',
			'**/resource.txt': 'Label 3',
		});
		testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration: string) { return configuration === CustomEditorLabelService.SETTING_ID_PATTERNS; }, source: ConfigurationTarget.USER } as any);

		let label1Name: string = '';
		let label2Name = '';
		disposables.add(customEditorLabelService.onDidChange(() => {
			label1Name = input1.getName();
			label2Name = input2.getName();
		}));

		await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
		testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration: string) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: ConfigurationTarget.USER } as any);

		assert.ok(label1Name === 'Label 3');
		assert.ok(label2Name === 'Label 1');

		await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, false);
		testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration: string) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: ConfigurationTarget.USER } as any);

		assert.ok(label1Name === 'resource.txt' as string);
		assert.ok(label2Name === 'resource.md' as string);

		await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
		testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration: string) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: ConfigurationTarget.USER } as any);

		await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, {
			'thePath/**/resource.txt': 'Label 4',
			'thePath/of/*/resource.txt': 'Label 5',
		});
		testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration: string) { return configuration === CustomEditorLabelService.SETTING_ID_PATTERNS; }, source: ConfigurationTarget.USER } as any);

		assert.ok(label1Name === 'Label 5' as string);
		assert.ok(label2Name === 'resource.md' as string);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
