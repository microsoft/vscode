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
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { ChatDailyUsageContribution } from '../../browser/chatDailyUsage.contribution.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../common/chatService/chatService.js';

suite('ChatDailyUsageContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const hour = 60 * 60 * 1000;
	const day = 24 * hour;

	test('reports once per UTC day after startup from a focused window of a user with a Copilot plan', () => runWithFakedTimers({ useFakeTimers: true, startTime: 10 * day + 22 * hour }, async () => {
		const requests = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		const focus = disposables.add(new Emitter<boolean>());
		const entitlementChanged = disposables.add(new Emitter<void>());
		const lifecycle = disposables.add(new TestLifecycleService());
		lifecycle.usePhases = true;
		let hasFocus = true;
		let entitlement = ChatEntitlement.Pro;
		const events: object[] = [];
		const contribution = disposables.add(new ChatDailyUsageContribution(
			upcastPartial<IChatService>({ onDidAcceptRequest: requests.event }),
			disposables.add(new InMemoryStorageService()),
			upcastPartial<ITelemetryService>({ publicLog2: (eventName: string, data?: object) => { events.push({ eventName, ...data }); } }),
			upcastPartial<IHostService>({ get hasFocus() { return hasFocus; }, onDidChangeFocus: focus.event }),
			lifecycle,
			upcastPartial<IChatEntitlementService>({ get entitlement() { return entitlement; }, onDidChangeEntitlement: entitlementChanged.event }),
		));
		const resource = URI.parse('local:/session');
		requests.fire({ chatSessionResource: resource, isNewSession: true });
		requests.fire({ chatSessionResource: resource, isNewSession: false });
		focus.fire(true);
		const beforeStartup = events.length;
		hasFocus = false;
		lifecycle.phase = LifecyclePhase.Eventually;
		await timeout(0);
		const unfocused = events.length;
		hasFocus = true;
		entitlement = ChatEntitlement.Available;
		focus.fire(true);
		const withoutPlan = events.length;
		entitlement = ChatEntitlement.Pro;
		entitlementChanged.fire();
		focus.fire(true);
		entitlement = ChatEntitlement.Free;
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
});
