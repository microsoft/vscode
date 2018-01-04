/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { $ } from 'vs/base/browser/dom';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { IssueChannelClient } from 'vs/platform/issue/common/issueIpc';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';

interface IssueReporterState {
	issueType?: number;
	versionInfo?: any;
	systemInfo?: any;
	processInfo?: any;
	workspaceInfo?: any;
	includeSystemInfo?: boolean;
	includeWorkspaceInfo?: boolean;
	includeProcessInfo?: boolean;
}

export function startup(configuration: IWindowConfiguration) {
	const issueReporter = new IssueReporter(configuration);
	issueReporter.render();
}

export class IssueReporter {
	private issueService: IIssueService;
	private state: IssueReporterState;

	constructor(configuration: IWindowConfiguration) {
		this.state = {
			issueType: 0,
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true
		};

		this.initServices(configuration);
		this.setEventHandlers();

		// Fetch and display status data
		this.issueService.getStatusInfo().then((info) => {
			const { versionInfo, systemInfo, processInfo, workspaceInfo } = info;
			this.state.versionInfo = versionInfo;
			this.state.systemInfo = systemInfo;
			this.state.processInfo = processInfo;
			this.state.workspaceInfo = workspaceInfo;

			updateAllBlocks(this.state);

			const submitButton = <HTMLButtonElement>document.getElementById('github-submit-btn');
			submitButton.disabled = false;
			submitButton.textContent = 'Preview on GitHub';
		});
	}

	initServices(configuration: IWindowConfiguration) {
		const mainProcessClient = new ElectronIPCClient(String(`window${configuration.windowId}`));
		this.issueService = new IssueChannelClient(mainProcessClient.getChannel('issue'));
	}

	setEventHandlers() {
		document.getElementById('issue-type').addEventListener('change', (event: Event) => {
			this.state.issueType = parseInt((<HTMLInputElement>event.target).value);
			this.render();
		});

		document.getElementById('includeSystemInfo').addEventListener('click', (event: Event) => {
			this.state.includeSystemInfo = !this.state.includeSystemInfo;
		});

		document.getElementById('includeProcessInfo').addEventListener('click', (event: Event) => {
			this.state.includeProcessInfo = !this.state.includeProcessInfo;
		});

		document.getElementById('includeWorkspaceInfo').addEventListener('click', (event: Event) => {
			this.state.includeWorkspaceInfo = !this.state.includeWorkspaceInfo;
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
							let issues = document.createElement('ul');
							issues.id = 'issues-list';
							addIssuesToList(issues, result.items);
							similarIssues.appendChild(issues);
						}
					}).catch((error) => {
						console.log(error);
					});
				}).catch((error) => {
					console.log(error);
				});
			}
		});

		document.getElementById('github-submit-btn').addEventListener('click', () => this.createIssue());
	}

	render() {
		this.renderIssueType();
		this.renderBlocks();
	}

	renderIssueType() {
		const { issueType } = this.state;
		const issueTypes = document.getElementById('issue-type').children;
		issueTypes[0].className = issueType === 0 ? 'active' : '';
		issueTypes[1].className = issueType === 1 ? 'active' : '';
		issueTypes[2].className = issueType === 2 ? 'active' : '';
	}

	renderBlocks() {
		// Depending on Issue Type, we render different blocks and text
		const { issueType } = this.state;
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

			descriptionTitle.innerHTML = 'Steps to reproduce <span class="required-input">*</span>';
			show(descriptionSubtitle);
			descriptionSubtitle.innerHTML = 'Please explain how to reproduce the problem. What was expected and what actually happened?';
		}
		// 2 - Perf Issue
		else if (issueType === 1) {
			show(systemBlock);
			show(processBlock);
			show(workspaceBlock);

			descriptionTitle.innerHTML = 'Steps to reproduce <span class="required-input">*</span>';
			show(descriptionSubtitle);
			descriptionSubtitle.innerHTML = 'When does the performance issue occur?';
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

	private validateInputs() {
		let hasErrors = false;

		const issueTitle = (<HTMLInputElement>document.getElementById('issue-title')).value;
		if (!issueTitle) {
			hasErrors = true;
			show(document.getElementsByClassName('validation-error')[0]);
			document.getElementById('issue-title').classList.add('invalid-input');
		}

		const description = (<HTMLInputElement>document.querySelector('.block-description .block-info-text textarea')).value;
		if (!description) {
			hasErrors = true;
			show(document.getElementsByClassName('validation-error')[1]);
			document.getElementById('description').classList.add('invalid-input');
		}

		return !hasErrors;
	}

	private getIssueTypeTitle() {
		if (this.state.issueType === 0) {
			return 'Bug';
		} else if (this.state.issueType === 1) {
			return 'Performance Issue\n';
		} else {
			return 'Feature Request';
		}
	}

	private createIssue() {
		if (!this.validateInputs()) {
			(<HTMLInputElement>document.getElementsByClassName('invalid-input')[0]).focus();
			return;
		}

		document.getElementById('github-submit-btn').classList.add('active');
		const issueTitle = (<HTMLInputElement>document.getElementById('issue-title')).value;
		const baseUrl = `https://github.com/microsoft/vscode/issues/new?title=${issueTitle}&body=`;
		const description = (<HTMLInputElement>document.querySelector('.block-description .block-info-text textarea')).value;

		let issueBody = '';

		issueBody += `
### Issue Type
${this.getIssueTypeTitle()}

### Description

${description}

### VS Code Info

VS Code version: ${this.state.versionInfo.vscodeVersion}
OS version: ${this.state.versionInfo.os}

${this.getInfos()}

<!-- Generated by VS Code Issue Helper -->
`;

		document.getElementById('github-submit-btn').classList.remove('active');
		shell.openExternal(baseUrl + encodeURIComponent(issueBody));
	}

	private getInfos() {
		let info = '';

		if (this.state.includeSystemInfo) {
			info += this.generateSystemInfoMd();
		}

		// For perf issue, add process info and workspace info too
		if (this.state.issueType === 1) {

			if (this.state.includeProcessInfo) {
				info += this.generateProcessInfoMd();
			}

			if (this.state.includeWorkspaceInfo) {
				info += this.generateWorkspaceInfoMd();
			}
		}

		return info;
	}

	private generateSystemInfoMd() {
		let md = `<details>
<summary>System Info</summary>

|Item|Value|
|---|---|
`;

		Object.keys(this.state.systemInfo).forEach(k => {
			md += `|${k}|${this.state.systemInfo[k]}|\n`;
		});

		md += '\n</details>';

		return md;
	}

	private generateProcessInfoMd() {
		let md = `<details>
<summary>Process Info</summary>

|pid|CPU|Memory (MB)|Name|
|---|---|---|---|
`;

		this.state.processInfo.forEach(p => {
			md += `|${p.pid}|${p.cpu}|${p.memory}|${p.name}|\n`;
		});

		md += '\n</details>';

		return md;
	}

	private generateWorkspaceInfoMd() {
		return `<details>
<summary>Workspace Info</summary>

\`\`\`
${this.state.workspaceInfo};
\`\`\`

</details>
`;
	}
}

/**
 * Update blocks
 */

function updateAllBlocks(state) {
	updateVersionInfo(state);
	updateSystemInfo(state);
	updateProcessInfo(state);
	updateWorkspaceInfo(state);
}

const updateVersionInfo = (state: IssueReporterState) => {
	const version = document.getElementById('vscode-version');
	(<HTMLInputElement>version).value = state.versionInfo.vscodeVersion;

	const osversion = document.getElementById('os');
	(<HTMLInputElement>osversion).value = state.versionInfo.os;
};

const updateSystemInfo = (state) => {
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
};
const updateProcessInfo = (state) => {
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
};

const updateWorkspaceInfo = (state) => {
	document.querySelector('.block-workspace .block-info code').textContent = '\n' + state.workspaceInfo;
};

// helper functions

function hide(el) {
	el.classList.add('hidden');
}
function show(el) {
	el.classList.remove('hidden');
}
