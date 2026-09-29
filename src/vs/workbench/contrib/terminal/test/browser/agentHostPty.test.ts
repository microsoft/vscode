/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { AgentHostDebugLogsArtifactKind, IAgentConnection, IAgentCreateSessionConfig, IAgentHostDebugLogsArtifact, IAgentHostDebugLogsChunk, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType, StateAction } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { RootState, TerminalClaimKind, TerminalLifecycleStatus, type TerminalState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../../../../../platform/agentHost/common/state/protocol/channels-automation/commands.js';
import type { ActionEnvelope, ChatAction, ClientAnnotationsAction, ClientAutomationAction, ClientAutomationRunAction, ClientChangesetAction, IRootConfigChangedAction, SessionAction, TerminalAction, INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWriteParams, ResourceWriteResult, CreateResourceWatchParams, CreateResourceWatchResult, ResourceMkdirParams, ResourceMkdirResult } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';

import { NullLogService } from '../../../../../platform/log/common/log.js';
import type { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { AgentHostPty } from '../../browser/agentHostPty.js';
import { AgentHostOutputChannel } from '../../browser/agentHostOutputChannel.js';
import { IActiveSubscriptionInfo, IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { terminalReducer } from '../../../../../platform/agentHost/common/state/protocol/reducers.js';
import type { IRemoteWatchHandle } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { identityAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
// ---- Mock IAgentConnection --------------------------------------------------

class MockAgentConnection implements IAgentConnection {

	readonly clientId = 'test-client';
	readonly resourceUris = identityAgentHostResourceUriMapper;

	private _seq = 0;
	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	readonly onDidAction: Event<ActionEnvelope> = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	readonly onDidNotification: Event<INotification> = this._onDidNotification.event;
	readonly onMcpNotification: Event<import('../../../../../platform/agentHost/common/agentService.js').IMcpNotification> = Event.None;
	readonly initializeResult: IObservable<import('../../../../../platform/agentHost/common/state/protocol/common/commands.js').InitializeResult | undefined> = constObservable(undefined);

	readonly dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction }[] = [];
	readonly createdTerminals: CreateTerminalParams[] = [];
	readonly disposedTerminals: URI[] = [];
	readonly subscribedResources: URI[] = [];
	disposedSubscriptions = 0;

	private _terminalState: TerminalState = {
		title: 'Test Terminal', content: [], claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' },
		lifecycle: { status: TerminalLifecycleStatus.Running },
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

	async invokeChangesetOperation(): Promise<{}> { return {}; }
	async handleMcpRequest(): Promise<unknown> { throw new Error('Not implemented'); }

	/** Simulate the server sending an action to the client */
	fireAction(channel: URI, action: StateAction, serverSeq = 1): void {
		this._onDidAction.fire({ channel: channel.toString(), action, serverSeq, origin: { clientId: 'server', clientSeq: 0 } });
	}

	// ---- Unused IAgentService methods (stubs) -----
	async authenticate(_params: AuthenticateParams): Promise<AuthenticateResult> { return { authenticated: true }; }
	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> { return { version: 'test', os: 'test', arch: 'test', proxySettings: {}, proxyEnv: {}, endpoints: [] }; }
	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> { return []; }
	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> { return { url }; }
	async getSessionStateFile(_session: URI): Promise<URI | undefined> { throw new Error('Not implemented'); }
	async collectDebugLogs(_session: URI | undefined, _kind: AgentHostDebugLogsArtifactKind): Promise<IAgentHostDebugLogsArtifact> { throw new Error('Not implemented'); }
	async readDebugLogsChunk(_resource: URI, _position: number): Promise<IAgentHostDebugLogsChunk> { throw new Error('Not implemented'); }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return []; }
	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> { return URI.parse('copilot:///test'); }
	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> { return { schema: { type: 'object', properties: {} }, values: {} }; }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> { return { items: [] }; }
	async completions(_params: CompletionsParams): Promise<CompletionsResult> { return { items: [] }; }
	async listAutomationTriggerDefinitions(_params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> { return { items: [] }; }
	async runAutomation(_params: RunAutomationParams): Promise<RunAutomationResult> { throw new Error('Not implemented'); }
	async fetchAutomationRuns(_params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> { return {}; }
	async getCompletionTriggerCharacters(): Promise<readonly string[]> { return []; }
	async disposeSession(_session: URI): Promise<void> { }
	async createChat(_session: URI, _chat: URI): Promise<void> { }
	async disposeChat(_chat: URI): Promise<void> { }
	async shutdown(): Promise<void> { }
	async resourceList(_uri: URI): Promise<ResourceListResult> { return { entries: [] }; }
	async resourceRead(_uri: URI): Promise<ResourceReadResult> { return { data: '', encoding: 'utf-8' } as ResourceReadResult; }
	async resourceWrite(_params: ResourceWriteParams): Promise<ResourceWriteResult> { return {}; }
	async resourceCopy(_params: ResourceCopyParams): Promise<ResourceCopyResult> { return {}; }
	async resourceDelete(_params: ResourceDeleteParams): Promise<ResourceDeleteResult> { return {}; }
	async resourceMove(_params: ResourceMoveParams): Promise<ResourceMoveResult> { return {}; }
	async resourceResolve(_params: ResourceResolveParams): Promise<ResourceResolveResult> { throw new Error('Not implemented'); }
	async resourceMkdir(_params: ResourceMkdirParams): Promise<ResourceMkdirResult> { return {}; }
	async createResourceWatch(_params: CreateResourceWatchParams): Promise<CreateResourceWatchResult> { throw new Error('Not implemented'); }
	async watchResource(_params: CreateResourceWatchParams): Promise<IRemoteWatchHandle> { throw new Error('Not implemented'); }

	// ---- IAgentConnection new API (stubs for tests) -----
	readonly rootState: IAgentSubscription<RootState> = {
		value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
	};
	getSubscription<T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> {
		const onDidChange = new Emitter<TerminalState>();
		const onWillApplyAction = new Emitter<ActionEnvelope>();
		const onDidApplyAction = new Emitter<ActionEnvelope>();
		const connection = this;
		const sub: IAgentSubscription<TerminalState> = {
			get value() { return connection._terminalState; },
			get verifiedValue() { return connection._terminalState; },
			onDidChange: onDidChange.event, onWillApplyAction: onWillApplyAction.event, onDidApplyAction: onDidApplyAction.event,
		};
		// Wire onDidAction to the subscription's events
		const listener = this._onDidAction.event(envelope => {
			if (envelope.channel === _resource.toString()) {
				onWillApplyAction.fire(envelope);
				this._terminalState = terminalReducer(this._terminalState, envelope.action as TerminalAction);
				onDidApplyAction.fire(envelope);
				onDidChange.fire(this._terminalState);
			}
		});
		return {
			object: sub as IAgentSubscription<T>, dispose: () => {
				this.disposedSubscriptions++;
				listener.dispose();
				onDidChange.dispose();
				onWillApplyAction.dispose();
				onDidApplyAction.dispose();
			},
		};
	}
	getSubscriptionUnmanaged<T>(_kind: StateComponents, _resource: URI): IAgentSubscription<T> | undefined {
		return undefined;
	}
	getInflightSessionCreate(_resource: URI): Promise<unknown> | undefined {
		return undefined;
	}
	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		return [];
	}
	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action });
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
	}
}

class TestAgentHostPty extends AgentHostPty {
	disposeCount = 0;

	override dispose(): void {
		this.disposeCount++;
		super.dispose();
	}
}

function createLogService(): ITerminalLogService {
	return new class extends NullLogService { readonly _logBrand = undefined; };
}

// ---- Tests ------------------------------------------------------------------

suite('AgentHostPty', () => {

	const disposables = new DisposableStore();
	const terminalUri = URI.parse('agenthost-terminal:///test-term-1');
	const logService = createLogService();

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
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, { name: 'test' }, logService));

		const result = await pty.start();

		assert.strictEqual(result, undefined, 'start() should succeed');
		assert.strictEqual(conn.createdTerminals.length, 1);
		assert.strictEqual(conn.createdTerminals[0].channel, terminalUri.toString());
		assert.strictEqual(conn.createdTerminals[0].name, 'test');
		assert.deepStrictEqual(conn.createdTerminals[0].claim, { kind: TerminalClaimKind.Client, clientId: 'test-client' });
	});

	test('start() fires onProcessReady', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		let ready = false;
		disposables.add(pty.onProcessReady!(() => { ready = true; }));

		await pty.start();
		assert.ok(ready);
	});

	test('replays existing content from snapshot', async () => {
		const conn = new MockAgentConnection({ content: [{ type: 'unclassified', value: 'existing output\n' }] });
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		assert.deepStrictEqual(dataReceived, ['existing output\n']);
	});

	test('output channel follows accumulated state without creating a pty', () => {
		const conn = new MockAgentConnection({ isPty: false, content: [{ type: 'unclassified', value: 'existing\n' }] });
		disposables.add(conn);
		const source = disposables.add(new AgentHostOutputChannel(conn, terminalUri));

		assert.strictEqual(source.output, 'existing\r\n');
		conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'next\n' });
		assert.strictEqual(source.output, 'existing\r\nnext\r\n');
		conn.fireAction(terminalUri, { type: ActionType.TerminalCleared });
		conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'fresh\n' });
		conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 3 });
		assert.strictEqual(source.output, 'fresh\r\n');
		assert.strictEqual(source.exitCode, 3);
	});

	test('input() dispatches terminal/input action', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		await pty.start();
		pty.input('hello');

		// Wait for the async barrier
		await new Promise(resolve => setTimeout(resolve, 10));

		const inputActions = conn.dispatchedActions.filter(a => a.action.type === ActionType.TerminalInput);
		assert.strictEqual(inputActions.length, 1);
		assert.strictEqual((inputActions[0].action as { data: string }).data, 'hello');
	});

	test('resize() dispatches terminal/resized action', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		await pty.start();
		pty.resize(120, 40);

		await new Promise(resolve => setTimeout(resolve, 10));

		const resizeActions = conn.dispatchedActions.filter(a => a.action.type === ActionType.TerminalResized);
		assert.strictEqual(resizeActions.length, 1);
		assert.strictEqual((resizeActions[0].action as { cols: number; rows: number }).cols, 120);
		assert.strictEqual((resizeActions[0].action as { cols: number; rows: number }).rows, 40);
	});

	test('resize() skips duplicate dimensions', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		await pty.start();
		pty.resize(80, 24);
		pty.resize(80, 24); // duplicate

		await new Promise(resolve => setTimeout(resolve, 10));

		const resizeActions = conn.dispatchedActions.filter(a => a.action.type === ActionType.TerminalResized);
		assert.strictEqual(resizeActions.length, 1);
	});

	test('terminal/data action fires onProcessData', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'hello world\r\n' });

		assert.deepStrictEqual(dataReceived, ['existing output\n' /* skip replay since content is '' */, 'hello world\r\n'].filter(x => x !== 'existing output\n'));
		// Since initial content is empty, only the streamed data should be received
		assert.deepStrictEqual(dataReceived, ['hello world\r\n']);
	});

	test('terminal/exited action finalizes the local PTY exactly once', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, logService);

		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(e => exitCodes.push(e)));

		await pty.start();
		conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 42 });
		conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 42 });
		pty.shutdown(false);
		pty.input('ignored');
		pty.resize(120, 40);
		await pty.clearBuffer();
		await Promise.resolve();

		assert.deepStrictEqual({
			exitCodes,
			disposeCount: pty.disposeCount,
			disposedSubscriptions: conn.disposedSubscriptions,
			disposedTerminals: conn.disposedTerminals,
			dispatchedActions: conn.dispatchedActions,
		}, {
			exitCodes: [42],
			disposeCount: 1,
			disposedSubscriptions: 1,
			disposedTerminals: [],
			dispatchedActions: [],
		});
	});

	test('terminal/cwdChanged updates cwd property', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		await pty.start();
		conn.fireAction(terminalUri, { type: ActionType.TerminalCwdChanged, cwd: '/home/user/project' });

		const cwd = await pty.getCwd();
		assert.strictEqual(cwd, '/home/user/project');
	});

	test('terminal/titleChanged updates title property', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		let changedTitle = '';
		disposables.add(pty.onDidChangeProperty!(e => {
			if (e.type === 'title') {
				changedTitle = e.value as string;
			}
		}));

		await pty.start();
		conn.fireAction(terminalUri, { type: ActionType.TerminalTitleChanged, title: 'npm test' });

		assert.strictEqual(changedTitle, 'npm test');
	});

	test('ignores actions for other terminals', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => {
			dataReceived.push(typeof e === 'string' ? e : e.data);
		}));

		await pty.start();
		conn.fireAction(URI.parse('agenthost-terminal:///other'), { type: ActionType.TerminalData, data: 'should not appear' });

		assert.deepStrictEqual(dataReceived, []);
	});

	test('shutdown() disposes terminal and unsubscribes', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, logService);

		let exitFired = false;
		disposables.add(pty.onProcessExit!(() => { exitFired = true; }));

		await pty.start();
		pty.shutdown(false);
		assert.strictEqual(exitFired, false, 'shutdown should not emit exit synchronously');
		assert.deepStrictEqual(conn.disposedTerminals.map(uri => uri.toString()), [terminalUri.toString()], 'shutdown should dispose the host terminal synchronously');

		await timeout(0);

		assert.deepStrictEqual({
			disposedTerminals: conn.disposedTerminals.map(uri => uri.toString()),
			disposedSubscriptions: conn.disposedSubscriptions,
			exitFired,
			disposeCount: pty.disposeCount,
		}, {
			disposedTerminals: [terminalUri.toString()],
			disposedSubscriptions: 1,
			exitFired: true,
			disposeCount: 1,
		});
	});

	test('shutdown() disposes while initial subscription hydration is pending', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		conn.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => {
			const onDidChange = new Emitter<TerminalState>();
			disposables.add(onDidChange);
			return {
				object: {
					value: undefined,
					verifiedValue: undefined,
					onDidChange: onDidChange.event,
					onWillApplyAction: Event.None,
					onDidApplyAction: Event.None,
				} as IAgentSubscription<T>,
				dispose: () => onDidChange.dispose(),
			};
		};
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, logService);

		const start = pty.start();
		await timeout(0);
		pty.shutdown(false);
		await start;
		await timeout(0);

		assert.deepStrictEqual({
			disposedTerminals: conn.disposedTerminals.map(uri => uri.toString()),
			disposeCount: pty.disposeCount,
		}, {
			disposedTerminals: [terminalUri.toString()],
			disposeCount: 1,
		});
	});

	test('shutdown() retries host disposal after pending terminal creation settles', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const creationBarrier = new DeferredPromise<void>();
		conn.createTerminal = async params => {
			conn.createdTerminals.push(params);
			await creationBarrier.p;
		};
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, logService);

		const start = pty.start();
		await timeout(0);
		pty.shutdown(false);
		await Promise.resolve();
		assert.deepStrictEqual({
			disposeCount: pty.disposeCount,
			disposedTerminals: conn.disposedTerminals.map(uri => uri.toString()),
		}, {
			disposeCount: 1,
			disposedTerminals: [terminalUri.toString()],
		});

		await creationBarrier.complete();
		await start;
		await timeout(0);

		assert.deepStrictEqual(conn.disposedTerminals.map(uri => uri.toString()), [terminalUri.toString(), terminalUri.toString()]);
	});

	test('shutdown() attempts host disposal when terminal creation rejects', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const creationBarrier = new DeferredPromise<void>();
		conn.createTerminal = async params => {
			conn.createdTerminals.push(params);
			await creationBarrier.p;
			throw new Error('transport disconnected');
		};
		const pty = new AgentHostPty(1, conn, terminalUri, undefined, logService);

		const start = pty.start();
		await timeout(0);
		pty.shutdown(false);
		await creationBarrier.complete();
		const result = await start;
		await timeout(0);

		assert.deepStrictEqual({
			error: result,
			disposedTerminals: conn.disposedTerminals.map(uri => uri.toString()),
		}, {
			error: undefined,
			disposedTerminals: [terminalUri.toString(), terminalUri.toString()],
		});
	});

	test('start() returns a launch error when terminal creation fails', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		conn.createTerminal = async () => { throw new Error('transport disconnected'); };
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, logService);

		const result = await pty.start();
		pty.shutdown(false);
		await timeout(0);

		assert.deepStrictEqual({
			result,
			disposeCount: pty.disposeCount,
			disposedTerminals: conn.disposedTerminals.map(uri => uri.toString()),
		}, {
			result: { message: 'transport disconnected' },
			disposeCount: 1,
			disposedTerminals: [terminalUri.toString()],
		});
	});

	test('shutdown() does not dispose an attach-only terminal on the host', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = new TestAgentHostPty(1, conn, terminalUri, { attachOnly: true }, logService);

		await pty.start();
		pty.shutdown(false);
		await timeout(0);

		assert.deepStrictEqual({
			disposeCount: pty.disposeCount,
			disposedTerminals: conn.disposedTerminals,
		}, {
			disposeCount: 1,
			disposedTerminals: [],
		});
	});

	test('shutdown() finalizes locally when host disposal throws synchronously', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		conn.disposeTerminal = () => { throw new Error('client unavailable'); };
		const warnings: string[] = [];
		const pty = new TestAgentHostPty(1, conn, terminalUri, undefined, new class extends NullLogService {
			readonly _logBrand = undefined;
			override warn(message: string): void { warnings.push(message); }
		});
		await pty.start();
		pty.shutdown(false);
		await Promise.resolve();

		assert.deepStrictEqual({
			disposeCount: pty.disposeCount,
			warnings,
		}, {
			disposeCount: 1,
			warnings: ['[AgentHostPty] Failed to dispose host terminal: client unavailable'],
		});
	});

	test('natural exit finalizes an attach-only PTY without disposing the host terminal', async () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = new TestAgentHostPty(1, conn, terminalUri, { attachOnly: true }, logService);
		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(exitCode => exitCodes.push(exitCode)));

		await pty.start();
		conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 0 });
		await Promise.resolve();

		assert.deepStrictEqual({
			exitCodes,
			disposeCount: pty.disposeCount,
			disposedTerminals: conn.disposedTerminals,
		}, {
			exitCodes: [0],
			disposeCount: 1,
			disposedTerminals: [],
		});
	});

	test('shouldPersist is false', () => {
		const conn = new MockAgentConnection();
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));
		assert.strictEqual(pty.shouldPersist, false);
	});

	test('getInitialCwd returns cwd from snapshot', async () => {
		const conn = new MockAgentConnection({ cwd: '/home/user' });
		disposables.add(conn);
		const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, undefined, logService));

		await pty.start();
		const cwd = await pty.getInitialCwd();
		assert.strictEqual(cwd, '/home/user');
	});

	test('reconnect() re-subscribes with new connection and replays content', async () => {
		const conn1 = new MockAgentConnection({ content: [{ type: 'unclassified', value: 'old output\n' }] });
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri, undefined, logService));

		await pty.start();

		// Create a new connection with different content (simulating server-side changes during disconnect)
		const conn2 = new MockAgentConnection({
			content: [{ type: 'unclassified', value: 'old output\nnew output after reconnect\n' }], cwd: '/home/reconnected', title: 'Reconnected Terminal',
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
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri, undefined, logService));
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
		conn2.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'post-reconnect data' });

		assert.deepStrictEqual(dataReceived, ['post-reconnect data']);

		// Old connection actions should NOT be received
		conn1.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'stale data' });
		assert.deepStrictEqual(dataReceived, ['post-reconnect data']);
	});

	test('reconnect() settles initial hydration from the replaced subscription generation', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const initialOnDidChange = disposables.add(new Emitter<TerminalState>());
		conn1.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => ({
			object: {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: initialOnDidChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			} as IAgentSubscription<T>,
			dispose: () => initialOnDidChange.dispose(),
		});
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri, undefined, logService));
		let readyCount = 0;
		disposables.add(pty.onProcessReady!(() => readyCount++));
		const start = pty.start();
		await timeout(0);

		const conn2 = new MockAgentConnection({ title: 'Reconnected' });
		disposables.add(conn2);
		const reconnect = pty.reconnect(conn2);
		await Promise.all([start, reconnect]);
		pty.input('after reconnect');
		await Promise.resolve();

		assert.deepStrictEqual({
			readyCount,
			dispatchedActions: conn2.dispatchedActions,
		}, {
			readyCount: 1,
			dispatchedActions: [{
				channel: terminalUri.toString(),
				action: { type: ActionType.TerminalInput, data: 'after reconnect' },
			}],
		});
	});

	test('reconnect() during pending terminal creation supersedes start()', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const creationBarrier = new DeferredPromise<void>();
		conn1.createTerminal = async params => {
			conn1.createdTerminals.push(params);
			await creationBarrier.p;
		};
		const pty = disposables.add(new TestAgentHostPty(1, conn1, terminalUri, undefined, logService));
		let readyCount = 0;
		disposables.add(pty.onProcessReady!(() => readyCount++));
		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => dataReceived.push(typeof e === 'string' ? e : e.data)));

		const start = pty.start();
		await timeout(0);

		const conn2 = new MockAgentConnection({ content: [{ type: 'unclassified', value: 'recovered output\n' }] });
		disposables.add(conn2);
		const reconnected = await pty.reconnect(conn2);
		dataReceived.length = 0; // drop the reconnect replay

		await creationBarrier.complete();
		const startResult = await start;
		conn2.fireAction(terminalUri, { type: ActionType.TerminalData, data: 'streamed' });

		assert.deepStrictEqual({
			reconnected,
			startResult,
			readyCount,
			dataReceived,
			disposedSubscriptions: conn2.disposedSubscriptions,
		}, {
			reconnected: true,
			startResult: undefined,
			readyCount: 1,
			dataReceived: ['streamed'],
			disposedSubscriptions: 0,
		});
	});

	test('a stale creation failure does not tear down a reconnected PTY', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const creationBarrier = new DeferredPromise<void>();
		conn1.createTerminal = async params => {
			conn1.createdTerminals.push(params);
			await creationBarrier.p;
			throw new Error('transport disconnected');
		};
		const pty = disposables.add(new TestAgentHostPty(1, conn1, terminalUri, undefined, logService));
		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(exitCode => exitCodes.push(exitCode)));

		const start = pty.start();
		await timeout(0);

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		const reconnected = await pty.reconnect(conn2);

		await creationBarrier.complete();
		const startResult = await start;
		await Promise.resolve();

		assert.deepStrictEqual({
			reconnected,
			startResult,
			exitCodes,
			disposeCount: pty.disposeCount,
		}, {
			reconnected: true,
			startResult: undefined,
			exitCodes: [],
			disposeCount: 0,
		});
	});

	test('failed reconnect finalizes a PTY whose initial hydration was replaced', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const initialOnDidChange = disposables.add(new Emitter<TerminalState>());
		conn1.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => ({
			object: {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: initialOnDidChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			} as IAgentSubscription<T>,
			dispose: () => initialOnDidChange.dispose(),
		});
		const pty = new TestAgentHostPty(1, conn1, terminalUri, undefined, logService);
		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(exitCode => exitCodes.push(exitCode)));
		const start = pty.start();
		await timeout(0);

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		conn2.getSubscription = () => { throw new Error('reconnect failed'); };
		const reconnect = await pty.reconnect(conn2);
		await start;
		await Promise.resolve();

		assert.deepStrictEqual({
			reconnect,
			exitCodes,
			disposeCount: pty.disposeCount,
			disposedTerminals: conn2.disposedTerminals.map(uri => uri.toString()),
		}, {
			reconnect: false,
			exitCodes: [undefined],
			disposeCount: 1,
			disposedTerminals: [terminalUri.toString()],
		});
	});

	test('a stale hydration timeout does not affect a successfully reconnected PTY', () => runWithFakedTimers({}, async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const warnings: string[] = [];
		const pty = disposables.add(new TestAgentHostPty(1, conn1, terminalUri, undefined, new class extends NullLogService {
			readonly _logBrand = undefined;
			override warn(message: string): void { warnings.push(message); }
		}));
		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(exitCode => exitCodes.push(exitCode)));
		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(e => dataReceived.push(typeof e === 'string' ? e : e.data)));
		await pty.start();

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		const hydration: { state: TerminalState | undefined } = { state: undefined };
		const onDidChange = disposables.add(new Emitter<TerminalState>());
		const onDidApplyAction = disposables.add(new Emitter<ActionEnvelope>());
		conn2.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => ({
			object: {
				get value() { return hydration.state; },
				get verifiedValue() { return hydration.state; },
				onDidChange: onDidChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: onDidApplyAction.event,
			} as IAgentSubscription<T>,
			dispose: () => { },
		});

		const reconnect = pty.reconnect(conn2);
		hydration.state = { title: 'Reconnected', content: [], claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' }, lifecycle: { status: TerminalLifecycleStatus.Running } };
		onDidChange.fire(hydration.state);
		assert.strictEqual(await reconnect, true);
		dataReceived.length = 0; // drop the replayed clear sequence

		// Advance virtual time past the hydration deadline — the stale timeout
		// must not finalize, warn on, or deafen the live PTY.
		await timeout(11_000);
		onDidApplyAction.fire({ channel: terminalUri.toString(), action: { type: ActionType.TerminalData, data: 'post-timeout data' }, serverSeq: 1, origin: undefined });

		assert.deepStrictEqual({
			exitCodes,
			warnings,
			disposeCount: pty.disposeCount,
			dataReceived,
		}, {
			exitCodes: [],
			warnings: [],
			disposeCount: 0,
			dataReceived: ['post-timeout data'],
		});
	}));

	test('shutdown() cancels pending reconnect hydration', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = new TestAgentHostPty(1, conn1, terminalUri, undefined, logService);
		const dataReceived: string[] = [];
		disposables.add(pty.onProcessData!(event => dataReceived.push(typeof event === 'string' ? event : event.data)));
		await pty.start();

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		const onDidChange = disposables.add(new Emitter<TerminalState>());
		const onDidApplyAction = disposables.add(new Emitter<ActionEnvelope>());
		conn2.getSubscription = <T>(_kind: StateComponents, _resource: URI): IReference<IAgentSubscription<T>> => ({
			object: {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: onDidChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: onDidApplyAction.event,
			} as IAgentSubscription<T>,
			dispose: () => {
				onDidChange.dispose();
				onDidApplyAction.dispose();
			},
		});

		const reconnect = pty.reconnect(conn2);
		pty.shutdown(false);
		const result = await reconnect;
		onDidChange.fire({ title: 'Late', content: [{ type: 'unclassified', value: 'late data' }], claim: { kind: TerminalClaimKind.Client, clientId: 'test-client' }, lifecycle: { status: TerminalLifecycleStatus.Running } });
		onDidApplyAction.fire({ channel: terminalUri.toString(), action: { type: ActionType.TerminalData, data: 'late action' }, serverSeq: 1, origin: undefined });
		await Promise.resolve();

		assert.deepStrictEqual({
			result,
			disposeCount: pty.disposeCount,
			dataReceived,
			dispatchedActions: conn2.dispatchedActions,
		}, {
			result: false,
			disposeCount: 1,
			dataReceived: [],
			dispatchedActions: [],
		});
	});

	test('reconnect() times out when subscription never hydrates', () => runWithFakedTimers({}, async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = disposables.add(new TestAgentHostPty(1, conn1, terminalUri, undefined, logService));
		const exitCodes: (number | undefined)[] = [];
		disposables.add(pty.onProcessExit!(exitCode => exitCodes.push(exitCode)));
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
				verifiedValue: undefined, onDidChange: onDidChange.event, onWillApplyAction: Event.None, onDidApplyAction: onDidApplyAction.event,
			};
			return {
				object: sub as IAgentSubscription<T>, dispose: () => { onDidChange.dispose(); onDidApplyAction.dispose(); },
			};
		};

		const result = await pty.reconnect(conn2);
		await Promise.resolve();

		// The PTY was ready before the reconnect attempt — a failed reconnect
		// must leave the live terminal and its host terminal untouched.
		assert.deepStrictEqual({
			result,
			exitCodes,
			disposeCount: pty.disposeCount,
			disposedTerminals: conn2.disposedTerminals,
		}, {
			result: false,
			exitCodes: [],
			disposeCount: 0,
			disposedTerminals: [],
		});
	}));

	test('reconnect() dispatches input to new connection', async () => {
		const conn1 = new MockAgentConnection();
		disposables.add(conn1);
		const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri, undefined, logService));
		await pty.start();

		const conn2 = new MockAgentConnection();
		disposables.add(conn2);
		await pty.reconnect(conn2);

		pty.input('after reconnect');
		await new Promise(resolve => setTimeout(resolve, 10));

		const inputActions = conn2.dispatchedActions.filter(a => a.action.type === ActionType.TerminalInput);
		assert.strictEqual(inputActions.length, 1);
		assert.strictEqual((inputActions[0].action as { data: string }).data, 'after reconnect');

		// conn1 should not have received the input
		const oldInputActions = conn1.dispatchedActions.filter(a => a.action.type === ActionType.TerminalInput);
		assert.strictEqual(oldInputActions.length, 0);
	});
});
