/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MessageKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { ChatDailyUsageContribution } from '../../browser/chatDailyUsage.contribution.js';
import { ChatDailyUsage } from '../../common/chatDailyUsage.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../common/chatService/chatService.js';

suite('ChatDailyUsageContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const hour = 60 * 60 * 1000;
	const day = 24 * hour;

	function createContribution() {
		const storage = disposables.add(new InMemoryStorageService());
		const requests = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		const focus = disposables.add(new Emitter<boolean>());
		const entitlementChanged = disposables.add(new Emitter<void>());
		const lifecycle = disposables.add(new TestLifecycleService());
		lifecycle.usePhases = true;
		const state = { hasFocus: true, entitlement: ChatEntitlement.Pro };
		const events: object[] = [];
		const contribution = disposables.add(new ChatDailyUsageContribution(
			upcastPartial<IChatService>({ onDidAcceptRequest: requests.event }),
			storage,
			upcastPartial<ITelemetryService>({ publicLog2: (eventName: string, data?: object) => { events.push({ eventName, ...data }); } }),
			upcastPartial<IHostService>({ get hasFocus() { return state.hasFocus; }, onDidChangeFocus: focus.event }),
			lifecycle,
			upcastPartial<IChatEntitlementService>({ get entitlement() { return state.entitlement; }, onDidChangeEntitlement: entitlementChanged.event }),
		));
		return { contribution, storage, requests, focus, entitlementChanged, lifecycle, state, events };
	}

	test('reports once per UTC day after startup from a focused window of a user with a Copilot plan', () => runWithFakedTimers({ useFakeTimers: true, startTime: 10 * day + 22 * hour }, async () => {
		const { contribution, requests, focus, entitlementChanged, lifecycle, state, events } = createContribution();
		const chatSessionResource = URI.parse('local:/session');
		requests.fire({ chatSessionResource, isNewSession: true });
		requests.fire({ chatSessionResource, isNewSession: false });
		focus.fire(true);
		const beforeStartup = events.length;
		state.hasFocus = false;
		lifecycle.phase = LifecyclePhase.Eventually;
		await timeout(0);
		const unfocused = events.length;
		state.hasFocus = true;
		state.entitlement = ChatEntitlement.Available;
		focus.fire(true);
		await timeout(0);
		const withoutPlan = events.length;
		// Concurrent attempts from the same window still claim the day once.
		state.entitlement = ChatEntitlement.Pro;
		entitlementChanged.fire();
		focus.fire(true);
		state.entitlement = ChatEntitlement.Free;
		entitlementChanged.fire();
		// Hourly checks at 23:00 and 00:00 UTC; only the new day reports.
		await timeout(2.5 * hour);
		contribution.dispose();
		assert.deepStrictEqual({ beforeStartup, unfocused, withoutPlan, events }, {
			beforeStartup: 0,
			unfocused: 0,
			withoutPlan: 0,
			events: [
				{ eventName: 'chatDailyUsage', plan: 'Pro', messagesLast7Days: 2, messagesLast30Days: 2, messagesTotal: 2, sessionsLast7Days: 1, sessionsLast30Days: 1, sessionsTotal: 1, minutesSinceLastMessage: 0, trackedDays: 0 },
				{ eventName: 'chatDailyUsage', plan: 'Free', messagesLast7Days: 2, messagesLast30Days: 2, messagesTotal: 2, sessionsLast7Days: 1, sessionsLast30Days: 1, sessionsTotal: 1, minutesSinceLastMessage: 120, trackedDays: 1 },
			],
		});
	}));

	test('does not count messages that an agent, tool or automation sent on the user\'s behalf', () => {
		const { storage, requests } = createContribution();
		const chatSessionResource = URI.parse('local:/session');
		requests.fire({ chatSessionResource, isNewSession: true });
		requests.fire({ chatSessionResource, isNewSession: false, agentHostMessageOrigin: { kind: MessageKind.User } });
		for (const kind of [MessageKind.Agent, MessageKind.Tool, MessageKind.Automation, MessageKind.SystemNotification]) {
			requests.fire({ chatSessionResource: URI.parse(`local:/${kind}`), isNewSession: true, agentHostMessageOrigin: { kind } });
		}
		const { messagesTotal, sessionsTotal } = new ChatDailyUsage(storage).getTelemetry();
		assert.deepStrictEqual({ messagesTotal, sessionsTotal }, { messagesTotal: 2, sessionsTotal: 1 });
	});
});
