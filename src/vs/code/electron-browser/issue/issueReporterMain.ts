/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/issueReporter';
import { shell, ipcRenderer, webFrame } from 'electron';
import { $ } from 'vs/base/browser/dom';
import * as browser from 'vs/base/browser/browser';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
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
import { IssueReporterModel, IssueReporterData } from 'vs/code/electron-browser/issue/issueReporterModel';
import { IssueReporterStyles } from 'vs/platform/issue/common/issue';

export function startup(configuration: IWindowConfiguration) {
	const issueReporter = new IssueReporter(configuration);
	issueReporter.render();
}

export class IssueReporter extends Disposable {
	private environmentService: IEnvironmentService;
	private telemetryService: ITelemetryService;
	private issueReporterModel: IssueReporterModel;

	constructor(configuration: IWindowConfiguration) {
		super();

		this.issueReporterModel = new IssueReporterModel({
			issueType: 0,
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true
		});

		ipcRenderer.on('issueStyleResponse', (event, styles: IssueReporterStyles) => {
			this.applyZoom(styles.zoomLevel);
			this.applyStyles(styles);
		});

		ipcRenderer.on('issueInfoResponse', (event, info) => {
			this.issueReporterModel.update(info);

			this.updateAllBlocks(this.issueReporterModel.getData());

			const submitButton = <HTMLButtonElement>document.getElementById('github-submit-btn');
			submitButton.disabled = false;
			submitButton.textContent = 'Preview on GitHub';
		});

		ipcRenderer.send('issueInfoRequest');
		ipcRenderer.send('issueStyleRequest');

		this.initServices(configuration);
		this.setEventHandlers();
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
			content.push(`input, textarea, select { background-color: ${styles.inputBackground}; }`);
		}

		if (styles.inputBorder) {
			content.push(`input, textarea, select { border: 1px solid ${styles.inputBorder}; }`);
		} else {
			content.push(`input, textarea, select { border: 1px solid transparent; }`);
		}

		if (styles.inputForeground) {
			content.push(`input, textarea, select { color: ${styles.inputForeground}; }`);
		}

		if (styles.inputErrorBorder) {
			content.push(`.invalid-input, .invalid-input:focus { border: 1px solid ${styles.inputErrorBorder}; }`);
		}

		if (styles.inputActiveBorder) {
			content.push(`input[type='text']:focus, textarea:focus, select:focus, summary:focus  { border: 1px solid ${styles.inputActiveBorder}; outline-style: none; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a { color: ${styles.textLinkColor}; }`);
		}

		if (styles.buttonBackground) {
			content.push(`button { background-color: ${styles.buttonBackground}; }`);
		}

		if (styles.buttonForeground) {
			content.push(`button { color: ${styles.buttonForeground}; }`);
		}

		if (styles.buttonHoverBackground) {
			content.push(`button:hover:enabled { background-color: ${styles.buttonHoverBackground}; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a { color: ${styles.textLinkColor}; }`);
		}

		styleTag.innerHTML = content.join('\n');
		document.head.appendChild(styleTag);

		document.body.style.backgroundColor = styles.backgroundColor;
		document.body.style.color = styles.color;
	}

	private initServices(configuration: IWindowConfiguration): void {
		const serviceCollection = new ServiceCollection();
		const mainProcessClient = new ElectronIPCClient(String(`window${configuration.windowId}`));

		const windowsChannel = mainProcessClient.getChannel('windows');
		serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));
		this.environmentService = new EnvironmentService(configuration, configuration.execPath);

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
		document.getElementById('issue-type').addEventListener('change', (event: Event) => {
			this.issueReporterModel.update({ issueType: parseInt((<HTMLInputElement>event.target).value) });
			this.render();
		});

		document.getElementById('includeSystemInfo').addEventListener('click', (event: Event) => {
			event.stopPropagation();
			this.issueReporterModel.update({ includeSystemInfo: !this.issueReporterModel.getData().includeSystemInfo });
		});

		document.getElementById('includeProcessInfo').addEventListener('click', (event: Event) => {
			event.stopPropagation();
			this.issueReporterModel.update({ includeProcessInfo: !this.issueReporterModel.getData().includeSystemInfo });
		});

		document.getElementById('includeWorkspaceInfo').addEventListener('click', (event: Event) => {
			event.stopPropagation();
			this.issueReporterModel.update({ includeWorkspaceInfo: !this.issueReporterModel.getData().includeWorkspaceInfo });
		});

		document.getElementById('description').addEventListener('blur', (event: Event) => {
			this.issueReporterModel.update({ issueDescription: (<HTMLInputElement>event.target).value });
		});

		function addIssuesToList(list, issueJSON) {
			for (let i = 0; i < 5; i++) {
				const link = $('a', { href: issueJSON[i].html_url });
				link.textContent = issueJSON[i].title;
				link.addEventListener('click', (event) => {
					shell.openExternal((<HTMLAnchorElement>event.target).href);
				});

				const item = $('li', {}, link);
				list.appendChild(item);
			}
		}

		document.getElementById('issue-title').addEventListener('blur', (event) => {
			const title = (<HTMLInputElement>event.target).value;
			const similarIssues = document.getElementById('similar-issues');
			similarIssues.innerHTML = '';

			if (title) {
				const query = `is:issue+repo:microsoft/vscode+${title}`;
				window.fetch(`https://api.github.com/search/issues?q=${query}&per_page=5`).then((response) => {
					response.json().then(result => {
						if (result.items.length) {
							const issues = $('ul');
							const issuesText = $('div.list-title');
							issuesText.textContent = 'Similar issues:';
							addIssuesToList(issues, result.items);
							similarIssues.appendChild(issuesText);
							similarIssues.appendChild(issues);
						}
					});
				}).catch((error) => {
					console.log(error);
				});
			}
		});

		document.getElementById('github-submit-btn').addEventListener('click', () => this.createIssue());
	}

	private renderBlocks(): void {
		// Depending on Issue Type, we render different blocks and text
		const { issueType } = this.issueReporterModel.getData();
		const systemBlock = document.querySelector('.block-system');
		const processBlock = document.querySelector('.block-process');
		const workspaceBlock = document.querySelector('.block-workspace');

		const descriptionTitle = document.querySelector('.block-description .block-title');
		const descriptionSubtitle = document.querySelector('.block-description .block-subtitle');

		// 1 - Bug
		if (issueType === 0) {
			show(systemBlock);
			hide(processBlock);
			hide(workspaceBlock);

			descriptionTitle.innerHTML = 'Steps to Reproduce <span class="required-input">*</span>';
			show(descriptionSubtitle);
			descriptionSubtitle.innerHTML = 'How did you encounter this problem? Please provide clear steps to reproduce the problem during our investigation. What did you expect to happen and what actually did happen?';
		}
		// 2 - Perf Issue
		else if (issueType === 1) {
			show(systemBlock);
			show(processBlock);
			show(workspaceBlock);

			descriptionTitle.innerHTML = 'Steps to Reproduce <span class="required-input">*</span>';
			show(descriptionSubtitle);
			descriptionSubtitle.innerHTML = 'When did this performance issue happen? For example, does it occur on startup or after a specific series of actions? Any details you can provide help our investigation.';
		}
		// 3 - Feature Request
		else {
			hide(systemBlock);
			hide(processBlock);
			hide(workspaceBlock);

			descriptionTitle.innerHTML = 'Description <span class="required-input">*</span>';
			hide(descriptionSubtitle);
		}
	}

	private validateInput(inputId: string): boolean {
		const inputElement = (<HTMLInputElement>document.getElementById(inputId));
		if (!inputElement.value) {
			show(document.getElementById(`${inputId}-validation-error`));
			inputElement.classList.add('invalid-input');
			return false;
		} else {
			hide(document.getElementById(`${inputId}-validation-error`));
			inputElement.classList.remove('invalid-input');
			return true;
		}
	}

	private validateInputs(): boolean {
		let isValid = true;
		['issue-title', 'description'].forEach(elementId => {
			isValid = this.validateInput(elementId) && isValid;

		});

		return isValid;
	}

	private createIssue(): void {
		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
			(<HTMLInputElement>document.getElementsByClassName('invalid-input')[0]).focus();

			document.getElementById('issue-title').addEventListener('input', (event) => {
				this.validateInput('issue-title');
			});

			document.getElementById('description').addEventListener('input', (event) => {
				this.validateInput('description');
			});
			return;
		}

		if (this.telemetryService) {
			/* __GDPR__
				"issueReporterSubmit" : {
					"issueType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('issueReporterSubmit', { issueType: this.issueReporterModel.getData().issueType });
		}

		const issueTitle = (<HTMLInputElement>document.getElementById('issue-title')).value;
		const baseUrl = `https://github.com/microsoft/vscode/issues/new?title=${issueTitle}&body=`;
		const issueBody = this.issueReporterModel.serialize();
		shell.openExternal(baseUrl + encodeURIComponent(issueBody));
	}

	/**
	 * Update blocks
	 */

	private updateAllBlocks(state) {
		this.updateVersionInfo(state);
		this.updateSystemInfo(state);
		this.updateProcessInfo(state);
		this.updateWorkspaceInfo(state);
	}

	private updateVersionInfo = (state: IssueReporterData) => {
		const version = document.getElementById('vscode-version');
		(<HTMLInputElement>version).value = state.versionInfo.vscodeVersion;

		const osversion = document.getElementById('os');
		(<HTMLInputElement>osversion).value = state.versionInfo.os;
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

	private updateProcessInfo = (state) => {
		const target = document.querySelector('.block-process .block-info');

		let tableHtml = `
<tr>
	<th>pid</th>
	<th>CPU %</th>
	<th>Memory (MB)</th>
	<th>Name</th>
</tr>
`;
		state.processInfo.forEach(p => {
			tableHtml += `
<tr>
	<td>${p.pid}</td>
	<td>${p.cpu}</td>
	<td>${p.memory}</td>
	<td>${p.name}</td>
</tr>`;
		});
		target.innerHTML = `<table>${tableHtml}</table>`;
	}

	private updateWorkspaceInfo = (state) => {
		document.querySelector('.block-workspace .block-info code').textContent = '\n' + state.workspaceInfo;
	}
}

// helper functions

function hide(el) {
	el.classList.add('hidden');
}
function show(el) {
	el.classList.remove('hidden');
}
