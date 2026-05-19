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
import { Event } from '../../../../../util/vs/base/common/event';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { activate } from '../../../../extension/vscode-node/extension';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import type { CopilotCLIChatSessionItemProvider } from '../../../vscode-node/copilotCLIChatSessionsContribution';
import { SessionIdForCLI } from '../../common/utils';

/**
 * Sanity coverage for the internal Copilot CLI chat-session route.
 *
 * The command test starts at the same workbench entrypoint used to open a
 * Copilot CLI session with a prompt. The participant test starts one layer
 * lower so we can assert that the real participant streams text and accepts a
 * follow-up request on the same session resource.
 */
suite('Copilot CLI Chat Sanity Test', function () {
	this.timeout(1000 * 60 * 2); // 2 minutes

	let realInstaAccessor: IInstantiationService;
	let realContext: vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;
	let copilotCLIChatHandler: Parameters<typeof vscode.chat.createChatParticipant>[1] | undefined;
	let copilotCLIChatSessionItemController: vscode.ChatSessionItemController | undefined;
	let copilotCLIChatSessionItemProvider: CopilotCLIChatSessionItemProvider | undefined;
	const fakeToken = CancellationToken.None;

	suiteSetup(async function () {
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

		const registerChatSessionItemProvider = vscode.chat.registerChatSessionItemProvider.bind(vscode.chat);
		sandbox.stub(vscode.chat, 'registerChatSessionItemProvider').callsFake((...args: Parameters<typeof vscode.chat.registerChatSessionItemProvider>) => {
			const [id, provider] = args;
			if (id === 'copilotcli') {
				copilotCLIChatSessionItemProvider = provider as CopilotCLIChatSessionItemProvider;
			}
			return registerChatSessionItemProvider(...args);
		});

		if (typeof vscode.chat.createChatSessionItemController === 'function') {
			const createChatSessionItemController = vscode.chat.createChatSessionItemController.bind(vscode.chat);
			sandbox.stub(vscode.chat, 'createChatSessionItemController').callsFake((...args: Parameters<typeof vscode.chat.createChatSessionItemController>) => {
				const controller = createChatSessionItemController(...args);
				if (args[0] === 'copilotcli') {
					copilotCLIChatSessionItemController = controller;
				}
				return controller;
			});
		}

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
			sandbox.stub(authenticationService, 'getGitHubSession').callsFake(async (kind) => createGitHubSession(token, kind));
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

	test('opens a Copilot CLI session through the workbench command', async function () {
		assert.ok(realInstaAccessor, 'Instantiation service accessor is not available');

		await realInstaAccessor.invokeFunction(async (accessor) => {
			const logService = accessor.get(ILogService);
			const errorSpy = sinon.spy(logService, 'error');
			try {
				const resource = SessionIdForCLI.getResource(`untitled-${generateUuid()}`);
				await vscode.commands.executeCommand(
					'workbench.action.chat.openSessionWithPrompt.copilotcli',
					{ resource, prompt: 'Tell me a joke about number 8', attachedContext: [] },
				);

				const queryErrors = errorSpy.getCalls()
					.map(call => call.args.map(formatLogArgument).join(': '))
					.filter(message => /\[CopilotCLISession\]CopilotCLI error: \(query\)/.test(message));
				assert.deepStrictEqual(
					queryErrors,
					[],
					`Copilot CLI surfaced a query error from the SDK:\n${queryErrors.join('\n')}`
				);
			} finally {
				errorSpy.restore();
			}
		});
	});

	test('streams responses from the registered Copilot CLI participant', async function () {
		assert.ok(copilotCLIChatHandler, 'Copilot CLI chat participant was not registered');

		const request = new TestChatRequest('Reply with only the word pong. Do not edit files or run shell commands.');
		const context = await createCopilotCLIChatContext(request);
		const chatSessionContext = context.chatSessionContext;
		assert.ok(chatSessionContext, 'Expected Copilot CLI chat session context to be available for first turn');
		const committedSessionItem = waitForCopilotCLICommit(chatSessionContext.chatSessionItem);
		const stream = new SpyChatResponseStream();
		let result: vscode.ChatResult | void | null | undefined;

		try {
			result = await copilotCLIChatHandler(request, context, stream, fakeToken);
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			throw new Error(`Copilot CLI internal SDK chat session failed. This usually means the internal @github/copilot/sdk route, native prebuilds, or node-pty shims did not load correctly.\n${message}`);
		}

		assert.ok(!result?.errorDetails, `Copilot CLI internal SDK chat session returned an error: ${result?.errorDetails?.message}`);
		assertCopilotCLIResponse(stream, 'first turn');

		const followupSessionItem = await committedSessionItem;
		const followupRequest = new TestChatRequest('Now reply with only the word pong again.');
		const followupContext = createCopilotCLIExistingChatContext(followupSessionItem, chatSessionContext.inputState);
		followupRequest.sessionResource = followupSessionItem.resource;
		const followupStream = new SpyChatResponseStream();
		let followupResult: vscode.ChatResult | void | null | undefined;

		try {
			followupResult = await copilotCLIChatHandler(followupRequest, followupContext, followupStream, fakeToken);
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			throw new Error(`Copilot CLI internal SDK chat session follow-up failed after the session was created.\n${message}`);
		}

		assert.ok(!followupResult?.errorDetails, `Copilot CLI internal SDK chat session follow-up returned an error: ${followupResult?.errorDetails?.message}`);
		assertCopilotCLIResponseParts(followupStream, 'follow-up turn');
	});

	async function createCopilotCLIChatContext(request: TestChatRequest): Promise<vscode.ChatContext> {
		const inputState = copilotCLIChatSessionItemController?.getChatSessionInputState
			? await copilotCLIChatSessionItemController.getChatSessionInputState(undefined, { previousInputState: undefined }, fakeToken)
			: createEmptyChatSessionInputState();
		const chatSessionItem = await createCopilotCLIChatSessionItem(request, inputState);
		request.sessionResource = chatSessionItem.resource;
		return {
			history: [],
			yieldRequested: false,
			chatSessionContext: {
				chatSessionItem,
				isUntitled: true,
				inputState,
			}
		};
	}

	function createCopilotCLIExistingChatContext(chatSessionItem: vscode.ChatSessionItem, inputState: vscode.ChatSessionInputState | undefined): vscode.ChatContext {
		return {
			history: [],
			yieldRequested: false,
			chatSessionContext: {
				chatSessionItem,
				isUntitled: false,
				inputState: inputState ?? createEmptyChatSessionInputState(),
			}
		};
	}

	function waitForCopilotCLICommit(original: vscode.ChatSessionItem): Promise<vscode.ChatSessionItem> {
		const itemProvider = copilotCLIChatSessionItemProvider;
		assert.ok(itemProvider, 'Copilot CLI chat session item provider was not registered');

		return new Promise((resolve, reject) => {
			const cleanup: { subscription?: vscode.Disposable } = {};
			const timeout = setTimeout(() => {
				cleanup.subscription?.dispose();
				reject(new Error(`Timed out waiting for Copilot CLI session commit from ${original.resource.toString()}`));
			}, 10_000);

			const subscription = itemProvider.onDidCommitChatSessionItem(({ original: committedOriginal, modified }) => {
				if (committedOriginal.resource.toString() !== original.resource.toString()) {
					return;
				}
				clearTimeout(timeout);
				subscription.dispose();
				resolve(modified);
			});
			cleanup.subscription = subscription;
		});
	}

	async function createCopilotCLIChatSessionItem(request: TestChatRequest, inputState: vscode.ChatSessionInputState): Promise<vscode.ChatSessionItem> {
		if (copilotCLIChatSessionItemController?.newChatSessionItemHandler) {
			return copilotCLIChatSessionItemController.newChatSessionItemHandler({
				request: { prompt: request.prompt },
				inputState,
			}, fakeToken);
		}

		return {
			resource: vscode.Uri.from({ scheme: 'copilotcli', path: `/untitled-${request.sessionId}` }),
			label: request.prompt,
		};
	}

	function createEmptyChatSessionInputState(): vscode.ChatSessionInputState {
		return {
			groups: [],
			sessionResource: undefined,
			onDidChange: Event.None,
			onDidDispose: Event.None,
		};
	}

	function assertCopilotCLIResponse(stream: SpyChatResponseStream, turnName: string): void {
		assertCopilotCLIResponseParts(stream, turnName);
		assert.ok(stream.currentProgress, `Expected Copilot CLI internal SDK chat session ${turnName} output. Response parts: ${stream.items.map(part => part.constructor.name).join(', ')}`);
	}

	function assertCopilotCLIResponseParts(stream: SpyChatResponseStream, turnName: string): void {
		assert.ok(stream.items.length > 0, `Expected Copilot CLI internal SDK chat session ${turnName} to emit response parts`);
	}

	function formatLogArgument(argument: string | Error | undefined): string {
		if (argument instanceof Error) {
			return argument.message;
		}
		return argument ?? '';
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
