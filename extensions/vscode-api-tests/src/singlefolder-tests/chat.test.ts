/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { join } from 'path';
import 'mocha';
import { ChatContext, ChatRequest, ChatRequestTurn, ChatRequestTurn2, ChatResult, Disposable, env, Event, EventEmitter, chat, commands, lm, UIKind, Uri, window } from 'vscode';
import { DeferredPromise, asPromise, assertNoRpc, closeAllEditors, delay, disposeAll } from '../utils';

// TODO: this now became flaky with built-in copilot
suite('chat', () => {

	let disposables: Disposable[] = [];
	setup(() => {
		disposables = [];

		// Register a dummy default model which is required for a participant request to go through
		disposables.push(lm.registerLanguageModelChatProvider('copilot', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [{
					id: 'test-lm',
					name: 'test-lm',
					family: 'test',
					version: '1.0.0',
					maxInputTokens: 100,
					maxOutputTokens: 100,
					isDefault: true,
					isUserSelectable: true,
					capabilities: {}
				}];
			},
			async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				return undefined;
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			},
		}));
	});

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
		disposeAll(disposables);
	});

	function setupParticipant(second?: boolean): Event<{ request: ChatRequest; context: ChatContext }> {
		const emitter = new EventEmitter<{ request: ChatRequest; context: ChatContext }>();
		disposables.push(emitter);

		const id = second ? 'api-test.participant2' : 'api-test.participant';
		const participant = chat.createChatParticipant(id, (request, context, _progress, _token) => {
			emitter.fire({ request, context });
		});
		disposables.push(participant);
		return emitter.event;
	}

	// Chat participants are a Local-harness feature, but the panel defaults to
	// Agent Host Copilot when the agent host is enabled. `newLocalChat` opens the
	// view directly into a Local session (from cold), so these tests run it first.
	test('participant and slash command history', async () => {
		const onRequest = setupParticipant();
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });

		const deferred = new DeferredPromise<void>();
		let i = 0;
		disposables.push(onRequest(request => {
			try {
				if (i === 0) {
					assert.deepStrictEqual(request.request.command, 'hello');
					assert.strictEqual(request.request.prompt, 'friend');
					i++;
					setTimeout(() => {
						commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
					}, 0);
				} else {
					assert.strictEqual(request.context.history.length, 2);
					assert.strictEqual(request.context.history[0].participant, 'api-test.participant');
					assert.strictEqual(request.context.history[0].command, 'hello');
					assert.ok(request.context.history[0] instanceof ChatRequestTurn && request.context.history[0] instanceof ChatRequestTurn2);
					deferred.complete();
				}
			} catch (e) {
				deferred.error(e);
			}
		}));

		await deferred.p;
	});

	test('sendRequest delivers to the session of the token while another session stays active', async () => {
		const onRequest = setupParticipant();

		// Start the work in session A.
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant start the build' });
		const start = await asPromise(onRequest);
		const sessionA = start.request.sessionResource;

		// The user moves on to session B.
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		const sessionB = await waitForActiveChatSession(resource => resource.toString() !== sessionA.toString());

		// The result goes to the extension's own participant in A.
		const delivered = asPromise(onRequest);
		await chat.sendRequest(start.request.toolInvocationToken, { prompt: 'build output', label: 'Build finished', participant: 'api-test.participant' });
		const result = await delivered;
		assert.deepStrictEqual({
			session: result.request.sessionResource.toString(),
			prompt: result.request.prompt,
			history: result.context.history.length,
			active: window.activeChatPanelSessionResource?.toString(),
		}, { session: sessionA.toString(), prompt: 'build output', history: 2, active: sessionB.toString() });

		// Without a participant, the agent of the last request in A handles it and learns who sent it.
		const notified = asPromise(onRequest);
		await chat.sendRequest(result.request.toolInvocationToken, { prompt: 'tests passed', label: 'Tests finished' });
		const notification = await notified;
		assert.deepStrictEqual({
			session: notification.request.sessionResource.toString(),
			prompt: notification.request.prompt,
			active: window.activeChatPanelSessionResource?.toString(),
		}, { session: sessionA.toString(), prompt: '[Notification from extension vscode.vscode-api-tests]\ntests passed', active: sessionB.toString() });
	});

	async function waitForActiveChatSession(predicate: (resource: Uri) => boolean): Promise<Uri> {
		for (let i = 0; i < 100; i++) {
			const resource = window.activeChatPanelSessionResource;
			if (resource && predicate(resource)) {
				return resource;
			}
			await delay(50);
		}
		throw new Error('The active chat session did not change');
	}

	test('result metadata is returned to the followup provider', async () => {
		const deferred = new DeferredPromise<ChatResult>();
		const participant = chat.createChatParticipant('api-test.participant', (_request, _context, _progress, _token) => {
			return { metadata: { key: 'value' } };
		});
		participant.followupProvider = {
			provideFollowups(result, _context, _token) {
				deferred.complete(result);
				return [];
			},
		};
		disposables.push(participant);

		// Participants are Local-only; open a Local chat first (see note above).
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
		const result = await deferred.p;
		assert.deepStrictEqual(result.metadata, { key: 'value' });
	});

	test('isolated participant history', async () => {
		const onRequest = setupParticipant();
		const onRequest2 = setupParticipant(true);

		// Participants are Local-only; open a Local chat first (see note above).
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant hi' });
		await asPromise(onRequest);

		// Request is still being handled at this point, wait for it to end
		setTimeout(() => {
			commands.executeCommand('workbench.action.chat.open', { query: '@participant2 hi' });
		}, 0);
		const request2 = await asPromise(onRequest2);
		assert.strictEqual(request2.context.history.length, 0);

		setTimeout(() => {
			commands.executeCommand('workbench.action.chat.open', { query: '@participant2 hi' });
		}, 0);
		const request3 = await asPromise(onRequest2);
		assert.strictEqual(request3.context.history.length, 2); // request + response = 2
	});

	// fixme(rwoll): workbench.action.chat.open.blockOnResponse tests are flaking in CI:
	//               * https://github.com/microsoft/vscode/issues/263572
	//               * https://github.com/microsoft/vscode/issues/263575
	test.skip('workbench.action.chat.open.blockOnResponse defaults to non-blocking for backwards compatibility', async () => {
		const toolRegistration = lm.registerTool<void>('requires_confirmation_tool', {
			invoke: async (_options, _token) => null, prepareInvocation: async (_options, _token) => {
				return { invocationMessage: 'Invoking', pastTenseMessage: 'Invoked', confirmationMessages: { title: 'Confirm', message: 'Are you sure?' } };
			}
		});

		const participant = chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
			await lm.invokeTool('requires_confirmation_tool', {
				input: {},
				toolInvocationToken: _request.toolInvocationToken,
			});
			return { metadata: { complete: true } };
		});
		disposables.push(participant, toolRegistration);

		await commands.executeCommand('workbench.action.chat.newChat');
		const result = await commands.executeCommand('workbench.action.chat.open', { query: 'hello' });
		assert.strictEqual(result, undefined);
	});

	test.skip('workbench.action.chat.open.blockOnResponse resolves when waiting for user confirmation to run a tool', async () => {
		const toolRegistration = lm.registerTool<void>('requires_confirmation_tool', {
			invoke: async (_options, _token) => null, prepareInvocation: async (_options, _token) => {
				return { invocationMessage: 'Invoking', pastTenseMessage: 'Invoked', confirmationMessages: { title: 'Confirm', message: 'Are you sure?' } };
			}
		});

		const participant = chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
			await lm.invokeTool('requires_confirmation_tool', {
				input: {},
				toolInvocationToken: _request.toolInvocationToken,
			});
			return { metadata: { complete: true } };
		});
		disposables.push(participant, toolRegistration);

		await commands.executeCommand('workbench.action.chat.newChat');
		const result: any = await commands.executeCommand('workbench.action.chat.open', { query: 'hello', blockOnResponse: true });
		assert.strictEqual(result?.type, 'confirmation');
	});

	test.skip('workbench.action.chat.open.blockOnResponse resolves when an error is hit', async () => {
		const participant = chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
			return { errorDetails: { code: 'rate_limited', message: `You've been rate limited. Try again later!` } };
		});
		disposables.push(participant);

		await commands.executeCommand('workbench.action.chat.newChat');
		const result = await commands.executeCommand('workbench.action.chat.open', { query: 'hello', blockOnResponse: true });
		type PartialChatAgentResult = {
			errorDetails: {
				code: string;
			};
		};
		assert.strictEqual((<PartialChatAgentResult>result).errorDetails.code, 'rate_limited');
	});

	test('title provider is called for first request', async () => {
		let calls = 0;
		const deferred = new DeferredPromise<void>();
		const participant = chat.createChatParticipant('api-test.participant', (_request, _context, _progress, _token) => {
			return { metadata: { key: 'value' } };
		});
		participant.titleProvider = {
			provideChatTitle(_context, _token) {
				calls++;
				deferred.complete();
				return 'title';
			}
		};
		disposables.push(participant);

		// Participants are Local-only; open a Local chat first (see note above).
		await commands.executeCommand('workbench.action.chat.newLocalChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });

		// Wait for title provider to be called once
		await deferred.p;
		assert.strictEqual(calls, 1);

		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
		await delay(500);

		// Title provider was not called again
		assert.strictEqual(calls, 1);
	});

	test('can access node-pty module', async function () {
		// Required for copilot cli in chat extension.
		if (env.uiKind === UIKind.Web) {
			this.skip();
		}
		const nodePtyModules = [
			join(env.appRoot, 'node_modules.asar', 'node-pty'),
			join(env.appRoot, 'node_modules', 'node-pty')
		];

		for (const modulePath of nodePtyModules) {
			// try to stat and require module
			try {
				await fs.promises.stat(modulePath);
				const nodePty = require(modulePath);
				assert.ok(nodePty, `Successfully required node-pty from ${modulePath}`);
				return;
			} catch (err) {
				// failed to require, try next
			}
		}
		assert.fail('Failed to find and require node-pty module');
	});
});
