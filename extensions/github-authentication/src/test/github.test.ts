/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { AccountLinks } from '../common/accountLinks';
import { IGitHubUserInfo } from '../common/gitHubAccount';
import { Log } from '../common/logger';
import { EntraTokenExchangeError, EntraTokenExchangeFailure, IEntraRenewal, IEntraRenewedToken } from '../entraTokenExchange';
import { AuthProviderType, GitHubAuthenticationProvider } from '../github';
import { TestMemento } from './testMemento';

interface TestGitHubAuthenticationProvider {
	readonly _keychain: {
		getToken(): Promise<string>;
		deleteToken(): Promise<void>;
	};
	readonly _githubServer: {
		getUserInfo(token: string): Promise<{ id: string; accountName: string; avatarUrl: string | undefined }>;
	};
	readonly _logger: {
		error(message: string): void;
		info(message: string): void;
		trace(message: string): void;
	};
	readSessions(): Promise<vscode.AuthenticationSession[]>;
	storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void>;
}

suite('GitHub session persistence', () => {
	test('does not loop when Codespaces secret storage drops hydrated account data', async () => {
		const storedSessions = JSON.stringify([{
			id: 'session-id',
			scopes: ['repo'],
			accessToken: 'access-token'
		}]);
		let userInfoRequests = 0;
		let secretWrites = 0;
		const secretChangeReads: Promise<vscode.AuthenticationSession[]>[] = [];

		const provider: TestGitHubAuthenticationProvider = {
			_keychain: {
				getToken: async () => storedSessions,
				deleteToken: async () => { }
			},
			_githubServer: {
				getUserInfo: async _token => {
					userInfoRequests++;
					return {
						id: 'account-id',
						accountName: 'octocat',
						avatarUrl: 'https://avatars.githubusercontent.com/u/1'
					};
				}
			},
			_logger: {
				error: _message => { },
				info: _message => { },
				trace: _message => { }
			},
			readSessions: GitHubAuthenticationProvider.prototype['readSessions'],
			storeSessions: async _sessions => {
				secretWrites++;
				// Browser secret storage fires a change event for every write. The Codespaces
				// provider then exposes the original accountless session on the next read.
				if (secretWrites === 1) {
					secretChangeReads.push(provider.readSessions());
				}
			}
		};

		const sessions = await provider.readSessions();
		await Promise.all(secretChangeReads);

		assert.deepStrictEqual({
			account: {
				id: sessions[0].account.id,
				label: sessions[0].account.label,
				icon: sessions[0].account.icon?.toString()
			},
			userInfoRequests,
			secretWrites
		}, {
			account: {
				id: 'account-id',
				label: 'octocat',
				icon: 'https://avatars.githubusercontent.com/u/1'
			},
			userInfoRequests: 1,
			secretWrites: 0
		});
	});
});

/**
 * The sessions brokered through Microsoft, which only ever live in this process: rebuilding them in
 * a window that never had them, renewing them when their token runs out, and letting go of them.
 *
 * Driven through the real `getSessions`, over the real account-link table, with the provider's own
 * state assigned onto its prototype. Constructing one for real needs a full `ExtensionContext`, and
 * calling the private methods one at a time would test the pieces rather than the order they run in,
 * which is where every one of these bugs lives.
 */
suite('GitHub Microsoft-brokered sessions', () => {

	const STORAGE_KEY = 'github.auth.microsoftAccountLinks';
	const SCOPES = ['read:user', 'repo'];
	const MICROSOFT_ACCOUNT: vscode.AuthenticationSessionAccountInformation = { id: 'entra-oid', label: 'mona@contoso.com' };
	const GITHUB_ACCOUNT: IGitHubUserInfo = { id: '42', accountName: 'mona_contoso', avatarUrl: undefined };

	interface ITransientSession {
		readonly session: vscode.AuthenticationSession;
		readonly expiresAt: number;
	}

	/** Just enough of the provider's own state for the paths under test to run against. */
	interface IProviderState {
		_logger: Log;
		_accountLinks: AccountLinks;
		_accountsSeen: Set<string>;
		_persistedSessionsPromise: Promise<vscode.AuthenticationSession[]>;
		_transientSessions: Map<string, ITransientSession>;
		_renewals: Map<string, Promise<vscode.AuthenticationSession | undefined>>;
		_restores: Map<string, Promise<vscode.AuthenticationSession | undefined>>;
		_restoresTried: Set<string>;
		_microsoftGeneration: number;
		_microsoft: { getAccounts(): Promise<vscode.AuthenticationSessionAccountInformation[]> };
		_githubServer: {
			renewWithMicrosoft(renewal: IEntraRenewal): Promise<IEntraRenewedToken>;
			sendAdditionalTelemetryInfo(session: vscode.AuthenticationSession): Promise<void>;
		};
		_sessionChangeEmitter: { fire(e: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent): void };
	}

	interface IHarness {
		readonly provider: GitHubAuthenticationProvider;
		readonly state: IProviderState;
		readonly accountLinks: AccountLinks;
		/** Every renewal the provider put on the wire, in order. */
		readonly renewals: IEntraRenewal[];
		/** What the provider told VS Code changed, as `verb account` for each session. */
		readonly announced: string[];
		/** The sessions still held in memory, as `account until` for each. */
		heldSessions(): string[];
	}

	let logger: Log;

	suiteSetup(() => {
		logger = new Log(AuthProviderType.github);
	});

	function sessionFor(account: string, id: string, accessToken: string): vscode.AuthenticationSession {
		return { id, accessToken, account: { id: '42', label: account }, scopes: SCOPES };
	}

	function createHarness(overrides: {
		/** Rows already remembered, as `[Microsoft account, GitHub account]`. */
		links?: readonly (readonly [string, vscode.AuthenticationSessionAccountInformation])[];
		persisted?: readonly vscode.AuthenticationSession[];
		/** Sessions already held in memory, and how long each has left in milliseconds. */
		transient?: readonly (readonly [vscode.AuthenticationSession, number])[];
		microsoftAccounts?: (call: number) => vscode.AuthenticationSessionAccountInformation[];
		renew?: (call: number, renewal: IEntraRenewal) => Promise<IEntraRenewedToken>;
	} = {}): IHarness {
		const renewals: IEntraRenewal[] = [];
		const announced: string[] = [];
		const accountLinks = new AccountLinks(new TestMemento(), STORAGE_KEY, logger);
		const transientSessions = new Map<string, ITransientSession>(
			(overrides.transient ?? []).map(([session, remaining]) => [session.id, { session, expiresAt: Date.now() + remaining }]));
		let microsoftReads = 0;

		const state: IProviderState = {
			_logger: logger,
			_accountLinks: accountLinks,
			_accountsSeen: new Set<string>(),
			_persistedSessionsPromise: Promise.resolve([...overrides.persisted ?? []]),
			_transientSessions: transientSessions,
			_renewals: new Map(),
			_restores: new Map(),
			_restoresTried: new Set(),
			_microsoftGeneration: 0,
			_microsoft: {
				getAccounts: async () => overrides.microsoftAccounts?.(microsoftReads++) ?? [MICROSOFT_ACCOUNT]
			},
			_githubServer: {
				renewWithMicrosoft: async renewal => {
					renewals.push(renewal);
					return overrides.renew
						? await overrides.renew(renewals.length - 1, renewal)
						: { token: `gho_${renewals.length}`, expiresIn: 3600, account: GITHUB_ACCOUNT, scopes: renewal.scopes ?? SCOPES };
				},
				sendAdditionalTelemetryInfo: async () => { }
			},
			_sessionChangeEmitter: {
				fire: e => {
					for (const [verb, sessions] of [['added', e.added], ['removed', e.removed], ['changed', e.changed]] as const) {
						announced.push(...(sessions ?? []).map(session => `${verb} ${session.account.label}`));
					}
				}
			}
		};

		// One object, reached two ways: the provider's own methods run against exactly the state a
		// test reads and writes, rather than against a copy of it.
		const provider = Object.assign(Object.create(GitHubAuthenticationProvider.prototype), state);
		return {
			provider: provider as GitHubAuthenticationProvider,
			state: provider as IProviderState,
			accountLinks,
			renewals,
			announced,
			heldSessions: () => [...transientSessions.values()]
				.map(held => `${held.session.account.label} ${held.expiresAt > Date.now() ? 'live' : 'expired'}`)
				.sort()
		};
	}

	async function withLink(harness: IHarness): Promise<IHarness> {
		await harness.accountLinks.link(MICROSOFT_ACCOUNT.label, { id: GITHUB_ACCOUNT.id, label: GITHUB_ACCOUNT.accountName });
		return harness;
	}

	test('rebuilds a remembered account in a window that never had the session', async () => {
		const harness = await withLink(createHarness());

		const sessions = await harness.provider.getSessions(SCOPES);

		assert.deepStrictEqual({
			// The token never survives a reload; the row recording what the user agreed to does, and
			// that is enough to mint the session again with nothing shown to them.
			accounts: sessions.map(session => session.account.label),
			scopes: sessions.map(session => session.scopes),
			renewals: harness.renewals,
			announced: harness.announced,
			held: harness.heldSessions()
		}, {
			accounts: ['mona_contoso'],
			scopes: [SCOPES],
			renewals: [{ scopes: SCOPES, gitHubAccountId: '42', microsoftAccount: MICROSOFT_ACCOUNT }],
			announced: ['added mona_contoso'],
			held: ['mona_contoso live']
		});
	});

	test('keeps what the user agreed to when a restore fails for a reason that says nothing about who they are', async () => {
		const ambiguous = async (failure: EntraTokenExchangeFailure) => {
			const harness = await withLink(createHarness({
				renew: async () => { throw new EntraTokenExchangeError(failure, 'nope'); }
			}));
			await harness.provider.getSessions(SCOPES);
			// A read happens constantly and from several callers at once, so a failure that cannot be
			// acted on must not put two round trips on the wire every time.
			await harness.provider.getSessions(SCOPES);
			return { rows: harness.accountLinks.linkedAccounts().length, attempts: harness.renewals.length };
		};

		assert.deepStrictEqual({
			unmappedOrUnreachable: await ambiguous(EntraTokenExchangeFailure.Identity),
			network: await ambiguous(EntraTokenExchangeFailure.Network)
		}, {
			// `Identity` covers an unmapped account, a rejected grant and a `GET /user` that could not
			// be reached. None of them say the row points at the wrong person, and the row is shared
			// by every window, so dropping it on one would sign the user out everywhere for good.
			unmappedOrUnreachable: { rows: 1, attempts: 1 },
			network: { rows: 1, attempts: 1 }
		});
	});

	test('forgets what the user agreed to only when GitHub answers for somebody else', async () => {
		const harness = await withLink(createHarness({
			renew: async () => { throw new EntraTokenExchangeError(EntraTokenExchangeFailure.AccountMismatch, 'somebody else'); }
		}));

		const sessions = await harness.provider.getSessions(SCOPES);

		assert.deepStrictEqual({
			sessions: sessions.length,
			// The one failure that positively names a different account. The row describes an identity
			// the user never agreed to, so keeping it would leave every later restore reaching for the
			// wrong person.
			rows: harness.accountLinks.linkedAccounts()
		}, {
			sessions: 0,
			rows: []
		});
	});

	test('throws away a restored token when its Microsoft account was signed out while it was in flight', async () => {
		const harness: IHarness = await withLink(createHarness({
			// Signed in when the restore reads the list, gone by the time it has a token to publish.
			microsoftAccounts: call => call === 0 ? [MICROSOFT_ACCOUNT] : [],
			// The sign out lands while the exchange is on the wire, which is exactly the window the
			// eviction it triggers cannot see, because the session does not exist yet.
			renew: async (_call, renewal) => {
				harness.state._microsoftGeneration++;
				return { token: 'gho_late', expiresIn: 3600, account: GITHUB_ACCOUNT, scopes: renewal.scopes ?? SCOPES };
			}
		}));

		const sessions = await harness.provider.getSessions(SCOPES);

		assert.deepStrictEqual({
			// Publishing it would hand back an account the user has just removed the only way in to,
			// and that nothing can renew.
			sessions: sessions.length,
			announced: harness.announced,
			held: harness.heldSessions()
		}, {
			sessions: 0,
			announced: [],
			held: []
		});
	});

	test('settles every session whose token has run out, not only when there is nothing to hand back', async () => {
		const harness = await withLink(createHarness({
			// Another account, signed in the ordinary way, so it has no expiry and is always usable.
			persisted: [sessionFor('hubot', 'persisted', 'gho_persisted')],
			transient: [[sessionFor('mona_contoso', 'expired', 'gho_stale'), -1000]]
		}));

		const sessions = await harness.provider.getSessions(SCOPES);

		assert.deepStrictEqual({
			accounts: sessions.map(session => session.account.label).sort(),
			// An expired session left unprocessed is never handed out, never renewed and never
			// reported as removed, but stays a candidate on every read for the life of the window.
			held: harness.heldSessions(),
			// Renewed in place, so it keeps its id and is reported as changed rather than as one
			// account going away and another arriving.
			announced: harness.announced,
			tokens: sessions.map(session => session.accessToken).sort()
		}, {
			accounts: ['hubot', 'mona_contoso'],
			held: ['mona_contoso live'],
			announced: ['changed mona_contoso'],
			tokens: ['gho_1', 'gho_persisted']
		});
	});
});
