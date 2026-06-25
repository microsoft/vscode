/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Application, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

const COPILOT_CLI_SCENARIO_ID = 'smoke-editor-copilot-cli';
const COPILOT_CLI_REPLY = 'MOCKED_EDITOR_COPILOT_CLI_RESPONSE';

const failureMarkers = [
	'Authorization failed',
	'sign in to GitHub',
	'Failed to load @github/copilot/sdk',
	'pty.node',
	'runtime.node',
	'Cannot find module',
];

export function setup(logger: Logger) {
	describe('Copilot CLI', function () {
		this.timeout(3 * 60 * 1000);
		this.retries(0);

		let mockServer: MockLlmServer;

		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
			registerScenario(COPILOT_CLI_SCENARIO_ID, new ScenarioBuilder().emit(COPILOT_CLI_REPLY).build());

			mockServer = await startServer(0);
			logger.log(`Copilot CLI mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => ({
			...opts,
			extraEnv: {
				...(opts.extraEnv ?? {}),
				...getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir }),
			},
		}));

		before(async function () {
			const app = this.app as Application;
			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideCapiUrl', JSON.stringify(mockServer.url)],
				// Use token auth (not HMAC) so the CLI SDK can call /models and
				// /models/session against the mock server without HMAC validation.
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['chat.mcp.discovery.enabled', 'false'],
				['chat.mcp.enabled', 'false'],
			]);
		});

		after(async function () {
			await mockServer?.close();
		});

		it.skip('opens a Copilot CLI session and receives a response', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();

			try {
				await app.workbench.quickaccess.runCommand('smoketest.openCopilotCliChat');
				await app.workbench.chat.waitForChatEditor(600);
				await app.workbench.chat.sendEditorMessage(`Reply with one short sentence. Do not run tools or edit files. [scenario:${COPILOT_CLI_SCENARIO_ID}]`);
				await app.workbench.chat.waitForEditorResponse(1500);
			} catch (error) {
				const diagnostics = await getCopilotCliDiagnostics(app, mockServer);
				throw new Error(`Copilot CLI smoke test failed: ${diagnostics.summary}\n\nUI symptom: ${summarizeUiFailure(error)}\n\n${diagnostics.details}`);
			}

			const responseText = (await app.workbench.chat.getLatestEditorResponseText()).trim();
			const diagnostics = responseText.length > 0 ? undefined : await getCopilotCliDiagnostics(app, mockServer);
			assert.ok(responseText.length > 0, `Expected Copilot CLI to produce a non-empty response.${diagnostics ? `\nLikely cause: ${diagnostics.summary}\n\n${diagnostics.details}` : ''}`);
			assert.ok(responseText.includes(COPILOT_CLI_REPLY), `Expected Copilot CLI response to include mocked scenario response "${COPILOT_CLI_REPLY}".\n\nResponse:\n${responseText}`);
			assert.ok(mockServer.requestCount() > requestsBefore, 'Expected the mock LLM server to receive a request from the Copilot CLI editor session');

			const normalizedResponse = responseText.toLowerCase();
			const matchedFailureMarker = failureMarkers.find(marker => normalizedResponse.includes(marker.toLowerCase()));
			if (matchedFailureMarker) {
				const diagnostics = await getCopilotCliDiagnostics(app, mockServer);
				assert.fail(`Copilot CLI response contained failure marker "${matchedFailureMarker}". Likely cause: ${diagnostics.summary}\n\nResponse:\n${responseText}\n\n${diagnostics.details}`);
			}
		});
	});
}

interface CopilotCliDiagnostics {
	readonly summary: string;
	readonly details: string;
}

async function getCopilotCliDiagnostics(app: Application, mockServer?: MockLlmServer): Promise<CopilotCliDiagnostics> {
	const logs = await app.code.driver.getLogs();
	const copilotChatLog = findNewestLog(logs, 'GitHub Copilot Chat.log');
	const extensionHostLog = findNewestLog(logs, 'exthost.log');
	const copilotChatTail = tail(copilotChatLog?.contents ?? '', 12000);
	const extensionHostTail = tail(extensionHostLog?.contents ?? '', 16000);
	const sessionEventsTail = readSessionEventsTail(extractLatestSessionId(copilotChatTail));
	const combinedDiagnostics = [copilotChatTail, extensionHostTail, sessionEventsTail].join('\n');
	const summary = summarizeCopilotCliFailure(combinedDiagnostics);
	const relevantLogTail = getRelevantLogTail(combinedDiagnostics, summary);

	return {
		summary,
		details: [
			'Copilot CLI diagnostics:',
			`mockServer=${mockServer?.url ?? '(not started)'} requestCount=${mockServer?.requestCount() ?? '(unknown)'}`,
			'appExtraEnv=GITHUB_PAT:true IS_SCENARIO_AUTOMATION:true VSCODE_COPILOT_CHAT_TOKEN:true',
			`copilotChatLog=${copilotChatLog?.relativePath ?? '(not found)'}`,
			`extensionHostLog=${extensionHostLog?.relativePath ?? '(not found)'}`,
			`relevantLogTail:\n${relevantLogTail || '(empty; see attached smoke test logs for full output)'}`,
			sessionEventsTail && !sessionEventsTail.startsWith('Session events file not found:')
				? `copilotCliSessionEventsTail:\n${sessionEventsTail}`
				: undefined,
		].filter((line): line is string => !!line).join('\n\n')
	};
}

function summarizeUiFailure(error: unknown): string {
	if (error instanceof Error) {
		const timeout = error.message.match(/Timeout: get element '([^']+)' after ([^.]+)\./);
		if (timeout) {
			return `no completed response rendered; timed out waiting for ${timeout[1]} after ${timeout[2]}`;
		}
		return error.message;
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

function getRelevantLogTail(diagnostics: string, summary: string): string {
	const nativeFailure = summary.startsWith('native SDK module missing') || summary.startsWith('native module / SDK boot failure');
	return diagnostics
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line && !isKnownScenarioAutomationNoise(line))
		.filter(line => nativeFailure ? isNativeFailureLine(line) : isRelevantFailureLine(line))
		.slice(-40)
		.join('\n');
}

function isNativeFailureLine(line: string): boolean {
	return /Native addon ".*" not found|runtime\.node|pty\.node|MODULE_NOT_FOUND|Cannot find module|Failed to load @github\/copilot\/sdk|Failed to initialize|CopilotCLI error: \(query\)|Using Copilot CLI session|Invoking session/i.test(line);
}

function isRelevantFailureLine(line: string): boolean {
	return isNativeFailureLine(line) || isAuthFailure(line) || /\[CopilotCLI\]|\[CopilotCLISession\]|No model available/i.test(line);
}

function isKnownScenarioAutomationNoise(line: string): boolean {
	return /GitHubOrgCustomAgentProvider|GitHubOrgInstructionsProvider|getCurrentAuthedUser is not a function|Invalid response format/.test(line);
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
