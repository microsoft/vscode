/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { CancellationToken, CompletionItemKind, Disposable, interactive, InteractiveProgress, InteractiveRequest, InteractiveResponseForProgress, InteractiveSession, InteractiveSessionState, Progress, ProviderResult } from 'vscode';
import { assertNoRpc, closeAllEditors, DeferredPromise, disposeAll } from '../utils';

suite('InteractiveSessionProvider', () => {
	let disposables: Disposable[] = [];
	setup(async () => {
		disposables = [];
	});

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
		disposeAll(disposables);
	});

	function getDeferredForRequest(): DeferredPromise<InteractiveRequest> {
		const deferred = new DeferredPromise<InteractiveRequest>();
		disposables.push(interactive.registerInteractiveSessionProvider('provider', {
			prepareSession: (_initialState: InteractiveSessionState | undefined, _token: CancellationToken): ProviderResult<InteractiveSession> => {
				return {
					requester: { name: 'test' },
					responder: { name: 'test' },
				};
			},

			provideResponseWithProgress: (request: InteractiveRequest, _progress: Progress<InteractiveProgress>, _token: CancellationToken): ProviderResult<InteractiveResponseForProgress> => {
				deferred.complete(request);
				return null;
			},

			provideSlashCommands: (_session, _token) => {
				return [{ command: 'hello', title: 'Hello', kind: CompletionItemKind.Text }];
			},

			removeRequest: (_session: InteractiveSession, _requestId: string): void => {
				throw new Error('Function not implemented.');
			}
		}));
		return deferred;
	}

	test('plain text query', async () => {
		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: 'hello' });
		const lastResult = await deferred.p;
		assert.strictEqual(lastResult.message, 'hello');
	});

	test('slash command', async () => {
		const deferred = getDeferredForRequest();
		interactive.sendInteractiveRequestToProvider('provider', { message: '/hello' });
		const lastResult = await deferred.p;
		assert.strictEqual(lastResult.message, '/hello');
	});
});
