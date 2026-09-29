/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { TerminalClaimKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ClientAnnotationsAction, IRootConfigChangedAction, SessionAction, TerminalAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IShellLaunchConfig, ITerminalChildProcess } from '../../../../../platform/terminal/common/terminal.js';
import { AgentHostPty } from '../../browser/agentHostPty.js';
import { AgentHostTerminalService } from '../../browser/agentHostTerminalService.js';
import { ICreateTerminalOptions, ITerminalChatService, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { ITerminalProfileService } from '../../common/terminal.js';

class TestTerminalInstance extends mock<ITerminalInstance>() {
	override readonly store = new DisposableStore();
	private readonly _onDisposed = this.store.add(new Emitter<ITerminalInstance>());
	override readonly onDisposed = this._onDisposed.event;
	override readonly onWillData = Event.None;
	private _isDisposed = false;
	override get isDisposed(): boolean { return this._isDisposed; }

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._onDisposed.fire(this);
		this.store.dispose();
	}
}

class TestTerminalService extends mock<ITerminalService>() {
	private readonly _ptyFactories: NonNullable<IShellLaunchConfig['customPtyImplementation']>[] = [];
	failNextCreation = false;
	disposeInstanceOnCreation = false;

	constructor(private readonly _store: Pick<DisposableStore, 'add'>) {
		super();
	}

	override async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		const config = options?.config;
		assert.ok(config);
		const factory = (config as IShellLaunchConfig).customPtyImplementation;
		assert.ok(factory);
		this._ptyFactories.push(factory);
		if (this.failNextCreation) {
			this.failNextCreation = false;
			throw new Error('terminal creation failed');
		}
		const instance = this._store.add(new TestTerminalInstance());
		if (this.disposeInstanceOnCreation) {
			instance.dispose();
		}
		return instance;
	}

	createPty(index = this._ptyFactories.length - 1): AgentHostPty {
		const pty: ITerminalChildProcess = this._ptyFactories[index](1, 80, 30);
		assert.ok(pty instanceof AgentHostPty);
		return pty;
	}
}

class TestAgentConnection extends mock<IAgentConnection>() {
	override readonly clientId = 'test-client';
	createTerminalCallCount = 0;
	disposeTerminalCallCount = 0;
	disposedSubscriptions = 0;
	readonly dispatchedActions: (SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction)[] = [];

	override async createTerminal(): Promise<void> {
		this.createTerminalCallCount++;
	}

	override async disposeTerminal(): Promise<void> {
		this.disposeTerminalCallCount++;
	}

	override dispatch(_channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push(action);
	}

	override getSubscription<T>(): IReference<IAgentSubscription<T>> {
		return {
			object: {
				value: { title: 'Test Terminal', content: [], claim: { kind: TerminalClaimKind.Client, clientId: this.clientId } },
				verifiedValue: undefined,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			} as IAgentSubscription<T>,
			dispose: () => { this.disposedSubscriptions++; },
		};
	}
}

suite('AgentHostTerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let terminalService: TestTerminalService;
	let connection: TestAgentConnection;
	let service: AgentHostTerminalService;

	setup(() => {
		terminalService = new TestTerminalService(store);
		connection = new TestAgentConnection();
		service = store.add(new AgentHostTerminalService(
			terminalService,
			new class extends mock<ITerminalChatService>() {
				override registerAhpCommandSource() { return Disposable.None; }
				override registerTerminalInstanceWithToolSession() { }
			},
			new class extends mock<ITerminalProfileService>() { },
			new class extends mock<IQuickInputService>() { },
			new class extends NullLogService { readonly _logBrand = undefined; },
		));
	});

	test('instance disposal locally disposes a created PTY without deleting the host terminal', async () => {
		const instance = await service.createTerminal(connection);
		const pty = terminalService.createPty();
		await pty.start();
		assert.strictEqual(connection.disposedSubscriptions, 0, 'the subscription should be live while the instance is live');

		instance.dispose();
		instance.dispose();
		pty.input('ignored');
		await Promise.resolve();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			createTerminalCallCount: connection.createTerminalCallCount,
			disposedSubscriptions: connection.disposedSubscriptions,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			dispatchedActions: connection.dispatchedActions,
			reconnectResult,
		}, {
			createTerminalCallCount: 1,
			disposedSubscriptions: 1,
			hostDisposeCallCount: 0,
			dispatchedActions: [{ type: ActionType.TerminalResized, cols: 80, rows: 30 }],
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('a PTY created after its terminal instance was disposed is immediately disposed', async () => {
		const instance = await service.createTerminal(connection);

		instance.dispose();
		const pty = terminalService.createPty();
		const startResult = await pty.start();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			startResult,
			createTerminalCallCount: connection.createTerminalCallCount,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			startResult: undefined,
			createTerminalCallCount: 0,
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('instance disposal locally disposes a revived attach-only PTY and allows revival again', async () => {
		const terminalUri = URI.parse('agenthost-terminal:/tool-terminal');
		const instance = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		const pty = terminalService.createPty();
		await pty.start();
		assert.strictEqual(connection.disposedSubscriptions, 0, 'the subscription should be live while the instance is live');

		instance.dispose();
		instance.dispose();
		const replacement = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			createTerminalCallCount: connection.createTerminalCallCount,
			disposedSubscriptions: connection.disposedSubscriptions,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			createdReplacement: replacement !== instance,
			reconnectResult,
		}, {
			createTerminalCallCount: 0,
			disposedSubscriptions: 1,
			hostDisposeCallCount: 0,
			createdReplacement: true,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('a late revived PTY cannot replace the current PTY registration', async () => {
		const terminalUri = URI.parse('agenthost-terminal:/tool-terminal');
		const oldInstance = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		oldInstance.dispose();
		const replacement = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		terminalService.createPty(1);
		terminalService.createPty(0);

		replacement.dispose();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('a failed terminal creation disposes the PTY registration', async () => {
		terminalService.failNextCreation = true;
		await assert.rejects(() => service.createTerminal(connection));

		const pty = terminalService.createPty();
		const startResult = await pty.start();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			startResult,
			createTerminalCallCount: connection.createTerminalCallCount,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			startResult: undefined,
			createTerminalCallCount: 0,
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('cleanup runs immediately for an instance already disposed when creation resolves', async () => {
		terminalService.disposeInstanceOnCreation = true;
		await service.createTerminal(connection);

		const pty = terminalService.createPty();
		const startResult = await pty.start();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			startResult,
			createTerminalCallCount: connection.createTerminalCallCount,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			startResult: undefined,
			createTerminalCallCount: 0,
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});
});
