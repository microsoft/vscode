/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

const failureMarkers = [
	'Authorization failed',
	'sign in to GitHub',
	'Failed to load @github/copilot/sdk',
	'pty.node',
	'runtime.node',
	'Cannot find module',
];

export function setup(logger: Logger, opts: { web?: boolean; remote?: boolean }) {
	const enabled = process.env.COPILOT_CLI_UI_SMOKE === '1' && !opts.web && !opts.remote;

	(enabled ? describe : describe.skip)('Copilot CLI', function () {
		this.timeout(3 * 60 * 1000);
		this.retries(0);

		installAllHandlers(logger);

		it('opens a Copilot CLI session and receives a response', async function () {
			const app = this.app as Application;

			try {
				await app.workbench.quickaccess.runCommand('smoketest.openCopilotCliChat');
				await app.workbench.chat.waitForChatEditor(600);
				await app.workbench.chat.sendMessage('Reply with one short sentence. Do not run tools or edit files.', 'editor');
				await app.workbench.chat.waitForResponse(1500, 'editor');
			} catch (error) {
				const diagnostics = await getCopilotCliDiagnostics(app);
				throw new Error(`Copilot CLI smoke test failed: ${diagnostics.summary}\n\nOriginal UI wait failure:\n${formatError(error)}\n\n${diagnostics.details}`);
			}

			const responseText = (await app.workbench.chat.getLatestResponseText('editor')).trim();
			const diagnostics = responseText.length > 0 ? undefined : await getCopilotCliDiagnostics(app);
			assert.ok(responseText.length > 0, `Expected Copilot CLI to produce a non-empty response.${diagnostics ? `\nLikely cause: ${diagnostics.summary}\n\n${diagnostics.details}` : ''}`);

			const normalizedResponse = responseText.toLowerCase();
			const matchedFailureMarker = failureMarkers.find(marker => normalizedResponse.includes(marker.toLowerCase()));
			if (matchedFailureMarker) {
				const diagnostics = await getCopilotCliDiagnostics(app);
				assert.fail(`Copilot CLI response contained failure marker "${matchedFailureMarker}". Likely cause: ${diagnostics.summary}\n\nResponse:\n${responseText}\n\n${diagnostics.details}`);
			}
		});
	});
}

interface CopilotCliDiagnostics {
	readonly summary: string;
	readonly details: string;
}

async function getCopilotCliDiagnostics(app: Application): Promise<CopilotCliDiagnostics> {
	const logs = await app.code.driver.getLogs();
	const copilotChatLog = findNewestLog(logs, 'GitHub Copilot Chat.log');
	const extensionHostLog = findNewestLog(logs, 'exthost.log');
	const copilotChatTail = tail(copilotChatLog?.contents ?? '', 12000);
	const extensionHostRelevantTail = tail(extensionHostLog?.contents ?? '', 16000)
		.split(/\r?\n/)
		.filter(line => /copilot|github|MODULE_NOT_FOUND|dlopen|node-pty|ripgrep|runtime\.node|pty\.node|authentication|auth/i.test(line))
		.slice(-50)
		.join('\n');
	const sessionEventsTail = readSessionEventsTail(extractLatestSessionId(copilotChatTail));
	const combinedDiagnostics = [copilotChatTail, extensionHostRelevantTail, sessionEventsTail].join('\n');

	return {
		summary: summarizeCopilotCliFailure(combinedDiagnostics),
		details: [
			'Copilot CLI diagnostics:',
			`authEnv=GITHUB_PAT:${!!process.env.GITHUB_PAT} GITHUB_OAUTH_TOKEN:${!!process.env.GITHUB_OAUTH_TOKEN} VSCODE_COPILOT_CHAT_TOKEN:${!!process.env.VSCODE_COPILOT_CHAT_TOKEN}`,
			`copilotApiUrl=${process.env.COPILOT_API_URL ?? '(unset)'}`,
			`isScenarioAutomation=${process.env.IS_SCENARIO_AUTOMATION ?? '(unset)'}`,
			`copilotCliUiSmoke=${process.env.COPILOT_CLI_UI_SMOKE ?? '(unset)'}`,
			`copilotChatLog=${copilotChatLog?.relativePath ?? '(not found)'}`,
			`copilotChatLogTail:\n${copilotChatTail || '(empty)'}`,
			`extensionHostLog=${extensionHostLog?.relativePath ?? '(not found)'}`,
			`extensionHostRelevantTail:\n${extensionHostRelevantTail || '(empty)'}`,
			`copilotCliSessionEventsTail:\n${sessionEventsTail || '(empty)'}`,
		].join('\n\n')
	};
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	return String(error);
}

function summarizeCopilotCliFailure(diagnostics: string): string {
	const nativeAddon = diagnostics.match(/Native addon "([^"]+)" not found for ([^\s.]+)/);
	if (nativeAddon) {
		return `native SDK module missing: Native addon "${nativeAddon[1]}" not found for ${nativeAddon[2]}`;
	}

	const queryFailure = firstMatchingLine(diagnostics, isQueryFailure);
	if (queryFailure) {
		return `native module / SDK boot failure: ${queryFailure}`;
	}

	const authFailure = firstMatchingLine(diagnostics, isAuthFailure);
	if (authFailure) {
		return `authentication failure: ${authFailure}`;
	}

	if (/Using Copilot CLI session: /.test(diagnostics)) {
		return 'Copilot CLI session started, but no completed response appeared in the UI';
	}

	return 'Copilot CLI session did not produce a completed UI response';
}

function firstMatchingLine(contents: string, predicate: (line: string) => boolean): string | undefined {
	return contents
		.split(/\r?\n/)
		.map(line => line.trim())
		.find(line => line && predicate(line));
}

function isQueryFailure(message: string): boolean {
	return /\[CopilotCLISession\]CopilotCLI error: \(query\)|\(query\) Execution failed|Native addon ".*" not found|Failed to load @github\/copilot\/sdk|Unable to find node-pty binaries|Failed to create (?:node-pty|ripgrep) shim|Cannot find module|MODULE_NOT_FOUND|runtime\.node|pty\.node/.test(message);
}

function isAuthFailure(message: string): boolean {
	return /Authorization failed|Unauthorized|\b401\b|No model available|policy enablement|sign in to GitHub|getGitHubSession.*undefined|Authentication (?:failed|required)|Timed out waiting for authentication provider|authentication provider ['"]github['"]/i.test(message);
}

function findNewestLog(logs: readonly { relativePath: string; contents: string }[], fileName: string): { relativePath: string; contents: string } | undefined {
	return logs.find(log => log.relativePath.endsWith(fileName));
}

function tail(contents: string, maxLength: number): string {
	return contents.slice(Math.max(0, contents.length - maxLength));
}

function extractLatestSessionId(log: string): string | undefined {
	let sessionId: string | undefined;
	for (const match of log.matchAll(/Using Copilot CLI session: ([0-9a-f-]+)/g)) {
		sessionId = match[1];
	}
	return sessionId;
}

function readSessionEventsTail(sessionId: string | undefined): string {
	if (!sessionId) {
		return '';
	}

	const stateRoot = process.env.XDG_STATE_HOME ?? os.homedir();
	const eventsPath = path.join(stateRoot, '.copilot', 'session-state', sessionId, 'events.jsonl');
	if (!fs.existsSync(eventsPath)) {
		return `Session events file not found: ${eventsPath}`;
	}

	return tail(fs.readFileSync(eventsPath, 'utf8'), 12000);
}
