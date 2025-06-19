/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';

suite('NotebookTextModel - Transient Outputs', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		configurationService = new TestConfigurationService();
		instantiationService.set(IConfigurationService, configurationService);
	});

	suiteTeardown(() => disposables.dispose());

	test('should respect global transient outputs setting', async function () {
		// Set global setting to true
		configurationService.setUserConfiguration(NotebookSetting.transientOutputs, true);

		await withTestNotebook(
			[
				['console.log("test");', 'javascript', CellKind.Code, [{ outputs: [{ mime: 'text/plain', data: VSBuffer.fromString('test output').buffer }], outputId: 'out1', metadata: {} }], {}]
			],
			(editor, _viewModel, _ds) => {
				const textModel = editor.textModel;
				
				// Create snapshot - outputs should be excluded due to global setting
				const snapshot = textModel.createSnapshot({ context: SnapshotContext.Save, outputSizeLimit: 0 });
				
				assert.strictEqual(snapshot.cells.length, 1);
				assert.strictEqual(snapshot.cells[0].outputs.length, 0, 'Outputs should be excluded when global setting is true');
			}
		);
	});

	test('should respect notebook metadata transient outputs setting', async function () {
		// Set global setting to false
		configurationService.setUserConfiguration(NotebookSetting.transientOutputs, false);

		await withTestNotebook(
			[
				['console.log("test");', 'javascript', CellKind.Code, [{ outputs: [{ mime: 'text/plain', data: VSBuffer.fromString('test output').buffer }], outputId: 'out1', metadata: {} }], {}]
			],
			(editor, _viewModel, _ds) => {
				const textModel = editor.textModel;
				
				// Set notebook metadata to make outputs transient
				textModel.metadata = { ...textModel.metadata, transientOutputs: true };
				
				// Create snapshot - outputs should be excluded due to notebook metadata
				const snapshot = textModel.createSnapshot({ context: SnapshotContext.Save, outputSizeLimit: 0 });
				
				assert.strictEqual(snapshot.cells.length, 1);
				assert.strictEqual(snapshot.cells[0].outputs.length, 0, 'Outputs should be excluded when notebook metadata setting is true');
			}
		);
	});

	test('should preserve outputs when all transient settings are false', async function () {
		// Set global setting to false
		configurationService.setUserConfiguration(NotebookSetting.transientOutputs, false);

		await withTestNotebook(
			[
				['console.log("test");', 'javascript', CellKind.Code, [{ outputs: [{ mime: 'text/plain', data: VSBuffer.fromString('test output').buffer }], outputId: 'out1', metadata: {} }], {}]
			],
			(editor, _viewModel, _ds) => {
				const textModel = editor.textModel;
				
				// Ensure notebook metadata doesn't set transient outputs
				textModel.metadata = { ...textModel.metadata, transientOutputs: false };
				
				// Create snapshot - outputs should be included
				const snapshot = textModel.createSnapshot({ context: SnapshotContext.Save, outputSizeLimit: 0 });
				
				assert.strictEqual(snapshot.cells.length, 1);
				assert.strictEqual(snapshot.cells[0].outputs.length, 1, 'Outputs should be preserved when all transient settings are false');
			}
		);
	});

	test('serializer transient options should take precedence', async function () {
		// Set global setting to false
		configurationService.setUserConfiguration(NotebookSetting.transientOutputs, false);

		await withTestNotebook(
			[
				['console.log("test");', 'javascript', CellKind.Code, [{ outputs: [{ mime: 'text/plain', data: VSBuffer.fromString('test output').buffer }], outputId: 'out1', metadata: {} }], {}]
			],
			(editor, _viewModel, _ds) => {
				const textModel = editor.textModel;
				
				// Set notebook metadata to false
				textModel.metadata = { ...textModel.metadata, transientOutputs: false };
				
				// Set serializer options to make outputs transient
				textModel.transientOptions = { 
					...textModel.transientOptions, 
					transientOutputs: true 
				};
				
				// Create snapshot - outputs should be excluded due to serializer setting taking precedence
				const snapshot = textModel.createSnapshot({ context: SnapshotContext.Save, outputSizeLimit: 0 });
				
				assert.strictEqual(snapshot.cells.length, 1);
				assert.strictEqual(snapshot.cells[0].outputs.length, 0, 'Outputs should be excluded when serializer transient options are true (highest precedence)');
			}
		);
	});
});