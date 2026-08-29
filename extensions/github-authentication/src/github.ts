/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { Keychain } from './common/keychain';
import { GitHubServer, IGitHubServer } from './githubServer';
import { EntraTokenExchangeError, EntraTokenExchangeFailure, IEntraRenewedToken } from './entraTokenExchange';
import { PromiseAdapter, arrayEquals, promiseFromEvent } from './common/utils';
import { ExperimentationTelemetry } from './common/experimentationService';
import { Log } from './common/logger';
import { AccountLinks, IAccountLink } from './common/accountLinks';
import { IGitHubUserInfo } from './common/gitHubAccount';
import { MICROSOFT_PROVIDER_ID, MicrosoftAuthentication } from './common/microsoftAuthentication';
import { crypto } from './node/crypto';
import { TIMED_OUT_ERROR, USER_CANCELLATION_ERROR } from './common/errors';
import { GitHubSignInProvider, isSignInProvider } from './flows';

// `vscode` doesn't publicly export `UriComponents`, so derive the exact shape from `Uri.from`.
type UriComponents = Parameters<typeof vscode.Uri.from>[0];

interface SessionData {
	id: string;
	account?: {
		label?: string;
		displayName?: string;
		// Unfortunately, for some time the id was a number, so we need to support both.
		// This can be removed once we are confident that all users have migrated to the new id.
		id: string | number;
		icon?: UriComponents;
	};
	scopes: string[];
	accessToken: string;
}

/** A session held only for the life of this process, and how long its token lasts. */
interface ITransientSession {
	readonly session: vscode.AuthenticationSession;
	/** Absolute time, in ms since the epoch, after which the token stops working. */
	readonly expiresAt: number;
}

export enum AuthProviderType {
	github = 'github',
	githubEnterprise = 'github-enterprise'
}

interface GitHubAuthenticationProviderOptions extends vscode.AuthenticationProviderSessionOptions {
	/**
	 * This is specific to GitHub and is used to determine which sign-in provider to use.
	 * If not provided, the default (GitHub) is used which shows all options.
	 *
	 * Example: If you specify Google, then the sign-in flow will skip the initial page that asks you
	 * to choose how you want to sign in and will directly take you to the Google sign-in page.
	 *
	 * This allows us to show "Continue with Google" buttons in the product, rather than always
	 * leaving it up to the user to choose the sign-in provider on the sign-in page.
	 *
	 * Microsoft is handled entirely inside this extension: instead of a GitHub authorize
	 * flow, a Microsoft Entra token is exchanged for a GitHub token.
	 */
	readonly provider?: GitHubSignInProvider;
	readonly extraAuthorizeParameters?: Record<string, string>;
}

function isGitHubAuthenticationProviderOptions(object: unknown): object is GitHubAuthenticationProviderOptions {
	if (!object || typeof object !== 'object') {
		throw new Error('Options are not an object');
	}
	const { provider, extraAuthorizeParameters } = object as GitHubAuthenticationProviderOptions;
	if (provider !== undefined && !isSignInProvider(provider)) {
		throw new Error(`Provider is invalid: ${provider}`);
	}
	if (extraAuthorizeParameters !== undefined) {
		if (!extraAuthorizeParameters || typeof extraAuthorizeParameters !== 'object') {
			throw new Error('Extra parameters must be a record of string keys and string values.');
		}
		for (const [key, value] of Object.entries(extraAuthorizeParameters)) {
			if (typeof key !== 'string' || typeof value !== 'string') {
				throw new Error('Extra parameters must be a record of string keys and string values.');
			}
		}
	}
	return true;
}

export class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	private readonly _pendingNonces = new Map<string, string[]>();
	private readonly _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: vscode.EventEmitter<void> }>();

	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}

	public async waitForCode(logger: Log, scopes: string, nonce: string, token: vscode.CancellationToken) {
		const existingNonces = this._pendingNonces.get(scopes) || [];
		this._pendingNonces.set(scopes, [...existingNonces, nonce]);

		let codeExchangePromise = this._codeExchangePromises.get(scopes);
		if (!codeExchangePromise) {
			codeExchangePromise = promiseFromEvent(this.event, this.handleEvent(logger, scopes));
			this._codeExchangePromises.set(scopes, codeExchangePromise);
		}

		try {
			return await Promise.race([
				codeExchangePromise.promise,
				new Promise<string>((_, reject) => setTimeout(() => reject(TIMED_OUT_ERROR), 300_000)), // 5min timeout
				promiseFromEvent<void, string>(token.onCancellationRequested, (_, __, reject) => { reject(USER_CANCELLATION_ERROR); }).promise
			]);
		} finally {
			this._pendingNonces.delete(scopes);
			codeExchangePromise?.cancel.fire();
			this._codeExchangePromises.delete(scopes);
		}
	}

	private handleEvent: (logger: Log, scopes: string) => PromiseAdapter<vscode.Uri, string> =
		(logger: Log, scopes) => (uri, resolve, reject) => {
			const query = new URLSearchParams(uri.query);
			const code = query.get('code');
			const nonce = query.get('nonce');
			if (!code) {
				reject(new Error('No code'));
				return;
			}
			if (!nonce) {
				reject(new Error('No nonce'));
				return;
			}

			const acceptedNonces = this._pendingNonces.get(scopes) || [];
			if (!acceptedNonces.includes(nonce)) {
				// A common scenario of this happening is if you:
				// 1. Trigger a sign in with one set of scopes
				// 2. Before finishing 1, you trigger a sign in with a different set of scopes
				// In this scenario we should just return and wait for the next UriHandler event
				// to run as we are probably still waiting on the user to hit 'Continue'
				logger.info('Nonce not found in accepted nonces. Skipping this execution...');
				return;
			}

			resolve(code);
		};
}

function generateSessionId(): string {
	return crypto.getRandomValues(new Uint32Array(2)).reduce((prev, curr) => prev += curr.toString(16), '');
}

export class GitHubAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private readonly _logger: Log;
	private readonly _githubServer: IGitHubServer;
	private readonly _microsoft: MicrosoftAuthentication;
	private readonly _telemetryReporter: ExperimentationTelemetry;
	private readonly _keychain: Keychain;
	private readonly _accountLinks: AccountLinks;
	private readonly _accountsSeen = new Set<string>();
	private readonly _disposable: vscode.Disposable | undefined;

	/** The sessions backed by the Keychain, and therefore shared with other windows. */
	private _persistedSessionsPromise: Promise<vscode.AuthenticationSession[]>;
	/**
	 * The sessions that only exist in this process, by id, each with the time its token runs out.
	 *
	 * Nothing here runs on a clock. {@link stillGood} checks the time on the way out, because
	 * `getSession` is what guarantees a caller a fresh token. Dropping a session on a timer would
	 * report it as removed, and removed means the account is gone, which a token running out does
	 * not say.
	 */
	private readonly _transientSessions = new Map<string, ITransientSession>();
	/** Renewals in flight, by session id, so concurrent callers share one exchange. */
	private readonly _renewals = new Map<string, Promise<vscode.AuthenticationSession | undefined>>();
	/** Restores in flight, by {@link restoreKey}, so concurrent callers share one exchange. */
	private readonly _restores = new Map<string, Promise<vscode.AuthenticationSession | undefined>>();
	/**
	 * The restores that have been tried and could not be done, by {@link restoreKey}.
	 *
	 * `getSessions` is called constantly and by several callers at once, and a restore costs a round
	 * trip to Microsoft and one to GitHub. Without this, an account link that cannot currently be
	 * acted on would put those two requests on the wire on every single read, forever.
	 */
	private readonly _restoresTried = new Set<string>();
	/**
	 * Bumped every time the Microsoft account list moves.
	 *
	 * A mint reads the Microsoft account list, spends two round trips, and then publishes. Signing
	 * out of Microsoft in the middle of that window evicts sessions that do not exist yet, so
	 * without this the mint would land afterwards and put back the session the user had just
	 * removed the only way in to. See {@link microsoftAccountStillSignedIn}.
	 */
	private _microsoftGeneration = 0;

	constructor(
		private readonly context: vscode.ExtensionContext,
		uriHandler: UriEventHandler,
		ghesUri?: vscode.Uri
	) {
		const { aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };
		this._telemetryReporter = new ExperimentationTelemetry(context, new TelemetryReporter(aiKey));

		const type = ghesUri ? AuthProviderType.githubEnterprise : AuthProviderType.github;

		this._logger = new Log(type);

		const serviceId = type === AuthProviderType.github
			? `${type}.auth`
			: `${ghesUri?.authority}${ghesUri?.path}.ghes.auth`;

		this._keychain = new Keychain(this.context, serviceId, this._logger);

		this._accountLinks = new AccountLinks(this.context.globalState, `${serviceId}.microsoftAccountLinks`, this._logger);

		this._microsoft = new MicrosoftAuthentication();

		this._githubServer = new GitHubServer(
			this._logger,
			this._telemetryReporter,
			uriHandler,
			context.extension.extensionKind,
			this._microsoft,
			this._accountLinks,
			ghesUri);

		// Contains the current state of the sessions we have available.
		this._persistedSessionsPromise = this.readSessions().then((sessions) => {
			// fire telemetry after a second to allow the workbench to focus on loading
			setTimeout(() => sessions.forEach(s => this.afterSessionLoad(s)), 1000);
			return sessions;
		});

		const supportedAuthorizationServers = ghesUri
			? [vscode.Uri.joinPath(ghesUri, '/login/oauth')]
			: [vscode.Uri.parse('https://github.com/login/oauth')];
		this._disposable = vscode.Disposable.from(
			this._telemetryReporter,
			vscode.authentication.registerAuthenticationProvider(
				type,
				this._githubServer.friendlyName,
				this,
				{
					supportsMultipleAccounts: true,
					supportedAuthorizationServers
				}
			),
			this.context.secrets.onDidChange(() => this.checkForUpdates()),
			// The two sides of the Microsoft account list moving. Signing in makes a restore that was
			// impossible a moment ago possible, so whatever we gave up on is worth another try.
			// Signing out leaves sessions that cannot renew, so they go.
			vscode.authentication.onDidChangeSessions(async e => {
				if (e.provider.id === MICROSOFT_PROVIDER_ID) {
					this._microsoftGeneration++;
					this._restoresTried.clear();
					await this.evictUnreachable();
				}
			})
		);
	}

	dispose() {
		this._transientSessions.clear();
		this._disposable?.dispose();
	}

	/** Every session held only by this process, whether or not its token is still any good. */
	private get transientSessions(): vscode.AuthenticationSession[] {
		return [...this._transientSessions.values()].map(held => held.session);
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes: string[] | undefined, options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		// For GitHub scope list, order doesn't matter so we immediately sort the scopes
		const sortedScopes = scopes?.sort() || [];
		const describedScopes = sortedScopes.length ? sortedScopes.join(',') : 'all scopes';
		this._logger.info(`Getting sessions for ${describedScopes}...`);

		// Narrowed to what the caller asked for before anything looks at the clock, so that we only
		// ever renew or evict a session somebody actually wants.
		const candidates = [...await this._persistedSessionsPromise, ...this.transientSessions];
		const wanted = candidates.filter(session =>
			(!options?.account || session.account.label === options.account.label)
			&& (!sortedScopes.length || arrayEquals([...session.scopes].sort(), sortedScopes)));

		const finalSessions = await this.stillGood(wanted);
		const restored = await this.restore(sortedScopes, options?.account, finalSessions);
		this._logger.info(`Got ${finalSessions.length + restored.length} sessions for ${describedScopes}...`);
		return [...finalSessions, ...restored];
	}

	/**
	 * Rebuilds the Microsoft brokered sessions this window has no copy of.
	 *
	 * Those sessions only ever live in memory, so every reload loses them while the Microsoft
	 * account they came from is still signed in. What survives is the account links, and each row
	 * records a GitHub identity the user agreed to sign in as, which is enough to mint the session
	 * again with nothing shown to them.
	 *
	 * Nothing about scopes is remembered, because nothing needs to be: the exchange mints whatever
	 * it is asked for. So a restore asks for exactly what this caller wants, and a caller that wants
	 * no scopes in particular gets a session labelled with whatever GitHub grants.
	 */
	private async restore(
		scopes: readonly string[],
		account: vscode.AuthenticationSessionAccountInformation | undefined,
		already: readonly vscode.AuthenticationSession[]
	): Promise<vscode.AuthenticationSession[]> {
		// A row whose account already answered this request needs nothing minting for it. The check
		// is per account rather than across all of them, so one account having a session does not
		// keep a second linked account signed out.
		const missing = this._accountLinks.linkedAccounts().filter(link =>
			(!account || link.gitHubAccountLabel === account.label)
			&& !already.some(session => session.account.label === link.gitHubAccountLabel)
			&& !this._restoresTried.has(this.restoreKey(link, scopes)));
		if (!missing.length) {
			return [];
		}

		const restored = (await Promise.all(missing.map(link => this.restoreOne(link, scopes))))
			.filter(<T>(session?: T): session is T => Boolean(session));
		if (restored.length) {
			this._logger.info(`Restored ${restored.length} session(s) from a remembered Microsoft account.`);
			this._sessionChangeEmitter.fire({ added: restored, removed: [], changed: [] });
		}
		return restored;
	}

	/** Identifies one restore: an account, and what is being minted for it. */
	private restoreKey(link: IAccountLink, scopes: readonly string[]): string {
		return `${link.gitHubAccountLabel}\n${scopes.join(' ')}`;
	}

	/**
	 * Concurrent calls for one account and scope list share a single exchange. `getSessions` is
	 * called often and by more than one caller at a time, and two exchanges would mint two tokens
	 * and publish two sessions where one is wanted.
	 */
	private restoreOne(link: IAccountLink, scopes: readonly string[]): Promise<vscode.AuthenticationSession | undefined> {
		const key = this.restoreKey(link, scopes);
		let restore = this._restores.get(key);
		if (!restore) {
			restore = this.restoreNow(link, scopes, key).finally(() => this._restores.delete(key));
			this._restores.set(key, restore);
		}
		return restore;
	}

	private async restoreNow(link: IAccountLink, scopes: readonly string[], key: string): Promise<vscode.AuthenticationSession | undefined> {
		const generation = this._microsoftGeneration;
		const microsoftAccount = (await this._microsoft.getAccounts())
			.find(candidate => candidate.label === link.microsoftAccountLabel);
		if (!microsoftAccount) {
			this._logger.info(`Not restoring the session for ${link.gitHubAccountLabel}: its Microsoft account is not signed in.`);
			this._restoresTried.add(key);
			return undefined;
		}

		let renewed: IEntraRenewedToken;
		try {
			renewed = await this._githubServer.renewWithMicrosoft({
				// No scopes means the caller did not care which, so neither do we.
				scopes: scopes.length ? scopes : undefined,
				gitHubAccountId: link.gitHubAccountId,
				microsoftAccount
			});
		} catch (e) {
			this._logger.error(`Could not restore the session for ${link.gitHubAccountLabel}: ${e?.message ?? e}`);
			this._restoresTried.add(key);
			if (e instanceof EntraTokenExchangeError && e.failure === EntraTokenExchangeFailure.AccountMismatch) {
				// GitHub has answered for somebody else, so the row does not describe an identity the
				// user ever agreed to. Keeping it would leave every later restore reaching for the
				// wrong person.
				//
				// Only this one failure. It is the single case where GitHub positively named a
				// different account; everything else that lands here, from an unmapped identity to a
				// `GET /user` that could not be reached, says nothing about who the row points at.
				// The row is global state shared by every window, so acting on an ambiguous failure
				// would sign the user out everywhere with no way back.
				await this._accountLinks.unlinkGitHubAccount(link.gitHubAccountLabel);
			}
			return undefined;
		}
		if (!renewed.scopes.length) {
			// Nothing to label the session with. A session with no scopes is findable by no scoped
			// lookup, so publishing it would leave the user looking signed in and nothing working.
			this._logger.error(`Could not restore the session for ${link.gitHubAccountLabel}: GitHub did not say what the token can do.`);
			this._restoresTried.add(key);
			return undefined;
		}

		if (!await this.microsoftAccountStillSignedIn(generation, microsoftAccount.label, `the restored session for ${link.gitHubAccountLabel}`)) {
			return undefined;
		}

		const session = this.sessionFor(renewed.account, renewed.token, [...renewed.scopes]);
		this._transientSessions.set(session.id, { session, expiresAt: Date.now() + renewed.expiresIn * 1000 });
		this.afterSessionLoad(session);
		return session;
	}

	/**
	 * The sessions from `wanted` a caller can actually use, renewing what has run out.
	 *
	 * Expiry is settled here rather than on a timer, because `getSession` is what guarantees a fresh
	 * token everywhere else in the product and a token running out is not the user signing out.
	 * Anything that cannot be renewed is dropped on the way through and reported as removed, which
	 * is what makes VS Code ask the user again.
	 *
	 * Only transient sessions can go stale, and every one of those was brokered through Microsoft.
	 * When persisted tokens start expiring too, they will need an expiry of their own here and
	 * {@link renewNow} will need to branch on how a given session renews.
	 */
	private async stillGood(wanted: readonly vscode.AuthenticationSession[]): Promise<vscode.AuthenticationSession[]> {
		const now = Date.now();
		const usable: vscode.AuthenticationSession[] = [];
		const stale: vscode.AuthenticationSession[] = [];
		for (const session of wanted) {
			// No transient entry means a persisted session, and nothing persisted carries an expiry.
			const held = this._transientSessions.get(session.id);
			if (!held || held.expiresAt > now) {
				usable.push(session);
			} else {
				stale.push(session);
			}
		}
		// Every stale session is one the caller asked for, and each one left unprocessed stays in the
		// map for the lifetime of the window: never handed out, never renewed, never reported as
		// removed, and counted as a candidate on every read from here on. So they are all settled,
		// whether or not there is something usable to hand back alongside them.
		if (!stale.length) {
			return usable;
		}

		const renewed = await Promise.all(stale.map(session => this.renew(session)));
		this.evict(stale.filter((_, index) => !renewed[index]), 'their token ran out and could not be renewed');
		return [...usable, ...renewed.filter(<T>(session?: T): session is T => Boolean(session))];
	}

	/**
	 * Drops sessions there is no longer any way to keep, and tells VS Code they are gone. Only the
	 * in-memory ones: a read must not rewrite the Keychain, and no persisted session carries an
	 * expiry today anyway.
	 */
	private evict(sessions: readonly vscode.AuthenticationSession[], reason: string): void {
		const removed: vscode.AuthenticationSession[] = [];
		for (const session of sessions) {
			if (this._transientSessions.delete(session.id)) {
				removed.push(session);
			}
		}
		if (removed.length) {
			this._logger.info(`Dropped ${removed.length} session(s): ${reason}.`);
			this._sessionChangeEmitter.fire({ added: [], removed, changed: [] });
		}
	}

	/**
	 * Drops every session whose Microsoft account the user is no longer signed in to. The token
	 * still works until it runs out, but nothing can renew it, and leaving it published shows a
	 * GitHub account in the account menu that the user has just signed out of the only way in to.
	 *
	 * Only the sessions. The account links stay put, because this reads the Microsoft account list,
	 * and that list is a cache which reads empty for a moment while it repopulates. Getting it wrong
	 * here costs this window one round trip on the next read, since {@link restore} mints the
	 * session again from the row that is still there. Getting it wrong in the link table would sign
	 * the user out of every window with no way back.
	 */
	private async evictUnreachable(): Promise<void> {
		const reachable = new Set((await this._microsoft.getAccounts()).map(account => account.label));
		const rows = new Map(this._accountLinks.linkedAccounts().map(link => [link.gitHubAccountLabel, link]));
		this.evict(
			this.transientSessions.filter(session => {
				const microsoftAccountLabel = rows.get(session.account.label)?.microsoftAccountLabel;
				return !microsoftAccountLabel || !reachable.has(microsoftAccountLabel);
			}),
			'their Microsoft account is no longer signed in');
	}

	/**
	 * Mints a fresh token for a session whose own has run out, without the user in front of it.
	 * Resolves to `undefined` when that cannot be done, which leaves the caller with nothing and
	 * VS Code asking the user to sign in again.
	 *
	 * Concurrent calls for one session share a single exchange. `getSessions` is called often, and
	 * by more than one caller at a time, and two exchanges would mint two tokens where one is wanted.
	 */
	private renew(session: vscode.AuthenticationSession): Promise<vscode.AuthenticationSession | undefined> {
		let renewal = this._renewals.get(session.id);
		if (!renewal) {
			renewal = this.renewNow(session).finally(() => this._renewals.delete(session.id));
			this._renewals.set(session.id, renewal);
		}
		return renewal;
	}

	/**
	 * Every session that reaches here was brokered through Microsoft, so the exchange is the only
	 * way back to a working token. GitHub's token exchange endpoint silently ignores
	 * `offline_access`, so such a session never also holds a refresh token to spend instead.
	 */
	private async renewNow(session: vscode.AuthenticationSession): Promise<vscode.AuthenticationSession | undefined> {
		const generation = this._microsoftGeneration;
		// Which Microsoft identity this GitHub account was reached through. Renewing against any
		// other one hands back a token for a different person, so no account means no renewal.
		const microsoftAccount = await this.rememberedMicrosoftAccount(session.account.label);
		if (!microsoftAccount) {
			this._logger.info(`Session ${session.id} cannot renew: there is no Microsoft account signed in for it.`);
			return undefined;
		}

		let renewed: IEntraRenewedToken;
		try {
			renewed = await this._githubServer.renewWithMicrosoft({
				scopes: session.scopes,
				gitHubAccountId: session.account.id,
				microsoftAccount
			});
		} catch (e) {
			this._logger.error(`Could not renew session ${session.id}: ${e?.message ?? e}`);
			return undefined;
		}

		if (!await this.microsoftAccountStillSignedIn(generation, microsoftAccount.label, `the renewal of session ${session.id}`)) {
			return undefined;
		}

		// The same session with a new token, so it keeps its id and is reported as changed rather
		// than as one session going away and another arriving.
		const next: vscode.AuthenticationSession = { ...session, accessToken: renewed.token };
		this._transientSessions.set(next.id, { session: next, expiresAt: Date.now() + renewed.expiresIn * 1000 });
		this._logger.info(`Renewed session ${session.id}.`);
		this._sessionChangeEmitter.fire({ added: [], removed: [], changed: [next] });
		return next;
	}

	/**
	 * Whether the Microsoft account a mint was made against is still signed in, asked just before
	 * the mint publishes.
	 *
	 * {@link evictUnreachable} only removes sessions that exist when it runs, so a mint that started
	 * before the user signed out of Microsoft would otherwise finish afterwards and put a session
	 * back that nothing can renew and that the user has just taken away the only way in to.
	 *
	 * The generation only decides whether it is worth asking. The event behind it says the account
	 * list moved and nothing about how: a token being refreshed under a session that is still
	 * perfectly signed in fires it too, and reading that as a sign out would make every renewal
	 * discard the token it just minted and mint another one that races the same way. So the answer
	 * comes from the account list, and the generation is only there to keep us from reading it on
	 * every publish.
	 */
	private async microsoftAccountStillSignedIn(generation: number, label: string, what: string): Promise<boolean> {
		if (this._microsoftGeneration === generation) {
			return true;
		}
		if ((await this._microsoft.getAccounts()).some(account => account.label === label)) {
			return true;
		}
		this._logger.info(`Discarding ${what}: its Microsoft account was signed out of while it was in flight.`);
		return false;
	}

	private async afterSessionLoad(session: vscode.AuthenticationSession): Promise<void> {
		// We only want to fire a telemetry if we haven't seen this account yet in this session.
		if (!this._accountsSeen.has(session.account.id)) {
			this._accountsSeen.add(session.account.id);
			this._githubServer.sendAdditionalTelemetryInfo(session);
		}
	}

	private async checkForUpdates() {
		// Only the persisted sessions are reconciled against the Keychain: transient sessions do not
		// exist there, so they must never be diffed against it and reported as removed.
		const previousSessions = await this._persistedSessionsPromise;
		this._persistedSessionsPromise = this.readSessions();
		const storedSessions = await this._persistedSessionsPromise;

		const added: vscode.AuthenticationSession[] = [];
		const removed: vscode.AuthenticationSession[] = [];

		storedSessions.forEach(session => {
			const matchesExisting = previousSessions.some(s => s.id === session.id);
			// Another window added a session to the keychain, add it to our state as well
			if (!matchesExisting) {
				this._logger.info('Adding session found in keychain');
				added.push(session);
			}
		});

		previousSessions.forEach(session => {
			const matchesExisting = storedSessions.some(s => s.id === session.id);
			// Another window has logged out, remove from our state
			if (!matchesExisting) {
				this._logger.info('Removing session no longer found in keychain');
				removed.push(session);
			}
		});

		if (added.length || removed.length) {
			this._sessionChangeEmitter.fire({ added, removed, changed: [] });
		}
	}

	private async readSessions(): Promise<vscode.AuthenticationSession[]> {
		let sessionData: SessionData[];
		try {
			this._logger.info('Reading sessions from keychain...');
			const storedSessions = await this._keychain.getToken();
			if (!storedSessions) {
				return [];
			}
			this._logger.info('Got stored sessions!');

			try {
				sessionData = JSON.parse(storedSessions);
			} catch (e) {
				await this._keychain.deleteToken();
				throw e;
			}
		} catch (e) {
			this._logger.error(`Error reading token: ${e}`);
			return [];
		}

		// Unfortunately, we were using a number secretly for the account id for some time... this is due to a bad `any`.
		// AuthenticationSession's account id is a string, so we need to detect when there is a number accountId and re-store
		// the sessions to migrate away from the bad number usage.
		// TODO@TylerLeonhardt: Remove this after we are confident that all users have migrated to the new id.
		let seenNumberAccountId: boolean = false;
		// TODO: eventually remove this Set because we should only have one session per set of scopes.
		const scopesSeen = new Set<string>();
		const sessionPromises = sessionData.map(async (session: SessionData): Promise<vscode.AuthenticationSession | undefined> => {
			// For GitHub scope list, order doesn't matter so we immediately sort the scopes
			const scopesStr = [...session.scopes].sort().join(' ');
			let userInfo: IGitHubUserInfo | undefined;
			if (!session.account) {
				try {
					userInfo = await this._githubServer.getUserInfo(session.accessToken);
					this._logger.info(`Verified session with the following scopes: ${scopesStr}`);
				} catch (e) {
					if (e.message === 'Unauthorized') {
						return undefined;
					}
				}
			}

			this._logger.trace(`Read the following session from the keychain with the following scopes: ${scopesStr}`);
			scopesSeen.add(scopesStr);

			let accountId: string;
			if (session.account?.id) {
				if (typeof session.account.id === 'number') {
					seenNumberAccountId = true;
				}
				accountId = `${session.account.id}`;
			} else {
				accountId = userInfo?.id ?? '<unknown>';
			}
			const icon = session.account?.icon
				? vscode.Uri.from(session.account.icon)
				: userInfo?.avatarUrl ? vscode.Uri.parse(userInfo.avatarUrl) : undefined;
			return {
				id: session.id,
				account: {
					label: session.account
						? session.account.label ?? session.account.displayName ?? '<unknown>'
						: (userInfo?.accountName ?? '<unknown>'),
					id: accountId,
					icon,
				},
				// we set this to session.scopes to maintain the original order of the scopes requested
				// by the extension that called getSession()
				scopes: session.scopes,
				accessToken: session.accessToken
			};
		});

		const verifiedSessions = (await Promise.allSettled(sessionPromises))
			.filter(p => p.status === 'fulfilled')
			.map(p => (p as PromiseFulfilledResult<vscode.AuthenticationSession | undefined>).value)
			.filter(<T>(p?: T): p is T => Boolean(p));

		this._logger.info(`Got ${verifiedSessions.length} verified sessions.`);
		// Account data discovered during reads must not trigger a secret write because web embedders can re-expose accountless sessions.
		if (seenNumberAccountId || verifiedSessions.length !== sessionData.length) {
			await this.storeSessions(verifiedSessions);
		}

		return verifiedSessions;
	}

	private async storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
		this._logger.info(`Storing ${sessions.length} sessions...`);
		this._persistedSessionsPromise = Promise.resolve(sessions);
		await this._keychain.setToken(JSON.stringify(sessions));
		this._logger.info(`Stored ${sessions.length} sessions!`);
	}

	public async createSession(scopes: string[], options?: GitHubAuthenticationProviderOptions): Promise<vscode.AuthenticationSession> {
		try {
			// For GitHub scope list, order doesn't matter so we use a sorted scope to determine
			// if we've got a session already.
			const sortedScopes = [...scopes].sort();

			/* __GDPR__
				"login" : {
					"owner": "TylerLeonhardt",
					"comment": "Used to determine how much usage the GitHub Auth Provider gets.",
					"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
				}
			*/
			this._telemetryReporter?.sendTelemetryEvent('login', {
				scopes: JSON.stringify(scopes),
			});

			if (options && !isGitHubAuthenticationProviderOptions(options)) {
				throw new Error('Invalid options');
			}
			const loginWith = options?.account?.label;
			const signInProvider = options?.provider;
			this._logger.info(`Logging in with${signInProvider ? ` ${signInProvider}, ` : ''} '${loginWith ? loginWith : 'any'}' account...`);

			if (signInProvider === GitHubSignInProvider.Microsoft) {
				// Microsoft never reaches a GitHub authorize URL: we broker it ourselves by
				// exchanging an Entra token for a GitHub one, and the result is only ever kept for
				// the lifetime of this process.
				const session = await this.createMicrosoftSession(scopes, loginWith);
				this._logger.info('Login success!');
				return session;
			}

			const sessions = await this._persistedSessionsPromise;
			const scopeString = sortedScopes.join(' ');
			const token = await this._githubServer.login(scopeString, signInProvider, options?.extraAuthorizeParameters, loginWith);
			const session = await this.tokenToSession(token, scopes);
			this.afterSessionLoad(session);

			const sessionIndex = sessions.findIndex(s => s.account.id === session.account.id && arrayEquals([...s.scopes].sort(), sortedScopes));
			const removed = new Array<vscode.AuthenticationSession>();
			if (sessionIndex > -1) {
				removed.push(...sessions.splice(sessionIndex, 1, session));
			} else {
				sessions.push(session);
			}
			await this.storeSessions(sessions);

			this._sessionChangeEmitter.fire({ added: [session], removed, changed: [] });

			this._logger.info('Login success!');

			return session;
		} catch (e) {
			// If login was cancelled, do not notify user.
			if (e === 'Cancelled' || e.message === 'Cancelled') {
				/* __GDPR__
					"loginCancelled" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users cancel the login flow." }
				*/
				this._telemetryReporter?.sendTelemetryEvent('loginCancelled');
				throw e;
			}

			/* __GDPR__
				"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into an error login flow." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('loginFailed');

			vscode.window.showErrorMessage(vscode.l10n.t('Sign in failed: {0}', `${e}`));
			this._logger.error(e);
			throw e;
		}
	}

	/**
	 * Exchanges a Microsoft Entra sign in for a GitHub token and publishes it as a session that
	 * lives for the lifetime of this process only. The token is never written to the Keychain.
	 */
	private async createMicrosoftSession(scopes: string[], gitHubAccountLabel: string | undefined): Promise<vscode.AuthenticationSession> {
		const exchanged = await this._githubServer.loginWithMicrosoft(scopes, {
			microsoftAccount: await this.rememberedMicrosoftAccount(gitHubAccountLabel)
		});
		const session = this.sessionFor(exchanged.account, exchanged.token, scopes);
		this.afterSessionLoad(session);

		this._transientSessions.set(session.id, {
			session,
			// The exchange reports what GitHub said the token is good for; when that runs out is
			// this side's question, since it is the side that has to hold the session until then.
			expiresAt: Date.now() + exchanged.expiresIn * 1000
		});

		this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
		return session;
	}

	/**
	 * A session for a GitHub identity that has already been resolved, so nothing here needs a
	 * lookup.
	 *
	 * `scopes` is what the session is findable by: `getSessions` compares this list to the one it
	 * was asked for, so anything other than the scopes the token actually carries leaves the session
	 * findable by the wrong lookup or by none. The Entra token, and the fact that a session came
	 * from Microsoft at all, are never encoded here.
	 */
	private sessionFor(account: IGitHubUserInfo, accessToken: string, scopes: string[]): vscode.AuthenticationSession {
		return {
			id: generateSessionId(),
			accessToken,
			account: {
				label: account.accountName,
				id: account.id,
				icon: account.avatarUrl ? vscode.Uri.parse(account.avatarUrl) : undefined
			},
			scopes
		};
	}

	/**
	 * The Microsoft account a GitHub account was last reached through, when the user is still
	 * signed in to it.
	 *
	 * A hint to {@link createSession}, which runs discovery regardless and rewrites the row if it
	 * resolves something else. To {@link renewNow} it is the whole answer, since there is nobody to
	 * pick an account: no row, or a row naming an account that is signed out, means no renewal.
	 *
	 * Matched by label rather than by account id because `getAccounts` collapses accounts that
	 * share a label and keeps whichever it saw first, so the id it reports for a label is not the
	 * one we would have stored.
	 */
	private async rememberedMicrosoftAccount(gitHubAccountLabel: string | undefined): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
		if (!gitHubAccountLabel) {
			return undefined;
		}
		const microsoftAccountLabel = this._accountLinks.microsoftAccountFor(gitHubAccountLabel);
		if (!microsoftAccountLabel) {
			return undefined;
		}
		const accounts = await this._microsoft.getAccounts();
		return accounts.find(account => account.label === microsoftAccountLabel);
	}

	/**
	 * Forgets which Microsoft account a GitHub account was reached through, once the user has no
	 * sessions left for it. One session going away is not signing out of the account: two sessions
	 * can share a row, and a token running out has to leave the row behind so that the next sign in
	 * still knows where to look.
	 */
	private async forgetAccountLinkIfSignedOut(account: vscode.AuthenticationSessionAccountInformation): Promise<void> {
		const remaining = [...await this._persistedSessionsPromise, ...this.transientSessions];
		if (!remaining.some(session => session.account.label === account.label)) {
			await this._accountLinks.unlinkGitHubAccount(account.label);
		}
	}

	private async tokenToSession(token: string, scopes: string[]): Promise<vscode.AuthenticationSession> {
		const userInfo = await this._githubServer.getUserInfo(token);
		return {
			id: generateSessionId(),
			accessToken: token,
			account: { label: userInfo.accountName, id: userInfo.id, icon: userInfo.avatarUrl ? vscode.Uri.parse(userInfo.avatarUrl) : undefined },
			scopes
		};
	}

	public async removeSession(id: string) {
		try {
			/* __GDPR__
				"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out of an account." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logout');

			this._logger.info(`Logging out of ${id}`);

			const transient = this._transientSessions.get(id);
			if (transient) {
				this._transientSessions.delete(id);
				// These tokens are not in the Keychain and are not OAuth app tokens we can revoke on
				// the server, so signing out is purely dropping our copy of them.
				await this.forgetAccountLinkIfSignedOut(transient.session.account);
				this._sessionChangeEmitter.fire({ added: [], removed: [transient.session], changed: [] });
				return;
			}

			const sessions = await this._persistedSessionsPromise;
			const sessionIndex = sessions.findIndex(session => session.id === id);
			if (sessionIndex > -1) {
				const session = sessions[sessionIndex];
				sessions.splice(sessionIndex, 1);

				await this.storeSessions(sessions);
				await this._githubServer.logout(session);
				await this.forgetAccountLinkIfSignedOut(session.account);

				this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
			} else {
				this._logger.error('Session not found');
			}
		} catch (e) {
			/* __GDPR__
				"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often logging out of an account fails." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logoutFailed');

			vscode.window.showErrorMessage(vscode.l10n.t('Sign out failed: {0}', `${e}`));
			this._logger.error(e);
			throw e;
		}
	}
}
