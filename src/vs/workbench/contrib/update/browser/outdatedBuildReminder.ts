/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { NotificationTelemetryId } from '../../../../platform/notification/common/notificationTelemetry.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { tryParseDate } from '../common/updateUtils.js';

const DAY = 24 * 60 * 60 * 1000;
const OUTDATED_BUILD_AGE = 60 * DAY;
const REMINDER_INTERVAL = 30 * DAY;
const LAST_SHOWN_STORAGE_KEY = 'update/outdatedBuildReminderLastShown';
const OUTDATED_BUILD_REMINDER_SETTING = 'update.showOutdatedBuildReminder';

interface IReminderAction {
	readonly label: string;
	readonly href: string;
}

/**
 * A future timestamp means the clock moved back, so it does not count as recent.
 */
function wasShownRecently(lastShown: string | undefined, now: number): boolean {
	const time = Number(lastShown);
	return lastShown !== undefined && time <= now && now - time < REMINDER_INTERVAL;
}

/**
 * Reminds users to update once their build is two months old, at most once a month.
 * Editor windows show a banner; the Agents window has no banner, so it shows a notification.
 */
export class OutdatedBuildReminderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.outdatedBuildReminder';

	private readonly reminder = this._register(new MutableDisposable());

	constructor(
		@IBannerService private readonly bannerService: IBannerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		const buildDate = tryParseDate(productService.date);
		if (buildDate === undefined) {
			return;
		}

		// Hide a visible reminder as soon as the setting is turned off, for example by an experiment.
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OUTDATED_BUILD_REMINDER_SETTING) && !this.isEnabled()) {
				this.reminder.clear();
			}
		}));

		// Checking on focus also covers windows that stay open while the build ages.
		this._register(hostService.onDidChangeFocus(focused => {
			if (focused) {
				this.showReminderIfDue(buildDate);
			}
		}));

		hostService.hadLastFocus().then(hadLastFocus => {
			if (hadLastFocus && !this._store.isDisposed) {
				this.showReminderIfDue(buildDate);
			}
		});
	}

	private async showReminderIfDue(buildDate: number): Promise<void> {
		if (Date.now() - buildDate < OUTDATED_BUILD_AGE) {
			return;
		}

		// Every experiment arm reaches this point, so log the trigger before reading the setting or the
		// last-shown time, which only the enabled arm writes. A value the user chose is not affected by experiments.
		if (!isConfigured(this.configurationService.inspect(OUTDATED_BUILD_REMINDER_SETTING))) {
			logSettingExperimentTrigger(this.telemetryService, OUTDATED_BUILD_REMINDER_SETTING);
		}
		if (!this.isEnabled()) {
			return;
		}

		// The local cache lags behind other windows, so it can only rule a reminder out without a round trip.
		if (wasShownRecently(this.storageService.get(LAST_SHOWN_STORAGE_KEY, StorageScope.APPLICATION_SHARED), Date.now())) {
			return;
		}

		// Claim the interval atomically, so that only one window shows the reminder.
		const lastShown = await this.storageService.readApplicationSharedValue(LAST_SHOWN_STORAGE_KEY);
		// Read the clock after the shared read, so a claim another window made meanwhile does not look like a future timestamp.
		const now = Date.now();
		if (this._store.isDisposed || wasShownRecently(lastShown, now)) {
			return;
		}
		const { swapped } = await this.storageService.compareAndSwapApplicationSharedValue(LAST_SHOWN_STORAGE_KEY, lastShown, String(now));
		// The setting may have been turned off while the claim was pending.
		if (!swapped || this._store.isDisposed || !this.isEnabled()) {
			return;
		}

		const message = localize('outdatedBuildReminder.message', "This version of {0} is {1} old. Update to get the latest features and fixes.", this.productService.nameLong, fromNow(buildDate, false, true));
		this.reminder.clear();
		this.reminder.value = this.environmentService.isSessionsWindow ? this.showNotification(message) : this.showBanner(message);
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(OUTDATED_BUILD_REMINDER_SETTING) !== false;
	}

	private showBanner(message: string): IDisposable {
		const store = new DisposableStore();
		const show = (actions: readonly IReminderAction[]) => this.bannerService.show({
			id: OutdatedBuildReminderContribution.ID,
			icon: Codicon.info,
			message,
			actions,
			// Yield to more important banners, such as Restricted Mode or a required managed settings update.
			priority: -2,
			neutral: true,
			onClose: () => store.dispose(),
		});

		const actions = this.getActions(this.updateService.state) ?? [];
		show(actions);
		status(message);
		store.add(this.onDidChangeActions(actions, show));
		store.add(toDisposable(() => this.bannerService.hide(OutdatedBuildReminderContribution.ID)));
		return store;
	}

	private showNotification(message: string): IDisposable {
		const store = new DisposableStore();
		const actions = this.getActions(this.updateService.state) ?? [];
		const handle = this.notificationService.notify({
			severity: Severity.Info,
			message,
			actions: { primary: this.toNotificationActions(actions) },
			sticky: true,
			telemetry: NotificationTelemetryId.UpdateOutdatedBuildReminder,
		});

		store.add(Event.once(handle.onDidClose)(() => store.dispose()));
		store.add(this.onDidChangeActions(actions, next => handle.updateActions({ primary: this.toNotificationActions(next) })));
		store.add(toDisposable(() => handle.close()));
		return store;
	}

	/**
	 * Calls `onChange` when an update state change affects the reminder's actions.
	 * Transient states, such as downloading, keep the current actions.
	 */
	private onDidChangeActions(initial: readonly IReminderAction[], onChange: (actions: readonly IReminderAction[]) => void): IDisposable {
		let current = initial;
		return this.updateService.onStateChange(state => {
			const actions = this.getActions(state);
			if (actions && !equals(actions, current, (a, b) => a.label === b.label && a.href === b.href)) {
				current = actions;
				onChange(actions);
			}
		});
	}

	/**
	 * Returns the actions for the given update state, or `undefined` for transient states.
	 */
	private getActions(state: State): IReminderAction[] | undefined {
		const downloadPage: IReminderAction[] = this.productService.downloadUrl
			? [{ label: localize('outdatedBuildReminder.openDownloadPage', "Open Download Page"), href: this.productService.downloadUrl }]
			: [];

		switch (state.type) {
			case StateType.Idle:
				return [{ label: localize('outdatedBuildReminder.checkForUpdates', "Check for Updates"), href: 'command:update.check' }, ...downloadPage];
			case StateType.AvailableForDownload:
				return [{ label: localize('outdatedBuildReminder.downloadUpdate', "Download Update"), href: 'command:update.downloadNow' }];
			case StateType.Downloaded:
				return [{ label: localize('outdatedBuildReminder.installUpdate', "Install Update"), href: 'command:update.install' }];
			case StateType.Ready:
				return [{ label: localize('outdatedBuildReminder.restartToUpdate', "Restart to Update"), href: 'command:update.restart' }];
			case StateType.Disabled:
				return downloadPage;
			default:
				return undefined;
		}
	}

	private toNotificationActions(actions: readonly IReminderAction[]): IAction[] {
		return actions.map(action => toAction({
			id: action.href,
			label: action.label,
			run: () => this.openerService.open(action.href, { allowCommands: true }),
		}));
	}
}
