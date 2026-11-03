/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IMobileNotificationHost, MobileBackgroundNotifier } from '../../browser/mobileBackgroundNotifier.js';

class TestNotification extends EventTarget {
	closeCount = 0;

	constructor(readonly title: string, readonly options: NotificationOptions) {
		super();
	}

	close(): void {
		this.closeCount++;
	}
}

class TestNotificationHost implements IMobileNotificationHost {
	hidden = true;
	permission: NotificationPermission = 'default';
	permissionRequests = 0;
	focusCalls = 0;
	readonly permissionResult = new DeferredPromise<NotificationPermission>();
	readonly notifications: TestNotification[] = [];
	readonly vibrations: VibratePattern[] = [];

	isHidden(): boolean { return this.hidden; }
	requestPermission(): Promise<NotificationPermission> {
		this.permissionRequests++;
		return this.permissionResult.p;
	}
	createNotification(title: string, options: NotificationOptions): TestNotification {
		const notification = new TestNotification(title, options);
		this.notifications.push(notification);
		return notification;
	}
	focus(): void { this.focusCalls++; }
	vibrate(pattern: VibratePattern): void { this.vibrations.push(pattern); }
}

suite('MobileBackgroundNotifier', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const host = new TestNotificationHost();
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const status = observableValue<SessionStatus>('status', SessionStatus.InProgress);
		const session = upcastPartial<ISession>({
			sessionId: 'session-one', resource: URI.parse('test-session:/one'),
			title: constObservable('Background session'), status,
		});
		const sessions = [session];
		const opened: string[] = [];
		const notifier = store.add(new MobileBackgroundNotifier(host,
			upcastPartial<ISessionsManagementService>({
				getSessions: () => sessions,
				onDidChangeSessions: changed.event,
			}),
			upcastPartial<ISessionsService>({
				openSession: async resource => { opened.push(resource.toString()); },
			}),
		));
		return {
			host, status, notifier, opened,
			removeSession: () => {
				sessions.splice(0);
				changed.fire({ added: [], removed: [session], changed: [] });
			},
		};
	}

	for (const change of ['disposed', 'visible', 'working', 'removed'] as const) {
		test(`permission completion does not notify after the owner becomes ${change}`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const h = createHarness();
				h.status.set(SessionStatus.NeedsInput, undefined);
				switch (change) {
					case 'disposed': h.notifier.dispose(); break;
					case 'visible': h.host.hidden = false; break;
					case 'working': h.status.set(SessionStatus.InProgress, undefined); break;
					case 'removed': h.removeSession(); break;
				}
				await h.host.permissionResult.complete('granted');
				await timeout(0);
				assert.deepStrictEqual({
					requests: h.host.permissionRequests, created: h.host.notifications.length,
					vibrations: h.host.vibrations, opened: h.opened,
				}, { requests: 1, created: 0, vibrations: [], opened: [] });
			});
		});
	}

	for (const [status, body] of [
		[SessionStatus.NeedsInput, 'Needs your input'],
		[SessionStatus.Error, 'Stopped with an error'],
		[SessionStatus.Completed, 'Finished'],
	] as const) {
		test(`notifies a current hidden session for status ${status}`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const h = createHarness();
				h.host.permission = 'granted';
				h.status.set(status, undefined);
				await timeout(status === SessionStatus.Completed ? 1500 : 0);
				h.notifier.dispose();
				assert.deepStrictEqual({
					requests: h.host.permissionRequests,
					notifications: h.host.notifications.map(notification => ({
						title: notification.title, options: notification.options, closed: notification.closeCount,
					})),
					vibrations: h.host.vibrations,
				}, {
					requests: 0,
					notifications: [{ title: 'Background session', options: { body, tag: 'test-session:/one', icon: 'favicon.ico' }, closed: 1 }],
					vibrations: [status === SessionStatus.NeedsInput ? [60, 40, 60] : 40],
				});
			});
		});
	}

	test('only the latest occurrence of a status can notify after permission resolves', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			h.status.set(SessionStatus.NeedsInput, undefined);
			h.status.set(SessionStatus.InProgress, undefined);
			h.status.set(SessionStatus.NeedsInput, undefined);
			await h.host.permissionResult.complete('granted');
			await timeout(0);
			assert.deepStrictEqual({ requests: h.host.permissionRequests, created: h.host.notifications.length }, { requests: 2, created: 1 });
		});
	});

	test('denying requested permission does not create a notification', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			h.status.set(SessionStatus.NeedsInput, undefined);
			await h.host.permissionResult.complete('denied');
			await timeout(0);
			assert.deepStrictEqual({ requests: h.host.permissionRequests, created: h.host.notifications.length }, { requests: 1, created: 0 });
		});
	});

	for (const closeWithClick of [false, true]) {
		test(`${closeWithClick ? 'clicking' : 'disposing'} closes the notification and removes its click handler`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const h = createHarness();
				h.host.permission = 'granted';
				h.status.set(SessionStatus.NeedsInput, undefined);
				await timeout(0);
				const notification = h.host.notifications[0];
				if (closeWithClick) {
					notification.dispatchEvent(new Event('click'));
				}
				h.notifier.dispose();
				notification.dispatchEvent(new Event('click'));
				await timeout(0);
				assert.deepStrictEqual({ closed: notification.closeCount, focus: h.host.focusCalls, opened: h.opened }, {
					closed: 1, focus: closeWithClick ? 1 : 0, opened: closeWithClick ? ['test-session:/one'] : [],
				});
			});
		});
	}
});
