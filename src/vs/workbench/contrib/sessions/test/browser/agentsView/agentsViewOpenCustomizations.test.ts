/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../../browser/editor.js';
import { IEditorGroupView } from '../../../../../browser/parts/editor/editor.js';
import { ViewEditorInput } from '../../../../../browser/parts/editor/viewEditorInput.js';
import { ViewEditorPane } from '../../../../../browser/parts/editor/viewEditorPane.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../../../browser/parts/editor/viewEditorRegistry.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry } from '../../../../../common/editor.js';
import { IAuxiliaryWindowService } from '../../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { EditorService } from '../../../../../services/editor/browser/editorService.js';
import { IContentPart, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, USE_MODAL_EDITOR_SETTING } from '../../../../../services/editor/common/editorService.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { IStatusbarService } from '../../../../../services/statusbar/browser/statusbar.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationManagementCommands } from '../../../../chat/common/aiCustomizationWorkspaceService.js';
import { registerAgentsViewNewSessionActions } from '../../../browser/agentsView/agentsChatPartActions.js';

const TEST_EDITOR_ID = 'agentsViewOpenCustomizations.editor';
const TEST_EDITOR_INPUT_ID = 'agentsViewOpenCustomizations.input';
const CHAT_VIEW_TYPE = 'agentsViewOpenCustomizations.chat';

/** A chat of the chat part: a view shown as an editor, which renders its own title, as the chat part's chats do. */
class TestChatView implements IViewEditorView {
	readonly element = mainWindow.document.createElement('div');
	private readonly _onDidChange = new Emitter<{ width: number; height: number } | undefined>();
	readonly onDidChange = this._onDidChange.event;
	readonly minimumWidth = 100;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 40;
	readonly maximumHeight = Number.POSITIVE_INFINITY;
	readonly providesTitle = true;
	readonly dragHandle = this.element.appendChild(mainWindow.document.createElement('div'));
	readonly titleMenu = undefined;
	setProvidedTitleVisible(): void { }
	saveViewState(): void { }
	setVisible(): void { }
	layout(): void { }
	focus(): void { }
	dispose(): void { this._onDidChange.dispose(); }
}

suite('Agents view: Open Customizations', () => {

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_EDITOR_INPUT_ID));
		disposables.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ViewEditorPane, ViewEditorPane.ID, 'View Editor'), [new SyncDescriptor(ViewEditorInput)]));
		disposables.add(Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).register({ viewType: CHAT_VIEW_TYPE, name: 'Chat', providesTitle: true, createView: () => new TestChatView() }));
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Opens the customizations of a session from its context menu while the chat part, showing a chat, was the editor part
	 * last active, and tells where the customizations editor opened. The command opens it as the real one does: in no
	 * particular group, as a singleton that requires a modal unless modal editors are off.
	 */
	async function openCustomizations(lockMainGroup: boolean) {
		const configurationService = new TestConfigurationService({ [USE_MODAL_EDITOR_SETTING]: 'off' });
		const instantiationService = workbenchInstantiationService({
			contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService),
			configurationService: () => configurationService,
		}, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		instantiationService.stub(IStatusbarService, new class extends mock<IStatusbarService>() { override createScoped() { return this; } }());
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		// The main editor area shows a file, in a group that may be locked
		const mainGroup = parts.mainPart.activeGroup;
		await mainGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/main.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		if (lockMainGroup) {
			mainGroup.lock(true);
		}

		// The chat part shows a chat, and was the editor part last active
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const chatPart: IContentPart = parts.createEditorPart({ container });
		chatPart.layout(800, 600, 0, 0);
		disposables.add({ dispose: () => { chatPart.close(); container.remove(); } });
		await chatPart.activeGroup.openEditor(disposables.add(new ViewEditorInput(CHAT_VIEW_TYPE, URI.file('/chat'))), { pinned: true });
		(parts.getGroup(chatPart.activeGroup.id) as IEditorGroupView).focus();
		const chatPartActive = parts.activeGroup.id === chatPart.activeGroup.id;

		const customizations = disposables.add(new TestFileEditorInput(URI.file('/customizations'), TEST_EDITOR_INPUT_ID));
		customizations.capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
		disposables.add(CommandsRegistry.registerCommand(AICustomizationManagementCommands.OpenEditor, accessor => accessor.get(IEditorService).openEditor(customizations, { pinned: true })));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)); return undefined; } }));
		disposables.add(registerAgentsViewNewSessionActions());

		const session = upcastPartial<ISession>({ resource: URI.parse('agent-host-copilot:/one') });
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.agentsView.openSessionCustomizations')!.handler(accessor, session));

		const groupOf = parts.groups.find(group => group.contains(customizations));
		return {
			chatPartActive,
			inChatPart: chatPart.groups.some(group => group.contains(customizations)),
			inMainPart: parts.mainPart.groups.some(group => group.contains(customizations)),
			inLockedGroup: !!groupOf?.isLocked,
		};
	}

	test('opened while the chat part was last active, the customizations open in the editor area, not among its chats', async () => {
		assert.deepStrictEqual(await openCustomizations(false), { chatPartActive: true, inChatPart: false, inMainPart: true, inLockedGroup: false });
	});

	test('with the editor area\'s group locked, they open as any editor does: in an unlocked group, still not among the chats', async () => {
		assert.deepStrictEqual(await openCustomizations(true), { chatPartActive: true, inChatPart: false, inMainPart: true, inLockedGroup: false });
	});
});
