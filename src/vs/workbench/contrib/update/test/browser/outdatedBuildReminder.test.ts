/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotification, INotificationActions, INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { DisablementReason, IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IBannerItem, IBannerService } from '../../../../services/banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { OutdatedBuildReminderContribution } from '../../browser/outdatedBuildReminder.js';

const DAY = 24 * 60 * 60 * 1000;
const LAST_SHOWN_STORAGE_KEY = 'update/outdatedBuildReminderLastShown';
const SETTING = 'update.showOutdatedBuildReminder';
const DOWNLOAD_URL = 'https://code.visualstudio.com/Download';
const MESSAGE = 'This version of Visual Studio Code is 2 months old. Update to get the latest features and fixes.';

interface IReminderOptions {
	readonly buildAgeDays?: number;
	readonly lastShownDaysAgo?: number;
	readonly hadLastFocus?: boolean;
	readonly state?: State;
	readonly isSessionsWindow?: boolean;
	readonly storage?: InMemoryStorageService;
	readonly enabled?: boolean;
	readonly userConfigured?: boolean;
}

function formatActions(actions: readonly { readonly label: string | HTMLElement; readonly href?: string; readonly id?: string }[] | undefined): string[] {
	return (actions ?? []).map(action => `${action.label} -> ${action.href ?? action.id}`);
}

/**
 * Reports values as defaults, such as ones an experiment assigns, unless the user configured them.
 */
class ReminderConfigurationService extends TestConfigurationService {
	constructor(private readonly userConfigured: boolean) {
		super();
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return this.userConfigured ? inspected : { value: inspected.value, defaultValue: inspected.value };
	}
}

/**
 * A window whose local cache never sees other windows' writes, while shared values go to
 * one authoritative map, as they do through the main process.
 */
class WindowStorageService extends InMemoryStorageService {
	constructor(private readonly shared: Map<string, string>, private readonly readDelay?: Promise<void>) {
		super();
	}

	override async readApplicationSharedValue(key: string): Promise<string | undefined> {
		await this.readDelay;
		return this.shared.get(key);
	}

	override async compareAndSwapApplicationSharedValue(key: string, expectedValue: string | undefined, newValue: string): Promise<{ swapped: boolean; currentValue: string | undefined }> {
		const currentValue = this.shared.get(key);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		this.shared.set(key, newValue);
		return { swapped: true, currentValue: newValue };
	}
}

class TestNotificationHandle extends mock<INotificationHandle>() {
	private readonly _onDidClose = new Emitter<void>();
	override readonly onDidClose = this._onDidClose.event;
	actions: INotificationActions | undefined;

	constructor(private readonly events: unknown[], notification: INotification) {
		super();
		this.actions = notification.actions;
	}

	override updateActions(actions?: INotificationActions): void {
		this.actions = actions;
		this.events.push({ updateActions: formatActions(actions?.primary) });
	}

	override close(): void {
		this.events.push('close');
		this._onDidClose.fire();
	}

	dispose(): void {
		this._onDidClose.dispose();
	}
}

suite('OutdatedBuildReminderContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const update = { version: 'commit', productVersion: '1.146.0' };

	async function createReminder(options: IReminderOptions) {
		const now = Date.now();
		const events: unknown[] = [];
		const storage = options.storage ?? store.add(new InMemoryStorageService());
		if (options.lastShownDaysAgo !== undefined) {
			storage.store(LAST_SHOWN_STORAGE_KEY, now - options.lastShownDaysAgo * DAY, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		}

		const hadLastFocus = Promise.resolve(options.hadLastFocus ?? true);
		const onDidChangeFocus = store.add(new Emitter<boolean>());
		const onStateChange = store.add(new Emitter<State>());
		const updateService = new class extends mock<IUpdateService>() {
			override state = options.state ?? State.Idle(UpdateType.Archive);
			override readonly onStateChange = onStateChange.event;
		}();
		const configuration = new ReminderConfigurationService(!!options.userConfigured);
		store.add(configuration.onDidChangeConfigurationEmitter);
		if (options.enabled !== undefined) {
			await configuration.setUserConfiguration(SETTING, options.enabled);
		}
		const telemetry = new TestExperimentTriggerTelemetryService();

		let banner: IBannerItem | undefined;
		let notification: TestNotificationHandle | undefined;
		const contribution = store.add(new OutdatedBuildReminderContribution(
			new class extends mock<IBannerService>() {
				override show(item: IBannerItem): void {
					banner = item;
					events.push({ banner: formatActions(item.actions) });
				}
				override hide(id: string): void {
					events.push({ hide: id });
				}
			}(),
			configuration,
			new class extends mock<IHostService>() {
				override readonly onDidChangeFocus = onDidChangeFocus.event;
				override hadLastFocus(): Promise<boolean> {
					return hadLastFocus;
				}
			}(),
			new class extends mock<INotificationService>() {
				override notify(item: INotification): INotificationHandle {
					notification = store.add(new TestNotificationHandle(events, item));
					events.push({ notification: { message: item.message, sticky: item.sticky, telemetry: item.telemetry, actions: formatActions(item.actions?.primary) } });
					return notification;
				}
			}(),
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, options?: OpenInternalOptions): Promise<boolean> {
					events.push({ open: resource.toString(), allowCommands: options?.allowCommands });
					return true;
				}
			}(),
			new class extends mock<IProductService>() {
				override readonly nameLong = 'Visual Studio Code';
				override readonly date = options.buildAgeDays === undefined ? undefined : new Date(now - options.buildAgeDays * DAY).toISOString();
				override readonly downloadUrl = DOWNLOAD_URL;
			}(),
			storage,
			telemetry,
			updateService,
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = !!options.isSessionsWindow;
			}(),
		));

		// Reminder checks only await already-resolved promises, so a macrotask lets them finish.
		await timeout(0);

		return {
			contribution,
			events,
			triggers: telemetry.triggers,
			get banner() { return banner; },
			get notificationActions(): readonly IAction[] { return notification?.actions?.primary ?? []; },
			get lastShown() { return storage.getNumber(LAST_SHOWN_STORAGE_KEY, StorageScope.APPLICATION_SHARED); },
			focus: async (focused: boolean) => {
				onDidChangeFocus.fire(focused);
				await timeout(0);
			},
			setEnabled: async (enabled: boolean) => {
				await configuration.setUserConfiguration(SETTING, enabled);
				configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === SETTING, affectedKeys: new Set([SETTING]), source: ConfigurationTarget.DEFAULT, change: { keys: [SETTING], overrides: [] } });
				await timeout(0);
			},
			setState: (state: State) => {
				updateService.state = state;
				onStateChange.fire(state);
			},
		};
	}

	test('shows a banner once the build is two months old and keeps its update action current', async () => {
		const before = Date.now();
		const reminder = await createReminder({ buildAgeDays: 61 });
		const lastShown = reminder.lastShown;
		const banner = reminder.banner;
		reminder.setState(State.CheckingForUpdates(false));
		reminder.setState(State.Downloading(update, false, false));
		reminder.setState(State.Ready(update, false, false));
		reminder.banner?.onClose?.();
		reminder.setState(State.Idle(UpdateType.Archive));
		await reminder.focus(true);

		assert.deepStrictEqual({
			banner: { id: banner?.id, message: banner?.message, priority: banner?.priority, neutral: banner?.neutral },
			recordedLastShown: lastShown !== undefined && lastShown >= before && lastShown <= Date.now(),
			events: reminder.events,
		}, {
			banner: { id: OutdatedBuildReminderContribution.ID, message: MESSAGE, priority: -2, neutral: true },
			recordedLastShown: true,
			events: [
				{ banner: ['Check for Updates -> command:update.check', `Open Download Page -> ${DOWNLOAD_URL}`] },
				{ banner: ['Restart to Update -> command:update.restart'] },
				{ hide: OutdatedBuildReminderContribution.ID },
			],
		});
	});

	test('shows the reminder at most once a month, in the last focused window', async () => {
		const count = async (options: IReminderOptions, focusChanges: boolean[] = []) => {
			const reminder = await createReminder(options);
			const counts = [reminder.events.length];
			for (const focused of focusChanges) {
				await reminder.focus(focused);
				counts.push(reminder.events.length);
			}
			return counts;
		};

		assert.deepStrictEqual({
			noBuildDate: await count({}, [true]),
			tooNew: await count({ buildAgeDays: 59 }, [true]),
			shownThisMonth: await count({ buildAgeDays: 61, lastShownDaysAgo: 29 }, [true]),
			shownLastMonth: await count({ buildAgeDays: 61, lastShownDaysAgo: 31 }),
			shownInTheFuture: await count({ buildAgeDays: 61, lastShownDaysAgo: -1 }),
			focusedLater: await count({ buildAgeDays: 61, hadLastFocus: false }, [true, false, true]),
		}, {
			noBuildDate: [0, 0],
			tooNew: [0, 0],
			shownThisMonth: [0, 0],
			shownLastMonth: [1],
			shownInTheFuture: [1],
			focusedLater: [0, 1, 1, 1],
		});
	});

	test('shows the reminder in only one window when windows check before their caches sync', async () => {
		const shared = new Map<string, string>();
		const reminders = [
			await createReminder({ buildAgeDays: 61, hadLastFocus: false, storage: store.add(new WindowStorageService(shared)) }),
			await createReminder({ buildAgeDays: 61, hadLastFocus: false, storage: store.add(new WindowStorageService(shared)) }),
		];
		await Promise.all(reminders.map(reminder => reminder.focus(true)));
		for (const reminder of reminders) {
			await reminder.focus(true);
		}

		assert.deepStrictEqual({
			remindersPerWindow: reminders.map(reminder => reminder.events.length),
			claimed: shared.has(LAST_SHOWN_STORAGE_KEY),
		}, {
			remindersPerWindow: [1, 0],
			claimed: true,
		});
	});

	test('does not overwrite a claim that another window made while its shared read was pending', async () => {
		const shared = new Map<string, string>();
		const readDelay = new DeferredPromise<void>();
		const delayed = await createReminder({ buildAgeDays: 61, hadLastFocus: false, storage: store.add(new WindowStorageService(shared, readDelay.p)) });
		const other = await createReminder({ buildAgeDays: 61, hadLastFocus: false, storage: store.add(new WindowStorageService(shared)) });

		await delayed.focus(true);
		// The other window must claim with a later timestamp than the delayed window's check started at.
		await timeout(5);
		await other.focus(true);
		readDelay.complete();
		await timeout(0);

		assert.deepStrictEqual({
			remindersPerWindow: [delayed.events.length, other.events.length],
		}, {
			remindersPerWindow: [0, 1],
		});
	});

	test('logs the experiment trigger in every arm, and shows the reminder only while the setting is on', async () => {
		const outcome = async (options: IReminderOptions) => {
			const reminder = await createReminder(options);
			return { reminders: reminder.events.length, claimed: reminder.lastShown !== undefined, triggers: reminder.triggers };
		};

		assert.deepStrictEqual({
			tooNew: await outcome({ buildAgeDays: 59 }),
			enabled: await outcome({ buildAgeDays: 61 }),
			disabledByExperiment: await outcome({ buildAgeDays: 61, enabled: false }),
			disabledByUser: await outcome({ buildAgeDays: 61, enabled: false, userConfigured: true }),
		}, {
			tooNew: { reminders: 0, claimed: false, triggers: [] },
			enabled: { reminders: 1, claimed: true, triggers: [`config.${SETTING}`] },
			disabledByExperiment: { reminders: 0, claimed: false, triggers: [`config.${SETTING}`] },
			disabledByUser: { reminders: 0, claimed: false, triggers: [] },
		});
	});

	test('hides the reminder as soon as the setting is turned off', async () => {
		const banner = await createReminder({ buildAgeDays: 61 });
		const notification = await createReminder({ buildAgeDays: 61, isSessionsWindow: true });
		const readDelay = new DeferredPromise<void>();
		const pending = await createReminder({ buildAgeDays: 61, storage: store.add(new WindowStorageService(new Map(), readDelay.p)) });
		for (const reminder of [banner, notification, pending]) {
			await reminder.setEnabled(false);
		}
		readDelay.complete();
		await timeout(0);

		assert.deepStrictEqual({
			banner: banner.events.at(-1),
			notification: notification.events.at(-1),
			pending: pending.events,
		}, {
			banner: { hide: OutdatedBuildReminderContribution.ID },
			notification: 'close',
			pending: [],
		});
	});

	test('offers the update action that matches the update state', async () => {
		const actionsFor = async (state: State) => formatActions((await createReminder({ buildAgeDays: 61, state })).banner?.actions);

		assert.deepStrictEqual({
			uninitialized: await actionsFor(State.Uninitialized),
			idle: await actionsFor(State.Idle(UpdateType.Archive)),
			disabled: await actionsFor(State.Disabled(DisablementReason.Policy)),
			availableForDownload: await actionsFor(State.AvailableForDownload(update)),
			downloading: await actionsFor(State.Downloading(update, false, false)),
			downloaded: await actionsFor(State.Downloaded(update, false, false)),
			ready: await actionsFor(State.Ready(update, false, false)),
		}, {
			uninitialized: [],
			idle: ['Check for Updates -> command:update.check', `Open Download Page -> ${DOWNLOAD_URL}`],
			disabled: [`Open Download Page -> ${DOWNLOAD_URL}`],
			availableForDownload: ['Download Update -> command:update.downloadNow'],
			downloading: [],
			downloaded: ['Install Update -> command:update.install'],
			ready: ['Restart to Update -> command:update.restart'],
		});
	});

	test('shows a notification in the Agents window, which has no banner', async () => {
		const reminder = await createReminder({ buildAgeDays: 61, isSessionsWindow: true });
		reminder.setState(State.Ready(update, false, false));
		await reminder.notificationActions[0].run();
		reminder.contribution.dispose();

		assert.deepStrictEqual(reminder.events, [
			{
				notification: {
					message: MESSAGE,
					sticky: true,
					telemetry: 'update.outdatedBuildReminder',
					actions: ['Check for Updates -> command:update.check', `Open Download Page -> ${DOWNLOAD_URL}`],
				},
			},
			{ updateActions: ['Restart to Update -> command:update.restart'] },
			{ open: 'command:update.restart', allowCommands: true },
			'close',
		]);
	});
});
