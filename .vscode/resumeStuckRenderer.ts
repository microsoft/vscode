/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Temporary workaround for microsoft/vscode-js-debug#2401.
//
// A web worker can finish evaluating before js-debug registers its CDP session, so
// `Inspector.workerScriptLoaded` arrives for an unknown session and js-debug throws. The throw
// escapes `EventEmitter.fire`, which leaves its delivery queue populated and permanently stops
// the CDP message pump, so `Runtime.runIfWaitingForDebugger` is never sent and the renderer
// stays paused at startup: the window paints but accepts no input.
//
// This polls the renderer (port 9222, matching "Launch VS Code Internal") and resumes it if its
// event loop never turns. Remove this once microsoft/vscode-js-debug#2402 ships in the js-debug
// bundled with VS Code.

const targetListUrl = 'http://127.0.0.1:9222/json/list';
const gracePeriodMs = 8000;
const stuckTimeoutMs = 2000;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function getPageTargets() {
	const response = await fetch(targetListUrl);
	return (await response.json()).filter(target => target.type === 'page' && target.webSocketDebuggerUrl);
}

function openSocket(url) {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.addEventListener('open', () => resolve(socket), { once: true });
		socket.addEventListener('error', () => reject(new Error('cannot connect')), { once: true });
	});
}

async function resumeIfStuck(target) {
	const socket = await openSocket(target.webSocketDebuggerUrl);
	try {
		let responded = false;
		socket.addEventListener('message', () => { responded = true; });
		socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'new Promise(resolve => setTimeout(resolve, 0))', awaitPromise: true } }));

		await delay(stuckTimeoutMs);
		if (responded) {
			return;
		}

		socket.send(JSON.stringify({ id: 2, method: 'Runtime.runIfWaitingForDebugger', params: {} }));
		await delay(500);
		console.log(`Resumed renderer that was waiting for the debugger: ${target.id}`);
	} finally {
		socket.close();
	}
}

async function run() {
	await delay(gracePeriodMs);

	while (true) {
		try {
			for (const target of await getPageTargets()) {
				await resumeIfStuck(target);
			}
		} catch {
			// Code OSS is not listening yet, or has exited.
		}

		await delay(1000);
	}
}

run();
