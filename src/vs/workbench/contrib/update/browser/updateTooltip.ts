/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { toAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService, nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { AvailableForDownload, Disabled, DisablementReason, Downloaded, Downloading, Idle, IUpdate, Overwriting, Ready, Restarting, State, StateType, Updating } from '../../../../platform/update/common/update.js';
import { ShowCurrentReleaseNotesActionId } from '../common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl, tryParseDate } from '../common/updateUtils.js';
import './media/updateTooltip.css';

/**
 * A stateful tooltip control for the update status.
 */
export class UpdateTooltip extends Disposable {
	public readonly domNode: HTMLElement;

	// Header section
	private readonly titleNode: HTMLElement;

	// Product info section
	private readonly productInfoNode: HTMLElement;
	private readonly productNameNode: HTMLElement;
	private readonly currentVersionNode: HTMLElement;
	private readonly currentVersionCopyValue: { value: string };
	private readonly latestVersionNode: HTMLElement;
	private readonly latestVersionCopyValue: { value: string };
	private readonly releaseDateNode: HTMLElement;

	// Progress section
	private readonly progressContainer: HTMLElement;
	private readonly progressFill: HTMLElement;
	private readonly progressPercentNode: HTMLElement;
	private readonly progressSizeNode: HTMLElement;

	// Extra download info
	private readonly downloadStatsContainer: HTMLElement;
	private readonly timeRemainingNode: HTMLElement;
	private readonly speedInfoNode: HTMLElement;

	// Update markdown section
	private readonly markdownContainer: HTMLElement;
	private readonly markdown = this._register(new MutableDisposable());

	// State-specific message
	private readonly messageNode: HTMLElement;

	// Button bar
	private readonly buttonBar: HTMLElement;
	private readonly releaseNotesButton: HTMLButtonElement;
	private readonly actionButton: HTMLButtonElement;

	private releaseNotesVersion: string | undefined;

	constructor(
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IMeteredConnectionService private readonly meteredConnectionService: IMeteredConnectionService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
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
		this.productInfoNode = dom.append(this.domNode, dom.$('.product-info'));

		const logoContainer = dom.append(this.productInfoNode, dom.$('.product-logo'));
		logoContainer.setAttribute('role', 'img');
		logoContainer.setAttribute('aria-label', this.productService.nameLong);

		const details = dom.append(this.productInfoNode, dom.$('.product-details'));

		this.productNameNode = dom.append(details, dom.$('.product-name'));
		this.productNameNode.textContent = this.productService.nameLong;

		const currentVersionRow = this.createVersionRow(details);
		this.currentVersionNode = currentVersionRow.label;
		this.currentVersionCopyValue = currentVersionRow.copyValue;

		const latestVersionRow = this.createVersionRow(details);
		this.latestVersionNode = latestVersionRow.label;
		this.latestVersionCopyValue = latestVersionRow.copyValue;

		this.releaseDateNode = dom.append(details, dom.$('.product-release-date'));

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

		// Update markdown section
		this.markdownContainer = dom.append(this.domNode, dom.$('.update-markdown'));

		// State-specific message
		this.messageNode = dom.append(this.domNode, dom.$('.state-message'));

		// Button bar
		this.buttonBar = dom.append(this.domNode, dom.$('.button-bar'));

		this.releaseNotesButton = dom.append(this.buttonBar, dom.$('button.release-notes-button')) as HTMLButtonElement;
		this.releaseNotesButton.textContent = localize('updateTooltip.viewReleaseNotes', "View Release Notes");
		this._register(dom.addDisposableListener(this.releaseNotesButton, 'click', () => {
			if (this.releaseNotesVersion) {
				this.runCommandAndClose(ShowCurrentReleaseNotesActionId, this.releaseNotesVersion);
			}
		}));

		this.actionButton = dom.append(this.buttonBar, dom.$('button.action-button')) as HTMLButtonElement;
		this._register(dom.addDisposableListener(this.actionButton, 'click', () => {
			const commandId = this.actionButton.dataset.commandId;
			if (commandId) {
				this.runCommandAndClose(commandId);
			}
		}));

		// Populate static product info
		this.updateCurrentVersion();
	}

	private updateCurrentVersion() {
		const productVersion = this.productService.version;
		if (productVersion) {
			const currentCommitId = this.productService.commit?.substring(0, 7);
			this.currentVersionNode.textContent = currentCommitId
				? localize('updateTooltip.currentVersionLabelWithCommit', "Current Version: {0} ({1})", productVersion, currentCommitId)
				: localize('updateTooltip.currentVersionLabel', "Current Version: {0}", productVersion);
			this.currentVersionCopyValue.value = currentCommitId ? `${productVersion} (${this.productService.commit})` : productVersion;
			this.currentVersionNode.parentElement!.style.display = '';
		} else {
			this.currentVersionNode.parentElement!.style.display = 'none';
		}
	}

	private hideAll() {
		this.productInfoNode.style.display = '';
		this.progressContainer.style.display = 'none';
		this.speedInfoNode.textContent = '';
		this.timeRemainingNode.textContent = '';
		this.messageNode.style.display = 'none';
		this.markdownContainer.style.display = 'none';
		this.markdown.clear();
		this.actionButton.style.display = 'none';
		this.actionButton.dataset.commandId = '';
		this.releaseNotesButton.style.marginRight = '';
	}

	public renderState(state: State) {
		this.hideAll();
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
			case StateType.Restarting:
				this.renderRestarting(state);
				break;
		}
	}

	private renderUninitialized() {
		this.renderTitleAndInfo(localize('updateTooltip.initializingTitle', "Initializing"));
		this.renderMessage(localize('updateTooltip.initializingMessage', "Initializing update service..."));
	}

	private renderDisabled({ reason }: Disabled) {
		this.renderTitleAndInfo(localize('updateTooltip.updatesDisabledTitle', "Updates Disabled"));
		switch (reason) {
			case DisablementReason.NotBuilt:
				this.renderMessage(
					localize('updateTooltip.disabledNotBuilt', "Updates are not available for this build."),
					Codicon.info);
				break;
			case DisablementReason.DisabledByEnvironment:
				this.renderMessage(
					localize('updateTooltip.disabledByEnvironment', "Updates are disabled by the --disable-updates command line flag."),
					Codicon.warning);
				break;
			case DisablementReason.ManuallyDisabled:
				this.renderMessage(
					localize('updateTooltip.disabledManually', "Updates are manually disabled. Change the \"update.mode\" setting to enable."),
					Codicon.warning);
				break;
			case DisablementReason.Policy:
				this.renderMessage(
					localize('updateTooltip.disabledByPolicy', "Updates are disabled by organization policy."),
					Codicon.info);
				break;
			case DisablementReason.MissingConfiguration:
				this.renderMessage(
					localize('updateTooltip.disabledMissingConfig', "Updates are disabled because no update URL is configured."),
					Codicon.info);
				break;
			case DisablementReason.InvalidConfiguration:
				this.renderMessage(
					localize('updateTooltip.disabledInvalidConfig', "Updates are disabled because the update URL is invalid."),
					Codicon.error);
				break;
			case DisablementReason.RunningAsAdmin:
				this.renderMessage(
					localize(
						'updateTooltip.disabledRunningAsAdmin',
						"Updates are not available when running a user install of {0} as administrator.",
						this.productService.nameShort),
					Codicon.warning);
				break;
			default:
				this.renderMessage(localize('updateTooltip.disabledGeneric', "Updates are disabled."), Codicon.warning);
				break;
		}
	}

	private renderIdle({ error, notAvailable }: Idle) {
		if (error) {
			this.renderTitleAndInfo(localize('updateTooltip.updateErrorTitle', "Update Error"));
			this.renderMessage(error, Codicon.error);
			return;
		}

		if (notAvailable) {
			this.renderTitleAndInfo(localize('updateTooltip.noUpdateAvailableTitle', "No Update Available"));
			this.renderMessage(localize('updateTooltip.noUpdateAvailableMessage', "There are no updates currently available."), Codicon.info);
			return;
		}

		this.renderTitleAndInfo(localize('updateTooltip.upToDateTitle', "Up to Date"));
		switch (this.configurationService.getValue<string>('update.mode')) {
			case 'none':
				this.renderMessage(localize('updateTooltip.autoUpdateNone', "Automatic updates are disabled."), Codicon.warning);
				break;
			case 'manual':
				this.renderMessage(localize('updateTooltip.autoUpdateManual', "Automatic updates will be checked but not installed automatically."));
				break;
			case 'start':
				this.renderMessage(localize('updateTooltip.autoUpdateStart', "Updates will be applied on restart."));
				break;
			case 'default':
				if (this.meteredConnectionService.isConnectionMetered) {
					this.renderMessage(
						localize('updateTooltip.meteredConnectionMessage', "Automatic updates are paused because the network connection is metered."),
						Codicon.radioTower);
				} else {
					this.renderMessage(
						localize('updateTooltip.autoUpdateDefault', "Automatic updates are enabled. Happy Coding!"),
						Codicon.smiley);
				}
				break;
		}
	}

	private renderCheckingForUpdates() {
		this.renderTitleAndInfo(localize('updateTooltip.checkingForUpdatesTitle', "Checking for Updates"));
		this.renderMessage(localize('updateTooltip.checkingPleaseWait', "Checking for updates, please wait..."));
	}

	private renderAvailableForDownload({ update }: AvailableForDownload) {
		this.renderTitleAndInfo(localize('updateTooltip.updateAvailableTitle', "Update Available"), update);
		this.renderActionButton(localize('updateTooltip.downloadButton', "Download"), 'update.downloadNow');
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
			this.renderMessage(localize('updateTooltip.downloadingPleaseWait', "Downloading update, please wait..."));
		}
	}

	private renderDownloaded({ update }: Downloaded) {
		this.renderTitleAndInfo(localize('updateTooltip.updateReadyTitle', "Update is Ready to Install"), update);
		this.renderActionButton(localize('updateTooltip.installButton', "Install"), 'update.install');
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
			this.renderMessage(localize('updateTooltip.installingPleaseWait', "Installing update, please wait..."));
		}
	}

	private renderReady({ update }: Ready) {
		this.renderTitleAndInfo(localize('updateTooltip.updateInstalledTitle', "Update Installed"), update);
		this.renderActionButton(localize('updateTooltip.restartButton', "Restart"), 'update.restart');
	}

	private renderOverwriting({ update }: Overwriting) {
		this.renderTitleAndInfo(localize('updateTooltip.downloadingNewerUpdateTitle', "Downloading Newer Update"), update);
		this.renderMessage(localize('updateTooltip.downloadingNewerPleaseWait', "A newer update was released. Downloading, please wait..."));
	}

	private renderRestarting({ update }: Restarting) {
		this.renderTitleAndInfo(localize('updateTooltip.restartingTitle', "Restarting {0}", this.productService.nameShort), update);
		this.renderMessage(localize('updateTooltip.restartingPleaseWait', "Restarting to update, please wait..."));
	}

	public async renderPostInstall(markdown?: string): Promise<boolean> {
		this.hideAll();
		this.renderTitleAndInfo(localize('updateTooltip.installedDefaultTitle', "New Update Installed"));
		this.renderMessage(
			localize('updateTooltip.installedDefaultMessage', "See release notes for details on what's new in this release."),
			Codicon.info);

		let text: string | null = markdown ?? null;
		if (!text) {
			try {
				const url = getUpdateInfoUrl(this.productService.version);
				const context = await this.requestService.request({ url, callSite: 'updateTooltip' }, CancellationToken.None);
				text = await asTextOrError(context);
			} catch { }
		}

		if (!text) {
			return false;
		}

		this.titleNode.textContent = localize('updateTooltip.installedTitle', "New in {0}", this.productService.version);
		this.productInfoNode.style.display = 'none';
		this.messageNode.style.display = 'none';

		const rendered = this.markdownRendererService.render(
			new MarkdownString(text, {
				isTrusted: true,
				supportHtml: true,
				supportThemeIcons: true,
			}),
			{
				actionHandler: (link, mdStr) => {
					openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
					this.hoverService.hideHover(true);
				},
			});

		this.markdown.value = rendered;
		dom.clearNode(this.markdownContainer);
		this.markdownContainer.appendChild(rendered.element);
		this.markdownContainer.style.display = '';

		return true;
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
			this.latestVersionCopyValue.value = updateCommitId ? `${version} (${update.version})` : version;
			this.latestVersionNode.parentElement!.style.display = '';
		} else {
			this.latestVersionNode.parentElement!.style.display = 'none';
		}

		// Release date
		const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
		if (typeof releaseDate === 'number' && releaseDate > 0) {
			this.releaseDateNode.textContent = localize('updateTooltip.releasedLabel', "Released {0}", formatDate(releaseDate));
			this.releaseDateNode.style.display = '';
		} else {
			this.releaseDateNode.style.display = 'none';
		}

		// Release notes button
		this.releaseNotesVersion = version ?? this.productService.version;
		this.releaseNotesButton.style.display = this.releaseNotesVersion ? '' : 'none';
		this.buttonBar.style.display = this.releaseNotesVersion ? '' : 'none';
	}

	private renderActionButton(label: string, commandId: string) {
		this.actionButton.textContent = label;
		this.actionButton.dataset.commandId = commandId;
		this.actionButton.style.display = '';
		this.releaseNotesButton.style.marginRight = 'auto';
	}

	private renderMessage(message: string, icon?: ThemeIcon) {
		dom.clearNode(this.messageNode);
		if (icon) {
			const iconNode = dom.append(this.messageNode, dom.$('.state-message-icon'));
			iconNode.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
		dom.append(this.messageNode, document.createTextNode(message));
		this.messageNode.style.display = '';
	}

	private createVersionRow(parent: HTMLElement): { label: HTMLElement; copyValue: { value: string } } {
		const row = dom.append(parent, dom.$('.product-version'));
		const label = dom.append(row, dom.$('span'));
		const copyValue = { value: '' };

		const copyButton = dom.append(row, dom.$('a.copy-version-button'));
		copyButton.setAttribute('role', 'button');
		copyButton.setAttribute('tabindex', '0');
		const title = localize('updateTooltip.copyVersion', "Copy");
		copyButton.title = title;
		copyButton.setAttribute('aria-label', title);

		const copyIcon = dom.append(copyButton, dom.$('.copy-icon'));
		copyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.copy));
		this._register(dom.addDisposableListener(copyButton, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			if (copyValue.value) {
				this.clipboardService.writeText(copyValue.value);
			}
		}));

		return { label, copyValue };
	}

	private runCommandAndClose(command: string, ...args: unknown[]) {
		this.commandService.executeCommand(command, ...args);
		this.hoverService.hideHover(true);
	}
}
