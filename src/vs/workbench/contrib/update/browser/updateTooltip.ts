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
import { AvailableForDownload, Disabled, DisablementReason, Downloaded, Downloading, Idle, IUpdate, Overwriting, Ready, State, StateType, Updating } from '../../../../platform/update/common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl } from '../common/updateUtils.js';
import './media/updateTooltip.css';

/**
 * A stateful tooltip control for the update status.
 */
export class UpdateTooltip extends Disposable {
	public readonly domNode: HTMLElement;

	// Header
	private readonly titleNode: HTMLElement;
	private readonly headerLogo: HTMLElement;

	// Step indicator
	private readonly stepperContainer: HTMLElement;

	// Version details (collapsible — hidden)
	private readonly versionDetails: HTMLDetailsElement;

	// Release notes link
	private readonly productInfoNode: HTMLElement;
	private readonly releaseDateNode: HTMLElement;
	private readonly releaseNotesLink: HTMLAnchorElement;

	// Separator
	private readonly separator: HTMLElement;

	// Progress section
	private readonly progressContainer: HTMLElement;
	private readonly progressFill: HTMLElement;
	private readonly progressPercentNode: HTMLElement;
	private readonly progressSizeNode: HTMLElement;

	// Collapsible details section (versions, download stats)
	private readonly detailsSection: HTMLDetailsElement;
	private readonly currentVersionNode: HTMLElement;
	private readonly targetVersionNode: HTMLElement;
	private readonly downloadStatsRow: HTMLElement;
	private readonly downloadedSizeNode: HTMLElement;
	private readonly downloadSpeedNode: HTMLElement;

	// Markdown section
	private readonly markdownContainer: HTMLElement;
	private readonly markdown = this._register(new MutableDisposable());

	// Message
	private readonly messageNode: HTMLElement;

	// Action button
	private readonly actionButton: HTMLElement;

	private releaseNotesVersion: string | undefined;

	constructor(
		_hostedByTitleBar: boolean,
		_clipboardService: IClipboardService,
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

		// Header
		const header = dom.append(this.domNode, dom.$('.header'));
		this.titleNode = dom.append(header, dom.$('.title'));
		const headerActions = dom.append(header, dom.$('.header-actions'));
		const actionBar = this._register(new ActionBar(headerActions, { hoverDelegate: nativeHoverDelegate }));
		actionBar.push(toAction({
			id: 'update.openSettings',
			label: localize('updateTooltip.settingsTooltip', "Update Settings"),
			class: ThemeIcon.asClassName(Codicon.gear),
			run: () => this.runCommandAndClose('workbench.action.openSettings', '@id:update*'),
		}), { icon: true, label: false });

		// Step indicator (built dynamically by setStepper)
		this.stepperContainer = dom.append(this.domNode, dom.$('.stepper'));

		// Collapsible version details (hidden — kept for DOM structure)
		this.versionDetails = dom.append(this.domNode, dom.$('details.version-details')) as HTMLDetailsElement;
		this.versionDetails.style.display = 'none';
		dom.append(this.versionDetails, dom.$('summary.version-summary'));

		// Release notes link
		this.productInfoNode = dom.append(this.domNode, dom.$('.product-info'));
		this.releaseDateNode = dom.append(this.productInfoNode, dom.$('.product-release-date'));

		// Separator
		this.separator = dom.append(this.domNode, dom.$('.tooltip-separator'));

		// Progress
		this.progressContainer = dom.append(this.domNode, dom.$('.progress-container'));
		const progressBar = dom.append(this.progressContainer, dom.$('.progress-bar'));
		this.progressFill = dom.append(progressBar, dom.$('.progress-fill'));
		const progressText = dom.append(this.progressContainer, dom.$('.progress-text'));
		this.progressPercentNode = dom.append(progressText, dom.$('span'));
		this.progressSizeNode = dom.append(progressText, dom.$('span'));

		// Markdown
		this.markdownContainer = dom.append(this.domNode, dom.$('.update-markdown'));

		// Message
		this.messageNode = dom.append(this.domNode, dom.$('.state-message'));

		// Button row — release notes (secondary) + action (primary) side by side
		const buttonRow = dom.append(this.domNode, dom.$('.tooltip-button-row'));
		this.releaseNotesLink = dom.append(buttonRow, dom.$('a.tooltip-action.secondary')) as HTMLAnchorElement;
		this.releaseNotesLink.href = '#';
		this._register(dom.addDisposableListener(this.releaseNotesLink, 'click', e => {
			e.preventDefault();
			if (this.releaseNotesVersion) {
				this.runCommandAndClose('update.showCurrentReleaseNotes', this.releaseNotesVersion);
			}
		}));
		this.actionButton = dom.append(buttonRow, dom.$('.tooltip-action'));
		this.actionButton.style.display = 'none';

		// Collapsible details section (always at the bottom)
		this.detailsSection = dom.append(this.domNode, dom.$('details.details-section')) as HTMLDetailsElement;
		const detailsSummary = dom.append(this.detailsSection, dom.$('summary.details-summary'));
		this.headerLogo = dom.append(detailsSummary, dom.$('.header-logo'));
		this.headerLogo.setAttribute('role', 'img');
		this.headerLogo.setAttribute('aria-label', this.productService.nameLong);
		dom.append(detailsSummary, document.createTextNode(localize('updateTooltip.details', "Details")));
		const detailsBody = dom.append(this.detailsSection, dom.$('.details-body'));
		const currentVersionRow = dom.append(detailsBody, dom.$('.details-row'));
		dom.append(currentVersionRow, dom.$('.details-label')).textContent = localize('updateTooltip.currentVersion', "Current");
		this.currentVersionNode = dom.append(currentVersionRow, dom.$('.details-value'));
		const targetVersionRow = dom.append(detailsBody, dom.$('.details-row'));
		dom.append(targetVersionRow, dom.$('.details-label')).textContent = localize('updateTooltip.targetVersion', "Latest");
		this.targetVersionNode = dom.append(targetVersionRow, dom.$('.details-value'));
		this.downloadStatsRow = dom.append(detailsBody, dom.$('.details-row.download-stats-row'));
		this.downloadedSizeNode = dom.append(this.downloadStatsRow, dom.$('.details-value'));
		this.downloadSpeedNode = dom.append(this.downloadStatsRow, dom.$('.details-value'));
	}

	private hideAll() {
		this.productInfoNode.style.display = '';
		this.versionDetails.style.display = 'none';
		this.versionDetails.open = false;
		this.headerLogo.style.display = '';
		this.stepperContainer.style.display = 'none';
		this.separator.style.display = 'none';
		this.progressContainer.style.display = 'none';
		this.detailsSection.style.display = 'none';
		this.detailsSection.open = false;
		this.downloadStatsRow.style.display = 'none';
		this.downloadedSizeNode.textContent = '';
		this.downloadSpeedNode.textContent = '';
		this.messageNode.style.display = 'none';
		this.markdownContainer.style.display = 'none';
		this.actionButton.style.display = 'none';
		this.markdown.clear();
	}

	/**
	 * Sets stepper to show steps with completed/active/pending states.
	 * @param activeStep 0=Download, 1=Install, 2=Apply. -1 hides stepper.
	 * @param inProgress Whether the active step is in-progress (shows animation).
	 */
	/**
	 * Shows a contextual stepper based on the active step.
	 * Shows all steps with completed/active/pending states.
	 */
	private setStepper(activeStep: number, inProgress = false) {
		const allSteps = [
			localize('updateTooltip.stepDownload', "Download"),
			localize('updateTooltip.stepInstall', "Install"),
			localize('updateTooltip.stepRestart', "Restart"),
		];
		const completedLabels = [
			localize('updateTooltip.stepDownloaded', "Downloaded"),
			localize('updateTooltip.stepInstalled', "Installed"),
			localize('updateTooltip.stepRestarted', "Restarted"),
		];

		this.stepperContainer.style.display = '';
		dom.clearNode(this.stepperContainer);

		// Show all steps: completed (check), active (filled dot), pending (empty dot)
		for (let i = 0; i < allSteps.length; i++) {
			if (i > 0) {
				const line = dom.append(this.stepperContainer, dom.$('.step-line'));
				if (i <= activeStep) {
					line.classList.add('completed');
				}
			}
			const step = dom.append(this.stepperContainer, dom.$('.step'));
			const circle = dom.append(step, dom.$('.step-circle'));
			const label = dom.append(step, dom.$('.step-label'));
			label.textContent = allSteps[i];
			if (i < activeStep) {
				step.classList.add('completed');
				circle.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
				label.textContent = completedLabels[i];
			} else if (i === activeStep) {
				step.classList.add('active');
				if (inProgress) {
					step.classList.add('in-progress');
				}
			}
		}
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
		}
	}

	private renderUninitialized() {
		this.renderTitleAndInfo(localize('updateTooltip.initializingTitle', "Initializing"));
		this.renderMessage(localize('updateTooltip.initializingMessage', "Initializing update service..."));
	}

	private renderDisabled({ reason }: Disabled) {
		this.renderTitleAndInfo(localize('updateTooltip.updatesDisabledTitle', "Updates Disabled"));
		this.showSeparator();
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
			this.showSeparator();
			this.renderMessage(error, Codicon.error);
			return;
		}

		if (notAvailable) {
			this.renderTitleAndInfo(localize('updateTooltip.upToDateTitle', "Up to Date"));
			return;
		}

		this.renderTitleAndInfo(localize('updateTooltip.upToDateTitle', "Up to Date"));
		this.showSeparator();
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
		this.releaseNotesLink.style.display = 'none';
		this.showSeparator();
		this.renderMessage(localize('updateTooltip.checkingPleaseWait', "Checking for updates, please wait..."));
	}

	private renderAvailableForDownload({ update }: AvailableForDownload) {
		this.renderTitleAndInfo(localize('updateTooltip.updateAvailableTitle', "Update Available"), update);
		this.setStepper(0);
		this.showDetails(update);
		const releaseDate = update.timestamp;
		if (typeof releaseDate === 'number' && releaseDate > 0) {
			this.renderMessage(localize('updateTooltip.releasedOn', "The latest version was released {0}", formatDate(releaseDate)));
		}
		this.showAction(localize('updateTooltip.downloadAction', "Download"), () => this.runCommandAndClose('update.downloadNow'));
	}

	private renderDownloading(state: Downloading) {
		this.renderTitleAndInfo(localize('updateTooltip.downloadingUpdateTitle', "Downloading"), state.update);
		this.setStepper(0, true);
		this.showDetails(state.update);

		const { downloadedBytes, totalBytes } = state;
		if (downloadedBytes !== undefined && totalBytes !== undefined && totalBytes > 0) {
			const percentage = computeProgressPercent(downloadedBytes, totalBytes) ?? 0;
			this.progressFill.style.width = `${percentage}%`;
			this.progressPercentNode.textContent = `${percentage}%`;

			const timeRemaining = computeDownloadTimeRemaining(state);
			if (timeRemaining !== undefined && timeRemaining > 0) {
				this.progressSizeNode.textContent = `~${formatTimeRemaining(timeRemaining)} ${localize('updateTooltip.timeRemaining', "remaining")}`;
			} else {
				this.progressSizeNode.textContent = '';
			}

			// Download stats in details section
			this.downloadedSizeNode.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
			const speed = computeDownloadSpeed(state);
			if (speed !== undefined && speed > 0) {
				const mbps = (speed * 8) / (1024 * 1024);
				this.downloadSpeedNode.textContent = localize('updateTooltip.downloadSpeed', "{0} Mbps", mbps.toFixed(1));
			} else {
				this.downloadSpeedNode.textContent = '';
			}
			this.downloadStatsRow.style.display = '';

			this.progressContainer.style.display = '';
		} else {
			this.renderMessage(localize('updateTooltip.downloadingPleaseWait', "Downloading update, please wait..."));
		}
	}

	private renderDownloaded({ update }: Downloaded) {
		this.renderTitleAndInfo(localize('updateTooltip.updateReadyTitle', "Ready to Install"), update);
		this.setStepper(1);
		this.showDetails(update);
		this.showAction(localize('updateTooltip.installAction', "Install"), () => this.runCommandAndClose('update.install'));
	}

	private renderUpdating({ update, currentProgress, maxProgress }: Updating) {
		this.renderTitleAndInfo(localize('updateTooltip.installingUpdateTitle', "Installing"), update);
		this.setStepper(1, true);
		this.showDetails(update);

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
		this.renderTitleAndInfo(localize('updateTooltip.updateInstalledTitle', "Ready to Update"), update);
		this.setStepper(2);
		this.showDetails(update);
		this.showAction(localize('updateTooltip.restartAction', "Restart"), () => this.runCommandAndClose('update.restart'));
	}

	private renderOverwriting({ update }: Overwriting) {
		this.renderTitleAndInfo(localize('updateTooltip.downloadingNewerUpdateTitle', "Downloading Newer Update"), update);
		this.setStepper(0, true);
		this.showDetails(update);
		this.renderMessage(localize('updateTooltip.downloadingNewerPleaseWait', "A newer update was released. Downloading, please wait..."));
	}

	public async renderPostInstall() {
		this.hideAll();
		this.renderTitleAndInfo(localize('updateTooltip.installedDefaultTitle', "New Update Installed"));
		this.renderMessage(
			localize('updateTooltip.installedDefaultMessage', "See release notes for details on what's new in this release."),
			Codicon.info);

		let text = null;
		try {
			const url = getUpdateInfoUrl(this.productService.version);
			const context = await this.requestService.request({ url, callSite: 'updateTooltip' }, CancellationToken.None);
			text = await asTextOrError(context);
		} catch { }

		if (!text) {
			return;
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
	}

	private renderTitleAndInfo(title: string, update?: IUpdate) {
		this.titleNode.textContent = title;

		const version = update?.productVersion;

		// Always hide version details
		this.versionDetails.style.display = 'none';

		// Release notes button
		this.releaseNotesVersion = version ?? this.productService.version;
		if (this.releaseNotesVersion) {
			this.releaseNotesLink.textContent = localize('updateTooltip.viewLatestReleaseNotes', "View Latest Release Notes");
			this.releaseNotesLink.style.display = '';
		} else {
			this.releaseNotesLink.style.display = 'none';
		}
		this.releaseDateNode.style.display = 'none';
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

	private showSeparator() {
		this.separator.style.display = '';
	}

	private showDetails(update?: IUpdate) {
		this.currentVersionNode.textContent = this.productService.version;
		this.targetVersionNode.textContent = update?.productVersion ?? '';
		this.detailsSection.style.display = '';
	}

	private showAction(label: string, action: () => void) {
		this.actionButton.textContent = label;
		this.actionButton.style.display = '';
		this.actionButton.onclick = e => {
			e.preventDefault();
			action();
		};
	}

	private runCommandAndClose(command: string, ...args: unknown[]) {
		this.commandService.executeCommand(command, ...args);
		this.hoverService.hideHover(true);
	}
}
