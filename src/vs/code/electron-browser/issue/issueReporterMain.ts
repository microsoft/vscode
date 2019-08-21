/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/issueReporter';
import { shell, ipcRenderer, webFrame, clipboard } from 'electron';
import { localize } from 'vs/nls';
import { $ } from 'vs/base/browser/dom';
import * as collections from 'vs/base/common/collections';
import * as browser from 'vs/base/browser/browser';
import { escape } from 'vs/base/common/strings';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';
import * as os from 'os';
import { debounce } from 'vs/base/common/decorators';
import * as platform from 'vs/base/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { NullTelemetryService, combinedAppender, LogAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { WindowsService } from 'vs/platform/windows/electron-browser/windowsService';
import { MainProcessService, IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IssueReporterModel, IssueReporterData as IssueReporterModelData } from 'vs/code/electron-browser/issue/issueReporterModel';
import { IssueReporterData, IssueReporterStyles, IssueType, ISettingsSearchIssueReporterData, IssueReporterFeatures, IssueReporterExtensionData } from 'vs/platform/issue/node/issue';
import BaseHtml from 'vs/code/electron-browser/issue/issueReporterPage';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/common/logIpc';
import { ILogService, getLogLevel } from 'vs/platform/log/common/log';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { normalizeGitHubUrl } from 'vs/code/electron-browser/issue/issueReporterUtil';
import { Button } from 'vs/base/browser/ui/button/button';
import { withUndefinedAsNull } from 'vs/base/common/types';
import { SystemInfo, isRemoteDiagnosticError } from 'vs/platform/diagnostics/common/diagnostics';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';

const MAX_URL_LENGTH = 2045;

interface SearchResult {
	html_url: string;
	title: string;
	state?: string;
}

export interface IssueReporterConfiguration extends IWindowConfiguration {
	data: IssueReporterData;
	features: IssueReporterFeatures;
}

export function startup(configuration: IssueReporterConfiguration) {
	document.body.innerHTML = BaseHtml();
	const issueReporter = new IssueReporter(configuration);
	issueReporter.render();
	document.body.style.display = 'block';
	issueReporter.setInitialFocus();
}

export class IssueReporter extends Disposable {
	private environmentService!: IEnvironmentService;
	private telemetryService!: ITelemetryService;
	private logService!: ILogService;
	private readonly issueReporterModel: IssueReporterModel;
	private numberOfSearchResultsDisplayed = 0;
	private receivedSystemInfo = false;
	private receivedPerformanceInfo = false;
	private shouldQueueSearch = false;
	private hasBeenSubmitted = false;

	private readonly previewButton!: Button;

	constructor(configuration: IssueReporterConfiguration) {
		super();

		this.initServices(configuration);

		const isSnap = process.platform === 'linux' && process.env.SNAP && process.env.SNAP_REVISION;
		this.issueReporterModel = new IssueReporterModel({
			issueType: configuration.data.issueType || IssueType.Bug,
			versionInfo: {
				vscodeVersion: `${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`,
				os: `${os.type()} ${os.arch()} ${os.release()}${isSnap ? ' snap' : ''}`
			},
			extensionsDisabled: !!this.environmentService.disableExtensions,
			fileOnExtension: configuration.data.extensionId ? true : undefined,
			selectedExtension: configuration.data.extensionId ? configuration.data.enabledExtensions.filter(extension => extension.id === configuration.data.extensionId)[0] : undefined
		});

		const issueReporterElement = this.getElementById('issue-reporter');
		if (issueReporterElement) {
			this.previewButton = new Button(issueReporterElement);
		}

		ipcRenderer.on('vscode:issuePerformanceInfoResponse', (_: unknown, info: Partial<IssueReporterData>) => {
			this.logService.trace('issueReporter: Received performance data');
			this.issueReporterModel.update(info);
			this.receivedPerformanceInfo = true;

			const state = this.issueReporterModel.getData();
			this.updateProcessInfo(state);
			this.updateWorkspaceInfo(state);
			this.updatePreviewButtonState();
		});

		ipcRenderer.on('vscode:issueSystemInfoResponse', (_: unknown, info: SystemInfo) => {
			this.logService.trace('issueReporter: Received system data');
			this.issueReporterModel.update({ systemInfo: info });
			this.receivedSystemInfo = true;

			this.updateSystemInfo(this.issueReporterModel.getData());
			this.updatePreviewButtonState();
		});

		ipcRenderer.send('vscode:issueSystemInfoRequest');
		if (configuration.data.issueType === IssueType.PerformanceIssue) {
			ipcRenderer.send('vscode:issuePerformanceInfoRequest');
		}
		this.logService.trace('issueReporter: Sent data requests');

		if (window.document.documentElement.lang !== 'en') {
			show(this.getElementById('english'));
		}

		this.setUpTypes();
		this.setEventHandlers();
		this.applyZoom(configuration.data.zoomLevel);
		this.applyStyles(configuration.data.styles);
		this.handleExtensionData(configuration.data.enabledExtensions);

		if (configuration.data.issueType === IssueType.SettingsSearchIssue) {
			this.handleSettingsSearchData(<ISettingsSearchIssueReporterData>configuration.data);
		}
	}

	render(): void {
		this.renderBlocks();
	}

	setInitialFocus() {
		const { fileOnExtension } = this.issueReporterModel.getData();
		if (fileOnExtension) {
			const issueTitle = document.getElementById('issue-title');
			if (issueTitle) {
				issueTitle.focus();
			}
		} else {
			const issueType = document.getElementById('issue-type');
			if (issueType) {
				issueType.focus();
			}
		}
	}

	private applyZoom(zoomLevel: number) {
		webFrame.setZoomLevel(zoomLevel);
		browser.setZoomFactor(webFrame.getZoomFactor());
		// See https://github.com/Microsoft/vscode/issues/26151
		// Cannot be trusted because the webFrame might take some time
		// until it really applies the new zoom level
		browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
	}

	private applyStyles(styles: IssueReporterStyles) {
		const styleTag = document.createElement('style');
		const content: string[] = [];

		if (styles.inputBackground) {
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state, .block-info { background-color: ${styles.inputBackground}; }`);
		}

		if (styles.inputBorder) {
			content.push(`input[type="text"], textarea, select { border: 1px solid ${styles.inputBorder}; }`);
		} else {
			content.push(`input[type="text"], textarea, select { border: 1px solid transparent; }`);
		}

		if (styles.inputForeground) {
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state, .block-info { color: ${styles.inputForeground}; }`);
		}

		if (styles.inputErrorBorder) {
			content.push(`.invalid-input, .invalid-input:focus { border: 1px solid ${styles.inputErrorBorder} !important; }`);
			content.push(`.validation-error, .required-input { color: ${styles.inputErrorBorder}; }`);
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

		if (styles.sliderBackgroundColor) {
			content.push(`::-webkit-scrollbar-thumb { background-color: ${styles.sliderBackgroundColor}; }`);
		}

		if (styles.sliderActiveColor) {
			content.push(`::-webkit-scrollbar-thumb:active { background-color: ${styles.sliderActiveColor}; }`);
		}

		if (styles.sliderHoverColor) {
			content.push(`::--webkit-scrollbar-thumb:hover { background-color: ${styles.sliderHoverColor}; }`);
		}

		if (styles.buttonBackground) {
			content.push(`.monaco-text-button { background-color: ${styles.buttonBackground} !important; }`);
		}

		if (styles.buttonForeground) {
			content.push(`.monaco-text-button { color: ${styles.buttonForeground} !important; }`);
		}

		if (styles.buttonHoverBackground) {
			content.push(`.monaco-text-button:hover, .monaco-text-button:focus { background-color: ${styles.buttonHoverBackground} !important; }`);
		}

		styleTag.innerHTML = content.join('\n');
		document.head.appendChild(styleTag);
		document.body.style.color = withUndefinedAsNull(styles.color);
	}

	private handleExtensionData(extensions: IssueReporterExtensionData[]) {
		const { nonThemes, themes } = collections.groupBy(extensions, ext => {
			return ext.isTheme ? 'themes' : 'nonThemes';
		});

		const numberOfThemeExtesions = themes && themes.length;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: extensions });
		this.updateExtensionTable(nonThemes, numberOfThemeExtesions);

		if (this.environmentService.disableExtensions || extensions.length === 0) {
			(<HTMLButtonElement>this.getElementById('disableExtensions')).disabled = true;
		}

		this.updateExtensionSelector(extensions);
	}

	private handleSettingsSearchData(data: ISettingsSearchIssueReporterData): void {
		this.issueReporterModel.update({
			actualSearchResults: data.actualSearchResults,
			query: data.query,
			filterResultCount: data.filterResultCount
		});
		this.updateSearchedExtensionTable(data.enabledExtensions);
		this.updateSettingsSearchDetails(data);
	}

	private updateSettingsSearchDetails(data: ISettingsSearchIssueReporterData): void {
		const target = document.querySelector('.block-settingsSearchResults .block-info');
		if (target) {
			const details = `
			<div class='block-settingsSearchResults-details'>
				<div>Query: "${data.query}"</div>
				<div>Literal match count: ${data.filterResultCount}</div>
			</div>
			`;

			let table = `
				<tr>
					<th>Setting</th>
					<th>Extension</th>
					<th>Score</th>
				</tr>`;

			data.actualSearchResults
				.forEach(setting => {
					table += `
						<tr>
							<td>${setting.key}</td>
							<td>${setting.extensionId}</td>
							<td>${String(setting.score).slice(0, 5)}</td>
						</tr>`;
				});

			target.innerHTML = `${details}<table>${table}</table>`;
		}
	}

	private initServices(configuration: IWindowConfiguration): void {
		const serviceCollection = new ServiceCollection();
		const mainProcessService = new MainProcessService(configuration.windowId);
		serviceCollection.set(IMainProcessService, mainProcessService);

		serviceCollection.set(IWindowsService, new WindowsService(mainProcessService));
		this.environmentService = new EnvironmentService(configuration, configuration.execPath);

		const logService = new SpdLogService(`issuereporter${configuration.windowId}`, this.environmentService.logsPath, getLogLevel(this.environmentService));
		const logLevelClient = new LogLevelSetterChannelClient(mainProcessService.getChannel('loglevel'));
		this.logService = new FollowerLogService(logLevelClient, logService);

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${configuration.windowId}`));

		const instantiationService = new InstantiationService(serviceCollection, true);
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const appender = combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(logService));
			const commonProperties = resolveCommonProperties(product.commit || 'Commit unknown', pkg.version, configuration.machineId, this.environmentService.installSourcePath);
			const piiPaths = this.environmentService.extensionsPath ? [this.environmentService.appRoot, this.environmentService.extensionsPath] : [this.environmentService.appRoot];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths };

			const telemetryService = instantiationService.createInstance(TelemetryService, config);
			this._register(telemetryService);

			this.telemetryService = telemetryService;
		} else {
			this.telemetryService = NullTelemetryService;
		}
	}

	private setEventHandlers(): void {
		this.addEventListener('issue-type', 'change', (event: Event) => {
			const issueType = parseInt((<HTMLInputElement>event.target).value);
			this.issueReporterModel.update({ issueType: issueType });
			if (issueType === IssueType.PerformanceIssue && !this.receivedPerformanceInfo) {
				ipcRenderer.send('vscode:issuePerformanceInfoRequest');
			}
			this.updatePreviewButtonState();
			this.setSourceOptions();
			this.render();
		});

		(['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions', 'includeSearchedExtensions', 'includeSettingsSearchDetails'] as const).forEach(elementId => {
			this.addEventListener(elementId, 'click', (event: Event) => {
				event.stopPropagation();
				this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
			});
		});

		const showInfoElements = document.getElementsByClassName('showInfo');
		for (let i = 0; i < showInfoElements.length; i++) {
			const showInfo = showInfoElements.item(i);
			showInfo!.addEventListener('click', (e: MouseEvent) => {
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

			const fileOnExtension = JSON.parse(value);
			this.issueReporterModel.update({ fileOnExtension: fileOnExtension });
			this.render();

			const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
			if (fileOnExtension) {
				this.searchExtensionIssues(title);
			} else {
				const description = this.issueReporterModel.getData().issueDescription;
				this.searchVSCodeIssues(title, description);
			}
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

		this.addEventListener('issue-title', 'input', (e: Event) => {
			const title = (<HTMLInputElement>e.target).value;
			const lengthValidationMessage = this.getElementById('issue-title-length-validation-error');
			if (title && this.getIssueUrlWithTitle(title).length > MAX_URL_LENGTH) {
				show(lengthValidationMessage);
			} else {
				hide(lengthValidationMessage);
			}

			const fileOnExtension = this.issueReporterModel.fileOnExtension();
			if (fileOnExtension === undefined) {
				return;
			}

			if (fileOnExtension) {
				this.searchExtensionIssues(title);
			} else {
				const description = this.issueReporterModel.getData().issueDescription;
				this.searchVSCodeIssues(title, description);
			}
		});

		this.previewButton.onDidClick(() => this.createIssue());

		function sendWorkbenchCommand(commandId: string) {
			ipcRenderer.send('vscode:workbenchCommand', { id: commandId, from: 'issueReporter' });
		}

		this.addEventListener('disableExtensions', 'click', () => {
			sendWorkbenchCommand('workbench.action.reloadWindowWithExtensionsDisabled');
		});

		this.addEventListener('disableExtensions', 'keydown', (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.keyCode === 13 || e.keyCode === 32) {
				sendWorkbenchCommand('workbench.extensions.action.disableAll');
				sendWorkbenchCommand('workbench.action.reloadWindow');
			}
		});

		document.onkeydown = async (e: KeyboardEvent) => {
			const cmdOrCtrlKey = platform.isMacintosh ? e.metaKey : e.ctrlKey;
			// Cmd/Ctrl+Enter previews issue and closes window
			if (cmdOrCtrlKey && e.keyCode === 13) {
				if (await this.createIssue()) {
					ipcRenderer.send('vscode:closeIssueReporter');
				}
			}

			// Cmd/Ctrl + w closes issue window
			if (cmdOrCtrlKey && e.keyCode === 87) {
				e.stopPropagation();
				e.preventDefault();

				const issueTitle = (<HTMLInputElement>this.getElementById('issue-title'))!.value;
				const { issueDescription } = this.issueReporterModel.getData();
				if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
					ipcRenderer.send('vscode:issueReporterConfirmClose');
				} else {
					ipcRenderer.send('vscode:closeIssueReporter');
				}
			}

			// Cmd/Ctrl + zooms in
			if (cmdOrCtrlKey && e.keyCode === 187) {
				this.applyZoom(webFrame.getZoomLevel() + 1);
			}

			// Cmd/Ctrl - zooms out
			if (cmdOrCtrlKey && e.keyCode === 189) {
				this.applyZoom(webFrame.getZoomLevel() - 1);
			}

			// With latest electron upgrade, cmd+a is no longer propagating correctly for inputs in this window on mac
			// Manually perform the selection
			if (platform.isMacintosh) {
				if (cmdOrCtrlKey && e.keyCode === 65 && e.target) {
					if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
						(<HTMLInputElement>e.target).select();
					}
				}
			}
		};
	}

	private updatePreviewButtonState() {
		if (this.isPreviewEnabled()) {
			this.previewButton.label = localize('previewOnGitHub', "Preview on GitHub");
			this.previewButton.enabled = true;
		} else {
			this.previewButton.enabled = false;
			this.previewButton.label = localize('loadingData', "Loading data...");
		}
	}

	private isPreviewEnabled() {
		const issueType = this.issueReporterModel.getData().issueType;
		if (issueType === IssueType.Bug && this.receivedSystemInfo) {
			return true;
		}

		if (issueType === IssueType.PerformanceIssue && this.receivedSystemInfo && this.receivedPerformanceInfo) {
			return true;
		}

		if (issueType === IssueType.FeatureRequest) {
			return true;
		}

		if (issueType === IssueType.SettingsSearchIssue) {
			return true;
		}

		return false;
	}

	private getExtensionRepositoryUrl(): string | undefined {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		return selectedExtension && selectedExtension.repositoryUrl;
	}

	private getExtensionBugsUrl(): string | undefined {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		return selectedExtension && selectedExtension.bugsUrl;
	}

	private searchVSCodeIssues(title: string, issueDescription?: string): void {
		if (title) {
			this.searchDuplicates(title, issueDescription);
		} else {
			this.clearSearchResults();
		}
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

	private clearSearchResults(): void {
		const similarIssues = this.getElementById('similar-issues')!;
		similarIssues.innerHTML = '';
		this.numberOfSearchResultsDisplayed = 0;
	}

	@debounce(300)
	private searchGitHub(repo: string, title: string): void {
		const query = `is:issue+repo:${repo}+${title}`;
		const similarIssues = this.getElementById('similar-issues')!;

		window.fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
			response.json().then(result => {
				similarIssues.innerHTML = '';
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
			}).catch(e => {
				this.logSearchError(e);
			});
		}).catch(e => {
			this.logSearchError(e);
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

		window.fetch(url, init).then((response) => {
			response.json().then(result => {
				this.clearSearchResults();

				if (result && result.candidates) {
					this.displaySearchResults(result.candidates);
				} else {
					throw new Error('Unexpected response, no candidates property');
				}
			}).catch((error) => {
				this.logSearchError(error);
			});
		}).catch((error) => {
			this.logSearchError(error);
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
					const octicon = new OcticonLabel(issueIcon);
					octicon.text = issue.state === 'open' ? '$(issue-opened)' : '$(issue-closed)';

					const issueStateLabel = $('span.issue-state.label');
					issueStateLabel.textContent = issue.state === 'open' ? localize('open', "Open") : localize('closed', "Closed");

					issueState.title = issue.state === 'open' ? localize('open', "Open") : localize('closed', "Closed");
					issueState.appendChild(issueIcon);
					issueState.appendChild(issueStateLabel);

					item = $('div.issue', {}, issueState, link);
				} else {
					item = $('div.issue', {}, link);
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

	private logSearchError(error: Error) {
		this.logService.warn('issueReporter#search ', error.message);
		type IssueReporterSearchErrorClassification = {
			message: { classification: 'CallstackOrException', purpose: 'PerformanceAndHealth' }
		};

		type IssueReporterSearchError = {
			message: string;
		};
		this.telemetryService.publicLog2<IssueReporterSearchError, IssueReporterSearchErrorClassification>('issueReporterSearchError', { message: error.message });
	}

	private setUpTypes(): void {
		const makeOption = (issueType: IssueType, description: string) => `<option value="${issueType.valueOf()}">${escape(description)}</option>`;

		const typeSelect = this.getElementById('issue-type')! as HTMLSelectElement;
		const { issueType } = this.issueReporterModel.getData();
		if (issueType === IssueType.SettingsSearchIssue) {
			typeSelect.innerHTML = makeOption(IssueType.SettingsSearchIssue, localize('settingsSearchIssue', "Settings Search Issue"));
			typeSelect.disabled = true;
		} else {
			typeSelect.innerHTML = [
				makeOption(IssueType.Bug, localize('bugReporter', "Bug Report")),
				makeOption(IssueType.FeatureRequest, localize('featureRequest', "Feature Request")),
				makeOption(IssueType.PerformanceIssue, localize('performanceIssue', "Performance Issue"))
			].join('\n');
		}

		typeSelect.value = issueType.toString();

		this.setSourceOptions();
	}

	private makeOption(value: string, description: string, disabled: boolean): HTMLOptionElement {
		const option: HTMLOptionElement = document.createElement('option');
		option.disabled = disabled;
		option.value = value;
		option.textContent = description;

		return option;
	}

	private setSourceOptions(): void {
		const sourceSelect = this.getElementById('issue-source')! as HTMLSelectElement;
		const { issueType, fileOnExtension } = this.issueReporterModel.getData();
		let selected = sourceSelect.selectedIndex;
		if (selected === -1 && fileOnExtension !== undefined) {
			selected = fileOnExtension ? 2 : 1;
		}

		sourceSelect.innerHTML = '';
		if (issueType === IssueType.FeatureRequest) {
			sourceSelect.append(...[
				this.makeOption('', localize('selectSource', "Select source"), true),
				this.makeOption('false', localize('vscode', "Visual Studio Code"), false),
				this.makeOption('true', localize('extension', "An extension"), false)
			]);
		} else {
			sourceSelect.append(...[
				this.makeOption('', localize('selectSource', "Select source"), true),
				this.makeOption('false', localize('vscode', "Visual Studio Code"), false),
				this.makeOption('true', localize('extension', "An extension"), false),
				this.makeOption('', localize('unknown', "Don't Know"), false)
			]);
		}

		if (selected !== -1 && selected < sourceSelect.options.length) {
			sourceSelect.selectedIndex = selected;
		} else {
			sourceSelect.selectedIndex = 0;
			hide(this.getElementById('problem-source-help-text'));
		}
	}

	private renderBlocks(): void {
		// Depending on Issue Type, we render different blocks and text
		const { issueType, fileOnExtension } = this.issueReporterModel.getData();
		const blockContainer = this.getElementById('block-container');
		const systemBlock = document.querySelector('.block-system');
		const processBlock = document.querySelector('.block-process');
		const workspaceBlock = document.querySelector('.block-workspace');
		const extensionsBlock = document.querySelector('.block-extensions');
		const searchedExtensionsBlock = document.querySelector('.block-searchedExtensions');
		const settingsSearchResultsBlock = document.querySelector('.block-settingsSearchResults');

		const problemSource = this.getElementById('problem-source')!;
		const descriptionTitle = this.getElementById('issue-description-label')!;
		const descriptionSubtitle = this.getElementById('issue-description-subtitle')!;
		const extensionSelector = this.getElementById('extension-selection')!;

		// Hide all by default
		hide(blockContainer);
		hide(systemBlock);
		hide(processBlock);
		hide(workspaceBlock);
		hide(extensionsBlock);
		hide(searchedExtensionsBlock);
		hide(settingsSearchResultsBlock);
		hide(problemSource);
		hide(extensionSelector);

		if (issueType === IssueType.Bug) {
			show(blockContainer);
			show(systemBlock);
			show(problemSource);

			if (fileOnExtension) {
				show(extensionSelector);
			} else {
				show(extensionsBlock);
			}

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('bugDescription', "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.PerformanceIssue) {
			show(blockContainer);
			show(systemBlock);
			show(processBlock);
			show(workspaceBlock);
			show(problemSource);

			if (fileOnExtension) {
				show(extensionSelector);
			} else {
				show(extensionsBlock);
			}

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('performanceIssueDesciption', "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.FeatureRequest) {
			descriptionTitle.innerHTML = `${localize('description', "Description")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('featureRequestDescription', "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
			show(problemSource);

			if (fileOnExtension) {
				show(extensionSelector);
			}
		} else if (issueType === IssueType.SettingsSearchIssue) {
			show(blockContainer);
			show(searchedExtensionsBlock);
			show(settingsSearchResultsBlock);

			descriptionTitle.innerHTML = `${localize('expectedResults', "Expected Results")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('settingsSearchResultsDescription', "Please list the results that you were expecting to see when you searched with this query. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		}
	}

	private validateInput(inputId: string): boolean {
		const inputElement = (<HTMLInputElement>this.getElementById(inputId));
		if (!inputElement.value) {
			inputElement.classList.add('invalid-input');
			return false;
		} else {
			inputElement.classList.remove('invalid-input');
			return true;
		}
	}

	private validateInputs(): boolean {
		let isValid = true;
		['issue-title', 'description', 'issue-source'].forEach(elementId => {
			isValid = this.validateInput(elementId) && isValid;
		});

		if (this.issueReporterModel.fileOnExtension()) {
			isValid = this.validateInput('extension-selector') && isValid;
		}

		return isValid;
	}

	private async createIssue(): Promise<boolean> {
		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
			const invalidInput = document.getElementsByClassName('invalid-input');
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

		type IssueReporterSubmitClassification = {
			issueType: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			numSimilarIssuesDisplayed: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};
		type IssueReporterSubmitEvent = {
			issueType: any;
			numSimilarIssuesDisplayed: number;
		};
		this.telemetryService.publicLog2<IssueReporterSubmitEvent, IssueReporterSubmitClassification>('issueReporterSubmit', { issueType: this.issueReporterModel.getData().issueType, numSimilarIssuesDisplayed: this.numberOfSearchResultsDisplayed });
		this.hasBeenSubmitted = true;

		const baseUrl = this.getIssueUrlWithTitle((<HTMLInputElement>this.getElementById('issue-title')).value);
		const issueBody = this.issueReporterModel.serialize();
		let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;

		if (url.length > MAX_URL_LENGTH) {
			try {
				url = await this.writeToClipboard(baseUrl, issueBody);
			} catch (_) {
				return false;
			}
		}

		ipcRenderer.send('vscode:openExternal', url);
		return true;
	}

	private async writeToClipboard(baseUrl: string, issueBody: string): Promise<string> {
		return new Promise((resolve, reject) => {
			ipcRenderer.once('vscode:issueReporterClipboardResponse', (_: unknown, shouldWrite: boolean) => {
				if (shouldWrite) {
					clipboard.writeText(issueBody);
					resolve(baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`);
				} else {
					reject();
				}
			});

			ipcRenderer.send('vscode:issueReporterClipboard');
		});
	}

	private getExtensionGitHubUrl(): string {
		let repositoryUrl = '';
		const bugsUrl = this.getExtensionBugsUrl();
		const extensionUrl = this.getExtensionRepositoryUrl();
		// If given, try to match the extension's bug url
		if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(bugsUrl);
		} else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(extensionUrl);
		}

		return repositoryUrl;
	}

	private getIssueUrlWithTitle(issueTitle: string): string {
		let repositoryUrl = product.reportIssueUrl;
		if (this.issueReporterModel.fileOnExtension()) {
			const extensionGitHubUrl = this.getExtensionGitHubUrl();
			if (extensionGitHubUrl) {
				repositoryUrl = extensionGitHubUrl + '/issues/new';
			}
		}

		const queryStringPrefix = product.reportIssueUrl.indexOf('?') === -1 ? '?' : '&';
		return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
	}

	private updateSystemInfo(state: IssueReporterModelData) {
		const target = document.querySelector('.block-system .block-info');
		if (target) {
			const systemInfo = state.systemInfo!;
			let renderedData = `
			<table>
				<tr><td>CPUs</td><td>${systemInfo.cpus}</td></tr>
				<tr><td>GPU Status</td><td>${Object.keys(systemInfo.gpuStatus).map(key => `${key}: ${systemInfo.gpuStatus[key]}`).join('<br>')}</td></tr>
				<tr><td>Load (avg)</td><td>${systemInfo.load}</td></tr>
				<tr><td>Memory (System)</td><td>${systemInfo.memory}</td></tr>
				<tr><td>Process Argv</td><td>${systemInfo.processArgs}</td></tr>
				<tr><td>Screen Reader</td><td>${systemInfo.screenReader}</td></tr>
				<tr><td>VM</td><td>${systemInfo.vmHint}</td></tr>
			</table>`;

			systemInfo.remoteData.forEach(remote => {
				if (isRemoteDiagnosticError(remote)) {
					renderedData += `
					<hr>
					<table>
						<tr><td>Remote</td><td>${remote.hostName}</td></tr>
						<tr><td></td><td>${remote.errorMessage}</td></tr>
					</table>`;
				} else {
					renderedData += `
					<hr>
					<table>
						<tr><td>Remote</td><td>${remote.hostName}</td></tr>
						<tr><td>OS</td><td>${remote.machineInfo.os}</td></tr>
						<tr><td>CPUs</td><td>${remote.machineInfo.cpus}</td></tr>
						<tr><td>Memory (System)</td><td>${remote.machineInfo.memory}</td></tr>
						<tr><td>VM</td><td>${remote.machineInfo.vmHint}</td></tr>
					</table>`;
				}
			});

			target.innerHTML = renderedData;
		}
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

		const makeOption = (extension: IOption, selectedExtension?: IssueReporterExtensionData) => {
			const selected = selectedExtension && extension.id === selectedExtension.id;
			return `<option value="${extension.id}" ${selected ? 'selected' : ''}>${escape(extension.name)}</option>`;
		};

		const extensionsSelector = this.getElementById('extension-selector');
		if (extensionsSelector) {
			const { selectedExtension } = this.issueReporterModel.getData();
			extensionsSelector.innerHTML = '<option></option>' + extensionOptions.map(extension => makeOption(extension, selectedExtension)).join('\n');

			this.addEventListener('extension-selector', 'change', (e: Event) => {
				const selectedExtensionId = (<HTMLInputElement>e.target).value;
				const extensions = this.issueReporterModel.getData().allExtensions;
				const matches = extensions.filter(extension => extension.id === selectedExtensionId);
				if (matches.length) {
					this.issueReporterModel.update({ selectedExtension: matches[0] });

					const title = (<HTMLInputElement>this.getElementById('issue-title')).value;
					this.searchExtensionIssues(title);
				} else {
					this.issueReporterModel.update({ selectedExtension: undefined });
					this.clearSearchResults();
				}
			});
		}
	}

	private updateProcessInfo(state: IssueReporterModelData) {
		const target = document.querySelector('.block-process .block-info');
		if (target) {
			target.innerHTML = `<code>${state.processInfo}</code>`;
		}
	}

	private updateWorkspaceInfo(state: IssueReporterModelData) {
		document.querySelector('.block-workspace .block-info code')!.textContent = '\n' + state.workspaceInfo;
	}

	private updateExtensionTable(extensions: IssueReporterExtensionData[], numThemeExtensions: number): void {
		const target = document.querySelector('.block-extensions .block-info');
		if (target) {
			if (this.environmentService.disableExtensions) {
				target.innerHTML = localize('disabledExtensions', "Extensions are disabled");
				return;
			}

			const themeExclusionStr = numThemeExtensions ? `\n(${numThemeExtensions} theme extensions excluded)` : '';
			extensions = extensions || [];

			if (!extensions.length) {
				target.innerHTML = 'Extensions: none' + themeExclusionStr;
				return;
			}

			const table = this.getExtensionTableHtml(extensions);
			target.innerHTML = `<table>${table}</table>${themeExclusionStr}`;
		}
	}

	private updateSearchedExtensionTable(extensions: IssueReporterExtensionData[]): void {
		const target = document.querySelector('.block-searchedExtensions .block-info');
		if (target) {
			if (!extensions.length) {
				target.innerHTML = 'Extensions: none';
				return;
			}

			const table = this.getExtensionTableHtml(extensions);
			target.innerHTML = `<table>${table}</table>`;
		}
	}

	private getExtensionTableHtml(extensions: IssueReporterExtensionData[]): string {
		let table = `
			<tr>
				<th>Extension</th>
				<th>Author (truncated)</th>
				<th>Version</th>
			</tr>`;

		table += extensions.map(extension => {
			return `
				<tr>
					<td>${extension.name}</td>
					<td>${extension.publisher.substr(0, 3)}</td>
					<td>${extension.version}</td>
				</tr>`;
		}).join('');

		return table;
	}

	private openLink(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		// Exclude right click
		if (event.which < 3) {
			shell.openExternal((<HTMLAnchorElement>event.target).href);
			this.telemetryService.publicLog2('issueReporterViewSimilarIssue');
		}
	}

	private getElementById(elementId: string): HTMLElement | undefined {
		const element = document.getElementById(elementId);
		if (element) {
			return element;
		} else {
			const error = new Error(`${elementId} not found.`);
			this.logService.error(error);
			type IssueReporterGetElementErrorClassification = {
				message: { classification: 'CallstackOrException', purpose: 'PerformanceAndHealth' };
			};
			type IssueReporterGetElementErrorEvent = {
				message: string;
			};
			this.telemetryService.publicLog2<IssueReporterGetElementErrorEvent, IssueReporterGetElementErrorClassification>('issueReporterGetElementError', { message: error.message });

			return undefined;
		}
	}

	private addEventListener(elementId: string, eventType: string, handler: (event: Event) => void): void {
		const element = this.getElementById(elementId);
		if (element) {
			element.addEventListener(eventType, handler);
		}
	}
}

// helper functions

function hide(el: Element | undefined | null) {
	if (el) {
		el.classList.add('hidden');
	}
}
function show(el: Element | undefined | null) {
	if (el) {
		el.classList.remove('hidden');
	}
}
