/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService, toWorkspaceFolder, WorkbenchMode, WorkbenchState, type IWorkspaceFoldersChangeEvent } from '../../../platform/workspace/common/workspace.js';
import { testIWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import '../../browser/actions/layoutActions.js';
import '../../browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../browser/parts/editor/editor.js';
import { WorkbenchContextKeysHandler } from '../../browser/contextkeys.js';
import { VirtualWorkspaceContext, WorkbenchModeContext, WorkbenchScopeContext, WorkspaceHasVirtualContentContext } from '../../common/contextkeys.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { TestLayoutService, workbenchInstantiationService } from './workbenchTestServices.js';

suite('Workbench Context Keys', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class ChatLayoutService extends TestLayoutService {
		readonly emitter = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		override readonly onDidChangePartVisibility = this.emitter.event;
		readonly chatEmitter = disposables.add(new Emitter<boolean>());
		override readonly onDidChangeChatPartVisibility = this.chatEmitter.event;
		hasChat = false;
		override hasChatPart(): boolean {
			return this.hasChat;
		}
		chatVisible = true;
		editorHidden = false;
		override isVisible(part: Parts): boolean {
			return part === Parts.CHAT_PART ? this.chatVisible : part === Parts.EDITOR_PART ? !this.editorHidden : true;
		}
		override isEditorHiddenByChat(): boolean {
			return this.editorHidden;
		}
	}

	const localFolder = toWorkspaceFolder(URI.file('/local'));
	const virtualFolder = toWorkspaceFolder(URI.parse('test-vfs://provider/virtual'));

	// The handler sets a global context key constant, so a window can construct it only once: a single test covers it.
	function create(layoutService: ChatLayoutService) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeWorkbenchScope = disposables.add(new Emitter<URI | undefined>());
		let scope: URI | undefined = URI.file('/workspace');
		const onDidChangeWorkbenchMode = disposables.add(new Emitter<WorkbenchMode>());
		let mode = WorkbenchMode.Editor;
		const workspace = { folders: [localFolder, virtualFolder] };
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkspaceContextService, {
			getWorkspace: () => testIWorkspace({ id: 'test', folders: workspace.folders }),
			getWorkbenchState: () => WorkbenchState.WORKSPACE,
			onDidChangeWorkbenchState: Event.None,
			getWorkbenchScope: () => scope,
			onDidChangeWorkbenchScope: onDidChangeWorkbenchScope.event,
			getWorkbenchMode: () => mode,
			onDidChangeWorkbenchMode: onDidChangeWorkbenchMode.event,
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
		});
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IEditorGroupsService, 'partOptions', { ...DEFAULT_EDITOR_PART_OPTIONS });
		disposables.add(instantiationService.createInstance(WorkbenchContextKeysHandler));
		const setFolders = (folders: typeof workspace.folders, event: IWorkspaceFoldersChangeEvent) => {
			workspace.folders = folders;
			onDidChangeWorkspaceFolders.fire(event);
		};
		const setScope = (value: URI | undefined) => {
			scope = value;
			onDidChangeWorkbenchScope.fire(value);
		};
		const setMode = (value: WorkbenchMode) => {
			mode = value;
			onDidChangeWorkbenchMode.fire(value);
		};
		return { contextKeyService, setFolders, setScope, setMode };
	}

	const maximizeActionShown = (contextKeyService: ContextKeyService) => MenuRegistry.getMenuItems(MenuId.AuxiliaryBarTitle)
		.some(item => isIMenuItem(item) && item.command.id === 'workbench.action.toggleMaximizedAuxiliaryBar' && (!item.when || item.when.evaluate(contextKeyService.getContext(null))));

	const snapshot = (contextKeyService: ContextKeyService) => ({
		chatPartEnabled: contextKeyService.getContextKeyValue('chatPartEnabled'),
		chatPartVisible: contextKeyService.getContextKeyValue('chatPartVisible'),
		editorAreaHiddenByChat: contextKeyService.getContextKeyValue('editorAreaHiddenByChat'),
		mainEditorAreaVisible: contextKeyService.getContextKeyValue('mainEditorAreaVisible'),
	});

	test('the keys follow a chat part that the layout creates visible, without an event, once the window restored, and then follow it, and the virtual workspace keys follow folder changes', async () => {
		const layoutService = new ChatLayoutService();
		let restored!: () => void;
		layoutService.whenRestored = new Promise<void>(resolve => restored = resolve);
		layoutService.chatVisible = false;
		layoutService.editorHidden = true;
		const { contextKeyService, setFolders, setScope, setMode } = create(layoutService);
		const scopes = [WorkbenchScopeContext.getValue(contextKeyService)];
		setScope(undefined);
		scopes.push(WorkbenchScopeContext.getValue(contextKeyService));
		setScope(URI.file('/workspace'));
		scopes.push(WorkbenchScopeContext.getValue(contextKeyService));
		assert.deepStrictEqual(scopes, ['workspace', 'all', 'workspace']);
		const modes = [WorkbenchModeContext.getValue(contextKeyService)];
		setMode(WorkbenchMode.Agents);
		modes.push(WorkbenchModeContext.getValue(contextKeyService));
		setMode(WorkbenchMode.Editor);
		modes.push(WorkbenchModeContext.getValue(contextKeyService));
		assert.deepStrictEqual(modes, ['editor', 'agents', 'editor']);
		const workspaceKeys = () => ({
			scheme: VirtualWorkspaceContext.getValue(contextKeyService),
			hasVirtualContent: WorkspaceHasVirtualContentContext.getValue(contextKeyService),
		});
		const mixed = workspaceKeys();
		const atConstruction = { ...snapshot(contextKeyService), maximizeActionShown: maximizeActionShown(contextKeyService) };

		// The layout creates the chat part from its stored state, visible, and fires no visibility event
		// and normalizes a stale hidden editor area to visible, also without an event
		layoutService.hasChat = true;
		layoutService.chatVisible = true;
		layoutService.editorHidden = false;
		restored();
		await layoutService.whenRestored;
		await Promise.resolve();
		const restoredKeys = { ...snapshot(contextKeyService), maximizeActionShown: maximizeActionShown(contextKeyService) };
		const paletteEnabled = !!MenuRegistry.getCommand('workbench.action.toggleEditorVisibility')?.precondition?.evaluate(contextKeyService.getContext(null));

		layoutService.chatVisible = false;
		layoutService.chatEmitter.fire(false);
		const hiddenChat = snapshot(contextKeyService);

		layoutService.chatVisible = true;
		layoutService.editorHidden = true;
		layoutService.chatEmitter.fire(true);
		layoutService.emitter.fire({ partId: Parts.EDITOR_PART, visible: false });

		setFolders([localFolder], { added: [], removed: [virtualFolder], changed: [] });
		const local = workspaceKeys();
		setFolders([virtualFolder], { added: [virtualFolder], removed: [localFolder], changed: [] });

		assert.deepStrictEqual({ mixed, local, virtual: workspaceKeys() }, {
			mixed: { scheme: '', hasVirtualContent: true },
			local: { scheme: '', hasVirtualContent: false },
			virtual: { scheme: 'test-vfs', hasVirtualContent: true },
		});
		assert.deepStrictEqual({ atConstruction, restoredKeys, paletteEnabled, hiddenChat, editorHidden: snapshot(contextKeyService) }, {
			atConstruction: { chatPartEnabled: false, chatPartVisible: false, editorAreaHiddenByChat: true, mainEditorAreaVisible: false, maximizeActionShown: true },
			restoredKeys: { chatPartEnabled: true, chatPartVisible: true, editorAreaHiddenByChat: false, mainEditorAreaVisible: true, maximizeActionShown: false },
			paletteEnabled: true,
			hiddenChat: { chatPartEnabled: true, chatPartVisible: false, editorAreaHiddenByChat: false, mainEditorAreaVisible: true },
			editorHidden: { chatPartEnabled: true, chatPartVisible: true, editorAreaHiddenByChat: true, mainEditorAreaVisible: false },
		});
	});

	test('the editor area toggle follows the layout', async () => {
		const calls: string[] = [];
		const state = { chatVisible: false, editorHidden: false };
		const layoutService = new class extends TestLayoutService {
			override isVisible(part: Parts): boolean { return part === Parts.CHAT_PART ? state.chatVisible : true; }
			override isEditorHiddenByChat(): boolean { return state.editorHidden; }
			override setEditorHiddenByChat(hidden: boolean): void { calls.push(`setEditorHiddenByChat(${hidden})`); }
			override toggleMaximizedPanel(): void { calls.push('toggleMaximizedPanel'); }
		};
		const accessor = { get: () => layoutService } as unknown as ServicesAccessor;
		const run = (id: string) => CommandsRegistry.getCommand(id)!.handler(accessor);

		await run('workbench.action.toggleEditorVisibility');
		state.chatVisible = true;
		await run('workbench.action.toggleEditorVisibility');
		state.editorHidden = true;
		await run('workbench.action.toggleEditorVisibility');

		assert.deepStrictEqual(calls, [
			'toggleMaximizedPanel',
			'setEditorHiddenByChat(true)',
			'setEditorHiddenByChat(false)',
		]);
	});

	test('the watermark of the empty editor group offers to hide the editor area only while the chat part shows, with that group alone, in the main window of an editor window, and not while the secondary side bar is maximized over it', () => {
		const shown = (keys: { chatPartVisible?: boolean; isSessionsWindow?: boolean; isAuxiliaryWindow?: boolean; editorPartMultipleEditorGroups?: boolean; auxiliaryBarMaximized?: boolean }) => {
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			for (const [key, value] of Object.entries(keys)) {
				contextKeyService.createKey(key, value);
			}
			return MenuRegistry.getMenuItems(MenuId.EditorGroupWatermarkToolbar)
				.filter(isIMenuItem)
				.filter(item => item.command.id === 'workbench.action.hideEditorAreaForChat' && (!item.when || item.when.evaluate(contextKeyService.getContext(null))))
				.map(item => ({ title: item.command.title, icon: (item.command.icon as { id: string } | undefined)?.id, group: item.group }));
		};
		const steps: string[] = [];
		const layoutService = new class extends TestLayoutService {
			override isVisible(part: Parts): boolean { return part === Parts.CHAT_PART; }
			override setEditorHiddenByChat(hidden: boolean): void { steps.push(`setEditorHiddenByChat(${hidden})`); }
		}();
		CommandsRegistry.getCommand('workbench.action.hideEditorAreaForChat')!.handler({ get: () => layoutService } as unknown as ServicesAccessor);

		const offered = [{ title: { value: 'Hide Editor Area', original: 'Hide Editor Area' }, icon: 'close', group: 'navigation' }];
		assert.deepStrictEqual({
			chatShows: shown({ chatPartVisible: true }),
			chatHidden: shown({ chatPartVisible: false }),
			agentsWindow: shown({ chatPartVisible: true, isSessionsWindow: true }),
			auxiliaryWindow: shown({ chatPartVisible: true, isAuxiliaryWindow: true }),
			otherGroups: shown({ chatPartVisible: true, editorPartMultipleEditorGroups: true }),
			secondarySideBarMaximized: shown({ chatPartVisible: true, auxiliaryBarMaximized: true }),
			steps,
		}, { chatShows: offered, chatHidden: [], agentsWindow: [], auxiliaryWindow: [], otherGroups: [], secondarySideBarMaximized: [], steps: ['setEditorHiddenByChat(true)'] });
	});
});
