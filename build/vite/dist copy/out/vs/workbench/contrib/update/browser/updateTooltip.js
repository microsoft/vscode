/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { ShowCurrentReleaseNotesActionId } from '../common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl, tryParseDate } from '../common/updateUtils.js';
import './media/updateTooltip.css';
/**
 * A stateful tooltip control for the update status.
 */
let UpdateTooltip = class UpdateTooltip extends Disposable {
    constructor(clipboardService, commandService, configurationService, hoverService, markdownRendererService, meteredConnectionService, openerService, productService, requestService) {
        super();
        this.clipboardService = clipboardService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.markdownRendererService = markdownRendererService;
        this.meteredConnectionService = meteredConnectionService;
        this.openerService = openerService;
        this.productService = productService;
        this.requestService = requestService;
        this.markdown = this._register(new MutableDisposable());
        this.domNode = dom.$('.update-tooltip');
        // Header section
        const header = dom.append(this.domNode, dom.$('.header'));
        this.titleNode = dom.append(header, dom.$('.title'));
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
        this.releaseNotesButton = dom.append(this.buttonBar, dom.$('button.release-notes-button'));
        this.releaseNotesButton.textContent = localize('updateTooltip.viewReleaseNotes', "Release Notes");
        this._register(dom.addDisposableListener(this.releaseNotesButton, 'click', () => {
            if (this.releaseNotesVersion) {
                this.runCommandAndClose(ShowCurrentReleaseNotesActionId, this.releaseNotesVersion);
            }
        }));
        this.actionButton = dom.append(this.buttonBar, dom.$('button.action-button'));
        this._register(dom.addDisposableListener(this.actionButton, 'click', () => {
            const commandId = this.actionButton.dataset.commandId;
            if (commandId) {
                this.runCommandAndClose(commandId);
            }
        }));
        // Populate static product info
        this.updateCurrentVersion();
    }
    updateCurrentVersion() {
        const productVersion = this.productService.version;
        if (productVersion) {
            const currentCommitId = this.productService.commit?.substring(0, 7);
            this.currentVersionNode.textContent = currentCommitId
                ? localize('updateTooltip.currentVersionLabelWithCommit', "Current Version: {0} ({1})", productVersion, currentCommitId)
                : localize('updateTooltip.currentVersionLabel', "Current Version: {0}", productVersion);
            this.currentVersionCopyValue.value = currentCommitId ? `${productVersion} (${this.productService.commit})` : productVersion;
            this.currentVersionNode.parentElement.style.display = '';
        }
        else {
            this.currentVersionNode.parentElement.style.display = 'none';
        }
    }
    hideAll() {
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
    renderState(state) {
        this.hideAll();
        switch (state.type) {
            case "uninitialized" /* StateType.Uninitialized */:
                this.renderUninitialized();
                break;
            case "disabled" /* StateType.Disabled */:
                this.renderDisabled(state);
                break;
            case "idle" /* StateType.Idle */:
                this.renderIdle(state);
                break;
            case "checking for updates" /* StateType.CheckingForUpdates */:
                this.renderCheckingForUpdates();
                break;
            case "available for download" /* StateType.AvailableForDownload */:
                this.renderAvailableForDownload(state);
                break;
            case "downloading" /* StateType.Downloading */:
                this.renderDownloading(state);
                break;
            case "downloaded" /* StateType.Downloaded */:
                this.renderDownloaded(state);
                break;
            case "updating" /* StateType.Updating */:
                this.renderUpdating(state);
                break;
            case "ready" /* StateType.Ready */:
                this.renderReady(state);
                break;
            case "overwriting" /* StateType.Overwriting */:
                this.renderOverwriting(state);
                break;
            case "restarting" /* StateType.Restarting */:
                this.renderRestarting(state);
                break;
        }
    }
    renderUninitialized() {
        this.renderTitleAndInfo(localize('updateTooltip.initializingTitle', "Initializing"));
        this.renderMessage(localize('updateTooltip.initializingMessage', "Initializing update service..."));
    }
    renderDisabled({ reason }) {
        this.renderTitleAndInfo(localize('updateTooltip.updatesDisabledTitle', "Updates Disabled"));
        switch (reason) {
            case 0 /* DisablementReason.NotBuilt */:
                this.renderMessage(localize('updateTooltip.disabledNotBuilt', "Updates are not available for this build."), Codicon.info);
                break;
            case 1 /* DisablementReason.DisabledByEnvironment */:
                this.renderMessage(localize('updateTooltip.disabledByEnvironment', "Updates are disabled by the --disable-updates command line flag."), Codicon.warning);
                break;
            case 2 /* DisablementReason.ManuallyDisabled */:
                this.renderMessage(localize('updateTooltip.disabledManually', "Updates are manually disabled. Change the \"update.mode\" setting to enable."), Codicon.warning);
                break;
            case 3 /* DisablementReason.Policy */:
                this.renderMessage(localize('updateTooltip.disabledByPolicy', "Updates are disabled by organization policy."), Codicon.info);
                break;
            case 4 /* DisablementReason.MissingConfiguration */:
                this.renderMessage(localize('updateTooltip.disabledMissingConfig', "Updates are disabled because no update URL is configured."), Codicon.info);
                break;
            case 5 /* DisablementReason.InvalidConfiguration */:
                this.renderMessage(localize('updateTooltip.disabledInvalidConfig', "Updates are disabled because the update URL is invalid."), Codicon.error);
                break;
            case 6 /* DisablementReason.RunningAsAdmin */:
                this.renderMessage(localize('updateTooltip.disabledRunningAsAdmin', "Updates are not available when running a user install of {0} as administrator.", this.productService.nameShort), Codicon.warning);
                break;
            default:
                this.renderMessage(localize('updateTooltip.disabledGeneric', "Updates are disabled."), Codicon.warning);
                break;
        }
    }
    renderIdle({ error, notAvailable }) {
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
        switch (this.configurationService.getValue('update.mode')) {
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
                    this.renderMessage(localize('updateTooltip.meteredConnectionMessage', "Automatic updates are paused because the network connection is metered."), Codicon.radioTower);
                }
                else {
                    this.renderMessage(localize('updateTooltip.autoUpdateDefault', "Automatic updates are enabled. Happy Coding!"), Codicon.smiley);
                }
                break;
        }
    }
    renderCheckingForUpdates() {
        this.renderTitleAndInfo(localize('updateTooltip.checkingForUpdatesTitle', "Checking for Updates"));
        this.renderMessage(localize('updateTooltip.checkingPleaseWait', "Checking for updates, please wait..."));
    }
    renderAvailableForDownload({ update }) {
        this.renderTitleAndInfo(localize('updateTooltip.updateAvailableTitle', "Update Available"), update);
        this.renderActionButton(localize('updateTooltip.downloadButton', "Download"), 'update.downloadNow');
    }
    renderDownloading(state) {
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
        }
        else {
            this.renderMessage(localize('updateTooltip.downloadingPleaseWait', "Downloading update, please wait..."));
        }
    }
    renderDownloaded({ update }) {
        this.renderTitleAndInfo(localize('updateTooltip.updateReadyTitle', "Update is Ready to Install"), update);
        this.renderActionButton(localize('updateTooltip.installButton', "Install"), 'update.install');
    }
    renderUpdating({ update, currentProgress, maxProgress }) {
        this.renderTitleAndInfo(localize('updateTooltip.installingUpdateTitle', "Installing Update"), update);
        const percentage = computeProgressPercent(currentProgress, maxProgress);
        if (percentage !== undefined) {
            this.progressFill.style.width = `${percentage}%`;
            this.progressPercentNode.textContent = `${percentage}%`;
            this.progressSizeNode.textContent = '';
            this.progressContainer.style.display = '';
        }
        else {
            this.renderMessage(localize('updateTooltip.installingPleaseWait', "Installing update, please wait..."));
        }
    }
    renderReady({ update }) {
        if (this.configurationService.getValue('update.mode') === 'manual') {
            this.renderTitleAndInfo(localize('updateTooltip.updateInstalledTitle', "Update Installed"), update);
            this.renderActionButton(localize('updateTooltip.restartButton', "Restart"), 'update.restart');
        }
        else {
            this.renderTitleAndInfo(localize('updateTooltip.restartToUpdateTitle', "Restart to Update"), update);
        }
    }
    renderOverwriting({ update }) {
        this.renderTitleAndInfo(localize('updateTooltip.downloadingNewerUpdateTitle', "Downloading Newer Update"), update);
        this.renderMessage(localize('updateTooltip.downloadingNewerPleaseWait', "A newer update was released. Downloading, please wait..."));
    }
    renderRestarting({ update }) {
        this.renderTitleAndInfo(localize('updateTooltip.restartingTitle', "Restarting {0}", this.productService.nameShort), update);
        this.renderMessage(localize('updateTooltip.restartingPleaseWait', "Restarting to update, please wait..."));
    }
    async renderPostInstall(markdown) {
        this.hideAll();
        this.renderTitleAndInfo(localize('updateTooltip.installedDefaultTitle', "New Update Installed"));
        this.renderMessage(localize('updateTooltip.installedDefaultMessage', "See release notes for details on what's new in this release."), Codicon.info);
        let text = markdown ?? null;
        if (!text) {
            try {
                const url = getUpdateInfoUrl(this.productService.version);
                const context = await this.requestService.request({ url, callSite: 'updateTooltip' }, CancellationToken.None);
                text = await asTextOrError(context);
            }
            catch { }
        }
        if (!text) {
            return false;
        }
        this.titleNode.textContent = localize('updateTooltip.installedTitle', "New in {0}", this.productService.version);
        this.productInfoNode.style.display = 'none';
        this.messageNode.style.display = 'none';
        const rendered = this.markdownRendererService.render(new MarkdownString(text, {
            isTrusted: true,
            supportHtml: true,
            supportThemeIcons: true,
        }), {
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
    renderTitleAndInfo(title, update) {
        this.titleNode.textContent = title;
        // Latest version
        const version = update?.productVersion;
        if (version) {
            const updateCommitId = update.version?.substring(0, 7);
            this.latestVersionNode.textContent = updateCommitId
                ? localize('updateTooltip.latestVersionLabelWithCommit', "Latest Version: {0} ({1})", version, updateCommitId)
                : localize('updateTooltip.latestVersionLabel', "Latest Version: {0}", version);
            this.latestVersionCopyValue.value = updateCommitId ? `${version} (${update.version})` : version;
            this.latestVersionNode.parentElement.style.display = '';
        }
        else {
            this.latestVersionNode.parentElement.style.display = 'none';
        }
        // Release date
        const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
        if (typeof releaseDate === 'number' && releaseDate > 0) {
            this.releaseDateNode.textContent = localize('updateTooltip.releasedLabel', "Released {0}", formatDate(releaseDate));
            this.releaseDateNode.style.display = '';
        }
        else {
            this.releaseDateNode.style.display = 'none';
        }
        // Release notes button
        this.releaseNotesVersion = version ?? this.productService.version;
        this.releaseNotesButton.style.display = this.releaseNotesVersion ? '' : 'none';
        this.releaseNotesButton.style.marginRight = this.releaseNotesVersion ? 'auto' : '';
        this.buttonBar.style.display = this.releaseNotesVersion ? '' : 'none';
    }
    renderActionButton(label, commandId) {
        this.actionButton.textContent = label;
        this.actionButton.dataset.commandId = commandId;
        this.actionButton.style.display = '';
    }
    renderMessage(message, icon) {
        dom.clearNode(this.messageNode);
        if (icon) {
            const iconNode = dom.append(this.messageNode, dom.$('.state-message-icon'));
            iconNode.classList.add(...ThemeIcon.asClassNameArray(icon));
        }
        dom.append(this.messageNode, document.createTextNode(message));
        this.messageNode.style.display = '';
    }
    createVersionRow(parent) {
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
    runCommandAndClose(command, ...args) {
        this.commandService.executeCommand(command, ...args);
        this.hoverService.hideHover(true);
    }
};
UpdateTooltip = __decorate([
    __param(0, IClipboardService),
    __param(1, ICommandService),
    __param(2, IConfigurationService),
    __param(3, IHoverService),
    __param(4, IMarkdownRendererService),
    __param(5, IMeteredConnectionService),
    __param(6, IOpenerService),
    __param(7, IProductService),
    __param(8, IRequestService)
], UpdateTooltip);
export { UpdateTooltip };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlVG9vbHRpcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZVRvb2x0aXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDM0gsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDL0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsYUFB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