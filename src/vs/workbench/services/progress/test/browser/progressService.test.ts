/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { NotificationText } from '../../../../../platform/notification/common/notificationMessage.js';
import { legacyExtensionLinkParsing } from '../../../../../platform/notification/common/notificationLegacy.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IProgress, IProgressStep, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IActivityService } from '../../../activity/common/activity.js';
import { IHostService } from '../../../host/browser/host.js';
import { NotificationService } from '../../../notification/common/notificationService.js';
import { IPaneCompositePartService } from '../../../panecomposite/browser/panecomposite.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService } from '../../../statusbar/browser/statusbar.js';
import { IUserActivityService } from '../../../userActivity/common/userActivityService.js';
import { IViewsService } from '../../../views/common/viewsService.js';
import { ProgressService } from '../../browser/progressService.js';
import { extensionNotificationTelemetry, NotificationTelemetryId } from '../../../../../platform/notification/common/notificationTelemetry.js';
import { NotificationActionRunner } from '../../../../browser/parts/notifications/notificationsCommands.js';
import { logNotificationShown } from '../../../../common/notificationTelemetry.js';
import { TestNotificationTelemetryService } from '../../../../test/common/testNotificationTelemetry.js';

suite('ProgressService notification messages', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices() {
		const telemetry = new TestNotificationTelemetryService();
		const notifications = store.add(new NotificationService(store.add(new InMemoryStorageService())));
		store.add(toDisposable(() => {
			for (const notification of [...notifications.model.notifications]) {
				notification.close();
			}
		}));
		const statusEntries: IStatusbarEntry[] = [];
		const progressService = store.add(new ProgressService(
			new class extends mock<IActivityService>() { },
			new class extends mock<IPaneCompositePartService>() { },
			new class extends mock<IViewDescriptorService>() { },
			new class extends mock<IViewsService>() { },
			notifications,
			new class extends mock<IStatusbarService>() {
				override addEntry(entry: IStatusbarEntry): IStatusbarEntryAccessor {
					statusEntries.push(entry);
					return new class extends mock<IStatusbarEntryAccessor>() {
						override update(value: IStatusbarEntry): void { statusEntries.push(value); }
						override dispose(): void { }
					};
				}
			},
			new class extends mock<ILayoutService>() { },
			new class extends mock<IKeybindingService>() { },
			new class extends mock<IUserActivityService>() {
				override markActive() { return Disposable.None; }
			},
			new class extends mock<IHostService>() { },
		));
		const actionRunner = store.add(new NotificationActionRunner(undefined, telemetry, notifications));
		return { notifications, progressService, statusEntries, telemetry, actionRunner };
	}

	for (const cancel of [false, true]) {
		test(`${cancel ? 'explicit cancellation' : 'automatic completion'} of attributed progress`, () => runWithFakedTimers({}, async () => {
			const { notifications, progressService, telemetry, actionRunner } = createServices();
			const deferred = new DeferredPromise<void>();
			let cancellations = 0;
			const promise = progressService.withProgress({
				location: ProgressLocation.Notification,
				telemetry: NotificationTelemetryId.AuthenticationSignIn,
				title: 'private server name',
				cancellable: 'Private cancellation label',
			}, () => deferred.p, () => {
				cancellations++;
				deferred.complete();
			});
			const item = notifications.model.notifications[0];
			const created = [...telemetry.events];
			logNotificationShown(telemetry, item, 'toast');
			if (cancel) {
				await actionRunner.run(item.actions!.primary![0], item);
			} else {
				await deferred.complete();
			}
			await promise;
			await timeout(1000);
			assert.deepStrictEqual({
				created,
				source: item.telemetry,
				flags: telemetry.shown.map(event => [event.hasProgress, event.cancellable]),
				interactions: telemetry.interactions.map(event => [event.interaction, event.actionId, event.actionRole]),
				cancellations,
				remaining: notifications.model.notifications.length,
				privatePayload: JSON.stringify([...telemetry.shown, ...telemetry.interactions]).includes('private')
			}, {
				created: [],
				source: { origin: 'core', notificationId: 'authentication.signIn', extensionId: 'none' },
				flags: [[true, true]],
				interactions: cancel ? [['progressCancel', 'progress.cancel', 'primary']] : [],
				cancellations: cancel ? 1 : 0,
				remaining: 0,
				privatePayload: false
			});
		}));
	}

	test('delayed progress that completes before its delay never creates a notification', () => runWithFakedTimers({}, async () => {
		const { notifications, progressService, telemetry } = createServices();
		const options = {
			location: ProgressLocation.Notification, telemetry: NotificationTelemetryId.PluginRepositoryClone, title: 'Private repository', delay: 500, cancellable: true
		};
		const promise = progressService.withProgress(options, () => timeout(100));
		await promise;
		await timeout(500);
		assert.deepStrictEqual({ remaining: notifications.model.notifications.length, events: telemetry.events }, { remaining: 0, events: [] });
	}));

	test('delayed extension progress preserves attribution through updates and Window fallback', () => runWithFakedTimers({}, async () => {
		const { notifications, progressService, telemetry } = createServices();
		const deferred = new DeferredPromise<void>();
		let reporter: IProgress<IProgressStep> | undefined;
		const promise = progressService.withProgress({
			location: ProgressLocation.Window,
			telemetry: extensionNotificationTelemetry('Publisher.Extension', 'progress'),
			title: 'private title', cancellable: true
		}, progress => {
			reporter = progress;
			return deferred.p;
		});
		await timeout(100);
		const beforeDelay = notifications.model.notifications.length;
		reporter!.report({ message: 'private report', increment: 20 });
		await timeout(100);
		const item = notifications.model.notifications[0];
		const beforeExposure = [...telemetry.events];
		logNotificationShown(telemetry, item, 'center');
		reporter!.report({ message: 'another private report', increment: 30 });
		logNotificationShown(telemetry, item, 'center');
		await deferred.complete();
		await promise;
		await timeout(1000);
		assert.deepStrictEqual({
			beforeDelay, beforeExposure,
			exposures: telemetry.shown.map(event => [event.notificationId, event.extensionId, event.surface, event.cancellable]),
			interactions: telemetry.interactions,
			remaining: notifications.model.notifications.length
		}, {
			beforeDelay: 0, beforeExposure: [],
			exposures: [['extension.progress', 'publisher.extension', 'center', true]],
			interactions: [], remaining: 0
		});
	}));

	test('keeps core progress titles and updates literal', () => runWithFakedTimers({}, async () => {
		const { notifications, progressService } = createServices();
		const deferred = new DeferredPromise<void>();
		const title = 'README.md [Open](command:unexpected)';
		const message = '[Help](https://example.com)';
		let progress: IProgress<IProgressStep> | undefined;
		const promise = progressService.withProgress({ location: ProgressLocation.Notification, title }, reporter => {
			progress = reporter;
			return deferred.p;
		});
		const notification = notifications.model.notifications[0];
		const initial = notification.message.linkedText.nodes;
		progress!.report({ message });
		const updated = notification.message.linkedText.nodes;
		await deferred.complete();
		await promise;
		await timeout(1000);

		assert.deepStrictEqual({ initial, updated }, {
			initial: [title],
			updated: [`${title}: ${message}`],
		});
	}));

	test('preserves structured titles without trusting progress text or later updates', () => runWithFakedTimers({}, async () => {
		const { notifications, progressService, statusEntries } = createServices();
		const deferred = new DeferredPromise<void>();
		const link = { label: 'Show Logs', href: 'command:showLogs' };
		const message = '[Open](command:unexpected)';
		let progress: IProgress<IProgressStep> | undefined;
		const promise = progressService.withProgress({
			location: ProgressLocation.Notification,
			title: NotificationText.link(link.label, link.href),
		}, reporter => {
			progress = reporter;
			return deferred.p;
		});
		const notification = notifications.model.notifications[0];
		progress!.report({ message });
		const literalUpdate = notification.message.linkedText.nodes;
		notification.updateVisibility(true);
		notification.updateVisibility(false);
		await timeout(200);
		const statusText = statusEntries.at(-1)?.text;

		progress!.report({ message: NotificationText.link('Details', 'command:showDetails') });
		const structuredUpdate = notification.message.linkedText.nodes;
		progress!.report({ message: 'Details' });
		const plainUpdate = notification.message.linkedText.nodes;
		await deferred.complete();
		await promise;
		await timeout(1000);

		assert.deepStrictEqual({ literalUpdate, statusText, structuredUpdate, plainUpdate }, {
			literalUpdate: [link, `: ${message}`],
			statusText: `Show Logs: ${message}`,
			structuredUpdate: [link, ': ', { label: 'Details', href: 'command:showDetails' }],
			plainUpdate: [link, ': Details'],
		});
	}));

	test('preserves legacy extension progress links and status-bar text', () => runWithFakedTimers({}, async () => {
		const { notifications, progressService, statusEntries } = createServices();
		const deferred = new DeferredPromise<void>();
		const title = '[Show Logs](command:python.viewOutput)';
		const message = '[Check details](command:java.show.server.task.status)';
		let progress: IProgress<IProgressStep> | undefined;
		const promise = progressService.withProgress({
			location: ProgressLocation.Notification,
			title,
			legacyExtensionLinkParsing,
		}, reporter => {
			progress = reporter;
			return deferred.p;
		});
		const notification = notifications.model.notifications[0];
		progress!.report({ message });
		const raw = notification.message.raw;
		const nodes = notification.message.linkedText.nodes;
		notification.updateVisibility(true);
		notification.updateVisibility(false);
		await timeout(200);
		const statusText = statusEntries.at(-1)?.text;
		await deferred.complete();
		await promise;
		await timeout(1000);

		assert.deepStrictEqual({ raw, nodes, statusText }, {
			raw: `${title}: ${message}`,
			nodes: [
				{ label: 'Show Logs', href: 'command:python.viewOutput' },
				': ',
				{ label: 'Check details', href: 'command:java.show.server.task.status' }
			],
			statusText: 'Show Logs: Check details',
		});
	}));
});
