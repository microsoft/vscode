/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const electron = require('electron');

let diagnosticInfo = { };

electron.ipcRenderer.on('issueInfoResponse', (event, arg) => {
	const { systemInfo, processInfo, workspaceInfo } = arg;

	document.querySelector('.block-system .block-info code').textContent = '\n' + systemInfo;
	document.querySelector('.block-process .block-info code').textContent = '\n' + processInfo;
	document.querySelector('.block-workspace .block-info code').textContent = '\n' + workspaceInfo;

	diagnosticInfo = {
		systemInfo,
		processInfo,
		workspaceInfo
	};
});

electron.ipcRenderer.send('issueInfoRequest');

setInterval(() => {
	electron.ipcRenderer.send('issueInfoRequest');
}, 1000);

window.renderExtensionsInfo = () => {
	electron.ipcRenderer.on('extensionInfoResponse', (event, arg) => {
		document.querySelector('.block-extensions .block-info-table').textContent = arg;
	});
	electron.ipcRenderer.send('extensionInfoRequest');
};

window.submit = () => {
	const baseUrl = 'https://github.com/microsoft/vscode/issues/new?body=';
	const reproSteps = document.querySelector('.block-repro .block-info-text textarea').value;

	const issueBody = `### System Info
\`\`\`
${diagnosticInfo.systemInfo}
\`\`\`

### Process Info
\`\`\`
${diagnosticInfo.processInfo}
\`\`\`

### Workspace Info
\`\`\`
${diagnosticInfo.workspaceInfo};
\`\`\`

### Repro Steps

${reproSteps}
`;

	electron.shell.openExternal(baseUrl + encodeURIComponent(issueBody));
};