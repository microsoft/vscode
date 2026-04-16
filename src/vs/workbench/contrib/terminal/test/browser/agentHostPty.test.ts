/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType, IStateAction } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IRootState, TerminalClaimKind, type ITerminalState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ICreateTerminalParams, IResolveSessionConfigResult, ISessionConfigCompletionsResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { IActionEnvelope, ISessionAction, ITerminalAction, INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';

import { AgentHostPty } from '../../browser/agentHostPty.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { hasKey } from '../../../../../base/common/types.js';

// ---- Mock IAgentConnection --------------------------------------------------

class MockAgentConnection implements IAgentConnection {
	declare readonly _serviceBrand: undefined;
	readonly clientId = 'test-client';

	private _seq = 0;
	private readonly _onDidAction = new Emitter<IActionEnvelope>();
	readonly onDidAction: Event<IActionEnvelope> = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	readonly onDidNotification: Event<INotification> = this._onDidNotification.event;

	readonly dispatchedActions: (ISessionAction | ITerminalAction)[] = [];
	readonly createdTerminals: ICreateTerminalParams[] = [];
	readonly disposedTerminals: URI[] = [];
	readonly subscribedResources: URI[] = [];

	private _terminalState: ITerminalState = {
		title: 'Test Terminal',
		content: [],
		claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
	};

	constructor(initialState?: Partial<ITerminalState>) {
		if (initialState) {
			this._terminalState = { ...this._terminalState, ...initialState };
		}
	}

	nextClientSeq(): number {
		return ++this._seq;
	}

	async createTerminal(params: ICreateTerminalParams): Promise<void> {
		this.createdTerminals.push(params);
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		this.disposedTerminals.push(terminal);
	}

	/** Simulate the server sending an action to the client */
	fireAction(action: IStateAction, serverSeq = 1): void {
		this._onDidAction.fire({ action, serverSeq, origin: { clientId: 'server', clientSeq: 0 } });
	}

	// ---- Unused IAgentService methods (stubs) -----
	async authenticate(_params: IAuthenticateParams): Promise<IAuthenticateResult> { return { authenticated: true }; }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return []; }
	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> { return URI.parse('copilot:///test'); }
	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult> { return { schema: { type: 'object', properties: {} }, values: {} }; }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult> { return { items: [] }; }
	async disposeSession(_session: URI): Promise<void> { }
	async shutdown(): Promise<void> { }
	async resourceList(_uri: URI): Promise<IResourceListResult> { return { entries: [] }; }
	async resourceRead(_uri: URI): Promise<IResourceReadResult> { return { data: '', encoding: 'utf-8' } as IResourceReadResult; }
	async resourceWrite(_params: IResourceWriteParams): Promise<IResourceWriteResult> { return {}; }
	async resourceCopy(_params: IResourceCopyParams): Promise<IResourceCopyResult> { return {}; }
	async resourceDelete(_params: IResourceDeleteParams): Promise<IResourceDeleteResult> { return {}; }
	async resourceMove(_params: IResourceMoveParams): Promise<IResourceMoveResult> { return {}; }

	// ---- IAgentConnection new API (stubs for tests) -----
	readonly rootState: IAgentSubscription<IRootState> = {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
	getSubscription<T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> {
		const onDidChange = new Emitter<ITerminalState>();
		const onWillApplyAction = new Emitter<IActionEnvelope>();
		const onDidApplyAction = new Emitter<IActionEnvelope>();
		const sub: IAgentSubscription<ITerminalState> = {
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
	dispatch(action: ISessionAction | ITerminalAction): void {
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
});
