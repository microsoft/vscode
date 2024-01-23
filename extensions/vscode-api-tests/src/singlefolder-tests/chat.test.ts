/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { CancellationToken, chat, ChatAgentRequest, ChatVariableLevel, Disposable, interactive, InteractiveSession, ProviderResult } from 'vscode';
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
		agent.subCommandProvider = {
			provideSubCommands: (_token) => {
				return [{ name: 'hello', description: 'Hello' }];
			}
		};
		disposables.push(agent);
		return deferred;
	}

	test('agent and slash command', async () => {
		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent /hello friend' });
		const lastResult = await deferred.p;
		assert.deepStrictEqual(lastResult.slashCommand, { name: 'hello', description: 'Hello' });
		assert.strictEqual(lastResult.prompt, 'friend');
	});

	test('agent and variable', async () => {
		disposables.push(chat.registerVariable('myVar', 'My variable', {
			resolve(_name, _context, _token) {
				return [{ level: ChatVariableLevel.Full, value: 'myValue' }];
			}
		}));

		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: '@agent hi #myVar' });
		const lastResult = await deferred.p;
		assert.strictEqual(lastResult.prompt, 'hi [#myVar](values:myVar)');
		assert.strictEqual(lastResult.variables['myVar'][0].value, 'myValue');
	});
});
