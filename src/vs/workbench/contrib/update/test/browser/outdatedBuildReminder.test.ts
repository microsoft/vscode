/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotification, INotificationActions, INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DisablementReason, IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IBannerItem, IBannerService } from '../../../../services/banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { OutdatedBuildReminderContribution } from '../../browser/outdatedBuildReminder.js';

const DAY = 24 * 60 * 60 * 1000;
const LAST_SHOWN_STORAGE_KEY = 'update/outdatedBuildReminderLastShown';
const DOWNLOAD_URL = 'https://code.visualstudio.com/Download';
const MESSAGE = 'This version of Visual Studio Code is 2 months old. Update to get the latest features and fixes.';

interface IReminderOptions {
	readonly buildAgeDays?: number;
	readonly lastShownDaysAgo?: number;
	readonly hadLastFocus?: boolean;
	readonly state?: State;
	readonly isSessionsWindow?: boolean;
}

function formatActions(actions: readonly { readonly label: string | HTMLElement; readonly href?: string; readonly id?: string }[] | undefined): string[] {
	return (actions ?? []).map(action => `${action.label} -> ${action.href ?? action.id}`);
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
		const storage = store.add(new InMemoryStorageService());
		if (options.lastShownDaysAgo !== undefined) {
			storage.store(LAST_SHOWN_STORAGE_KEY, now - options.lastShownDaysAgo * DAY, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		const hadLastFocus = Promise.resolve(options.hadLastFocus ?? true);
		const onDidChangeFocus = store.add(new Emitter<boolean>());
		const onStateChange = store.add(new Emitter<State>());
		const updateService = new class extends mock<IUpdateService>() {
			override state = options.state ?? State.Idle(UpdateType.Archive);
			override readonly onStateChange = onStateChange.event;
		}();

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
			updateService,
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = !!options.isSessionsWindow;
			}(),
		));

		// The contribution reacts to the same promise, so its startup check has run once this resolves.
		await hadLastFocus;

		return {
			contribution,
			events,
			get banner() { return banner; },
			get notificationActions(): readonly IAction[] { return notification?.actions?.primary ?? []; },
			get lastShown() { return storage.getNumber(LAST_SHOWN_STORAGE_KEY, StorageScope.APPLICATION); },
			focus: (focused: boolean) => onDidChangeFocus.fire(focused),
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
		reminder.focus(true);

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
				reminder.focus(focused);
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
