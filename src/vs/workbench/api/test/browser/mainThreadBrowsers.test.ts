/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { CDPRequest, CDPResponse } from '../../../../platform/browserView/common/cdp/types.js';
import { IBrowserViewCDPService, IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../contrib/browserView/common/browserView.js';
import { BrowserTabDto, ExtHostBrowsersShape, ExtHostContext } from '../../common/extHost.protocol.js';
import { MainThreadBrowsers } from '../../browser/mainThreadBrowsers.js';
import { TestEditorGroupsService, TestEditorService } from '../../../test/browser/workbenchTestServices.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';

suite('MainThreadBrowsers', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let proxy: MockExtHostBrowsersProxy;
	let editorService: TestEditorService;
	let browserViewService: MockBrowserViewWorkbenchService;
	let cdpService: MockBrowserViewCDPService;
	let editorGroupsService: TestEditorGroupsService;
	let configurationService: TestConfigurationService;

	class MockExtHostBrowsersProxy implements ExtHostBrowsersShape {
		openedTabs: BrowserTabDto[] = [];
		closedTabIds: string[] = [];
		activeTabChanges: (BrowserTabDto | undefined)[] = [];
		tabChanges: { id: string; data: Partial<BrowserTabDto> }[] = [];
		cdpMessages: { sessionId: string; message: unknown }[] = [];
		closedSessions: string[] = [];

		$onDidOpenBrowserTab(browser: BrowserTabDto): void {
			this.openedTabs.push(browser);
		}
		$onDidCloseBrowserTab(browserId: string): void {
			this.closedTabIds.push(browserId);
		}
		$onDidChangeActiveBrowserTab(browser: BrowserTabDto | undefined): void {
			this.activeTabChanges.push(browser);
		}
		$onDidChangeBrowserTab(browserId: string, data: BrowserTabDto): void {
			this.tabChanges.push({ id: browserId, data });
		}
		$onCDPSessionMessage(sessionId: string, message: CDPResponse): void {
			this.cdpMessages.push({ sessionId, message });
		}
		$onCDPSessionClosed(sessionId: string): void {
			this.closedSessions.push(sessionId);
		}
	}

	class MockBrowserViewModelWithEmitters {
		readonly navigateEmitter = new Emitter<{ url: string }>();
		readonly titleEmitter = new Emitter<{ title: string }>();
		readonly faviconEmitter = new Emitter<{ favicon: string }>();
		readonly closeEmitter = new Emitter<void>();

		readonly onDidNavigate = this.navigateEmitter.event;
		readonly onDidChangeTitle = this.titleEmitter.event;
		readonly onDidChangeFavicon = this.faviconEmitter.event;
		readonly onDidClose = this.closeEmitter.event;

		constructor(
			readonly id: string,
			public url: string = 'about:blank',
			public title: string = '',
			public favicon: string | undefined = undefined,
		) { }

		dispose(): void {
			this.navigateEmitter.dispose();
			this.titleEmitter.dispose();
			this.faviconEmitter.dispose();
			this.closeEmitter.dispose();
		}
	}

	class MockBrowserViewWorkbenchService extends mock<IBrowserViewWorkbenchService>() {
		private readonly _models = new Map<string, MockBrowserViewModelWithEmitters>();
		/** When set, getBrowserViewModel returns this for any unknown ID */
		defaultModel: MockBrowserViewModelWithEmitters | undefined;

		registerModel(model: MockBrowserViewModelWithEmitters): void {
			this._models.set(model.id, model);
		}

		override async getBrowserViewModel(id: string): Promise<IBrowserViewModel> {
			const model = this._models.get(id) ?? this.defaultModel;
			if (!model) {
				throw new Error(`No model for ${id}`);
			}
			return model as unknown as IBrowserViewModel;
		}

		override async getOrCreateBrowserViewModel(id: string): Promise<IBrowserViewModel> {
			return this.getBrowserViewModel(id);
		}
	}

	class MockBrowserViewCDPService extends mock<IBrowserViewCDPService>() {
		private readonly _messageEmitters = new Map<string, Emitter<CDPResponse>>();
		private readonly _destroyEmitters = new Map<string, Emitter<void>>();
		private _groupCounter = 0;
		sentMessages: { groupId: string; message: CDPRequest }[] = [];
		destroyedGroups: string[] = [];
		/** All group IDs created, in order. */
		createdGroupIds: string[] = [];

		override async createSessionGroup(_browserId: string): Promise<string> {
			const groupId = `group-${this._groupCounter++}`;
			this._messageEmitters.set(groupId, new Emitter<CDPResponse>());
			this._destroyEmitters.set(groupId, new Emitter<void>());
			this.createdGroupIds.push(groupId);
			return groupId;
		}

		override async destroySessionGroup(groupId: string): Promise<void> {
			this.destroyedGroups.push(groupId);
		}

		override async sendCDPMessage(groupId: string, message: CDPRequest): Promise<void> {
			this.sentMessages.push({ groupId, message });
		}

		override onCDPMessage(groupId: string): Event<CDPResponse> {
			return this._messageEmitters.get(groupId)?.event ?? Event.None;
		}

		override onDidDestroy(groupId: string): Event<void> {
			return this._destroyEmitters.get(groupId)?.event ?? Event.None;
		}

		simulateMessage(groupId: string, message: CDPResponse): void {
			this._messageEmitters.get(groupId)?.fire(message);
		}

		simulateDestroy(groupId: string): void {
			this._destroyEmitters.get(groupId)?.fire();
		}

		disposeAll(): void {
			for (const e of this._messageEmitters.values()) {
				e.dispose();
			}
			for (const e of this._destroyEmitters.values()) {
				e.dispose();
			}
		}
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		proxy = new MockExtHostBrowsersProxy();
		editorService = disposables.add(new TestEditorService());
		browserViewService = new MockBrowserViewWorkbenchService();
		cdpService = new MockBrowserViewCDPService();
		editorGroupsService = new TestEditorGroupsService();
		configurationService = new TestConfigurationService();
	});

	teardown(() => {
		cdpService.disposeAll();
	});

	function createMainThreadBrowsers(): MainThreadBrowsers {
		const rpc = SingleProxyRPCProtocol(proxy);
		rpc.set(ExtHostContext.ExtHostBrowsers, proxy);

		return disposables.add(new MainThreadBrowsers(
			rpc,
			editorService,
			browserViewService as unknown as IBrowserViewWorkbenchService,
			cdpService as unknown as IBrowserViewCDPService,
			editorGroupsService,
			configurationService,
		));
	}

	// #region $openBrowserTab

	test('$openBrowserTab resolves with correct DTO for about:blank', async () => {
		const model = new MockBrowserViewModelWithEmitters('test-id', 'about:blank', 'about:blank');
		disposables.add(model);
		// Use defaultModel since $openBrowserTab generates a random UUID
		browserViewService.defaultModel = model;

		editorService.openEditor = async () => undefined;

		const main = createMainThreadBrowsers();

		const dto = await main.$openBrowserTab('about:blank', undefined, undefined);
		assert.strictEqual(dto.url, 'about:blank');
		assert.strictEqual(dto.title, 'about:blank');
		assert.strictEqual(dto.favicon, undefined);
	});

	// #endregion

	// #region CDP sessions

	test('$startCDPSession creates a session and $sendCDPMessage routes messages', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1');
		disposables.add(model);
		browserViewService.registerModel(model);

		const main = createMainThreadBrowsers();

		await main.$startCDPSession('session-1', 'browser-1');

		const message: CDPRequest = { id: 1, method: 'Page.enable' };
		await main.$sendCDPMessage('session-1', message);

		assert.strictEqual(cdpService.sentMessages.length, 1);
		assert.strictEqual(cdpService.sentMessages[0].message.method, 'Page.enable');
	});

	test('$closeCDPSession cleans up and fires $onCDPSessionClosed', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1');
		disposables.add(model);
		browserViewService.registerModel(model);

		const main = createMainThreadBrowsers();

		await main.$startCDPSession('session-1', 'browser-1');
		await main.$closeCDPSession('session-1');

		assert.ok(proxy.closedSessions.includes('session-1'));
	});

	test('CDP message from service is forwarded to ext host', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1');
		disposables.add(model);
		browserViewService.registerModel(model);

		const main = createMainThreadBrowsers();

		await main.$startCDPSession('session-1', 'browser-1');

		const groupId = cdpService.createdGroupIds[0];
		cdpService.simulateMessage(groupId, { id: 42, result: { value: 'test' } });

		assert.strictEqual(proxy.cdpMessages.length, 1);
		assert.strictEqual(proxy.cdpMessages[0].sessionId, 'session-1');
		assert.deepStrictEqual(proxy.cdpMessages[0].message, { id: 42, result: { value: 'test' } });
	});

	// #endregion

	// #region $closeBrowserTab

	test('$closeBrowserTab disposes model and waits for close', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1');
		disposables.add(model);
		browserViewService.defaultModel = model;

		const main = createMainThreadBrowsers();

		// Open the tab first so the model is tracked
		editorService.openEditor = async () => undefined;
		await main.$openBrowserTab('about:blank', undefined, undefined);

		// Fire close before disposing so listeners receive it
		model.dispose = () => {
			model.closeEmitter.fire();
		};

		await main.$closeBrowserTab('browser-1');
		assert.ok(proxy.closedTabIds.includes('browser-1'));
	});

	// #endregion

	// #region Model tracking events

	test('model navigation fires $onDidChangeBrowserTab', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1', 'https://old.com', 'Old');
		disposables.add(model);
		browserViewService.defaultModel = model;

		const main = createMainThreadBrowsers();

		// Resolve and track the model by opening a tab
		editorService.openEditor = async () => undefined;
		await main.$openBrowserTab('about:blank', undefined, undefined);

		// Simulate navigation
		model.url = 'https://new.com';
		model.navigateEmitter.fire({ url: 'https://new.com' });

		assert.ok(proxy.tabChanges.length >= 1);
		const lastChange = proxy.tabChanges[proxy.tabChanges.length - 1];
		assert.strictEqual(lastChange.id, 'browser-1');
		assert.strictEqual(lastChange.data.url, 'https://new.com');
	});

	test('model title change fires $onDidChangeBrowserTab', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1', 'https://example.com', 'Old Title');
		disposables.add(model);
		browserViewService.defaultModel = model;

		const main = createMainThreadBrowsers();
		editorService.openEditor = async () => undefined;
		await main.$openBrowserTab('about:blank', undefined, undefined);

		model.title = 'New Title';
		model.titleEmitter.fire({ title: 'New Title' });

		assert.ok(proxy.tabChanges.length >= 1);
		const lastChange = proxy.tabChanges[proxy.tabChanges.length - 1];
		assert.strictEqual(lastChange.data.title, 'New Title');
	});

	test('model favicon change fires $onDidChangeBrowserTab', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1', 'https://example.com', 'Title', undefined);
		disposables.add(model);
		browserViewService.defaultModel = model;

		const main = createMainThreadBrowsers();
		editorService.openEditor = async () => undefined;
		await main.$openBrowserTab('about:blank', undefined, undefined);

		model.favicon = 'https://example.com/favicon.ico';
		model.faviconEmitter.fire({ favicon: 'https://example.com/favicon.ico' });

		assert.ok(proxy.tabChanges.length >= 1);
		const lastChange = proxy.tabChanges[proxy.tabChanges.length - 1];
		assert.strictEqual(lastChange.data.favicon, 'https://example.com/favicon.ico');
	});

	test('model close fires $onDidCloseBrowserTab', async () => {
		const model = new MockBrowserViewModelWithEmitters('browser-1');
		disposables.add(model);
		browserViewService.defaultModel = model;

		const main = createMainThreadBrowsers();
		editorService.openEditor = async () => undefined;
		await main.$openBrowserTab('about:blank', undefined, undefined);

		model.closeEmitter.fire();

		assert.ok(proxy.closedTabIds.includes('browser-1'));
	});

	// #endregion
});
