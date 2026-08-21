/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
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

	constructor(private readonly _store: DisposableStore) {
		super();
	}

	override async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		const config = options?.config;
		assert.ok(config);
		const factory = (config as IShellLaunchConfig).customPtyImplementation;
		assert.ok(factory);
		this._ptyFactories.push(factory);
		return this._store.add(new TestTerminalInstance());
	}

	createPty(index = this._ptyFactories.length - 1): AgentHostPty {
		const pty: ITerminalChildProcess = this._ptyFactories[index](1, 80, 30);
		assert.ok(pty instanceof AgentHostPty);
		return pty;
	}
}

class TestAgentConnection extends mock<IAgentConnection>() {
	override readonly clientId = 'test-client';
	disposeTerminalCallCount = 0;

	override async disposeTerminal(): Promise<void> {
		this.disposeTerminalCallCount++;
	}
}

suite('AgentHostTerminalService', () => {
	const store = new DisposableStore();
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
		));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('instance disposal locally disposes a created PTY without deleting the host terminal', async () => {
		const instance = await service.createTerminal(connection);
		const pty = terminalService.createPty();
		let disposeCallCount = 0;
		const originalDispose = pty.dispose.bind(pty);
		pty.dispose = () => {
			disposeCallCount++;
			originalDispose();
		};

		instance.dispose();
		instance.dispose();
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			disposeCallCount,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			disposeCallCount: 1,
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('a PTY created after its terminal instance was disposed is immediately disposed', async () => {
		const instance = await service.createTerminal(connection);

		instance.dispose();
		const pty = terminalService.createPty();
		pty.input('ignored');
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			reconnectResult,
		}, {
			hostDisposeCallCount: 0,
			reconnectResult: { recovered: 0, total: 0 },
		});
	});

	test('instance disposal locally disposes a revived attach-only PTY and allows revival again', async () => {
		const terminalUri = URI.parse('agenthost-terminal:/tool-terminal');
		const instance = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		const pty = terminalService.createPty();
		let disposeCallCount = 0;
		const originalDispose = pty.dispose.bind(pty);
		pty.dispose = () => {
			disposeCallCount++;
			originalDispose();
		};

		instance.dispose();
		instance.dispose();
		const replacement = await service.reviveTerminal(connection, terminalUri, 'tool-session');
		const reconnectResult = await service.reconnectTerminals(connection, connection.clientId);

		assert.deepStrictEqual({
			disposeCallCount,
			hostDisposeCallCount: connection.disposeTerminalCallCount,
			createdReplacement: replacement !== instance,
			reconnectResult,
		}, {
			disposeCallCount: 1,
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
});
