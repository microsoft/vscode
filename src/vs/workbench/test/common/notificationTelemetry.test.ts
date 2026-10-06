/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toAction } from '../../../base/common/actions.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { INotification, IPromptChoice, IPromptChoiceWithMenu, NotificationPriority, Severity } from '../../../platform/notification/common/notification.js';
import { extensionNotificationTelemetry, getNotificationActionTelemetry, getNotificationTelemetrySource, NotificationActionTelemetryId, NotificationTelemetryId, withNotificationActionTelemetry } from '../../../platform/notification/common/notificationTelemetry.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { logNotificationAction, logNotificationExpansion, logNotificationInteraction, logNotificationShown, NotificationInteractionClassification, NotificationInteractionEvent, NotificationShownClassification, NotificationShownEvent } from '../../common/notificationTelemetry.js';
import { ChoiceAction } from '../../common/notifications.js';
import { NotificationService } from '../../services/notification/common/notificationService.js';
import { TestNotificationTelemetryService } from './testNotificationTelemetry.js';

suite('Notification telemetry contract', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: NotificationService;
	let storage: InMemoryStorageService;
	let telemetry: TestNotificationTelemetryService;

	setup(() => {
		storage = store.add(new InMemoryStorageService());
		service = store.add(new NotificationService(storage));
		telemetry = new TestNotificationTelemetryService();
		store.add(toDisposable(() => {
			for (const item of [...service.model.notifications]) {
				item.close();
			}
		}));
	});

	function notify(options: Partial<INotification> = {}) {
		const handle = service.notify({ severity: Severity.Info, message: 'Synthetic notification', ...options });
		return { handle, item: service.model.notifications[0] };
	}

	test('all built-in type IDs are unique and independent of content and dedup IDs', () => {
		const ids = Object.values(NotificationTelemetryId);
		const sources = ids.map(id => notify({ telemetry: id, id: 'private/dedup', message: 'private message', source: 'private source' }).item.telemetry);
		assert.deepStrictEqual({
			unique: new Set(ids).size,
			sources,
			representative: [NotificationTelemetryId.AuthenticationSignIn, NotificationTelemetryId.AgentHostProgress, NotificationTelemetryId.PluginRepositoryClone],
			events: telemetry.events
		}, {
			unique: ids.length,
			sources: ids.map(notificationId => ({ origin: 'core', notificationId, extensionId: 'none' })),
			representative: ['authentication.signIn', 'agentHost.progress', 'plugins.repository.clone'],
			events: []
		});
	});

	test('unknown and forged metadata never expose message, error, source, dedup or action content', () => {
		for (const unsafe of [undefined, '/private/path', 'publisher.extension', { origin: 'extension', extensionId: 'publisher.extension' }, { id: NotificationTelemetryId.AuthenticationSignIn }]) {
			const action = toAction({ id: 'private action ID', label: 'private button label', run: () => { } });
			// @ts-expect-error Deliberately exercise untyped input without accepting arbitrary action IDs.
			withNotificationActionTelemetry(action, 'private action metadata');
			const { item } = notify({
				// @ts-expect-error Untrusted metadata must fail closed to explicit unknown attribution.
				telemetry: unsafe,
				id: 'private dedup ID',
				message: new Error('private error message'),
				source: { id: 'private source ID', label: 'private display name' },
				actions: { primary: [action] }
			});
			logNotificationShown(telemetry, item, 'toast');
			logNotificationAction(telemetry, item, action);
			item.close();
		}

		assert.deepStrictEqual(telemetry.interactions.map(({ instanceId, timeSinceShownMs, ...event }) => event), Array.from({ length: 5 }, () => ({
			origin: 'unknown',
			notificationId: 'unknown',
			extensionId: 'unknown',
			surface: 'toast',
			severity: 'info',
			hasProgress: false,
			cancellable: false,
			interaction: 'primaryAction',
			actionId: 'unknown',
			actionRole: 'primary',
			extensionButtonIndex: -1
		})));
		assert.ok(!JSON.stringify(telemetry.events).includes('private'));
	});

	test('extension attribution requires bridge-issued metadata and a publisher.extension identifier', () => {
		const metadata = extensionNotificationTelemetry('Publisher.Extension', 'message');
		assert.deepStrictEqual([
			getNotificationTelemetrySource(metadata),
			getNotificationTelemetrySource({ ...metadata }),
			getNotificationTelemetrySource(extensionNotificationTelemetry(undefined, 'progress')),
			getNotificationTelemetrySource(extensionNotificationTelemetry('user@example.com', 'message')),
			getNotificationTelemetrySource(extensionNotificationTelemetry('/private/extension', 'progress')),
			getNotificationTelemetrySource(extensionNotificationTelemetry(`publisher.${'a'.repeat(256)}`, 'message')),
		], [
			{ origin: 'extension', notificationId: 'extension.message', extensionId: 'publisher.extension' },
			{ origin: 'unknown', notificationId: 'unknown', extensionId: 'unknown' },
			{ origin: 'extension', notificationId: 'extension.progress', extensionId: 'unknown' },
			{ origin: 'extension', notificationId: 'extension.message', extensionId: 'unknown' },
			{ origin: 'extension', notificationId: 'extension.progress', extensionId: 'unknown' },
			{ origin: 'extension', notificationId: 'extension.message', extensionId: 'unknown' },
		]);
	});

	test('prompt metadata and audited primary, secondary and dropdown choices survive handle updates', () => {
		const choices: (IPromptChoice | IPromptChoiceWithMenu)[] = [
			{ label: 'Continue', telemetryId: NotificationActionTelemetryId.Continue, run: () => { }, isSecondary: false, menu: [{ label: 'Decline', telemetryId: NotificationActionTelemetryId.Decline, run: () => { } }] },
			{ label: 'Reload', telemetryId: NotificationActionTelemetryId.Reload, isSecondary: true, run: () => { } }
		];
		const handle = service.prompt(Severity.Warning, 'private prompt', choices, { telemetry: NotificationTelemetryId.AuthenticationContinue });
		const item = service.model.notifications[0];
		const primary = item.actions!.primary![0];
		const secondary = item.actions!.secondary![0];
		assert.ok(primary instanceof ChoiceAction);
		const dropdown = primary.menu![0];
		store.add(dropdown);
		handle.updateMessage('another private prompt');
		handle.updateSeverity(Severity.Error);
		handle.updateActions({ primary: [primary], secondary: [secondary] });
		item.updateVisibility(true);
		logNotificationAction(telemetry, item, primary);
		logNotificationAction(telemetry, item, secondary);
		logNotificationAction(telemetry, item, dropdown);

		assert.deepStrictEqual({
			source: item.telemetry,
			shown: telemetry.shown,
			actions: telemetry.interactions.map(event => [event.actionId, event.actionRole, event.timeSinceShownMs, event.surface])
		}, {
			source: { origin: 'core', notificationId: 'authentication.continue', extensionId: 'none' },
			shown: [],
			actions: [['continue', 'primary', -1, 'unknown'], ['reload', 'secondary', -1, 'unknown'], ['decline', 'primary', -1, 'unknown']]
		});
	});

	test('deduplication and re-rendering retain correlation but closing and independent progress do not', () => {
		const options = { telemetry: NotificationTelemetryId.ExtensionInstall, id: 'private dedup', message: 'Installing' };
		const first = notify(options).item;
		logNotificationShown(telemetry, first, 'toast');
		first.updateMessage('Installing update');
		first.updateSeverity(Severity.Warning);
		logNotificationShown(telemetry, first, 'toast');
		const replacement = notify(options).item;
		logNotificationShown(telemetry, replacement, 'toast');
		logNotificationShown(telemetry, replacement, 'center');
		logNotificationShown(telemetry, replacement, 'toast');
		logNotificationInteraction(telemetry, replacement, 'dismiss');
		replacement.close();
		const next = notify(options).item;
		logNotificationShown(telemetry, next, 'toast');
		const progress1 = notify({ ...options, progress: { infinite: true } }).item;
		const progress2 = notify({ ...options, progress: { infinite: true } }).item;
		logNotificationShown(telemetry, progress1, 'toast');
		logNotificationShown(telemetry, progress2, 'toast');

		assert.deepStrictEqual({
			surfaces: telemetry.shown.map(event => event.surface),
			uniqueInstances: new Set(telemetry.shown.map(event => event.instanceId)).size,
			correlated: telemetry.shown[0].instanceId === telemetry.shown[1].instanceId && telemetry.shown[0].instanceId === telemetry.interactions[0].instanceId,
			exposedBeforeAction: Number(telemetry.interactions[0].timeSinceShownMs) >= 0,
			modelLength: service.model.notifications.length,
		}, {
			surfaces: ['toast', 'center', 'toast', 'toast', 'toast'],
			uniqueInstances: 4,
			correlated: true,
			exposedBeforeAction: true,
			modelLength: 3,
		});
	});

	test('a duplicate with different safe attribution does not inherit exposure', () => {
		const first = notify({ id: 'dedup', telemetry: NotificationTelemetryId.ExtensionInstall }).item;
		logNotificationShown(telemetry, first, 'toast');
		const second = notify({ id: 'dedup', telemetry: NotificationTelemetryId.ExtensionDownload }).item;
		logNotificationShown(telemetry, second, 'toast');
		assert.deepStrictEqual({
			count: service.model.notifications.length,
			types: telemetry.shown.map(event => event.notificationId),
			distinct: telemetry.shown[0].instanceId !== telemetry.shown[1].instanceId
		}, { count: 1, types: ['extensions.install', 'extensions.downloadVsix'], distinct: true });
	});

	test('creation, suppression, visibility flags, automatic close and programmatic expansion are not interactions or exposures', () => {
		storage.store('neverAgain', true, StorageScope.APPLICATION, StorageTarget.USER);
		service.notify({ severity: Severity.Info, message: 'Suppressed', telemetry: NotificationTelemetryId.ExtensionsDisabled, neverShowAgain: { id: 'neverAgain' } });
		service.prompt(Severity.Info, 'Suppressed prompt', [], { telemetry: NotificationTelemetryId.ExtensionsDisabled, neverShowAgain: { id: 'neverAgain' } });
		const { handle, item } = notify({ priority: NotificationPriority.SILENT });
		item.updateVisibility(true);
		item.expand();
		item.collapse(true);
		item.toggle();
		handle.progress.infinite();
		handle.progress.done();
		handle.close();
		assert.deepStrictEqual({ events: telemetry.events, remaining: service.model.notifications.length }, { events: [], remaining: 0 });
	});

	test('only an explicitly annotated cancel action is cancellation and invalid indexes are omitted', () => {
		const fakeCancel = toAction({ id: 'progress.cancel', label: 'Cancel', run: () => { } });
		const cancel = withNotificationActionTelemetry(toAction({ id: 'arbitrary', label: 'Skip', run: () => { } }), NotificationActionTelemetryId.ProgressCancel);
		const invalidIndex = withNotificationActionTelemetry(toAction({ id: 'extension', label: 'Private', run: () => { } }), { extensionButtonIndex: Infinity });
		const { item } = notify({ telemetry: extensionNotificationTelemetry('publisher.extension', 'progress'), progress: { infinite: true }, actions: { primary: [fakeCancel, cancel, invalidIndex] } });
		logNotificationAction(telemetry, item, fakeCancel);
		logNotificationAction(telemetry, item, cancel);
		logNotificationAction(telemetry, item, invalidIndex);
		cancel.enabled = false;
		logNotificationAction(telemetry, item, cancel);
		assert.deepStrictEqual(telemetry.interactions.map(event => [event.interaction, event.actionId, event.extensionButtonIndex, event.cancellable]), [
			['primaryAction', 'unknown', -1, true],
			['progressCancel', 'progress.cancel', -1, true],
			['primaryAction', 'unknown', -1, true]
		]);
		assert.strictEqual(getNotificationActionTelemetry(invalidIndex), undefined);
	});

	test('expansion is recorded only for a user-requested state change that can occur', () => {
		const { item } = notify();
		logNotificationExpansion(telemetry, item, true);
		item.expand();
		logNotificationExpansion(telemetry, item, true);
		logNotificationExpansion(telemetry, item, false);
		item.collapse();
		logNotificationExpansion(telemetry, item, false);
		item.updateActions({ primary: [toAction({ id: 'action', label: 'Action', run: () => { } })] });
		logNotificationExpansion(telemetry, item, false);
		assert.deepStrictEqual(telemetry.interactions.map(event => event.interaction), ['expand', 'collapse']);
	});

	test('GDPR classifications mark every numeric and boolean field as a measurement and no string field', () => {
		type CheckMeasurements<E, C> = {
			[K in keyof E]-?: K extends keyof C
			? NonNullable<E[K]> extends number | boolean
			? C[K] extends { isMeasurement: true } ? true : never
			: 'isMeasurement' extends keyof C[K] ? never : true
			: never;
		};
		const shown: CheckMeasurements<NotificationShownEvent, NotificationShownClassification> = {
			origin: true, notificationId: true, extensionId: true, instanceId: true, surface: true, severity: true, hasProgress: true, cancellable: true
		};
		const interaction: CheckMeasurements<NotificationInteractionEvent, NotificationInteractionClassification> = {
			...shown, interaction: true, actionId: true, actionRole: true, extensionButtonIndex: true, timeSinceShownMs: true
		};
		assert.deepStrictEqual(Object.values(interaction), Array(13).fill(true));
	});
});
