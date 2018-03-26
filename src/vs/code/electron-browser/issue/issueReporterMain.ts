/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/issueReporter';
import { shell, ipcRenderer, webFrame, remote, clipboard } from 'electron';
import { localize } from 'vs/nls';
import { $ } from 'vs/base/browser/dom';
import * as collections from 'vs/base/common/collections';
import * as browser from 'vs/base/browser/browser';
import { escape } from 'vs/base/common/strings';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as os from 'os';
import { debounce } from 'vs/base/common/decorators';
import * as platform from 'vs/base/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IssueReporterModel } from 'vs/code/electron-browser/issue/issueReporterModel';
import { IssueReporterData, IssueReporterStyles, IssueType, ISettingsSearchIssueReporterData, IssueReporterFeatures } from 'vs/platform/issue/common/issue';
import BaseHtml from 'vs/code/electron-browser/issue/issueReporterPage';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/common/logIpc';
import { ILogService, getLogLevel } from 'vs/platform/log/common/log';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';

const MAX_URL_LENGTH = platform.isWindows ? 2081 : 5400;

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
}

export class IssueReporter extends Disposable {
	private environmentService: IEnvironmentService;
	private telemetryService: ITelemetryService;
	private logService: ILogService;
	private issueReporterModel: IssueReporterModel;
	private numberOfSearchResultsDisplayed = 0;
	private receivedSystemInfo = false;
	private receivedPerformanceInfo = false;

	constructor(configuration: IssueReporterConfiguration) {
		super();

		this.initServices(configuration);

		this.issueReporterModel = new IssueReporterModel({
			issueType: configuration.data.issueType || IssueType.Bug,
			versionInfo: {
				vscodeVersion: `${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`,
				os: `${os.type()} ${os.arch()} ${os.release()}`
			},
			extensionsDisabled: this.environmentService.disableExtensions,
		});

		ipcRenderer.on('issuePerformanceInfoResponse', (event, info) => {
			this.logService.trace('issueReporter: Received performance data');
			this.issueReporterModel.update(info);
			this.receivedPerformanceInfo = true;

			const state = this.issueReporterModel.getData();
			this.updateProcessInfo(state);
			this.updateWorkspaceInfo(state);
			this.updatePreviewButtonState();
		});

		ipcRenderer.on('issueSystemInfoResponse', (event, info) => {
			this.logService.trace('issueReporter: Received system data');
			this.issueReporterModel.update({ systemInfo: info });
			this.receivedSystemInfo = true;

			this.updateSystemInfo(this.issueReporterModel.getData());
			this.updatePreviewButtonState();
		});

		ipcRenderer.send('issueSystemInfoRequest');
		ipcRenderer.send('issuePerformanceInfoRequest');
		this.logService.trace('issueReporter: Sent data requests');

		if (window.document.documentElement.lang !== 'en') {
			show(document.getElementById('english'));
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
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state { background-color: ${styles.inputBackground}; }`);
		}

		if (styles.inputBorder) {
			content.push(`input[type="text"], textarea, select { border: 1px solid ${styles.inputBorder}; }`);
		} else {
			content.push(`input[type="text"], textarea, select { border: 1px solid transparent; }`);
		}

		if (styles.inputForeground) {
			content.push(`input[type="text"], textarea, select, .issues-container > .issue > .issue-state { color: ${styles.inputForeground}; }`);
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

		if (styles.buttonBackground) {
			content.push(`button { background-color: ${styles.buttonBackground}; }`);
		}

		if (styles.buttonForeground) {
			content.push(`button { color: ${styles.buttonForeground}; }`);
		}

		if (styles.buttonHoverBackground) {
			content.push(`#github-submit-btn:hover:enabled, #github-submit-btn:focus:enabled { background-color: ${styles.buttonHoverBackground}; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a { color: ${styles.textLinkColor}; }`);
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

		styleTag.innerHTML = content.join('\n');
		document.head.appendChild(styleTag);
		document.body.style.color = styles.color;
	}

	private handleExtensionData(extensions: ILocalExtension[]) {
		const { nonThemes, themes } = collections.groupBy(extensions, ext => {
			const manifestKeys = ext.manifest.contributes ? Object.keys(ext.manifest.contributes) : [];
			const onlyTheme = !ext.manifest.activationEvents && manifestKeys.length === 1 && manifestKeys[0] === 'themes';
			return onlyTheme ? 'themes' : 'nonThemes';
		});

		const numberOfThemeExtesions = themes && themes.length;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes });
		this.updateExtensionTable(nonThemes, numberOfThemeExtesions);

		if (this.environmentService.disableExtensions || extensions.length === 0) {
			(<HTMLButtonElement>document.getElementById('disableExtensions')).disabled = true;
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

	private initServices(configuration: IWindowConfiguration): void {
		const serviceCollection = new ServiceCollection();
		const mainProcessClient = new ElectronIPCClient(String(`window${configuration.windowId}`));

		const windowsChannel = mainProcessClient.getChannel('windows');
		serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));
		this.environmentService = new EnvironmentService(configuration, configuration.execPath);

		const logService = createSpdLogService(`issuereporter${configuration.windowId}`, getLogLevel(this.environmentService), this.environmentService.logsPath);
		const logLevelClient = new LogLevelSetterChannelClient(mainProcessClient.getChannel('loglevel'));
		this.logService = new FollowerLogService(logLevelClient, logService);

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${configuration.windowId}`));

		const instantiationService = new InstantiationService(serviceCollection, true);
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const appender = new TelemetryAppenderClient(channel);
			const commonProperties = resolveCommonProperties(product.commit, pkg.version, configuration.machineId, this.environmentService.installSourcePath);
			const piiPaths = [this.environmentService.appRoot, this.environmentService.extensionsPath];
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
			this.issueReporterModel.update({ issueType: parseInt((<HTMLInputElement>event.target).value) });
			this.updatePreviewButtonState();
			this.render();
		});

		['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions', 'includeSearchedExtensions', 'includeSettingsSearchDetails'].forEach(elementId => {
			this.addEventListener(elementId, 'click', (event: Event) => {
				event.stopPropagation();
				this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
			});
		});

		const labelElements = document.getElementsByClassName('caption');
		for (let i = 0; i < labelElements.length; i++) {
			const label = labelElements.item(i);
			label.addEventListener('click', (e) => {
				e.stopPropagation();

				// Stop propgagation not working as expected in this case https://bugs.chromium.org/p/chromium/issues/detail?id=809801
				// preventDefault does prevent outer details tag from toggling, so use that and manually toggle the checkbox
				e.preventDefault();
				const containingDiv = (<HTMLLabelElement>e.target).parentElement;
				const checkbox = <HTMLInputElement>containingDiv.firstElementChild;
				if (checkbox) {
					checkbox.checked = !checkbox.checked;
					this.issueReporterModel.update({ [checkbox.id]: !this.issueReporterModel.getData()[checkbox.id] });
				}
			});
		}

		this.addEventListener('issue-source', 'change', (event: Event) => {
			const fileOnExtension = JSON.parse((<HTMLInputElement>event.target).value);
			this.issueReporterModel.update({ fileOnExtension: fileOnExtension, includeExtensions: !fileOnExtension });
			this.render();
			this.search();
		});

		this.addEventListener('description', 'input', (event: Event) => {
			const issueDescription = (<HTMLInputElement>event.target).value;
			this.issueReporterModel.update({ issueDescription });
			this.search();
		});

		this.addEventListener('issue-title', 'input', (e) => {
			const title = (<HTMLInputElement>event.target).value;
			const lengthValidationMessage = document.getElementById('issue-title-length-validation-error');
			if (title && this.getIssueUrlWithTitle(title).length > MAX_URL_LENGTH) {
				show(lengthValidationMessage);
			} else {
				hide(lengthValidationMessage);
			}

			this.search();
		});

		this.addEventListener('github-submit-btn', 'click', () => this.createIssue());

		this.addEventListener('disableExtensions', 'click', () => {
			ipcRenderer.send('workbenchCommand', 'workbench.action.reloadWindowWithExtensionsDisabled');
		});

		this.addEventListener('disableExtensions', 'keydown', (e: KeyboardEvent) => {
			if (e.keyCode === 13 || e.keyCode === 32) {
				ipcRenderer.send('workbenchCommand', 'workbench.extensions.action.disableAll');
				ipcRenderer.send('workbenchCommand', 'workbench.action.reloadWindow');
			}
		});

		// Cmd+Enter or Mac or Ctrl+Enter on other platforms previews issue and closes window
		if (platform.isMacintosh) {
			let prevKeyWasCommand = false;
			document.onkeydown = (e: KeyboardEvent) => {
				if (prevKeyWasCommand && e.keyCode === 13) {
					if (this.createIssue()) {
						remote.getCurrentWindow().close();
					}
				}

				prevKeyWasCommand = e.keyCode === 91 || e.keyCode === 93;
			};
		} else {
			document.onkeydown = (e: KeyboardEvent) => {
				if (e.ctrlKey && e.keyCode === 13) {
					if (this.createIssue()) {
						remote.getCurrentWindow().close();
					}
				}
			};
		}
	}

	private updatePreviewButtonState() {
		const submitButton = <HTMLButtonElement>document.getElementById('github-submit-btn');
		if (this.isPreviewEnabled()) {
			submitButton.disabled = false;
			submitButton.textContent = localize('previewOnGitHub', "Preview on GitHub");
		} else {
			submitButton.disabled = true;
			submitButton.textContent = localize('loadingData', "Loading data...");
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

	private search(): void {
		// Only search issues in VSCode for now.
		const fileOnExtension = this.issueReporterModel.getData().fileOnExtension;
		if (fileOnExtension) {
			this.clearSearchResults();
			return;
		}

		const title = (<HTMLInputElement>document.getElementById('issue-title')).value;
		const issueDescription = (<HTMLInputElement>document.getElementById('description')).value;
		if (title || issueDescription) {
			this.searchDuplicates(title, issueDescription);
		} else {
			this.clearSearchResults();
		}
	}

	private clearSearchResults(): void {
		const similarIssues = document.getElementById('similar-issues');
		similarIssues.innerHTML = '';
		this.numberOfSearchResultsDisplayed = 0;
	}

	@debounce(300)
	private searchDuplicates(title: string, body: string): void {
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
		const similarIssues = document.getElementById('similar-issues');
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
				}

				const item = $('div.issue', {}, issueState, link);
				issues.appendChild(item);
			}

			similarIssues.appendChild(issuesText);
			similarIssues.appendChild(issues);
		} else {
			const message = $('div.list-title');
			message.textContent = localize('noResults', "No results found");
			similarIssues.appendChild(message);
		}
	}

	private logSearchError(error: Error) {
		this.logService.warn('issueReporter#search ', error.message);
		/* __GDPR__
		"issueReporterSearchError" : {
				"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
			}
		*/
		this.telemetryService.publicLog('issueReporterSearchError', { message: error.message });
	}

	private setUpTypes(): void {
		const makeOption = (issueType: IssueType, description: string) => `<option value="${issueType.valueOf()}">${escape(description)}</option>`;

		const typeSelect = (<HTMLSelectElement>document.getElementById('issue-type'));
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
	}

	private renderBlocks(): void {
		// Depending on Issue Type, we render different blocks and text
		const { issueType, fileOnExtension } = this.issueReporterModel.getData();
		const blockContainer = document.getElementById('block-container');
		const systemBlock = document.querySelector('.block-system');
		const processBlock = document.querySelector('.block-process');
		const workspaceBlock = document.querySelector('.block-workspace');
		const extensionsBlock = document.querySelector('.block-extensions');
		const searchedExtensionsBlock = document.querySelector('.block-searchedExtensions');
		const settingsSearchResultsBlock = document.querySelector('.block-settingsSearchResults');

		const problemSource = document.getElementById('problem-source');
		const descriptionTitle = document.getElementById('issue-description-label');
		const descriptionSubtitle = document.getElementById('issue-description-subtitle');
		const extensionSelector = document.getElementById('extension-selection');

		// Hide all by default
		hide(blockContainer);
		hide(systemBlock);
		hide(processBlock);
		hide(workspaceBlock);
		hide(extensionsBlock);
		hide(searchedExtensionsBlock);
		hide(settingsSearchResultsBlock);
		hide(problemSource);

		if (issueType === IssueType.Bug) {
			show(blockContainer);
			show(systemBlock);
			show(problemSource);

			if (fileOnExtension) {
				hide(extensionsBlock);
				show(extensionSelector);
			} else {
				show(extensionsBlock);
				hide(extensionSelector);
			}

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('bugDescription', "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.PerformanceIssue) {
			show(blockContainer);
			show(systemBlock);
			show(processBlock);
			show(workspaceBlock);
			show(extensionsBlock);
			show(problemSource);

			if (fileOnExtension) {
				hide(extensionsBlock);
				show(extensionSelector);
			} else {
				show(extensionsBlock);
				hide(extensionSelector);
			}

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('performanceIssueDesciption', "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.FeatureRequest) {
			descriptionTitle.innerHTML = `${localize('description', "Description")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('featureRequestDescription', "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.SettingsSearchIssue) {
			show(blockContainer);
			show(searchedExtensionsBlock);
			show(settingsSearchResultsBlock);

			descriptionTitle.innerHTML = `${localize('expectedResults', "Expected Results")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('settingsSearchResultsDescription', "Please list the results that you were expecting to see when you searched with this query. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		}
	}

	private validateInput(inputId: string): boolean {
		const inputElement = (<HTMLInputElement>document.getElementById(inputId));
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
		['issue-title', 'description', 'issue-source', 'extension-selector'].forEach(elementId => {
			isValid = this.validateInput(elementId) && isValid;
		});

		return isValid;
	}

	private createIssue(): boolean {
		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
			const invalidInput = document.getElementsByClassName('invalid-input');
			if (invalidInput.length) {
				(<HTMLInputElement>invalidInput[0]).focus();
			}

			document.getElementById('issue-title').addEventListener('input', (event) => {
				this.validateInput('issue-title');
			});

			document.getElementById('description').addEventListener('input', (event) => {
				this.validateInput('description');
			});

			return false;
		}

		/* __GDPR__
			"issueReporterSubmit" : {
				"issueType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"numSimilarIssuesDisplayed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('issueReporterSubmit', { issueType: this.issueReporterModel.getData().issueType, numSimilarIssuesDisplayed: this.numberOfSearchResultsDisplayed });

		const baseUrl = this.getIssueUrlWithTitle((<HTMLInputElement>document.getElementById('issue-title')).value);
		const issueBody = this.issueReporterModel.serialize();
		let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;

		if (url.length > MAX_URL_LENGTH) {
			clipboard.writeText(issueBody);
			url = baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
		}

		shell.openExternal(url);
		return true;
	}

	private getIssueUrlWithTitle(issueTitle: string): string {
		let repositoryUrl = product.reportIssueUrl;
		if (this.issueReporterModel.getData().fileOnExtension) {
			const selectedExtension = this.issueReporterModel.getData().selectedExtension;
			const extensionUrl = selectedExtension && selectedExtension.manifest && selectedExtension.manifest.repository && selectedExtension.manifest.repository.url;
			if (extensionUrl) {
				// Remove '.git' suffix
				repositoryUrl = `${extensionUrl.indexOf('.git') !== -1 ? extensionUrl.substr(0, extensionUrl.length - 4) : extensionUrl}/issues/new/`;
			}
		}

		const queryStringPrefix = product.reportIssueUrl.indexOf('?') === -1 ? '?' : '&';
		return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
	}

	private updateSystemInfo = (state) => {
		const target = document.querySelector('.block-system .block-info');
		let tableHtml = '';
		Object.keys(state.systemInfo).forEach(k => {
			tableHtml += `
				<tr>
					<td>${k}</td>
					<td>${state.systemInfo[k]}</td>
				</tr>`;
		});
		target.innerHTML = `<table>${tableHtml}</table>`;
	}

	private updateExtensionSelector(extensions: ILocalExtension[]): void {
		const makeOption = (extension: ILocalExtension) => `<option value="${extension.identifier.id}">${escape(extension.manifest.displayName)}</option>`;
		const extensionsSelector = document.getElementById('extension-selector');
		extensionsSelector.innerHTML = '<option></option>' + extensions.map(makeOption).join('\n');

		this.addEventListener('extension-selector', 'change', (e: Event) => {
			const selectedExtensionId = (<HTMLInputElement>e.target).value;
			const extensions = this.issueReporterModel.getData().enabledNonThemeExtesions;
			const matches = extensions.filter(extension => extension.identifier.id === selectedExtensionId);
			if (matches.length) {
				this.issueReporterModel.update({ selectedExtension: matches[0] });
			}
		});
	}

	private updateProcessInfo = (state) => {
		const target = document.querySelector('.block-process .block-info');
		target.innerHTML = `<code>${state.processInfo}</code>`;
	}

	private updateWorkspaceInfo = (state) => {
		document.querySelector('.block-workspace .block-info code').textContent = '\n' + state.workspaceInfo;
	}

	private updateExtensionTable(extensions: ILocalExtension[], numThemeExtensions: number): void {
		const target = document.querySelector('.block-extensions .block-info');

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

	private updateSearchedExtensionTable(extensions: ILocalExtension[]): void {
		const target = document.querySelector('.block-searchedExtensions .block-info');

		if (!extensions.length) {
			target.innerHTML = 'Extensions: none';
			return;
		}

		const table = this.getExtensionTableHtml(extensions);
		target.innerHTML = `<table>${table}</table>`;
	}

	private getExtensionTableHtml(extensions: ILocalExtension[]): string {
		let table = `
			<tr>
				<th>Extension</th>
				<th>Author (truncated)</th>
				<th>Version</th>
			</tr>`;

		table += extensions.map(extension => {
			return `
				<tr>
					<td>${extension.manifest.name}</td>
					<td>${extension.manifest.publisher.substr(0, 3)}</td>
					<td>${extension.manifest.version}</td>
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

			/* __GDPR__
				"issueReporterViewSimilarIssue" : { }
			*/
			this.telemetryService.publicLog('issueReporterViewSimilarIssue');
		}
	}

	private addEventListener(elementId: string, eventType: string, handler: (event: Event) => void): void {
		const element = document.getElementById(elementId);
		if (element) {
			element.addEventListener(eventType, handler);
		} else {
			const error = new Error(`${elementId} not found.`);
			this.logService.error(error);
			/* __GDPR__
				"issueReporterAddEventListenerError" : {
						"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
					}
				*/
			this.telemetryService.publicLog('issueReporterAddEventListenerError', { message: error.message });
		}
	}
}

// helper functions

function hide(el) {
	el.classList.add('hidden');
}
function show(el) {
	el.classList.remove('hidden');
}
