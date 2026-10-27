/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { GitHubAuthorizationContext, GitHubCredentialChange } from '../../../../../platform/github/common/githubTypes.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationGetSessionsOptions, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubCredentialProvider } from '../../browser/githubCredentialProvider.js';

suite('Workbench GitHub credential broker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;
	const authorization: GitHubAuthorizationContext = { providerId: 'github', sessionId: 'selected', scopes: ['repo'] };

	function session(overrides: Partial<AuthenticationSession> = {}): AuthenticationSession {
		return { id: 'selected', accessToken: 'selected-token', account: { id: 'account', label: 'Account' }, scopes: ['repo'], ...overrides };
	}

	function setup(sessions = [session()], lookup?: () => Promise<readonly AuthenticationSession[]>) {
		const changed = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const calls: { providerId: string; scopes: readonly string[] | undefined; options: IAuthenticationGetSessionsOptions | undefined; activate: boolean | undefined }[] = [];
		const broker = store.add(new WorkbenchGitHubCredentialProvider(new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = changed.event;
			override async getSessions(providerId: string, scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions, activate?: boolean): Promise<readonly AuthenticationSession[]> {
				calls.push({ providerId, scopes, options, activate });
				return lookup ? lookup() : sessions;
			}
		}()));
		return { broker, sessions, calls, changed };
	}

	test('silently resolves only the selected grant and returns endpoints without a token', async () => {
		const { broker, calls } = setup([session({ id: 'other', accessToken: 'other-token' }), session()]);
		const options = await broker.resolveClient(authorization, signal());
		const token = await broker.getToken(options.authorization, signal());
		assert.deepStrictEqual({ options, token, calls }, {
			options: {
				authorization: { ...authorization, accountId: 'account', authorizationServer: undefined },
				apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
				missionControl: {
					endpoint: {
						apiBaseUri: 'https://api.githubcopilot.com/agents',
						feedApiBaseUri: 'https://api.github.com/cmc_internal/api/agents',
						identityApiBaseUri: 'https://api.github.com/cmc_internal/api/agents',
						integrationId: COPILOT_INTEGRATION_ID,
					},
				},
			},
			token: 'selected-token',
			calls: Array.from({ length: 2 }, () => ({ providerId: 'github', scopes: [], options: { silent: true }, activate: true })),
		});
	});

	for (const mismatch of ['session', 'account', 'scopes', 'issuer'] as const) {
		test(`rejects a ${mismatch} mismatch rather than choosing another grant`, async () => {
			const { broker } = setup();
			const context = {
				...authorization,
				...(mismatch === 'session' ? { sessionId: 'missing' }
					: mismatch === 'account' ? { accountId: 'other' }
						: mismatch === 'scopes' ? { scopes: ['repo', 'gist'] }
							: { authorizationServer: 'https://github.com/login/oauth' }),
			};
			await assert.rejects(broker.resolveClient(context, signal()), { kind: 'authentication' });
			assert.strictEqual(await broker.getToken(context, signal()), undefined);
		});
	}

	test('pins the account even when the caller supplied only the session', async () => {
		const { broker, sessions } = setup();
		const resolved = await broker.resolveClient(authorization, signal());
		sessions[0] = session({ account: { id: 'replacement', label: 'Replacement' }, accessToken: 'replacement-token' });
		assert.deepStrictEqual({
			account: resolved.authorization.accountId,
			token: await broker.getToken(resolved.authorization, signal()),
		}, { account: 'account', token: undefined });
	});

	test('matches reordered scopes without broadening the grant', async () => {
		const { broker } = setup([session({ scopes: ['repo', 'gist'] })]);
		const resolved = await broker.resolveClient({ ...authorization, scopes: ['gist', 'repo'] }, signal());
		assert.deepStrictEqual(resolved.authorization.scopes, ['repo', 'gist']);
		await assert.rejects(broker.resolveClient({ ...authorization, scopes: ['gist'] }, signal()), { kind: 'authentication' });
	});

	for (const [issuer, apiBaseUri, graphQlUri] of [
		['https://enterprise.example.test/login/oauth', 'https://enterprise.example.test/api/v3', 'https://enterprise.example.test/api/graphql'],
		['https://tenant.ghe.com/login/oauth', 'https://api.tenant.ghe.com', 'https://api.tenant.ghe.com/graphql'],
	]) {
		test(`derives enterprise endpoints from the selected session issuer: ${issuer}`, async () => {
			const { broker } = setup([session({ authorizationServer: URI.parse(issuer) })]);
			const context = { ...authorization, providerId: 'github-enterprise', authorizationServer: issuer };
			assert.deepStrictEqual(await broker.resolveClient(context, signal()), {
				authorization: { ...context, accountId: 'account' }, apiBaseUri, graphQlUri, missionControl: undefined,
			});
		});
	}

	for (const issuer of ['http://enterprise.example.test', 'https://user@enterprise.example.test', 'https://enterprise.example.test?query=1', 'https://enterprise.example.test#fragment']) {
		test(`rejects an unsafe enterprise issuer: ${issuer}`, async () => {
			const authorizationServer = URI.parse(issuer);
			const { broker } = setup([session({ authorizationServer })]);
			await assert.rejects(broker.resolveClient({
				...authorization, providerId: 'github-enterprise', authorizationServer: authorizationServer.toString(),
			}, signal()), { kind: 'validation' });
		});
	}

	test('does not guess an enterprise endpoint or send a public GitHub grant to an enterprise host', async () => {
		const { broker, sessions } = setup();
		await assert.rejects(broker.resolveClient({ ...authorization, providerId: 'github-enterprise' }, signal()), { kind: 'authentication' });
		const issuer = 'https://enterprise.example.test/login/oauth';
		sessions[0] = session({ authorizationServer: URI.parse(issuer) });
		await assert.rejects(broker.resolveClient({ ...authorization, authorizationServer: issuer }, signal()), { kind: 'authentication' });
	});

	test('rejects unrelated authentication providers before looking up their sessions', async () => {
		const { broker, calls } = setup();
		await assert.rejects(broker.resolveClient({ ...authorization, providerId: 'unrelated' }, signal()), { kind: 'authentication' });
		assert.deepStrictEqual(calls, []);
	});

	for (const change of ['removed', 'account', 'scopes', 'issuer'] as const) {
		test(`distinguishes token renewal from a ${change} grant change`, async () => {
			const { broker, sessions, changed } = setup();
			await broker.resolveClient(authorization, signal());
			const grantChanges: GitHubCredentialChange[] = [];
			const tokenChanges: GitHubCredentialChange[] = [];
			store.add(broker.onDidChange(event => grantChanges.push(event)));
			store.add(broker.onDidChangeToken(event => tokenChanges.push(event)));
			sessions[0] = { ...sessions[0], accessToken: 'renewed-token' };
			changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [sessions[0]] } });
			const afterRenewal = grantChanges.length;
			const updated = session(change === 'account' ? { account: { id: 'other', label: 'Other' } }
				: change === 'scopes' ? { scopes: ['repo', 'gist'] }
					: change === 'issuer' ? { authorizationServer: URI.parse('https://github.com/login/oauth') } : {});
			changed.fire({
				providerId: 'github', label: 'GitHub',
				event: { added: [], removed: change === 'removed' ? [sessions[0]] : [], changed: change === 'removed' ? [] : [updated] },
			});
			assert.deepStrictEqual({ afterRenewal, grantChanges, tokenChanges }, {
				afterRenewal: 0,
				grantChanges: [{ providerId: 'github', sessionIds: ['selected'] }],
				tokenChanges: [{ providerId: 'github', sessionIds: ['selected'] }],
			});
		});
	}

	test('discards a token lookup result that raced a renewal', async () => {
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		const original = session();
		const renewed = session({ accessToken: 'renewed-token' });
		let calls = 0;
		const { broker, changed } = setup(undefined, async () => ++calls === 1 ? [original] : calls === 2 ? lookup.p : [renewed]);
		await broker.resolveClient(authorization, signal());
		const pending = broker.getToken(authorization, signal());
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [renewed] } });
		await lookup.complete([original]);
		assert.deepStrictEqual({ token: await pending, calls }, { token: 'renewed-token', calls: 3 });
	});

	test('does not publish a session lookup after cancellation', async () => {
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		const { broker } = setup(undefined, () => lookup.p);
		const controller = new AbortController();
		const reason = new Error('Cancelled selection');
		const rejected = assert.rejects(broker.resolveClient(authorization, controller.signal), error => error === reason);
		controller.abort(reason);
		await lookup.complete([session()]);
		await rejected;
	});
});
