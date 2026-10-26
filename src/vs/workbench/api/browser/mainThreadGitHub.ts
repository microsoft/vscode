/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IGitHubAccountClient } from '../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../platform/github/common/anonymous/anonymous.js';
import { ApiRequestOptions } from '../../../platform/github/common/client/request.js';
import { parse, SchemaError } from '../../../platform/github/common/client/schema.js';
import { Gist } from '../../../platform/github/common/gists/gists.js';
import { withGitHubCredentialDeadline } from '../../../platform/github/common/githubCredentialService.js';
import { RequestError, RequestErrorKind } from '../../../platform/github/common/types.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IWorkbenchGitHubService } from '../../services/github/common/githubService.js';
import { GitHubErrorCodeDto, GitHubResultDto, IGitHubCreateGistDto, IGitHubErrorDto, IGitHubGistDto, MainContext, MainThreadGitHubShape } from '../common/extHost.protocol.js';

/** The initial proposal binds only GitHub.com sessions; Enterprise sessions are not selectable. */
const gitHubProviderId = 'github';

/** One extension-host lease; the client is set once acquisition completes. */
interface IClientEntry {
	readonly extensionId: string;
	readonly sessionId: string | undefined;
	readonly lifetime: AbortController;
	readonly store: DisposableStore;
	/** Account label of the bound `github` session; absent for anonymous clients. */
	accountLabel?: string;
	client?: IGitHubAnonymousClient | IGitHubAccountClient;
	/** Set when the bound session or the extension's access to it is gone. */
	invalidated?: boolean;
}

class GitHubOperationError extends Error {
	constructor(readonly code: GitHubErrorCodeDto, message: string) {
		super(message);
	}
}

/**
 * Executes the proposed `vscode.github` API through the workbench GitHub service, which routes to the shared
 * process on desktop and runs locally in browser deployments. The extension host only chooses a session id;
 * this side resolves it, enforces the extension's account access, and never returns credentials.
 */
@extHostNamedCustomer(MainContext.MainThreadGitHub)
export class MainThreadGitHub extends Disposable implements MainThreadGitHubShape {

	private readonly _clients = new Map<number, IClientEntry>();

	constructor(
		_extHostContext: IExtHostContext,
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(({ id }) => {
			if (id === gitHubProviderId) {
				for (const entry of this._clients.values()) {
					if (entry.sessionId !== undefined) {
						this._invalidate(entry);
					}
				}
			}
		}));
		this._register(this._authenticationAccessService.onDidChangeExtensionSessionAccess(({ providerId, accountName }) => {
			if (providerId !== gitHubProviderId) {
				return;
			}
			for (const entry of this._clients.values()) {
				if (entry.accountLabel === accountName && !this._hasAccess(entry)) {
					this._invalidate(entry);
				}
			}
		}));
		this._register(toDisposable(() => {
			for (const handle of [...this._clients.keys()]) {
				this.$releaseClient(handle);
			}
		}));
	}

	async $getClient(handle: number, extensionId: string, sessionId: string, token: CancellationToken): Promise<GitHubResultDto<void>> {
		return this._acquire(handle, extensionId, sessionId, token, async (entry, signal) => {
			const session = await this._resolveSession(extensionId, sessionId, signal);
			signal.throwIfAborted();
			entry.accountLabel = session.account.label;
			return this._gitHubService.acquireAccountApiClient({
				providerId: gitHubProviderId,
				sessionId: session.id,
				accountId: session.account.id,
				scopes: [...session.scopes],
				authorizationServer: session.authorizationServer?.toString(),
			}, signal);
		});
	}

	async $getAnonymousClient(handle: number, extensionId: string, token: CancellationToken): Promise<GitHubResultDto<void>> {
		return this._acquire(handle, extensionId, undefined, token, (_entry, signal) => this._gitHubService.acquireAnonymousApiClient(signal));
	}

	$releaseClient(handle: number): void {
		const entry = this._clients.get(handle);
		if (entry) {
			this._clients.delete(handle);
			entry.lifetime.abort();
			entry.store.dispose();
		}
	}

	async $getGist(handle: number, gistId: string, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		return this._run(handle, token, async (entry, client, signal) => {
			if (typeof gistId !== 'string' || !gistId) {
				throw new GitHubOperationError('validation', localize('github.invalidGistId', "A gist identifier is required."));
			}
			return toGistDto(await client.gist.get(gistId, signal, this._requestOptions(entry)));
		});
	}

	async $createGist(handle: number, gist: IGitHubCreateGistDto, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		return this._run(handle, token, async (entry, client, signal) => {
			if (entry.accountLabel === undefined || !isAccountClient(client)) {
				throw new GitHubOperationError('authentication', localize('github.createRequiresSession', "Creating a gist requires a client bound to a GitHub session."));
			}
			const request = validateCreateGist(gist);
			return toGistDto(await client.gist.create(request, signal, this._requestOptions(entry)));
		});
	}

	private async _acquire(
		handle: number,
		extensionId: string,
		sessionId: string | undefined,
		token: CancellationToken,
		acquire: (entry: IClientEntry, signal: AbortSignal) => Promise<IGitHubAnonymousClient | IGitHubAccountClient>,
	): Promise<GitHubResultDto<void>> {
		if (this._store.isDisposed || this._clients.has(handle)) {
			return { kind: 'error', error: { code: 'unknown', message: localize('github.invalidHandle', "The GitHub client could not be created.") } };
		}
		const entry: IClientEntry = { extensionId, sessionId, lifetime: new AbortController(), store: new DisposableStore() };
		this._clients.set(handle, entry);
		const signal = this._createSignal(entry, token);
		try {
			const client = await acquire(entry, signal.signal);
			if (this._clients.get(handle) !== entry || signal.signal.aborted) {
				client.dispose();
				this._release(handle, entry);
				return entry.invalidated ? { kind: 'error', error: sessionUnavailableError() } : { kind: 'canceled' };
			}
			entry.client = entry.store.add(client);
			if (isAccountClient(client)) {
				entry.store.add(client.onDidInvalidate(() => this._invalidate(entry)));
			}
			if (!this._hasAccess(entry)) {
				this._invalidate(entry);
			}
			signal.signal.throwIfAborted();
			return { kind: 'ok', value: undefined };
		} catch (error) {
			const failure: GitHubResultDto<void> = entry.invalidated ? { kind: 'error', error: sessionUnavailableError() } : this._toFailure(error, signal.signal);
			this._release(handle, entry);
			return failure;
		} finally {
			signal.dispose();
		}
	}

	private _release(handle: number, entry: IClientEntry): void {
		if (this._clients.get(handle) === entry) {
			this.$releaseClient(handle);
		}
	}

	private async _run<T>(handle: number, token: CancellationToken, operation: (entry: IClientEntry, client: IGitHubAnonymousClient | IGitHubAccountClient, signal: AbortSignal) => Promise<T>): Promise<GitHubResultDto<T>> {
		const entry = this._clients.get(handle);
		if (!entry?.client) {
			return { kind: 'error', error: { code: 'disposed', message: localize('github.clientDisposed', "The GitHub client has been disposed.") } };
		}
		if (entry.invalidated || !this._hasAccess(entry)) {
			this._invalidate(entry);
			return { kind: 'error', error: sessionUnavailableError() };
		}
		const signal = this._createSignal(entry, token);
		try {
			return { kind: 'ok', value: await operation(entry, entry.client, signal.signal) };
		} catch (error) {
			if (entry.invalidated) {
				return { kind: 'error', error: sessionUnavailableError() };
			}
			if (entry.lifetime.signal.aborted && !token.isCancellationRequested) {
				return { kind: 'error', error: { code: 'disposed', message: localize('github.clientDisposed', "The GitHub client has been disposed.") } };
			}
			return this._toFailure(error, signal.signal);
		} finally {
			signal.dispose();
		}
	}

	/** Resolves a `github` session the extension may use; absent and inaccessible sessions are indistinguishable. */
	private async _resolveSession(extensionId: string, sessionId: string, signal: AbortSignal): Promise<AuthenticationSession> {
		if (typeof sessionId !== 'string' || !sessionId) {
			throw new GitHubOperationError('authentication', sessionUnavailableError().message);
		}
		let sessions: readonly AuthenticationSession[];
		try {
			sessions = await withGitHubCredentialDeadline(signal, () => this._authenticationService.getSessions(gitHubProviderId, undefined, { silent: true }, true));
		} catch (error) {
			if (signal.aborted || isCancellationError(error) || error instanceof RequestError && error.kind === 'timeout') {
				throw error;
			}
			this._logService.trace('[MainThreadGitHub] Could not list GitHub sessions', error);
			throw new GitHubOperationError('authentication', sessionUnavailableError().message);
		}
		const session = sessions.find(candidate => candidate.id === sessionId);
		if (!session || this._authenticationAccessService.isAccessAllowed(gitHubProviderId, session.account.label, extensionId) !== true) {
			throw new GitHubOperationError('authentication', sessionUnavailableError().message);
		}
		return session;
	}

	private _hasAccess(entry: IClientEntry): boolean {
		return entry.sessionId === undefined || entry.accountLabel !== undefined
			&& this._authenticationAccessService.isAccessAllowed(gitHubProviderId, entry.accountLabel, entry.extensionId) === true;
	}

	private _invalidate(entry: IClientEntry): void {
		if (!entry.invalidated) {
			entry.invalidated = true;
			entry.lifetime.abort();
			entry.store.clear();
		}
	}

	private _createSignal(entry: IClientEntry, token: CancellationToken): { readonly signal: AbortSignal; dispose(): void } {
		const store = new DisposableStore();
		return { signal: AbortSignal.any([CancellationToken.toAbortSignal(token, store), entry.lifetime.signal]), dispose: () => store.dispose() };
	}

	private _requestOptions(entry: IClientEntry): ApiRequestOptions {
		return { caller: `extension.${entry.extensionId}` };
	}

	private _toFailure(error: unknown, signal: AbortSignal): GitHubResultDto<never> {
		if (signal.aborted || isCancellationError(error)) {
			return { kind: 'canceled' };
		}
		if (error instanceof GitHubOperationError) {
			return { kind: 'error', error: { code: error.code, message: error.message } };
		}
		if (error instanceof RequestError) {
			return { kind: 'error', error: { code: toErrorCode(error.kind), message: error.message, status: error.statusCode } };
		}
		this._logService.error('[MainThreadGitHub] Unexpected GitHub client failure', error);
		return { kind: 'error', error: { code: 'unknown', message: localize('github.unknownError', "The GitHub request failed.") } };
	}
}

function isAccountClient(client: IGitHubAnonymousClient | IGitHubAccountClient): client is IGitHubAccountClient {
	return 'authorization' in client;
}

function sessionUnavailableError(): IGitHubErrorDto {
	return { code: 'authentication', message: localize('github.sessionUnavailable', "The selected GitHub session is not available to this extension.") };
}

function toErrorCode(kind: RequestErrorKind): GitHubErrorCodeDto {
	switch (kind) {
		case 'authentication':
		case 'authorization':
		case 'notFound':
		case 'validation':
		case 'rateLimit':
		case 'network':
		case 'timeout':
		case 'server':
			return kind;
		case 'overloaded':
			return 'rateLimit';
		case 'schema':
		case 'malformedResponse':
		case 'responseTooLarge':
			return 'invalidResponse';
		default:
			return 'unknown';
	}
}

const parseCreateGist = parse.copyObject<IGitHubCreateGistDto>({
	public: parse.optional(parse.boolean, false),
	files: parse.refine(
		parse.dictionary(parse.copyObject({ content: parse.string })),
		files => {
			const names = Object.keys(files);
			return names.length > 0 && names.every(name => name.trim().length > 0 && !/[\\/]/.test(name));
		},
		localize('github.invalidGistFiles', "A gist must contain at least one file with non-empty names and no path separators."),
	),
});

function validateCreateGist(gist: IGitHubCreateGistDto): IGitHubCreateGistDto {
	try {
		return parseCreateGist(gist);
	} catch (error) {
		if (error instanceof SchemaError) {
			throw new GitHubOperationError('validation', localize('github.invalidGist', "Invalid gist request: {0}", error.message));
		}
		throw error;
	}
}

function toGistDto(gist: Gist): IGitHubGistDto {
	return {
		id: gist.id,
		htmlUrl: gist.html_url,
		files: Object.values(gist.files).map(file => ({
			content: file.content,
			isBinary: file.encoding === 'base64',
			truncated: file.truncated,
		})),
	};
}
