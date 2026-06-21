/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

/** @type {string | undefined} */
let deactivateMarkerFile;

/**
 * @param {string} command
 * @param {number} timeoutMs
 */
async function waitForCommand(command, timeoutMs) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const commands = await vscode.commands.getCommands(true);
		if (commands.includes(command)) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}

	throw new Error(`Timed out waiting for command '${command}'`);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Record extension host pid on every activation so smoke tests can validate
	// that a new extension host process was started after a restart action.
	try {
		const pid = String(process.pid);
		const activationPidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid-on-activate.txt');
		fs.writeFileSync(activationPidFile, pid, 'utf-8');
	} catch {
		// Ignore errors in smoke helper setup.
	}

	// This is used to verify that the extension host process is properly killed
	// when window reloads even if the extension host is blocked
	// Refs: https://github.com/microsoft/vscode/issues/291346
	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.getExtensionHostPidAndBlock', (delayMs = 100, durationMs = 60000) => {
			const pid = process.pid;

			// Write PID file to temp dir to avoid polluting workspace search results
			// Note: filename must match name in extension-host-restart.test.ts
			const pidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid.txt');
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

	// This command sets up a marker file path that will be written during deactivation.
	// It allows the smoke test to verify that extensions get a chance to deactivate.
	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.setupGracefulDeactivation', () => {
			const pid = process.pid;
			const pidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid-graceful.txt');
			deactivateMarkerFile = path.join(os.tmpdir(), 'vscode-ext-host-deactivated.txt');

			// Write PID file immediately so test knows the extension is ready
			fs.writeFileSync(pidFile, String(pid), 'utf-8');

			return { pid, markerFile: deactivateMarkerFile };
		})
	);

	// Open a chat session editor of the given type. The required settings
	// (chat.disableAIFeatures = false, the corresponding *Agent.enabled flag)
	// must be written to settings.json by the test before invoking this
	// command. Writing them here via `workspace.getConfiguration().update()`
	// races with copilot-chat registering its configuration schema and was
	// the source of the original Chat Sessions smoke test flake.
	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.openCopilotCliChat', async () => {
			const command = 'workbench.action.chat.openNewSessionEditor.copilotcli';
			// Wait until copilot-chat is enabled and activated before invoking its
			// diagnostic command: the preceding "Chat Disabled" suite disables AI
			// features and this suite re-enables them, so there is a brief window
			// where the command is still "not found".
			await waitForCommand('github.copilot.debug.extensionState', 60_000);
			await vscode.commands.executeCommand('github.copilot.debug.extensionState');
			await waitForCommand(command, 60_000);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await vscode.commands.executeCommand(command);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.openClaudeChat', async () => {
			const command = 'workbench.action.chat.openNewSessionEditor.claude-code';
			// Wait until copilot-chat is enabled and activated before invoking its
			// diagnostic command: the preceding "Chat Disabled" suite disables AI
			// features and this suite re-enables them, so there is a brief window
			// where the command is still "not found".
			await waitForCommand('github.copilot.debug.extensionState', 60_000);
			await vscode.commands.executeCommand('github.copilot.debug.extensionState');
			await waitForCommand(command, 60_000);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await vscode.commands.executeCommand(command);
		})
	);
}

function deactivate() {
	// Write marker file to indicate deactivation was called
	if (deactivateMarkerFile) {
		try {
			fs.writeFileSync(deactivateMarkerFile, `deactivated at ${Date.now()}`, 'utf-8');
		} catch {
			// Ignore errors (e.g., folder not accessible)
		}
	}
}

module.exports = {
	activate,
	deactivate
};
