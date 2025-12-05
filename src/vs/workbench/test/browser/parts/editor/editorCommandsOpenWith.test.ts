/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, registerTestFileEditor, registerTestResourceEditor, TestFileEditorInput, createEditorPart, registerTestSideBySideEditor, TestEditorInput } from '../../workbenchTestServices.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { API_OPEN_WITH_EDITOR_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

suite('Editor Commands - openWith', () => {

	const disposables = new DisposableStore();

	const TEST_EDITOR_ID = 'MyTestEditorForOpenWith';

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		disposables.add(accessor.untitledTextEditorService);
		disposables.add(registerTestFileEditor());
		disposables.add(registerTestSideBySideEditor());
		disposables.add(registerTestResourceEditor());
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)]));
	});

	teardown(() => {
		disposables.clear();
	});

	async function createServices(): Promise<TestServiceAccessor> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		return instantiationService.createInstance(TestServiceAccessor);
	}

	test('respects preview option when true', async () => {
		const accessor = await createServices();
		const activeGroup = accessor.editorGroupService.activeGroup;

		const testUri = URI.parse('file:///test.txt');
		
		// Test with preview: true, which should result in pinned: false
		const previewOptions = { pinned: false }; // This is what preview: true gets converted to
		
		// Execute the openWith command
		const commandHandler = CommandsRegistry.getCommand(API_OPEN_WITH_EDITOR_COMMAND_ID);
		assert.ok(commandHandler, 'openWith command should be registered');

		await commandHandler.handler(accessor, testUri, TEST_EDITOR_ID, [undefined, previewOptions]);

		// Check that the editor was opened in preview mode (not pinned)
		const activeEditor = activeGroup.activeEditor;
		assert.ok(activeEditor, 'Editor should be opened');
		assert.strictEqual(activeGroup.isPinned(activeEditor), false, 'Editor should not be pinned when preview: true');
	});

	test('respects preview option when false', async () => {
		const accessor = await createServices();
		const activeGroup = accessor.editorGroupService.activeGroup;

		const testUri = URI.parse('file:///test2.txt');
		
		// Test with preview: false, which should result in pinned: true
		const pinnedOptions = { pinned: true };
		
		// Execute the openWith command
		const commandHandler = CommandsRegistry.getCommand(API_OPEN_WITH_EDITOR_COMMAND_ID);
		assert.ok(commandHandler, 'openWith command should be registered');

		await commandHandler.handler(accessor, testUri, TEST_EDITOR_ID, [undefined, pinnedOptions]);

		// Check that the editor was opened in pinned mode
		const activeEditor = activeGroup.activeEditor;
		assert.ok(activeEditor, 'Editor should be opened');
		assert.strictEqual(activeGroup.isPinned(activeEditor), true, 'Editor should be pinned when preview: false');
	});

	test('defaults to preview mode when no options provided', async () => {
		const accessor = await createServices();
		const activeGroup = accessor.editorGroupService.activeGroup;

		const testUri = URI.parse('file:///test3.txt');
		
		// Execute the openWith command without options
		const commandHandler = CommandsRegistry.getCommand(API_OPEN_WITH_EDITOR_COMMAND_ID);
		assert.ok(commandHandler, 'openWith command should be registered');

		await commandHandler.handler(accessor, testUri, TEST_EDITOR_ID, [undefined, undefined]);

		// Check that the editor was opened in preview mode (default behavior)
		const activeEditor = activeGroup.activeEditor;
		assert.ok(activeEditor, 'Editor should be opened');
		// Note: The default behavior should be preview mode unless explicitly pinned
		assert.strictEqual(activeGroup.isPinned(activeEditor), false, 'Editor should default to preview mode when no options provided');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});