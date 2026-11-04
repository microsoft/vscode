/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebEditorClient } from '@vscode/web-editors';
import { isTaskProgressMessage } from './taskProgressProtocol';

async function main(): Promise<void> {
	const mainElement = document.querySelector<HTMLElement>('main')!;
	const titleElement = document.getElementById('title')!;
	const labelElement = document.getElementById('summary')!;
	const progressElement = document.getElementById('progress')!;
	const client = await WebEditorClient.connect({ connection: 'windowParent' });
	let reportedHeight: number | undefined;
	const reportSize = () => {
		const height = Math.ceil(mainElement.getBoundingClientRect().height);
		if (height !== reportedHeight) {
			reportedHeight = height;
			client.reportSize(height);
		}
	};
	const observer = new ResizeObserver(reportSize);
	observer.observe(mainElement);
	const subscription = client.hostTransport?.onMessage(message => {
		if (!isTaskProgressMessage(message)) {
			return;
		}
		document.documentElement.lang = message.language;
		document.title = message.title;
		titleElement.textContent = message.title;
		labelElement.textContent = message.label;
		const maximum = Math.max(message.total, 1);
		progressElement.setAttribute('aria-valuemax', String(maximum));
		progressElement.setAttribute('aria-valuenow', String(message.checked));
		progressElement.setAttribute('aria-valuetext', message.label);
		progressElement.style.setProperty('--task-progress-ratio', String(message.checked / maximum));
		mainElement.hidden = false;
		reportSize();
	});
	client.hostTransport?.sendMessage({ type: 'ready' });
	window.addEventListener('pagehide', () => {
		subscription?.dispose();
		observer.disconnect();
		client.dispose();
	}, { once: true });
}

void main();
