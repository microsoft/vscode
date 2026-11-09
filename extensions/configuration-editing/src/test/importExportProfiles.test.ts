/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as assert from 'assert';
import 'mocha';
import { GitHubGistProfileContentHandler } from '../importExportProfiles';

type GitHubApi = NonNullable<ConstructorParameters<typeof GitHubGistProfileContentHandler>[0]>;
type AuthenticationApi = NonNullable<ConstructorParameters<typeof GitHubGistProfileContentHandler>[1]>;

function gist(files: vscode.GitHubGistFile[]): vscode.GitHubGist {
	return { id: 'gist-id', htmlUrl: vscode.Uri.parse('https://gist.github.com/gist-id'), files };
}

function file(content: string, overrides: Partial<vscode.GitHubGistFile> = {}): vscode.GitHubGistFile {
	return { content, isBinary: false, truncated: false, ...overrides };
}

suite('GitHub gist profile content handler', () => {

	function setup(options: { readonly read?: () => Promise<vscode.GitHubGist>; readonly create?: () => Promise<vscode.GitHubGist>; readonly acquire?: () => Promise<void> } = {}) {
		const calls: unknown[][] = [];
		const cancellation = new vscode.CancellationTokenSource();
		const github: GitHubApi = {
			getClient: async (sessionId, token) => {
				calls.push(['getClient', sessionId, token === cancellation.token]);
				await options.acquire?.();
				return {
					gists: {
						get: async gistId => { calls.push(['get', gistId]); return options.read ? options.read() : gist([file('{}')]); },
						create: async (request, token) => { calls.push(['create', request, token === cancellation.token]); return options.create ? options.create() : gist([file('{}')]); },
					},
					dispose: () => calls.push(['dispose']),
				};
			},
			getAnonymousClient: async token => {
				calls.push(['getAnonymousClient', token === cancellation.token]);
				await options.acquire?.();
				return {
					gists: { get: async (gistId, token) => { calls.push(['get', gistId, token === cancellation.token]); return options.read ? options.read() : gist([file('{}')]); } },
					dispose: () => calls.push(['dispose']),
				};
			},
		};
		const authentication: AuthenticationApi = {
			getSession: (async (providerId: string, scopes: readonly string[], sessionOptions: vscode.AuthenticationGetSessionOptions) => {
				calls.push(['getSession', providerId, scopes, sessionOptions]);
				return { id: 'chosen-session', accessToken: 'secret-token', account: { id: 'account', label: 'octocat' }, scopes };
			}) as AuthenticationApi['getSession'],
			};
			return { handler: new GitHubGistProfileContentHandler(github, authentication), calls, token: cancellation.token, cancellation };
	}

	test('saves a secret gist with the session chosen by the extension', async () => {
		const { handler, calls, token, cancellation } = setup();
		const result = await handler.saveProfile('My Profile', '{"settings":{}}', token);
		cancellation.dispose();
		assert.deepStrictEqual({ result: result && { id: result.id, link: result.link.toString() }, calls }, {
			result: { id: 'gist-id', link: 'https://gist.github.com/gist-id' },
			calls: [
				['getSession', 'github', ['gist', 'user:email'], { createIfNone: true }],
				['getClient', 'chosen-session', true],
				['create', { public: false, files: { 'My Profile': { content: '{"settings":{}}' } } }, true],
				['dispose'],
			],
		});
	});

	test('reports save failures and still releases the client', async () => {
		const failure = new vscode.GitHubError('The selected GitHub session is not available to this extension.', 'authentication');
		const { handler, calls, token, cancellation } = setup({ create: () => Promise.reject(failure) });
		await assert.rejects(handler.saveProfile('profile', '{}', token), error => error === failure);
		cancellation.dispose();
		assert.deepStrictEqual(calls.map(call => call[0]), ['getSession', 'getClient', 'create', 'dispose']);
	});

	test('reads the first gist file anonymously by id or URI', async () => {
		const { handler, calls, token, cancellation } = setup({ read: async () => gist([file('first'), file('second')]) });
		const byId = await handler.readProfile('gist-id', token);
		const byUri = await handler.readProfile(vscode.Uri.parse('https://gist.github.com/octocat/uri-id'), token);
		cancellation.dispose();
		assert.deepStrictEqual({ byId, byUri, calls }, {
			byId: 'first',
			byUri: 'first',
			calls: [
				['getAnonymousClient', true], ['get', 'gist-id', true], ['dispose'],
				['getAnonymousClient', true], ['get', 'uri-id', true], ['dispose'],
			],
		});
	});

	test('returns null for unreadable gists and failures', async () => {
		const results: (string | null)[] = [];
		for (const read of [
			async () => gist([]),
			async () => gist([file('{"partial', { truncated: true })]),
			async () => gist([file('e30=', { isBinary: true })]),
			async () => { throw new vscode.GitHubError('Not Found', 'notFound', 404); },
		]) {
			const { handler, cancellation } = setup({ read });
			results.push(await handler.readProfile('gist-id'));
			cancellation.dispose();
		}
		const { handler, calls, cancellation } = setup({ acquire: () => Promise.reject(new vscode.GitHubError('Busy', 'rateLimit')) });
		results.push(await handler.readProfile('gist-id'));
		cancellation.dispose();
		assert.deepStrictEqual({ results, calls }, { results: [null, null, null, null, null], calls: [['getAnonymousClient', false]] });
	});

	test('a pre-cancelled read rejects without acquiring a client or requesting a gist', async () => {
		const { handler, calls, token, cancellation } = setup();
		cancellation.cancel();
		await assert.rejects(handler.readProfile('gist-id', token), error => error instanceof vscode.CancellationError);
		cancellation.dispose();
		assert.deepStrictEqual(calls, []);
	});

	test('a read cancelled during the request rejects and still releases the client', async () => {
		const { handler, calls, token, cancellation } = setup({ read: async () => { throw new vscode.CancellationError(); } });
		await assert.rejects(handler.readProfile('gist-id', token), error => error instanceof vscode.CancellationError);
		cancellation.dispose();
		assert.deepStrictEqual(calls, [['getAnonymousClient', true], ['get', 'gist-id', true], ['dispose']]);
	});
});
