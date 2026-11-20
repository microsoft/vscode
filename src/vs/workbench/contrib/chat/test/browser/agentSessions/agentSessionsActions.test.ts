/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isMacintosh, OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../../../base/common/keybindings.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { RawWorkbenchListFocusContextKey } from '../../../../../../platform/list/browser/listService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders, AgentSessionsViewerOrientation } from '../../../browser/agentSessions/agentSessions.js';
import { ArchiveAgentSessionAction, MarkAgentSessionDoneAction, MarkAgentSessionReadAction, MarkAgentSessionUnreadAction, MarkAllAgentSessionsReadAction, OpenAgentSessionCustomizationsAction, OpenSessionsListItemCustomizationsAction, OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, RenameAgentSessionAction, RestoreAgentSessionAction, ShowAgentSessionsSidebar, UnarchiveAgentSessionAction } from '../../../browser/agentSessions/agentSessionsActions.js';
import { AgentSessionsControl } from '../../../browser/agentSessions/agentSessionsControl.js';
import { ChatViewPane } from '../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IAgentSession, IAgentSessionsModel, IMarshalledAgentSessionContext } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { AGENT_SESSION_MARK_READ_ACTION_ID, AGENT_SESSION_MARK_UNREAD_ACTION_ID } from '../../../../../common/chatSessionCommands.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import '../../../browser/agentSessions/agentHost/agentHostSettings.contribution.js';
import '../../../browser/agentSessions/agentHost/agentSessionSettings.contribution.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';

suite('AgentSessionsActions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let actionRegistration: IDisposable;

	suiteSetup(() => actionRegistration = registerAction2(RenameAgentSessionAction));
	suiteTeardown(() => actionRegistration.dispose());

	test('offers Open Customizations for one selected session and hides it when AI is disabled', () => {
		disposables.add(registerAction2(OpenAgentSessionCustomizationsAction));
		const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).filter(isIMenuItem).find(item => item.command.id === 'agentSession.openCustomizations');
		assert.ok(item);
		const evaluate = (enabled: boolean, multipleSelection: boolean) => {
			const values: Record<string, boolean> = {
				[ChatContextKeys.enabled.key]: enabled,
				[ChatContextKeys.hasMultipleAgentSessionsSelected.key]: multipleSelection,
			};
			const context: IContext = { getValue: <T>(key: string) => values[key] as T | undefined };
			return { visible: item.when?.evaluate(context), enabled: item.command.precondition?.evaluate(context) };
		};
		assert.deepStrictEqual({
			group: item.group,
			single: evaluate(true, false),
			multiple: evaluate(true, true),
			aiDisabled: evaluate(false, false),
		}, {
			group: 'navigation',
			single: { visible: true, enabled: true },
			multiple: { visible: true, enabled: false },
			aiDisabled: { visible: false, enabled: false },
		});
	});

	test('adapts explicit session contexts to the customization command without falling back to another session', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: { commandId: string; target: { sessionResource: URI } }[] = [];
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (commandId: string, target: { sessionResource: URI }) => {
				calls.push({ commandId, target });
				return undefined;
			},
		}));
		const session = upcastPartial<IAgentSession>({ resource: URI.parse('agent-host-copilot:/selected-session') });
		const other = upcastPartial<IAgentSession>({ resource: URI.parse('agent-host-claude:/other-session') });
		const action = new OpenAgentSessionCustomizationsAction();
		await instantiationService.invokeFunction(accessor => action.run(accessor, session));
		await instantiationService.invokeFunction(accessor => action.run(accessor, {
			$mid: MarshalledId.AgentSessionContext, session, sessions: [session],
		}));
		for (const sessions of [[], [session, other]]) {
			await assert.rejects(() => instantiationService.invokeFunction(accessor => action.run(accessor, {
				$mid: MarshalledId.AgentSessionContext, session, sessions,
			})), /Select a single session/);
		}
		await assert.rejects(() => instantiationService.invokeFunction(accessor => action.run(accessor)), /Select a single session/);
		assert.deepStrictEqual(calls, Array(2).fill({
			commandId: AICustomizationManagementCommands.OpenEditor,
			target: { sessionResource: session.resource },
		}));
	});

	test('contributes the Chat view session actions to the shared sessions list menu in the right group order and window', () => {
		const actions = [OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, OpenSessionsListItemCustomizationsAction, MarkAllAgentSessionsReadAction];
		for (const action of actions) {
			disposables.add(registerAction2(action));
		}
		// The menu is shared, so other windows' entries (for example the Agents window's Mark as Read) may be registered too.
		const ownCommands = new Set([...actions.map(action => new action().desc.id), 'workbench.action.chat.openAgentHostSettings', 'workbench.action.chat.openAgentSessionSettings']);
		// Menus render the navigation group first.
		const groupRank = (group: string | undefined) => group === 'navigation' ? 0 : 1;
		const evaluate = (isSessionsWindow: boolean, providerId = 'local-agent-host') => {
			const values: Record<string, boolean | string> = {
				[IsSessionsWindowContext.key]: isSessionsWindow,
				[ChatContextKeys.enabled.key]: true,
				[AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true,
				sessionProviderId: providerId,
			};
			const context: IContext = { getValue: <T>(key: string) => values[key] as T | undefined };
			return MenuRegistry.getMenuItems(MenuId.SessionItemContextMenu).filter(isIMenuItem)
				.filter(item => ownCommands.has(item.command.id))
				.filter(item => item.when?.evaluate(context) ?? true)
				.sort((a, b) => groupRank(a.group) - groupRank(b.group) || (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
				.map(item => `${item.group}@${item.order}: ${item.command.id}`);
		};
		assert.deepStrictEqual({ editor: evaluate(false), remote: evaluate(false, 'agenthost-devcontainer'), agents: evaluate(true) }, {
			editor: [
				'navigation@2.1: workbench.action.chat.openSessionInEditorGroup',
				'navigation@2.2: workbench.action.chat.openSessionInNewEditorGroup',
				'navigation@2.3: workbench.action.chat.openSessionInNewWindow',
				'navigation@6: agentSession.openCustomizations.sessionsList',
				'1_state@5: workbench.action.chat.markAllAgentSessionsRead',
				'4_manage@2.5: workbench.action.chat.openAgentHostSettings',
				'4_manage@2.6: workbench.action.chat.openAgentSessionSettings',
			],
			// Host and session settings only target the local host.
			remote: [
				'navigation@2.1: workbench.action.chat.openSessionInEditorGroup',
				'navigation@2.2: workbench.action.chat.openSessionInNewEditorGroup',
				'navigation@2.3: workbench.action.chat.openSessionInNewWindow',
				'navigation@6: agentSession.openCustomizations.sessionsList',
				'1_state@5: workbench.action.chat.markAllAgentSessionsRead',
			],
			// The Agents window registers its own entries for these actions.
			agents: [],
		});
	});

	test('disables single-session actions while the shared sessions list has several rows selected', () => {
		disposables.add(registerAction2(OpenSessionsListItemCustomizationsAction));
		for (const id of ['agentSession.openCustomizations.sessionsList', 'workbench.action.chat.openAgentSessionSettings']) {
			const precondition = MenuRegistry.getMenuItems(MenuId.SessionItemContextMenu).filter(isIMenuItem).find(item => item.command.id === id)?.command.precondition;
			// The legacy Chat view key can be inherited as stale from a parent context.
			const enabled = (multiSelection: boolean, staleLegacyMultiSelection: boolean) => !!precondition?.evaluate({
				getValue: <T>(key: string) => ({ [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true, 'sessionItem.isMultiSelection': multiSelection, [ChatContextKeys.hasMultipleAgentSessionsSelected.key]: staleLegacyMultiSelection } as Record<string, boolean>)[key] as T | undefined,
			});
			assert.deepStrictEqual({ id, single: enabled(false, false), singleWithStaleLegacy: enabled(false, true), multiple: enabled(true, false) }, { id, single: true, singleWithStaleLegacy: true, multiple: false });
		}
	});

	test('keeps disabling the Chat view Open Customizations action for several legacy rows', () => {
		const precondition = new OpenAgentSessionCustomizationsAction().desc.precondition;
		const enabled = (legacyMultiSelection: boolean) => !!precondition?.evaluate({
			getValue: <T>(key: string) => ({ [ChatContextKeys.enabled.key]: true, [ChatContextKeys.hasMultipleAgentSessionsSelected.key]: legacyMultiSelection } as Record<string, boolean>)[key] as T | undefined,
		});
		assert.deepStrictEqual({ single: enabled(false), multiple: enabled(true) }, { single: true, multiple: false });
	});

	test('runs the Chat view open actions on rows of the shared sessions list', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const opened: { resource: string; group: unknown; auxiliary: boolean }[] = [];
		const session = upcastPartial<IAgentSession>({ resource: URI.parse('agent-host-copilot:/selected-session'), isArchived: () => false });
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: (resource: URI) => resource.toString() === session.resource.toString() ? session : undefined,
		}));
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { }(), 'getActiveViewWithId', () => undefined);
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, group, options) => {
				opened.push({ resource: resource.toString(), group, auxiliary: !!options?.auxiliary });
				return undefined;
			},
		}));
		// The list passes its selected sessions, which only share the resource with agent sessions.
		const listRow = [{ resource: session.resource }];
		for (const action of [new OpenAgentSessionInEditorGroupAction(), new OpenAgentSessionInNewEditorGroupAction(), new OpenAgentSessionInNewWindowAction()]) {
			await instantiationService.invokeFunction(accessor => action.run(accessor, listRow));
		}
		await instantiationService.invokeFunction(accessor => new OpenAgentSessionInEditorGroupAction().run(accessor, [{ resource: URI.parse('agent-host-copilot:/unknown') }]));

		assert.deepStrictEqual(opened, [
			{ resource: session.resource.toString(), group: ACTIVE_GROUP, auxiliary: false },
			{ resource: session.resource.toString(), group: SIDE_GROUP, auxiliary: false },
			{ resource: session.resource.toString(), group: AUX_WINDOW_GROUP, auxiliary: true },
		]);

		const calls: { commandId: string; target: { sessionResource: URI } }[] = [];
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (commandId: string, target: { sessionResource: URI }) => {
				calls.push({ commandId, target });
				return undefined;
			},
		}));
		await instantiationService.invokeFunction(accessor => new OpenAgentSessionCustomizationsAction().run(accessor, listRow));
		assert.deepStrictEqual(calls, [{ commandId: AICustomizationManagementCommands.OpenEditor, target: { sessionResource: session.resource } }]);
	});

	test('scopes read and unread shortcuts to the editor Sessions list on every platform', () => {
		const registrations = disposables.add(new DisposableStore());
		for (const action of [new MarkAgentSessionReadAction(), new MarkAgentSessionUnreadAction()]) {
			const keybinding = action.desc.keybinding;
			assert.ok(keybinding && !Array.isArray(keybinding));
			registrations.add(KeybindingsRegistry.registerKeybindingRule({ id: action.desc.id, ...keybinding }));
		}
		const sessionsList = {
			[ChatContextKeys.agentSessionsViewerFocused.key]: true,
			[RawWorkbenchListFocusContextKey.key]: true,
		};
		const context = (values: Record<string, ContextKeyValue>): IContext => ({
			getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined,
		});
		for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh, OperatingSystem.Linux]) {
			for (const [commandId, keyCode] of [[AGENT_SESSION_MARK_READ_ACTION_ID, KeyCode.KeyI], [AGENT_SESSION_MARK_UNREAD_ACTION_ID, KeyCode.KeyU]] as const) {
				const hash = decodeKeybinding(KeyMod.Shift | keyCode, operatingSystem)!.getHashCode();
				const rule = KeybindingsRegistry.getDefaultKeybindingsForOS(operatingSystem).find(item =>
					item.command === commandId && item.keybinding?.getHashCode() === hash && item.when?.evaluate(context(sessionsList)));
				assert.ok(rule?.when);
				assert.deepStrictEqual({
					list: rule.when.evaluate(context(sessionsList)),
					input: rule.when.evaluate(context({ ...sessionsList, [InputFocusedContext.key]: true })),
					agentsWindow: rule.when.evaluate(context({ ...sessionsList, [IsSessionsWindowContext.key]: true })),
					otherList: rule.when.evaluate(context({ ...sessionsList, [ChatContextKeys.agentSessionsViewerFocused.key]: false })),
					noListFocus: rule.when.evaluate(context({ ...sessionsList, [RawWorkbenchListFocusContextKey.key]: false })),
					childChat: rule.when.evaluate(context({ ...sessionsList, [ChatContextKeys.isAgentSessionChild.key]: true })),
				}, { list: true, input: false, agentsWindow: false, otherList: false, noListFocus: false, childChat: true });
			}
		}
	});

	test('marks focused or selected sessions read and unread while preserving explicit context', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: { session: string; read: boolean }[] = [];
		const createSession = (name: string) => upcastPartial<IAgentSession>({
			resource: URI.parse(`test:/${name}`),
			setRead: read => calls.push({ session: name, read }),
		});
		const first = createSession('first');
		const second = createSession('second');
		const other = createSession('other');
		let selection = [first, second];
		let focused = [first];
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({}));
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { }(), 'getActiveViewWithId', () => upcastPartial<ChatViewPane>({
			getFocusedSessions: () => focused,
			agentSessionsControl: upcastPartial<AgentSessionsControl>({
				getSelectedSessions: () => selection,
			}),
		}));

		for (const action of [new MarkAgentSessionReadAction(), new MarkAgentSessionUnreadAction()]) {
			selection = [first, second];
			focused = [first];
			await instantiationService.invokeFunction(accessor => action.run(accessor));
			await instantiationService.invokeFunction(accessor => action.run(accessor, other));
			selection = [second];
			await instantiationService.invokeFunction(accessor => action.run(accessor));
			focused = [];
			await instantiationService.invokeFunction(accessor => action.run(accessor));
		}

		assert.deepStrictEqual(calls, [true, false].flatMap(read =>
			['first', 'second', 'other', 'first'].map(session => ({ session, read }))));
	});

	test('marks selected nested sessions without changing the parent', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: { session: string; read: boolean }[] = [];
		const parent = upcastPartial<IAgentSession>({
			resource: URI.parse('test:/parent'),
			setRead: read => calls.push({ session: 'parent', read }),
		});
		const createChild = (name: string) => upcastPartial<IAgentSession>({
			resource: parent.resource.with({ fragment: name }),
			parentSession: { resource: parent.resource, label: 'Parent' },
			setRead: read => calls.push({ session: name, read }),
		});
		const first = createChild('first');
		const second = createChild('second');
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({}));
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { }(), 'getActiveViewWithId', () => upcastPartial<ChatViewPane>({
			getFocusedSessions: () => [first],
			agentSessionsControl: upcastPartial<AgentSessionsControl>({
				getSelectedSessions: () => [parent, first, second],
			}),
		}));
		for (const action of [new MarkAgentSessionReadAction(), new MarkAgentSessionUnreadAction()]) {
			await instantiationService.invokeFunction(accessor => action.run(accessor));
			await instantiationService.invokeFunction(accessor => action.run(accessor, second));
		}
		assert.deepStrictEqual(calls, [true, false].flatMap(read =>
			['first', 'second', 'second'].map(session => ({ session, read }))));
	});

	test('marks automation runs read when the sessions list shows them', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: string[] = [];
		const createSession = (name: string) => upcastPartial<IAgentSession>({
			resource: URI.parse(`test:/${name}`),
			isArchived: () => false,
			isRead: () => false,
			setRead: () => calls.push(name),
		});
		const ordinary = createSession('ordinary');
		const automation = createSession('automation');
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsModel>({
				sessions: [ordinary],
				sessionsIncludingAutomationRuns: [ordinary, automation],
			}),
		}));
		const context: IMarshalledAgentSessionContext = {
			$mid: MarshalledId.AgentSessionContext,
			session: ordinary,
			sessions: [ordinary],
			showAutomationRuns: true,
		};
		const action = new MarkAllAgentSessionsReadAction();

		await instantiationService.invokeFunction(accessor => action.run(accessor));
		const defaultSessions = calls.splice(0);
		await instantiationService.invokeFunction(accessor => action.run(accessor, context));

		assert.deepStrictEqual({ defaultSessions, displayedSessions: calls }, {
			defaultSessions: ['ordinary'],
			displayedSessions: ['ordinary', 'automation'],
		});
	});

	test('completes and restores focused or selected side chats without changing their parent', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: { session: string; archived: boolean }[] = [];
		const parent = upcastPartial<IAgentSession>({
			resource: URI.parse('test:/parent'),
			setArchived: archived => calls.push({ session: 'parent', archived }),
		});
		const createChild = (name: string, canArchive: boolean) => upcastPartial<IAgentSession>({
			resource: parent.resource.with({ fragment: name }),
			parentSession: { resource: parent.resource, label: 'Parent' },
			canArchive,
			setArchived: archived => calls.push({ session: name, archived }),
		});
		const first = createChild('first', true);
		const second = createChild('second', true);
		const unsupported = createChild('unsupported', false);
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ getSession: () => undefined }));
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({}));
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { }(), 'getActiveViewWithId', () => upcastPartial<ChatViewPane>({
			getFocusedSessions: () => [first],
			agentSessionsControl: upcastPartial<AgentSessionsControl>({
				getSelectedSessions: () => [parent, first, second, unsupported],
			}),
		}));
		for (const action of [new MarkAgentSessionDoneAction(), new RestoreAgentSessionAction(), new ArchiveAgentSessionAction(), new UnarchiveAgentSessionAction()]) {
			await instantiationService.invokeFunction(accessor => action.run(accessor));
			await instantiationService.invokeFunction(accessor => action.run(accessor, second));
			await instantiationService.invokeFunction(accessor => action.run(accessor, unsupported));
		}
		assert.deepStrictEqual(calls, [true, false, true, false].flatMap(archived =>
			['first', 'second', 'second'].map(session => ({ session, archived }))));
	});

	function buildResolver(operatingSystem = OS): KeybindingResolver {
		const items: ResolvedKeybindingItem[] = [];
		for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(operatingSystem)) {
			if (item.command !== AGENT_SESSION_RENAME_ACTION_ID || !item.keybinding) {
				continue;
			}
			const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, operatingSystem)[0];
			items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? undefined, true, null, false));
		}
		return new KeybindingResolver(items, [], () => { });
	}

	test('resolves the rename keybinding in the sessions list and focused regular chats', () => {
		const store = disposables.add(new DisposableStore());
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const resolver = buildResolver();
		const expectedListKeybinding = isMacintosh ? 'Enter' : 'F2';
		const expectedChatKeybinding = 'F2';
		const lookup = (values: Array<[string, boolean | string]>): string | null => {
			const overlay = contextKeyService.createOverlay(values);
			return resolver.lookupPrimaryKeybinding(AGENT_SESSION_RENAME_ACTION_ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null;
		};
		const regularChat = [
			[ChatContextKeys.agentSessionsViewerFocused.key, false],
			[ChatContextKeys.inChatSession.key, true],
			[ChatContextKeys.inQuickChat.key, false],
			[IsSessionsWindowContext.key, false],
			[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
			[ChatContextKeys.chatSessionSupportsRename.key, true],
		] satisfies Array<[string, boolean | string]>;
		const agentHostChat = [
			[ChatContextKeys.agentSessionsViewerFocused.key, false],
			[ChatContextKeys.inChatSession.key, true],
			[ChatContextKeys.inQuickChat.key, false],
			[IsSessionsWindowContext.key, false],
			[ChatContextKeys.agentSessionType.key, 'agent-host-copilotcli'],
			[ChatContextKeys.chatSessionSupportsRename.key, true],
		] satisfies Array<[string, boolean | string]>;

		assert.deepStrictEqual({
			sessionsList: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, true],
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
			]),
			panelTranscript: lookup(regularChat),
			panelInput: lookup([...regularChat, [ChatContextKeys.inChatInput.key, true]]),
			editorTranscript: lookup([...regularChat, [ChatContextKeys.inChatEditor.key, true]]),
			editorInput: lookup([...regularChat, [ChatContextKeys.inChatEditor.key, true], [ChatContextKeys.inChatInput.key, true]]),
			agentHostEditorInput: lookup([...agentHostChat, [ChatContextKeys.inChatEditor.key, true], [ChatContextKeys.inChatInput.key, true]]),
			panelInputAfterListMultiSelection: lookup([
				...regularChat,
				[ChatContextKeys.hasMultipleAgentSessionsSelected.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			sessionsListMultiSelection: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, true],
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
				[ChatContextKeys.hasMultipleAgentSessionsSelected.key, true],
			]),
			sessionChild: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, true],
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
				[ChatContextKeys.isAgentSessionChild.key, true],
			]),
			emptyAgentHostEditorInput: lookup([
				...agentHostChat,
				[ChatContextKeys.chatSessionSupportsRename.key, false],
				[ChatContextKeys.inChatEditor.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			renameableContributedInput: lookup([
				...regularChat,
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Background],
				[ChatContextKeys.inChatEditor.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			cloudEditorInput: lookup([
				...regularChat,
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Cloud],
				[ChatContextKeys.chatSessionSupportsRename.key, false],
				[ChatContextKeys.inChatEditor.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			quickChatInput: lookup([
				...regularChat,
				[ChatContextKeys.inQuickChat.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			sessionsWindowInput: lookup([
				...regularChat,
				[IsSessionsWindowContext.key, true],
				[ChatContextKeys.inChatInput.key, true],
			]),
			outsideChat: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, false],
				[ChatContextKeys.inChatSession.key, false],
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
			]),
		}, {
			sessionsList: expectedListKeybinding,
			panelTranscript: expectedChatKeybinding,
			panelInput: expectedChatKeybinding,
			editorTranscript: expectedChatKeybinding,
			editorInput: expectedChatKeybinding,
			agentHostEditorInput: expectedChatKeybinding,
			panelInputAfterListMultiSelection: expectedChatKeybinding,
			sessionsListMultiSelection: null,
			sessionChild: null,
			emptyAgentHostEditorInput: null,
			renameableContributedInput: expectedChatKeybinding,
			cloudEditorInput: null,
			quickChatInput: null,
			sessionsWindowInput: null,
			outsideChat: null,
		});
	});

	test('uses Enter only in the macOS sessions list and F2 in focused chat', () => {
		const store = disposables.add(new DisposableStore());
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const resolver = buildResolver(OperatingSystem.Macintosh);
		const lookup = (values: Array<[string, boolean | string]>): string | null => {
			const overlay = contextKeyService.createOverlay(values);
			return resolver.lookupPrimaryKeybinding(AGENT_SESSION_RENAME_ACTION_ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null;
		};

		assert.deepStrictEqual({
			sessionsList: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, true],
				[ChatContextKeys.agentSessionType.key, AgentSessionProviders.Local],
			]),
			focusedChat: lookup([
				[ChatContextKeys.agentSessionsViewerFocused.key, false],
				[ChatContextKeys.inChatSession.key, true],
				[ChatContextKeys.inQuickChat.key, false],
				[IsSessionsWindowContext.key, false],
				[ChatContextKeys.chatSessionSupportsRename.key, true],
			]),
		}, {
			sessionsList: 'Enter',
			focusedChat: 'F2',
		});
	});

	test('renames the session in the focused chat widget', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const document = getActiveDocument();
		const domNode = document.createElement('div');
		const input = document.createElement('textarea');
		domNode.append(input);
		document.body.append(domNode);
		store.add(toDisposable(() => domNode.remove()));
		input.focus();

		const sessionResource = LocalChatSessionUri.forSession('focused-session');
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				domNode,
				viewModel: upcastPartial<IChatViewModel>({
					sessionResource,
					model: upcastPartial<IChatModel>({
						sessionResource,
						title: 'Current title',
					}),
				}),
			}),
		}));

		let promptValue: string | undefined;
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			input: async options => {
				promptValue = options?.value;
				return 'Renamed title';
			},
		}));

		const renamed: Array<{ resource: string; title: string }> = [];
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			setChatSessionTitle: (resource, title) => renamed.push({ resource: resource.toString(), title }),
		}));

		const action = new RenameAgentSessionAction();
		await instantiationService.invokeFunction(accessor => action.run(accessor));

		assert.deepStrictEqual({
			promptValue,
			renamed,
		}, {
			promptValue: 'Current title',
			renamed: [{
				resource: sessionResource.toString(),
				title: 'Renamed title',
			}],
		});
	});

	test('honors a contributed session provider\'s rename capability', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const document = getActiveDocument();
		const domNode = document.createElement('div');
		const input = document.createElement('textarea');
		domNode.append(input);
		document.body.append(domNode);
		store.add(toDisposable(() => domNode.remove()));
		input.focus();

		const sessionResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session' });
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				domNode,
				viewModel: upcastPartial<IChatViewModel>({
					sessionResource,
					model: upcastPartial<IChatModel>({
						sessionResource,
						title: '',
					}),
				}),
			}),
		}));

		let supportsRename = false;
		let inputCalls = 0;
		const renames: Array<{ resource: string; title: string }> = [];
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			input: async () => {
				inputCalls++;
				return 'Renamed title';
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			sessionSupportsRename: () => supportsRename,
			renameChatSession: async (resource, title) => { renames.push({ resource: resource.toString(), title }); },
		}));

		const action = new RenameAgentSessionAction();
		await instantiationService.invokeFunction(accessor => action.run(accessor));
		const unsupported = { inputCalls, renames: [...renames] };

		supportsRename = true;
		await instantiationService.invokeFunction(accessor => action.run(accessor));

		assert.deepStrictEqual({
			unsupported,
			supported: { inputCalls, renames },
		}, {
			unsupported: { inputCalls: 0, renames: [] },
			supported: {
				inputCalls: 1,
				renames: [{ resource: sessionResource.toString(), title: 'Renamed title' }],
			},
		});
	});

	test('does not archive a parent session from a child chat context', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({}));
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({}));

		let archiveCalls = 0;
		const parentResource = URI.parse('agent-host-copilot:/session');
		const child = upcastPartial<IAgentSession>({
			resource: parentResource.with({ fragment: 'peer' }),
			parentSession: { resource: parentResource, label: 'Session' },
			setArchived: () => archiveCalls++,
		});
		const action = new ArchiveAgentSessionAction();

		await instantiationService.invokeFunction(accessor => action.run(accessor, child));

		assert.strictEqual(archiveCalls, 0);
	});

	test('Show Agent Sessions Sidebar widens the Chat view until its body fits side by side, past the chrome of its part, or maximizes it, and leaves one wide enough', async () => {
		const run = async (partWidth: number, bodyWidth: number, applies: boolean, staleStackedBodyWidth?: number) => {
			const calls: string[] = [];
			let width = partWidth;
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
				getPanelPosition: () => Position.BOTTOM,
				getSize: () => ({ width, height: 800 }),
				setSize: (_part, size) => { calls.push(`setSize ${size.width}`); if (applies) { width = size.width; } },
				isAuxiliaryBarMaximized: () => false,
				setAuxiliaryBarMaximized: maximized => { calls.push(`maximized ${maximized}`); return true; },
				mainContainerDimension: { width: 1200, height: 800 },
			}));
			instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({ getViewLocationById: () => ViewContainerLocation.AuxiliaryBar }));
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsEnabled]: true, [ChatConfiguration.ChatViewSessionsOrientation]: 'sideBySide' }));
			instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
				getActiveViewWithId: (<T>() => upcastPartial<ChatViewPane>({
					// With a stale stacked width, the Chat view is laid out side by side now
					getSessionsViewerOrientation: () => staleStackedBodyWidth === undefined ? AgentSessionsViewerOrientation.Stacked : AgentSessionsViewerOrientation.SideBySide,
					getLastDimensions: orientation => orientation === AgentSessionsViewerOrientation.Stacked ? { width: staleStackedBodyWidth ?? bodyWidth, height: 800 } : staleStackedBodyWidth === undefined ? undefined : { width: bodyWidth, height: 800 },
					updateConfiguredSessionsViewerOrientation: () => { },
				}) as T) as IViewsService['getActiveViewWithId'],
			}));
			instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({ getPartId: () => Parts.AUXILIARYBAR_PART }));
			await instantiationService.invokeFunction(accessor => new ShowAgentSessionsSidebar().run(accessor));
			// The calls besides leaving the maximized state, which the action does before it widens
			return calls.filter(call => call !== 'maximized false');
		};

		assert.deepStrictEqual({
			// The part fits 601 but its body of 591 does not fit 600: it widens past the part's chrome of 9
			narrowBody: await run(600, 591, true),
			// The window cannot give the part that width
			refused: await run(600, 591, false),
			wideEnough: await run(700, 691, true),
			// The chrome comes from the current layout, not from the other orientation's older one
			staleOtherOrientation: await run(700, 691, true, 591),
		}, {
			narrowBody: ['setSize 609'],
			refused: ['setSize 609', 'maximized true'],
			wideEnough: [],
			staleOtherOrientation: [],
		});
	});
});
