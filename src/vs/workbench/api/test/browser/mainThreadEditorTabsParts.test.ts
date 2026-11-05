/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { EditorService } from '../../../services/editor/browser/editorService.js';
import { IContentPart, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadEditorTabs } from '../../browser/mainThreadEditorTabs.js';
import { IEditorTabGroupDto, TabOperation } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadEditorTabs with several editor parts', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForMainThreadEditorTabsParts';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForMainThreadEditorTabsParts';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the extension host always knows an active tab group among its groups', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		instantiationService.stub(IStatusbarService, new class extends mock<IStatusbarService>() { override createScoped() { return this; } }());
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		// The extension host's view of the tab model, as `ExtHostEditorTabs` keeps it
		let groupIds: number[] = [];
		let activeGroupId: number | undefined;
		const problems: string[] = [];
		const check = (what: string) => {
			if (activeGroupId === undefined || !groupIds.includes(activeGroupId)) {
				problems.push(`${what}: active ${activeGroupId} not in [${groupIds.join(', ')}]`);
			}
		};
		disposables.add(new MainThreadEditorTabs(SingleProxyRPCProtocol({
			$acceptEditorTabModel(groups: IEditorTabGroupDto[]) {
				groupIds = groups.map(group => group.groupId);
				const active = groups.filter(group => group.isActive);
				if (active.length !== 1) {
					problems.push(`model with ${active.length} active groups`);
				}
				activeGroupId = active[0]?.groupId ?? activeGroupId;
				check('model');
			},
			$acceptTabGroupUpdate(group: IEditorTabGroupDto) {
				if (!groupIds.includes(group.groupId)) {
					problems.push(`update of unknown group ${group.groupId}`);
				}
				if (group.isActive) {
					activeGroupId = group.groupId;
				}
				check('group update');
			},
			$acceptTabOperation(operation: TabOperation) {
				if (!groupIds.includes(operation.groupId)) {
					problems.push(`tab operation in unknown group ${operation.groupId}`);
				}
				check('tab operation');
			}
		}), parts, new TestConfigurationService(), new NullLogService(), editorService));
		await parts.whenReady;
		await Promise.resolve();

		// A window with two parts, as a chat window has
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		disposables.add({ dispose: () => iframe.remove() });
		const otherWindow = iframe.contentWindow!;
		ensureCodeWindow(otherWindow, 4747);
		disposables.add(registerWindow(otherWindow));
		const containerIn = () => otherWindow.document.body.appendChild(otherWindow.document.createElement('div'));

		// The other window has focus, as a chat window has while it is used
		const mainHasFocus = mainWindow.document.hasFocus;
		mainWindow.document.hasFocus = () => false;
		otherWindow.document.hasFocus = () => true;
		disposables.add({ dispose: () => mainWindow.document.hasFocus = mainHasFocus });
		const input = (path: string) => disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));

		const mainEditor = input('/main.txt');
		await parts.mainPart.activeGroup.openEditor(mainEditor, { pinned: true });
		const side: IContentPart = parts.createEditorPart({ container: containerIn() });
		const chat: IContentPart = parts.createEditorPart({ container: containerIn() });
		side.layout(400, 300, 0, 0);
		chat.layout(400, 300, 0, 0);

		// Editors move into the window and between its parts
		parts.mainPart.activeGroup.moveEditor(mainEditor, side.activeGroup);
		parts.activateGroup(side.activeGroup.id);
		const chatEditor = input('/chat.txt');
		await chat.activeGroup.openEditor(chatEditor, { pinned: true });
		parts.activateGroup(chat.activeGroup.id);
		chat.activeGroup.moveEditor(chatEditor, side.activeGroup);
		side.activeGroup.moveEditor(mainEditor, chat.activeGroup);
		parts.activateGroup(chat.activeGroup.id);

		// The parts close
		chat.close();
		side.close();
		await Promise.resolve();

		assert.deepStrictEqual(problems, []);
	});
});
