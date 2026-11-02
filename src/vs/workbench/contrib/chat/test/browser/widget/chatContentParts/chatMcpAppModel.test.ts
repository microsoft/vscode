/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, waitForState } from '../../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IMcpAppResourceContent, McpToolCallUI } from '../../../../../mcp/browser/mcpToolCallUI.js';
import { MCP } from '../../../../../mcp/common/modelContextProtocol.js';
import { McpApps } from '../../../../../mcp/common/modelContextProtocolApps.js';
import { IOverlayWebview, IWebviewService, WebviewMessageReceivedEvent } from '../../../../../webview/browser/webview.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostMcpAppToolProvider, IAgentHostMcpAppToolsService } from '../../../../browser/agentSessions/agentHost/agentHostMcpAppToolsService.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { ChatMcpAppModel } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppModel.js';
import { IMcpAppRenderData } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppSubPart.js';
import { IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatResponseResourceFileSystemProvider } from '../../../../common/widget/chatResponseResourceFileSystemProvider.js';

suite('ChatMcpAppModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('agent-host-copilotcli://remote-host/session');
	const resource: IMcpAppResourceContent = { html: '<html>Verification app</html>', mimeType: 'text/html' };
	type Server = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

	function createFixture(initialStatus: McpServerStatus | undefined, loadResource: () => Promise<IMcpAppResourceContent> = async () => resource, renderData: { serverName?: string; kind?: 'agentHost' | 'local' } = { serverName: 'verification' }, initiallyVisible = true, clippingContainer?: HTMLElement) {
		const onDidChangeCustomizations = store.add(new Emitter<void>());
		const onMessage = store.add(new Emitter<WebviewMessageReceivedEvent>());
		const onDidPostMessage = store.add(new Emitter<MCP.JSONRPCMessage>());
		const onDidOverlayOperation = store.add(new Emitter<string>());
		const createServer = (status: McpServerStatus, overrides: Partial<Server> = {}) => upcastPartial<Server>({
			id: 'live-plugin-server-id',
			name: 'verification',
			status,
			...overrides,
		});
		let servers: readonly Server[] = initialStatus === undefined ? [] : [createServer(initialStatus)];
		let reads = 0;
		let registered: IAgentHostMcpAppToolProvider | undefined;
		const html: string[] = [];
		const messages: MCP.JSONRPCMessage[] = [];
		const operations: string[] = [];
		const anchors: [HTMLElement, HTMLElement | undefined][] = [];
		const observerWindows: ReturnType<typeof dom.getWindow>[] = [];
		let owner: object | undefined;
		let contextWindow: ReturnType<typeof dom.getWindow> | undefined;
		let hasContext = false;
		let contextCreations = 0;
		let contextDisposals = 0;
		let initiallyRetaining = false;
		const recordOperation = (operation: string) => {
			operations.push(operation);
			onDidOverlayOperation.fire(operation);
		};
		const webview = upcastPartial<IOverlayWebview>({
			options: {},
			onMessage: onMessage.event,
			setHtml: content => { html.push(content); },
			postMessage: async (message: MCP.JSONRPCMessage) => {
				if (!hasContext) {
					return false;
				}
				messages.push(message);
				onDidPostMessage.fire(message);
				return true;
			},
			claim: (claimant, targetWindow) => {
				owner = claimant as object;
				if (hasContext && contextWindow !== targetWindow) {
					hasContext = false;
					contextDisposals++;
				}
				contextWindow = targetWindow;
				if (!hasContext) {
					hasContext = true;
					contextCreations++;
				}
				recordOperation('claim');
			},
			release: claimant => {
				if (owner !== claimant) {
					return;
				}
				owner = undefined;
				if (!webview.options.retainContextWhenHidden && hasContext) {
					hasContext = false;
					contextDisposals++;
				}
				recordOperation('release');
			},
			setAnchorElement: (container, clippingContainer) => {
				anchors.push([container, clippingContainer]);
				recordOperation('anchor');
			},
			dispose: () => {
				if (hasContext) {
					hasContext = false;
					contextDisposals++;
				}
				recordOperation('dispose');
			},
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({
				onDidChangeCustomizations: onDidChangeCustomizations.event,
				getMcpServers: session => {
					assert.deepStrictEqual(session, sessionResource);
					return servers;
				},
			})],
			[IAgentHostMcpAppToolsService, upcastPartial<IAgentHostMcpAppToolsService>({
				registerApp: (session, provider) => {
					assert.deepStrictEqual(session, sessionResource);
					registered = provider;
					return toDisposable(() => { registered = undefined; });
				},
			})],
			[IWebviewService, upcastPartial<IWebviewService>({
				createWebviewElement: () => assert.fail('MCP apps must use overlay webviews'),
				createWebviewOverlay: info => {
					webview.options = info.options;
					initiallyRetaining = !!info.options.retainContextWhenHidden;
					recordOperation('create');
					return webview;
				},
			})],
			[IStorageService, store.add(new InMemoryStorageService())],
			[ILogService, store.add(new NullLogService())],
			[IChatWidgetService, upcastPartial<IChatWidgetService>({})],
			[IChatResponseResourceFileSystemProvider, upcastPartial<IChatResponseResourceFileSystemProvider>({})],
			[IProductService, upcastPartial<IProductService>({ nameLong: 'Code', version: '1' })],
			[IOpenerService, upcastPartial<IOpenerService>({})],
		)));
		instantiationService.stubInstance(McpToolCallUI, {
			hostContext: constObservable(upcastPartial<McpApps.McpUiHostContext>({})),
			onNotification: Event.None,
			loadResource: async () => {
				reads++;
				return loadResource();
			},
			dispose: () => { },
		});
		const data: IMcpAppRenderData = {
			...(renderData.kind === 'local'
				? { kind: 'local', serverDefinitionId: 'local-server', collectionId: 'collection' }
				: { kind: 'agentHost', serverId: 'replayed-contributor-id', serverName: renderData.serverName, channel: 'mcp://opaque-host-channel', connectionAuthority: 'remote-host' }),
			resourceUri: 'ui://verification/app', sessionResource, input: '{}',
		};
		const observers = new Map<Element, { callback: IntersectionObserverCallback; observer: IntersectionObserver }>();
		const createIntersectionObserver = (callback: IntersectionObserverCallback, targetWindow: ReturnType<typeof dom.getWindow>): IntersectionObserver => {
			observerWindows.push(targetWindow);
			const observed = new Set<Element>();
			const observer = upcastPartial<IntersectionObserver>({
				observe: element => {
					observed.add(element);
					observers.set(element, { callback, observer });
				},
				disconnect: () => {
					for (const element of observed) {
						observers.delete(element);
					}
				},
			});
			return observer;
		};
		const model = store.add(instantiationService.createInstance(ChatMcpAppModel,
			upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId: 'call', toolId: 'verification' }),
			data,
			createIntersectionObserver,
		));
		const readsBeforeAttach = reads;
		const container = dom.$('div');
		container.style.cssText = 'width: 100px; height: 100px;';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const currentWidth = observableValue('currentWidth', 800);
		const attachment = store.add(model.attach(container, {
			targetWindow: dom.getWindow(container),
			maxHeight: observableValue('maxHeight', 600),
			currentWidth,
			clippingContainer,
		}));
		const setVisible = (visible: boolean, element = container) => {
			const entry = observers.get(element);
			assert.ok(entry);
			entry.callback([upcastPartial<IntersectionObserverEntry>({ target: element, isIntersecting: visible })], entry.observer);
		};
		setVisible(initiallyVisible);
		const send = (message: McpApps.AppMessage) => onMessage.fire({ message });
		const listRequests = () => messages.filter((message): message is MCP.ListToolsRequest => hasKey(message, { method: true }) && message.method === 'tools/list');
		return {
			model, html, messages, operations, anchors, observerWindows, container, attachment, send, listRequests, readsBeforeAttach, setVisible, currentWidth,
			onDidOverlayOperation: onDidOverlayOperation.event,
			onDidPostMessage: onDidPostMessage.event,
			get reads() { return reads; },
			get context() { return { alive: hasContext, creations: contextCreations, disposals: contextDisposals, retaining: !!webview.options.retainContextWhenHidden }; },
			get contextWindow() { return contextWindow; },
			get initiallyRetaining() { return initiallyRetaining; },
			get registered() { return registered; },
			async initialize(tools = true) {
				await waitForState(model.loadState, state => state.status === 'loaded');
				const response = Event.toPromise(Event.filter(onDidPostMessage.event, message => !(hasKey(message, { method: true })) && message.id === 'initialize'));
				send({
					jsonrpc: '2.0', id: 'initialize', method: 'ui/initialize',
					params: { appInfo: { name: 'test', version: '1' }, appCapabilities: tools ? { tools: { listChanged: true } } : {}, protocolVersion: McpApps.LATEST_PROTOCOL_VERSION },
				});
				await response;
				send({ method: 'ui/notifications/initialized' });
			},
			async respondTools(tools: readonly MCP.Tool[]) {
				const previous = model.tools.get();
				const refreshed = waitForState(model.tools, value => value !== previous);
				send({ jsonrpc: '2.0', id: listRequests().at(-1)!.id, result: { tools } });
				await refreshed;
			},
			setServer(status: McpServerStatus | undefined, overrides: Partial<Server> = {}) {
				servers = status === undefined ? [] : [createServer(status, overrides)];
				onDidChangeCustomizations.fire();
			},
		};
	}

	test('loads on first attach even when the matched server is not Ready', async () => {
		const read = new DeferredPromise<IMcpAppResourceContent>();
		const fixture = createFixture(McpServerStatus.Starting, () => read.p);
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads, readsBeforeAttach: fixture.readsBeforeAttach }, { state: { status: 'loading' }, reads: 1, readsBeforeAttach: 0 });

		await read.complete(resource);
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads, htmlCount: fixture.html.length }, {
			state: { status: 'loaded' }, reads: 1, htmlCount: 1,
		});
	});

	test('retries exactly once when an absent server appears Ready after a failed read', async () => {
		let available = false;
		const fixture = createFixture(undefined, async () => {
			if (!available) {
				throw new Error('MCP server not connected: verification');
			}
			return resource;
		});
		await waitForState(fixture.model.loadState, state => state.status === 'unavailable');
		assert.strictEqual(fixture.reads, 1);

		available = true;
		fixture.setServer(McpServerStatus.Ready);
		fixture.setServer(McpServerStatus.Ready);
		fixture.model.retry();
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		fixture.setServer(McpServerStatus.Ready);
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads, htmlCount: fixture.html.length }, {
			state: { status: 'loaded' }, reads: 2, htmlCount: 1,
		});
	});

	test('waits after an AuthRequired failure and retries only when the status changes', async () => {
		let available = false;
		const fixture = createFixture(McpServerStatus.AuthRequired, async () => {
			if (!available) {
				throw new Error('Authentication required');
			}
			return resource;
		});
		await waitForState(fixture.model.loadState, state => state.status === 'unavailable');
		fixture.setServer(McpServerStatus.AuthRequired);
		fixture.setServer(McpServerStatus.AuthRequired, { authenticating: true, displayName: 'Verification' });
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'unavailable' }, reads: 1 });

		available = true;
		fixture.setServer(McpServerStatus.Ready);
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'loaded' }, reads: 2 });
	});

	test('keeps errors for a Ready server without auto-retrying and supports manual retry', async () => {
		const error = new Error('Resource denied');
		let denied = true;
		const fixture = createFixture(McpServerStatus.Ready, async () => {
			if (denied) {
				throw error;
			}
			return resource;
		});
		await waitForState(fixture.model.loadState, state => state.status === 'error');
		fixture.setServer(McpServerStatus.Starting);
		fixture.setServer(McpServerStatus.Ready);
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'error', error }, reads: 1 });

		denied = false;
		fixture.model.retry();
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'loaded' }, reads: 2 });
	});

	test('keeps errors for an agent-host app without serverName and supports manual retry', async () => {
		const error = new Error('Transient resource failure');
		let available = false;
		const fixture = createFixture(undefined, async () => {
			if (!available) {
				throw error;
			}
			return resource;
		}, {});
		await waitForState(fixture.model.loadState, state => state.status !== 'loading');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'error', error }, reads: 1 });

		available = true;
		fixture.model.retry();
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads, htmlCount: fixture.html.length }, {
			state: { status: 'loaded' }, reads: 2, htmlCount: 1,
		});
	});

	test('retries when an unavailable server disappears or appears even before Ready', async () => {
		let available = false;
		const fixture = createFixture(McpServerStatus.AuthRequired, async () => {
			if (!available) {
				throw new Error('MCP server not connected: verification');
			}
			return resource;
		});
		await waitForState(fixture.model.loadState, state => state.status === 'unavailable');
		fixture.setServer(undefined);
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'loading' }, reads: 2 });
		await waitForState(fixture.model.loadState, state => state.status === 'unavailable');
		fixture.setServer(undefined);
		assert.strictEqual(fixture.reads, 2);

		available = true;
		fixture.setServer(McpServerStatus.Starting);
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'loaded' }, reads: 3 });
	});

	test('does not retry after disposal', async () => {
		const fixture = createFixture(McpServerStatus.AuthRequired, async () => { throw new Error('Authentication required'); });
		await waitForState(fixture.model.loadState, state => state.status === 'unavailable');

		fixture.model.dispose();
		fixture.setServer(McpServerStatus.Ready);
		fixture.model.retry();
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads, htmlCount: fixture.html.length }, {
			state: { status: 'unavailable' }, reads: 1, htmlCount: 0,
		});
	});

	test('discovers app tools after initialization and registers the provider', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		const tools: MCP.Tool[] = [{ name: 'app_tool', description: 'App tool', inputSchema: { type: 'object' } }];
		const request = fixture.listRequests()[0];
		fixture.send({ jsonrpc: '2.0', id: request.id, result: { tools } });
		await waitForState(fixture.model.tools, value => value.length === 1);
		assert.deepStrictEqual({
			registered: fixture.registered === fixture.model,
			requests: fixture.listRequests().map(({ method, params }) => ({ method, params })),
			tools: fixture.model.tools.get(),
		}, { registered: true, requests: [{ method: 'tools/list', params: {} }], tools });
	});

	test('follows tool-list pagination and refreshes after list_changed', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		const first: MCP.Tool = { name: 'first', inputSchema: { type: 'object' } };
		const second: MCP.Tool = { name: 'second', inputSchema: { type: 'object' } };
		const nextPage = Event.toPromise(Event.filter(fixture.onDidPostMessage, message => hasKey(message, { method: true }) && message.method === 'tools/list' && message.params?.cursor === 'next'));
		fixture.send({ jsonrpc: '2.0', id: fixture.listRequests()[0].id, result: { tools: [first], nextCursor: 'next' } });
		await nextPage;
		fixture.send({ jsonrpc: '2.0', id: fixture.listRequests()[1].id, result: { tools: [second] } });
		await waitForState(fixture.model.tools, tools => tools.length === 2);
		const initialTools = fixture.model.tools.get();
		fixture.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
		fixture.send({ jsonrpc: '2.0', id: fixture.listRequests()[2].id, result: { tools: [second] } });
		await waitForState(fixture.model.tools, tools => tools.length === 1);
		assert.deepStrictEqual({ initialTools, tools: fixture.model.tools.get(), cursors: fixture.listRequests().map(request => request.params?.cursor) }, {
			initialTools: [first, second], tools: [second], cursors: [undefined, 'next', undefined],
		});
	});

	test('cancels superseded tool discovery and ignores its late response', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		const firstRequest = fixture.listRequests()[0];
		fixture.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
		const currentRequest = fixture.listRequests()[1];
		const current: MCP.Tool = { name: 'current', inputSchema: { type: 'object' } };
		fixture.send({ jsonrpc: '2.0', id: firstRequest.id, result: { tools: [{ name: 'stale', inputSchema: { type: 'object' } }] } });
		fixture.send({ jsonrpc: '2.0', id: currentRequest.id, result: { tools: [current] } });
		await waitForState(fixture.model.tools, tools => tools.length === 1);
		const cancellations = fixture.messages.filter((message): message is MCP.CancelledNotification => hasKey(message, { method: true }) && message.method === 'notifications/cancelled');
		assert.deepStrictEqual({ tools: fixture.model.tools.get(), cancelled: cancellations.map(message => message.params.requestId) }, {
			tools: [current], cancelled: [firstRequest.id],
		});
	});

	test('calls app tools and propagates JSON-RPC errors', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([]);
		const result: MCP.CallToolResult = { content: [{ type: 'text', text: 'app result' }] };
		const call = fixture.model.callTool('app_tool', { value: 42 }, CancellationToken.None);
		const request = fixture.messages.find((message): message is MCP.CallToolRequest => hasKey(message, { method: true }) && message.method === 'tools/call')!;
		fixture.send({ jsonrpc: '2.0', id: request.id, result });
		const actual = await call;
		const failedCall = fixture.model.callTool('app_tool', {}, CancellationToken.None);
		const errorRequest = fixture.messages.filter((message): message is MCP.CallToolRequest => hasKey(message, { method: true }) && message.method === 'tools/call').at(-1)!;
		const rejected = assert.rejects(failedCall, { message: 'App rejected the call' });
		fixture.send({ jsonrpc: '2.0', id: errorRequest.id, error: { code: -32000, message: 'App rejected the call' } });
		await rejected;
		assert.deepStrictEqual({ params: request.params, result: actual }, { params: { name: 'app_tool', arguments: { value: 42 } }, result });
	});

	test('cancels app tool calls asynchronously and ignores late results', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([]);
		const cts = store.add(new CancellationTokenSource());
		const call = fixture.model.callTool('app_tool', {}, cts.token);
		const request = fixture.messages.find((message): message is MCP.CallToolRequest => hasKey(message, { method: true }) && message.method === 'tools/call')!;
		const cancelled = assert.rejects(call, isCancellationError);
		cts.cancel();
		await cancelled;
		fixture.send({ jsonrpc: '2.0', id: request.id, result: { content: [] } });
		assert.deepStrictEqual(fixture.messages.filter((message): message is MCP.CancelledNotification => hasKey(message, { method: true }) && message.method === 'notifications/cancelled').map(message => message.params.requestId), [request.id]);
	});

	test('rejects calls before initialization and after disposal', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		await assert.rejects(fixture.model.callTool('app_tool', {}, CancellationToken.None), /not initialized/);
		fixture.model.dispose();
		await assert.rejects(fixture.model.callTool('app_tool', {}, CancellationToken.None), isCancellationError);
	});

	test('reinitialization clears tools and cancels calls from the previous app instance', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		fixture.send({ jsonrpc: '2.0', id: fixture.listRequests()[0].id, result: { tools: [{ name: 'old', inputSchema: { type: 'object' } }] } });
		await waitForState(fixture.model.tools, tools => tools.length === 1);
		const call = fixture.model.callTool('old', {}, CancellationToken.None);
		const cancelled = assert.rejects(call, isCancellationError);
		await fixture.initialize(false);
		await cancelled;
		assert.deepStrictEqual({ tools: fixture.model.tools.get(), requests: fixture.listRequests().length }, { tools: [], requests: 1 });
	});

	test('does not publish a tool-list response queued immediately before disposal', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		const request = fixture.listRequests()[0];
		fixture.send({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'late', inputSchema: { type: 'object' } }] } });
		fixture.model.dispose();
		await assert.rejects(fixture.model.callTool('late', {}, CancellationToken.None), isCancellationError);
		fixture.send({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'later', inputSchema: { type: 'object' } }] } });
		assert.deepStrictEqual({ tools: fixture.model.tools.get(), registered: fixture.registered }, { tools: [], registered: undefined });
	});

	test('local apps use overlay rendering without registering or discovering app tools', async () => {
		const fixture = createFixture(undefined, async () => resource, { kind: 'local' });
		await fixture.initialize();
		fixture.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
		fixture.model.remount();
		fixture.attachment.dispose();
		assert.deepStrictEqual({ tools: fixture.model.tools.get(), requests: fixture.listRequests(), registered: fixture.registered, context: fixture.context }, {
			tools: [], requests: [], registered: undefined, context: { alive: false, creations: 1, disposals: 1, retaining: false },
		});
	});

	test('agent-host apps without a tools capability are not queried', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize(false);
		fixture.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
		assert.deepStrictEqual({ requests: fixture.listRequests(), tools: fixture.model.tools.get() }, { requests: [], tools: [] });
	});

	test('clips visible and remounted overlays to the supplied container or nearest scrollable ancestor', async () => {
		const clippingContainer = dom.$('div');
		const explicit = createFixture(McpServerStatus.Ready, async () => resource, { serverName: 'verification' }, false, clippingContainer);
		const fallback = createFixture(McpServerStatus.Ready, async () => resource, { serverName: 'verification' }, false);
		const outer = dom.$('.monaco-scrollable-element');
		const scrollable = dom.$('.monaco-scrollable-element');
		outer.append(clippingContainer, scrollable);
		document.body.appendChild(outer);
		store.add(toDisposable(() => outer.remove()));
		scrollable.append(explicit.container, fallback.container);
		explicit.setVisible(true);
		explicit.model.remount();
		fallback.setVisible(true);
		fallback.model.remount();
		await Promise.all([explicit, fallback].map(fixture => waitForState(fixture.model.loadState, state => state.status === 'loaded')));
		assert.deepStrictEqual({ explicit: explicit.anchors, fallback: fallback.anchors }, {
			explicit: [[explicit.container, clippingContainer], [explicit.container, clippingContainer]],
			fallback: [[fallback.container, scrollable], [fallback.container, scrollable]],
		});
	});

	test('the latest attachment wins and detached layouts retain only their dimensions', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize(false);
		const width = observableValue('replacementWidth', 900);
		const maxHeight = observableValue('replacementHeight', 500);
		const attachment = store.add(fixture.model.attach(dom.$('div'), { targetWindow: dom.getWindow(fixture.container), currentWidth: width, maxHeight }));
		const beforeOldDetach = fixture.operations.length;
		fixture.attachment.dispose();
		const oldDetachOperations = fixture.operations.slice(beforeOldDetach);
		attachment.dispose();
		width.set(1200, undefined);
		maxHeight.set(700, undefined);
		assert.deepStrictEqual({ oldDetachOperations, dimensions: fixture.model.hostContext.get().containerDimensions, reads: fixture.reads }, {
			oldDetachOperations: [], dimensions: { width: 900, maxHeight: 500 }, reads: 1,
		});
	});

	for (const kind of ['local', 'agentHost'] as const) {
		test(`${kind} non-tool apps dispose hidden contexts and recreate them without rereading resources`, async () => {
			const fixture = createFixture(McpServerStatus.Ready, async () => resource, { kind, serverName: 'verification' });
			await fixture.initialize(false);
			const start = fixture.operations.length;
			fixture.setVisible(false);
			const hidden = fixture.context;
			await assert.rejects(fixture.model.callTool('old', {}, CancellationToken.None), /not initialized/);
			fixture.setVisible(true);
			await fixture.initialize(false);
			fixture.model.remount();
			assert.deepStrictEqual({ initiallyRetaining: fixture.initiallyRetaining, hidden, shown: fixture.context, operations: fixture.operations.slice(start), reads: fixture.reads, htmlCount: fixture.html.length }, {
				initiallyRetaining: false,
				hidden: { alive: false, creations: 1, disposals: 1, retaining: false },
				shown: { alive: true, creations: 2, disposals: 1, retaining: false },
				operations: ['release', 'claim', 'anchor', 'anchor'], reads: 1, htmlCount: 1,
			});
		});
	}

	test('does not start an offscreen iframe when attaching or loading cached HTML', async () => {
		const fixture = createFixture(McpServerStatus.Ready, async () => resource, { serverName: 'verification' }, false);
		await waitForState(fixture.model.loadState, state => state.status === 'loaded');
		assert.deepStrictEqual({ context: fixture.context, operations: fixture.operations, htmlCount: fixture.html.length }, {
			context: { alive: false, creations: 0, disposals: 0, retaining: false }, operations: ['create'], htmlCount: 1,
		});
		fixture.setVisible(true);
		await fixture.initialize(false);
		assert.deepStrictEqual(fixture.context, { alive: true, creations: 1, disposals: 0, retaining: false });
	});

	test('advertising tools alone does not retain the frame or keep pending discovery alive', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		fixture.setVisible(false);
		fixture.send({ jsonrpc: '2.0', id: fixture.listRequests()[0].id, result: { tools: [{ name: 'late', inputSchema: { type: 'object' } }] } });
		await assert.rejects(fixture.model.callTool('late', {}, CancellationToken.None), /not initialized/);
		fixture.setVisible(true);
		fixture.send({ method: 'ui/notifications/initialized' });
		assert.deepStrictEqual({ context: fixture.context, tools: fixture.model.tools.get(), requests: fixture.listRequests().length }, {
			context: { alive: true, creations: 2, disposals: 1, retaining: false }, tools: [], requests: 1,
		});
		await fixture.initialize();
		await fixture.respondTools([]);
	});

	test('an empty tool list leaves an agent-host frame nonretaining and recreatable', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([]);
		const listed = fixture.context;
		fixture.setVisible(false);
		const hidden = fixture.context;
		fixture.setVisible(true);
		await fixture.initialize(false);
		assert.deepStrictEqual({ listed, hidden, recreated: fixture.context, reads: fixture.reads }, {
			listed: { alive: true, creations: 1, disposals: 0, retaining: false },
			hidden: { alive: false, creations: 1, disposals: 1, retaining: false },
			recreated: { alive: true, creations: 2, disposals: 1, retaining: false },
			reads: 1,
		});
	});

	test('retains an actual tool provider across hiding and reattachment without resource reloads', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([{ name: 'app.tool', inputSchema: { type: 'object' } }]);
		fixture.setVisible(false);
		const hidden = fixture.context;
		fixture.attachment.dispose();
		const container = dom.$('div');
		container.style.cssText = 'width: 100px; height: 100px;';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(fixture.model.attach(container, { targetWindow: dom.getWindow(container), maxHeight: constObservable(600), currentWidth: constObservable(800) }));
		fixture.setVisible(true, container);
		assert.deepStrictEqual({ hidden, reattached: fixture.context, reads: fixture.reads, htmlCount: fixture.html.length, tools: fixture.model.tools.get().map(tool => tool.name) }, {
			hidden: { alive: true, creations: 1, disposals: 0, retaining: true },
			reattached: { alive: true, creations: 1, disposals: 0, retaining: true },
			reads: 1, htmlCount: 1, tools: ['app.tool'],
		});
	});

	test('withdrawing the last hidden tool destroys the retained iframe and resets protocol state', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([{ name: 'app.tool', inputSchema: { type: 'object' } }]);
		const call = fixture.model.callTool('app.tool', {}, CancellationToken.None);
		const cancelled = assert.rejects(call, isCancellationError);
		fixture.setVisible(false);
		fixture.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
		await fixture.respondTools([]);
		await cancelled;
		const beforeContextChange = fixture.messages.length;
		fixture.currentWidth.set(900, undefined);
		const contextMessages = fixture.messages.slice(beforeContextChange);
		fixture.setVisible(true);
		fixture.send({ method: 'ui/notifications/initialized' });
		await assert.rejects(fixture.model.callTool('app.tool', {}, CancellationToken.None), /not initialized/);
		assert.deepStrictEqual({ tools: fixture.model.tools.get(), context: fixture.context, requests: fixture.listRequests().length, contextMessages }, {
			tools: [], context: { alive: true, creations: 2, disposals: 1, retaining: false }, requests: 2, contextMessages: [],
		});
		await fixture.initialize();
		await fixture.respondTools([]);
	});

	for (const visible of [false, true]) {
		test(`changing hidden retention eligibility preserves the model and visible apps (visible: ${visible})`, async () => {
			const fixture = createFixture(McpServerStatus.Ready);
			const tools: MCP.Tool[] = [{ name: 'app.tool', inputSchema: { type: 'object' } }];
			await fixture.initialize();
			await fixture.respondTools(tools);
			if (!visible) {
				fixture.setVisible(false);
			}
			fixture.model.setHiddenRetentionEnabled(false);
			const afterPolicyChange = { context: fixture.context, tools: fixture.model.tools.get() };
			fixture.setVisible(false);
			const hidden = { context: fixture.context, tools: fixture.model.tools.get() };
			fixture.setVisible(true);
			await fixture.initialize();
			await fixture.respondTools(tools);
			const reappeared = { context: fixture.context, tools: fixture.model.tools.get() };
			fixture.model.setHiddenRetentionEnabled(true);
			fixture.setVisible(false);
			assert.deepStrictEqual({ afterPolicyChange, hidden, reappeared, eligibleAgain: fixture.context, reads: fixture.reads }, {
				afterPolicyChange: visible
					? { context: { alive: true, creations: 1, disposals: 0, retaining: false }, tools }
					: { context: { alive: false, creations: 1, disposals: 1, retaining: false }, tools: [] },
				hidden: { context: { alive: false, creations: 1, disposals: 1, retaining: false }, tools: [] },
				reappeared: { context: { alive: true, creations: 2, disposals: 1, retaining: false }, tools },
				eligibleAgain: { alive: true, creations: 2, disposals: 1, retaining: true },
				reads: 1,
			});
		});
	}

	for (const providesTools of [false, true]) {
		test(`reinitializing a hidden provider destroys its iframe and does not restore stale protocol state (tools capability: ${providesTools})`, async () => {
			const fixture = createFixture(McpServerStatus.Ready);
			await fixture.initialize();
			await fixture.respondTools([{ name: 'app.tool', inputSchema: { type: 'object' } }]);
			const call = fixture.model.callTool('app.tool', {}, CancellationToken.None);
			const cancelled = assert.rejects(call, isCancellationError);
			fixture.setVisible(false);
			fixture.send({
				jsonrpc: '2.0', id: 'hidden-initialize', method: 'ui/initialize',
				params: {
					appInfo: { name: 'test', version: '1' },
					appCapabilities: providesTools ? { tools: { listChanged: true } } : {},
					protocolVersion: McpApps.LATEST_PROTOCOL_VERSION,
				},
			});
			await cancelled;
			const hidden = fixture.context;
			const beforeContextChange = fixture.messages.length;
			fixture.currentWidth.set(900, undefined);
			const contextMessages = fixture.messages.slice(beforeContextChange);
			fixture.setVisible(true);
			fixture.send({ method: 'ui/notifications/initialized' });
			await assert.rejects(fixture.model.callTool('app.tool', {}, CancellationToken.None), /not initialized/);
			assert.deepStrictEqual({
				hidden, recreated: fixture.context, tools: fixture.model.tools.get(),
				listRequests: fixture.listRequests().length, contextMessages,
				initializeResponses: fixture.messages.filter(message => !hasKey(message, { method: true }) && message.id === 'hidden-initialize'),
			}, {
				hidden: { alive: false, creations: 1, disposals: 1, retaining: false },
				recreated: { alive: true, creations: 2, disposals: 1, retaining: false },
				tools: [], listRequests: 1, contextMessages: [], initializeResponses: [],
			});
			await fixture.initialize(providesTools);
			if (providesTools) {
				await fixture.respondTools([]);
			}
		});
	}

	test('moving a retained provider to a different window resets the old context without destroying the newly claimed frame', async () => {
		const fixture = createFixture(McpServerStatus.Ready);
		await fixture.initialize();
		await fixture.respondTools([{ name: 'old.tool', inputSchema: { type: 'object' } }]);
		const call = fixture.model.callTool('old.tool', {}, CancellationToken.None);
		const cancelled = assert.rejects(call, isCancellationError);
		fixture.attachment.dispose();
		const frame = dom.$<HTMLIFrameElement>('iframe');
		document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		assert.ok(frame.contentDocument?.body);
		const container = dom.$('div');
		container.style.cssText = 'width: 100px; height: 100px;';
		const targetWindow = dom.getWindow(frame.contentDocument.body);
		store.add(fixture.model.attach(container, { targetWindow, maxHeight: constObservable(600), currentWidth: constObservable(800) }));
		const observerWindow = fixture.observerWindows.at(-1);
		frame.contentDocument.body.appendChild(container);
		fixture.setVisible(true, container);
		await cancelled;
		const claimed = fixture.context;
		const resetTools = fixture.model.tools.get();
		await fixture.initialize();
		await fixture.respondTools([{ name: 'new.tool', inputSchema: { type: 'object' } }]);
		assert.deepStrictEqual({ observerInDestination: observerWindow === targetWindow, claimedInDestination: fixture.contextWindow === targetWindow, claimed, resetTools, initialized: fixture.context, tools: fixture.model.tools.get().map(tool => tool.name), reads: fixture.reads }, {
			observerInDestination: true, claimedInDestination: true,
			claimed: { alive: true, creations: 2, disposals: 1, retaining: false },
			resetTools: [],
			initialized: { alive: true, creations: 2, disposals: 1, retaining: true },
			tools: ['new.tool'], reads: 1,
		});
	});

	test('keeps responses and tools isolated between app instances with the same request ids', async () => {
		const first = createFixture(McpServerStatus.Ready);
		const second = createFixture(McpServerStatus.Ready);
		await first.initialize();
		await second.initialize();
		const tool: MCP.Tool = { name: 'second_app_tool', inputSchema: { type: 'object' } };
		second.send({ jsonrpc: '2.0', id: second.listRequests()[0].id, result: { tools: [tool] } });
		await waitForState(second.model.tools, tools => tools.length === 1);
		assert.deepStrictEqual({ firstTools: first.model.tools.get(), secondTools: second.model.tools.get() }, { firstTools: [], secondTools: [tool] });
		first.send({ jsonrpc: '2.0', id: first.listRequests()[0].id, result: { tools: [{ name: 'first_app_tool', inputSchema: { type: 'object' } }] } });
		await waitForState(first.model.tools, tools => tools.length === 1);
	});

});
