/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { GitHubResultDto, IGitHubCreateGistDto, IGitHubGistDto, MainThreadGitHubShape } from '../../common/extHost.protocol.js';
import { createGitHubApi, ExtHostGitHub, GitHubError } from '../../common/extHostGitHub.js';

const gistDto: IGitHubGistDto = {
	id: 'gist-id', htmlUrl: 'https://gist.github.com/gist-id',
	files: [{ content: '{}', isBinary: false, truncated: false }],
};

type Call = readonly [string, ...unknown[]];

class TestMainThreadGitHub implements MainThreadGitHubShape {
	readonly calls: Call[] = [];
	acquireResult: GitHubResultDto<void> = { kind: 'ok', value: undefined };
	/** When set, acquisition rejects with this value instead of returning a result. */
	acquireThrows: unknown;
	operation: (token: CancellationToken) => Promise<GitHubResultDto<IGitHubGistDto>> = async () => ({ kind: 'ok', value: gistDto });

	async $getClient(handle: number, extensionId: string, sessionId: string): Promise<GitHubResultDto<void>> {
		this.calls.push(['getClient', handle, extensionId, sessionId]);
		return this._acquire();
	}

	async $getAnonymousClient(handle: number, extensionId: string): Promise<GitHubResultDto<void>> {
		this.calls.push(['getAnonymousClient', handle, extensionId]);
		return this._acquire();
	}

	$releaseClient(handle: number): void {
		this.calls.push(['releaseClient', handle]);
	}

	$getGist(handle: number, gistId: string, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		this.calls.push(['getGist', handle, gistId]);
		return this.operation(token);
	}

	$createGist(handle: number, gist: IGitHubCreateGistDto, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		this.calls.push(['createGist', handle, JSON.parse(JSON.stringify(gist))]);
		return this.operation(token);
	}

	dispose(): void { }

	private async _acquire(): Promise<GitHubResultDto<void>> {
		if (this.acquireThrows !== undefined) {
			throw this.acquireThrows;
		}
		return this.acquireResult;
	}
}

function extension(enabledApiProposals: string[]): IExtensionDescription {
	return { ...nullExtensionDescription, identifier: new ExtensionIdentifier('vscode.configuration-editing'), enabledApiProposals };
}

async function rejection(promise: Thenable<unknown>): Promise<{ type: string; code?: string; status?: number; message: string }> {
	try {
		await promise;
	} catch (error) {
		return error instanceof GitHubError ? { type: 'GitHubError', code: error.code, status: error.status, message: error.message }
			: { type: error instanceof CancellationError ? 'CancellationError' : error.constructor.name, message: error.message };
	}
	throw new Error('Expected a rejection');
}

suite('ExtHostGitHub', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(proposals = ['github']) {
		const mainThread = new TestMainThreadGitHub();
		const api = createGitHubApi(extension(proposals), new ExtHostGitHub(mainThread));
		return { mainThread, api };
	}

	test('requires the github API proposal', async () => {
		const { api, mainThread } = setup(['profileContentHandlers']);
		assert.throws(() => api.getClient('session'), /CANNOT use API proposal: github/);
		assert.throws(() => api.getAnonymousClient(), /CANNOT use API proposal: github/);
		assert.deepStrictEqual({ methods: Object.keys(api).sort(), calls: mainThread.calls }, {
			methods: ['getAnonymousClient', 'getClient'],
			calls: [],
		});
	});

	test('binds the requested session, maps gists and releases once on dispose', async () => {
		const { api, mainThread } = setup();
		const client = await api.getClient('selected-session');
		const created = await client.gists.create({ public: false, files: { profile: { content: '{}' } } });
		const read = await client.gists.get('gist-id');
		client.dispose();
		client.dispose();
		const afterDispose = await rejection(client.gists.get('gist-id'));

		assert.deepStrictEqual({
			created: { ...created, htmlUrl: created.htmlUrl.toString() },
			isUri: URI.isUri(read.htmlUrl),
			frozen: Object.isFrozen(client) && Object.isFrozen(client.gists) && Object.isFrozen(read.files),
			afterDispose,
			calls: mainThread.calls,
		}, {
			created: { ...gistDto, htmlUrl: 'https://gist.github.com/gist-id' },
			isUri: true,
			frozen: true,
			afterDispose: { type: 'GitHubError', code: 'disposed', status: undefined, message: 'The GitHub client has been disposed.' },
			calls: [
				['getClient', 0, 'vscode.configuration-editing', 'selected-session'],
				['createGist', 0, { public: false, files: { profile: { content: '{}' } } }],
				['getGist', 0, 'gist-id'],
				['releaseClient', 0],
			],
		});
	});

	test('reports acquisition failures as typed errors and releases the handle', async () => {
		const { api, mainThread } = setup();
		mainThread.acquireResult = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
		const unavailable = await rejection(api.getClient('stale-session'));
		mainThread.acquireResult = { kind: 'canceled' };
		const canceled = await rejection(api.getAnonymousClient());
		// A terminated RPC connection rejects with a serialized cancellation, not an Error instance.
		mainThread.acquireThrows = { $isError: true, name: 'Canceled', message: 'Canceled' };
		const connectionLost = await rejection(api.getAnonymousClient());
		const cancelled = store.add(new CancellationTokenSource());
		cancelled.cancel();
		const preCancelled = await rejection(api.getAnonymousClient(cancelled.token));
		const preCancelledSession = await rejection(api.getClient('session', cancelled.token));
		const invalidSessionId = await rejection(Promise.resolve().then(() => api.getClient('')));

		assert.deepStrictEqual({ unavailable, canceled, connectionLost, preCancelled, preCancelledSession, invalidSessionId: invalidSessionId.message, calls: mainThread.calls }, {
			unavailable: { type: 'GitHubError', code: 'authentication', status: undefined, message: 'The selected GitHub session is not available to this extension.' },
			canceled: { type: 'CancellationError', message: 'Canceled' },
			connectionLost: { type: 'CancellationError', message: 'Canceled' },
			preCancelled: { type: 'CancellationError', message: 'Canceled' },
			preCancelledSession: { type: 'CancellationError', message: 'Canceled' },
			invalidSessionId: 'Illegal argument: sessionId',
			calls: [
				['getClient', 0, 'vscode.configuration-editing', 'stale-session'],
				['releaseClient', 0],
				['getAnonymousClient', 1, 'vscode.configuration-editing'],
				['releaseClient', 1],
				['getAnonymousClient', 2, 'vscode.configuration-editing'],
				['releaseClient', 2],
			],
		});
	});

	test('propagates request errors and cancellation, and cancels in-flight requests on dispose', async () => {
		const { api, mainThread } = setup();
		const client: vscode.GitHubAnonymousClient = await api.getAnonymousClient();

		mainThread.operation = async () => ({ kind: 'error', error: { code: 'notFound', message: 'Not Found', status: 404 } });
		const notFound = await rejection(client.gists.get('missing'));

		const observed: boolean[] = [];
		mainThread.operation = token => {
			const result = new DeferredPromise<GitHubResultDto<IGitHubGistDto>>();
			store.add(token.onCancellationRequested(() => {
				observed.push(true);
				result.complete({ kind: 'canceled' });
			}));
			return result.p;
		};
		const source = store.add(new CancellationTokenSource());
		const cancelledRequest = rejection(client.gists.get('slow', source.token));
		source.cancel();
		const disposedRequest = rejection(client.gists.get('slow'));
		client.dispose();

		assert.deepStrictEqual({ notFound, cancelled: await cancelledRequest, disposed: await disposedRequest, observed }, {
			notFound: { type: 'GitHubError', code: 'notFound', status: 404, message: 'Not Found' },
			cancelled: { type: 'CancellationError', message: 'Canceled' },
			disposed: { type: 'CancellationError', message: 'Canceled' },
			observed: [true, true],
		});
	});
});
