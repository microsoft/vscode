/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { CancellationToken, ChatAgentContext, ChatAgentRequest, ChatAgentResult2, ChatVariableLevel, Disposable, Event, EventEmitter, InteractiveSession, ProviderResult, chat, interactive } from 'vscode';
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

	function getDeferredForRequest(): DeferredPromise<ChatAgentRequest> {
		const deferred = new DeferredPromise<ChatAgentRequest>();
		disposables.push(setupAgent()(request => deferred.complete(request.request)));

		return deferred;
	}

	function setupAgent(): Event<{ request: ChatAgentRequest; context: ChatAgentContext }> {
		const emitter = new EventEmitter<{ request: ChatAgentRequest; context: ChatAgentContext }>();
		disposables.push();
		disposables.push(interactive.registerInteractiveSessionProvider('provider', {
			prepareSession: (_token: CancellationToken): ProviderResult<InteractiveSession> => {
				return {
					requester: { name: 'test' },
					responder: { name: 'test' },
				};
			},
		}));

		const agent = chat.createChatAgent('agent', (request, context, _progress, _token) => {
			emitter.fire({ request, context });
			return null;
		});
		agent.isDefault = true;
		agent.commandProvider = {
			provideCommands: (_token) => {
				return [{ name: 'hello', description: 'Hello' }];
			}
		};
		disposables.push(agent);
		return emitter.event;
	}

	test('agent and slash command', async () => {
		const onRequest = setupAgent();
		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent /hello friend' });

		let i = 0;
		onRequest(request => {
			if (i === 0) {
				assert.deepStrictEqual(request.request.command, 'hello');
				assert.strictEqual(request.request.prompt, 'friend');
				i++;
				interactive.sendInteractiveRequestToProvider('provider', { message: '@agent /hello friend' });
			} else {
				assert.strictEqual(request.context.history.length, 1);
				assert.strictEqual(request.context.history[0].agent.agent, 'agent');
				assert.strictEqual(request.context.history[0].command, 'hello');
			}
		});
	});

	test('agent and variable', async () => {
		disposables.push(chat.registerVariable('myVar', 'My variable', {
			resolve(_name, _context, _token) {
				return [{ level: ChatVariableLevel.Full, value: 'myValue' }];
			}
		}));

		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent hi #myVar' });
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

		const deferred = new DeferredPromise<ChatAgentResult2>();
		const agent = chat.createChatAgent('agent', (_request, _context, _progress, _token) => {
			return { metadata: { key: 'value' } };
		});
		agent.isDefault = true;
		agent.commandProvider = {
			provideCommands: (_token) => {
				return [{ name: 'hello', description: 'Hello' }];
			}
		};
		agent.followupProvider = {
			provideFollowups(result, _token) {
				deferred.complete(result);
				return [];
			},
		};
		disposables.push(agent);

		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent /hello friend' });
		const result = await deferred.p;
		assert.deepStrictEqual(result.metadata, { key: 'value' });
	});
});
