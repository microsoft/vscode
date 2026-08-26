/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isMacintosh, OS } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { RenameAgentSessionAction } from '../../../browser/agentSessions/agentSessionsActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('RenameAgentSessionAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const actionRegistration = registerAction2(RenameAgentSessionAction);

	suiteTeardown(() => actionRegistration.dispose());

	function buildResolver(): KeybindingResolver {
		const items: ResolvedKeybindingItem[] = [];
		for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(OS)) {
			if (item.command !== AGENT_SESSION_RENAME_ACTION_ID || !item.keybinding) {
				continue;
			}
			const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0];
			items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? undefined, true, null, false));
		}
		return new KeybindingResolver(items, [], () => { });
	}

	test('resolves the rename keybinding in the sessions list and focused regular chats', () => {
		const store = disposables.add(new DisposableStore());
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const resolver = buildResolver();
		const expectedKeybinding = isMacintosh ? 'Enter' : 'F2';
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
			sessionsList: expectedKeybinding,
			panelTranscript: expectedKeybinding,
			panelInput: expectedKeybinding,
			editorTranscript: expectedKeybinding,
			editorInput: expectedKeybinding,
			agentHostEditorInput: expectedKeybinding,
			emptyAgentHostEditorInput: null,
			renameableContributedInput: expectedKeybinding,
			cloudEditorInput: null,
			quickChatInput: null,
			sessionsWindowInput: null,
			outsideChat: null,
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
});
