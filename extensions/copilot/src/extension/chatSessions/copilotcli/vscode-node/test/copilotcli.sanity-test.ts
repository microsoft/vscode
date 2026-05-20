/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_USER_EMAIL, IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { ILogService } from '../../../../../platform/log/common/logService';
import { SpyChatResponseStream } from '../../../../../util/common/test/mockChatResponseStream';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { SessionIdForCLI } from '../../common/utils';
import { getCopilotCLISessionEventsFile } from '../../node/cliHelpers';

const COPILOT_CLI_OPEN_SESSION_WITH_PROMPT_COMMAND = 'workbench.action.chat.openSessionWithPrompt.copilotcli';
const COPILOT_CLI_SANITY_PROMPT = 'Reply with only the word pong. Do not edit files or run shell commands.';

interface PersistedSessionEvent {
	readonly type: string;
	readonly data?: {
		readonly content?: string;
		readonly errorType?: string;
		readonly message?: string;
		readonly stack?: string;
	};
}

interface PackagedCopilotCLIOutcome {
	readonly assistantMessages: string;
	readonly queryErrors: readonly string[];
	readonly authErrors: readonly string[];
	readonly allEventsTail: string;
	readonly logTail: string;
	readonly diagnostics: string;
}

/**
 * Drives the real Copilot CLI participant in-process to catch SDK / boot
 * regressions like the `[CopilotCLISession]CopilotCLI error: (query)` log
 * (and the matching `Error: (query) Execution failed: Error:` markdown in
 * chat).
 *
 * Mirrors the Copilot Chat sanity skeleton, with two CLI-specific deltas:
 *   1. The handler is captured by stubbing `vscode.chat.createChatParticipant`
 *      at registration time (the CLI handler is not reachable via DI).
 *   2. Source-mode uses the real DI accessor to stub `IAuthenticationService`;
 *      packaged-mode registers a temporary public GitHub auth provider so the
 *      installed VSIX-shaped extension is the code under test.
 */
suite('Copilot CLI Chat Sanity Test', function () {
	this.timeout(1000 * 60 * 2); // 2 minutes

	const useExternalExtension = !!process.env.COPILOT_TEST_EXTENSION_PATH || !!process.env.COPILOT_TEST_VSIX_PATH;
	const useInstalledVsix = !!process.env.COPILOT_TEST_VSIX_PATH;
	let realInstaAccessor: IInstantiationService | undefined;
	let realContext: vscode.ExtensionContext | undefined;
	let sandbox: sinon.SinonSandbox;
	let copilotCLIChatHandler: Parameters<typeof vscode.chat.createChatParticipant>[1] | undefined;
	const disposables: vscode.Disposable[] = [];
	const fakeToken = CancellationToken.None;

	suiteSetup(async function () {
		// Force the Copilot CLI runtime to use the public CAPI endpoint. Without this the
		// runtime's `getCopilotApiUrl()` returns undefined, `retrieveAvailableModels()` returns
		// an empty list, and `query()` fails with `No model available. Check policy enablement
		// under GitHub Settings > Copilot`. Highest-precedence override, same trick as
		// `test/e2e/cli.stest.ts`.
		if (!process.env.COPILOT_API_URL) {
			process.env.COPILOT_API_URL = 'https://api.githubcopilot.com';
		}

		sandbox = sinon.createSandbox();

		if (!useExternalExtension) {
			const createChatParticipant = vscode.chat.createChatParticipant.bind(vscode.chat);
			sandbox.stub(vscode.chat, 'createChatParticipant').callsFake((...args: Parameters<typeof vscode.chat.createChatParticipant>) => {
				const [id, handler] = args;
				if (id === 'copilotcli') {
					copilotCLIChatHandler = handler;
				}
				return createChatParticipant(...args);
			});
		}

		const extension = vscode.extensions.getExtension('Github.copilot-chat');
		assert.ok(extension, 'Extension is not available');

		const token = process.env.GITHUB_PAT ?? process.env.GITHUB_OAUTH_TOKEN;
		assert.ok(token, 'Expected GITHUB_PAT or GITHUB_OAUTH_TOKEN to be set for Copilot CLI sanity auth. Run `npm run get_token` first.');

		if (useExternalExtension) {
			process.env.IS_SCENARIO_AUTOMATION = '1';
			if (!useInstalledVsix) {
				disposables.push(registerGitHubAuthenticationProvider(token));
			}
			if (useInstalledVsix) {
				await assertInstalledVsixExtension(extension);
			}
			await extension.activate();
		} else {
			sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } });
			sandbox.stub(vscode.workspace, 'registerFileSystemProvider').returns({ dispose: () => { } });

			realContext = await extension.activate();
			assert.ok(realContext, '`extension.activate()` did not return context`');
			const { activate } = await import('../../../../extension/vscode-node/extension');
			const activateResult = await activate(realContext, true);
			assert.ok(activateResult, 'Activation result is not available');
			assert.strictEqual(typeof (activateResult as IInstantiationService).invokeFunction, 'function', 'invokeFunction is not a function');
			realInstaAccessor = activateResult as IInstantiationService;

			await realInstaAccessor.invokeFunction(async accessor => {
				const authenticationService = accessor.get(IAuthenticationService);
				sandbox.stub(authenticationService, 'getGitHubSession').callsFake(async (kind: 'permissive' | 'any') => createGitHubSession(token, scopesForKind(kind)));
			});
		}
	});

	suiteTeardown(async function () {
		sandbox.restore();
		for (const disposable of disposables) {
			try {
				disposable.dispose();
			} catch (e) {
				console.error(e);
			}
		}
		realContext?.subscriptions.forEach(sub => {
			try {
				sub.dispose();
			} catch (e) {
				console.error(e);
			}
		});
	});

	test('Copilot CLI participant streams a response without query error', async function () {
		if (useExternalExtension) {
			await assertPackagedCopilotCLIResponse();
			return;
		}

		assert.ok(copilotCLIChatHandler, 'Copilot CLI chat participant was not registered during activation');

		if (realInstaAccessor) {
			await realInstaAccessor.invokeFunction(async accessor => {
				const logService = accessor.get(ILogService);
				const errorSpy = sinon.spy(logService, 'error');
				try {
					await assertCopilotCLIResponse(() => errorSpy.getCalls().map(call => call.args.map(formatLogArgument).join(': ')));
				} finally {
					errorSpy.restore();
				}
			});
		} else {
			await assertCopilotCLIResponse(() => []);
		}
	});

	async function assertPackagedCopilotCLIResponse(): Promise<void> {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes(COPILOT_CLI_OPEN_SESSION_WITH_PROMPT_COMMAND), `Expected ${COPILOT_CLI_OPEN_SESSION_WITH_PROMPT_COMMAND} to be registered`);

		const logBefore = await readCopilotChatLog();
		const sessionId = `untitled-${generateUuid()}`;
		const resource = SessionIdForCLI.getResource(sessionId);
		try {
			await vscode.commands.executeCommand(COPILOT_CLI_OPEN_SESSION_WITH_PROMPT_COMMAND, {
				resource,
				prompt: COPILOT_CLI_SANITY_PROMPT,
			});
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			throw new Error(`Copilot CLI packaged command failed while sending a basic prompt.\n${message}`);
		}

		const outcome = await readPackagedCopilotCLIOutcome(logBefore);
		const verdict = classifyOutcome(outcome);
		const commonContext = `Likely cause: ${verdict}\n\nQuery (native/SDK) errors:\n${outcome.queryErrors.join('\n') || '(none)'}\n\nAuth errors:\n${outcome.authErrors.join('\n') || '(none)'}\n\nSession events tail:\n${outcome.allEventsTail || '(none)'}\n\nLog tail:\n${outcome.logTail || '(empty)'}\n\nDiagnostics:\n${outcome.diagnostics}`;

		assert.deepStrictEqual(
			outcome.queryErrors,
			[],
			`Copilot CLI packaged command surfaced SDK query / native-load errors.\n\n${commonContext}`
		);

		assert.deepStrictEqual(
			outcome.authErrors,
			[],
			`Copilot CLI packaged command surfaced authentication errors.\n\n${commonContext}`
		);

		assert.match(
			outcome.assistantMessages,
			/pong/i,
			`Copilot CLI packaged command did not produce a real model response. Assistant messages:\n${outcome.assistantMessages || '(none)'}\n\n${commonContext}`
		);
	}

	function classifyOutcome(outcome: PackagedCopilotCLIOutcome): string {
		if (outcome.queryErrors.length) {
			return 'native module / SDK boot failure (matched isQueryFailure)';
		}
		if (outcome.authErrors.length) {
			return 'authentication failure (matched isAuthFailure)';
		}
		if (!outcome.logTail && !outcome.allEventsTail) {
			return 'extension never produced logs or session events (activation or command dispatch failed)';
		}
		if (outcome.logTail && !outcome.allEventsTail) {
			return 'session never started (command reached extension but participant did not boot a session)';
		}
		if (outcome.allEventsTail && !outcome.assistantMessages) {
			return 'session started but no assistant.message emitted (possible silent SDK error — inspect session events tail)';
		}
		return 'unknown';
	}

	async function assertCopilotCLIResponse(getLoggedErrors: () => readonly string[]): Promise<void> {
		const request = new TestChatRequest(COPILOT_CLI_SANITY_PROMPT);
		const context = createCopilotCLIChatContext(request);
		request.sessionResource = context.chatSessionContext!.chatSessionItem.resource;
		const stream = new SpyChatResponseStream();

		let result: vscode.ChatResult | void | null | undefined;
		try {
			result = await copilotCLIChatHandler!(request, context, stream, fakeToken);
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			throw new Error(`Copilot CLI participant threw while handling a basic prompt.\n${message}`);
		}

		assert.ok(!result?.errorDetails, `Copilot CLI participant returned errorDetails: ${result?.errorDetails?.message}`);
		assert.ok(stream.currentProgress, 'Expected Copilot CLI participant to stream response text');

		const loggedErrors = getLoggedErrors();
		const queryErrors = [
			...loggedErrors.filter(isQueryFailure),
			...(isQueryFailure(stream.currentProgress) ? [stream.currentProgress] : [])
		];
		assert.deepStrictEqual(
			queryErrors,
			[],
			`Copilot CLI surfaced a query error from the SDK:\n${queryErrors.join('\n')}`
		);

		assert.match(
			stream.currentProgress,
			/pong/i,
			`Copilot CLI participant did not produce a real model response. Streamed output:\n${stream.currentProgress}\n\nLogged errors:\n${loggedErrors.join('\n') || '(none)'}`
		);
	}

	function registerGitHubAuthenticationProvider(token: string): vscode.Disposable {
		const emitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		const provider: vscode.AuthenticationProvider = {
			onDidChangeSessions: emitter.event,
			getSessions: async (scopes = GITHUB_SCOPE_ALIGNED) => [createGitHubSession(token, scopes)],
			createSession: async scopes => {
				const session = createGitHubSession(token, scopes);
				emitter.fire({ added: [session], removed: undefined, changed: undefined });
				return session;
			},
			removeSession: async () => { }
		};

		const registration = vscode.authentication.registerAuthenticationProvider('github', 'GitHub', provider, { supportsMultipleAccounts: false });
		return {
			dispose: () => {
				registration.dispose();
				emitter.dispose();
			}
		};
	}

	function isQueryFailure(message: string): boolean {
		return /\[CopilotCLISession\]CopilotCLI error: \(query\)|\(query\) Execution failed|Native addon ".*" not found|Failed to load @github\/copilot\/sdk|Unable to find node-pty binaries|Failed to create (?:node-pty|ripgrep) shim|Cannot find module|runtime\.node|pty\.node/.test(message);
	}

	function isAuthFailure(message: string): boolean {
		return /Authorization failed|Unauthorized|\b401\b|No model available|policy enablement|sign in to GitHub|getGitHubSession.*undefined|Authentication (?:failed|required)|Timed out waiting for authentication provider|authentication provider ['"]github['"]/i.test(message);
	}

	async function assertInstalledVsixExtension(extension: vscode.Extension<unknown>): Promise<void> {
		const extensionPath = await realpathOrResolve(extension.extensionPath);
		const extensionInfo = formatResolvedExtensionInfo(extension, extensionPath);
		console.log(`[Copilot CLI Sanity] ${extensionInfo.replaceAll('\n', '\n[Copilot CLI Sanity] ')}`);
		const sourceExtensionPath = process.env.COPILOT_TEST_SOURCE_EXTENSION_PATH ? await realpathOrResolve(process.env.COPILOT_TEST_SOURCE_EXTENSION_PATH) : undefined;
		assert.notStrictEqual(extensionPath, sourceExtensionPath, `Expected installed VSIX extension, but resolved source extension.\n${extensionInfo}`);

		const bundledExtensionPath = process.env.COPILOT_TEST_EXTENSION_PATH ? await realpathOrResolve(process.env.COPILOT_TEST_EXTENSION_PATH) : undefined;
		assert.notStrictEqual(extensionPath, bundledExtensionPath, `Expected installed VSIX extension, but resolved bundled extension.\n${extensionInfo}`);

		const installedVsixExtensionPath = process.env.COPILOT_TEST_INSTALLED_VSIX_EXTENSION_PATH ? await realpathOrResolve(process.env.COPILOT_TEST_INSTALLED_VSIX_EXTENSION_PATH) : undefined;
		assert.strictEqual(extensionPath, installedVsixExtensionPath, `Expected installed VSIX extension, but resolved another Copilot Chat extension.\n${extensionInfo}\nExpected installed VSIX extension path: ${installedVsixExtensionPath ?? '(none)'}`);
	}

	function formatResolvedExtensionInfo(extension: vscode.Extension<unknown>, extensionPath: string): string {
		const matchingExtensions = vscode.extensions.all
			.filter(candidate => candidate.id.toLowerCase() === 'github.copilot-chat')
			.map(candidate => `${candidate.id} -> ${candidate.extensionPath}`)
			.join('\n');
		return [
			`Resolved extension id: ${extension.id}`,
			`Resolved extension path: ${extensionPath}`,
			`Resolved extension package: ${extension.packageJSON?.publisher}.${extension.packageJSON?.name}@${extension.packageJSON?.version}`,
			`Expected VSIX basename: ${process.env.COPILOT_TEST_VSIX_BASENAME ?? '(none)'}`,
			`Expected installed VSIX extension path: ${process.env.COPILOT_TEST_INSTALLED_VSIX_EXTENSION_PATH ?? '(none)'}`,
			`Source extension path: ${process.env.COPILOT_TEST_SOURCE_EXTENSION_PATH ?? '(none)'}`,
			`Bundled extension path: ${process.env.COPILOT_TEST_EXTENSION_PATH ?? '(none)'}`,
			`All Github.copilot-chat extensions:\n${matchingExtensions || '(none)'}`,
		].join('\n');
	}

	async function realpathOrResolve(candidatePath: string): Promise<string> {
		return path.resolve(await fs.realpath(candidatePath).catch(() => candidatePath));
	}

	async function readPackagedCopilotCLIOutcome(logBefore: string): Promise<PackagedCopilotCLIOutcome> {
		let lastLogTail = '';
		let lastSessionId: string | undefined;
		let lastLogPath: string | undefined;
		let lastFullLogLength = 0;
		let lastAllEventsTail = '';
		for (let attempt = 0; attempt < 100; attempt++) {
			const logResult = await readCopilotChatLogWithPath();
			lastLogPath = logResult.path;
			lastFullLogLength = logResult.contents.length;
			// Guard against rotation / shrinkage — fall back to full contents if the
			// pre-command snapshot is longer than the current file.
			lastLogTail = logResult.contents.length >= logBefore.length
				? logResult.contents.slice(logBefore.length)
				: logResult.contents;
			const queryLogErrors = lastLogTail.split(/\r?\n/).filter(isQueryFailure);
			const authLogErrors = lastLogTail.split(/\r?\n/).filter(isAuthFailure);
			if (queryLogErrors.length || authLogErrors.length) {
				return {
					assistantMessages: '',
					queryErrors: queryLogErrors,
					authErrors: authLogErrors,
					allEventsTail: lastAllEventsTail,
					logTail: lastLogTail,
					diagnostics: await collectDiagnostics(lastLogPath, lastFullLogLength, lastSessionId),
				};
			}

			lastSessionId = extractLatestSessionId(lastLogTail) ?? lastSessionId;
			if (lastSessionId) {
				const events = await tryReadSessionEvents(lastSessionId);
				if (events?.length) {
					lastAllEventsTail = events.slice(-20)
						.map(event => `${event.type}: ${JSON.stringify(event.data ?? {}).slice(0, 300)}`)
						.join('\n');
					const sessionErrors = events.filter(event => event.type === 'session.error').map(formatSessionError);
					return {
						assistantMessages: events.filter(event => event.type === 'assistant.message').map(event => event.data?.content ?? '').join('\n'),
						queryErrors: sessionErrors.filter(isQueryFailure),
						authErrors: sessionErrors.filter(isAuthFailure),
						allEventsTail: lastAllEventsTail,
						logTail: lastLogTail,
						diagnostics: await collectDiagnostics(lastLogPath, lastFullLogLength, lastSessionId),
					};
				}
			}
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		return {
			assistantMessages: '',
			queryErrors: [],
			authErrors: [],
			allEventsTail: lastAllEventsTail,
			logTail: lastLogTail,
			diagnostics: await collectDiagnostics(lastLogPath, lastFullLogLength, lastSessionId),
		};
	}

	async function collectDiagnostics(logPath: string | undefined, fullLogLength: number, sessionId: string | undefined): Promise<string> {
		const logsRoot = getTestLogsRoot();
		const token = process.env.GITHUB_PAT ?? process.env.GITHUB_OAUTH_TOKEN ?? '';
		const lines = [
			`authEnv=GITHUB_PAT:${!!process.env.GITHUB_PAT} GITHUB_OAUTH_TOKEN:${!!process.env.GITHUB_OAUTH_TOKEN} tokenLen:${token.length} tokenPrefix:${token.slice(0, 4) || '(empty)'}`,
			`copilotApiUrl=${process.env.COPILOT_API_URL ?? '(unset)'}`,
			`isScenarioAutomation=${process.env.IS_SCENARIO_AUTOMATION ?? '(unset)'}`,
			`logsRoot=${logsRoot} (exists=${await fs.access(logsRoot).then(() => true).catch(() => false)})`,
			`copilotChatLogPath=${logPath ?? '(not found)'}`,
			`copilotChatLogLength=${fullLogLength}`,
			`sessionId=${sessionId ?? '(none extracted)'}`,
		];
		if (sessionId) {
			const eventsFile = getCopilotCLISessionEventsFile(sessionId);
			lines.push(`sessionEventsFile=${eventsFile} (exists=${await fs.access(eventsFile).then(() => true).catch(() => false)})`);
		}
		if (!logPath) {
			const all = await findFiles(logsRoot, 'GitHub Copilot Chat.log', 6).catch(() => []);
			lines.push(`copilotChatLogCandidates=${all.length ? all.join(', ') : '(none)'}`);
		}
		// Fall back to extension host log — activation errors and synchronous
		// native-module load failures land there, not in the Copilot Chat channel.
		const exthostLogPath = await findNewestFile(logsRoot, 'exthost.log', 6);
		if (exthostLogPath) {
			const exthostContents = await fs.readFile(exthostLogPath, 'utf8').catch(() => '');
			const interestingLines = exthostContents.split(/\r?\n/).filter(line => /copilot|github|MODULE_NOT_FOUND|dlopen|node-pty|ripgrep|runtime\.node|pty\.node/i.test(line)).slice(-30);
			lines.push(`exthostLog=${exthostLogPath} (bytes=${exthostContents.length})`);
			if (interestingLines.length) {
				lines.push(`exthostLogRelevant:\n  ${interestingLines.join('\n  ')}`);
			}
		} else {
			lines.push(`exthostLog=(not found)`);
		}
		return lines.join('\n');
	}

	async function readCopilotChatLogWithPath(): Promise<{ path: string | undefined; contents: string }> {
		const logPath = await findNewestFile(getTestLogsRoot(), 'GitHub Copilot Chat.log', 5);
		return { path: logPath, contents: logPath ? await fs.readFile(logPath, 'utf8') : '' };
	}

	async function tryReadSessionEvents(sessionId: string): Promise<PersistedSessionEvent[] | undefined> {
		const eventsFile = getCopilotCLISessionEventsFile(sessionId);
		try {
			const contents = await fs.readFile(eventsFile, 'utf8');
			return contents.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as PersistedSessionEvent);
		} catch {
			return undefined;
		}
	}

	async function readCopilotChatLog(): Promise<string> {
		const logPath = await findNewestFile(getTestLogsRoot(), 'GitHub Copilot Chat.log', 5);
		return logPath ? fs.readFile(logPath, 'utf8') : '';
	}

	function getTestLogsRoot(): string {
		return process.env.VSCODE_LOGS ?? path.join(process.cwd(), '.vscode-test', 'user-data', 'logs');
	}

	async function findNewestFile(directory: string, fileName: string, maxDepth: number): Promise<string | undefined> {
		let newest: { path: string; mtimeMs: number } | undefined;
		for (const candidate of await findFiles(directory, fileName, maxDepth)) {
			const stat = await fs.stat(candidate).catch(() => undefined);
			if (stat && (!newest || stat.mtimeMs > newest.mtimeMs)) {
				newest = { path: candidate, mtimeMs: stat.mtimeMs };
			}
		}

		return newest?.path;
	}

	async function findFiles(directory: string, fileName: string, maxDepth: number): Promise<string[]> {
		if (maxDepth < 0) {
			return [];
		}

		const results: string[] = [];
		const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isFile() && entry.name === fileName) {
				results.push(entryPath);
			}

			if (entry.isDirectory()) {
				results.push(...await findFiles(entryPath, fileName, maxDepth - 1));
			}
		}

		return results;
	}

	function extractLatestSessionId(log: string): string | undefined {
		let sessionId: string | undefined;
		for (const match of log.matchAll(/Using Copilot CLI session: ([0-9a-f-]+)/g)) {
			sessionId = match[1];
		}
		return sessionId;
	}

	function formatSessionError(event: PersistedSessionEvent): string {
		const errorType = event.data?.errorType ?? 'unknown';
		const message = event.data?.message ?? '';
		const stack = event.data?.stack ?? '';
		return [errorType, message, stack].filter(Boolean).join(': ');
	}

	function createCopilotCLIChatContext(request: TestChatRequest): vscode.ChatContext {
		const sessionId = `untitled-${generateUuid()}`;
		const resource = SessionIdForCLI.getResource(sessionId);
		return {
			history: [],
			yieldRequested: false,
			chatSessionContext: {
				chatSessionItem: { resource, label: request.prompt },
				isUntitled: true,
			} as vscode.ChatContext['chatSessionContext'],
		};
	}

	function formatLogArgument(argument: unknown): string {
		if (argument instanceof Error) {
			return argument.message;
		}
		return typeof argument === 'string' ? argument : String(argument ?? '');
	}

	function scopesForKind(kind: 'permissive' | 'any'): readonly string[] {
		return kind === 'permissive' ? GITHUB_SCOPE_ALIGNED : GITHUB_SCOPE_USER_EMAIL;
	}

	function createGitHubSession(token: string, scopes: readonly string[]): vscode.AuthenticationSession {
		return {
			id: token,
			accessToken: token,
			scopes: [...scopes],
			account: {
				id: 'user',
				label: 'User',
			},
		};
	}
});
