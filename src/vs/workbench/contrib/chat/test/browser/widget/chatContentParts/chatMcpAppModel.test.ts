/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { constObservable, observableValue, waitForState } from '../../../../../../../base/common/observable.js';
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
import { McpApps } from '../../../../../mcp/common/modelContextProtocolApps.js';
import { IWebviewElement, IWebviewService } from '../../../../../webview/browser/webview.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { ChatMcpAppModel } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppModel.js';
import { IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatResponseResourceFileSystemProvider } from '../../../../common/widget/chatResponseResourceFileSystemProvider.js';

suite('ChatMcpAppModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('agent-host-copilotcli://remote-host/session');
	const resource: IMcpAppResourceContent = { html: '<html>Verification app</html>', mimeType: 'text/html' };
	type Server = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

	function createFixture(initialStatus: McpServerStatus | undefined, loadResource: () => Promise<IMcpAppResourceContent> = async () => resource, renderData: { serverName?: string } = { serverName: 'verification' }) {
		const onDidChangeCustomizations = store.add(new Emitter<void>());
		const createServer = (status: McpServerStatus, overrides: Partial<Server> = {}) => upcastPartial<Server>({
			id: 'live-plugin-server-id',
			name: 'verification',
			status,
			...overrides,
		});
		let servers: readonly Server[] = initialStatus === undefined ? [] : [createServer(initialStatus)];
		let reads = 0;
		const html: string[] = [];
		const webview = upcastPartial<IWebviewElement>({
			onMessage: Event.None,
			mountTo: () => { },
			setHtml: content => { html.push(content); },
			dispose: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({
				onDidChangeCustomizations: onDidChangeCustomizations.event,
				getMcpServers: session => {
					assert.deepStrictEqual(session, sessionResource);
					return servers;
				},
			})],
			[IWebviewService, upcastPartial<IWebviewService>({ createWebviewElement: () => webview })],
			[IStorageService, store.add(new InMemoryStorageService())],
			[ILogService, store.add(new NullLogService())],
			[IChatWidgetService, upcastPartial<IChatWidgetService>({})],
			[IChatResponseResourceFileSystemProvider, upcastPartial<IChatResponseResourceFileSystemProvider>({})],
			[IProductService, upcastPartial<IProductService>({})],
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
		const model = store.add(instantiationService.createInstance(ChatMcpAppModel,
			upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId: 'call', toolId: 'verification' }),
			{
				kind: 'agentHost', serverId: 'replayed-contributor-id', ...renderData,
				channel: 'mcp://opaque-host-channel', resourceUri: 'ui://verification/app',
				connectionAuthority: 'remote-host', sessionResource, input: '{}',
			},
			document.createElement('div'),
			observableValue('maxHeight', 600),
			observableValue('currentWidth', 800),
		));
		return {
			model, html,
			get reads() { return reads; },
			setServer(status: McpServerStatus | undefined, overrides: Partial<Server> = {}) {
				servers = status === undefined ? [] : [createServer(status, overrides)];
				onDidChangeCustomizations.fire();
			},
		};
	}

	test('loads immediately even when the matched server is not Ready', async () => {
		const read = new DeferredPromise<IMcpAppResourceContent>();
		const fixture = createFixture(McpServerStatus.Starting, () => read.p);
		assert.deepStrictEqual({ state: fixture.model.loadState.get(), reads: fixture.reads }, { state: { status: 'loading' }, reads: 1 });

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
});
