/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService, nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Downloading, IUpdate, IUpdateService, Overwriting, StateType, State as UpdateState } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, TooltipContent } from '../../../services/statusbar/browser/statusbar.js';
import './media/updateStatusBarEntry.css';

/**
 * Displays update status and actions in the status bar.
 */
export class UpdateStatusBarEntryContribution extends Disposable implements IWorkbenchContribution {
	private static readonly NAME = nls.localize('updateStatus', "Update Status");
	private readonly statusBarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private lastStateType: StateType | undefined;

	constructor(
		@IUpdateService private readonly updateService: IUpdateService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this._register(this.updateService.onStateChange(state => this.onUpdateStateChange(state)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('update.statusBar')) {
				this.onUpdateStateChange(this.updateService.state);
			}
		}));
		this.onUpdateStateChange(this.updateService.state);
	}

	private onUpdateStateChange(state: UpdateState) {
		if (this.lastStateType !== state.type) {
			this.statusBarEntryAccessor.clear();
			this.lastStateType = state.type;
		}

		const statusBarMode = this.configurationService.getValue<string>('update.statusBar');

		if (statusBarMode === 'hidden') {
			this.statusBarEntryAccessor.clear();
			return;
		}

		const actionRequiredStates = [
			StateType.AvailableForDownload,
			StateType.Downloaded,
			StateType.Ready
		];

		// In 'actionable' mode, only show for states that require user action
		if (statusBarMode === 'actionable' && !actionRequiredStates.includes(state.type)) {
			this.statusBarEntryAccessor.clear();
			return;
		}

		switch (state.type) {
			case StateType.Uninitialized:
			case StateType.Idle:
			case StateType.Disabled:
				this.statusBarEntryAccessor.clear();
				break;

			case StateType.CheckingForUpdates:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.checkingForUpdates', "$(sync~spin) Checking for updates..."),
					ariaLabel: nls.localize('updateStatus.checkingForUpdatesAria', "Checking for updates"),
					tooltip: this.getCheckingTooltip(),
					command: ShowTooltipCommand
				});
				break;

			case StateType.AvailableForDownload:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.updateAvailableStatus', "$(cloud-download) Update is available. Click here to download."),
					ariaLabel: nls.localize('updateStatus.updateAvailableAria', "Update available. Click here to download."),
					tooltip: this.getAvailableTooltip(state.update),
					command: 'update.downloadNow'
				});
				break;

			case StateType.Downloading:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: this.getDownloadingText(state),
					ariaLabel: nls.localize('updateStatus.downloadingUpdateAria', "Downloading update"),
					tooltip: this.getDownloadingTooltip(state),
					command: ShowTooltipCommand
				});
				break;

			case StateType.Downloaded:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.updateReadyStatus', "$(package) Downloaded update. Click here to install."),
					ariaLabel: nls.localize('updateStatus.updateReadyAria', "Downloaded update. Click here to install."),
					tooltip: this.getReadyToInstallTooltip(state.update),
					command: 'update.install'
				});
				break;

			case StateType.Updating:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.installingUpdateStatus', "$(sync~spin) Installing update..."),
					ariaLabel: nls.localize('updateStatus.installingUpdateAria', "Installing update"),
					tooltip: this.getUpdatingTooltip(state.update),
					command: ShowTooltipCommand
				});
				break;

			case StateType.Ready:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.restartToUpdateStatus', "$(debug-restart) Update is ready. Click here to restart."),
					ariaLabel: nls.localize('updateStatus.restartToUpdateAria', "Update is ready. Click here to restart."),
					tooltip: this.getRestartToUpdateTooltip(state.update),
					command: 'update.restart'
				});
				break;

			case StateType.Overwriting:
				this.updateStatusBarEntry({
					name: UpdateStatusBarEntryContribution.NAME,
					text: nls.localize('updateStatus.downloadingNewerUpdateStatus', "$(sync~spin) Downloading update..."),
					ariaLabel: nls.localize('updateStatus.downloadingNewerUpdateAria', "Downloading a newer update"),
					tooltip: this.getOverwritingTooltip(state),
					command: ShowTooltipCommand
				});
				break;
		}
	}

	private updateStatusBarEntry(entry: IStatusbarEntry) {
		if (this.statusBarEntryAccessor.value) {
			this.statusBarEntryAccessor.value.update(entry);
		} else {
			this.statusBarEntryAccessor.value = this.statusbarService.addEntry(
				entry,
				'status.update',
				StatusbarAlignment.LEFT,
				-Number.MAX_VALUE
			);
		}
	}

	private getCheckingTooltip(): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.checkingForUpdatesTitle', "Checking for Updates"), store);
				this.appendProductInfo(container);

				const waitMessage = dom.append(container, dom.$('.progress-details'));
				waitMessage.textContent = nls.localize('updateStatus.checkingPleaseWait', "Checking for updates, please wait...");

				return container;
			}
		};
	}

	private getAvailableTooltip(update: IUpdate): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.updateAvailableTitle', "Update Available"), store);
				this.appendProductInfo(container, update);
				this.appendWhatsIncluded(container);

				this.appendActionButton(container, nls.localize('updateStatus.downloadButton', "Download"), store, () => {
					this.runCommandAndClose('update.downloadNow');
				});

				return container;
			}
		};
	}

	private getDownloadingText({ downloadedBytes, totalBytes }: Downloading): string {
		if (downloadedBytes !== undefined && totalBytes !== undefined && totalBytes > 0) {
			return nls.localize('updateStatus.downloadUpdateProgressStatus', "$(sync~spin) Downloading update: {0} / {1} • {2}%",
				formatBytes(downloadedBytes),
				formatBytes(totalBytes),
				Math.round((downloadedBytes / totalBytes) * 100));
		} else {
			return nls.localize('updateStatus.downloadUpdateStatus', "$(sync~spin) Downloading update...");
		}
	}

	private getDownloadingTooltip(state: Downloading): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.downloadingUpdateTitle', "Downloading Update"), store);
				this.appendProductInfo(container, state.update);

				const { downloadedBytes, totalBytes } = state;
				if (downloadedBytes !== undefined && totalBytes !== undefined && totalBytes > 0) {
					const percentage = Math.round((downloadedBytes / totalBytes) * 100);

					const progressContainer = dom.append(container, dom.$('.progress-container'));
					const progressBar = dom.append(progressContainer, dom.$('.progress-bar'));
					const progressFill = dom.append(progressBar, dom.$('.progress-fill'));
					progressFill.style.width = `${percentage}%`;

					const progressText = dom.append(progressContainer, dom.$('.progress-text'));
					const percentageSpan = dom.append(progressText, dom.$('span'));
					percentageSpan.textContent = `${percentage}%`;

					const sizeSpan = dom.append(progressText, dom.$('span'));
					sizeSpan.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;

					const speed = computeDownloadSpeed(state);
					if (speed !== undefined && speed > 0) {
						const speedInfo = dom.append(container, dom.$('.speed-info'));
						speedInfo.textContent = nls.localize('updateStatus.downloadSpeed', '{0}/s', formatBytes(speed));
					}

					const timeRemaining = computeDownloadTimeRemaining(state);
					if (timeRemaining !== undefined && timeRemaining > 0) {
						const timeRemainingNode = dom.append(container, dom.$('.time-remaining'));
						timeRemainingNode.textContent = `~${formatTimeRemaining(timeRemaining)} ${nls.localize('updateStatus.timeRemaining', "remaining")}`;
					}
				} else {
					const waitMessage = dom.append(container, dom.$('.progress-details'));
					waitMessage.textContent = nls.localize('updateStatus.downloadingPleaseWait', "Downloading, please wait...");
				}

				return container;
			}
		};
	}

	private getReadyToInstallTooltip(update: IUpdate): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.updateReadyTitle', "Update is Ready to Install"), store);
				this.appendProductInfo(container, update);
				this.appendWhatsIncluded(container);

				this.appendActionButton(container, nls.localize('updateStatus.installButton', "Install"), store, () => {
					this.runCommandAndClose('update.install');
				});

				return container;
			}
		};
	}

	private getRestartToUpdateTooltip(update: IUpdate): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.updateInstalledTitle', "Update Installed"), store);
				this.appendProductInfo(container, update);
				this.appendWhatsIncluded(container);

				this.appendActionButton(container, nls.localize('updateStatus.restartButton', "Restart"), store, () => {
					this.runCommandAndClose('update.restart');
				});

				return container;
			}
		};
	}

	private getUpdatingTooltip(update: IUpdate): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.installingUpdateTitle', "Installing Update"), store);
				this.appendProductInfo(container, update);

				const message = dom.append(container, dom.$('.progress-details'));
				message.textContent = nls.localize('updateStatus.installingPleaseWait', "Installing update, please wait...");

				return container;
			}
		};
	}

	private getOverwritingTooltip(state: Overwriting): TooltipContent {
		return {
			element: (token: CancellationToken) => {
				const store = this.createTooltipDisposableStore(token);
				const container = dom.$('.update-status-tooltip');

				this.appendHeader(container, nls.localize('updateStatus.downloadingNewerUpdateTitle', "Downloading Newer Update"), store);
				this.appendProductInfo(container, state.update);

				const message = dom.append(container, dom.$('.progress-details'));
				message.textContent = nls.localize('updateStatus.downloadingNewerPleaseWait', "A newer update was released. Downloading, please wait...");

				return container;
			}
		};
	}

	private createTooltipDisposableStore(token: CancellationToken): DisposableStore {
		const store = new DisposableStore();
		store.add(token.onCancellationRequested(() => store.dispose()));
		return store;
	}

	private runCommandAndClose(command: string, ...args: unknown[]): void {
		this.commandService.executeCommand(command, ...args);
		this.hoverService.hideHover(true);
	}

	private appendHeader(container: HTMLElement, title: string, store: DisposableStore) {
		const header = dom.append(container, dom.$('.header'));
		const text = dom.append(header, dom.$('.title'));
		text.textContent = title;

		const actionBar = store.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
		actionBar.push([toAction({
			id: 'update.openSettings',
			label: nls.localize('updateStatus.settingsTooltip', "Update Settings"),
			class: ThemeIcon.asClassName(Codicon.gear),
			run: () => this.runCommandAndClose('workbench.action.openSettings', '@id:update*'),
		})], { icon: true, label: false });
	}

	private appendProductInfo(container: HTMLElement, update?: IUpdate) {
		const productInfo = dom.append(container, dom.$('.product-info'));

		const logoContainer = dom.append(productInfo, dom.$('.product-logo'));
		logoContainer.setAttribute('role', 'img');
		logoContainer.setAttribute('aria-label', this.productService.nameLong);

		const details = dom.append(productInfo, dom.$('.product-details'));

		const productName = dom.append(details, dom.$('.product-name'));
		productName.textContent = this.productService.nameLong;

		const productVersion = this.productService.version;
		if (productVersion) {
			const currentVersion = dom.append(details, dom.$('.product-version'));
			currentVersion.textContent = nls.localize('updateStatus.currentVersionLabel', "Current Version: {0}", productVersion);
		}

		const version = update?.productVersion;
		if (version) {
			const latestVersion = dom.append(details, dom.$('.product-version'));
			latestVersion.textContent = nls.localize('updateStatus.latestVersionLabel', "Latest Version: {0}", version);
		}

		const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
		if (releaseDate) {
			const releaseDateNode = dom.append(details, dom.$('.product-release-date'));
			releaseDateNode.textContent = nls.localize('updateStatus.releasedLabel', "Released {0}", formatDate(releaseDate));
		}

		const releaseNotesVersion = version ?? productVersion;
		if (releaseNotesVersion) {
			const link = dom.append(details, dom.$('a.release-notes-link')) as HTMLAnchorElement;
			link.textContent = nls.localize('updateStatus.releaseNotesLink', "Release Notes");
			link.href = '#';
			link.addEventListener('click', (e) => {
				e.preventDefault();
				this.runCommandAndClose('update.showCurrentReleaseNotes', releaseNotesVersion);
			});
		}
	}

	private appendWhatsIncluded(container: HTMLElement): void {
		const whatsIncluded = dom.append(container, dom.$('.whats-included'));

		const sectionTitle = dom.append(whatsIncluded, dom.$('.section-title'));
		sectionTitle.textContent = nls.localize('updateStatus.whatsIncludedTitle', "What's Included");

		const list = dom.append(whatsIncluded, dom.$('ul'));

		const items = [
			nls.localize('updateStatus.featureItem', "New features and functionality"),
			nls.localize('updateStatus.bugFixesItem', "Bug fixes and improvements"),
			nls.localize('updateStatus.securityItem', "Security fixes and enhancements")
		];

		for (const item of items) {
			const li = dom.append(list, dom.$('li'));
			li.textContent = item;
		}
	}

	private appendActionButton(container: HTMLElement, label: string, store: DisposableStore, onClick: () => void): void {
		const buttonContainer = dom.append(container, dom.$('.action-button-container'));
		const button = store.add(new Button(buttonContainer, { ...defaultButtonStyles, secondary: true, hoverDelegate: nativeHoverDelegate }));
		button.label = label;
		store.add(button.onDidClick(onClick));
	}
}

/**
 * Tries to parse a date string and returns the timestamp or undefined if parsing fails.
 */
export function tryParseDate(date: string | undefined): number | undefined {
	try {
		return date !== undefined ? Date.parse(date) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Formats a timestamp as a localized date string.
 */
export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Computes an estimate of remaining download time in seconds.
 */
export function computeDownloadTimeRemaining(state: Downloading): number | undefined {
	const { downloadedBytes, totalBytes, startTime } = state;
	if (downloadedBytes === undefined || totalBytes === undefined || startTime === undefined) {
		return undefined;
	}

	const elapsedMs = Date.now() - startTime;
	if (downloadedBytes <= 0 || totalBytes <= 0 || elapsedMs <= 0) {
		return undefined;
	}

	const remainingBytes = totalBytes - downloadedBytes;
	if (remainingBytes <= 0) {
		return 0;
	}

	const bytesPerMs = downloadedBytes / elapsedMs;
	if (bytesPerMs <= 0) {
		return undefined;
	}

	const remainingMs = remainingBytes / bytesPerMs;
	return Math.ceil(remainingMs / 1000);
}

/**
 * Formats the time remaining as a human-readable string.
 */
export function formatTimeRemaining(seconds: number): string {
	const hours = seconds / 3600;
	if (hours >= 1) {
		const formattedHours = formatDecimal(hours);
		return formattedHours === '1'
			? nls.localize('timeRemainingHour', "{0} hour", formattedHours)
			: nls.localize('timeRemainingHours', "{0} hours", formattedHours);
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes >= 1) {
		return nls.localize('timeRemainingMinutes', "{0} min", minutes);
	}

	return nls.localize('timeRemainingSeconds', "{0}s", seconds);
}

/**
 * Formats a byte count as a human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return nls.localize('bytes', "{0} B", bytes);
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return nls.localize('kilobytes', "{0} KB", formatDecimal(kb));
	}

	const mb = kb / 1024;
	if (mb < 1024) {
		return nls.localize('megabytes', "{0} MB", formatDecimal(mb));
	}

	const gb = mb / 1024;
	return nls.localize('gigabytes', "{0} GB", formatDecimal(gb));
}

/**
 * Formats a number to 1 decimal place, omitting ".0" for whole numbers.
 */
function formatDecimal(value: number): string {
	const rounded = Math.round(value * 10) / 10;
	return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
}

/**
 * Computes the current download speed in bytes per second.
 */
export function computeDownloadSpeed(state: Downloading): number | undefined {
	const { downloadedBytes, startTime } = state;
	if (downloadedBytes === undefined || startTime === undefined) {
		return undefined;
	}

	const elapsedMs = Date.now() - startTime;
	if (elapsedMs <= 0 || downloadedBytes <= 0) {
		return undefined;
	}

	return (downloadedBytes / elapsedMs) * 1000;
}
