/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IGitHubAccountClient } from '../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../platform/github/common/anonymous/anonymous.js';
import { PaginationLimitError } from '../../../platform/github/common/client/pagination.js';
import { ApiRequestOptions } from '../../../platform/github/common/client/request.js';
import { SchemaError, parse } from '../../../platform/github/common/client/schema.js';
import { PageOptions, RepositoryRef } from '../../../platform/github/common/client/types.js';
import { Connection } from '../../../platform/github/common/core/core.js';
import { CreatePullRequestRequest, ListPullRequestsOptions, PullRequestSummary } from '../../../platform/github/common/core/pullRequests.js';
import { Branch, CreateRepositoryRequest, ListRepositoriesOptions, Repository, RepositoryAssignableUser, RepositoryCommitAuthor, RepositoryRulesetNode, RepositoryViewerInfo } from '../../../platform/github/common/core/repositories.js';
import { RepositorySearchItem } from '../../../platform/github/common/core/search.js';
import { User } from '../../../platform/github/common/core/users.js';
import { Gist } from '../../../platform/github/common/gists/gists.js';
import { withGitHubCredentialDeadline } from '../../../platform/github/common/githubCredentialService.js';
import { RequestError, RequestErrorKind } from '../../../platform/github/common/types.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IWorkbenchGitHubService } from '../../services/github/common/githubService.js';
import { GitHubErrorCodeDto, GitHubResultDto, IGitHubCreateGistDto, IGitHubErrorDto, IGitHubGistDto, MainContext, MainThreadGitHubShape } from '../common/extHost.protocol.js';

/** The internal module binds only GitHub.com sessions; Enterprise sessions are not selectable. */
const gitHubProviderId = 'github';

/** One extension-host lease; the client is set once acquisition completes. */
interface IClientEntry {
	readonly extensionId: string;
	readonly sessionId: string | undefined;
	readonly lifetime: CancellationTokenSource;
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
 * Executes the internal `@vscode/internal-github` module through the workbench GitHub service, which routes to the shared
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
		return this._acquire(handle, extensionId, sessionId, token, async (entry, cancellationToken) => {
			const session = await this._resolveSession(extensionId, sessionId, cancellationToken);
			CancellationToken.throwIfCanceled(cancellationToken);
			entry.accountLabel = session.account.label;
			return this._gitHubService.acquireAccountApiClient(gitHubProviderId, session, cancellationToken);
		});
	}

	async $getAnonymousClient(handle: number, extensionId: string, token: CancellationToken): Promise<GitHubResultDto<void>> {
		return this._acquire(handle, extensionId, undefined, token, (_entry, cancellationToken) => this._gitHubService.acquireAnonymousApiClient(cancellationToken));
	}

	$releaseClient(handle: number): void {
		const entry = this._clients.get(handle);
		if (entry) {
			this._clients.delete(handle);
			entry.lifetime.cancel();
			entry.store.dispose();
		}
	}

	async $getGist(handle: number, gistId: string, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		return this._run(handle, token, async (entry, client, cancellationToken) => {
			if (typeof gistId !== 'string' || !gistId) {
				throw new GitHubOperationError('validation', localize('github.invalidGistId', "A gist identifier is required."));
			}
			return toGistDto(await client.gist.get(gistId, cancellationToken, this._requestOptions(entry)));
		});
	}

	async $createGist(handle: number, gist: IGitHubCreateGistDto, token: CancellationToken): Promise<GitHubResultDto<IGitHubGistDto>> {
		return this._runAuthenticated(handle, token, async (client, cancellationToken, options) => {
			const request = validateCreateGist(gist);
			return toGistDto(await client.gist.create(request, cancellationToken, options));
		});
	}

	async $getGitHubUser(handle: number, token: CancellationToken): Promise<GitHubResultDto<User>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.users.getAuthenticated(cancellationToken, options));
	}

	async $getGitHubRepository(handle: number, repository: RepositoryRef, token: CancellationToken): Promise<GitHubResultDto<Repository>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.get({ owner: repository?.owner, repo: repository?.repo }, cancellationToken, options));
	}

	async $listGitHubRepositories(handle: number, query: ListRepositoriesOptions['query'], token: CancellationToken): Promise<GitHubResultDto<readonly Repository[]>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.listForAuthenticatedUser(cancellationToken, {
			...options, query: validateRequest(query, parseRepositoryQuery),
		}));
	}

	async $searchGitHubRepositories(handle: number, query: string, token: CancellationToken): Promise<GitHubResultDto<readonly RepositorySearchItem[]>> {
		return this._runAuthenticated(handle, token, async (client, cancellationToken, options) => {
			const result = await client.search.repositories(validateRequest(query, parse.nonEmptyString), cancellationToken, { ...options, query: { sort: 'stars' } });
			return result.items;
		});
	}

	async $listGitHubBranches(handle: number, repository: RepositoryRef, query: PageOptions | undefined, token: CancellationToken): Promise<GitHubResultDto<readonly Branch[]>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.listBranches({ owner: repository?.owner, repo: repository?.repo }, cancellationToken, {
			...options, query: validateRequest(query, parseBranchQuery),
		}));
	}

	async $createGitHubRepository(handle: number, request: CreateRepositoryRequest, token: CancellationToken): Promise<GitHubResultDto<Repository>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.create(validateRequest(request, parseCreateRepository), cancellationToken, options));
	}

	async $forkGitHubRepository(handle: number, repository: RepositoryRef, token: CancellationToken): Promise<GitHubResultDto<Repository>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.fork({ owner: repository?.owner, repo: repository?.repo }, {}, cancellationToken, options));
	}

	async $listGitHubPullRequests(handle: number, repository: RepositoryRef, query: ListPullRequestsOptions['query'], token: CancellationToken): Promise<GitHubResultDto<readonly PullRequestSummary[]>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.pullRequests.list({ owner: repository?.owner, repo: repository?.repo }, cancellationToken, {
			...options, query: validateRequest(query, parsePullRequestQuery),
		}));
	}

	async $createGitHubPullRequest(handle: number, repository: RepositoryRef, request: CreatePullRequestRequest, token: CancellationToken): Promise<GitHubResultDto<PullRequestSummary>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.pullRequests.create({ owner: repository?.owner, repo: repository?.repo }, validateRequest(request, parseCreatePullRequest), cancellationToken, options));
	}

	async $getGitHubRepositoryViewerInfo(handle: number, repository: RepositoryRef, token: CancellationToken): Promise<GitHubResultDto<RepositoryViewerInfo | null>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.getViewerInfo(validateRequest(repository, parseRepositoryRef), cancellationToken, options));
	}

	async $listGitHubRulesetConnection(handle: number, repository: RepositoryRef, after: string | undefined, maxPages: number | undefined, token: CancellationToken): Promise<GitHubResultDto<Connection<RepositoryRulesetNode> | null>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.listRulesetConnection(validateRequest(repository, parseRepositoryRef), cancellationToken, {
			...options, query: { first: 100, after: validateRequest(after, parse.optional(parse.nonEmptyString)) }, maxPages,
		}));
	}

	async $listGitHubAssignableUsers(handle: number, repository: RepositoryRef, token: CancellationToken): Promise<GitHubResultDto<Connection<RepositoryAssignableUser> | null>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.listAssignableUsers(validateRequest(repository, parseRepositoryRef), cancellationToken, {
			...options, query: { first: 100 },
		}));
	}

	async $getGitHubCommitAuthor(handle: number, repository: RepositoryRef, ref: string, token: CancellationToken): Promise<GitHubResultDto<RepositoryCommitAuthor | null>> {
		return this._runAuthenticated(handle, token, (client, cancellationToken, options) => client.repositories.getCommitAuthor(validateRequest(repository, parseRepositoryRef), validateRequest(ref, parse.nonEmptyString), cancellationToken, options));
	}

	private async _acquire(
		handle: number,
		extensionId: string,
		sessionId: string | undefined,
		token: CancellationToken,
		acquire: (entry: IClientEntry, cancellationToken: CancellationToken) => Promise<IGitHubAnonymousClient | IGitHubAccountClient>,
	): Promise<GitHubResultDto<void>> {
		if (this._store.isDisposed || this._clients.has(handle)) {
			return { kind: 'error', error: { code: 'unknown', message: localize('github.invalidHandle', "The GitHub client could not be created.") } };
		}
		const store = new DisposableStore();
		const entry: IClientEntry = { extensionId, sessionId, lifetime: store.add(new CancellationTokenSource()), store };
		this._clients.set(handle, entry);
		const lifetime = new DisposableStore();
		const cancellationToken = CancellationToken.any([token, entry.lifetime.token], lifetime);
		try {
			const client = await acquire(entry, cancellationToken);
			if (this._clients.get(handle) !== entry || cancellationToken.isCancellationRequested) {
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
			CancellationToken.throwIfCanceled(cancellationToken);
			return { kind: 'ok', value: undefined };
		} catch (error) {
			const failure: GitHubResultDto<void> = entry.invalidated ? { kind: 'error', error: sessionUnavailableError() } : this._toFailure(error, cancellationToken);
			this._release(handle, entry);
			return failure;
		} finally {
			lifetime.dispose();
		}
	}

	private _release(handle: number, entry: IClientEntry): void {
		if (this._clients.get(handle) === entry) {
			this.$releaseClient(handle);
		}
	}

	private async _run<T>(handle: number, token: CancellationToken, operation: (entry: IClientEntry, client: IGitHubAnonymousClient | IGitHubAccountClient, cancellationToken: CancellationToken) => Promise<T>): Promise<GitHubResultDto<T>> {
		const entry = this._clients.get(handle);
		if (!entry?.client) {
			return { kind: 'error', error: { code: 'disposed', message: localize('github.clientDisposed', "The GitHub client has been disposed.") } };
		}
		if (entry.invalidated || !this._hasAccess(entry)) {
			this._invalidate(entry);
			return { kind: 'error', error: sessionUnavailableError() };
		}
		const lifetime = new DisposableStore();
		const cancellationToken = CancellationToken.any([token, entry.lifetime.token], lifetime);
		try {
			return { kind: 'ok', value: await operation(entry, entry.client, cancellationToken) };
		} catch (error) {
			if (entry.invalidated) {
				return { kind: 'error', error: sessionUnavailableError() };
			}
			if (entry.lifetime.token.isCancellationRequested && !token.isCancellationRequested) {
				return { kind: 'error', error: { code: 'disposed', message: localize('github.clientDisposed', "The GitHub client has been disposed.") } };
			}
			return this._toFailure(error, cancellationToken);
		} finally {
			lifetime.dispose();
		}
	}

	private _runAuthenticated<T>(handle: number, token: CancellationToken, operation: (client: IGitHubAccountClient, cancellationToken: CancellationToken, options: ApiRequestOptions) => Promise<T>): Promise<GitHubResultDto<T>> {
		return this._run(handle, token, (entry, client, cancellationToken) => {
			if (entry.accountLabel === undefined || !isAccountClient(client)) {
				throw new GitHubOperationError('authentication', localize('github.operationRequiresSession', "This operation requires a client bound to a GitHub session."));
			}
			return operation(client, cancellationToken, this._requestOptions(entry));
		});
	}

	/** Resolves a `github` session the extension may use; absent and inaccessible sessions are indistinguishable. */
	private async _resolveSession(extensionId: string, sessionId: string, cancellationToken: CancellationToken): Promise<AuthenticationSession> {
		if (typeof sessionId !== 'string' || !sessionId) {
			throw new GitHubOperationError('authentication', sessionUnavailableError().message);
		}
		let sessions: readonly AuthenticationSession[];
		try {
			sessions = await withGitHubCredentialDeadline(cancellationToken, () => this._authenticationService.getSessions(gitHubProviderId, undefined, { silent: true }, true));
		} catch (error) {
			if (cancellationToken.isCancellationRequested || isCancellationError(error) || error instanceof RequestError && error.kind === 'timeout') {
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
			entry.lifetime.cancel();
			entry.store.clear();
		}
	}

	private _requestOptions(entry: IClientEntry): ApiRequestOptions {
		return { caller: `extension.${entry.extensionId}` };
	}

	private _toFailure(error: unknown, cancellationToken: CancellationToken): GitHubResultDto<never> {
		if (cancellationToken.isCancellationRequested || isCancellationError(error)) {
			return { kind: 'canceled' };
		}
		if (error instanceof GitHubOperationError) {
			return { kind: 'error', error: { code: error.code, message: error.message } };
		}
		if (error instanceof SchemaError) {
			return { kind: 'error', error: { code: 'invalidResponse', message: localize('github.invalidResponse', "The GitHub response was invalid.") } };
		}
		if (error instanceof PaginationLimitError) {
			return { kind: 'error', error: { code: 'invalidResponse', message: localize('github.paginationLimit', "GitHub pagination exceeded the limit of {0} pages.", error.maxPages) } };
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

const parseRepositoryRef = parse.copyObject<RepositoryRef>({
	owner: parse.nonEmptyString,
	repo: parse.nonEmptyString,
});

const pageSchema = {
	page: parse.optional(parse.finiteNumber),
	per_page: parse.optional(parse.finiteNumber),
};

const parseBranchQuery = parse.optional(parse.copyObject(pageSchema));
const parseRepositoryQuery = parse.optional(parse.copyObject({
	...pageSchema,
	sort: parse.optional(parse.oneOf('created', 'updated', 'pushed', 'full_name')),
}));

const parseCreateRepository = parse.copyObject({
	name: parse.nonEmptyString,
	private: parse.optional(parse.boolean),
});

const parsePullRequestQuery = parse.optional(parse.copyObject({
	head: parse.optional(parse.nonEmptyString),
	state: parse.optional(parse.oneOf('open', 'closed', 'all')),
}));

const parseCreatePullRequest = parse.copyObject({
	title: parse.nonEmptyString,
	body: parse.optional(parse.string),
	head: parse.nonEmptyString,
	base: parse.nonEmptyString,
});

function validateRequest<T>(value: unknown, parser: parse.Parser<T>): T {
	try {
		return parser(value);
	} catch (error) {
		if (error instanceof SchemaError) {
			throw new GitHubOperationError('validation', localize('github.invalidRequest', "Invalid GitHub request: {0}", error.message));
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
