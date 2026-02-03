/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// This is used to verify that the extension host process is properly killed
	// when window reloads even if the extension host is blocked
	// Refs: https://github.com/microsoft/vscode/issues/291346
	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.getExtensionHostPidAndBlock', (delayMs = 100, durationMs = 60000) => {
			const pid = process.pid;

			// Write PID file to workspace folder if available, otherwise temp dir
			// Note: filename must match name in extension-host-restart.test.ts
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const pidFile = workspaceFolder
				? path.join(workspaceFolder, 'vscode-ext-host-pid.txt')
				: path.join(os.tmpdir(), 'vscode-ext-host-pid.txt');
			setTimeout(() => {
				fs.writeFileSync(pidFile, String(pid), 'utf-8');

				// Block the extension host without busy-spinning to avoid pegging a CPU core.
				// Prefer Atomics.wait on a SharedArrayBuffer when available; otherwise, fall back
				// to the original busy loop to preserve behavior in older environments.
				if (typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined' && typeof Atomics.wait === 'function') {
					const sab = new SharedArrayBuffer(4);
					const blocker = new Int32Array(sab);
					// Wait up to durationMs milliseconds. This blocks the thread without consuming CPU.
					Atomics.wait(blocker, 0, 0, durationMs);
				} else {
					const start = Date.now();
					while (Date.now() - start < durationMs) {
						// Busy loop (fallback)
					}
				}
			}, delayMs);

			return pid;
		})
	);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
};
