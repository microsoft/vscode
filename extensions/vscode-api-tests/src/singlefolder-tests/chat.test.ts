/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { CancellationToken, chat, ChatAgentRequest, ChatAgentResult2, ChatVariableLevel, Disposable, interactive, InteractiveSession, ProviderResult } from 'vscode';
import { assertNoRpc, closeAllEditors, DeferredPromise, disposeAll } from '../utils';

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
		disposables.push(interactive.registerInteractiveSessionProvider('provider', {
			prepareSession: (_token: CancellationToken): ProviderResult<InteractiveSession> => {
				return {
					requester: { name: 'test' },
					responder: { name: 'test' },
				};
			},
		}));

		const deferred = new DeferredPromise<ChatAgentRequest>();
		const agent = chat.createChatAgent('agent', (request, _context, _progress, _token) => {
			deferred.complete(request);
			return null;
		});
		agent.isDefault = true;
		agent.commandProvider = {
			provideCommands: (_token) => {
				return [{ name: 'hello', description: 'Hello' }];
			}
		};
		disposables.push(agent);
		return deferred;
	}

	test('agent and slash command', async () => {
		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent /hello friend' });
		const request = await deferred.p;
		assert.deepStrictEqual(request.command, 'hello');
		assert.strictEqual(request.prompt, 'friend');
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
		assert.strictEqual(request.prompt, 'hi [#myVar](values:myVar)');
		assert.strictEqual(request.variables['myVar'][0].value, 'myValue');
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
