/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OS } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import {
	ChatQueueMessageAction,
	ChatSteerWithMessageAction,
	registerChatQueueActions,
	ChatMovePendingRequestUpAction,
	ChatMovePendingRequestDownAction,
	ChatMovePendingRequestToTopAction,
	ChatMovePendingRequestToBottomAction
} from '../../../browser/actions/chatQueueActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService, ChatRequestQueueKind } from '../../../common/chatService/chatService.js';
import { IChatWidgetService } from '../../../browser/chat.js';

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

suite('Queue priority actions execution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let chatServiceMock: any;
	let widgetServiceMock: any;
	let lastReordered: { requestId: string; kind: ChatRequestQueueKind }[] | undefined;

	const sessionResource = URI.parse('vscode-chat-session://local/session1');

	setup(() => {
		instantiationService = new TestInstantiationService();
		lastReordered = undefined;

		chatServiceMock = {
			setPendingRequests: (res: URI, requests: { requestId: string; kind: ChatRequestQueueKind }[]) => {
				lastReordered = requests;
			}
		};

		widgetServiceMock = {
			getWidgetBySessionResource: (res: URI) => {
				const widget: any = {
					viewModel: {
						model: {
							sessionResource,
							getPendingRequests: () => [
								{ request: { id: 'req1' }, kind: ChatRequestQueueKind.Queued },
								{ request: { id: 'req2' }, kind: ChatRequestQueueKind.Queued },
								{ request: { id: 'req3' }, kind: ChatRequestQueueKind.Steering }
							]
						}
					}
				};
				return widget;
			}
		};

		instantiationService.stub(IChatService, chatServiceMock);
		instantiationService.stub(IChatWidgetService, widgetServiceMock);
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('ChatMovePendingRequestUpAction moves request up', () => {
		const action = new ChatMovePendingRequestUpAction();
		const context = {
			id: 'req2',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.ok(lastReordered);
		assert.strictEqual(lastReordered.length, 3);
		assert.strictEqual(lastReordered[0].requestId, 'req2');
		assert.strictEqual(lastReordered[1].requestId, 'req1');
		assert.strictEqual(lastReordered[2].requestId, 'req3');
	});

	test('ChatMovePendingRequestDownAction moves request down', () => {
		const action = new ChatMovePendingRequestDownAction();
		const context = {
			id: 'req2',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.ok(lastReordered);
		assert.strictEqual(lastReordered.length, 3);
		assert.strictEqual(lastReordered[0].requestId, 'req1');
		assert.strictEqual(lastReordered[1].requestId, 'req3');
		assert.strictEqual(lastReordered[2].requestId, 'req2');
	});

	test('ChatMovePendingRequestToTopAction moves request to top', () => {
		const action = new ChatMovePendingRequestToTopAction();
		const context = {
			id: 'req3',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Steering,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.ok(lastReordered);
		assert.strictEqual(lastReordered.length, 3);
		assert.strictEqual(lastReordered[0].requestId, 'req3');
		assert.strictEqual(lastReordered[1].requestId, 'req1');
		assert.strictEqual(lastReordered[2].requestId, 'req2');
	});

	test('ChatMovePendingRequestToBottomAction moves request to bottom', () => {
		const action = new ChatMovePendingRequestToBottomAction();
		const context = {
			id: 'req1',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.ok(lastReordered);
		assert.strictEqual(lastReordered.length, 3);
		assert.strictEqual(lastReordered[0].requestId, 'req2');
		assert.strictEqual(lastReordered[1].requestId, 'req3');
		assert.strictEqual(lastReordered[2].requestId, 'req1');
	});

	test('ChatMovePendingRequestUpAction on first item is a no-op', () => {
		const action = new ChatMovePendingRequestUpAction();
		const context = {
			id: 'req1',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});

	test('ChatMovePendingRequestDownAction on last item is a no-op', () => {
		const action = new ChatMovePendingRequestDownAction();
		const context = {
			id: 'req3',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Steering,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});

	test('ChatMovePendingRequestToTopAction on first item is a no-op', () => {
		const action = new ChatMovePendingRequestToTopAction();
		const context = {
			id: 'req1',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});

	test('ChatMovePendingRequestToBottomAction on last item is a no-op', () => {
		const action = new ChatMovePendingRequestToBottomAction();
		const context = {
			id: 'req3',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Steering,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});

	test('getReorderContext returns undefined when widget/model is not found', () => {
		// Override the widget service to return undefined for this session
		instantiationService.stub(IChatWidgetService, {
			getWidgetBySessionResource: (_res: URI) => undefined
		});

		const action = new ChatMovePendingRequestUpAction();
		const context = {
			id: 'req2',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});

	test('getReorderContext returns undefined when request id is not in getPendingRequests', () => {
		const action = new ChatMovePendingRequestUpAction();
		const context = {
			id: 'req-nonexistent',
			message: 'test',
			pendingKind: ChatRequestQueueKind.Queued,
			sessionResource
		};

		instantiationService.invokeFunction(accessor => {
			action.run(accessor, context);
		});

		assert.strictEqual(lastReordered, undefined);
	});
});

