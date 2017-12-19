/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const electron = require('electron');

const state = {

};

// const render = (state) => {

// };

// const rendererBlocks = (state) => {

// };

electron.ipcRenderer.on('issueInfoResponse', (event, arg) => {
	const { systemInfo, processInfo, workspaceInfo } = arg;
	state.systemInfo = systemInfo;
	state.processInfo = processInfo;
	state.workspaceInfo = workspaceInfo;

	updateAllBlocks(state);
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
${state.systemInfo}
\`\`\`

### Process Info
\`\`\`
${state.processInfo}
\`\`\`

### Workspace Info
\`\`\`
${state.workspaceInfo};
\`\`\`

### Repro Steps

${reproSteps}
`;

	electron.shell.openExternal(baseUrl + encodeURIComponent(issueBody));
};

function updateAllBlocks(state) {
	updateSystemInfo(state);
	updateProcessInfo(state);
	updateWorkspaceInfo(state);
}

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
