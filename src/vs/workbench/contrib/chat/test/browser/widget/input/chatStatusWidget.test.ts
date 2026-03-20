/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IChatDetail, IChatService, ResponseModelState } from '../../../../common/chatService/chatService.js';
import { MockChatService } from '../../../common/chatService/mockChatService.js';
import { ChatStatusWidget } from '../../../../browser/widget/input/chatStatusWidget.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { URI } from '../../../../../../../base/common/uri.js';

class MockChatEntitlementService implements IChatEntitlementService {
	_serviceBrand: undefined;

	readonly onDidChangeEntitlement = Event.None;
	readonly onDidChangeQuotaExceeded = Event.None;
	readonly onDidChangeQuotaRemaining = Event.None;
	readonly onDidChangeSentiment = Event.None;
	readonly onDidChangeAnonymous = Event.None;

	entitlement = ChatEntitlement.Unknown;
	entitlementObs = observableValue(this, ChatEntitlement.Unknown);
	previewFeaturesDisabled = false;
	organisations: string[] | undefined;
	isInternal = false;
	sku: string | undefined;
	copilotTrackingId: string | undefined;
	anonymous = false;
	anonymousObs = observableValue(this, false);
	sentiment: IChatSentiment = {};
	sentimentObs = observableValue<IChatSentiment>(this, {});
	quotas: IChatEntitlementService['quotas'] = {};

	async update(_token: CancellationToken): Promise<void> { }
	markAnonymousRateLimited(): void { }
}

class TestChatService extends MockChatService {
	private _history: Awaited<ReturnType<IChatService['getHistorySessionItems']>> = [];

	setHistory(items: Awaited<ReturnType<IChatService['getHistorySessionItems']>>): void {
		this._history = items;
	}

	override async getHistorySessionItems(): Promise<Awaited<ReturnType<IChatService['getHistorySessionItems']>>> {
		return this._history;
	}
}

suite('ChatStatusWidget', () => {

	let store: DisposableStore;
	let entitlementService: MockChatEntitlementService;
	let chatService: TestChatService;
	let configService: TestConfigurationService;

	setup(() => {
		store = new DisposableStore();
		entitlementService = new MockChatEntitlementService();
		chatService = new TestChatService();
		configService = new TestConfigurationService();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(): ChatStatusWidget {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(configService)),
		}, store);
		instaService.stub(IChatEntitlementService, entitlementService);
		instaService.stub(IChatService, chatService);
		instaService.stub(IConfigurationService, configService);
		store.add(instaService);
		return store.add(instaService.createInstance(ChatStatusWidget));
	}

	test('hidden by default when no conditions are met', () => {
		const widget = createWidget();
		assert.strictEqual(widget.domNode.style.display, 'none');
	});

	test('shows free quota-exceeded banner for free tier users', () => {
		entitlementService.entitlement = ChatEntitlement.Free;
		entitlementService.quotas = { chat: { total: 50, remaining: 0, percentRemaining: 0, overageEnabled: false, overageCount: 0, unlimited: false } };

		const widget = createWidget();
		assert.strictEqual(widget.domNode.style.display, '');
		assert.ok(widget.domNode.querySelector('.chat-status-button'));
	});

	test('shows anonymous quota-exceeded banner when experiment enabled', () => {
		entitlementService.anonymous = true;
		entitlementService.quotas = { chat: { total: 50, remaining: 0, percentRemaining: 0, overageEnabled: false, overageCount: 0, unlimited: false } };
		configService.setUserConfiguration('chat.statusWidget.anonymous', true);

		const widget = createWidget();
		assert.strictEqual(widget.domNode.style.display, '');
		assert.ok(widget.domNode.querySelector('.chat-status-button'));
	});

	test('does not show quota banner when quota not exceeded', () => {
		entitlementService.entitlement = ChatEntitlement.Free;
		entitlementService.quotas = { chat: { total: 50, remaining: 25, percentRemaining: 50, overageEnabled: false, overageCount: 0, unlimited: false } };

		const widget = createWidget();
		assert.strictEqual(widget.domNode.style.display, 'none');
	});

	test('shows welcome banner for anonymous user with empty history', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = true;
			chatService.setHistory([]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', true);

			const widget = createWidget();
			await timeout(0);

			assert.strictEqual(widget.domNode.style.display, '');
			assert.ok(widget.domNode.querySelector('.chat-status-icon'));
			assert.ok(widget.domNode.querySelector('.chat-status-dismiss'));
		});
	});

	test('does not show welcome banner when user has history', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = true;
			chatService.setHistory([{
				sessionResource: URI.parse('test://session'),
				title: 'test',
				lastMessageDate: Date.now(),
				timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
				isActive: false,
				lastResponseState: ResponseModelState.Complete,
			} satisfies IChatDetail]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', true);

			const widget = createWidget();
			await timeout(0);

			assert.strictEqual(widget.domNode.style.display, 'none');
		});
	});

	test('does not show welcome banner when previously dismissed', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = true;
			chatService.setHistory([]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', true);

			const instaService = workbenchInstantiationService({
				contextKeyService: () => store.add(new ContextKeyService(configService)),
			}, store);
			instaService.stub(IChatEntitlementService, entitlementService);
			instaService.stub(IChatService, chatService);
			instaService.stub(IConfigurationService, configService);
			store.add(instaService);

			// Pre-set dismissed in storage
			instaService.get(IStorageService).store('chat.noAuthWidget.dismissed', true, StorageScope.PROFILE, StorageTarget.USER);

			const widget = store.add(instaService.createInstance(ChatStatusWidget));
			await timeout(0);

			assert.strictEqual(widget.domNode.style.display, 'none');
		});
	});

	test('dismiss button persists dismissal to storage', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = true;
			chatService.setHistory([]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', true);

			const instaService = workbenchInstantiationService({
				contextKeyService: () => store.add(new ContextKeyService(configService)),
			}, store);
			instaService.stub(IChatEntitlementService, entitlementService);
			instaService.stub(IChatService, chatService);
			instaService.stub(IConfigurationService, configService);
			store.add(instaService);

			const widget = store.add(instaService.createInstance(ChatStatusWidget));
			await timeout(0);

			const dismissButton = widget.domNode.querySelector('.chat-status-dismiss') as HTMLElement;
			assert.ok(dismissButton);
			dismissButton.click();

			assert.strictEqual(widget.domNode.style.display, 'none');
			assert.strictEqual(
				instaService.get(IStorageService).getBoolean('chat.noAuthWidget.dismissed', StorageScope.PROFILE, false),
				true
			);
		});
	});

	test('does not show welcome banner when experiment is disabled', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = true;
			chatService.setHistory([]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', false);

			const widget = createWidget();
			await timeout(0);

			assert.strictEqual(widget.domNode.style.display, 'none');
		});
	});

	test('does not show welcome banner for non-anonymous users', () => {
		return runWithFakedTimers({}, async () => {
			entitlementService.anonymous = false;
			entitlementService.entitlement = ChatEntitlement.Pro;
			chatService.setHistory([]);
			configService.setUserConfiguration('chat.noAuthWidget.enabled', true);

			const widget = createWidget();
			await timeout(0);

			assert.strictEqual(widget.domNode.style.display, 'none');
		});
	});
});
