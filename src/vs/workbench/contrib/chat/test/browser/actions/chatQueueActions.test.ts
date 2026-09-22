/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { OS } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatAskInSideChatAction, ChatEditPendingRequestAction, ChatQueueMessageAction, ChatRemovePendingRequestAction, ChatSendPendingImmediatelyAction, ChatSteerWithMessageAction, registerChatQueueActions } from '../../../browser/actions/chatQueueActions.js';
import '../../../browser/chatEditing/chatEditingActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSideChatService } from '../../../common/chatSideChatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';

// Register actions once so the keybindings appear in KeybindingsRegistry.
registerChatQueueActions();

suite('Pending request editing actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const editRequestId = 'workbench.action.chat.editRequests';

	for (const editMode of ['inline', 'hover', 'input']) {
		test(`hides steering edit actions in ${editMode} mode without hiding other queue actions`, () => {
			const config = new TestConfigurationService({ [ChatConfiguration.EditRequests]: editMode });
			const contextKeyService = disposables.add(new ContextKeyService(config));
			const menuItems = MenuRegistry.getMenuItems(MenuId.ChatMessageTitle).filter(isIMenuItem);
			const visibleActions = (pendingKind: ChatRequestQueueKind | undefined) => {
				const context = contextKeyService.createOverlay([
					[ChatContextKeys.isRequest.key, true],
					[ChatContextKeys.isPendingRequest.key, pendingKind !== undefined],
					[ChatContextKeys.isEditableRequest.key, pendingKind !== ChatRequestQueueKind.Steering],
				]);
				const actions = menuItems.filter(item => context.contextMatchesRules(item.when)).map(item => item.command.id);
				return {
					edit: actions.filter(id => id === editRequestId || id === ChatEditPendingRequestAction.ID),
					remove: actions.includes(ChatRemovePendingRequestAction.ID),
					send: actions.includes(ChatSendPendingImmediatelyAction.ID),
				};
			};

			assert.deepStrictEqual({
				steering: visibleActions(ChatRequestQueueKind.Steering),
				queued: visibleActions(ChatRequestQueueKind.Queued),
				sent: visibleActions(undefined),
			}, {
				steering: { edit: [], remove: true, send: true },
				queued: { edit: [editMode === 'inline' ? ChatEditPendingRequestAction.ID : editRequestId], remove: true, send: true },
				sent: { edit: editMode === 'inline' ? [] : [editRequestId], remove: false, send: false },
			});
		});
	}

	test('guards command and keyboard editing while preserving queued and sent editing', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const sessionResource = URI.parse('test:///session');
		const editedRequests: string[] = [];
		let focusedRequest: IChatRequestViewModel | undefined;
		const widget = upcastPartial<IChatWidget>({
			startEditing: id => editedRequests.push(id),
			getFocus: () => focusedRequest,
		});
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: () => widget,
			lastFocusedWidget: widget,
		}));
		const pendingAction = new ChatEditPendingRequestAction();
		const editCommand = CommandsRegistry.getCommand(editRequestId);
		assert.ok(editCommand);

		for (const pendingKind of [ChatRequestQueueKind.Steering, ChatRequestQueueKind.Queued, undefined]) {
			focusedRequest = upcastPartial<IChatRequestViewModel>({
				id: pendingKind ?? 'sent',
				sessionResource,
				message: { text: 'request', parts: [] },
				pendingKind,
			});
			instantiationService.invokeFunction(accessor => pendingAction.run(accessor, focusedRequest));
			await instantiationService.invokeFunction(accessor => editCommand.handler(accessor, focusedRequest));
			await instantiationService.invokeFunction(accessor => editCommand.handler(accessor));
		}

		assert.deepStrictEqual(editedRequests, [
			ChatRequestQueueKind.Queued,
			ChatRequestQueueKind.Queued,
			ChatRequestQueueKind.Queued,
			'sent',
			'sent',
		]);
	});
});

suite('Queue/Steer keybinding resolution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function buildResolverForCommands(commandIds: string[]): KeybindingResolver {
		const items: ResolvedKeybindingItem[] = [];
		for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(OS)) {
			if (!item.command || !commandIds.includes(item.command) || !item.keybinding) {
				continue;
			}
			const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0];
			items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? undefined, true, null, false));
		}
		return new KeybindingResolver(items, [], () => { });
	}

	function lookupForConfig(defaultAction: 'steer' | 'queue', preparing = false) {
		const config = new TestConfigurationService({ [ChatConfiguration.RequestQueueingDefaultAction]: defaultAction });
		const ctxService = new ContextKeyService(config);
		// Simulate the chat input being focused with a request in progress, like the picker does.
		const overlay = ctxService.createOverlay([
			[ChatContextKeys.inputHasText.key, true],
			[ChatContextKeys.inChatInput.key, true],
			[ChatContextKeys.requestInProgress.key, true],
			[ChatContextKeys.transcriptProgressActive.key, preparing],
		]);
		const resolver = buildResolverForCommands([ChatQueueMessageAction.ID, ChatSteerWithMessageAction.ID]);
		return {
			result: {
				queue: resolver.lookupPrimaryKeybinding(ChatQueueMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null,
				steer: resolver.lookupPrimaryKeybinding(ChatSteerWithMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null,
			},
			dispose: () => ctxService.dispose(),
		};
	}

	test('with default=steer, Enter steers and Alt+Enter queues', () => {
		const { result, dispose } = lookupForConfig('steer');
		try {
			assert.deepStrictEqual(result, { queue: 'alt+Enter', steer: 'Enter' });
		} finally {
			dispose();
		}
	});

	test('with default=queue, Enter queues and Alt+Enter steers', () => {
		const { result, dispose } = lookupForConfig('queue');
		try {
			assert.deepStrictEqual(result, { queue: 'Enter', steer: 'alt+Enter' });
		} finally {
			dispose();
		}
	});

	test('preparation disables Enter and Alt+Enter queueing for either default', () => {
		for (const defaultAction of ['steer', 'queue'] as const) {
			const { result, dispose } = lookupForConfig(defaultAction, true);
			try {
				assert.deepStrictEqual(result, { queue: null, steer: null });
			} finally {
				dispose();
			}
		}
	});
});

suite('ChatSteerWithMessageAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function run(isHiddenFromTranscript: boolean, preparing = false, action = new ChatSteerWithMessageAction()): ChatRequestQueueKind | undefined {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let queue: ChatRequestQueueKind | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				isTranscriptProgressActive: preparing,
				getInput: () => 'follow up',
				acceptInput: async (_query, options) => {
					queue = options?.queue;
					return undefined;
				},
				viewModel: upcastPartial<IChatViewModel>({
					model: upcastPartial<IChatModel>({
						requestInProgress: constObservable(true),
						lastRequest: upcastPartial<IChatRequestModel>({ isHiddenFromTranscript }),
					}),
				}),
			}),
		}));

		instantiationService.invokeFunction(accessor => action.run(accessor));
		return queue;
	}

	test('queues behind a hidden active request instead of steering it', () => {
		assert.deepStrictEqual({
			hidden: run(true),
			visible: run(false),
		}, {
			hidden: ChatRequestQueueKind.Queued,
			visible: ChatRequestQueueKind.Steering,
		});
	});

	test('direct queue and steer commands cannot dispatch during preparation', () => {
		assert.deepStrictEqual({
			steer: run(false, true),
			queue: run(false, true, new ChatQueueMessageAction()),
		}, { steer: undefined, queue: undefined });
	});
});

suite('ChatAskInSideChatAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { canAsk?: boolean; askFails?: boolean; preparing?: boolean } = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('test:///chat/source');

		let input = 'what about this?';
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				isTranscriptProgressActive: options.preparing,
				domNode: getActiveDocument().createElement('div'),
				inputEditor: { getDomNode: () => null } as ICodeEditor,
				getInput: () => input,
				setInput: (value?: string) => { input = value ?? ''; },
				viewModel: upcastPartial<IChatViewModel>({ model: upcastPartial<IChatModel>({ sessionResource }) }),
			}),
		}));

		const asked: string[] = [];
		instantiationService.stub(IChatSideChatService, upcastPartial<IChatSideChatService>({
			canAskInSideChat: () => options.canAsk ?? true,
			askInSideChat: async (resource, query) => {
				if (options.askFails) {
					asked.push('failed');
					throw new Error('nope');
				}
				asked.push(`${resource.toString()}:${query}`);
			},
		}));
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ILogService, new NullLogService());

		const action = new ChatAskInSideChatAction();
		return {
			run: () => instantiationService.invokeFunction(accessor => action.run(accessor)),
			asked,
			sessionResource,
			getInput: () => input,
		};
	}

	test('delegates the composed message to the side chat service and clears the input', async () => {
		const { run, asked, sessionResource, getInput } = setup();

		await run();

		assert.deepStrictEqual({ asked, input: getInput() }, {
			asked: [`${sessionResource.toString()}:what about this?`],
			input: '',
		});
	});

	test('preparation preserves the draft without starting a side chat', async () => {
		const { run, asked, getInput } = setup({ preparing: true });
		await run();
		assert.deepStrictEqual({ asked, input: getInput() }, { asked: [], input: 'what about this?' });
	});

	test('restores the composed message when the side chat cannot be created', async () => {
		const { run, asked, getInput } = setup({ askFails: true });

		await run();

		assert.deepStrictEqual({ asked, input: getInput() }, {
			asked: ['failed'],
			input: 'what about this?',
		});
	});

	test('does nothing but warn when no provider supports the conversation', async () => {
		const { run, asked, getInput } = setup({ canAsk: false });

		await run();

		assert.deepStrictEqual({ asked, input: getInput() }, {
			asked: [],
			input: 'what about this?',
		});
	});
});
