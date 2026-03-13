/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService, nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AvailableForDownload, Disabled, DisablementReason, Downloaded, Downloading, Idle, IUpdate, IUpdateService, Overwriting, Ready, State, StateType, Updating } from '../../../../platform/update/common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, tryParseDate } from '../common/updateUtils.js';
import './media/updateTooltip.css';

/**
 * A stateful tooltip control for the update status.
 */
export class UpdateTooltip extends Disposable {
	public readonly domNode: HTMLElement;

	// Header section
	private readonly titleNode: HTMLElement;

	// Product info section
	private readonly productNameNode: HTMLElement;
	private readonly currentVersionNode: HTMLElement;
	private readonly latestVersionNode: HTMLElement;
	private readonly releaseDateNode: HTMLElement;
	private readonly releaseNotesLink: HTMLAnchorElement;

	// Progress section
	private readonly progressContainer: HTMLElement;
	private readonly progressFill: HTMLElement;
	private readonly progressPercentNode: HTMLElement;
	private readonly progressSizeNode: HTMLElement;

	// Extra download info
	private readonly downloadStatsContainer: HTMLElement;
	private readonly timeRemainingNode: HTMLElement;
	private readonly speedInfoNode: HTMLElement;

	// State-specific message
	private readonly messageNode: HTMLElement;

	private releaseNotesVersion: string | undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMeteredConnectionService private readonly meteredConnectionService: IMeteredConnectionService,
		@IProductService private readonly productService: IProductService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		this.domNode = dom.$('.update-tooltip');

		// Header section
		const header = dom.append(this.domNode, dom.$('.header'));
		this.titleNode = dom.append(header, dom.$('.title'));

		const actionBar = this._register(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
		actionBar.push(toAction({
			id: 'update.openSettings',
			label: localize('updateTooltip.settingsTooltip', "Update Settings"),
			class: ThemeIcon.asClassName(Codicon.gear),
			run: () => this.runCommandAndClose('workbench.action.openSettings', '@id:update*'),
		}), { icon: true, label: false });

		// Product info section
		const productInfo = dom.append(this.domNode, dom.$('.product-info'));

		const logoContainer = dom.append(productInfo, dom.$('.product-logo'));
		logoContainer.setAttribute('role', 'img');
		logoContainer.setAttribute('aria-label', this.productService.nameLong);

		const details = dom.append(productInfo, dom.$('.product-details'));

		this.productNameNode = dom.append(details, dom.$('.product-name'));
		this.productNameNode.textContent = this.productService.nameLong;

		this.currentVersionNode = dom.append(details, dom.$('.product-version'));
		this.latestVersionNode = dom.append(details, dom.$('.product-version'));
		this.releaseDateNode = dom.append(details, dom.$('.product-release-date'));

		this.releaseNotesLink = dom.append(details, dom.$('a.release-notes-link')) as HTMLAnchorElement;
		this.releaseNotesLink.textContent = localize('updateTooltip.releaseNotesLink', "Release Notes");
		this.releaseNotesLink.href = '#';
		this._register(dom.addDisposableListener(this.releaseNotesLink, 'click', (e) => {
			e.preventDefault();
			if (this.releaseNotesVersion) {
				this.runCommandAndClose('update.showCurrentReleaseNotes', this.releaseNotesVersion);
			}
		}));

		// Progress section
		this.progressContainer = dom.append(this.domNode, dom.$('.progress-container'));
		const progressBar = dom.append(this.progressContainer, dom.$('.progress-bar'));
		this.progressFill = dom.append(progressBar, dom.$('.progress-fill'));

		const progressText = dom.append(this.progressContainer, dom.$('.progress-text'));
		this.progressPercentNode = dom.append(progressText, dom.$('span'));
		this.progressSizeNode = dom.append(progressText, dom.$('span'));

		// Extra download stats
		this.downloadStatsContainer = dom.append(this.progressContainer, dom.$('.download-stats'));
		this.timeRemainingNode = dom.append(this.downloadStatsContainer, dom.$('.time-remaining'));
		this.speedInfoNode = dom.append(this.downloadStatsContainer, dom.$('.speed-info'));

		// State-specific message
		this.messageNode = dom.append(this.domNode, dom.$('.state-message'));

		// Populate static product info
		this.updateCurrentVersion();

		// Subscribe to state changes
		this._register(updateService.onStateChange(state => this.onStateChange(state)));
		this.onStateChange(updateService.state);
	}

	private updateCurrentVersion() {
		const productVersion = this.productService.version;
		if (productVersion) {
			const currentCommitId = this.productService.commit?.substring(0, 7);
			this.currentVersionNode.textContent = currentCommitId
				? localize('updateTooltip.currentVersionLabelWithCommit', "Current Version: {0} ({1})", productVersion, currentCommitId)
				: localize('updateTooltip.currentVersionLabel', "Current Version: {0}", productVersion);
			this.currentVersionNode.style.display = '';
		} else {
			this.currentVersionNode.style.display = 'none';
		}
	}

	private onStateChange(state: State) {
		this.progressContainer.style.display = 'none';
		this.speedInfoNode.textContent = '';
		this.timeRemainingNode.textContent = '';
		this.messageNode.style.display = 'none';

		switch (state.type) {
			case StateType.Uninitialized:
				this.renderUninitialized();
				break;
			case StateType.Disabled:
				this.renderDisabled(state);
				break;
			case StateType.Idle:
				this.renderIdle(state);
				break;
			case StateType.CheckingForUpdates:
				this.renderCheckingForUpdates();
				break;
			case StateType.AvailableForDownload:
				this.renderAvailableForDownload(state);
				break;
			case StateType.Downloading:
				this.renderDownloading(state);
				break;
			case StateType.Downloaded:
				this.renderDownloaded(state);
				break;
			case StateType.Updating:
				this.renderUpdating(state);
				break;
			case StateType.Ready:
				this.renderReady(state);
				break;
			case StateType.Overwriting:
				this.renderOverwriting(state);
				break;
		}
	}

	private renderUninitialized() {
		this.renderTitleAndInfo(localize('updateTooltip.initializingTitle', "Initializing"));
		this.showMessage(localize('updateTooltip.initializingMessage', "Initializing update service..."));
	}

	private renderDisabled({ reason }: Disabled) {
		this.renderTitleAndInfo(localize('updateTooltip.updatesDisabledTitle', "Updates Disabled"));
		switch (reason) {
			case DisablementReason.NotBuilt:
				this.showMessage(
					localize('updateTooltip.disabledNotBuilt', "Updates are not available for this build."),
					Codicon.info);
				break;
			case DisablementReason.DisabledByEnvironment:
				this.showMessage(
					localize('updateTooltip.disabledByEnvironment', "Updates are disabled by the --disable-updates command line flag."),
					Codicon.warning);
				break;
			case DisablementReason.ManuallyDisabled:
				this.showMessage(
					localize('updateTooltip.disabledManually', "Updates are manually disabled. Change the \"update.mode\" setting to enable."),
					Codicon.warning);
				break;
			case DisablementReason.Policy:
				this.showMessage(
					localize('updateTooltip.disabledByPolicy', "Updates are disabled by organization policy."),
					Codicon.info);
				break;
			case DisablementReason.MissingConfiguration:
				this.showMessage(
					localize('updateTooltip.disabledMissingConfig', "Updates are disabled because no update URL is configured."),
					Codicon.info);
				break;
			case DisablementReason.InvalidConfiguration:
				this.showMessage(
					localize('updateTooltip.disabledInvalidConfig', "Updates are disabled because the update URL is invalid."),
					Codicon.error);
				break;
			case DisablementReason.RunningAsAdmin:
				this.showMessage(
					localize(
						'updateTooltip.disabledRunningAsAdmin',
						"Updates are not available when running a user install of {0} as administrator.",
						this.productService.nameShort),
					Codicon.warning);
				break;
			default:
				this.showMessage(localize('updateTooltip.disabledGeneric', "Updates are disabled."), Codicon.warning);
				break;
		}
	}

	private renderIdle({ error, notAvailable }: Idle) {
		if (error) {
			this.renderTitleAndInfo(localize('updateTooltip.updateErrorTitle', "Update Error"));
			this.showMessage(error, Codicon.error);
			return;
		}

		if (notAvailable) {
			this.renderTitleAndInfo(localize('updateTooltip.noUpdateAvailableTitle', "No Update Available"));
			this.showMessage(localize('updateTooltip.noUpdateAvailableMessage', "There are no updates currently available."), Codicon.info);
			return;
		}

		this.renderTitleAndInfo(localize('updateTooltip.upToDateTitle', "Up to Date"));
		switch (this.configurationService.getValue<string>('update.mode')) {
			case 'none':
				this.showMessage(localize('updateTooltip.autoUpdateNone', "Automatic updates are disabled."), Codicon.warning);
				break;
			case 'manual':
				this.showMessage(localize('updateTooltip.autoUpdateManual', "Automatic updates will be checked but not installed automatically."));
				break;
			case 'start':
				this.showMessage(localize('updateTooltip.autoUpdateStart', "Updates will be applied on restart."));
				break;
			case 'default':
				if (this.meteredConnectionService.isConnectionMetered) {
					this.showMessage(
						localize('updateTooltip.meteredConnectionMessage', "Automatic updates are paused because the network connection is metered."),
						Codicon.radioTower);
				} else {
					this.showMessage(
						localize('updateTooltip.autoUpdateDefault', "Automatic updates are enabled. Happy Coding!"),
						Codicon.smiley);
				}
				break;
		}
	}

	private renderCheckingForUpdates() {
		this.renderTitleAndInfo(localize('updateTooltip.checkingForUpdatesTitle', "Checking for Updates"));
		this.showMessage(localize('updateTooltip.checkingPleaseWait', "Checking for updates, please wait..."));
	}

	private renderAvailableForDownload({ update }: AvailableForDownload) {
		this.renderTitleAndInfo(localize('updateTooltip.updateAvailableTitle', "Update Available"), update);
	}

	private renderDownloading(state: Downloading) {
		this.renderTitleAndInfo(localize('updateTooltip.downloadingUpdateTitle', "Downloading Update"), state.update);

		const { downloadedBytes, totalBytes } = state;
		if (downloadedBytes !== undefined && totalBytes !== undefined && totalBytes > 0) {
			const percentage = computeProgressPercent(downloadedBytes, totalBytes) ?? 0;
			this.progressFill.style.width = `${percentage}%`;
			this.progressPercentNode.textContent = `${percentage}%`;
			this.progressSizeNode.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
			this.progressContainer.style.display = '';

			const speed = computeDownloadSpeed(state);
			if (speed !== undefined && speed > 0) {
				this.speedInfoNode.textContent = localize('updateTooltip.downloadSpeed', '{0}/s', formatBytes(speed));
			}

			const timeRemaining = computeDownloadTimeRemaining(state);
			if (timeRemaining !== undefined && timeRemaining > 0) {
				this.timeRemainingNode.textContent = `~${formatTimeRemaining(timeRemaining)} ${localize('updateTooltip.timeRemaining', "remaining")}`;
			}

			this.downloadStatsContainer.style.display = '';
		} else {
			this.showMessage(localize('updateTooltip.downloadingPleaseWait', "Downloading update, please wait..."));
		}
	}

	private renderDownloaded({ update }: Downloaded) {
		this.renderTitleAndInfo(localize('updateTooltip.updateReadyTitle', "Update is Ready to Install"), update);
	}

	private renderUpdating({ update, currentProgress, maxProgress }: Updating) {
		this.renderTitleAndInfo(localize('updateTooltip.installingUpdateTitle', "Installing Update"), update);

		const percentage = computeProgressPercent(currentProgress, maxProgress);
		if (percentage !== undefined) {
			this.progressFill.style.width = `${percentage}%`;
			this.progressPercentNode.textContent = `${percentage}%`;
			this.progressSizeNode.textContent = '';
			this.progressContainer.style.display = '';
		} else {
			this.showMessage(localize('updateTooltip.installingPleaseWait', "Installing update, please wait..."));
		}
	}

	private renderReady({ update }: Ready) {
		this.renderTitleAndInfo(localize('updateTooltip.updateInstalledTitle', "Update Installed"), update);
	}

	private renderOverwriting({ update }: Overwriting) {
		this.renderTitleAndInfo(localize('updateTooltip.downloadingNewerUpdateTitle', "Downloading Newer Update"), update);
		this.showMessage(localize('updateTooltip.downloadingNewerPleaseWait', "A newer update was released. Downloading, please wait..."));
	}

	private renderTitleAndInfo(title: string, update?: IUpdate) {
		this.titleNode.textContent = title;

		// Latest version
		const version = update?.productVersion;
		if (version) {
			const updateCommitId = update.version?.substring(0, 7);
			this.latestVersionNode.textContent = updateCommitId
				? localize('updateTooltip.latestVersionLabelWithCommit', "Latest Version: {0} ({1})", version, updateCommitId)
				: localize('updateTooltip.latestVersionLabel', "Latest Version: {0}", version);
			this.latestVersionNode.style.display = '';
		} else {
			this.latestVersionNode.style.display = 'none';
		}

		// Release date
		const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
		if (typeof releaseDate === 'number' && releaseDate > 0) {
			this.releaseDateNode.textContent = localize('updateTooltip.releasedLabel', "Released {0}", formatDate(releaseDate));
			this.releaseDateNode.style.display = '';
		} else {
			this.releaseDateNode.style.display = 'none';
		}

		// Release notes link
		this.releaseNotesVersion = version ?? this.productService.version;
		this.releaseNotesLink.style.display = this.releaseNotesVersion ? '' : 'none';
	}

	private showMessage(message: string, icon?: ThemeIcon) {
		dom.clearNode(this.messageNode);
		if (icon) {
			const iconNode = dom.append(this.messageNode, dom.$('.state-message-icon'));
			iconNode.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
		dom.append(this.messageNode, document.createTextNode(message));
		this.messageNode.style.display = '';
	}

	private runCommandAndClose(command: string, ...args: unknown[]) {
		this.commandService.executeCommand(command, ...args);
		this.hoverService.hideHover(true);
	}
}
