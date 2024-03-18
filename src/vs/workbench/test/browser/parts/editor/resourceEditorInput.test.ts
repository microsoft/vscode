/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { AbstractResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFileService } from 'vs/platform/files/common/files';
import { EditorInputCapabilities, Verbosity } from 'vs/workbench/common/editor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CustomEditorLabel } from 'vs/workbench/common/editor/editorLabels';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

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
			@IConfigurationService configurationService: IConfigurationService
		) {
			super(resource, resource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, configurationService);
		}
	}

	async function createServices(): Promise<[IInstantiationService, TestConfigurationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);

		return [instantiationService, testConfigurationService];
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
		const [instantiationService, testConfigurationService] = await createServices();

		const resource1 = URI.from({ scheme: 'testResource', path: 'thePath/of/the/resource.txt' });
		const resource2 = URI.from({ scheme: 'testResource', path: 'theOtherPath/of/the/resource.md' });

		await testConfigurationService.setUserConfiguration(CustomEditorLabel.SETTING_ID_ENABLED, true);
		await testConfigurationService.setUserConfiguration(CustomEditorLabel.SETTING_ID_PATTERNS, {
			'**/theOtherPath/**': 'Label 1',
			'**/*.txt': 'Label 2',
			'**/resource.txt': 'Label 3',
		});

		const input1 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource1));
		const input2 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource2));

		assert.ok(input1.getName() === 'Label 2');
		assert.ok(input2.getName() === 'Label 1');

		await testConfigurationService.setUserConfiguration(CustomEditorLabel.SETTING_ID_ENABLED, false);
		setTimeout(async () => {
			assert.ok(input1.getName() === 'resource.txt');
			assert.ok(input2.getName() === 'resource.md');

			await testConfigurationService.setUserConfiguration(CustomEditorLabel.SETTING_ID_ENABLED, true);
			await testConfigurationService.setUserConfiguration(CustomEditorLabel.SETTING_ID_PATTERNS, {
				'**/theOtherPath/**/the/**': 'Label 4',
				'**/resource.txt': 'Label 5',
			});

			setTimeout(() => {
				assert.ok(input1.getName() === 'Label 5');
				assert.ok(input2.getName() === 'Label 4');
			}, 5);
		}, 5);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
