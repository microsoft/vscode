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

/** @type {vscode.Disposable | undefined} */
let githubAuthProviderRegistration;

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

function getGitHubToken() {
	return process.env.GITHUB_PAT || process.env.GITHUB_OAUTH_TOKEN;
}

/**
 * @param {unknown} error
 */
function formatError(error) {
	return error instanceof Error ? error.message : String(error);
}

/**
 * @param {readonly string[] | undefined} scopes
 * @returns {vscode.AuthenticationSession}
 */
function createGitHubSession(scopes) {
	const token = getGitHubToken();
	if (!token) {
		throw new Error('GITHUB_PAT or GITHUB_OAUTH_TOKEN is required for Copilot CLI smoke auth');
	}

	return {
		id: 'copilot-cli-smoke-github-session',
		accessToken: token,
		account: { id: 'user', label: 'User' },
		scopes: [...(scopes || ['read:user', 'user:email'])]
	};
}

/**
 * @param {vscode.ExtensionContext} context
 */
function registerGitHubAuthenticationProvider(context) {
	if (githubAuthProviderRegistration || process.env.COPILOT_CLI_UI_SMOKE !== '1') {
		return;
	}

	const token = getGitHubToken();
	if (!token) {
		console.log('[Copilot CLI Smoke] GITHUB_PAT/GITHUB_OAUTH_TOKEN is not set; GitHub auth provider was not registered.');
		return;
	}

	/** @type {vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>} */
	const emitter = new vscode.EventEmitter();
	/** @type {vscode.AuthenticationProvider} */
	const provider = {
		onDidChangeSessions: emitter.event,
		getSessions: async scopes => [createGitHubSession(scopes)],
		createSession: async scopes => {
			const session = createGitHubSession(scopes);
			emitter.fire({ added: [session], removed: [], changed: [] });
			return session;
		},
		removeSession: async () => { }
	};

	context.subscriptions.push(emitter);
	try {
		githubAuthProviderRegistration = vscode.authentication.registerAuthenticationProvider('github', 'GitHub', provider, { supportsMultipleAccounts: false });
		context.subscriptions.push(githubAuthProviderRegistration);
		console.log('[Copilot CLI Smoke] Registered GitHub auth provider.');
	} catch (error) {
		console.log(`[Copilot CLI Smoke] Failed to register GitHub auth provider: ${formatError(error)}`);
	}
}

function getLogsPath() {
	const logsArg = process.argv.find(arg => arg.startsWith('--logsPath='));
	return logsArg?.slice('--logsPath='.length);
}

/**
 * @param {string} directory
 * @param {string} fileName
 * @param {number} maxDepth
 * @returns {string[]}
 */
function findFiles(directory, fileName, maxDepth) {
	if (!directory || maxDepth < 0 || !fs.existsSync(directory)) {
		return [];
	}

	const result = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isFile() && entry.name === fileName) {
			result.push(entryPath);
		} else if (entry.isDirectory()) {
			result.push(...findFiles(entryPath, fileName, maxDepth - 1));
		}
	}
	return result;
}

/**
 * @param {string} fileName
 */
function findNewestLogFile(fileName) {
	const logsPath = getLogsPath();
	let newest;
	for (const candidate of findFiles(logsPath || '', fileName, 6)) {
		const stat = fs.statSync(candidate);
		if (!newest || stat.mtimeMs > newest.mtimeMs) {
			newest = { path: candidate, mtimeMs: stat.mtimeMs };
		}
	}
	return newest?.path;
}

/**
 * @param {string | undefined} filePath
 * @param {number} maxLength
 */
function readTail(filePath, maxLength) {
	if (!filePath || !fs.existsSync(filePath)) {
		return '';
	}
	const contents = fs.readFileSync(filePath, 'utf8');
	return contents.slice(-maxLength);
}

function getCopilotSessionEventsTail() {
	const stateHome = process.env.XDG_STATE_HOME || os.homedir();
	const sessionStateDir = process.env.XDG_STATE_HOME
		? path.join(stateHome, '.copilot', 'session-state')
		: path.join(stateHome, '.copilot', 'session-state');
	const eventFiles = findFiles(sessionStateDir, 'events.jsonl', 2)
		.map(filePath => ({ path: filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return readTail(eventFiles[0]?.path, 6000);
}

function getCopilotCliDiagnostics() {
	const copilotLogPath = findNewestLogFile('GitHub Copilot Chat.log');
	const extensionHostLogPath = findNewestLogFile('exthost.log');
	const extensionHostTail = readTail(extensionHostLogPath, 12000)
		.split(/\r?\n/)
		.filter(line => /copilot|github|MODULE_NOT_FOUND|dlopen|node-pty|ripgrep|runtime\.node|pty\.node|authentication|auth/i.test(line))
		.slice(-50)
		.join('\n');

	return [
		`authEnv=GITHUB_PAT:${!!process.env.GITHUB_PAT} GITHUB_OAUTH_TOKEN:${!!process.env.GITHUB_OAUTH_TOKEN} VSCODE_COPILOT_CHAT_TOKEN:${!!process.env.VSCODE_COPILOT_CHAT_TOKEN}`,
		`copilotApiUrl=${process.env.COPILOT_API_URL || '(unset)'}`,
		`isScenarioAutomation=${process.env.IS_SCENARIO_AUTOMATION || '(unset)'}`,
		`copilotCliUiSmoke=${process.env.COPILOT_CLI_UI_SMOKE || '(unset)'}`,
		`githubAuthProviderRegistered=${!!githubAuthProviderRegistration}`,
		`logsPath=${getLogsPath() || '(unset)'}`,
		`copilotChatLogPath=${copilotLogPath || '(not found)'}`,
		`copilotChatLogTail:\n${readTail(copilotLogPath, 12000) || '(empty)'}`,
		`extensionHostLogPath=${extensionHostLogPath || '(not found)'}`,
		`extensionHostRelevantTail:\n${extensionHostTail || '(empty)'}`,
		`copilotCliSessionEventsTail:\n${getCopilotSessionEventsTail() || '(empty)'}`,
	].join('\n\n');
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	registerGitHubAuthenticationProvider(context);

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

	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.openCopilotCliChat', async () => {
			registerGitHubAuthenticationProvider(context);
			const command = 'workbench.action.chat.openNewSessionEditor.copilotcli';
			await vscode.workspace.getConfiguration('chat').update('disableAIFeatures', false, vscode.ConfigurationTarget.Global);
			await vscode.workspace.getConfiguration('github.copilot.chat').update('backgroundAgent.enabled', true, vscode.ConfigurationTarget.Global);
			await vscode.commands.executeCommand('github.copilot.debug.extensionState');
			await waitForCommand(command, 30_000);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await vscode.commands.executeCommand(command);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('smoketest.getCopilotCliDiagnostics', () => getCopilotCliDiagnostics())
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
