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
import { IProductConfiguration } from '../../../../base/common/product.js';
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
import { IIssueFormService, IssueReporterData, IssueReporterExtensionData, IssueType } from '../common/issue.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';
import { IssueReporterModel, IssueReporterData as IssueReporterModelData } from './issueReporterModel.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';

const MAX_URL_LENGTH = 7500;

// Github API and issues on web has a limit of 65536. If extension data is too large, we will allow users to downlaod and attach it as a file.
// We round down to be safe.
// ref https://github.com/github/issues/issues/12858

const MAX_EXTENSION_DATA_LENGTH = 60000;

interface SearchResult {
	html_url: string;
	title: string;
	state?: string;
}

enum IssueSource {
	VSCode = 'vscode',
	Extension = 'extension',
	Marketplace = 'marketplace',
	Unknown = 'unknown'
}


export class BaseIssueReporterService extends Disposable {
	public issueReporterModel: IssueReporterModel;
	public receivedSystemInfo = false;
	public numberOfSearchResultsDisplayed = 0;
	public receivedPerformanceInfo = false;
	public shouldQueueSearch = false;
	public hasBeenSubmitted = false;
	public openReporter = false;
	public loadingExtensionData = false;
	public selectedExtension = '';
	public delayedSubmit = new Delayer<void>(300);
	public publicGithubButton!: Button | ButtonWithDropdown;
	public internalGithubButton!: Button | ButtonWithDropdown;
	public nonGitHubIssueUrl = false;
	public needsUpdate = false;
	public acknowledged = false;
	private createAction: Action;
	private previewAction: Action;
	private privateAction: Action;

	constructor(
		public disableExtensions: boolean,
		public data: IssueReporterData,
		public os: {
			type: string;
			arch: string;
			release: string;
		},
		public product: IProductConfiguration,
		public readonly window: Window,
		public readonly isWeb: boolean,
		@IIssueFormService public readonly issueFormService: IIssueFormService,
		@IThemeService public readonly themeService: IThemeService,
		@IFileService public readonly fileService: IFileService,
		@IFileDialogService public readonly fileDialogService: IFileDialogService,
		@IContextMenuService public readonly contextMenuService: IContextMenuService,
		@IAuthenticationService public readonly authenticationService: IAuthenticationService,
		@IOpenerService public readonly openerService: IOpenerService
	) {
		super();
		const targetExtension = data.extensionId ? data.enabledExtensions.find(extension => extension.id.toLocaleLowerCase() === data.extensionId?.toLocaleLowerCase()) : undefined;
		this.issueReporterModel = new IssueReporterModel({
			...data,
			issueType: data.issueType || IssueType.Bug,
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
			} catch (e) {
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
			const issueTitleElement = this.getElementById<HTMLInputElement>('issue-title');
			if (issueTitleElement) {
				issueTitleElement.value = issueTitle;
			}
		}

		const issueBody = data.issueBody;
		if (issueBody) {
			// eslint-disable-next-line no-restricted-syntax
			const description = this.getElementById<HTMLTextAreaElement>('description');
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

	render(): void {
		this.renderBlocks();
	}

	setInitialFocus() {
		const { fileOnExtension } = this.issueReporterModel.getData();
		if (fileOnExtension) {
			// eslint-disable-next-line no-restricted-syntax
			const issueTitle = this.window.document.getElementById('issue-title');
			issueTitle?.focus();
		} else {
			// eslint-disable-next-line no-restricted-syntax
			const issueType = this.window.document.getElementById('issue-type');
			issueType?.focus();
		}
	}

	public updateButtonStates() {
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

	private updateInternalFilingNote(container: HTMLElement) {
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

	private updatePublicGithubButton(container: HTMLElement): void {
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
		} else if (this.data.githubAccessToken && this.isPreviewEnabled()) { // * has access token, create by default, preview dropdown
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
		} else if (this.data.githubAccessToken && !this.isPreviewEnabled()) { // * Access token but invalid preview state: simple Button (create only)
			this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
			this._register(this.publicGithubButton.onDidClick(() => {
				this.createAction.run();
			}));
			this.publicGithubButton.label = localize('createOnGitHub', "Create on GitHub");
			this.publicGithubButton.enabled = true;
		} else { // * No access token: simple Button (preview only)
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

	private updatePublicRepoLink(container: HTMLElement): void {
		// eslint-disable-next-line no-restricted-syntax
		let issueRepoName = this.getElementById('show-repo-name') as HTMLAnchorElement;
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
			issueRepoName.addEventListener('auxclick', (e) => this.openLink(<MouseEvent>e));
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
		} else if (issueRepoName) {
			// clear styles
			issueRepoName.removeAttribute('style');
			hide(issueRepoName);
		}
	}

	private updateInternalGithubButton(container: HTMLElement): void {
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
			this.internalGithubButton.setTitle(this.data.privateUri.path!.slice(1));
		}
	}

	private updateInternalElementsVisibility(): void {
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
		} else {
			hide(container);
			container.style.display = 'none'; //todo: necessary even with hide?
		}
	}

	private async updateIssueReporterUri(extension: IssueReporterExtensionData): Promise<void> {
		try {
			if (extension.uri) {
				const uri = URI.revive(extension.uri);
				extension.bugsUrl = uri.toString();
			}
		} catch (e) {
			this.renderBlocks();
		}
	}

	private handleExtensionData(extensions: IssueReporterExtensionData[]) {
		const installedExtensions = extensions.filter(x => !x.isBuiltin);
		const { nonThemes, themes } = groupBy(installedExtensions, ext => {
			return ext.isTheme ? 'themes' : 'nonThemes';
		});

		const numberOfThemeExtesions = (themes && themes.length) ?? 0;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
		this.updateExtensionTable(nonThemes ?? [], numberOfThemeExtesions);
		if (this.disableExtensions || installedExtensions.length === 0) {
			// eslint-disable-next-line no-restricted-syntax
			(<HTMLButtonElement>this.getElementById('disableExtensions')).disabled = true;
		}

		this.updateExtensionSelector(installedExtensions);
	}

	private updateExtensionSelector(extensions: IssueReporterExtensionData[]): void {
		interface IOption {
			name: string;
			id: string;
		}

		const extensionOptions: IOption[] = extensions.map(extension => {
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

		const makeOption = (extension: IOption, selectedExtension?: IssueReporterExtensionData): HTMLOptionElement => {
			const selected = selectedExtension && extension.id === selectedExtension.id;
			return $<HTMLOptionElement>('option', {
				'value': extension.id,
				'selected': selected || ''
			}, extension.name);
		};

		// eslint-disable-next-line no-restricted-syntax
		const extensionsSelector = this.getElementById<HTMLSelectElement>('extension-selector');
		if (extensionsSelector) {
			const { selectedExtension } = this.issueReporterModel.getData();
			reset(extensionsSelector, this.makeOption('', localize('selectExtension', "Select extension"), true), ...extensionOptions.map(extension => makeOption(extension, selectedExtension)));

			if (!selectedExtension) {
				extensionsSelector.selectedIndex = 0;
			}

			this.addEventListener('extension-selector', 'change', async (e: Event) => {
				this.clearExtensionData();
				const selectedExtensionId = (<HTMLInputElement>e.target).value;
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
					} else {
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

	private async sendReporterMenu(extension: IssueReporterExtensionData): Promise<IssueReporterData | undefined> {
		try {
			const timeoutPromise = new Promise<undefined>((_, reject) =>
				setTimeout(() => reject(new Error('sendReporterMenu timed out')), 10000)
			);
			const data = await Promise.race([
				this.issueFormService.sendReporterMenu(extension.id),
				timeoutPromise
			]);
			return data;
		} catch (e) {
			console.error(e);
			return undefined;
		}
	}

	private updateAcknowledgementState() {
		// eslint-disable-next-line no-restricted-syntax
		const acknowledgementCheckbox = this.getElementById<HTMLInputElement>('includeAcknowledgement');
		if (acknowledgementCheckbox) {
			this.acknowledged = acknowledgementCheckbox.checked;
			this.updateButtonStates();
		}
	}

	public setEventHandlers(): void {
		(['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions', 'includeExperiments', 'includeExtensionData'] as const).forEach(elementId => {
			this.addEventListener(elementId, 'click', (event: Event) => {
				event.stopPropagation();
				this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
			});
		});

		this.addEventListener('includeAcknowledgement', 'click', (event: Event) => {
			event.stopPropagation();
			this.updateAcknowledgementState();
		});

		// eslint-disable-next-line no-restricted-syntax
		const showInfoElements = this.window.document.getElementsByClassName('showInfo');
		for (let i = 0; i < showInfoElements.length; i++) {
			const showInfo = showInfoElements.item(i)!;
			(showInfo as HTMLAnchorElement).addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				const label = (<HTMLDivElement>e.target);
				if (label) {
					const containingElement = label.parentElement && label.parentElement.parentElement;
					const info = containingElement && containingElement.lastElementChild;
					if (info && info.classList.contains('hidden')) {
						show(info);
						label.textContent = localize('hide', "hide");
					} else {
						hide(info);
						label.textContent = localize('show', "show");
					}
				}
			});
		}

		this.addEventListener('issue-source', 'change', (e: Event) => {
			const value = (<HTMLInputElement>e.target).value;
			// eslint-disable-next-line no-restricted-syntax
			const problemSourceHelpText = this.getElementById('problem-source-help-text')!;
			if (value === '') {
				this.issueReporterModel.update({ fileOnExtension: undefined });
				show(problemSourceHelpText);
				this.clearSearchResults();
				this.render();
				return;
			} else {
				hide(problemSourceHelpText);
			}

			// eslint-disable-next-line no-restricted-syntax
			const descriptionTextArea = <HTMLInputElement>this.getElementById('issue-title');
			if (value === IssueSource.VSCode) {
				descriptionTextArea.placeholder = localize('vscodePlaceholder', "E.g Workbench is missing problems panel");
			} else if (value === IssueSource.Extension) {
				descriptionTextArea.placeholder = localize('extensionPlaceholder', "E.g. Missing alt text on extension readme image");
			} else if (value === IssueSource.Marketplace) {
				descriptionTextArea.placeholder = localize('marketplacePlaceholder', "E.g Cannot disable installed extension");
			} else {
				descriptionTextArea.placeholder = localize('undefinedPlaceholder', "Please enter a title");
			}

			let fileOnExtension, fileOnMarketplace, fileOnProduct = false;
			if (value === IssueSource.Extension) {
				fileOnExtension = true;
			} else if (value === IssueSource.Marketplace) {
				fileOnMarketplace = true;
			} else if (value === IssueSource.VSCode) {
				fileOnProduct = true;
			}

			this.issueReporterModel.update({ fileOnExtension, fileOnMarketplace, fileOnProduct });
			this.render();

			// eslint-disable-next-line no-restricted-syntax
			const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
			this.searchIssues(title, fileOnExtension, fileOnMarketplace);
		});

		this.addEventListener('description', 'input', (e: Event) => {
			const issueDescription = (<HTMLInputElement>e.target).value;
			this.issueReporterModel.update({ issueDescription });

			// Only search for extension issues on title change
			if (this.issueReporterModel.fileOnExtension() === false) {
				// eslint-disable-next-line no-restricted-syntax
				const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
				this.searchVSCodeIssues(title, issueDescription);
			}
		});

		this.addEventListener('issue-title', 'input', _ => {
			// eslint-disable-next-line no-restricted-syntax
			const titleElement = this.getElementById('issue-title') as HTMLInputElement;
			if (titleElement) {
				const title = titleElement.value;
				this.issueReporterModel.update({ issueTitle: title });
			}
		});

		this.addEventListener('issue-title', 'input', (e: Event) => {
			const title = (<HTMLInputElement>e.target).value;
			// eslint-disable-next-line no-restricted-syntax
			const lengthValidationMessage = this.getElementById('issue-title-length-validation-error');
			const issueUrl = this.getIssueUrl();
			if (title && this.getIssueUrlWithTitle(title, issueUrl).length > MAX_URL_LENGTH) {
				show(lengthValidationMessage);
			} else {
				hide(lengthValidationMessage);
			}
			// eslint-disable-next-line no-restricted-syntax
			const issueSource = this.getElementById<HTMLSelectElement>('issue-source');
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

		this.addEventListener('extensionBugsLink', 'click', (e: Event) => {
			const url = (<HTMLElement>e.target).innerText;
			this.openLink(url);
		});

		this.addEventListener('disableExtensions', 'keydown', (e: Event) => {
			e.stopPropagation();
			if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
				this.issueFormService.reloadWithExtensionsDisabled();
			}
		});

		this.window.document.onkeydown = async (e: KeyboardEvent) => {
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
				const issueTitle = (<HTMLInputElement>this.getElementById('issue-title'))!.value;
				const { issueDescription } = this.issueReporterModel.getData();
				if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
					// fire and forget
					this.issueFormService.showConfirmCloseDialog();
				} else {
					this.close();
				}
			}

			// With latest electron upgrade, cmd+a is no longer propagating correctly for inputs in this window on mac
			// Manually perform the selection
			if (isMacintosh) {
				if (cmdOrCtrlKey && e.key === 'a' && e.target) {
					if (isHTMLInputElement(e.target) || isHTMLTextAreaElement(e.target)) {
						(<HTMLInputElement>e.target).select();
					}
				}
			}
		};

		// Handle the guidance link specifically to use openerService
		this.addEventListener('review-guidance-help-text', 'click', (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' && target.getAttribute('target') === '_blank') {
				this.openLink(<MouseEvent>e);
			}
		});
	}

	public updatePerformanceInfo(info: Partial<IssueReporterData>) {
		this.issueReporterModel.update(info);
		this.receivedPerformanceInfo = true;

		const state = this.issueReporterModel.getData();
		this.updateProcessInfo(state);
		this.updateWorkspaceInfo(state);
		this.updateButtonStates();
	}

	private isPreviewEnabled() {
		const issueType = this.issueReporterModel.getData().issueType;

		if (this.loadingExtensionData) {
			return false;
		}

		if (this.isWeb) {
			if (issueType === IssueType.FeatureRequest || issueType === IssueType.PerformanceIssue || issueType === IssueType.Bug) {
				return true;
			}
		} else {
			if (issueType === IssueType.Bug && this.receivedSystemInfo) {
				return true;
			}

			if (issueType === IssueType.PerformanceIssue && this.receivedSystemInfo && this.receivedPerformanceInfo) {
				return true;
			}

			if (issueType === IssueType.FeatureRequest) {
				return true;
			}
		}

		return false;
	}

	private getExtensionRepositoryUrl(): string | undefined {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		return selectedExtension && selectedExtension.repositoryUrl;
	}

	public getExtensionBugsUrl(): string | undefined {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		return selectedExtension && selectedExtension.bugsUrl;
	}

	public searchVSCodeIssues(title: string, issueDescription?: string): void {
		if (title) {
			this.searchDuplicates(title, issueDescription);
		} else {
			this.clearSearchResults();
		}
	}

	public searchIssues(title: string, fileOnExtension: boolean | undefined, fileOnMarketplace: boolean | undefined): void {
		if (fileOnExtension) {
			return this.searchExtensionIssues(title);
		}

		if (fileOnMarketplace) {
			return this.searchMarketplaceIssues(title);
		}

		const description = this.issueReporterModel.getData().issueDescription;
		this.searchVSCodeIssues(title, description);
	}

	private searchExtensionIssues(title: string): void {
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

	private searchMarketplaceIssues(title: string): void {
		if (title) {
			const gitHubInfo = this.parseGitHubUrl(this.product.reportMarketplaceIssueUrl!);
			if (gitHubInfo) {
				return this.searchGitHub(`${gitHubInfo.owner}/${gitHubInfo.repositoryName}`, title);
			}
		}
	}

	public async close(): Promise<void> {
		await this.issueFormService.closeReporter();
	}

	public clearSearchResults(): void {
		// eslint-disable-next-line no-restricted-syntax
		const similarIssues = this.getElementById('similar-issues')!;
		similarIssues.innerText = '';
		this.numberOfSearchResultsDisplayed = 0;
	}

	@debounce(300)
	private searchGitHub(repo: string, title: string): void {
		const query = `is:issue+repo:${repo}+${title}`;
		// eslint-disable-next-line no-restricted-syntax
		const similarIssues = this.getElementById('similar-issues')!;

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

	@debounce(300)
	private searchDuplicates(title: string, body?: string): void {
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
				} else {
					throw new Error('Unexpected response, no candidates property');
				}
			}).catch(_ => {
				// Ignore
			});
		}).catch(_ => {
			// Ignore
		});
	}

	private displaySearchResults(results: SearchResult[]) {
		// eslint-disable-next-line no-restricted-syntax
		const similarIssues = this.getElementById('similar-issues')!;
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
				link.addEventListener('auxclick', (e) => this.openLink(<MouseEvent>e));

				let issueState: HTMLElement;
				let item: HTMLElement;
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
				} else {
					item = $('div.issue', undefined, link);
				}

				issues.appendChild(item);
			}

			similarIssues.appendChild(issuesText);
			similarIssues.appendChild(issues);
		}
	}

	private setUpTypes(): void {
		const makeOption = (issueType: IssueType, description: string) => $('option', { 'value': issueType.valueOf() }, escape(description));

		// eslint-disable-next-line no-restricted-syntax
		const typeSelect = this.getElementById('issue-type')! as HTMLSelectElement;
		const { issueType } = this.issueReporterModel.getData();
		reset(typeSelect,
			makeOption(IssueType.Bug, localize('bugReporter', "Bug Report")),
			makeOption(IssueType.FeatureRequest, localize('featureRequest', "Feature Request")),
			makeOption(IssueType.PerformanceIssue, localize('performanceIssue', "Performance Issue (freeze, slow, crash)"))
		);

		typeSelect.value = issueType.toString();

		this.setSourceOptions();
	}

	public makeOption(value: string, description: string, disabled: boolean): HTMLOptionElement {
		const option: HTMLOptionElement = document.createElement('option');
		option.disabled = disabled;
		option.value = value;
		option.textContent = description;

		return option;
	}

	public setSourceOptions(): void {
		// eslint-disable-next-line no-restricted-syntax
		const sourceSelect = this.getElementById('issue-source')! as HTMLSelectElement;
		const { issueType, fileOnExtension, selectedExtension, fileOnMarketplace, fileOnProduct } = this.issueReporterModel.getData();
		let selected = sourceSelect.selectedIndex;
		if (selected === -1) {
			if (fileOnExtension !== undefined) {
				selected = fileOnExtension ? 2 : 1;
			} else if (selectedExtension?.isBuiltin) {
				selected = 1;
			} else if (fileOnMarketplace) {
				selected = 3;
			} else if (fileOnProduct) {
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

		if (issueType !== IssueType.FeatureRequest) {
			sourceSelect.append(this.makeOption(IssueSource.Unknown, localize('unknown', "Don't know"), false));
		}

		if (selected !== -1 && selected < sourceSelect.options.length) {
			sourceSelect.selectedIndex = selected;
		} else {
			sourceSelect.selectedIndex = 0;
			// eslint-disable-next-line no-restricted-syntax
			hide(this.getElementById('problem-source-help-text'));
		}
	}

	public async renderBlocks(): Promise<void> {
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
		const problemSource = this.getElementById('problem-source')!;
		// eslint-disable-next-line no-restricted-syntax
		const descriptionTitle = this.getElementById('issue-description-label')!;
		// eslint-disable-next-line no-restricted-syntax
		const descriptionSubtitle = this.getElementById('issue-description-subtitle')!;
		// eslint-disable-next-line no-restricted-syntax
		const extensionSelector = this.getElementById('extension-selection')!;
		// eslint-disable-next-line no-restricted-syntax
		const downloadExtensionDataLink = <HTMLAnchorElement>this.getElementById('extension-data-download')!;

		// eslint-disable-next-line no-restricted-syntax
		const titleTextArea = this.getElementById('issue-title-container')!;
		// eslint-disable-next-line no-restricted-syntax
		const descriptionTextArea = this.getElementById('description')!;
		// eslint-disable-next-line no-restricted-syntax
		const extensionDataTextArea = this.getElementById('extension-data')!;

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
			(extensionDataTextArea as HTMLElement).innerText = data.toString();
			(extensionDataTextArea as HTMLTextAreaElement).readOnly = true;
			show(extensionDataBlock);
		}

		// only if we know comes from the open reporter command
		if (fileOnExtension && this.openReporter) {
			(extensionDataTextArea as HTMLTextAreaElement).readOnly = true;
			setTimeout(() => {
				// delay to make sure from command or not
				if (this.openReporter) {
					show(extensionDataBlock);
				}
			}, 100);
			show(extensionDataBlock);
		}

		if (issueType === IssueType.Bug) {
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
		} else if (issueType === IssueType.PerformanceIssue) {
			if (!fileOnMarketplace) {
				show(blockContainer);
				show(systemBlock);
				show(processBlock);
				show(workspaceBlock);
				show(experimentsBlock);
			}

			if (fileOnExtension) {
				show(extensionSelector);
			} else if (!fileOnMarketplace) {
				show(extensionsBlock);
			}

			reset(descriptionTitle, localize('stepsToReproduce', "Steps to Reproduce") + ' ', $('span.required-input', undefined, '*'));
			reset(descriptionSubtitle, localize('performanceIssueDesciption', "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
		} else if (issueType === IssueType.FeatureRequest) {
			reset(descriptionTitle, localize('description', "Description") + ' ', $('span.required-input', undefined, '*'));
			reset(descriptionSubtitle, localize('featureRequestDescription', "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
		}
	}

	public validateInput(inputId: string): boolean {
		// eslint-disable-next-line no-restricted-syntax
		const inputElement = (<HTMLInputElement>this.getElementById(inputId));
		// eslint-disable-next-line no-restricted-syntax
		const inputValidationMessage = this.getElementById(`${inputId}-empty-error`);
		// eslint-disable-next-line no-restricted-syntax
		const descriptionShortMessage = this.getElementById(`description-short-error`);
		if (inputId === 'description' && this.nonGitHubIssueUrl && this.data.extensionId) {
			return true;
		} else if (!inputElement.value) {
			inputElement.classList.add('invalid-input');
			inputValidationMessage?.classList.remove('hidden');
			descriptionShortMessage?.classList.add('hidden');
			return false;
		} else if (inputId === 'description' && inputElement.value.length < 10) {
			inputElement.classList.add('invalid-input');
			descriptionShortMessage?.classList.remove('hidden');
			inputValidationMessage?.classList.add('hidden');
			return false;
		} else {
			inputElement.classList.remove('invalid-input');
			inputValidationMessage?.classList.add('hidden');
			if (inputId === 'description') {
				descriptionShortMessage?.classList.add('hidden');
			}
			return true;
		}
	}

	public validateInputs(): boolean {
		let isValid = true;
		['issue-title', 'description', 'issue-source'].forEach(elementId => {
			isValid = this.validateInput(elementId) && isValid;
		});

		if (this.issueReporterModel.fileOnExtension()) {
			isValid = this.validateInput('extension-selector') && isValid;
		}

		return isValid;
	}

	public async submitToGitHub(issueTitle: string, issueBody: string, gitHubDetails: { owner: string; repositoryName: string }): Promise<boolean> {
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

	public async createIssue(shouldCreate?: boolean, privateUri?: boolean): Promise<boolean> {
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
				(<HTMLInputElement>invalidInput[0]).focus();
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
		const issueTitle = (<HTMLInputElement>this.getElementById('issue-title')).value;
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
		const baseUrl = this.getIssueUrlWithTitle((<HTMLInputElement>this.getElementById('issue-title')).value, issueUrl);
		let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;

		url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);

		if (url.length > MAX_URL_LENGTH) {
			try {
				url = await this.writeToClipboard(baseUrl, issueBody);
				url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
			} catch (_) {
				console.error('Writing to clipboard failed');
				return false;
			}
		}

		await this.openLink(url);

		return true;
	}

	public async writeToClipboard(baseUrl: string, issueBody: string): Promise<string> {
		const shouldWrite = await this.issueFormService.showClipboardDialog();
		if (!shouldWrite) {
			throw new CancellationError();
		}

		return baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
	}

	public addTemplateToUrl(baseUrl: string, owner?: string, repositoryName?: string): string {
		const isVscode = this.issueReporterModel.getData().fileOnProduct;
		const isMicrosoft = owner?.toLowerCase() === 'microsoft';
		const needsTemplate = isVscode || (isMicrosoft && (repositoryName === 'vscode' || repositoryName === 'vscode-python'));

		if (needsTemplate) {
			try {
				const url = new URL(baseUrl);
				url.searchParams.set('template', 'bug_report.md');
				return url.toString();
			} catch {
				// fallback if baseUrl is not a valid URL
				return baseUrl + '&template=bug_report.md';
			}
		}
		return baseUrl;
	}

	public getIssueUrl(): string {
		return this.issueReporterModel.fileOnExtension()
			? this.getExtensionGitHubUrl()
			: this.issueReporterModel.getData().fileOnMarketplace
				? this.product.reportMarketplaceIssueUrl!
				: this.product.reportIssueUrl!;
	}

	// for when command 'workbench.action.openIssueReporter' passes along a
	// `privateUri` UriComponents value
	public getPrivateIssueUrl(): string | undefined {
		return URI.revive(this.data.privateUri)?.toString();
	}

	public parseGitHubUrl(url: string): undefined | { repositoryName: string; owner: string } {
		// Assumes a GitHub url to a particular repo, https://github.com/repositoryName/owner.
		// Repository name and owner cannot contain '/'
		const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(url);
		if (match && match.length) {
			return {
				owner: match[1],
				repositoryName: match[2]
			};
		} else {
			console.error('No GitHub issues match');
		}

		return undefined;
	}

	private getExtensionGitHubUrl(): string {
		let repositoryUrl = '';
		const bugsUrl = this.getExtensionBugsUrl();
		const extensionUrl = this.getExtensionRepositoryUrl();
		// If given, try to match the extension's bug url
		if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?$/)) {
			// matches exactly: https://github.com/owner/repo/issues
			repositoryUrl = normalizeGitHubUrl(bugsUrl);
		} else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)$/)) {
			// matches exactly: https://github.com/owner/repo
			repositoryUrl = normalizeGitHubUrl(extensionUrl);
		} else {
			this.nonGitHubIssueUrl = true;
			repositoryUrl = bugsUrl || extensionUrl || '';
		}

		return repositoryUrl;
	}

	public getIssueUrlWithTitle(issueTitle: string, repositoryUrl: string): string {
		if (this.issueReporterModel.fileOnExtension()) {
			repositoryUrl = repositoryUrl + '/issues/new';
		}

		const queryStringPrefix = repositoryUrl.indexOf('?') === -1 ? '?' : '&';
		return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
	}

	public clearExtensionData(): void {
		this.nonGitHubIssueUrl = false;
		this.issueReporterModel.update({ extensionData: undefined });
		this.data.issueBody = this.data.issueBody || '';
		this.data.data = undefined;
		this.data.uri = undefined;
		this.data.privateUri = undefined;
	}

	public async updateExtensionStatus(extension: IssueReporterExtensionData) {
		this.issueReporterModel.update({ selectedExtension: extension });

		// uses this.configuuration.data to ensure that data is coming from `openReporter` command.
		const template = this.data.issueBody;
		if (template) {
			// eslint-disable-next-line no-restricted-syntax
			const descriptionTextArea = this.getElementById('description')!;
			const descriptionText = (descriptionTextArea as HTMLTextAreaElement).value;
			if (descriptionText === '' || !descriptionText.includes(template.toString())) {
				const fullTextArea = descriptionText + (descriptionText === '' ? '' : '\n') + template.toString();
				(descriptionTextArea as HTMLTextAreaElement).value = fullTextArea;
				this.issueReporterModel.update({ issueDescription: fullTextArea });
			}
		}

		const data = this.data.data;
		if (data) {
			this.issueReporterModel.update({ extensionData: data });
			extension.data = data;
			// eslint-disable-next-line no-restricted-syntax
			const extensionDataBlock = this.window.document.querySelector('.block-extension-data')!;
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
		const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
		this.searchExtensionIssues(title);

		this.updateButtonStates();
		this.renderBlocks();
	}

	public validateSelectedExtension(): void {
		// eslint-disable-next-line no-restricted-syntax
		const extensionValidationMessage = this.getElementById('extension-selection-validation-error')!;
		// eslint-disable-next-line no-restricted-syntax
		const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url')!;
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
		} else {
			this.setExtensionValidationMessage();
			this.publicGithubButton.enabled = false;
		}
	}

	public setLoading(element: HTMLElement) {
		// Show loading
		this.openReporter = true;
		this.loadingExtensionData = true;
		this.updateButtonStates();

		// eslint-disable-next-line no-restricted-syntax
		const extensionDataCaption = this.getElementById('extension-id')!;
		hide(extensionDataCaption);

		// eslint-disable-next-line no-restricted-syntax
		const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
		extensionDataCaption2.forEach(extensionDataCaption2 => hide(extensionDataCaption2));

		// eslint-disable-next-line no-restricted-syntax
		const showLoading = this.getElementById('ext-loading')!;
		show(showLoading);
		while (showLoading.firstChild) {
			showLoading.firstChild.remove();
		}
		showLoading.append(element);

		this.renderBlocks();
	}

	public removeLoading(element: HTMLElement, fromReporter: boolean = false) {
		this.openReporter = fromReporter;
		this.loadingExtensionData = false;
		this.updateButtonStates();

		// eslint-disable-next-line no-restricted-syntax
		const extensionDataCaption = this.getElementById('extension-id')!;
		show(extensionDataCaption);

		// eslint-disable-next-line no-restricted-syntax
		const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
		extensionDataCaption2.forEach(extensionDataCaption2 => show(extensionDataCaption2));

		// eslint-disable-next-line no-restricted-syntax
		const hideLoading = this.getElementById('ext-loading')!;
		hide(hideLoading);
		if (hideLoading.firstChild) {
			element.remove();
		}
		this.renderBlocks();
	}

	private setExtensionValidationMessage(): void {
		// eslint-disable-next-line no-restricted-syntax
		const extensionValidationMessage = this.getElementById('extension-selection-validation-error')!;
		// eslint-disable-next-line no-restricted-syntax
		const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url')!;
		const bugsUrl = this.getExtensionBugsUrl();
		if (bugsUrl) {
			show(extensionValidationMessage);
			// eslint-disable-next-line no-restricted-syntax
			const link = this.getElementById('extensionBugsLink')!;
			link.textContent = bugsUrl;
			return;
		}

		const extensionUrl = this.getExtensionRepositoryUrl();
		if (extensionUrl) {
			show(extensionValidationMessage);
			// eslint-disable-next-line no-restricted-syntax
			const link = this.getElementById('extensionBugsLink');
			link!.textContent = extensionUrl;
			return;
		}

		show(extensionValidationNoUrlsMessage);
	}

	private updateProcessInfo(state: IssueReporterModelData) {
		// eslint-disable-next-line no-restricted-syntax
		const target = this.window.document.querySelector('.block-process .block-info') as HTMLElement;
		if (target) {
			reset(target, $('code', undefined, state.processInfo ?? ''));
		}
	}

	private updateWorkspaceInfo(state: IssueReporterModelData) {
		// eslint-disable-next-line no-restricted-syntax
		this.window.document.querySelector('.block-workspace .block-info code')!.textContent = '\n' + state.workspaceInfo;
	}

	public updateExtensionTable(extensions: IssueReporterExtensionData[], numThemeExtensions: number): void {
		// eslint-disable-next-line no-restricted-syntax
		const target = this.window.document.querySelector<HTMLElement>('.block-extensions .block-info');
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

	private getExtensionTableHtml(extensions: IssueReporterExtensionData[]): HTMLTableElement {
		return $('table', undefined,
			$('tr', undefined,
				$('th', undefined, 'Extension'),
				$('th', undefined, 'Author (truncated)' as string),
				$('th', undefined, 'Version')
			),
			...extensions.map(extension => $('tr', undefined,
				$('td', undefined, extension.name),
				$('td', undefined, extension.publisher?.substr(0, 3) ?? 'N/A'),
				$('td', undefined, extension.version)
			))
		);
	}

	private async openLink(eventOrUrl: MouseEvent | string): Promise<void> {
		if (typeof eventOrUrl === 'string') {
			// Direct URL call
			await this.openerService.open(eventOrUrl, { openExternal: true });
		} else {
			// MouseEvent call
			const event = eventOrUrl;
			event.preventDefault();
			event.stopPropagation();
			// Exclude right click
			if (event.which < 3) {
				await this.openerService.open((<HTMLAnchorElement>event.target).href, { openExternal: true });
			}
		}
	}

	public getElementById<T extends HTMLElement = HTMLElement>(elementId: string): T | undefined {
		// eslint-disable-next-line no-restricted-syntax
		const element = this.window.document.getElementById(elementId) as T | undefined;
		if (element) {
			return element;
		} else {
			return undefined;
		}
	}

	public addEventListener(elementId: string, eventType: string, handler: (event: Event) => void): void {
		// eslint-disable-next-line no-restricted-syntax
		const element = this.getElementById(elementId);
		element?.addEventListener(eventType, handler);
	}
}

// helper functions

export function hide(el: Element | undefined | null) {
	el?.classList.add('hidden');
}
export function show(el: Element | undefined | null) {
	el?.classList.remove('hidden');
}
