/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CDPBrowserProxy } from '../../../common/cdp/proxy.js';
import { CDPBrowserVersion, CDPEvent, CDPTargetInfo, CDPWindowBounds, ICDPBrowserTarget, ICDPConnection, ICDPSessionCreatedEvent, ICDPTarget } from '../../../common/cdp/types.js';

class TestConnection extends Disposable implements ICDPConnection {

	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent = this._onEvent.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly commands: { method: string; params: unknown }[] = [];
	private _isDisposed = false;

	constructor(
		readonly sessionId: string,
		readonly targetId: string,
		readonly parentSessionId?: string,
	) {
		super();
	}

	async sendCommand(method: string, params: unknown = {}): Promise<unknown> {
		this.commands.push({ method, params });
		return { forwarded: method };
	}

	fireEvent(method: string, params: unknown, sessionId?: string): void {
		this._onEvent.fire({ method, params, sessionId });
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._onClose.fire();
		super.dispose();
	}
}

class TestTarget extends Disposable implements ICDPTarget {

	private readonly _sessions = new Map<string, TestConnection>();
	readonly sessions: ReadonlyMap<string, ICDPConnection> = this._sessions;

	private readonly _onSessionCreated = this._register(new Emitter<ICDPSessionCreatedEvent>());
	readonly onSessionCreated = this._onSessionCreated.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _onTargetInfoChanged = this._register(new Emitter<CDPTargetInfo>());
	readonly onTargetInfoChanged = this._onTargetInfoChanged.event;

	attachCount = 0;
	lastConnection: TestConnection | undefined;

	constructor(readonly targetInfo: CDPTargetInfo) {
		super();
	}

	async attach(requesterSessionId?: string): Promise<ICDPConnection> {
		this.attachCount++;
		const connection = new TestConnection(`session-${this.targetInfo.targetId}-${this.attachCount}`, this.targetInfo.targetId);
		this.lastConnection = connection;
		this._sessions.set(connection.sessionId, connection);
		this._register(connection.onClose(() => this._sessions.delete(connection.sessionId)));
		this._onSessionCreated.fire({ session: connection, waitingForDebugger: false, requesterSessionId });
		return connection;
	}

	notifySessionCreated(session: ICDPConnection, waitingForDebugger: boolean, requesterSessionId?: string): void {
		this._sessions.set(session.sessionId, session as TestConnection);
		this._register(session.onClose(() => this._sessions.delete(session.sessionId)));
		this._onSessionCreated.fire({ session, waitingForDebugger, requesterSessionId });
	}

	changeInfo(title: string, url: string): void {
		this.targetInfo.title = title;
		this.targetInfo.url = url;
		this._onTargetInfoChanged.fire(this.targetInfo);
	}

	close(): void {
		// Mirror BrowserViewCDPTarget.dispose(): sessions go away with the target.
		for (const session of [...this._sessions.values()]) {
			session.dispose();
		}
		this._sessions.clear();
		this._onClose.fire();
	}
}

class TestBrowserTarget extends TestTarget implements ICDPBrowserTarget {

	readonly activatedTargets: string[] = [];
	readonly closedTargets: string[] = [];
	readonly disposedContexts: string[] = [];
	createdTarget: TestTarget | undefined;

	constructor() {
		super(createTargetInfo('browser', 'browser'));
	}

	getVersion(): CDPBrowserVersion {
		return {
			protocolVersion: '1.3',
			product: 'TestBrowser/1.0',
			revision: 'test',
			userAgent: 'TestBrowser',
			jsVersion: '1.0',
		};
	}

	getWindowForTarget(): { windowId: number; bounds: CDPWindowBounds } {
		return {
			windowId: 1,
			bounds: { left: 0, top: 0, width: 800, height: 600, windowState: 'normal' },
		};
	}

	async createTarget(url: string, browserContextId?: string): Promise<ICDPTarget> {
		this.createdTarget = new TestTarget({
			...createTargetInfo('created', 'page'),
			url,
			browserContextId,
		});
		return this.createdTarget;
	}

	async activateTarget(target: ICDPTarget): Promise<void> {
		this.activatedTargets.push(target.targetInfo.targetId);
	}

	async closeTarget(target: ICDPTarget): Promise<boolean> {
		this.closedTargets.push(target.targetInfo.targetId);
		target.dispose();
		return true;
	}

	getBrowserContexts(): string[] {
		return ['context-1'];
	}

	async createBrowserContext(): Promise<string> {
		return 'context-created';
	}

	async disposeBrowserContext(browserContextId: string): Promise<void> {
		this.disposedContexts.push(browserContextId);
	}
}

function createTargetInfo(targetId: string, type = 'page'): CDPTargetInfo {
	return {
		targetId,
		type,
		title: targetId,
		url: `https://${targetId}.example.com`,
		attached: false,
		canAccessOpener: false,
	};
}

suite('CDPBrowserProxy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createProxy(): { browserTarget: TestBrowserTarget; proxy: CDPBrowserProxy } {
		const browserTarget = store.add(new TestBrowserTarget());
		const proxy = store.add(new CDPBrowserProxy(browserTarget));
		return { browserTarget, proxy };
	}

	test('discovers registered targets and reports target lifecycle', async () => {
		const { proxy } = createProxy();
		const target = new TestTarget(createTargetInfo('page-1'));
		const events: CDPEvent[] = [];
		store.add(proxy.onEvent(event => events.push(event)));

		proxy.registerTarget(target);
		await proxy.sendCommand('Target.setDiscoverTargets', { discover: true });
		target.changeInfo('Updated', 'https://updated.example.com');
		target.close();

		const lifecycleMethods = new Set(['Target.targetCreated', 'Target.targetInfoChanged', 'Target.targetDestroyed']);
		assert.deepStrictEqual(events.filter(event => lifecycleMethods.has(event.method)).map(event => ({
			method: event.method,
			targetId: (event.params as { targetId?: string; targetInfo?: CDPTargetInfo }).targetId
				?? (event.params as { targetInfo?: CDPTargetInfo }).targetInfo?.targetId,
		})), [
			{ method: 'Target.targetCreated', targetId: 'page-1' },
			{ method: 'Target.targetInfoChanged', targetId: 'page-1' },
			{ method: 'Target.targetDestroyed', targetId: 'page-1' },
		]);
	});

	test('routes page commands and forwards session lifecycle events', async () => {
		const { proxy } = createProxy();
		const target = new TestTarget(createTargetInfo('page-1'));
		const events: CDPEvent[] = [];
		store.add(proxy.onEvent(event => events.push(event)));
		proxy.registerTarget(target);

		const attachResult = await proxy.sendCommand('Target.attachToTarget', { targetId: 'page-1', flatten: true }) as { sessionId: string };
		const connection = target.lastConnection!;
		connection.fireEvent('Runtime.consoleAPICalled', { value: 1 });
		connection.fireEvent('Target.targetCreated', { targetInfo: createTargetInfo('worker-1') });
		const result = await proxy.sendCommand('Runtime.evaluate', { expression: '1 + 1' }, attachResult.sessionId);
		await proxy.sendCommand('Target.detachFromTarget', { sessionId: attachResult.sessionId });
		const relevantMethods = new Set(['Target.attachedToTarget', 'Runtime.consoleAPICalled', 'Target.detachedFromTarget']);

		assert.deepStrictEqual({
			result,
			commands: connection.commands,
			events: events.filter(event => relevantMethods.has(event.method)).map(event => ({ method: event.method, sessionId: event.sessionId })),
		}, {
			result: { forwarded: 'Runtime.evaluate' },
			commands: [{ method: 'Runtime.evaluate', params: { expression: '1 + 1' } }],
			events: [
				{ method: 'Target.attachedToTarget', sessionId: undefined },
				{ method: 'Runtime.consoleAPICalled', sessionId: attachResult.sessionId },
				{ method: 'Target.detachedFromTarget', sessionId: undefined },
			],
		});
	});

	test('returns protocol errors through the message transport', async () => {
		const { proxy } = createProxy();
		const browserSession = await proxy.sendCommand('Target.attachToBrowserTarget') as { sessionId: string };
		const messages: object[] = [];
		store.add(proxy.onMessage(message => messages.push(message)));

		await proxy.sendMessage({ id: 1, method: 'Unknown.method' });
		await proxy.sendMessage({ id: 2, method: 'Runtime.evaluate', sessionId: 'missing' });
		await proxy.sendMessage({ id: 3, method: 'Target.attachToTarget', params: { targetId: 'missing', flatten: false } });
		await proxy.sendMessage({ id: 4, method: 'Target.getTargets', sessionId: 'missing' });
		await proxy.sendMessage({ id: 5, method: 'Target.attachToBrowserTarget', sessionId: browserSession.sessionId });

		assert.deepStrictEqual(messages, [
			{ id: 1, error: { code: -32601, message: 'Method not found: Unknown.method' }, sessionId: undefined },
			{ id: 2, error: { code: -32000, message: 'Session not found: missing' }, sessionId: 'missing' },
			{ id: 3, error: { code: -32602, message: 'This implementation only supports attachToTarget with flatten=true' }, sessionId: undefined },
			{ id: 4, error: { code: -32000, message: 'Session not found: missing' }, sessionId: 'missing' },
			{ id: 5, error: { code: -32602, message: 'This implementation only supports attachToBrowserTarget from the root session' }, sessionId: browserSession.sessionId },
		]);
	});

	test('auto-attaches each registered or created target once', async () => {
		const { browserTarget, proxy } = createProxy();
		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: true, flatten: true });

		const registered = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(registered);
		proxy.registerTarget(registered);
		const createResult = await proxy.sendCommand('Target.createTarget', { url: 'https://created.example.com', browserContextId: 'context-1' });

		assert.deepStrictEqual({
			registeredAttachCount: registered.attachCount,
			createdAttachCount: browserTarget.createdTarget?.attachCount,
			createdTargetInfo: browserTarget.createdTarget?.targetInfo,
			createResult,
		}, {
			registeredAttachCount: 1,
			createdAttachCount: 1,
			createdTargetInfo: {
				...createTargetInfo('created', 'page'),
				url: 'https://created.example.com',
				browserContextId: 'context-1',
			},
			createResult: { targetId: 'created' },
		});
	});

	test('routes a session lifecycle to the session that requested the attach', async () => {
		// A client observes attach/detach on the session it subscribed from, and
		// tracks the page by them. Routing the detach elsewhere leaves the client
		// believing an unshared page is still live.
		const { proxy } = createProxy();
		const target = new TestTarget(createTargetInfo('page-1'));
		const events: CDPEvent[] = [];
		store.add(proxy.onEvent(event => events.push(event)));

		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: true, flatten: true });
		proxy.registerTarget(target);
		// Playwright attaches to the browser target lazily, part-way through a
		// connection's life, which must not redirect the root session's events.
		await proxy.sendCommand('Target.attachToBrowserTarget');
		target.lastConnection!.dispose();

		const lifecycleMethods = new Set(['Target.attachedToTarget', 'Target.detachedFromTarget']);
		assert.deepStrictEqual(events.filter(event => lifecycleMethods.has(event.method)).map(event => ({
			method: event.method,
			routedTo: event.sessionId,
			targetType: (event.params as { targetInfo?: CDPTargetInfo }).targetInfo?.type,
		})), [
			{ method: 'Target.attachedToTarget', routedTo: undefined, targetType: 'page' },
			{ method: 'Target.attachedToTarget', routedTo: undefined, targetType: 'browser' },
			{ method: 'Target.detachedFromTarget', routedTo: undefined, targetType: undefined },
		]);
	});

	test('announces a re-registered target to an existing auto-attach subscriber', async () => {
		// Unsharing and re-sharing a page removes and re-adds its target. The new
		// attach has to reach the subscriber, or the page stays invisible to it.
		const { proxy } = createProxy();
		const events: CDPEvent[] = [];
		store.add(proxy.onEvent(event => events.push(event)));

		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: true, flatten: true });
		await proxy.sendCommand('Target.attachToBrowserTarget');

		const first = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(first);
		first.close();
		const second = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(second);

		assert.deepStrictEqual({
			attachedAfterReRegister: events
				.filter(event => event.method === 'Target.attachedToTarget')
				.map(event => event.sessionId),
			secondAttachCount: second.attachCount,
		}, {
			attachedAfterReRegister: [undefined, undefined, undefined],
			secondAttachCount: 1,
		});
	});

	test('keeps browser sessions independent', async () => {
		// Each attach is its own session: subscriptions and detach are per-session,
		// so one client must not be able to clobber another's state.
		const { proxy } = createProxy();
		const events: CDPEvent[] = [];
		store.add(proxy.onEvent(event => events.push(event)));

		const first = await proxy.sendCommand('Target.attachToBrowserTarget') as { sessionId: string };
		const second = await proxy.sendCommand('Target.attachToBrowserTarget') as { sessionId: string };
		await proxy.sendCommand('Target.setDiscoverTargets', { discover: true }, first.sessionId);

		const target = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(target);
		await proxy.sendCommand('Target.detachFromTarget', { sessionId: first.sessionId });
		const afterDetach = new TestTarget(createTargetInfo('page-2'));
		proxy.registerTarget(afterDetach);

		assert.deepStrictEqual({
			distinctSessionIds: first.sessionId !== second.sessionId,
			discovered: events
				.filter(event => event.method === 'Target.targetCreated')
				.map(event => ({
					targetId: (event.params as { targetInfo: CDPTargetInfo }).targetInfo.targetId,
					routedTo: event.sessionId,
				})),
			detached: events
				.filter(event => event.method === 'Target.detachedFromTarget')
				.map(event => ({
					sessionId: (event.params as { sessionId: string }).sessionId,
					routedTo: event.sessionId,
				})),
		}, {
			distinctSessionIds: true,
			discovered: [{ targetId: 'page-1', routedTo: first.sessionId }],
			detached: [{ sessionId: first.sessionId, routedTo: undefined }],
		});
	});

	test('detaching a browser session disposes only its owned target sessions', async () => {
		const { proxy } = createProxy();
		const target = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(target);

		const rootSession = await proxy.sendCommand(
			'Target.attachToTarget',
			{ targetId: 'page-1', flatten: true }
		) as { sessionId: string };
		const browserSession = await proxy.sendCommand('Target.attachToBrowserTarget') as { sessionId: string };
		const ownedSession = await proxy.sendCommand(
			'Target.attachToTarget',
			{ targetId: 'page-1', flatten: true },
			browserSession.sessionId
		) as { sessionId: string };
		const inheritedSession = new TestConnection('session-worker-1', 'page-1', ownedSession.sessionId);
		target.notifySessionCreated(inheritedSession, false);

		await proxy.sendCommand('Target.detachFromTarget', { sessionId: browserSession.sessionId });

		const getCommandError = (sessionId: string) => proxy.sendCommand('Runtime.evaluate', {}, sessionId).then(
			() => undefined,
			error => error instanceof Error ? error.message : String(error)
		);
		assert.deepStrictEqual({
			activeTargetSessions: [...target.sessions.keys()],
			rootResult: await proxy.sendCommand('Runtime.evaluate', {}, rootSession.sessionId),
			ownedError: await getCommandError(ownedSession.sessionId),
			inheritedError: await getCommandError(inheritedSession.sessionId),
		}, {
			activeTargetSessions: [rootSession.sessionId],
			rootResult: { forwarded: 'Runtime.evaluate' },
			ownedError: `Session not found: ${ownedSession.sessionId}`,
			inheritedError: `Session not found: ${inheritedSession.sessionId}`,
		});
	});

	test('auto-attaches once per subscribing browser session', async () => {
		const { proxy } = createProxy();
		const browserSession = await proxy.sendCommand('Target.attachToBrowserTarget') as { sessionId: string };
		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: true, flatten: true });
		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: true, flatten: true }, browserSession.sessionId);

		const target = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(target);
		await proxy.sendCommand('Target.setAutoAttach', { autoAttach: false, flatten: true }, browserSession.sessionId);
		const afterDisable = new TestTarget(createTargetInfo('page-2'));
		proxy.registerTarget(afterDisable);

		assert.deepStrictEqual({
			attachCountWithTwoSubscribers: target.attachCount,
			attachCountAfterOneUnsubscribed: afterDisable.attachCount,
		}, {
			attachCountWithTwoSubscribers: 2,
			attachCountAfterOneUnsubscribed: 1,
		});
	});

	test('handles browser context and target commands', async () => {
		const { browserTarget, proxy } = createProxy();
		const target = new TestTarget(createTargetInfo('page-1'));
		proxy.registerTarget(target);

		const results = {
			version: await proxy.sendCommand('Browser.getVersion'),
			contexts: await proxy.sendCommand('Target.getBrowserContexts'),
			createdContext: await proxy.sendCommand('Target.createBrowserContext'),
			targets: await proxy.sendCommand('Target.getTargets'),
			targetInfo: await proxy.sendCommand('Target.getTargetInfo', { targetId: 'page-1' }),
			window: await proxy.sendCommand('Browser.getWindowForTarget', { targetId: 'page-1' }),
		};
		await proxy.sendCommand('Target.activateTarget', { targetId: 'page-1' });
		await proxy.sendCommand('Target.disposeBrowserContext', { browserContextId: 'context-created' });
		const closeResult = await proxy.sendCommand('Target.closeTarget', { targetId: 'page-1' });

		assert.deepStrictEqual({
			results,
			activatedTargets: browserTarget.activatedTargets,
			disposedContexts: browserTarget.disposedContexts,
			closedTargets: browserTarget.closedTargets,
			closeResult,
		}, {
			results: {
				version: browserTarget.getVersion(),
				contexts: { browserContextIds: ['context-1'] },
				createdContext: { browserContextId: 'context-created' },
				targets: { targetInfos: [createTargetInfo('page-1')] },
				targetInfo: { targetInfo: createTargetInfo('page-1') },
				window: browserTarget.getWindowForTarget(),
			},
			activatedTargets: ['page-1'],
			disposedContexts: ['context-created'],
			closedTargets: ['page-1'],
			closeResult: { success: true },
		});
	});
});
