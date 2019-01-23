/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/processExplorer';
import { listProcesses, ProcessItem } from 'vs/base/node/ps';
import { webFrame, ipcRenderer, clipboard } from 'electron';
import { repeat } from 'vs/base/common/strings';
import { totalmem } from 'os';
import product from 'vs/platform/node/product';
import { localize } from 'vs/nls';
import { ProcessExplorerStyles, ProcessExplorerData } from 'vs/platform/issue/common/issue';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { IContextMenuItem } from 'vs/base/parts/contextmenu/common/contextmenu';
import { popup } from 'vs/base/parts/contextmenu/electron-browser/contextmenu';

let processList: any[];
let mapPidToWindowTitle = new Map<number, string>();

const DEBUG_FLAGS_PATTERN = /\s--(inspect|debug)(-brk|port)?=(\d+)?/;
const DEBUG_PORT_PATTERN = /\s--(inspect|debug)-port=(\d+)/;

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

	let name = item.name;
	if (isRoot) {
		name = `${product.applicationName} main`;
	}

	if (name === 'window') {
		const windowTitle = mapPidToWindowTitle.get(item.pid);
		name = windowTitle !== undefined ? `${name} (${mapPidToWindowTitle.get(item.pid)})` : name;
	}

	// Format name with indent
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

function isDebuggable(cmd: string): boolean {
	const matches = DEBUG_FLAGS_PATTERN.exec(cmd);
	return (matches && matches.length >= 2) || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
}

function attachTo(item: ProcessItem) {
	const config: any = {
		type: 'node',
		request: 'attach',
		name: `process ${item.pid}`
	};

	let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
	if (matches && matches.length >= 2) {
		// attach via port
		if (matches.length === 4 && matches[3]) {
			config.port = parseInt(matches[3]);
		}
		config.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
	} else {
		// no port -> try to attach via pid (send SIGUSR1)
		config.processId = String(item.pid);
	}

	// a debug-port=n or inspect-port=n overrides the port
	matches = DEBUG_PORT_PATTERN.exec(item.cmd);
	if (matches && matches.length === 3) {
		// override port
		config.port = parseInt(matches[2]);
	}

	ipcRenderer.send('vscode:workbenchCommand', { id: 'debug.startFromConfig', from: 'processExplorer', args: [config] });
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
	if (!target) {
		return;
	}

	const highestCPUProcess = getProcessIdWithHighestProperty(processList, 'cpu');
	const highestMemoryProcess = getProcessIdWithHighestProperty(processList, 'memory');

	let tableHtml = `
		<thead>
			<tr>
				<th scope="col" class="cpu">${localize('cpu', "CPU %")}</th>
				<th scope="col" class="memory">${localize('memory', "Memory (MB)")}</th>
				<th scope="col" class="pid">${localize('pid', "pid")}</th>
				<th scope="col" class="nameLabel">${localize('name', "Name")}</th>
			</tr>
		</thead>`;

	tableHtml += `<tbody>`;

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

	tableHtml += `</tbody>`;

	target.innerHTML = tableHtml;
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
	if (document.head) {
		document.head.appendChild(styleTag);
	}
	if (styles.color) {
		document.body.style.color = styles.color;
	}
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

	const items: IContextMenuItem[] = [];

	const pid = parseInt(e.currentTarget.id);
	if (pid && typeof pid === 'number') {
		items.push({
			label: localize('killProcess', "Kill Process"),
			click() {
				process.kill(pid, 'SIGTERM');
			}
		});

		items.push({
			label: localize('forceKillProcess', "Force Kill Process"),
			click() {
				process.kill(pid, 'SIGKILL');
			}
		});

		items.push({
			type: 'separator'
		});

		items.push({
			label: localize('copy', "Copy"),
			click() {
				const row = document.getElementById(pid.toString());
				if (row) {
					clipboard.writeText(row.innerText);
				}
			}
		});

		items.push({
			label: localize('copyAll', "Copy All"),
			click() {
				const processList = document.getElementById('process-list');
				if (processList) {
					clipboard.writeText(processList.innerText);
				}
			}
		});

		const item = processList.filter(process => process.pid === pid)[0];
		if (item && isDebuggable(item.cmd)) {
			items.push({
				type: 'separator'
			});

			items.push({
				label: localize('debug', "Debug"),
				click() {
					attachTo(item);
				}
			});
		}
	} else {
		items.push({
			label: localize('copyAll', "Copy All"),
			click() {
				const processList = document.getElementById('process-list');
				if (processList) {
					clipboard.writeText(processList.innerText);
				}
			}
		});
	}

	popup(items);
}

export function startup(data: ProcessExplorerData): void {
	applyStyles(data.styles);
	applyZoom(data.zoomLevel);

	// Map window process pids to titles, annotate process names with this when rendering to distinguish between them
	ipcRenderer.on('vscode:windowsInfoResponse', (event, windows) => {
		mapPidToWindowTitle = new Map<number, string>();
		windows.forEach(window => mapPidToWindowTitle.set(window.pid, window.title));
	});

	setInterval(() => {
		ipcRenderer.send('windowsInfoRequest');

		listProcesses(data.pid).then(processes => {
			processList = getProcessList(processes);
			updateProcessInfo(processList);

			const tableRows = document.getElementsByTagName('tr');
			for (let i = 0; i < tableRows.length; i++) {
				const tableRow = tableRows[i];
				tableRow.addEventListener('contextmenu', (e) => {
					showContextMenu(e);
				});
			}
		});
	}, 1200);


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
