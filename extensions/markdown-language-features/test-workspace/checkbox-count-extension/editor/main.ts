/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebEditorClient } from '../node_modules/@vscode/web-editors/dist/index.js';

interface TaskProgressMessage {
	readonly type: 'taskProgress';
	readonly checked: number;
	readonly total: number;
}

const mainElement = getElement<HTMLElement>('main');
const progressElement = getElement<HTMLElement>('#progress');
const progressLabelElement = getElement<HTMLElement>('#progress-label');
const client = await WebEditorClient.connect({ connection: 'windowParent' });
let reportedHeight: number | undefined;
let progressMessageVersion = 0;

const reportSize = () => {
	const mainHeight = Math.ceil(mainElement.getBoundingClientRect().height);
	if (mainHeight === reportedHeight) {
		return;
	}
	reportedHeight = mainHeight;
	console.log('[checkbox-count] reporting iframe size', {
		height: mainHeight,
		documentScrollHeight: document.documentElement.scrollHeight,
		bodyScrollHeight: document.body.scrollHeight,
		mainHeight: mainElement.getBoundingClientRect().height,
	});
	client.reportSize(mainHeight);
};
const resizeObserver = new ResizeObserver(reportSize);
resizeObserver.observe(mainElement);
requestAnimationFrame(reportSize);

if (!client.hostTransport) {
	progressLabelElement.textContent = 'Host transport unavailable';
} else {
	client.hostTransport.onMessage(async message => {
		if (!isTaskProgressMessage(message)) {
			return;
		}
		const messageVersion = ++progressMessageVersion;
		const { formatTaskProgressLabel } = await import('./formatCheckboxLabel.js');
		if (messageVersion !== progressMessageVersion) {
			return;
		}
		const progressMaximum = Math.max(message.total, 1);
		progressElement.setAttribute('aria-valuemax', progressMaximum);
		progressElement.setAttribute('aria-valuenow', message.checked);
		progressElement.style.setProperty('--task-progress-ratio', message.checked / progressMaximum);
		progressLabelElement.textContent = formatTaskProgressLabel(message.checked, message.total);
		reportSize();
	});
	client.hostTransport.sendMessage({ type: 'ready' });
}

window.addEventListener('beforeunload', () => {
	resizeObserver.disconnect();
	client.dispose();
}, { once: true });

function getElement<T extends Element>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (!element) {
		throw new Error(`Missing required element: ${selector}`);
	}
	return element;
}

function isTaskProgressMessage(message: unknown): message is TaskProgressMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'type' in message
		&& message.type === 'taskProgress'
		&& 'checked' in message
		&& typeof message.checked === 'number'
		&& Number.isInteger(message.checked)
		&& 'total' in message
		&& typeof message.total === 'number'
		&& Number.isInteger(message.total)
		&& message.checked >= 0
		&& message.total >= 0
		&& message.checked <= message.total;
}
