/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, createStyleSheet, isHTMLInputElement, isHTMLTextAreaElement, reset, windowOpenNoOpener } from '../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Delayer, RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { groupBy } from '../../../../base/common/collections.js';
import { debounce } from '../../../../base/common/decorators.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isLinuxSnap, isMacintosh } from '../../../../base/common/platform.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { escape } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { OldIssueReporterData } from '../../../../platform/issue/common/issue.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IssueReporterModel, IssueReporterData as IssueReporterModelData } from './issueReporterModel.js';
import { IIssueFormService, IssueReporterData, IssueReporterExtensionData, IssueReporterStyles, IssueType } from '../common/issue.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';

const MAX_URL_LENGTH = 7500;

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
	public previewButton!: Button;
	public nonGitHubIssueUrl = false;

	constructor(
		public disableExtensions: boolean,
		public data: IssueReporterData | OldIssueReporterData,
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

		const fileOnMarketplace = data.issueSource === IssueSource.Marketplace;
		const fileOnProduct = data.issueSource === IssueSource.VSCode;
		this.issueReporterModel.update({ fileOnMarketplace, fileOnProduct });

		//TODO: Handle case where extension is not activated
		const issueReporterElement = this.getElementById('issue-reporter');
		if (issueReporterElement) {
			this.previewButton = new Button(issueReporterElement, unthemedButtonStyles);
			const issueRepoName = document.createElement('a');
			issueReporterElement.appendChild(issueRepoName);
			issueRepoName.id = 'show-repo-name';
			issueRepoName.classList.add('hidden');
			this.updatePreviewButtonState();
		}

		const issueTitle = data.issueTitle;
		if (issueTitle) {
			const issueTitleElement = this.getElementById<HTMLInputElement>('issue-title');
			if (issueTitleElement) {
				issueTitleElement.value = issueTitle;
			}
		}

		const issueBody = data.issueBody;
		if (issueBody) {
			const description = this.getElementById<HTMLTextAreaElement>('description');
			if (description) {
				description.value = issueBody;
				this.issueReporterModel.update({ issueDescription: issueBody });
			}
		}

		if (this.window.document.documentElement.lang !== 'en') {
			show(this.getElementById('english'));
		}

		const codiconStyleSheet = createStyleSheet();
		codiconStyleSheet.id = 'codiconStyles';

		const iconsStyleSheet = this._register(getIconsStyleSheet(this.themeService));
		function updateAll() {
			codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
		}

		const delayer = new RunOnceScheduler(updateAll, 0);
		iconsStyleSheet.onDidChange(() => delayer.schedule());
		delayer.schedule();

		this.handleExtensionData(data.enabledExtensions);
		this.setUpTypes();
		this.applyStyles(data.styles);

		// Handle case where extension is pre-selected through the command
		if ((data.data || data.uri) && targetExtension) {
			this.updateExtensionStatus(targetExtension);
		}
	}

	render(): void {
		this.renderBlocks();
	}

	setInitialFocus() {
		const { fileOnExtension } = this.issueReporterModel.getData();
		if (fileOnExtension) {
			const issueTitle = this.window.document.getElementById('issue-title');
			issueTitle?.focus();
		} else {
			const issueType = this.window.document.getElementById('issue-type');
			issueType?.focus();
		}
	}

	// TODO @justschen: After migration to Aux Window, switch to dedicated css.
	private applyStyles(styles: IssueReporterStyles) {
		const styleTag = document.createElement('style');
		const content: string[] = [];

		if (styles.inputBackground) {
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state, .block-info { background-color: ${styles.inputBackground} !important; }`);
		}

		if (styles.backgroundColor) {
			content.push(`.monaco-workbench { background-color: ${styles.backgroundColor} !important; }`);
			content.push(`.issue-reporter-body::-webkit-scrollbar-track { background-color: ${styles.backgroundColor}; }`);
		}

		if (styles.inputBorder) {
			content.push(`input[type="text"], textarea, select { border: 1px solid ${styles.inputBorder}; }`);
		} else {
			content.push(`input[type="text"], textarea, select { border: 1px solid transparent; }`);
		}

		if (styles.inputForeground) {
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state, .block-info { color: ${styles.inputForeground} !important; }`);
		}

		if (styles.inputErrorBorder) {
			content.push(`.invalid-input, .invalid-input:focus, .validation-error { border: 1px solid ${styles.inputErrorBorder} !important; }`);
			content.push(`.required-input { color: ${styles.inputErrorBorder}; }`);
		}

		if (styles.inputErrorBackground) {
			content.push(`.validation-error { background: ${styles.inputErrorBackground}; }`);
		}

		if (styles.inputErrorForeground) {
			content.push(`.validation-error { color: ${styles.inputErrorForeground}; }`);
		}

		if (styles.inputActiveBorder) {
			content.push(`input[type='text']:focus, textarea:focus, select:focus, summary:focus, button:focus, a:focus, .workbenchCommand:focus  { border: 1px solid ${styles.inputActiveBorder}; outline-style: none; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a, .workbenchCommand { color: ${styles.textLinkColor}; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a { color: ${styles.textLinkColor}; }`);
		}

		if (styles.textLinkActiveForeground) {
			content.push(`a:hover, .workbenchCommand:hover { color: ${styles.textLinkActiveForeground}; }`);
		}

		if (styles.sliderActiveColor) {
			content.push(`.issue-reporter-body::-webkit-scrollbar-thumb:active { background-color: ${styles.sliderActiveColor}; }`);
		}

		if (styles.sliderHoverColor) {
			content.push(`.issue-reporter-body::-webkit-scrollbar-thumb { background-color: ${styles.sliderHoverColor}; }`);
			content.push(`.issue-reporter-body::--webkit-scrollbar-thumb:hover { background-color: ${styles.sliderHoverColor}; }`);
		}

		if (styles.buttonBackground) {
			content.push(`.monaco-text-button { background-color: ${styles.buttonBackground} !important; }`);
		}

		if (styles.buttonForeground) {
			content.push(`.monaco-text-button { color: ${styles.buttonForeground} !important; }`);
		}

		if (styles.buttonHoverBackground) {
			content.push(`.monaco-text-button:not(.disabled):hover, .monaco-text-button:focus { background-color: ${styles.buttonHoverBackground} !important; }`);
		}

		styleTag.textContent = content.join('\n');
		this.window.document.head.appendChild(styleTag);
		this.window.document.body.style.color = styles.color || '';
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

		const numberOfThemeExtesions = themes && themes.length;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
		this.updateExtensionTable(nonThemes, numberOfThemeExtesions);
		if (this.disableExtensions || installedExtensions.length === 0) {
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
								// this.configuration.data = openReporterData;
								this.data = openReporterData;
							}
							// else if (this.selectedExtension !== selectedExtensionId) {
							// }
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
			});
		}

		this.addEventListener('problem-source', 'change', (_) => {
			this.clearExtensionData();
			this.validateSelectedExtension();
		});
	}

	private async sendReporterMenu(extension: IssueReporterExtensionData): Promise<IssueReporterData | undefined> {
		try {
			const data = await this.issueFormService.sendReporterMenu(extension.id);
			return data;
		} catch (e) {
			console.error(e);
			return undefined;
		}
	}

	public setEventHandlers(): void {
		(['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions', 'includeExperiments', 'includeExtensionData'] as const).forEach(elementId => {
			this.addEventListener(elementId, 'click', (event: Event) => {
				event.stopPropagation();
				this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
			});
		});

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

			let fileOnExtension, fileOnMarketplace = false;
			if (value === IssueSource.Extension) {
				fileOnExtension = true;
			} else if (value === IssueSource.Marketplace) {
				fileOnMarketplace = true;
			}

			this.issueReporterModel.update({ fileOnExtension, fileOnMarketplace });
			this.render();

			const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
			this.searchIssues(title, fileOnExtension, fileOnMarketplace);
		});

		this.addEventListener('description', 'input', (e: Event) => {
			const issueDescription = (<HTMLInputElement>e.target).value;
			this.issueReporterModel.update({ issueDescription });

			// Only search for extension issues on title change
			if (this.issueReporterModel.fileOnExtension() === false) {
				const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
				this.searchVSCodeIssues(title, issueDescription);
			}
		});

		this.addEventListener('issue-title', 'input', _ => {
			const titleElement = this.getElementById('issue-title') as HTMLInputElement;
			if (titleElement) {
				const title = titleElement.value;
				this.issueReporterModel.update({ issueTitle: title });
			}
		});

		this.addEventListener('issue-title', 'input', (e: Event) => {
			const title = (<HTMLInputElement>e.target).value;
			const lengthValidationMessage = this.getElementById('issue-title-length-validation-error');
			const issueUrl = this.getIssueUrl();
			if (title && this.getIssueUrlWithTitle(title, issueUrl).length > MAX_URL_LENGTH) {
				show(lengthValidationMessage);
			} else {
				hide(lengthValidationMessage);
			}
			const issueSource = this.getElementById<HTMLSelectElement>('issue-source');
			if (!issueSource || issueSource.value === '') {
				return;
			}

			const { fileOnExtension, fileOnMarketplace } = this.issueReporterModel.getData();
			this.searchIssues(title, fileOnExtension, fileOnMarketplace);
		});

		this.previewButton.onDidClick(async () => {
			this.delayedSubmit.trigger(async () => {
				this.createIssue();
			});
		});

		this.addEventListener('disableExtensions', 'click', () => {
			this.issueFormService.reloadWithExtensionsDisabled();
		});

		this.addEventListener('extensionBugsLink', 'click', (e: Event) => {
			const url = (<HTMLElement>e.target).innerText;
			windowOpenNoOpener(url);
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
	}

	public updatePerformanceInfo(info: Partial<IssueReporterData>) {
		this.issueReporterModel.update(info);
		this.receivedPerformanceInfo = true;

		const state = this.issueReporterModel.getData();
		this.updateProcessInfo(state);
		this.updateWorkspaceInfo(state);
		this.updatePreviewButtonState();
	}

	public updatePreviewButtonState() {
		if (this.isPreviewEnabled()) {
			if (this.data.githubAccessToken) {
				this.previewButton.label = localize('createOnGitHub', "Create on GitHub");
			} else {
				this.previewButton.label = localize('previewOnGitHub', "Preview on GitHub");
			}
			this.previewButton.enabled = true;
		} else {
			this.previewButton.enabled = false;
			this.previewButton.label = localize('loadingData', "Loading data...");
		}

		const issueRepoName = this.getElementById('show-repo-name')! as HTMLAnchorElement;
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
				marginBottom: '10px',
				padding: '4px 0px',
				textDecoration: 'none',
				width: 'auto'
			});
			show(issueRepoName);
		} else {
			// clear styles
			issueRepoName.removeAttribute('style');
			hide(issueRepoName);
		}

		// Initial check when first opened.
		this.getExtensionGitHubUrl();
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
		const similarIssues = this.getElementById('similar-issues')!;
		similarIssues.innerText = '';
		this.numberOfSearchResultsDisplayed = 0;
	}

	@debounce(300)
	private searchGitHub(repo: string, title: string): void {
		const query = `is:issue+repo:${repo}+${title}`;
		const similarIssues = this.getElementById('similar-issues')!;

		fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
			response.json().then(result => {
				similarIssues.innerText = '';
				if (result && result.items) {
					this.displaySearchResults(result.items);
				} else {
					// If the items property isn't present, the rate limit has been hit
					const message = $('div.list-title');
					message.textContent = localize('rateLimited', "GitHub query limit exceeded. Please wait.");
					similarIssues.appendChild(message);

					const resetTime = response.headers.get('X-RateLimit-Reset');
					const timeToWait = resetTime ? parseInt(resetTime) - Math.floor(Date.now() / 1000) : 1;
					if (this.shouldQueueSearch) {
						this.shouldQueueSearch = false;
						setTimeout(() => {
							this.searchGitHub(repo, title);
							this.shouldQueueSearch = true;
						}, timeToWait * 1000);
					}
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
		} else {
			const message = $('div.list-title');
			message.textContent = localize('noSimilarIssues', "No similar issues found");
			similarIssues.appendChild(message);
		}
	}

	private setUpTypes(): void {
		const makeOption = (issueType: IssueType, description: string) => $('option', { 'value': issueType.valueOf() }, escape(description));

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
			hide(this.getElementById('problem-source-help-text'));
		}
	}

	public renderBlocks(): void {
		// Depending on Issue Type, we render different blocks and text
		const { issueType, fileOnExtension, fileOnMarketplace, selectedExtension } = this.issueReporterModel.getData();
		const blockContainer = this.getElementById('block-container');
		const systemBlock = this.window.document.querySelector('.block-system');
		const processBlock = this.window.document.querySelector('.block-process');
		const workspaceBlock = this.window.document.querySelector('.block-workspace');
		const extensionsBlock = this.window.document.querySelector('.block-extensions');
		const experimentsBlock = this.window.document.querySelector('.block-experiments');
		const extensionDataBlock = this.window.document.querySelector('.block-extension-data');

		const problemSource = this.getElementById('problem-source')!;
		const descriptionTitle = this.getElementById('issue-description-label')!;
		const descriptionSubtitle = this.getElementById('issue-description-subtitle')!;
		const extensionSelector = this.getElementById('extension-selection')!;

		const titleTextArea = this.getElementById('issue-title-container')!;
		const descriptionTextArea = this.getElementById('description')!;
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

		show(problemSource);
		show(titleTextArea);
		show(descriptionTextArea);

		if (fileOnExtension) {
			show(extensionSelector);
		}


		if (selectedExtension && this.nonGitHubIssueUrl) {
			hide(titleTextArea);
			hide(descriptionTextArea);
			reset(descriptionTitle, localize('handlesIssuesElsewhere', "This extension handles issues outside of VS Code"));
			reset(descriptionSubtitle, localize('elsewhereDescription', "The '{0}' extension prefers to use an external issue reporter. To be taken to that issue reporting experience, click the button below.", selectedExtension.displayName));
			this.previewButton.label = localize('openIssueReporter', "Open External Issue Reporter");
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
		const inputElement = (<HTMLInputElement>this.getElementById(inputId));
		const inputValidationMessage = this.getElementById(`${inputId}-empty-error`);
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
		mainWindow.open(result.html_url, '_blank');
		this.close();
		return true;
	}

	public async createIssue(): Promise<boolean> {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		const hasUri = this.nonGitHubIssueUrl;
		// Short circuit if the extension provides a custom issue handler
		if (hasUri) {
			const url = this.getExtensionBugsUrl();
			if (url) {
				this.hasBeenSubmitted = true;
				return true;
			}
		}

		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
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

		const issueTitle = (<HTMLInputElement>this.getElementById('issue-title')).value;
		const issueBody = this.issueReporterModel.serialize();

		let issueUrl = this.getIssueUrl();
		if (!issueUrl) {
			console.error('No issue url found');
			return false;
		}

		if (selectedExtension?.uri) {
			const uri = URI.revive(selectedExtension.uri);
			issueUrl = uri.toString();
		}

		const gitHubDetails = this.parseGitHubUrl(issueUrl);
		if (this.data.githubAccessToken && gitHubDetails) {
			return this.submitToGitHub(issueTitle, issueBody, gitHubDetails);
		}

		const baseUrl = this.getIssueUrlWithTitle((<HTMLInputElement>this.getElementById('issue-title')).value, issueUrl);
		let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;

		if (url.length > MAX_URL_LENGTH) {
			try {
				url = await this.writeToClipboard(baseUrl, issueBody);
			} catch (_) {
				console.error('Writing to clipboard failed');
				return false;
			}
		}

		this.window.open(url, '_blank');

		return true;
	}

	public async writeToClipboard(baseUrl: string, issueBody: string): Promise<string> {
		const shouldWrite = await this.issueFormService.showClipboardDialog();
		if (!shouldWrite) {
			throw new CancellationError();
		}

		return baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
	}

	public getIssueUrl(): string {
		return this.issueReporterModel.fileOnExtension()
			? this.getExtensionGitHubUrl()
			: this.issueReporterModel.getData().fileOnMarketplace
				? this.product.reportMarketplaceIssueUrl!
				: this.product.reportIssueUrl!;
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
	}

	public async updateExtensionStatus(extension: IssueReporterExtensionData) {
		this.issueReporterModel.update({ selectedExtension: extension });

		// uses this.configuuration.data to ensure that data is coming from `openReporter` command.
		const template = this.data.issueBody;
		if (template) {
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
		const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
		this.searchExtensionIssues(title);

		this.updatePreviewButtonState();
		this.renderBlocks();
	}

	public validateSelectedExtension(): void {
		const extensionValidationMessage = this.getElementById('extension-selection-validation-error')!;
		const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url')!;
		hide(extensionValidationMessage);
		hide(extensionValidationNoUrlsMessage);

		const extension = this.issueReporterModel.getData().selectedExtension;
		if (!extension) {
			this.previewButton.enabled = true;
			return;
		}

		if (this.loadingExtensionData) {
			return;
		}

		const hasValidGitHubUrl = this.getExtensionGitHubUrl();
		if (hasValidGitHubUrl) {
			this.previewButton.enabled = true;
		} else {
			this.setExtensionValidationMessage();
			this.previewButton.enabled = false;
		}
	}

	public setLoading(element: HTMLElement) {
		// Show loading
		this.openReporter = true;
		this.loadingExtensionData = true;
		this.updatePreviewButtonState();

		const extensionDataCaption = this.getElementById('extension-id')!;
		hide(extensionDataCaption);

		const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
		extensionDataCaption2.forEach(extensionDataCaption2 => hide(extensionDataCaption2));

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
		this.updatePreviewButtonState();

		const extensionDataCaption = this.getElementById('extension-id')!;
		show(extensionDataCaption);

		const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll('.ext-parens'));
		extensionDataCaption2.forEach(extensionDataCaption2 => show(extensionDataCaption2));

		const hideLoading = this.getElementById('ext-loading')!;
		hide(hideLoading);
		if (hideLoading.firstChild) {
			element.remove();
		}
		this.renderBlocks();
	}

	private setExtensionValidationMessage(): void {
		const extensionValidationMessage = this.getElementById('extension-selection-validation-error')!;
		const extensionValidationNoUrlsMessage = this.getElementById('extension-selection-validation-error-no-url')!;
		const bugsUrl = this.getExtensionBugsUrl();
		if (bugsUrl) {
			show(extensionValidationMessage);
			const link = this.getElementById('extensionBugsLink')!;
			link.textContent = bugsUrl;
			return;
		}

		const extensionUrl = this.getExtensionRepositoryUrl();
		if (extensionUrl) {
			show(extensionValidationMessage);
			const link = this.getElementById('extensionBugsLink');
			link!.textContent = extensionUrl;
			return;
		}

		show(extensionValidationNoUrlsMessage);
	}

	private updateProcessInfo(state: IssueReporterModelData) {
		const target = this.window.document.querySelector('.block-process .block-info') as HTMLElement;
		if (target) {
			reset(target, $('code', undefined, state.processInfo ?? ''));
		}
	}

	private updateWorkspaceInfo(state: IssueReporterModelData) {
		this.window.document.querySelector('.block-workspace .block-info code')!.textContent = '\n' + state.workspaceInfo;
	}

	public updateExtensionTable(extensions: IssueReporterExtensionData[], numThemeExtensions: number): void {
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

	private openLink(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		// Exclude right click
		if (event.which < 3) {
			windowOpenNoOpener((<HTMLAnchorElement>event.target).href);
		}
	}

	public getElementById<T extends HTMLElement = HTMLElement>(elementId: string): T | undefined {
		const element = this.window.document.getElementById(elementId) as T | undefined;
		if (element) {
			return element;
		} else {
			return undefined;
		}
	}

	public addEventListener(elementId: string, eventType: string, handler: (event: Event) => void): void {
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
