var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, isHTMLInputElement, isHTMLTextAreaElement, reset } from '../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Button, ButtonWithDropdown, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Delayer, RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { groupBy } from '../../../../base/common/collections.js';
import { debounce } from '../../../../base/common/decorators.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isLinuxSnap, isMacintosh } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { escape } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Action } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IIssueFormService } from '../common/issue.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';
import { IssueReporterModel } from './issueReporterModel.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
const MAX_URL_LENGTH = 7500;
// Github API and issues on web has a limit of 65536. If extension data is too large, we will allow users to downlaod and attach it as a file.
// We round down to be safe.
// ref https://github.com/github/issues/issues/12858
const MAX_EXTENSION_DATA_LENGTH = 60000;
var IssueSource;
(function (IssueSource) {
    IssueSource["VSCode"] = "vscode";
    IssueSource["Extension"] = "extension";
    IssueSource["Marketplace"] = "marketplace";
    IssueSource["Unknown"] = "unknown";
})(IssueSource || (IssueSource = {}));
let BaseIssueReporterService = class BaseIssueReporterService extends Disposable {
    constructor(disableExtensions, data, os, product, window, isWeb, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService) {
        super();
        this.disableExtensions = disableExtensions;
        this.data = data;
        this.os = os;
        this.product = product;
        this.window = window;
        this.isWeb = isWeb;
        this.issueFormService = issueFormService;
        this.themeService = themeService;
        this.fileService = fileService;
        this.fileDialogService = fileDialogService;
        this.contextMenuService = contextMenuService;
        this.authenticationService = authenticationService;
        this.openerService = openerService;
        this.receivedSystemInfo = false;
        this.numberOfSearchResultsDisplayed = 0;
        this.receivedPerformanceInfo = false;
        this.shouldQueueSearch = false;
        this.hasBeenSubmitted = false;
        this.openReporter = false;
        this.loadingExtensionData = false;
        this.selectedExtension = '';
        this.delayedSubmit = new Delayer(300);
        this.nonGitHubIssueUrl = false;
        this.needsUpdate = false;
        this.acknowledged = false;
        const targetExtension = data.extensionId ? data.enabledExtensions.find(extension => extension.id.toLocaleLowerCase() === data.extensionId?.toLocaleLowerCase()) : undefined;
        this.issueReporterModel = new IssueReporterModel({
            ...data,
            issueType: data.issueType || 0 /* IssueType.Bug */,
            versionInfo: {
                vscodeVersion: `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`,
                os: `${this.os.type} ${this.os.arch} ${this.os.release}${isLinuxSnap ? ' snap' : ''}`
            },
            extensionsDisabled: !!this.disableExtensions,
            fileOnExtension: data.extensionId ? !targetExtension?.isBuiltin : undefined,
            selectedExtension: targetExtension
        });
        this._register(this.authenticationService.onDidChangeSessions(async () => {
            const previousAuthState = !!this.data.githubAccessToken;
            let githubAccessToken = '';
            try {
                const githubSessions = await this.authenticationService.getSessions('github');
                const potentialSessions = githubSessions.filter(session => session.scopes.includes('repo'));
                githubAccessToken = potentialSessions[0]?.accessToken;
            }
            catch (e) {
                // Ignore
            }
            this.data.githubAccessToken = githubAccessToken;
            const currentAuthState = !!githubAccessToken;
            if (previousAuthState !== currentAuthState) {
                this.updateButtonStates();
            }
        }));
        const fileOnMarketplace = data.issueSource === IssueSource.Marketplace;
        const fileOnProduct = data.issueSource === IssueSource.VSCode;
        this.issueReporterModel.update({ fileOnMarketplace, fileOnProduct });
        this.createAction = this._register(new Action('issueReporter.create', localize('create', "Create on GitHub"), undefined, true, async () => {
            this.delayedSubmit.trigger(async () => {
                this.createIssue(true); // create issue
            });
        }));
        this.previewAction = this._register(new Action('issueReporter.preview', localize('preview', "Preview on GitHub"), undefined, true, async () => {
            this.delayedSubmit.trigger(async () => {
                this.createIssue(false); // preview issue
            });
        }));
        this.privateAction = this._register(new Action('issueReporter.privateCreate', localize('privateCreate', "Create Internally"), undefined, true, async () => {
            this.delayedSubmit.trigger(async () => {
                this.createIssue(true, true); // create private issue
            });
        }));
        const issueTitle = data.issueTitle;
        if (issueTitle) {
            // eslint-disable-next-line no-restricted-syntax
            const issueTitleElement = this.getElementById('issue-title');
            if (issueTitleElement) {
                issueTitleElement.value = issueTitle;
            }
        }
        const issueBody = data.issueBody;
        if (issueBody) {
            // eslint-disable-next-line no-restricted-syntax
            const description = this.getElementById('description');
            if (description) {
                description.value = issueBody;
                this.issueReporterModel.update({ issueDescription: issueBody });
            }
        }
        if (this.window.document.documentElement.lang !== 'en') {
            // eslint-disable-next-line no-restricted-syntax
            show(this.getElementById('english'));
        }
        const codiconStyleSheet = createStyleSheet();
        codiconStyleSheet.id = 'codiconStyles';
        const iconsStyleSheet = this._register(getIconsStyleSheet(this.themeService));
        function updateAll() {
            codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
        }
        const delayer = new RunOnceScheduler(updateAll, 0);
        this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
        delayer.schedule();
        this.handleExtensionData(data.enabledExtensions);
        this.setUpTypes();
        // Handle case where extension is pre-selected through the command
        if ((data.data || data.uri) && targetExtension) {
            this.updateExtensionStatus(targetExtension);
        }
        // initialize the reporting button(s)
        // eslint-disable-next-line no-restricted-syntax
        const issueReporterElement = this.getElementById('issue-reporter');
        if (issueReporterElement) {
            this.updateButtonStates();
        }
    }
    render() {
        this.renderBlocks();
    }
    setInitialFocus() {
        const { fileOnExtension } = this.issueReporterModel.getData();
        if (fileOnExtension) {
            // eslint-disable-next-line no-restricted-syntax
            const issueTitle = this.window.document.getElementById('issue-title');
            issueTitle?.focus();
        }
        else {
            // eslint-disable-next-line no-restricted-syntax
            const issueType = this.window.document.getElementById('issue-type');
            issueType?.focus();
        }
    }
    updateButtonStates() {
        // eslint-disable-next-line no-restricted-syntax
        const issueReporterElement = this.getElementById('issue-reporter');
        if (!issueReporterElement) {
            // shouldn't occur -- throw?
            return;
        }
        // public elements section
        // eslint-disable-next-line no-restricted-syntax
        let publicElements = this.getElementById('public-elements');
        if (!publicElements) {
            publicElements = document.createElement('div');
            publicElements.id = 'public-elements';
            publicElements.classList.add('public-elements');
            issueReporterElement.appendChild(publicElements);
        }
        this.updatePublicGithubButton(publicElements);
        this.updatePublicRepoLink(publicElements);
        // private filing section
        // eslint-disable-next-line no-restricted-syntax
        let internalElements = this.getElementById('internal-elements');
        if (!internalElements) {
            internalElements = document.createElement('div');
            internalElements.id = 'internal-elements';
            internalElements.classList.add('internal-elements');
            internalElements.classList.add('hidden');
            issueReporterElement.appendChild(internalElements);
        }
        // eslint-disable-next-line no-restricted-syntax
        let filingRow = this.getElementById('internal-top-row');
        if (!filingRow) {
            filingRow = document.createElement('div');
            filingRow.id = 'internal-top-row';
            filingRow.classList.add('internal-top-row');
            internalElements.appendChild(filingRow);
        }
        this.updateInternalFilingNote(filingRow);
        this.updateInternalGithubButton(filingRow);
        this.updateInternalElementsVisibility();
    }
    updateInternalFilingNote(container) {
        // eslint-disable-next-line no-restricted-syntax
        let filingNote = this.getElementById('internal-preview-message');
        if (!filingNote) {
            filingNote = document.createElement('span');
            filingNote.id = 'internal-preview-message';
            filingNote.classList.add('internal-preview-message');
            container.appendChild(filingNote);
        }
        filingNote.textContent = escape(localize('internalPreviewMessage', 'If your copilot debug logs contain private information:'));
    }
    updatePublicGithubButton(container) {
        // eslint-disable-next-line no-restricted-syntax
        const issueReporterElement = this.getElementById('issue-reporter');
        if (!issueReporterElement) {
            return;
        }
        // Dispose of the existing button
        if (this.publicGithubButton) {
            this.publicGithubButton.dispose();
        }
        // setup button + dropdown if applicable
        if (!this.acknowledged && this.needsUpdate) { // * old version and hasn't ack'd
            this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
            this.publicGithubButton.label = localize('acknowledge', "Confirm Version Acknowledgement");
            this.publicGithubButton.enabled = false;
        }
        else if (this.data.githubAccessToken && this.isPreviewEnabled()) { // * has access token, create by default, preview dropdown
            this.publicGithubButton = this._register(new ButtonWithDropdown(container, {
                contextMenuProvider: this.contextMenuService,
                actions: [this.previewAction],
                addPrimaryActionToDropdown: false,
                ...unthemedButtonStyles
            }));
            this._register(this.publicGithubButton.onDidClick(() => {
                this.createAction.run();
            }));
            this.publicGithubButton.label = localize('createOnGitHub', "Create on GitHub");
            this.publicGithubButton.enabled = true;
        }
        else if (this.data.githubAccessToken && !this.isPreviewEnabled()) { // * Access token but invalid preview state: simple Button (create only)
            this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
            this._register(this.publicGithubButton.onDidClick(() => {
                this.createAction.run();
            }));
            this.publicGithubButton.label = localize('createOnGitHub', "Create on GitHub");
            this.publicGithubButton.enabled = true;
        }
        else { // * No access token: simple Button (preview only)
            this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
            this._register(this.publicGithubButton.onDidClick(() => {
                this.previewAction.run();
            }));
            this.publicGithubButton.label = localize('previewOnGitHub', "Preview on GitHub");
            this.publicGithubButton.enabled = true;
        }
        // make sure that the repo link is after the button
        // eslint-disable-next-line no-restricted-syntax
        const repoLink = this.getElementById('show-repo-name');
        if (repoLink) {
            container.insertBefore(this.publicGithubButton.element, repoLink);
        }
    }
    updatePublicRepoLink(container) {
        // eslint-disable-next-line no-restricted-syntax
        let issueRepoName = this.getElementById('show-repo-name');
        if (!issueRepoName) {
            issueRepoName = document.createElement('a');
            issueRepoName.id = 'show-repo-name';
            issueRepoName.classList.add('hidden');
            container.appendChild(issueRepoName);
        }
        const selectedExtension = this.issueReporterModel.getData().selectedExtension;
        if (selectedExtension && selectedExtension.uri) {
            const urlString = URI.revive(selectedExtension.uri).toString();
            issueRepoName.href = urlString;
            issueRepoName.addEventListener('click', (e) => this.openLink(e));
            issueRepoName.addEventListener('auxclick', (e) => this.openLink(e));
            const gitHubInfo = this.parseGitHubUrl(urlString);
            issueRepoName.textContent = gitHubInfo ? gitHubInfo.owner + '/' + gitHubInfo.repositoryName : urlString;
            Object.assign(issueRepoName.style, {
                alignSelf: 'flex-end',
                display: 'block',
                fontSize: '13px',
                padding: '4px 0px',
                textDecoration: 'none',
                width: 'auto'
            });
            show(issueRepoName);
        }
        else if (issueRepoName) {
            // clear styles
            issueRepoName.removeAttribute('style');
            hide(issueRepoName);
        }
    }
    updateInternalGithubButton(container) {
        // eslint-disable-next-line no-restricted-syntax
        const issueReporterElement = this.getElementById('issue-reporter');
        if (!issueReporterElement) {
            return;
        }
        // Dispose of the existing button
        if (this.internalGithubButton) {
            this.internalGithubButton.dispose();
        }
        if (this.data.githubAccessToken && this.data.privateUri) {
            this.internalGithubButton = this._register(new Button(container, unthemedButtonStyles));
            this._register(this.internalGithubButton.onDidClick(() => {
                this.privateAction.run();
            }));
            this.internalGithubButton.element.id = 'internal-create-btn';
            this.internalGithubButton.element.classList.add('internal-create-subtle');
            this.internalGithubButton.label = localize('createInternally', "Create Internally");
            this.internalGithubButton.enabled = true;
            this.internalGithubButton.setTitle(this.data.privateUri.path.slice(1));
        }
    }
    updateInternalElementsVisibility() {
        // eslint-disable-next-line no-restricted-syntax
        const container = this.getElementById('internal-elements');
        if (!container) {
            // shouldn't happen
            return;
        }
        if (this.data.githubAccessToken && this.data.privateUri) {
            show(container);
            container.style.display = ''; //todo: necessary even with show?
            if (this.internalGithubButton) {
                this.internalGithubButton.enabled = this.publicGithubButton?.enabled ?? false;
            }
        }
        else {
            hide(container);
            container.style.display = 'none'; //todo: necessary even with hide?
        }
    }
    async updateIssueReporterUri(extension) {
        try {
            if (extension.uri) {
                const uri = URI.revive(extension.uri);
                extension.bugsUrl = uri.toString();
            }
        }
        catch (e) {
            this.renderBlocks();
        }
    }
    handleExtensionData(extensions) {
        const installedExtensions = extensions.filter(x => !x.isBuiltin);
        const { nonThemes, themes } = groupBy(installedExtensions, ext => {
            return ext.isTheme ? 'themes' : 'nonThemes';
        });
        const numberOfThemeExtesions = (themes && themes.length) ?? 0;
        this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
        this.updateExtensionTable(nonThemes ?? [], numberOfThemeExtesions);
        if (this.disableExtensions || installedExtensions.length === 0) {
            // eslint-disable-next-line no-restricted-syntax
            this.getElementById('disableExtensions').disabled = true;
        }
        this.updateExtensionSelector(installedExtensions);
    }
    updateExtensionSelector(extensions) {
        const extensionOptions = extensions.map(extension => {
            return {
                name: extension.displayName || extension.name || '',
                id: extension.id
            };
        });
        // Sort extensions by name
        extensionOptions.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            if (aName > bName) {
                return 1;
            }
            if (aName < bName) {
                return -1;
            }
            return 0;
        });
        const makeOption = (extension, selectedExtension) => {
            const selected = selectedExtension && extension.id === selectedExtension.id;
            return $('option', {
                'value': extension.id,
                'selected': selected || ''
            }, extension.name);
        };
        // eslint-disable-next-line no-restricted-syntax
        const extensionsSelector = this.getElementById('extension-selector');
        if (extensionsSelector) {
            const { selectedExtension } = this.issueReporterModel.getData();
            reset(extensionsSelector, this.makeOption('', localize('selectExtension', "Select extension"), true), ...extensionOptions.map(extension => makeOption(extension, selectedExtension)));
            if (!selectedExtension) {
                extensionsSelector.selectedIndex = 0;
            }
            this.addEventListener('extension-selector', 'change', async (e) => {
                this.clearExtensionData();
                const selectedExtensionId = e.target.value;
                this.selectedExtension = selectedExtensionId;
                const extensions = this.issueReporterModel.getData().allExtensions;
                const matches = extensions.filter(extension => extension.id === selectedExtensionId);
                if (matches.length) {
                    this.issueReporterModel.update({ selectedExtension: matches[0] });
                    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
                    if (selectedExtension) {
                        const iconElement = document.createElement('span');
                        iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
                        this.setLoading(iconElement);
                        const openReporterData = await this.sendReporterMenu(selectedExtension);
                        if (openReporterData) {
                            if (this.selectedExtension === selectedExtensionId) {
                                this.removeLoading(iconElement, true);
                                this.data = openReporterData;
                            }
                        }
                        else {
                            if (!this.loadingExtensionData) {
                                iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
                            }
                            this.removeLoading(iconElement);
                            // if not using command, should have no configuration data in fields we care about and check later.
                            this.clearExtensionData();
                            // case when previous extension was opened from normal openIssueReporter command
                            selectedExtension.data = undefined;
                            selectedExtension.uri = undefined;
                        }
                        if (this.selectedExtension === selectedExtensionId) {
                            // repopulates the fields with the new data given the selected extension.
                            this.updateExtensionStatus(matches[0]);
                            this.openReporter = false;
                        }
                    }
                    else {
                        this.issueReporterModel.update({ selectedExtension: undefined });
                        this.clearSearchResults();
                        this.clearExtensionData();
                        this.validateSelectedExtension();
                        this.updateExtensionStatus(matches[0]);
                    }
                }
                // Update internal action visibility after explicit selection
                this.updateInternalElementsVisibility();
            });
        }
        this.addEventListener('problem-source', 'change', (_) => {
            this.clearExtensionData();
            this.validateSelectedExtension();
        });
    }
    async sendReporterMenu(extension) {
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('sendReporterMenu timed out')), 10000));
            const data = await Promise.race([
                this.issueFormService.sendReporterMenu(extension.id),
                timeoutPromise
            ]);
            return data;
        }
        catch (e) {
            console.error(e);
            return undefined;
        }
    }
    updateAcknowledgementState() {
        // eslint-disable-next-line no-restricted-syntax
        const acknowledgementCheckbox = this.getElementById('includeAcknowledgement');
        if (acknowledgementCheckbox) {
            this.acknowledged = acknowledgementCheckbox.checked;
            this.updateButtonStates();
        }
    }
    setEventHandlers() {
        ['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions', 'includeExperiments', 'includeExtensionData'].forEach(elementId => {
            this.addEventListener(elementId, 'click', (event) => {
                event.stopPropagation();
                this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
            });
        });
        this.addEventListener('includeAcknowledgement', 'click', (event) => {
            event.stopPropagation();
            this.updateAcknowledgementState();
        });
        // eslint-disable-next-line no-restricted-syntax
        const showInfoElements = this.window.document.getElementsByClassName('showInfo');
        for (let i = 0; i < showInfoElements.length; i++) {
            const showInfo = showInfoElements.item(i);
            showInfo.addEventListener('click', (e) => {
                e.preventDefault();
                const label = e.target;
                if (label) {
                    const containingElement = label.parentElement && label.parentElement.parentElement;
                    const info = containingElement && containingElement.lastElementChild;
                    if (info && info.classList.contains('hidden')) {
                        show(info);
                        label.textContent = localize('hide', "hide");
                    }
                    else {
                        hide(info);
                        label.textContent = localize('show', "show");
                    }
                }
            });
        }
        this.addEventListener('issue-source', 'change', (e) => {
            const value = e.target.value;
            // eslint-disable-next-line no-restricted-syntax
            const problemSourceHelpText = this.getElementById('problem-source-help-text');
            if (value === '') {
                this.issueReporterModel.update({ fileOnExtension: undefined });
                show(problemSourceHelpText);
                this.clearSearchResults();
                this.render();
                return;
            }
            else {
                hide(problemSourceHelpText);
            }
            // eslint-disable-next-line no-restricted-syntax
            const descriptionTextArea = this.getElementById('issue-title');
            if (value === IssueSource.VSCode) {
                descriptionTextArea.placeholder = localize('vscodePlaceholder', "E.g Workbench is missing problems panel");
            }
            else if (value === IssueSource.Extension) {
                descriptionTextArea.placeholder = localize('extensionPlaceholder', "E.g. Missing alt text on extension readme image");
            }
            else if (value === IssueSource.Marketplace) {
                descriptionTextArea.placeholder = localize('marketplacePlaceholder', "E.g Cannot disable installed extension");
            }
            else {
                descriptionTextArea.placeholder = localize('undefinedPlaceholder', "Please enter a title");
            }
            let fileOnExtension, fileOnMarketplace, fileOnProduct = false;
            if (value === IssueSource.Extension) {
                fileOnExtension = true;
            }
            else if (value === IssueSource.Marketplace) {
                fileOnMarketplace = true;
            }
            else if (value === IssueSource.VSCode) {
                fileOnProduct = true;
            }
            this.issueReporterModel.update({ fileOnExtension, fileOnMarketplace, fileOnProduct });
            this.render();
            // eslint-disable-next-line no-restricted-syntax
            const title = this.getElementById('issue-title').value;
            this.searchIssues(title, fileOnExtension, fileOnMarketplace);
        });
        this.addEventListener('description', 'input', (e) => {
            const issueDescription = e.target.value;
            this.issueReporterModel.update({ issueDescription });
            // Only search for extension issues on title change
            if (this.issueReporterModel.fileOnExtension() === false) {
                // eslint-disable-next-line no-restricted-syntax
                const title = this.getElementById('issue-title').value;
                this.searchVSCodeIssues(title, issueDescription);
            }
        });
        this.addEventListener('issue-title', 'input', _ => {
            // eslint-disable-next-line no-restricted-syntax
            const titleElement = this.getElementById('issue-title');
            if (titleElement) {
                const title = titleElement.value;
                this.issueReporterModel.update({ issueTitle: title });
            }
        });
        this.addEventListener('issue-title', 'input', (e) => {
            const title = e.target.value;
            // eslint-disable-next-line no-restricted-syntax
            const lengthValidationMessage = this.getElementById('issue-title-length-validation-error');
            const issueUrl = this.getIssueUrl();
            if (title && this.getIssueUrlWithTitle(title, issueUrl).length > MAX_URL_LENGTH) {
                show(lengthValidationMessage);
            }
            else {
                hide(lengthValidationMessage);
            }
            // eslint-disable-next-line no-restricted-syntax
            const issueSource = this.getElementById('issue-source');
            if (!issueSource || issueSource.value === '') {
                return;
            }
            const { fileOnExtension, fileOnMarketplace } = this.issueReporterModel.getData();
            this.searchIssues(title, fileOnExtension, fileOnMarketplace);
        });
        // We handle clicks in the dropdown actions now
        this.addEventListener('disableExtensions', 'click', () => {
            this.issueFormService.reloadWithExtensionsDisabled();
        });
        this.addEventListener('extensionBugsLink', 'click', (e) => {
            const url = e.target.innerText;
            this.openLink(url);
        });
        this.addEventListener('disableExtensions', 'keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === ' ') {
                this.issueFormService.reloadWithExtensionsDisabled();
            }
        });
        this.window.document.onkeydown = async (e) => {
            const cmdOrCtrlKey = isMacintosh ? e.metaKey : e.ctrlKey;
            // Cmd/Ctrl+Enter previews issue and closes window
            if (cmdOrCtrlKey && e.key === 'Enter') {
                this.delayedSubmit.trigger(async () => {
                    if (await this.createIssue()) {
                        this.close();
                    }
                });
            }
            // Cmd/Ctrl + w closes issue window
            if (cmdOrCtrlKey && e.key === 'w') {
                e.stopPropagation();
                e.preventDefault();
                // eslint-disable-next-line no-restricted-syntax
                const issueTitle = this.getElementById('issue-title').value;
                const { issueDescription } = this.issueReporterModel.getData();
                if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
                    // fire and forget
                    this.issueFormService.showConfirmCloseDialog();
                }
                else {
                    this.close();
                }
            }
            // With latest electron upgrade, cmd+a is no longer propagating correctly for inputs in this window on mac
            // Manually perform the selection
            if (isMacintosh) {
                if (cmdOrCtrlKey && e.key === 'a' && e.target) {
                    if (isHTMLInputElement(e.target) || isHTMLTextAreaElement(e.target)) {
                        e.target.select();
                    }
                }
            }
        };
        // Handle the guidance link specifically to use openerService
        this.addEventListener('review-guidance-help-text', 'click', (e) => {
            const target = e.target;
            if (target.tagName === 'A' && target.getAttribute('target') === '_blank') {
                this.openLink(e);
            }
        });
    }
    updatePerformanceInfo(info) {
        this.issueReporterModel.update(info);
        this.receivedPerformanceInfo = true;
        const state = this.issueReporterModel.getData();
        this.updateProcessInfo(state);
        this.updateWorkspaceInfo(state);
        this.updateButtonStates();
    }
    isPreviewEnabled() {
        const issueType = this.issueReporterModel.getData().issueType;
        if (this.loadingExtensionData) {
            return false;
        }
        if (this.isWeb) {
            if (issueType === 2 /* IssueType.FeatureRequest */ || issueType === 1 /* IssueType.PerformanceIssue */ || issueType === 0 /* IssueType.Bug */) {
                return true;
            }
        }
        else {
            if (issueType === 0 /* IssueType.Bug */ && this.receivedSystemInfo) {
                return true;
            }
            if (issueType === 1 /* IssueType.PerformanceIssue */ && this.receivedSystemInfo && this.receivedPerformanceInfo) {
                return true;
            }
            if (issueType === 2 /* IssueType.FeatureRequest */) {
                return true;
            }
        }
        return false;
    }
    getExtensionRepositoryUrl() {
        const selectedExtension = this.issueReporterModel.getData().selectedExtension;
        return selectedExtension && selectedExtension.repositoryUrl;
    }
    getExtensionBugsUrl() {
        const selectedExtension = this.issueReporterModel.getData().selectedExtension;
        return selectedExtension && selectedExtension.bugsUrl;
    }
    searchVSCodeIssues(title, issueDescription) {
        if (title) {
            this.searchDuplicates(title, issueDescription);
        }
        else {
            this.clearSearchResults();
        }
    }
    searchIssues(title, fileOnExtension, fileOnMarketplace) {
        if (fileOnExtension) {
            return this.searchExtensionIssues(title);
        }
        if (fileOnMarketplace) {
            return this.searchMarketplaceIssues(title);
        }
        const description = this.issueReporterModel.getData().issueDescription;
        this.searchVSCodeIssues(title, description);
    }
    searchExtensionIssues(title) {
        const url = this.getExtensionGitHubUrl();
        if (title) {
            const matches = /^https?:\/\/github\.com\/(.*)/.exec(url);
            if (matches && matches.length) {
                const repo = matches[1];
                return this.searchGitHub(repo, title);
            }
            // If the extension has no repository, display empty search results
            if (this.issueReporterModel.getData().selectedExtension) {
                this.clearSearchResults();
                return this.displaySearchResults([]);
            }
        }
        this.clearSearchResults();
    }
    searchMarketplaceIssues(title) {
        if (title) {
            const gitHubInfo = this.parseGitHubUrl(this.product.reportMarketplaceIssueUrl);
            if (gitHubInfo) {
                return this.searchGitHub(`${gitHubInfo.owner}/${gitHubInfo.repositoryName}`, title);
            }
        }
    }
    async close() {
        await this.issueFormService.closeReporter();
    }
    clearSearchResults() {
        // eslint-disable-next-line no-restricted-syntax
        const similarIssues = this.getElementById('similar-issues');
        similarIssues.innerText = '';
        this.numberOfSearchResultsDisplayed = 0;
    }
    searchGitHub(repo, title) {
        const query = `is:issue+repo:${repo}+${title}`;
        // eslint-disable-next-line no-restricted-syntax
        const similarIssues = this.getElementById('similar-issues');
        fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
            response.json().then(result => {
                similarIssues.innerText = '';
                if (result && result.items) {
                    this.displaySearchResults(result.items);
                }
            }).catch(_ => {
                console.warn('Timeout or query limit exceeded');
            });
        }).catch(_ => {
            console.warn('Error fetching GitHub issues');
        });
    }
    searchDuplicates(title, body) {
        const url = 'https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates';
        const init = {
            method: 'POST',
            body: JSON.stringify({
                title,
                body
            }),
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        };
        fetch(url, init).then((response) => {
            response.json().then(result => {
                this.clearSearchResults();
                if (result && result.candidates) {
                    this.displaySearchResults(result.candidates);
                }
                else {
                    throw new Error('Unexpected response, no candidates property');
                }
            }).catch(_ => {
                // Ignore
            });
        }).catch(_ => {
            // Ignore
        });
    }
    displaySearchResults(results) {
        // eslint-disable-next-line no-restricted-syntax
        const similarIssues = this.getElementById('similar-issues');
        if (results.length) {
            const issues = $('div.issues-container');
            const issuesText = $('div.list-title');
            issuesText.textContent = localize('similarIssues', "Similar issues");
            this.numberOfSearchResultsDisplayed = results.length < 5 ? results.length : 5;
            for (let i = 0; i < this.numberOfSearchResultsDisplayed; i++) {
                const issue = results[i];
                const link = $('a.issue-link', { href: issue.html_url });
                link.textContent = issue.title;
                link.title = issue.title;
                link.addEventListener('click', (e) => this.openLink(e));
                link.addEventListener('auxclick', (e) => this.openLink(e));
                let issueState;
                let item;
                if (issue.state) {
                    issueState = $('span.issue-state');
                    const issueIcon = $('span.issue-icon');
                    issueIcon.appendChild(renderIcon(issue.state === 'open' ? Codicon.issueOpened : Codicon.issueClosed));
                    const issueStateLabel = $('span.issue-state.label');
                    issueStateLabel.textContent = issue.state === 'open' ? localize('open', "Open") : localize('closed', "Closed");
                    issueState.title = issue.state === 'open' ? localize('open', "Open") : localize('closed', "Closed");
                    issueState.appendChild(issueIcon);
                    issueState.appendChild(issueStateLabel);
                    item = $('div.issue', undefined, issueState, link);
                }
                else {
                    item = $('div.issue', undefined, link);
                }
                issues.appendChild(item);
            }
            similarIssues.appendChild(issuesText);
            similarIssues.appendChild(issues);
        }
    }
    setUpTypes() {
        const makeOption = (issueType, description) => $('option', { 'value': issueType.valueOf() }, escape(description));
        // eslint-disable-next-line no-restricted-syntax
        const typeSelect = this.getElementById('issue-type');
        const { issueType } = this.issueReporterModel.getData();
        reset(typeSelect, makeOption(0 /* IssueType.Bug */, localize('bugReporter', "Bug Report")), makeOption(2 /* IssueType.FeatureRequest */, localize('featureRequest', "Feature Request")), makeOption(1 /* IssueType.PerformanceIssue */, localize('performanceIssue', "Performance Issue (freeze, slow, crash)")));
        typeSelect.value = issueType.toString();
        this.setSourceOptions();
    }
    makeOption(value, description, disabled) {
        const option = document.createElement('option');
        option.disabled = disabled;
        option.value = value;
        option.textContent = description;
        return option;
    }
    setSourceOptions() {
        // eslint-disable-next-line no-restricted-syntax
        const sourceSelect = this.getElementById('issue-source');
        const { issueType, fileOnExtension, selectedExtension, fileOnMarketplace, fileOnProduct } = this.issueReporterModel.getData();
        let selected = sourceSelect.selectedIndex;
        if (selected === -1) {
            if (fileOnExtension !== undefined) {
                selected = fileOnExtension ? 2 : 1;
            }
            else if (selectedExtension?.isBuiltin) {
                selected = 1;
            }
            else if (fileOnMarketplace) {
                selected = 3;
            }
            else if (fileOnProduct) {
                selected = 1;
            }
        }
        sourceSelect.innerText = '';
        sourceSelect.append(this.makeOption('', localize('selectSource', "Select source"), true));
        sourceSelect.append(this.makeOption(IssueSource.VSCode, localize('vscode', "Visual Studio Code"), false));
        sourceSelect.append(this.makeOption(IssueSource.Extension, localize('extension', "A VS Code extension"), false));
        if (this.product.reportMarketplaceIssueUrl) {
            sourceSelect.append(this.makeOption(IssueSource.Marketplace, localize('marketplace', "Extensions Marketplace"), false));
        }
        if (issueType !== 2 /* IssueType.FeatureRequest */) {
            sourceSelect.append(this.makeOption(IssueSource.Unknown, localize('unknown', "Don't know"), false));
        }
        if (selected !== -1 && selected < sourceSelect.options.length) {
            sourceSelect.selectedIndex = selected;
        }
        else {
            sourceSelect.selectedIndex = 0;
            // eslint-disable-next-line no-restricted-syntax
            hide(this.getElementById('problem-source-help-text'));
        }
    }
    async renderBlocks() {
        // Depending on Issue Type, we render different blocks and text
        const { issueType, fileOnExtension, fileOnMarketplace, selectedExtension } = this.issueReporterModel.getData();
        // eslint-disable-next-line no-restricted-syntax
        const blockContainer = this.getElementById('block-container');
        // eslint-disable-next-line no-restricted-syntax
        const systemBlock = this.window.document.querySelector('.block-system');
        // eslint-disable-next-line no-restricted-syntax
        const processBlock = this.window.document.querySelector('.block-process');
        // eslint-disable-next-line no-restricted-syntax
        const workspaceBlock = this.window.document.querySelector('.block-workspace');
        // eslint-disable-next-line no-restricted-syntax
        const extensionsBlock = this.window.document.querySelector('.block-extensions');
        // eslint-disable-next-line no-restricted-syntax
        const experimentsBlock = this.window.document.querySelector('.block-experiments');
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataBlock = this.window.document.querySelector('.block-extension-data');
        // eslint-disable-next-line no-restricted-syntax
        const problemSource = this.getElementById('problem-source');
        // eslint-disable-next-line no-restricted-syntax
        const descriptionTitle = this.getElementById('issue-description-label');
        // eslint-disable-next-line no-restricted-syntax
        const descriptionSubtitle = this.getElementById('issue-description-subtitle');
        // eslint-disable-next-line no-restricted-syntax
        const extensionSelector = this.getElementById('extension-selection');
        // eslint-disable-next-line no-restricted-syntax
        const downloadExtensionDataLink = this.getElementById('extension-data-download');
        // eslint-disable-next-line no-restricted-syntax
        const titleTextArea = this.getElementById('issue-title-container');
        // eslint-disable-next-line no-restricted-syntax
        const descriptionTextArea = this.getElementById('description');
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataTextArea = this.getElementById('extension-data');
        // Hide all by default
        hide(blockContainer);
        hide(systemBlock);
        hide(processBlock);
        hide(workspaceBlock);
        hide(extensionsBlock);
        hide(experimentsBlock);
        hide(extensionSelector);
        hide(extensionDataTextArea);
        hide(extensionDataBlock);
        hide(downloadExtensionDataLink);
        show(problemSource);
        show(titleTextArea);
        show(descriptionTextArea);
        if (fileOnExtension) {
            show(extensionSelector);
        }
        const extensionData = this.issueReporterModel.getData().extensionData;
        if (extensionData && extensionData.length > MAX_EXTENSION_DATA_LENGTH) {
            show(downloadExtensionDataLink);
            const date = new Date();
            const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
            const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
            const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
            const handleLinkClick = async () => {
                const downloadPath = await this.fileDialogService.showSaveDialog({
                    title: localize('saveExtensionData', "Save Extension Data"),
                    availableFileSystems: [Schemas.file],
                    defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName),
                });
                if (downloadPath) {
                    await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
                }
            };
            downloadExtensionDataLink.addEventListener('click', handleLinkClick);
            this._register({
                dispose: () => downloadExtensionDataLink.removeEventListener('click', handleLinkClick)
            });
        }
        if (selectedExtension && this.nonGitHubIssueUrl) {
            hide(titleTextArea);
            hide(descriptionTextArea);
            reset(descriptionTitle, localize('handlesIssuesElsewhere', "This extension handles issues outside of VS Code"));
            reset(descriptionSubtitle, localize('elsewhereDescription', "The '{0}' extension prefers to use an external issue reporter. To be taken to that issue reporting experience, click the button below.", selectedExtension.displayName));
            this.publicGithubButton.label = localize('openIssueReporter', "Open External Issue Reporter");
            return;
        }
        if (fileOnExtension && selectedExtension?.data) {
            const data = selectedExtension?.data;
            extensionDataTextArea.innerText = data.toString();
            extensionDataTextArea.readOnly = true;
            show(extensionDataBlock);
        }
        // only if we know comes from the open reporter command
        if (fileOnExtension && this.openReporter) {
            extensionDataTextArea.readOnly = true;
            setTimeout(() => {
                // delay to make sure from command or not
                if (this.openReporter) {
                    show(extensionDataBlock);
                }
            }, 100);
            show(extensionDataBlock);
        }
        if (issueType === 0 /* IssueType.Bug */) {
            if (!fileOnMarketplace) {
                show(blockContainer);
                show(systemBlock);
                show(experimentsBlock);
                if (!fileOnExtension) {
                    show(extensionsBlock);
                }
            }
            reset(descriptionTitle, localize('stepsToReproduce', "Steps to Reproduce") + ' ', $('span.required-input', undefined, '*'));
            reset(descriptionSubtitle, localize('bugDescription', "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
        }
        else if (issueType === 1 /* IssueType.PerformanceIssue */) {
            if (!fileOnMarketplace) {
                show(blockContainer);
                show(systemBlock);
                show(processBlock);
                show(workspaceBlock);
                show(experimentsBlock);
            }
            if (fileOnExtension) {
                show(extensionSelector);
            }
            else if (!fileOnMarketplace) {
                show(extensionsBlock);
            }
            reset(descriptionTitle, localize('stepsToReproduce', "Steps to Reproduce") + ' ', $('span.required-input', undefined, '*'));
            reset(descriptionSubtitle, localize('performanceIssueDesciption', "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
        }
        else if (issueType === 2 /* IssueType.FeatureRequest */) {
            reset(descriptionTitle, localize('description', "Description") + ' ', $('span.required-input', undefined, '*'));
            reset(descriptionSubtitle, localize('featureRequestDescription', "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
        }
    }
    validateInput(inputId) {
        // eslint-disable-next-line no-restricted-syntax
        const inputElement = this.getElementById(inputId);
        // eslint-disable-next-line no-restricted-syntax
        const inputValidationMessage = this.getElementById(`${inputId}-empty-error`);
        // eslint-disable-next-line no-restricted-syntax
        const descriptionShortMessage = this.getElementById(`description-short-error`);
        if (inputId === 'description' && this.nonGitHubIssueUrl && this.data.extensionId) {
            return true;
        }
        else if (!inputElement.value) {
            inputElement.classList.add('invalid-input');
            inputValidationMessage?.classList.remove('hidden');
            descriptionShortMessage?.classList.add('hidden');
            return false;
        }
        else if (inputId === 'description' && inputElement.value.length < 10) {
            inputElement.classList.add('invalid-input');
            descriptionShortMessage?.classList.remove('hidden');
            inputValidationMessage?.classList.add('hidden');
            return false;
        }
        else {
            inputElement.classList.remove('invalid-input');
            inputValidationMessage?.classList.add('hidden');
            if (inputId === 'description') {
                descriptionShortMessage?.classList.add('hidden');
            }
            return true;
        }
    }
    validateInputs() {
        let isValid = true;
        ['issue-title', 'description', 'issue-source'].forEach(elementId => {
            isValid = this.validateInput(elementId) && isValid;
        });
        if (this.issueReporterModel.fileOnExtension()) {
            isValid = this.validateInput('extension-selector') && isValid;
        }
        return isValid;
    }
    async submitToGitHub(issueTitle, issueBody, gitHubDetails) {
        const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
        const init = {
            method: 'POST',
            body: JSON.stringify({
                title: issueTitle,
                body: issueBody
            }),
            headers: new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.data.githubAccessToken}`,
                'User-Agent': 'request'
            })
        };
        const response = await fetch(url, init);
        if (!response.ok) {
            console.error('Invalid GitHub URL provided.');
            return false;
        }
        const result = await response.json();
        await this.openLink(result.html_url);
        this.close();
        return true;
    }
    async createIssue(shouldCreate, privateUri) {
        const selectedExtension = this.issueReporterModel.getData().selectedExtension;
        // Short circuit if the extension provides a custom issue handler
        if (this.nonGitHubIssueUrl) {
            const url = this.getExtensionBugsUrl();
            if (url) {
                this.hasBeenSubmitted = true;
                return true;
            }
        }
        if (!this.validateInputs()) {
            // If inputs are invalid, set focus to the first one and add listeners on them
            // to detect further changes
            // eslint-disable-next-line no-restricted-syntax
            const invalidInput = this.window.document.getElementsByClassName('invalid-input');
            if (invalidInput.length) {
                invalidInput[0].focus();
            }
            this.addEventListener('issue-title', 'input', _ => {
                this.validateInput('issue-title');
            });
            this.addEventListener('description', 'input', _ => {
                this.validateInput('description');
            });
            this.addEventListener('issue-source', 'change', _ => {
                this.validateInput('issue-source');
            });
            if (this.issueReporterModel.fileOnExtension()) {
                this.addEventListener('extension-selector', 'change', _ => {
                    this.validateInput('extension-selector');
                });
            }
            return false;
        }
        this.hasBeenSubmitted = true;
        // eslint-disable-next-line no-restricted-syntax
        const issueTitle = this.getElementById('issue-title').value;
        const issueBody = this.issueReporterModel.serialize();
        let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
        if (!issueUrl) {
            console.error(`No ${privateUri ? 'private ' : ''}issue url found`);
            return false;
        }
        if (selectedExtension?.uri) {
            const uri = URI.revive(selectedExtension.uri);
            issueUrl = uri.toString();
        }
        const gitHubDetails = this.parseGitHubUrl(issueUrl);
        if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
            return this.submitToGitHub(issueTitle, issueBody, gitHubDetails);
        }
        // eslint-disable-next-line no-restricted-syntax
        const baseUrl = this.getIssueUrlWithTitle(this.getElementById('issue-title').value, issueUrl);
        let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;
        url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
        if (url.length > MAX_URL_LENGTH) {
            try {
                url = await this.writeToClipboard(baseUrl, issueBody);
                url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
            }
            catch (_) {
                console.error('Writing to clipboard failed');
                return false;
            }
        }
        await this.openLink(url);
        return true;
    }
    async writeToClipboard(baseUrl, issueBody) {
        const shouldWrite = await this.issueFormService.showClipboardDialog();
        if (!shouldWrite) {
            throw new CancellationError();
        }
        return baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
    }
    addTemplateToUrl(baseUrl, owner, repositoryName) {
        const isVscode = this.issueReporterModel.getData().fileOnProduct;
        const isMicrosoft = owner?.toLowerCase() === 'microsoft';
        const needsTemplate = isVscode || (isMicrosoft && (repositoryName === 'vscode' || repositoryName === 'vscode-python'));
        if (needsTemplate) {
            try {
                const url = new URL(baseUrl);
                url.searchParams.set('template', 'bug_report.md');
                return url.toString();
            }
            catch {
                // fallback if baseUrl is not a valid URL
                return baseUrl + '&template=bug_report.md';
            }
        }
        return baseUrl;
    }
    getIssueUrl() {
        return this.issueReporterModel.fileOnExtension()
            ? this.getExtensionGitHubUrl()
            : this.issueReporterModel.getData().fileOnMarketplace
                ? this.product.reportMarketplaceIssueUrl
                : this.product.reportIssueUrl;
    }
    // for when command 'workbench.action.openIssueReporter' passes along a
    // `privateUri` UriComponents value
    getPrivateIssueUrl() {
        return URI.revive(this.data.privateUri)?.toString();
    }
    parseGitHubUrl(url) {
        // Assumes a GitHub url to a particular repo, https://github.com/repositoryName/owner.
        // Repository name and owner cannot contain '/'
        const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(url);
        if (match && match.length) {
            return {
                owner: match[1],
                repositoryName: match[2]
            };
        }
        else {
            console.error('No GitHub issues match');
        }
        return undefined;
    }
    getExtensionGitHubUrl() {
        let repositoryUrl = '';
        const bugsUrl = this.getExtensionBugsUrl();
        const extensionUrl = this.getExtensionRepositoryUrl();
        // If given, try to match the extension's bug url
        if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?$/)) {
            // matches exactly: https://github.com/owner/repo/issues
            repositoryUrl = normalizeGitHubUrl(bugsUrl);
        }
        else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)$/)) {
            // matches exactly: https://github.com/owner/repo
            repositoryUrl = normalizeGitHubUrl(extensionUrl);
        }
        else {
            this.nonGitHubIssueUrl = true;
            repositoryUrl = bugsUrl || extensionUrl || '';
        }
        return repositoryUrl;
    }
    getIssueUrlWithTitle(issueTitle, repositoryUrl) {
        if (this.issueReporterModel.fileOnExtension()) {
            repositoryUrl = repositoryUrl + '/issues/new';
        }
        const queryStringPrefix = repositoryUrl.indexOf('?') === -1 ? '?' : '&';
        return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
    }
    clearExtensionData() {
        this.nonGitHubIssueUrl = false;
        this.issueReporterModel.update({ extensionData: undefined });
        this.data.issueBody = this.data.issueBody || '';
        this.data.data = undefined;
        this.data.uri = undefined;
        this.data.privateUri = undefined;
    }
    async updateExtensionStatus(extension) {
        this.issueReporterModel.update({ selectedExtension: extension });
        // uses this.configuuration.data to ensure that data is coming from `openReporter` command.
        const template = this.data.issueBody;
        if (template) {
            // eslint-disable-next-line no-restricted-syntax
            const descriptionTextArea = this.getElementById('description');
            const descriptionText = descriptionTextArea.value;
            if (descriptionText === '' || !descriptionText.includes(template.toString())) {
                const fullTextArea = descriptionText + (descriptionText === '' ? '' : '\n') + template.toString();
                descriptionTextArea.value = fullTextArea;
                this.issueReporterModel.update({ issueDescription: fullTextArea });
            }
        }
        const data = this.data.data;
        if (data) {
            this.issueReporterModel.update({ extensionData: data });
            extension.data = data;
            // eslint-disable-next-line no-restricted-syntax
            const extensionDataBlock = this.window.document.querySelector('.block-extension-data');
            show(extensionDataBlock);
            this.renderBlocks();
        }
        const uri = this.data.uri;
        if (uri) {
            extension.uri = uri;
            this.updateIssueReporterUri(extension);
        }
        this.validateSelectedExtension();
        // eslint-disable-next-line no-restricted-syntax
        const title = this.getElementById('issue-title').value;
        this.searchExtensionIssues(title);
        this.updateButtonStates();
        this.renderBlocks();
    }
    validateSelectedExtension() {
        // eslint-disable-next-line no-restricted-syntax
        const extensionValidationMessage = this.getElementById('extension-selection-validation-error');
        // eslint-disable-next-line no-restricted-syntax
        const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url');
        hide(extensionValidationMessage);
        hide(extensionValidationNoUrlsMessage);
        const extension = this.issueReporterModel.getData().selectedExtension;
        if (!extension) {
            this.publicGithubButton.enabled = true;
            return;
        }
        if (this.loadingExtensionData) {
            return;
        }
        const hasValidGitHubUrl = this.getExtensionGitHubUrl();
        if (hasValidGitHubUrl) {
            this.publicGithubButton.enabled = true;
        }
        else {
            this.setExtensionValidationMessage();
            this.publicGithubButton.enabled = false;
        }
    }
    setLoading(element) {
        // Show loading
        this.openReporter = true;
        this.loadingExtensionData = true;
        this.updateButtonStates();
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataCaption = this.getElementById('extension-id');
        hide(extensionDataCaption);
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
        extensionDataCaption2.forEach(extensionDataCaption2 => hide(extensionDataCaption2));
        // eslint-disable-next-line no-restricted-syntax
        const showLoading = this.getElementById('ext-loading');
        show(showLoading);
        while (showLoading.firstChild) {
            showLoading.firstChild.remove();
        }
        showLoading.append(element);
        this.renderBlocks();
    }
    removeLoading(element, fromReporter = false) {
        this.openReporter = fromReporter;
        this.loadingExtensionData = false;
        this.updateButtonStates();
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataCaption = this.getElementById('extension-id');
        show(extensionDataCaption);
        // eslint-disable-next-line no-restricted-syntax
        const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
        extensionDataCaption2.forEach(extensionDataCaption2 => show(extensionDataCaption2));
        // eslint-disable-next-line no-restricted-syntax
        const hideLoading = this.getElementById('ext-loading');
        hide(hideLoading);
        if (hideLoading.firstChild) {
            element.remove();
        }
        this.renderBlocks();
    }
    setExtensionValidationMessage() {
        // eslint-disable-next-line no-restricted-syntax
        const extensionValidationMessage = this.getElementById('extension-selection-validation-error');
        // eslint-disable-next-line no-restricted-syntax
        const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url');
        const bugsUrl = this.getExtensionBugsUrl();
        if (bugsUrl) {
            show(extensionValidationMessage);
            // eslint-disable-next-line no-restricted-syntax
            const link = this.getElementById('extensionBugsLink');
            link.textContent = bugsUrl;
            return;
        }
        const extensionUrl = this.getExtensionRepositoryUrl();
        if (extensionUrl) {
            show(extensionValidationMessage);
            // eslint-disable-next-line no-restricted-syntax
            const link = this.getElementById('extensionBugsLink');
            link.textContent = extensionUrl;
            return;
        }
        show(extensionValidationNoUrlsMessage);
    }
    updateProcessInfo(state) {
        // eslint-disable-next-line no-restricted-syntax
        const target = this.window.document.querySelector('.block-process .block-info');
        if (target) {
            reset(target, $('code', undefined, state.processInfo ?? ''));
        }
    }
    updateWorkspaceInfo(state) {
        // eslint-disable-next-line no-restricted-syntax
        this.window.document.querySelector('.block-workspace .block-info code').textContent = '\n' + state.workspaceInfo;
    }
    updateExtensionTable(extensions, numThemeExtensions) {
        // eslint-disable-next-line no-restricted-syntax
        const target = this.window.document.querySelector('.block-extensions .block-info');
        if (target) {
            if (this.disableExtensions) {
                reset(target, localize('disabledExtensions', "Extensions are disabled"));
                return;
            }
            const themeExclusionStr = numThemeExtensions ? `\n(${numThemeExtensions} theme extensions excluded)` : '';
            extensions = extensions || [];
            if (!extensions.length) {
                target.innerText = 'Extensions: none' + themeExclusionStr;
                return;
            }
            reset(target, this.getExtensionTableHtml(extensions), document.createTextNode(themeExclusionStr));
        }
    }
    getExtensionTableHtml(extensions) {
        return $('table', undefined, $('tr', undefined, $('th', undefined, 'Extension'), $('th', undefined, 'Author (truncated)'), $('th', undefined, 'Version')), ...extensions.map(extension => $('tr', undefined, $('td', undefined, extension.name), $('td', undefined, extension.publisher?.substr(0, 3) ?? 'N/A'), $('td', undefined, extension.version))));
    }
    async openLink(eventOrUrl) {
        if (typeof eventOrUrl === 'string') {
            // Direct URL call
            await this.openerService.open(eventOrUrl, { openExternal: true });
        }
        else {
            // MouseEvent call
            const event = eventOrUrl;
            event.preventDefault();
            event.stopPropagation();
            // Exclude right click
            if (event.which < 3) {
                await this.openerService.open(event.target.href, { openExternal: true });
            }
        }
    }
    getElementById(elementId) {
        // eslint-disable-next-line no-restricted-syntax
        const element = this.window.document.getElementById(elementId);
        if (element) {
            return element;
        }
        else {
            return undefined;
        }
    }
    addEventListener(elementId, eventType, handler) {
        // eslint-disable-next-line no-restricted-syntax
        const element = this.getElementById(elementId);
        element?.addEventListener(eventType, handler);
    }
};
__decorate([
    debounce(300)
], BaseIssueReporterService.prototype, "searchGitHub", null);
__decorate([
    debounce(300)
], BaseIssueReporterService.prototype, "searchDuplicates", null);
BaseIssueReporterService = __decorate([
    __param(6, IIssueFormService),
    __param(7, IThemeService),
    __param(8, IFileService),
    __param(9, IFileDialogService),
    __param(10, IContextMenuService),
    __param(11, IAuthenticationService),
    __param(12, IOpenerService)
], BaseIssueReporterService);
export { BaseIssueReporterService };
// helper functions
export function hide(el) {
    el?.classList.add('hidden');
}
export function show(el) {
    el?.classList.remove('hidden');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZUlzc3VlUmVwb3J0ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaXNzdWUvYnJvd3Nlci9iYXNlSXNzdWVSZXBvcnRlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDaEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFB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