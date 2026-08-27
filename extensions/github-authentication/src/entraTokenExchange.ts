/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Config } from './config';
import { AccountLinks } from './common/accountLinks';
import { CANCELLATION_ERROR } from './common/errors';
import { fetchUserInfo, IGitHubUserInfo } from './common/gitHubAccount';
import { IHttpClient, IHttpResponse } from './common/http';
import { Log } from './common/logger';
import { IMicrosoftAuthentication, IMicrosoftToken } from './common/microsoftAuthentication';

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/**
 * The only scope we ask for before the user has confirmed the mapped GitHub identity. It is used
 * for a single `GET /user` call and is never persisted or published as a session.
 */
const DISCOVERY_SCOPES = ['read:user'];

/**
 * Why an Entra-to-GitHub exchange failed. Deliberately coarse: the classification never carries a
 * server supplied description, only the stable OAuth error code that produced it.
 */
export const enum EntraTokenExchangeFailure {
	/** The Microsoft access token could not be acquired. */
	MicrosoftSignIn = 'microsoftSignIn',
	/** GitHub rejected the client, the grant type or the requested scopes. Retrying will not help. */
	Configuration = 'configuration',
	/** GitHub could not map the Microsoft identity onto a GitHub account. */
	Identity = 'identity',
	/**
	 * The token GitHub minted turned out to belong to a different account than the one asked for.
	 *
	 * Kept apart from {@link Identity}, which is the catch-all for everything that went wrong on the
	 * way to an identity: an unmapped account, a rejected grant, an unreachable `GET /user`. Only
	 * this one is a positive answer that names somebody else, so only this one is grounds for
	 * throwing away what the user agreed to.
	 */
	AccountMismatch = 'accountMismatch',
	/** GitHub could not be reached. Retrying may help. */
	Network = 'network',
	/** GitHub answered with something that is not a valid RFC 8693 response. */
	Protocol = 'protocol'
}

export class EntraTokenExchangeError extends Error {
	constructor(readonly failure: EntraTokenExchangeFailure, message: string) {
		super(message);
	}
}

/**
 * A GitHub token minted from a Microsoft identity. It is intentionally short lived and must only
 * ever be published as a process-lifetime session; it is never written to the Keychain.
 */
export interface IEntraExchangedToken {
	readonly token: string;
	/** How long the token lasts, in seconds, exactly as GitHub reported it. */
	readonly expiresIn: number;
	/** The GitHub account the Microsoft identity mapped onto. */
	readonly account: IGitHubUserInfo;
}

export interface IEntraLoginOptions {
	/**
	 * The Microsoft account to sign in with. Left out, the user's preferred account is used and the
	 * picker appears when there is more than one.
	 */
	readonly microsoftAccount?: vscode.AuthenticationSessionAccountInformation;
}

/** What renewing a session needs to know about the session it is renewing. */
export interface IEntraRenewal {
	/**
	 * The scopes to mint, or `undefined` to let GitHub decide.
	 *
	 * A renewal names the scopes the session already has and never widens them. A restore, which
	 * rebuilds a session this window never had, names what its caller asked for; a caller that asked
	 * for nothing in particular leaves this out and takes whatever the exchange grants.
	 */
	readonly scopes: readonly string[] | undefined;
	/**
	 * The GitHub account the session was published as. Which GitHub account a Microsoft identity
	 * maps onto is state GitHub holds, so a renewal has to check where it points rather than assume.
	 */
	readonly gitHubAccountId: string;
	/** The Microsoft identity to renew against, which has to be the one the session came from. */
	readonly microsoftAccount: vscode.AuthenticationSessionAccountInformation;
}

/** A GitHub token minted to replace one a session no longer has. */
export interface IEntraRenewedToken {
	readonly token: string;
	/** How long the token lasts, in seconds, exactly as GitHub reported it. */
	readonly expiresIn: number;
	/**
	 * The GitHub account the token belongs to, checked rather than assumed. A renewal that resolved
	 * a different account than the one asked for is refused, so this is always that account.
	 */
	readonly account: IGitHubUserInfo;
	/**
	 * What the token can do: the requested scopes when there were any, and otherwise the ones GitHub
	 * reported granting. Empty when neither is known, which makes the token unusable as a session.
	 */
	readonly scopes: readonly string[];
}

/**
 * The endpoints of the GitHub host an exchange belongs to. Grouped so that the exchange can only
 * ever describe a token with the same host that minted it.
 */
export interface IGitHubHostEndpoints {
	/** Where this host accepts an RFC 8693 token exchange, or `undefined` when it accepts none. */
	readonly tokenExchange: string | undefined;
	/** This host's `GET /user`. */
	readonly userInfo: string;
}

/**
 * The modal that asks the user to confirm the GitHub identity before it becomes a session. Injected
 * so tests assert on the real message without stubbing `vscode.window`.
 */
export interface IConfirmationDialog {
	show(message: string, ...actions: string[]): Promise<string | undefined>;
}

export class ModalConfirmationDialog implements IConfirmationDialog {

	async show(message: string, ...actions: string[]): Promise<string | undefined> {
		return await vscode.window.showInformationMessage(message, { modal: true }, ...actions);
	}
}

/** Everything an exchange request needs that comes from configuration rather than from the user. */
interface IExchangeEndpoint {
	readonly url: string;
	readonly clientSecret: string;
}

/** What one exchange came back with, before anyone decides what to do with it. */
interface IExchangedToken {
	readonly token: string;
	readonly expiresIn: number;
	/** The scopes GitHub said it granted, when it said anything at all. */
	readonly grantedScopes: string[] | undefined;
}

/**
 * Exchanges a Microsoft Entra sign in for a GitHub access token.
 *
 * The flow deliberately consists of two exchanges separated by an explicit confirmation: the first
 * one only asks for `read:user` so that the mapped GitHub identity can be shown to the user, and
 * the second one — which is the only token that ever becomes a session — is not requested until the
 * user has agreed to sign in as that account.
 *
 * Neither token is ever logged, at any level. The only part of a response that is ever written out
 * is the server's explanation of a failure (`error_description`, `error_uri`), and only at trace
 * level, which has to be turned on deliberately.
 */
export class EntraTokenExchange {

	constructor(
		private readonly _logger: Log,
		private readonly _endpoints: IGitHubHostEndpoints,
		private readonly _microsoft: IMicrosoftAuthentication,
		private readonly _accountLinks: AccountLinks,
		private readonly _http: IHttpClient,
		private readonly _confirmation: IConfirmationDialog
	) { }

	/**
	 * Signs the user in with Microsoft and returns a GitHub token for exactly `scopes`.
	 *
	 * @throws an error whose message is {@link CANCELLATION_ERROR} when the user backs out, so that
	 * callers see the provider's usual cancellation contract rather than a failure.
	 */
	async login(scopes: readonly string[], options?: IEntraLoginOptions): Promise<IEntraExchangedToken> {
		// Resolved up front so a configuration that cannot possibly work fails before the user is
		// asked to pick a Microsoft account.
		const endpoint = this.resolveEndpoint();
		let preferredAccount = options?.microsoftAccount;
		let forceNewSession = false;
		// Loops only when the user explicitly asks to pick a different Microsoft account.
		for (; ;) {
			const microsoft = await this.getMicrosoftToken(forceNewSession, preferredAccount);

			// Least privilege: this token exists purely to answer "who is this on GitHub?". It is
			// never persisted, never published as a session, and goes out of scope below.
			const discovery = await this.exchange(endpoint, microsoft.token, DISCOVERY_SCOPES);
			const account = await this.discoverAccount(discovery.token);

			const choice = await this.confirmAccount(account);
			if (choice === Confirmation.UseDifferentAccount) {
				// The user has told us the account we reached for is the wrong one, so a remembered
				// preference must not survive into the retry.
				preferredAccount = undefined;
				forceNewSession = true;
				continue;
			}
			if (choice === Confirmation.Cancel) {
				this._logger.info('User cancelled the Microsoft sign in at the account confirmation.');
				throw new Error(CANCELLATION_ERROR);
			}
			// Only now. A row is what lets a later window mint a token for this identity with nothing
			// shown to the user, so it must not exist until the user has said yes to being it.
			const granted = await this.exchange(endpoint, microsoft.token, scopes);
			// The modal above can stay open for as long as the user likes, and which GitHub account a
			// Microsoft identity maps onto is state GitHub holds and can repoint at any time. So the
			// token that is about to become a session is checked against the identity that was
			// actually agreed to, rather than against the one the discovery token happened to resolve
			// however long ago.
			const verified = await this.verifyAccount(granted.token, account.id);
			await this.linkAccounts(microsoft.account.label, verified);

			return { token: granted.token, expiresIn: granted.expiresIn, account: verified };
		}
	}

	/**
	 * Mints a token for a session that the user has already agreed to, keeping its account.
	 *
	 * Shows nothing at all. This runs both when a session's token has run out and when a fresh
	 * window is rebuilding a session it never had, and in both cases the user confirmed this GitHub
	 * identity at some point and is off doing something else now. So the Microsoft token is acquired
	 * silently and a renewal that would need them fails instead of interrupting them.
	 *
	 * The order is the reverse of {@link login}. There, a `read:user` token is minted first so the
	 * identity can be confirmed before the real token exists. Here there is nobody to confirm
	 * anything, so the real token is minted first and its identity is checked afterwards.
	 *
	 * @throws {@link EntraTokenExchangeError} for every failure, including the mapping having moved
	 * to a different GitHub account.
	 */
	async renew({ scopes, gitHubAccountId, microsoftAccount }: IEntraRenewal): Promise<IEntraRenewedToken> {
		const endpoint = this.resolveEndpoint();
		const microsoft = await this._microsoft.getToken({ silent: true, account: microsoftAccount });
		if (!microsoft) {
			this._logger.info('No Microsoft token was available without asking the user, so the session cannot renew itself.');
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.MicrosoftSignIn,
				vscode.l10n.t('Signing in to Microsoft again is required.'));
		}
		const renewed = await this.exchange(endpoint, microsoft.token, scopes);
		const account = await this.verifyAccount(renewed.token, gitHubAccountId);
		return {
			token: renewed.token,
			expiresIn: renewed.expiresIn,
			account,
			// A caller that named its scopes gets those back, so the session it builds is labelled
			// with what it asked for and is findable by the same lookup that asked for it. Only a
			// caller that named none has to fall back on GitHub's own account of what it granted.
			scopes: scopes ?? renewed.grantedScopes ?? []
		};
	}

	/**
	 * Confirms that a minted token belongs to the account it was minted for, and hands that account
	 * back so the caller does not have to look it up again.
	 *
	 * The Entra to GitHub mapping lives on GitHub's side and can be repointed without us hearing
	 * about it. Publishing the result unchecked would leave every extension holding this session
	 * acting as a different person under the original person's label, silently, which is worth one
	 * extra request per minted token to rule out. `GET /user` answers for any valid token, so the
	 * check works whatever scopes the session happens to carry.
	 *
	 * @throws {@link EntraTokenExchangeFailure.AccountMismatch}, and only that, when GitHub named a
	 * different account. Anything that went wrong on the way to an answer stays {@link
	 * EntraTokenExchangeFailure.Identity}, because a caller acts on the two very differently.
	 */
	private async verifyAccount(token: string, gitHubAccountId: string): Promise<IGitHubUserInfo> {
		const account = await this.discoverAccount(token);
		if (account.id !== gitHubAccountId) {
			this._logger.error('The GitHub token is for a different account than the one that was asked for. Discarding it.');
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.AccountMismatch,
				vscode.l10n.t('Your Microsoft account is now linked to a different GitHub account.'));
		}
		return account;
	}

	/**
	 * Everything the exchange needs from configuration rather than from the user. Both halves fail
	 * the same way: nothing the user does next can make them work.
	 */
	private resolveEndpoint(): IExchangeEndpoint {
		// The Entra to GitHub identity mapping is a service GitHub runs, so a self-hosted GitHub
		// Enterprise Server has no endpoint to exchange against.
		const url = this._endpoints.tokenExchange;
		if (!url) {
			this._logger.error('This GitHub host does not accept a Microsoft token exchange.');
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.Configuration,
				vscode.l10n.t('This GitHub host does not support signing in with Microsoft.'));
		}
		// The endpoint authenticates the client the same way the authorization code flow does, so a
		// build without the mixin cannot exchange anything. Fail before the token is put on the wire
		// rather than letting GitHub answer with a confusing `invalid_request`.
		const clientSecret = Config.gitHubClientSecret;
		if (!clientSecret) {
			this._logger.error('No client secret is configured, so the Microsoft token cannot be exchanged.');
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.Configuration,
				vscode.l10n.t('This build of {0} is not configured to sign in to GitHub with Microsoft.', vscode.env.appName));
		}
		return { url, clientSecret };
	}

	private async getMicrosoftToken(
		forceNewSession: boolean,
		account: vscode.AuthenticationSessionAccountInformation | undefined
	): Promise<IMicrosoftToken> {
		let acquired: IMicrosoftToken | undefined;
		try {
			acquired = await this._microsoft.getToken({ forceNewSession, account });
		} catch (e) {
			if (isCancellation(e)) {
				throw new Error(CANCELLATION_ERROR);
			}
			this._logger.error(`Could not acquire a Microsoft access token: ${e?.message ?? e}`);
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.MicrosoftSignIn,
				vscode.l10n.t('Could not sign in to Microsoft. Try again or choose a different way to sign in.'));
		}
		if (!acquired) {
			throw new Error(CANCELLATION_ERROR);
		}
		return acquired;
	}

	/**
	 * Remembers which Microsoft account a GitHub account was reached through. Called only once the
	 * user has confirmed the identity, because the row is what later authorizes minting a token for
	 * it with nothing shown.
	 */
	private async linkAccounts(microsoftAccountLabel: string, gitHubAccount: IGitHubUserInfo): Promise<void> {
		await this._accountLinks.link(microsoftAccountLabel, { id: gitHubAccount.id, label: gitHubAccount.accountName });
	}

	private async discoverAccount(discoveryToken: string): Promise<IGitHubUserInfo> {
		try {
			return await fetchUserInfo(this._http, this._endpoints.userInfo, discoveryToken, this._logger);
		} catch (e) {
			this._logger.error(`Could not resolve the GitHub account for the Microsoft sign in: ${e?.message ?? e}`);
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.Identity,
				vscode.l10n.t('Could not read the GitHub account linked to your Microsoft account.'));
		}
	}

	private async confirmAccount(account: IGitHubUserInfo): Promise<Confirmation> {
		// The handle alone. `name` is free text the account holder sets, and this modal is the one
		// place where the string being shown decides whether we mint a token as this identity.
		const identity = `@${account.accountName}`;
		const signIn = vscode.l10n.t('Sign in with SSO');
		const useDifferent = vscode.l10n.t('Use a Different Microsoft Account');
		const choice = await this._confirmation.show(
			vscode.l10n.t("Your organization's Microsoft sign-in is linked to this GitHub account:\n\n{0}\n\nSign in to GitHub with this account?", identity),
			signIn,
			useDifferent);
		switch (choice) {
			case signIn: return Confirmation.SignIn;
			case useDifferent: return Confirmation.UseDifferentAccount;
			default: return Confirmation.Cancel;
		}
	}

	/**
	 * Trades an Entra access token for a GitHub one.
	 *
	 * `scopes` left out asks for no particular scopes, which is what a restore does when its caller
	 * did not name any: RFC 8693 leaves the grant up to the server in that case, and the response
	 * says what was granted.
	 */
	private async exchange(endpoint: IExchangeEndpoint, subjectToken: string, scopes: readonly string[] | undefined): Promise<IExchangedToken> {
		const requestedScopes = scopes && [...scopes];

		// Only the fields this grant needs. No `audience`, `resource`, `requested_token_type` or
		// actor fields, and nothing in the query string.
		const body = new URLSearchParams({
			client_id: Config.gitHubClientId,
			client_secret: endpoint.clientSecret,
			grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
			subject_token: subjectToken,
			subject_token_type: ACCESS_TOKEN_TYPE,
			...requestedScopes && { scope: requestedScopes.join(' ') }
		}).toString();

		this._logger.debug(`Exchanging a Microsoft token for the GitHub scopes: ${requestedScopes ? requestedScopes.join(' ') : 'whichever GitHub grants'}`);
		this._logger.trace(`The subject token of the exchange describes itself as: ${describeSubjectToken(subjectToken)}`);

		let response: IHttpResponse;
		try {
			response = await this._http.send({
				url: endpoint.url,
				method: 'POST',
				// `shouldNotRetry` does not cover 400, so leaving fallbacks on would re-send the
				// subject token to every fetcher in turn after GitHub has already rejected it. A
				// rejected exchange is an answer, not a transport failure, so we ask exactly once.
				retryFallbacks: false,
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body
			});
		} catch (e) {
			this._logger.error(`Could not reach GitHub to exchange the Microsoft token: ${e?.message ?? e}`);
			throw new EntraTokenExchangeError(
				EntraTokenExchangeFailure.Network,
				vscode.l10n.t('Could not reach GitHub to finish signing in with Microsoft. Check your connection and try again.'));
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw this.protocolError(`the response was not JSON (HTTP ${response.status})`);
		}
		if (!payload || typeof payload !== 'object') {
			throw this.protocolError(`the response was not an object (HTTP ${response.status})`);
		}
		const record = payload as Record<string, unknown>;

		// Only the stable `error` code is ever read for classification: `error_description` is
		// server supplied text and is only ever written at trace level.
		if (typeof record.error === 'string') {
			this.traceFailure(response.status, record);
			throw this.oauthError(record.error);
		}
		if (!response.ok) {
			this.traceFailure(response.status, record);
			throw this.protocolError(`HTTP ${response.status} without an error code`);
		}

		const { access_token, issued_token_type, token_type, expires_in, scope } = record;
		if (typeof access_token !== 'string' || !access_token) {
			throw this.protocolError('no access token');
		}
		if (issued_token_type !== ACCESS_TOKEN_TYPE) {
			throw this.protocolError('unexpected issued token type');
		}
		if (typeof token_type !== 'string' || token_type.toLowerCase() !== 'bearer') {
			throw this.protocolError('unexpected token type');
		}
		if (typeof expires_in !== 'number' || !isFinite(expires_in) || expires_in <= 0) {
			throw this.protocolError('missing or invalid expiry');
		}
		if (scope !== undefined && typeof scope !== 'string') {
			throw this.protocolError('invalid granted scopes');
		}
		// The session is labelled with the scopes that were requested, exactly as the OAuth flow
		// does, so what GitHub echoes back here is normally purely a diagnostic. It is written
		// verbatim: the endpoint answers with GitHub's own comma separated list rather than the
		// spaces RFC 6749 asks for, and this is the one place a silent narrowing would be visible.
		this._logger.info(`The GitHub token exchange granted the scopes: ${scope ?? 'unreported'}`);

		// Split on both separators for the same reason: GitHub uses commas here, the RFC uses
		// spaces, and a caller that asked for no scopes has nothing else to label a session with.
		const grantedScopes = scope?.split(/[\s,]+/).filter(Boolean);
		// A narrowed grant is the one shape of success that leaves the caller worse off than a
		// failure would: the session says it can do something the token cannot, so the extension
		// holding it fails later, somewhere else, with a permissions error nobody can trace back to
		// here. It is not treated as fatal, because the granted list is GitHub's own vocabulary and
		// an implied scope may legitimately be reported under a different name than it was asked
		// for, but it is the loudest thing in the log when it happens.
		const missing = requestedScopes?.filter(requested => grantedScopes && !grantedScopes.includes(requested));
		if (missing?.length) {
			this._logger.warn(`The GitHub token exchange did not grant every requested scope. Missing: ${missing.join(' ')}`);
		}

		return {
			token: access_token,
			expiresIn: expires_in,
			grantedScopes
		};
	}

	private oauthError(code: string): EntraTokenExchangeError {
		this._logger.error(`The GitHub token exchange failed with the error code '${code}'.`);
		switch (code) {
			case 'invalid_request':
			case 'invalid_client':
			case 'invalid_scope':
			case 'unsupported_grant_type':
				// A well formed rejection of the caller, the grant or the scopes. Retrying sends the
				// same request to the same server, so it cannot succeed until someone changes the
				// configuration on GitHub's side.
				return new EntraTokenExchangeError(
					EntraTokenExchangeFailure.Configuration,
					vscode.l10n.t('GitHub is not configured to accept Microsoft sign in from this application ({0}).', code));
			case 'invalid_grant':
				// Ambiguous by design: the Microsoft identity may be unmapped, or the token may not
				// be acceptable. We must not guess at a cause, and in particular must not infer that
				// the user belongs on GHE.com.
				return new EntraTokenExchangeError(
					EntraTokenExchangeFailure.Identity,
					vscode.l10n.t('GitHub did not accept your Microsoft account for sign in.'));
			default:
				return new EntraTokenExchangeError(
					EntraTokenExchangeFailure.Protocol,
					vscode.l10n.t('GitHub rejected the Microsoft sign in ({0}).', code));
		}
	}

	private protocolError(reason: string): EntraTokenExchangeError {
		this._logger.error(`The GitHub token exchange returned an unexpected response: ${reason}.`);
		return new EntraTokenExchangeError(
			EntraTokenExchangeFailure.Protocol,
			vscode.l10n.t('GitHub returned an unexpected response while signing in with Microsoft.'));
	}

	/**
	 * Writes the server's own explanation of a rejection, which is the only thing that says *why*
	 * an exchange failed. It is kept at trace level rather than `error` because it is server
	 * supplied text that can name the user or their tenant, and error level ends up in the bug
	 * reports people attach to issues; trace has to be turned on deliberately.
	 */
	private traceFailure(status: number, record: Record<string, unknown>): void {
		const explanation = ['error_description', 'error_uri']
			.filter(field => typeof record[field] === 'string')
			.map(field => `${field}=${record[field]}`);
		this._logger.trace(`The GitHub token exchange answered HTTP ${status} ${explanation.length ? explanation.join(' ') : 'with no further explanation'}.`);
	}
}

/**
 * The subject token claims that are safe to write to a log. They say which application, audience
 * and tenant the token was issued for, which is exactly what decides whether GitHub will accept it.
 * Claims that identify the user — `oid`, `sub`, `upn`, `unique_name`, `email`, `name` — are
 * deliberately absent.
 */
const LOGGABLE_SUBJECT_CLAIMS = ['iss', 'aud', 'appid', 'azp', 'tid'];

/**
 * Describes which application and audience an Entra access token was minted for, without revealing
 * the token, its signature, or anything that identifies the user. Never throws: it only ever feeds
 * a diagnostic log line, so an unreadable token is described rather than raised.
 */
function describeSubjectToken(token: string): string {
	const segments = token.split('.');
	if (segments.length !== 3) {
		return 'not a JWT';
	}
	let claims: unknown;
	try {
		const payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
		claims = JSON.parse(atob(payload + '='.repeat((4 - payload.length % 4) % 4)));
	} catch {
		return 'a JWT whose claims could not be read';
	}
	if (!claims || typeof claims !== 'object') {
		return 'a JWT whose claims are not an object';
	}
	const record = claims as Record<string, unknown>;
	const described = LOGGABLE_SUBJECT_CLAIMS
		.filter(claim => record[claim] !== undefined)
		.map(claim => `${claim}=${String(record[claim])}`);
	return described.length ? described.join(' ') : 'a JWT carrying none of the expected claims';
}

const enum Confirmation {
	SignIn,
	UseDifferentAccount,
	Cancel
}

function isCancellation(e: unknown): boolean {
	if (e === CANCELLATION_ERROR) {
		return true;
	}
	const message = (e as Error | undefined)?.message;
	// The Microsoft provider reports a dismissed consent prompt with its own message.
	return message === CANCELLATION_ERROR || message === 'User did not consent to login.';
}
