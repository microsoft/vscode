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
import { ChatAskInSideChatAction, ChatQueueMessageAction, ChatSteerWithMessageAction, registerChatQueueActions } from '../../../browser/actions/chatQueueActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSideChatService } from '../../../common/chatSideChatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';

// Register actions once so the keybindings appear in KeybindingsRegistry.
registerChatQueueActions();

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

	function lookupForConfig(defaultAction: 'steer' | 'queue') {
		const config = new TestConfigurationService({ [ChatConfiguration.RequestQueueingDefaultAction]: defaultAction });
		const ctxService = new ContextKeyService(config);
		// Simulate the chat input being focused with a request in progress, like the picker does.
		const overlay = ctxService.createOverlay([
			[ChatContextKeys.inputHasText.key, true],
			[ChatContextKeys.inChatInput.key, true],
			[ChatContextKeys.requestInProgress.key, true],
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
});

suite('ChatSteerWithMessageAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function run(isHiddenFromTranscript: boolean): ChatRequestQueueKind | undefined {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let queue: ChatRequestQueueKind | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
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

		const action = new ChatSteerWithMessageAction();
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
});

suite('ChatAskInSideChatAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { canAsk?: boolean; askFails?: boolean } = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('test:///chat/source');

		let input = 'what about this?';
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
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
