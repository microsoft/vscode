/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { SpyChatResponseStream } from '../../../util/common/test/mockChatResponseStream';
import { timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IConversationStore } from '../../conversationStore/node/conversationStore';
import { activate } from '../../extension/vscode-node/extension';
import { ChatParticipantRequestHandler } from '../../prompt/node/chatParticipantRequestHandler';
import { ContributedToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { TestChatRequest } from '../node/testHelpers';

/**
 * Running these locally? You may have to run `npm run setup` again
 */

suite('Copilot Chat Sanity Test', function () {
	this.timeout(1000 * 60 * 1); // 1 minute

	let realInstaAccessor: IInstantiationService;
	let realContext: vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;
	const fakeToken = CancellationToken.None;
	// Before everything, activate the extension
	suiteSetup(async function () {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } });
		sandbox.stub(vscode.workspace, 'registerFileSystemProvider').returns({ dispose: () => { } });
		const extension = vscode.extensions.getExtension('Github.copilot-chat');
		assert.ok(extension, 'Extension is not available');
		realContext = await extension.activate();
		assert.ok(realContext, '`extension.activate()` did not return context`');
		assert.ok(realContext.extensionMode, 'extension context does not have `extensionMode`');
		const activateResult = await activate(realContext, true);
		assert.ok(activateResult, 'Activation result is not available');
		// Assert that the activateResult is a service accessor
		assert.strictEqual(typeof (activateResult as IInstantiationService).createInstance, 'function', 'createInstance is not a function');
		assert.strictEqual(typeof (activateResult as IInstantiationService).invokeFunction, 'function', 'invokeFunction is not a function');
		realInstaAccessor = activateResult as IInstantiationService;

		// Warm the Copilot token cache so the first chat request does not pay that cost.
		await realInstaAccessor.invokeFunction(async (accessor) => {
			const token = await accessor.get(IAuthenticationService).getCopilotToken();
			assert.ok(token, 'Copilot token must be available before tests run');
		});
	});

	suiteTeardown(async function () {
		sandbox.restore();
		// Dispose of all subscriptions
		realContext.subscriptions.forEach((sub) => {
			try {
				sub.dispose();
			} catch (e) {
				console.error(e);
			}
		});
	});

	test('E2E Production Panel Chat Test', async function () {
		assert.ok(realInstaAccessor, 'Instantiation service accessor is not available');

		await realInstaAccessor.invokeFunction(async (accessor) => {

			const conversationStore = accessor.get(IConversationStore);
			const instaService = accessor.get(IInstantiationService);
			let stream = new SpyChatResponseStream();
			let interactiveSession = instaService.createInstance(ChatParticipantRequestHandler, [], new TestChatRequest('Write me a for loop in javascript'), stream, fakeToken, { agentName: '', agentId: '', intentId: '' }, () => false, undefined);

			await interactiveSession.getResult();

			assert.ok(stream.currentProgress, 'Expected progress after first request');
			const oldText = stream.currentProgress;

			stream = new SpyChatResponseStream();
			interactiveSession = instaService.createInstance(ChatParticipantRequestHandler, [], new TestChatRequest('Can you make it in typescript instead'), stream, fakeToken, { agentName: '', agentId: '', intentId: '' }, () => false, undefined);
			const result2 = await interactiveSession.getResult();

			assert.ok(stream.currentProgress, 'Expected progress after second request');
			assert.notStrictEqual(stream.currentProgress, oldText, 'Expected different progress text after second request');

			const conversation = conversationStore.getConversation(result2.metadata.responseId);
			assert.ok(conversation, 'Expected conversation to be available');
		});
	});

	/**
	 * Runs tools outside of a real chat session which is unusual but lets us spy more
	 * Uses an empty window with no folder open
	 */
	test('E2E Production agent mode', async function () {
		assert.ok(realInstaAccessor, 'Instantiation service accessor is not available');

		await realInstaAccessor.invokeFunction(async (accessor) => {

			const conversationStore = accessor.get(IConversationStore);
			const instaService = accessor.get(IInstantiationService);
			const toolsService = accessor.get(IToolsService);

			// The model may occasionally take more than 20 s to emit its first
			// tool-call delta on the production backend. Enrich the timeout error
			// so we can tell from CI logs whether the stream produced anything
			// (and what kind of parts).
			const runAgentRequest = async (): Promise<SpyChatResponseStream> => {
				const stream = new SpyChatResponseStream();
				// Keep the instruction unconditional. Any hedging language ("it may
				// fail, that's ok", "it's fine if it errors") gives newer models cover
				// to skip the invocation entirely and just narrate a plausible failure.
				const testRequest = new TestChatRequest(`Call the get_errors tool now to check the current window for errors. You must invoke the tool exactly once, then reply with a brief summary of whatever it returned.`);
				testRequest.tools.set(ContributedToolName.GetErrors, true);
				const interactiveSession = instaService.createInstance(ChatParticipantRequestHandler, [], testRequest, stream, fakeToken, { agentName: '', agentId: '', intentId: Intent.Agent }, () => false, undefined);

				const onWillInvokeTool = Event.toPromise(toolsService.onWillInvokeTool);
				const getResultPromise = interactiveSession.getResult();
				const dumpStream = () => {
					const parts = stream.items.map(p => p.constructor.name);
					return `items=${stream.items.length} [${parts.join(', ')}] currentProgress=${JSON.stringify(stream.currentProgress)}`;
				};
				try {
					await Promise.race([
						onWillInvokeTool,
						timeout(20_000).then(() => Promise.reject(new Error('timed out waiting for tool call. ' + dumpStream())))
					]);
					await getResultPromise;
					return stream;
				} catch (err) {
					// Give the in-flight request a short grace period so we can
					// classify the failure mode in the error message instead of
					// reporting a bare timeout.
					const settled = await Promise.race([
						getResultPromise.then(r => ({ kind: 'resolved' as const, value: r }), e => ({ kind: 'rejected' as const, error: e })),
						timeout(5_000).then(() => ({ kind: 'still-pending' as const }))
					]);
					const cause = err instanceof Error ? err : new Error(String(err));
					const followUpError = 'error' in settled
						? settled.error instanceof Error
							? ` error=${settled.error.stack ?? settled.error.message}`
							: ` error=${String(settled.error)}`
						: '';
					throw new Error(`${cause.message} | follow-up: kind=${settled.kind}${followUpError} ${dumpStream()}`, { cause });
				}
			};

			const stream = await runAgentRequest();

			assert.ok(stream.currentProgress, 'Expected output');
			const oldText = stream.currentProgress;

			const stream2 = new SpyChatResponseStream();
			const interactiveSession = instaService.createInstance(ChatParticipantRequestHandler, [], new TestChatRequest('And what is 1+1'), stream2, fakeToken, { agentName: '', agentId: '', intentId: Intent.Agent }, () => false, undefined);
			const result2 = await interactiveSession.getResult();

			assert.ok(stream2.currentProgress, 'Expected progress after second request');
			assert.notStrictEqual(stream2.currentProgress, oldText, 'Expected different progress text after second request');

			const conversation = conversationStore.getConversation(result2.metadata.responseId);
			assert.ok(conversation, 'Expected conversation to be available');
		});
	});

	test('Slash Commands work properly', async function () {
		assert.ok(realInstaAccessor);

		await realInstaAccessor.invokeFunction(async (accessor) => {

			const instaService = accessor.get(IInstantiationService);
			const progressReport = new SpyChatResponseStream();
			const interactiveSession = instaService.createInstance(ChatParticipantRequestHandler, [], new TestChatRequest('What is a fibonacci sequence?'), progressReport, fakeToken, { agentName: '', agentId: '', intentId: 'explain' }, () => false, undefined);

			// Ask a `/explain` question
			await interactiveSession.getResult();
			assert.ok(progressReport.currentProgress);
		});
	});

	test.skip('E2E Production Inline Chat Test', async function () {
		assert.ok(realInstaAccessor);

		await realInstaAccessor.invokeFunction(async (accessor) => {

			const r = vscode.lm.registerLanguageModelChatProvider('test', new class implements vscode.LanguageModelChatProvider {
				async provideLanguageModelChatInformation(options: { silent: boolean }, token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
					return [{
						id: 'test',
						name: 'test',
						family: 'test',
						version: '0.0.0',
						maxInputTokens: 1000,
						maxOutputTokens: 1000,
						requiresAuthorization: true,
						capabilities: {}
					}];
				}
				async provideLanguageModelChatResponse(model: vscode.LanguageModelChatInformation, messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>, options: vscode.ProvideLanguageModelChatResponseOptions, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
					throw new Error('Method not implemented.');
				}
				async provideTokenCount(model: vscode.LanguageModelChatInformation, text: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2, token: vscode.CancellationToken): Promise<number> {
					return 0;
				}
			});

			try {
				// Create and open a new file
				const document = await vscode.workspace.openTextDocument({ language: 'javascript' });
				await vscode.window.showTextDocument(document);

				// Wait for a document change event or 10 seconds whatever comes first then assert the text
				const textPromise = new Promise<string>((resolve, reject) => {
					const listener = vscode.workspace.onDidChangeTextDocument(async (e) => {
						if (e.document.uri.scheme !== 'untitled') {
							return;
						}
						if (e.document.getText().length !== 0) {
							listener.dispose();
							resolve(e.document.getText());
						}
					});
				});

				await vscode.commands.executeCommand('vscode.editorChat.start', {
					autoSend: true,
					message: 'Write me a for loop in javascript',
					position: new vscode.Position(0, 0),
					initialSelection: new vscode.Selection(0, 0, 0, 0),
					initialRange: new vscode.Range(0, 0, 0, 0),
				});
				const text = await textPromise;
				assert.ok(text.length > 0);
			} finally {
				r.dispose();
			}
		});
	});
});
