/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType, StateAction } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { RootState, TerminalClaimKind, type TerminalState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import type { CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { ActionEnvelope, IRootConfigChangedAction, SessionAction, TerminalAction, INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceWriteParams, ResourceWriteResult } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';

import { AgentHostPty } from '../../browser/agentHostPty.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { hasKey } from '../../../../../base/common/types.js';

// ---- Mock IAgentConnection --------------------------------------------------

class MockAgentConnection implements IAgentConnection {
	declare readonly _serviceBrand: undefined;
	readonly clientId = 'test-client';

	private _seq = 0;
	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	readonly onDidAction: Event<ActionEnvelope> = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	readonly onDidNotification: Event<INotification> = this._onDidNotification.event;

	readonly dispatchedActions: (SessionAction | TerminalAction | IRootConfigChangedAction)[] = [];
	readonly createdTerminals: CreateTerminalParams[] = [];
	readonly disposedTerminals: URI[] = [];
	readonly subscribedResources: URI[] = [];

	private _terminalState: TerminalState = {
		title: 'Test Terminal',
		content: [],
		claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
	};

	constructor(initialState?: Partial<TerminalState>) {
		if (initialState) {
			this._terminalState = { ...this._terminalState, ...initialState };
		}
	}

	nextClientSeq(): number {
		return ++this._seq;
	}

	async createTerminal(params: CreateTerminalParams): Promise<void> {
		this.createdTerminals.push(params);
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		this.disposedTerminals.push(terminal);
	}

	/** Simulate the server sending an action to the client */
	fireAction(action: StateAction, serverSeq = 1): void {
		this._onDidAction.fire({ action, serverSeq, origin: { clientId: 'server', clientSeq: 0 } });
	}

	// ---- Unused IAgentService methods (stubs) -----
	async authenticate(_params: AuthenticateParams): Promise<AuthenticateResult> { return { authenticated: true }; }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return []; }
	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> { return URI.parse('copilot:///test'); }
	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> { return { schema: { type: 'object', properties: {} }, values: {} }; }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> { return { items: [] }; }
	async disposeSession(_session: URI): Promise<void> { }
	async shutdown(): Promise<void> { }
	async resourceList(_uri: URI): Promise<ResourceListResult> { return { entries: [] }; }
	async resourceRead(_uri: URI): Promise<ResourceReadResult> { return { data: '', encoding: 'utf-8' } as ResourceReadResult; }
	async resourceWrite(_params: ResourceWriteParams): Promise<ResourceWriteResult> { return {}; }
	async resourceCopy(_params: ResourceCopyParams): Promise<ResourceCopyResult> { return {}; }
	async resourceDelete(_params: ResourceDeleteParams): Promise<ResourceDeleteResult> { return {}; }
	async resourceMove(_params: ResourceMoveParams): Promise<ResourceMoveResult> { return {}; }

	// ---- IAgentConnection new API (stubs for tests) -----
	readonly rootState: IAgentSubscription<RootState> = {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
	getSubscription<T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> {
		const onDidChange = new Emitter<TerminalState>();
		const onWillApplyAction = new Emitter<ActionEnvelope>();
		const onDidApplyAction = new Emitter<ActionEnvelope>();
		const sub: IAgentSubscription<TerminalState> = {
			value: this._terminalState,
			verifiedValue: this._terminalState,
			onDidChange: onDidChange.event,
			onWillApplyAction: onWillApplyAction.event,
			onDidApplyAction: onDidApplyAction.event,
		};
		// Wire onDidAction to the subscription's events
		const listener = this._onDidAction.event(envelope => {
			if (hasKey(envelope.action, { terminal: true }) && (envelope.action as { terminal: string }).terminal === _resource.toString()) {
				onWillApplyAction.fire(envelope);
				onDidApplyAction.fire(envelope);
			}
		});
		return {
			object: sub as IAgentSubscription<T>,
			dispose: () => { listener.dispose(); onDidChange.dispose(); onWillApplyAction.dispose(); onDidApplyAction.dispose(); },
		};
	}
	getSubscriptionUnmanaged<T>(_kind: StateComponents, _resource: URI): IAgentSubscription<T> | undefined {
		return undefined;
	}
	dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push(action);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
	}
}

// ---- Tests ------------------------------------------------------------------

suite('AgentHostPty', () => {

	const disposables = new DisposableStore();
	const terminalUri = URI.parse('agenthost-terminal:///test-term-1');

	setup(() => {
		disposables.clear();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('start() creates terminal and subscribes', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, { name: 'test' }));

		const result = await pty.start();

		assert.strictEqual(result, undefined, 'start() should succeed');
		assert.strictEqual(conn.createdTerminals.length, 1);
		assert.strictEqual(conn.createdTerminals[0].terminal, terminalUri.toString());
		assert.strictEqual(conn.createdTerminals[0].name, 'test');
		assert.deepStrictEqual(conn.createdTerminals[0].claim, { kind: TerminalClaimKind.Client, clientId: 'test-client' });
	});

	test('start() fires onProcessReady', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		let ready = false;
		disposables.add(pty.onProcessReady!(() => { ready = true; }));

		await pty.start();
		assert.ok(ready);
	});

	test('replays existing content from snapshot', async () => {
		const conn = new MockAgentConnection({ content: [{ type: 'unclassified', value: 'existing output\n' }] });
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		assert.deepStrictEqual(dataReceived, ['existing output\n']);
	});

	test('input() dispatches terminal/input action', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		await pty.start();
		pty.input('hello');

		// Wait for the async barrier
		await new Promise(resolve => setTimeout(resolve, 10));

		const inputActions = conn.dispatchedActions.filter(a => a.type === ActionType.TerminalInput);
		assert.strictEqual(inputActions.length, 1);
		assert.strictEqual((inputActions[0] as { data: string }).data, 'hello');
	});

	test('resize() dispatches terminal/resized action', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		await pty.start();
		pty.resize(120, 40);

		await new Promise(resolve => setTimeout(resolve, 10));

		const resizeActions = conn.dispatchedActions.filter(a => a.type === ActionType.TerminalResized);
		assert.strictEqual(resizeActions.length, 1);
		assert.strictEqual((resizeActions[0] as { cols: number; rows: number }).cols, 120);
		assert.strictEqual((resizeActions[0] as { cols: number; rows: number }).rows, 40);
	});

	test('resize() skips duplicate dimensions', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		await pty.start();
		pty.resize(80, 24);
		pty.resize(80, 24); // duplicate

		await new Promise(resolve => setTimeout(resolve, 10));

		const resizeActions = conn.dispatchedActions.filter(a => a.type === ActionType.TerminalResized);
		assert.strictEqual(resizeActions.length, 1);
	});

	test('terminal/data action fires onProcessData', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		conn.fireAction({ type: ActionType.TerminalData, terminal: terminalUri.toString(), data: 'hello world\r\n' });

		assert.deepStrictEqual(dataReceived, ['existing output\n' /* skip replay since content is '' */, 'hello world\r\n'].filter(x => x !== 'existing output\n'));
		// Since initial content is empty, only the streamed data should be received
		assert.deepStrictEqual(dataReceived, ['hello world\r\n']);
	});

	test('terminal/exited action fires onProcessExit', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		let exitCode: number | undefined;
		disposables.add(pty.onProcessExit!(e => { exitCode = e; }));

		await pty.start();
		conn.fireAction({ type: ActionType.TerminalExited, terminal: terminalUri.toString(), exitCode: 42 });

		assert.strictEqual(exitCode, 42);
	});

	test('terminal/cwdChanged updates cwd property', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		await pty.start();
		conn.fireAction({ type: ActionType.TerminalCwdChanged, terminal: terminalUri.toString(), cwd: '/home/user/project' });

		const cwd = await pty.getCwd();
		assert.strictEqual(cwd, '/home/user/project');
	});

	test('terminal/titleChanged updates title property', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		let changedTitle = '';
		disposables.add(pty.onDidChangeProperty!(e => {
			if (e.type === 'title') {
				changedTitle = e.value as string;
			}
		}));

		await pty.start();
		conn.fireAction({ type: ActionType.TerminalTitleChanged, terminal: terminalUri.toString(), title: 'npm test' });

		assert.strictEqual(changedTitle, 'npm test');
	});

	test('ignores actions for other terminals', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		conn.fireAction({ type: ActionType.TerminalData, terminal: 'agenthost-terminal:///other', data: 'should not appear' });

		assert.deepStrictEqual(dataReceived, []);
	});

	test('shutdown() disposes terminal and unsubscribes', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		let exitFired = false;
		disposables.add(pty.onProcessExit!(() => { exitFired = true; }));

		await pty.start();
		pty.shutdown(false);

		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(conn.disposedTerminals.length, 1);
		assert.strictEqual(conn.disposedTerminals[0].toString(), terminalUri.toString());
		assert.ok(exitFired);
	});

	test('shouldPersist is false', () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
		assert.strictEqual(pty.shouldPersist, false);
	});

	test('getInitialCwd returns cwd from snapshot', async () => {
		const conn = new MockAgentConnection({ cwd: '/home/user' });
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));

		await pty.start();
		const cwd = await pty.getInitialCwd();
		assert.strictEqual(cwd, '/home/user');
	});

	test('reconnect() re-subscribes with new connection and replays content', async () => {
		const conn1 = new MockAgentConnection({ content: [{ type: 'unclassified', value: 'old output\n' }] });
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));

		await pty.start();

		// Create a new connection with different content (simulating server-side changes during disconnect)
		const conn2 = new MockAgentConnection({
			content: [{ type: 'unclassified', value: 'old output\nnew output after reconnect\n' }],
			cwd: '/home/reconnected',
			title: 'Reconnected Terminal',
		});
		disposables.add(conn2);

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		const result = await pty.reconnect(conn2);

		assert.strictEqual(result, true, 'reconnect() should succeed');
		// Should have clear sequence + replayed content
		assert.ok(dataReceived.some(d => d.includes('\x1b[2J')), 'should clear buffer before replay');
		assert.ok(dataReceived.some(d => d.includes('new output after reconnect')), 'should replay new content');

		const cwd = await pty.getCwd();
		assert.strictEqual(cwd, '/home/reconnected');
	});

	test('reconnect() streams new actions from new connection', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
		await pty.start();

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.reconnect(conn2);
		dataReceived.length = 0; // clear replay data

		// New actions from conn2 should be received
		conn2.fireAction({ type: ActionType.TerminalData, terminal: terminalUri.toString(), data: 'post-reconnect data' });

		assert.deepStrictEqual(dataReceived, ['post-reconnect data']);

		// Old connection actions should NOT be received
		conn1.fireAction({ type: ActionType.TerminalData, terminal: terminalUri.toString(), data: 'stale data' });
		assert.deepStrictEqual(dataReceived, ['post-reconnect data']);
	});

	test('reconnect() times out when subscription never hydrates', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
		await pty.start();

		// Create a connection whose subscription never fires onDidChange
		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		// Override getSubscription to return a subscription that never hydrates
		conn2.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => {
			const onDidChange = new Emitter<TerminalState>();
			const onDidApplyAction = new Emitter<ActionEnvelope>();
			disposables.add(onDidChange);
			disposables.add(onDidApplyAction);
			const sub: IAgentSubscription<TerminalState> = {
				value: undefined, // never hydrated
				verifiedValue: undefined,
				onDidChange: onDidChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: onDidApplyAction.event,
			};
			return {
				object: sub as IAgentSubscription<T>,
				dispose: () => { onDidChange.dispose(); onDidApplyAction.dispose(); },
			};
		};

		// Suppress the expected console.warn from reconnect failure
		const origWarn = console.warn;
		console.warn = () => { };
		try {
			const result = await pty.reconnect(conn2);
			assert.strictEqual(result, false, 'reconnect() should fail on timeout');
		} finally {
			console.warn = origWarn;
		}
	}).timeout(15000); // Allow for the 10s hydration timeout

	test('reconnect() dispatches input to new connection', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
		await pty.start();

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		await pty.reconnect(conn2);

		pty.input('after reconnect');
		await new Promise(resolve => setTimeout(resolve, 10));

		const inputActions = conn2.dispatchedActions.filter(a => a.type === ActionType.TerminalInput);
		assert.strictEqual(inputActions.length, 1);
		assert.strictEqual((inputActions[0] as { data: string }).data, 'after reconnect');

		// conn1 should not have received the input
		const oldInputActions = conn1.dispatchedActions.filter(a => a.type === ActionType.TerminalInput);
		assert.strictEqual(oldInputActions.length, 0);
	});
});
