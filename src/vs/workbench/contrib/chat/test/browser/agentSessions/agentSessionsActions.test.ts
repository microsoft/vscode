/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isMacintosh, OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../../../base/common/keybindings.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { RawWorkbenchListFocusContextKey } from '../../../../../../platform/list/browser/listService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ArchiveAgentSessionAction, MarkAgentSessionReadAction, MarkAgentSessionUnreadAction, RenameAgentSessionAction } from '../../../browser/agentSessions/agentSessionsActions.js';
import { AgentSessionsControl } from '../../../browser/agentSessions/agentSessionsControl.js';
import { ChatViewPane } from '../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { AGENT_SESSION_MARK_READ_ACTION_ID, AGENT_SESSION_MARK_UNREAD_ACTION_ID } from '../../../../../common/chatSessionCommands.js';

suite('AgentSessionsActions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const actionRegistration = registerAction2(RenameAgentSessionAction);

	suiteTeardown(() => actionRegistration.dispose());

	test('scopes read and unread shortcuts to the editor Sessions list on every platform', () => {
		const registrations = new DisposableStore();
		try {
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
		} finally {
			registrations.dispose();
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
});
