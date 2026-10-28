/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { AgentsActivityService } from '../../../../services/activity/browser/agentsActivityService.js';
import { CustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { SessionsNavigation } from '../../../../services/sessions/browser/sessionNavigation.js';
import { SessionsRecencyHistory } from '../../../../services/sessions/browser/sessionsRecencyHistory.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CHAT_INBOX_ENABLED_SETTING, INBOX_NOTIFICATIONS_VIEW_ID } from '../../browser/inboxNotificationsConstants.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { InboxNotificationsCustomViewContribution } from '../../browser/inboxOne.contribution.js';

suite('InboxNotificationsCustomViewContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(enabled: boolean, storageService = disposables.add(new InMemoryStorageService())) {
		const configurationService = new TestConfigurationService({ [CHAT_INBOX_ENABLED_SETTING]: enabled });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const sentiment = observableValue<IChatSentiment>('test.chatSentiment', {});
		const events: string[] = [];
		const activityService = disposables.add(new AgentsActivityService(upcastPartial<ITelemetryService>({
			publicLog2: eventName => { events.push(eventName); },
		}), upcastPartial<IHostService>({ hasFocus: true })));
		const customViewService = disposables.add(new CustomViewService(new NullLogService(), storageService));
		disposables.add(new InboxNotificationsCustomViewContribution(
			configurationService,
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			customViewService,
			activityService,
		));
		return {
			customViewService, activityService, sentiment, storageService, events,
			async setEnabled(value: boolean): Promise<void> {
				await configurationService.setUserConfiguration(CHAT_INBOX_ENABLED_SETTING, value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === CHAT_INBOX_ENABLED_SETTING,
				}));
			},
		};
	}

	test('blocks explicit and history opens while disabled without enabling activity tracking', () => {
		const { customViewService, activityService, events } = createFixture(false);
		customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		const explicit = customViewService.activeCustomView.get()?.id;
		customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID, { source: 'history' });
		activityService.reportActiveSurface('automations');
		activityService.reportActiveSurface('customization');
		assert.deepStrictEqual({ explicit, history: customViewService.activeCustomView.get()?.id, events }, {
			explicit: undefined, history: undefined, events: [],
		});
	});

	test('hides Inbox on disable and allows opening it again after reenabling', async () => {
		const fixture = createFixture(true);
		fixture.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		const enabledView = fixture.customViewService.activeCustomView.get()?.id;
		await fixture.setEnabled(false);
		const disabledView = fixture.customViewService.activeCustomView.get()?.id;
		fixture.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID, { source: 'history' });
		const disabledHistoryView = fixture.customViewService.activeCustomView.get()?.id;
		await fixture.setEnabled(true);
		fixture.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		assert.deepStrictEqual({ enabledView, disabledView, disabledHistoryView, reenabledView: fixture.customViewService.activeCustomView.get()?.id }, {
			enabledView: INBOX_NOTIFICATIONS_VIEW_ID, disabledView: undefined, disabledHistoryView: undefined, reenabledView: INBOX_NOTIFICATIONS_VIEW_ID,
		});
	});

	test('navigation skips disabled Inbox history entries', async () => {
		const fixture = createFixture(true);
		const history = disposables.add(new SessionsRecencyHistory(fixture.storageService, new NullLogService()));
		const navigation = disposables.add(new SessionsNavigation(
			{
				openSession: async () => { },
				openChat: async () => { },
				openNewSession: async () => fixture.customViewService.hideCustomView(),
			},
			constObservable(undefined),
			fixture.customViewService,
			upcastPartial<ISessionsManagementService>({}),
			history,
			new MockContextKeyService(),
			new NullLogService(),
		));
		fixture.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		fixture.customViewService.hideCustomView();
		await fixture.setEnabled(false);
		await navigation.goBack();
		assert.deepStrictEqual({
			activeView: fixture.customViewService.activeCustomView.get()?.id,
			hasInboxHistory: history.entries.some(entry => entry.kind === 'customView' && entry.id === INBOX_NOTIFICATIONS_VIEW_ID),
		}, { activeView: undefined, hasInboxHistory: false });
	});

	test('AI hiding blocks Inbox activation and disables activity without affecting another custom view', () => {
		const fixture = createFixture(true);
		disposables.add(fixture.customViewService.registerCustomView({ id: 'other', ctor: new SyncDescriptor(InboxNotificationsView) }));
		fixture.customViewService.showCustomView('other');
		fixture.sentiment.set({ hidden: true }, undefined);
		const otherView = fixture.customViewService.activeCustomView.get()?.id;
		const eventCount = fixture.events.length;
		fixture.activityService.reportActiveSurface('automations');
		fixture.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID, { source: 'history' });
		assert.deepStrictEqual({ otherView, inboxView: fixture.customViewService.activeCustomView.get()?.id, newEvents: fixture.events.length - eventCount }, {
			otherView: 'other', inboxView: 'other', newEvents: 0,
		});
	});

	test('does not restore Inbox while disabled', () => {
		const previous = createFixture(true);
		previous.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		previous.customViewService.dispose();
		const restored = createFixture(false, previous.storageService);
		assert.deepStrictEqual({ view: restored.customViewService.activeCustomView.get()?.id, events: restored.events }, {
			view: undefined, events: [],
		});
	});

	test('restores Inbox while enabled', () => {
		const previous = createFixture(true);
		previous.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		previous.customViewService.dispose();
		const restored = createFixture(true, previous.storageService);
		assert.strictEqual(restored.customViewService.activeCustomView.get()?.id, INBOX_NOTIFICATIONS_VIEW_ID);
	});
});
