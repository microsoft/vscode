/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ChatContext, ChatRequest, ChatResult, ChatVariableLevel, Disposable, Event, EventEmitter, chat, commands } from 'vscode';
import { DeferredPromise, asPromise, assertNoRpc, closeAllEditors, delay, disposeAll } from '../utils';

suite('chat', () => {

	let disposables: Disposable[] = [];
	setup(() => {
		disposables = [];
	});

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
		disposeAll(disposables);
	});

	function getDeferredForRequest(): DeferredPromise<ChatRequest> {
		const deferred = new DeferredPromise<ChatRequest>();
		disposables.push(setupParticipant()(request => deferred.complete(request.request)));

		return deferred;
	}

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

	test('participant and slash command history', async () => {
		const onRequest = setupParticipant();
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
					deferred.complete();
				}
			} catch (e) {
				deferred.error(e);
			}
		}));

		await deferred.p;
	});

	test('participant and variable', async () => {
		disposables.push(chat.registerChatVariableResolver('myVarId', 'myVar', 'My variable', 'My variable', false, {
			resolve(_name, _context, _token) {
				return [{ level: ChatVariableLevel.Full, value: 'myValue' }];
			}
		}));

		const deferred = getDeferredForRequest();
		commands.executeCommand('workbench.action.chat.open', { query: '@participant hi #myVar' });
		const request = await deferred.p;
		assert.strictEqual(request.prompt, 'hi #myVar');
		assert.strictEqual(request.references[0].value, 'myValue');
	});

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

		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
		const result = await deferred.p;
		assert.deepStrictEqual(result.metadata, { key: 'value' });
	});

	test('isolated participant history', async () => {
		const onRequest = setupParticipant();
		const onRequest2 = setupParticipant(true);

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

		await commands.executeCommand('workbench.action.chat.newChat');
		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });

		// Wait for title provider to be called once
		await deferred.p;
		assert.strictEqual(calls, 1);

		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
		await delay(500);

		// Title provider was not called again
		assert.strictEqual(calls, 1);
	});
});
