/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_USER_EMAIL, IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { ILogService } from '../../../../../platform/log/common/logService';
import { SpyChatResponseStream } from '../../../../../util/common/test/mockChatResponseStream';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { activate } from '../../../../extension/vscode-node/extension';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { SessionIdForCLI } from '../../common/utils';

/**
 * Drives the real Copilot CLI participant in-process to catch SDK / boot
 * regressions like the `[CopilotCLISession]CopilotCLI error: (query)` log
 * (and the matching `Error: (query) Execution failed: Error:` markdown in
 * chat).
 *
 * Mirrors the Copilot Chat sanity skeleton, with two CLI-specific deltas:
 *   1. The handler is captured by stubbing `vscode.chat.createChatParticipant`
 *      at registration time (the CLI handler is not reachable via DI).
 *   2. `IAuthenticationService.getGitHubSession` is stubbed to return the env
 *      token (Copilot CLI goes through the workbench auth API, which has no
 *      provider in the sanity host).
 */
suite('Copilot CLI Chat Sanity Test', function () {
	this.timeout(1000 * 60 * 2); // 2 minutes

	let realInstaAccessor: IInstantiationService;
	let realContext: vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;
	let copilotCLIChatHandler: Parameters<typeof vscode.chat.createChatParticipant>[1] | undefined;
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
		sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } });
		sandbox.stub(vscode.workspace, 'registerFileSystemProvider').returns({ dispose: () => { } });

		const createChatParticipant = vscode.chat.createChatParticipant.bind(vscode.chat);
		sandbox.stub(vscode.chat, 'createChatParticipant').callsFake((...args: Parameters<typeof vscode.chat.createChatParticipant>) => {
			const [id, handler] = args;
			if (id === 'copilotcli') {
				copilotCLIChatHandler = handler;
			}
			return createChatParticipant(...args);
		});

		const extension = vscode.extensions.getExtension('Github.copilot-chat');
		assert.ok(extension, 'Extension is not available');
		realContext = await extension.activate();
		assert.ok(realContext, '`extension.activate()` did not return context`');
		const activateResult = await activate(realContext, true);
		assert.ok(activateResult, 'Activation result is not available');
		assert.strictEqual(typeof (activateResult as IInstantiationService).invokeFunction, 'function', 'invokeFunction is not a function');
		realInstaAccessor = activateResult as IInstantiationService;

		await realInstaAccessor.invokeFunction(async (accessor) => {
			const token = process.env.GITHUB_PAT ?? process.env.GITHUB_OAUTH_TOKEN;
			assert.ok(token, 'Expected GITHUB_PAT or GITHUB_OAUTH_TOKEN to be set for Copilot CLI sanity auth. Run `npm run get_token` first.');
			const authenticationService = accessor.get(IAuthenticationService);
			sandbox.stub(authenticationService, 'getGitHubSession').callsFake(async (kind: 'permissive' | 'any') => createGitHubSession(token, kind));
		});
	});

	suiteTeardown(async function () {
		sandbox.restore();
		realContext.subscriptions.forEach((sub) => {
			try {
				sub.dispose();
			} catch (e) {
				console.error(e);
			}
		});
	});

	test('Copilot CLI participant streams a response without query error', async function () {
		assert.ok(realInstaAccessor, 'Instantiation service accessor is not available');
		assert.ok(copilotCLIChatHandler, 'Copilot CLI chat participant was not registered during activation');

		await realInstaAccessor.invokeFunction(async (accessor) => {
			const logService = accessor.get(ILogService);
			const errorSpy = sinon.spy(logService, 'error');
			try {
				const request = new TestChatRequest('Reply with only the word pong. Do not edit files or run shell commands.');
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

				const loggedErrors = errorSpy.getCalls()
					.map(call => call.args.map(formatLogArgument).join(': '));
				const queryErrors = loggedErrors.filter(message => /\[CopilotCLISession\]CopilotCLI error: \(query\)/.test(message));
				assert.deepStrictEqual(
					queryErrors,
					[],
					`Copilot CLI surfaced a query error from the SDK:\n${queryErrors.join('\n')}`
				);

				// Positive assertion: a real model response should contain the word we asked for.
				// If this fails, the SDK call did not produce real model output (e.g. "No model available",
				// auth/policy issue, or empty response) and the rest of the test is vacuous.
				assert.match(
					stream.currentProgress,
					/pong/i,
					`Copilot CLI participant did not produce a real model response. Streamed output:\n${stream.currentProgress}\n\nLogged errors:\n${loggedErrors.join('\n') || '(none)'}`
				);
			} finally {
				errorSpy.restore();
			}
		});
	});

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

	function createGitHubSession(token: string, kind: 'permissive' | 'any'): vscode.AuthenticationSession {
		return {
			id: token,
			accessToken: token,
			scopes: kind === 'permissive' ? GITHUB_SCOPE_ALIGNED : GITHUB_SCOPE_USER_EMAIL,
			account: {
				id: 'user',
				label: 'User',
			},
		};
	}
});
