/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalChatService } from '../../browser/terminalChatService.js';

/**
 * Peeks at the protected `_size` counter on a base Emitter to assert listener counts in tests.
 * The Emitter tracks this internally for leak detection, and it is the same counter that fires
 * the "potential listener LEAK detected" warning we are guarding against here.
 */
function listenerCount(emitter: Emitter<any>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
}

suite('TerminalChatService', () => {
	const store = new DisposableStore();
	let service: TerminalChatService;
	let onDidDisposeSessionEmitter: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;

	setup(() => {
		onDidDisposeSessionEmitter = store.add(new Emitter());

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidChangeInstances = Event.None;
			override instances: readonly ITerminalInstance[] = [];
			override foregroundInstances: readonly ITerminalInstance[] = [];
			override whenConnected = Promise.resolve();
		});
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override onDidDisposeSession = onDidDisposeSessionEmitter.event;
		});

		service = store.add(instantiationService.createInstance(TerminalChatService));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registerTerminalInstanceWithToolSession does not accumulate onDidDisposeSession listeners when re-registering the same instance (#309906)', () => {
		const onInstanceDisposed = store.add(new Emitter<ITerminalInstance>());
		const instance = { onDisposed: onInstanceDisposed.event, shellLaunchConfig: {}, persistentProcessId: undefined, instanceId: 1 } as unknown as ITerminalInstance;

		// Simulate the real-world scenario: the RunInTerminalTool generates a fresh
		// `terminalToolSessionId` (via generateUuid()) per invocation and re-registers the
		// same foreground terminal instance. Before the fix, each call added another
		// listener to `chatService.onDidDisposeSession`, eventually breaching the leak
		// threshold.
		const registrations = 50;
		const initialListenerCount = listenerCount(onDidDisposeSessionEmitter);
		for (let i = 0; i < registrations; i++) {
			service.registerTerminalInstanceWithToolSession(`tool-session-${i}`, instance);
		}

		const addedListeners = listenerCount(onDidDisposeSessionEmitter) - initialListenerCount;

		// After the fix at most one listener should be attached per instance (not one per call).
		assert.ok(
			addedListeners <= 1,
			`Expected at most 1 listener on onDidDisposeSession after ${registrations} re-registrations, saw ${addedListeners}`
		);

		// Only the latest tool-session-id should remain mapped to the instance; stale
		// mappings must have been cleaned up to prevent orphan entries from surviving.
		assert.strictEqual(
			service.getToolSessionIdForInstance(instance),
			`tool-session-${registrations - 1}`
		);
	});

	test('registerTerminalInstanceWithToolSession is a no-op when the same tool session id is re-registered', () => {
		const onInstanceDisposed = store.add(new Emitter<ITerminalInstance>());
		const instance = { onDisposed: onInstanceDisposed.event, shellLaunchConfig: {}, persistentProcessId: undefined, instanceId: 2 } as unknown as ITerminalInstance;

		service.registerTerminalInstanceWithToolSession('tool-session-a', instance);
		const listenersAfterFirst = listenerCount(onDidDisposeSessionEmitter);

		service.registerTerminalInstanceWithToolSession('tool-session-a', instance);
		const listenersAfterSecond = listenerCount(onDidDisposeSessionEmitter);

		assert.strictEqual(listenersAfterSecond, listenersAfterFirst, 're-registering the same (instance, id) pair should not add a new listener');
		assert.strictEqual(service.getToolSessionIdForInstance(instance), 'tool-session-a');
	});
});
