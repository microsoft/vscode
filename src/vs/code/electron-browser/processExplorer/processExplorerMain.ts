/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/processExplorer';
import { listProcesses, ProcessItem } from 'vs/base/node/ps';
import { remote } from 'electron';
import { repeat } from 'vs/base/common/strings';
import { totalmem } from 'os';
import product from 'vs/platform/node/product';
import { localize } from 'vs/nls';

let selectedProcess: number;
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
			<th>${localize('cpu', "CPU %")}</th>
			<th>${localize('memory', "Memory (MB)")}</th>
			<th>${localize('pid', "pid")}</th>
			<th>${localize('name', "Name")}</th>
		</tr>`;

	processList.forEach(p => {
		const classList = selectedProcess === p.pid ? 'selected' : '';
		const cpuClass = p.pid === highestCPUProcess ? 'highest' : '';
		const memoryClass = p.pid === highestMemoryProcess ? 'highest' : '';

		tableHtml += `
			<tr class="${classList}">
				<td class="centered ${cpuClass}">${p.cpu}</td>
				<td class="centered ${memoryClass}">${p.memory}</td>
				<td class="centered">${p.pid}</td>
				<td title="${p.name}" class="data">${p.formattedName}</td>
			</tr>`;
	});

	target.innerHTML = `<table>${tableHtml}</table>`;
}

export function startup() {

	setInterval(() => listProcesses(remote.process.pid).then(processes => {
		processList = getProcessList(processes);
		updateProcessInfo(processList);

		const tableRows = document.getElementsByTagName('tr');
		for (let i = 0; i < tableRows.length; i++) {
			const tableRow = tableRows[i];
			tableRow.addEventListener('click', () => {
				const selected = document.getElementsByClassName('selected');
				if (selected.length) {
					selected[0].classList.remove('selected');
				}

				const pid = parseInt(tableRow.children[2].textContent);
				selectedProcess = pid;
				tableRow.classList.add('selected');
			});
		}
	}), 1000);
}