/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Config } from '../config';
import { AuthProviderType } from '../github';
import { AccountLinks } from '../common/accountLinks';
import { IGitHubUserInfo } from '../common/gitHubAccount';
import { IHttpClient, IHttpRequest, IHttpResponse } from '../common/http';
import { Log } from '../common/logger';
import { IMicrosoftAuthentication } from '../common/microsoftAuthentication';
import {
	EntraTokenExchange,
	EntraTokenExchangeError,
	EntraTokenExchangeFailure,
	IConfirmationDialog,
	IEntraRenewal
} from '../entraTokenExchange';
import { TestMemento } from './testMemento';

/** What `GitHubServer` derives as its endpoints for github.com. */
const TOKEN_EXCHANGE_URL = 'https://github.com/login/oauth/access_token';
const USER_INFO_URL = 'https://api.github.com/user';
const STORAGE_KEY = 'github.auth.microsoftAccountLinks';
const ACCOUNT: IGitHubUserInfo = { id: '42', accountName: 'mona_contoso', avatarUrl: undefined };
const MICROSOFT_ACCOUNT: vscode.AuthenticationSessionAccountInformation = { id: 'entra-oid', label: 'mona@contoso.com' };

const enum Action {
	SignIn = 0,
	UseDifferentAccount = 1,
	Cancel = -1
}

function jsonResponse(body: Record<string, unknown> | null, status = 200): IHttpResponse {
	return { ok: status >= 200 && status < 300, status, statusText: `HTTP ${status}`, json: async () => body };
}

function success(token: string, scope: string): Record<string, unknown> {
	return {
		access_token: token,
		issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
		token_type: 'bearer',
		expires_in: 3600,
		scope
	};
}

function formOf(request: IHttpRequest): Record<string, string> {
	return Object.fromEntries(new URLSearchParams(request.body));
}

/** How each Microsoft acquisition was asked for. */
interface IAcquisition {
	/** Whether it was allowed to put anything in front of the user. */
	readonly silent: boolean;
	readonly forceNewSession: boolean;
	readonly accountId: string | undefined;
}

interface IHarness {
	readonly exchange: EntraTokenExchange;
	/** Every exchange request that was sent, in order. */
	readonly requests: IHttpRequest[];
	readonly acquisitions: IAcquisition[];
	/** The `Authorization` header `GET /user` was called with. */
	readonly lookups: string[];
	/** The real mapping table the exchange wrote to. */
	readonly accountLinks: AccountLinks;
	readonly confirmations: string[];
}

suite('EntraTokenExchange', () => {

	let logger: Log;
	let realClientSecret: string | undefined;

	suiteSetup(() => {
		logger = new Log(AuthProviderType.github);
		// The secret only exists in builds that have had the distro mixin applied, so stand one in.
		realClientSecret = Config.gitHubClientSecret;
		Config.gitHubClientSecret = 'client-secret';
	});

	suiteTeardown(() => {
		Config.gitHubClientSecret = realClientSecret;
	});

	/**
	 * Builds an exchange over the real account-link table and fakes for the three boundaries it
	 * cannot reach in a test: the Microsoft provider, the network and the modal. By default the user
	 * signs in, the account maps, and both exchanges succeed.
	 */
	function createHarness(overrides: {
		/** Stands in for a host that has no exchange endpoint at all, such as Enterprise Server. */
		noExchangeEndpoint?: boolean;
		microsoftToken?: (call: number) => string | undefined;
		microsoftError?: Error;
		respond?: (call: number) => IHttpResponse;
		requestError?: Error;
		/** What `GET /user` answers, shaped exactly as GitHub shapes it, per call. */
		userInfo?: (call: number) => Record<string, unknown>;
		userInfoError?: Error;
		storageError?: Error;
		choose?: (call: number) => Action;
	} = {}): IHarness {
		const requests: IHttpRequest[] = [];
		const acquisitions: IAcquisition[] = [];
		const lookups: string[] = [];
		const confirmations: string[] = [];

		const memento = new TestMemento();
		memento.updateError = overrides.storageError;
		const accountLinks = new AccountLinks(memento, STORAGE_KEY, logger);

		const microsoft: IMicrosoftAuthentication = {
			getToken: async request => {
				acquisitions.push({
					silent: request.silent === true,
					forceNewSession: request.silent === true ? false : request.forceNewSession,
					accountId: request.account?.id
				});
				if (overrides.microsoftError) {
					throw overrides.microsoftError;
				}
				const token = overrides.microsoftToken
					? overrides.microsoftToken(acquisitions.length - 1)
					: `entra-${acquisitions.length}`;
				return token ? { token, account: MICROSOFT_ACCOUNT } : undefined;
			},
			getAccounts: async () => [MICROSOFT_ACCOUNT]
		};

		const http: IHttpClient = {
			send: async request => {
				if (request.method === 'GET') {
					lookups.push(request.headers.Authorization);
					if (overrides.userInfoError) {
						throw overrides.userInfoError;
					}
					// Answered exactly as GitHub answers it, so the real parsing runs.
					return jsonResponse(overrides.userInfo?.(lookups.length - 1) ?? { id: 42, login: 'mona_contoso', name: 'Mona Lisa' });
				}
				requests.push(request);
				if (overrides.requestError) {
					throw overrides.requestError;
				}
				if (overrides.respond) {
					return overrides.respond(requests.length - 1);
				}
				// The discovery exchange is the one that only asks for `read:user`.
				const requestedScope = formOf(request).scope;
				if (requestedScope === undefined) {
					// Nothing was asked for, so GitHub decides, and answers with its own comma
					// separated list rather than the spaces RFC 6749 asks for.
					return jsonResponse(success('gho_granted', 'read:user,user:email,repo'));
				}
				return jsonResponse(requestedScope === 'read:user'
					? success('gho_discovery', 'read:user')
					: success('gho_granted', requestedScope));
			}
		};

		const confirmation: IConfirmationDialog = {
			show: async (message, ...actions) => {
				confirmations.push(message);
				const action = overrides.choose?.(confirmations.length - 1) ?? Action.SignIn;
				return action === Action.Cancel ? undefined : actions[action];
			}
		};

		const exchange = new EntraTokenExchange(
			logger,
			{
				tokenExchange: overrides.noExchangeEndpoint ? undefined : TOKEN_EXCHANGE_URL,
				userInfo: USER_INFO_URL
			},
			microsoft,
			accountLinks,
			http,
			confirmation);
		return { exchange, requests, acquisitions, lookups, accountLinks, confirmations };
	}

	/** Runs a login and reports the failure classification rather than the thrown object. */
	async function failureOf(harness: IHarness, scopes: string[] = ['read:user', 'user:email']): Promise<string> {
		try {
			await harness.exchange.login(scopes);
			return 'no failure';
		} catch (e) {
			return e instanceof EntraTokenExchangeError ? e.failure : (e as Error).message;
		}
	}

	/** The renewal of a session for the account the default harness resolves. */
	const RENEWAL: IEntraRenewal = {
		scopes: ['read:user', 'user:email'],
		gitHubAccountId: ACCOUNT.id,
		microsoftAccount: MICROSOFT_ACCOUNT
	};

	async function renewalFailureOf(harness: IHarness, renewal: IEntraRenewal = RENEWAL): Promise<string> {
		try {
			await harness.exchange.renew(renewal);
			return 'no failure';
		} catch (e) {
			return e instanceof EntraTokenExchangeError ? e.failure : (e as Error).message;
		}
	}

	test('sends only the fields the grant needs, and nothing that identifies the caller as Microsoft', async () => {
		const harness = createHarness();

		await harness.exchange.login(['read:user', 'user:email', 'repo']);

		assert.deepStrictEqual(harness.requests.map(request => ({
			url: request.url,
			method: request.method,
			headers: request.headers,
			form: formOf(request)
		})), [
			{
				url: 'https://github.com/login/oauth/access_token',
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				// Discovery is least privilege: only what `GET /user` needs.
				form: {
					client_id: Config.gitHubClientId,
					client_secret: 'client-secret',
					grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
					subject_token: 'entra-1',
					subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
					scope: 'read:user'
				}
			},
			{
				url: 'https://github.com/login/oauth/access_token',
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				// The second exchange asks for exactly what the operation requested — no broader
				// Copilot default, and no scope that leaks where the token came from.
				form: {
					client_id: Config.gitHubClientId,
					client_secret: 'client-secret',
					grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
					subject_token: 'entra-1',
					subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
					scope: 'read:user user:email repo'
				}
			}
		]);
	});

	test('uses the discovery token only to read the account, and returns the granted one', async () => {
		const harness = createHarness();

		const result = await harness.exchange.login(['read:user', 'user:email']);

		assert.deepStrictEqual({
			lookups: harness.lookups,
			confirmations: harness.confirmations,
			// Written once the user has agreed to be this account, so a later window can mint a token
			// for it without asking again.
			linked: harness.accountLinks.microsoftAccountFor('mona_contoso'),
			result
		}, {
			// The discovery token never becomes the session and is never seen again, and the token
			// that does become the session is checked against the identity that was agreed to.
			lookups: ['token gho_discovery', 'token gho_granted'],
			confirmations: ['Your organization\'s Microsoft sign-in is linked to this GitHub account:\n\n@mona_contoso\n\nSign in to GitHub with this account?'],
			// The label, not the id: `getAccounts` collapses accounts that share a label, so an id
			// stored here is not necessarily one we could find again.
			linked: 'mona@contoso.com',
			result: {
				token: 'gho_granted',
				// Reported as GitHub reported it: turning it into a deadline is the caller's job.
				expiresIn: 3600,
				account: ACCOUNT
			}
		});
	});

	test('reaches for the account it was told to, and forgets the mapping when the user backs out', async () => {
		const told = createHarness();
		await told.exchange.login(['read:user'], { microsoftAccount: MICROSOFT_ACCOUNT });

		const backedOut = createHarness({ choose: () => Action.Cancel });
		await failureOf(backedOut);

		assert.deepStrictEqual({
			acquisitions: told.acquisitions,
			// The row is what later lets a fresh window mint a token for this identity with nothing
			// shown, so a sign in the user backed out of must not leave one behind.
			cancelledLink: backedOut.accountLinks.microsoftAccountFor('mona_contoso')
		}, {
			acquisitions: [{ silent: false, forceNewSession: false, accountId: 'entra-oid' }],
			cancelledLink: undefined
		});
	});

	test('a failure to remember the mapping never fails the sign in', async () => {
		const harness = createHarness({ storageError: new Error('storage is full') });

		const result = await harness.exchange.login(['read:user', 'user:email']);

		assert.deepStrictEqual({
			token: result.token,
			linked: harness.accountLinks.microsoftAccountFor('mona_contoso')
		}, {
			token: 'gho_granted',
			linked: undefined
		});
	});

	test('cancelling the confirmation never performs the second exchange', async () => {
		const harness = createHarness({ choose: () => Action.Cancel });

		assert.deepStrictEqual({
			failure: await failureOf(harness),
			exchanges: harness.requests.length,
			confirmations: harness.confirmations.length
		}, {
			// Normalized to the provider's usual cancellation contract, not a sign-in failure.
			failure: 'Cancelled',
			exchanges: 1,
			confirmations: 1
		});
	});

	test('choosing a different account repeats the acquisition and the discovery', async () => {
		const harness = createHarness({ choose: call => call === 0 ? Action.UseDifferentAccount : Action.SignIn });

		const result = await harness.exchange.login(['read:user', 'user:email'], { microsoftAccount: MICROSOFT_ACCOUNT });

		assert.deepStrictEqual({
			acquisitions: harness.acquisitions,
			subjectTokens: harness.requests.map(request => formOf(request).subject_token),
			scopes: harness.requests.map(request => formOf(request).scope),
			token: result.token
		}, {
			// The user has told us the account we reached for is the wrong one, so the retry both
			// drops the remembered preference and forces a new session.
			acquisitions: [
				{ silent: false, forceNewSession: false, accountId: 'entra-oid' },
				{ silent: false, forceNewSession: true, accountId: undefined }
			],
			subjectTokens: ['entra-1', 'entra-2', 'entra-2'],
			scopes: ['read:user', 'read:user', 'read:user user:email'],
			token: 'gho_granted'
		});
	});

	test('classifies failures without ever surfacing server supplied text', async () => {
		const oauthError = (code: string) => createHarness({
			respond: () => jsonResponse({ error: code, error_description: 'do-not-surface-this' }, 400)
		});
		const descriptive = oauthError('invalid_client');
		let message = '';
		try {
			await descriptive.exchange.login(['read:user']);
		} catch (e) {
			message = (e as Error).message;
		}

		assert.deepStrictEqual({
			microsoftDismissed: await failureOf(createHarness({ microsoftToken: () => undefined })),
			microsoftFailed: await failureOf(createHarness({ microsoftError: new Error('WAM went away') })),
			microsoftCancelled: await failureOf(createHarness({ microsoftError: new Error('User did not consent to login.') })),
			accountLookupFailed: await failureOf(createHarness({ userInfoError: new Error('Unauthorized') })),
			network: await failureOf(createHarness({ requestError: new Error('ENOTFOUND') })),
			invalidRequest: await failureOf(oauthError('invalid_request')),
			invalidClient: await failureOf(oauthError('invalid_client')),
			invalidScope: await failureOf(oauthError('invalid_scope')),
			unsupportedGrantType: await failureOf(oauthError('unsupported_grant_type')),
			invalidGrant: await failureOf(oauthError('invalid_grant')),
			unknownCode: await failureOf(oauthError('server_error')),
			descriptionLeaked: message.includes('do-not-surface-this')
		}, {
			microsoftDismissed: 'Cancelled',
			microsoftFailed: EntraTokenExchangeFailure.MicrosoftSignIn,
			microsoftCancelled: 'Cancelled',
			accountLookupFailed: EntraTokenExchangeFailure.Identity,
			network: EntraTokenExchangeFailure.Network,
			// A well formed rejection of the request itself: no amount of retrying changes it.
			invalidRequest: EntraTokenExchangeFailure.Configuration,
			invalidClient: EntraTokenExchangeFailure.Configuration,
			invalidScope: EntraTokenExchangeFailure.Configuration,
			unsupportedGrantType: EntraTokenExchangeFailure.Configuration,
			// Ambiguous by design: we must not guess that the user belongs on another host.
			invalidGrant: EntraTokenExchangeFailure.Identity,
			unknownCode: EntraTokenExchangeFailure.Protocol,
			descriptionLeaked: false
		});
	});

	test('refuses to exchange at all when the build has no client secret', async () => {
		const harness = createHarness();
		Config.gitHubClientSecret = undefined;
		try {
			assert.deepStrictEqual({
				failure: await failureOf(harness),
				// The subject token must never reach the wire when we already know it cannot work.
				exchanges: harness.requests.length,
				// And the user must not be put through a Microsoft sign in that cannot go anywhere.
				acquisitions: harness.acquisitions.length
			}, {
				failure: EntraTokenExchangeFailure.Configuration,
				exchanges: 0,
				acquisitions: 0
			});
		} finally {
			Config.gitHubClientSecret = 'client-secret';
		}
	});

	test('refuses to exchange against a host that has no exchange endpoint', async () => {
		// Self-hosted GitHub Enterprise Server: the identity mapping is a service GitHub runs, so
		// there is nothing to exchange against.
		const harness = createHarness({ noExchangeEndpoint: true });

		assert.deepStrictEqual({
			failure: await failureOf(harness),
			exchanges: harness.requests.length,
			acquisitions: harness.acquisitions.length
		}, {
			failure: EntraTokenExchangeFailure.Configuration,
			exchanges: 0,
			acquisitions: 0
		});
	});

	test('rejects success responses that are not a valid token exchange', async () => {
		const responding = (body: Record<string, unknown>) => createHarness({ respond: () => jsonResponse(body) });

		assert.deepStrictEqual({
			notAnObject: await failureOf(createHarness({ respond: () => jsonResponse(null) })),
			emptyToken: await failureOf(responding({ ...success('x', 'read:user'), access_token: '' })),
			wrongIssuedType: await failureOf(responding({ ...success('x', 'read:user'), issued_token_type: 'urn:ietf:params:oauth:token-type:refresh_token' })),
			wrongTokenType: await failureOf(responding({ ...success('x', 'read:user'), token_type: 'mac' })),
			missingExpiry: await failureOf(responding({ ...success('x', 'read:user'), expires_in: undefined })),
			negativeExpiry: await failureOf(responding({ ...success('x', 'read:user'), expires_in: -1 })),
			invalidScopes: await failureOf(responding({ ...success('x', 'read:user'), scope: ['read:user'] })),
			errorlessFailure: await failureOf(createHarness({ respond: () => jsonResponse({}, 500) }))
		}, {
			notAnObject: EntraTokenExchangeFailure.Protocol,
			emptyToken: EntraTokenExchangeFailure.Protocol,
			wrongIssuedType: EntraTokenExchangeFailure.Protocol,
			wrongTokenType: EntraTokenExchangeFailure.Protocol,
			missingExpiry: EntraTokenExchangeFailure.Protocol,
			negativeExpiry: EntraTokenExchangeFailure.Protocol,
			invalidScopes: EntraTokenExchangeFailure.Protocol,
			errorlessFailure: EntraTokenExchangeFailure.Protocol
		});
	});

	test('takes the token whatever the granted scopes look like', async () => {
		// GitHub may narrow the grant, answer with its own comma separated list rather than the
		// RFC 6749 spacing, or say nothing at all. None of it decides the session's scopes, so the
		// only thing that matters is that the token still comes back.
		const tokenFor = async (granted: string | undefined) => {
			const harness = createHarness({
				respond: call => jsonResponse(call === 0
					? success('gho_discovery', 'read:user')
					: { ...success('gho_granted', granted ?? ''), scope: granted })
			});
			return (await harness.exchange.login(['read:user', 'user:email'])).token;
		};

		assert.deepStrictEqual({
			narrowed: await tokenFor('read:user'),
			commaSeparated: await tokenFor('read:user,user:email'),
			unreported: await tokenFor(undefined)
		}, {
			narrowed: 'gho_granted',
			commaSeparated: 'gho_granted',
			unreported: 'gho_granted'
		});
	});

	test('renews in one exchange, silently, for the scopes the session already has', async () => {
		const harness = createHarness();

		const renewed = await harness.exchange.renew(RENEWAL);

		assert.deepStrictEqual({
			acquisitions: harness.acquisitions,
			// One exchange, not two: there is no identity to discover, only one to check.
			scopes: harness.requests.map(request => formOf(request).scope),
			subjectTokens: harness.requests.map(request => formOf(request).subject_token),
			// And the check runs against the token that is about to become the session.
			lookups: harness.lookups,
			// Nothing is put in front of the user. They confirmed this identity once already.
			confirmations: harness.confirmations,
			renewed
		}, {
			acquisitions: [{ silent: true, forceNewSession: false, accountId: 'entra-oid' }],
			scopes: ['read:user user:email'],
			subjectTokens: ['entra-1'],
			lookups: ['token gho_granted'],
			confirmations: [],
			// The account is handed back rather than only checked, so the session built from this
			// carries the same label and avatar a freshly created one would.
			renewed: { token: 'gho_granted', expiresIn: 3600, account: ACCOUNT, scopes: ['read:user', 'user:email'] }
		});
	});

	test('asks for no scopes at all when the caller named none, and takes what GitHub grants', async () => {
		const harness = createHarness();

		const renewed = await harness.exchange.renew({ ...RENEWAL, scopes: undefined });

		assert.deepStrictEqual({
			// Absent, not empty: RFC 8693 leaves the grant up to the server only when the field is
			// left out entirely.
			scope: formOf(harness.requests[0]).scope,
			renewed
		}, {
			scope: undefined,
			renewed: {
				token: 'gho_granted',
				expiresIn: 3600,
				account: ACCOUNT,
				// GitHub's own comma separated answer, split back apart so the session can be found
				// by a scoped lookup.
				scopes: ['read:user', 'user:email', 'repo']
			}
		});
	});

	test('refuses a renewed token that GitHub maps to a different account', async () => {
		// The mapping lives on GitHub's side and can be repointed without us hearing about it.
		const harness = createHarness({ userInfo: () => ({ id: 99, login: 'someone_else' }) });

		assert.deepStrictEqual({
			failure: await renewalFailureOf(harness),
			// The token was minted before the mismatch could be known. What matters is that it is
			// dropped rather than handed back.
			exchanges: harness.requests.length,
			lookups: harness.lookups
		}, {
			// Its own classification, and not the catch-all one shared with an unmapped identity or
			// an unreachable lookup: this is the only failure that names somebody else, and it is the
			// only one a caller may throw away the user's remembered consent over.
			failure: EntraTokenExchangeFailure.AccountMismatch,
			exchanges: 1,
			lookups: ['token gho_granted']
		});
	});

	test('refuses a granted token that maps somewhere other than the account the user confirmed', async () => {
		// The confirmation can stay open for as long as the user likes, and what it was answered
		// about is state GitHub holds, so the token that is about to become the session is checked
		// rather than assumed to still be for the account that was shown.
		const harness = createHarness({
			userInfo: call => call === 0 ? { id: 42, login: 'mona_contoso' } : { id: 99, login: 'someone_else' }
		});

		assert.deepStrictEqual({
			failure: await failureOf(harness),
			lookups: harness.lookups,
			// Neither account may be remembered. The user never agreed to @someone_else, and no token
			// was published for @mona_contoso.
			links: harness.accountLinks.linkedAccounts()
		}, {
			failure: EntraTokenExchangeFailure.AccountMismatch,
			lookups: ['token gho_discovery', 'token gho_granted'],
			links: []
		});
	});

	test('gives up rather than prompting when Microsoft cannot answer silently', async () => {
		const harness = createHarness({ microsoftToken: () => undefined });

		assert.deepStrictEqual({
			failure: await renewalFailureOf(harness),
			silent: harness.acquisitions.map(acquisition => acquisition.silent),
			// Nothing goes on the wire, and nothing goes on the screen.
			exchanges: harness.requests.length,
			confirmations: harness.confirmations.length
		}, {
			failure: EntraTokenExchangeFailure.MicrosoftSignIn,
			silent: [true],
			exchanges: 0,
			confirmations: 0
		});
	});

	test('refuses to renew against a host or a build that cannot exchange at all', async () => {
		const noEndpoint = createHarness({ noExchangeEndpoint: true });
		const noSecret = createHarness();
		Config.gitHubClientSecret = undefined;
		let withoutSecret: string;
		try {
			withoutSecret = await renewalFailureOf(noSecret);
		} finally {
			Config.gitHubClientSecret = 'client-secret';
		}

		assert.deepStrictEqual({
			withoutEndpoint: await renewalFailureOf(noEndpoint),
			withoutSecret,
			// Neither one reaches for a Microsoft token it could never spend.
			acquisitions: noEndpoint.acquisitions.length + noSecret.acquisitions.length
		}, {
			withoutEndpoint: EntraTokenExchangeFailure.Configuration,
			withoutSecret: EntraTokenExchangeFailure.Configuration,
			acquisitions: 0
		});
	});
});
