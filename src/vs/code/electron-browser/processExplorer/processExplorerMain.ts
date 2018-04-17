/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/processExplorer';
import { listProcesses, ProcessItem } from 'vs/base/node/ps';
import { remote, webFrame } from 'electron';
import { repeat } from 'vs/base/common/strings';
import { totalmem } from 'os';
import product from 'vs/platform/node/product';
import { localize } from 'vs/nls';
import { ProcessExplorerData, ProcessExplorerStyles } from '../../../platform/issue/common/issue';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';

let processList: any[];

function getProcessList(rootProcess: ProcessItem) {
	const processes: any[] = [];

	if (rootProcess) {
		getProcessItem(processes, rootProcess, 0);
	}

	return processes;
}

function getProcessItem(processes: any[], item: ProcessItem, indent: number): void {
	const isRoot = (indent === 0);

	const MB = 1024 * 1024;

	// Format name with indent
	const name = isRoot ? `${product.applicationName} main` : item.name;
	const formattedName = isRoot ? name : `${repeat('    ', indent)} ${name}`;
	const memory = process.platform === 'win32' ? item.mem : (totalmem() * (item.mem / 100));
	processes.push({
		cpu: Number(item.load.toFixed(0)),
		memory: Number((memory / MB).toFixed(0)),
		pid: Number((item.pid).toFixed(0)),
		name,
		formattedName,
		cmd: item.cmd
	});

	// Recurse into children if any
	if (Array.isArray(item.children)) {
		item.children.forEach(child => getProcessItem(processes, child, indent + 1));
	}
}

function getProcessIdWithHighestProperty(processList, propertyName: string) {
	let max = 0;
	let maxProcessId;
	processList.forEach(process => {
		if (process[propertyName] > max) {
			max = process[propertyName];
			maxProcessId = process.pid;
		}
	});

	return maxProcessId;
}

function updateProcessInfo(processList): void {
	const target = document.getElementById('process-list');
	const highestCPUProcess = getProcessIdWithHighestProperty(processList, 'cpu');
	const highestMemoryProcess = getProcessIdWithHighestProperty(processList, 'memory');

	let tableHtml = `
		<tr>
			<th class="cpu">${localize('cpu', "CPU %")}</th>
			<th class="memory">${localize('memory', "Memory (MB)")}</th>
			<th class="pid">${localize('pid', "pid")}</th>
			<th>${localize('name', "Name")}</th>
		</tr>`;

	processList.forEach(p => {
		const cpuClass = p.pid === highestCPUProcess ? 'highest' : '';
		const memoryClass = p.pid === highestMemoryProcess ? 'highest' : '';

		tableHtml += `
			<tr id=${p.pid}>
				<td class="centered ${cpuClass}">${p.cpu}</td>
				<td class="centered ${memoryClass}">${p.memory}</td>
				<td class="centered">${p.pid}</td>
				<td title="${p.name}" class="data">${p.formattedName}</td>
			</tr>`;
	});

	target.innerHTML = `<table>${tableHtml}</table>`;
}

function applyStyles(styles: ProcessExplorerStyles): void {
	const styleTag = document.createElement('style');
	const content: string[] = [];

	if (styles.hoverBackground) {
		content.push(`tbody > tr:hover  { background-color: ${styles.hoverBackground}; }`);
	}

	if (styles.hoverForeground) {
		content.push(`tbody > tr:hover{ color: ${styles.hoverForeground}; }`);
	}

	if (styles.highlightForeground) {
		content.push(`.highest { color: ${styles.highlightForeground}; }`);
	}

	styleTag.innerHTML = content.join('\n');
	document.head.appendChild(styleTag);
	document.body.style.color = styles.color;
}

function applyZoom(zoomLevel: number): void {
	webFrame.setZoomLevel(zoomLevel);
	browser.setZoomFactor(webFrame.getZoomFactor());
	// See https://github.com/Microsoft/vscode/issues/26151
	// Cannot be trusted because the webFrame might take some time
	// until it really applies the new zoom level
	browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
}

function showContextMenu(e) {
	e.preventDefault();

	const pid = parseInt(e.currentTarget.id);
	if (pid && typeof pid === 'number') {
		const menu = new remote.Menu();
		menu.append(new remote.MenuItem({
			label: localize('killProcess', "Kill Process"),
			click() {
				process.kill(pid, 'SIGTERM');
			}
		})
		);

		menu.append(new remote.MenuItem({
			label: localize('forceKillProcess', "Force Kill Process"),
			click() {
				process.kill(pid, 'SIGKILL');
			}
		})
		);

		menu.popup({ window: remote.getCurrentWindow() });
	}
}

export function startup(data: ProcessExplorerData): void {
	applyStyles(data.styles);
	applyZoom(data.zoomLevel);

	setInterval(() => listProcesses(remote.process.pid).then(processes => {
		processList = getProcessList(processes);
		updateProcessInfo(processList);

		const tableRows = document.getElementsByTagName('tr');
		for (let i = 0; i < tableRows.length; i++) {
			const tableRow = tableRows[i];
			tableRow.addEventListener('click', (e) => {
				showContextMenu(e);
			});
		}
	}), 1200);


	document.onkeydown = (e: KeyboardEvent) => {
		const cmdOrCtrlKey = platform.isMacintosh ? e.metaKey : e.ctrlKey;

		// Cmd/Ctrl + zooms in
		if (cmdOrCtrlKey && e.keyCode === 187) {
			applyZoom(webFrame.getZoomLevel() + 1);
		}

		// Cmd/Ctrl - zooms out
		if (cmdOrCtrlKey && e.keyCode === 189) {
			applyZoom(webFrame.getZoomLevel() - 1);
		}
	};
}