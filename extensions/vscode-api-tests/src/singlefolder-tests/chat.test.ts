/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { commands, CancellationToken, ChatContext, ChatRequest, ChatResult, ChatVariableLevel, Disposable, Event, EventEmitter, InteractiveSession, ProviderResult, chat, interactive } from 'vscode';
import { DeferredPromise, assertNoRpc, closeAllEditors, disposeAll } from '../utils';

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

	function setupParticipant(): Event<{ request: ChatRequest; context: ChatContext }> {
		const emitter = new EventEmitter<{ request: ChatRequest; context: ChatContext }>();
		disposables.push(emitter);
		disposables.push(interactive.registerInteractiveSessionProvider('provider', {
			prepareSession: (_token: CancellationToken): ProviderResult<InteractiveSession> => {
				return {
					requester: { name: 'test' },
					responder: { name: 'test' },
				};
			},
		}));

		const participant = chat.createChatParticipant('api-test.participant', (request, context, _progress, _token) => {
			emitter.fire({ request, context });
		});
		participant.isDefault = true;
		disposables.push(participant);
		return emitter.event;
	}

	test('participant and slash command history', async () => {
		const onRequest = setupParticipant();
		commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });

		let i = 0;
		disposables.push(onRequest(request => {
			if (i === 0) {
				assert.deepStrictEqual(request.request.command, 'hello');
				assert.strictEqual(request.request.prompt, 'friend');
				i++;
				commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
			} else {
				assert.strictEqual(request.context.history.length, 1);
				assert.strictEqual(request.context.history[0].participant, 'api-test.participant');
				assert.strictEqual(request.context.history[0].command, 'hello');
			}
		}));
	});

	test('participant and variable', async () => {
		disposables.push(chat.registerChatVariableResolver('myVar', 'My variable', {
			resolve(_name, _context, _token) {
				return [{ level: ChatVariableLevel.Full, value: 'myValue' }];
			}
		}));

		const deferred = getDeferredForRequest();
		commands.executeCommand('workbench.action.chat.open', { query: '@participant hi #myVar' });
		const request = await deferred.p;
		assert.strictEqual(request.prompt, 'hi #myVar');
		assert.strictEqual(request.variables[0].values[0].value, 'myValue');
	});

	test('result metadata is returned to the followup provider', async () => {
		disposables.push(interactive.registerInteractiveSessionProvider('provider', {
			prepareSession: (_token: CancellationToken): ProviderResult<InteractiveSession> => {
				return {
					requester: { name: 'test' },
					responder: { name: 'test' },
				};
			},
		}));

		const deferred = new DeferredPromise<ChatResult>();
		const participant = chat.createChatParticipant('api-test.participant', (_request, _context, _progress, _token) => {
			return { metadata: { key: 'value' } };
		});
		participant.isDefault = true;
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
});
