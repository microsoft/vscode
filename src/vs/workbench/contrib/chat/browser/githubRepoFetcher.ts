/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../base/common/async.js';
import { VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService, asJson, isClientError, isSuccess } from '../../../../platform/request/common/request.js';

/**
 * GitHub `owner/repo` parsed from a clone URL. Only `https://github.com/...` URLs
 * are supported in the browser implementation.
 */
export interface IGitHubRepoRef {
	readonly owner: string;
	readonly repo: string;
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

/**
 * Parse a clone URL into an `owner/repo` pair.
 * @returns the parsed reference, or `undefined` if the URL is not a recognised
 * GitHub HTTPS clone URL.
 */
export function parseGitHubCloneUrl(cloneUrl: string): IGitHubRepoRef | undefined {
	let url: URL;
	try {
		url = new URL(cloneUrl);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'https:' || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
		return undefined;
	}
	// Trim slashes before stripping `.git` so `.../o/r.git/` normalises to `o/r`.
	const path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
	const segments = path.split('/');
	// Require exactly two segments to avoid mis-parsing `.../owner/repo/issues/42`.
	if (segments.length !== 2 || !segments[0] || !segments[1]) {
		return undefined;
	}
	return { owner: segments[0], repo: segments[1] };
}

/** Response shape from GitHub's `GET /repos/{owner}/{repo}/commits/{ref}`. */
interface IGitHubCommitResponse {
	readonly sha: string;
}

/**
 * Wrap a `requestService.request` call so transport-level errors (browser
 * `fetch` throws an opaque `TypeError: Failed to fetch` for CORS / DNS /
 * connection failures) include the URL and call site.
 */
async function loggedRequest(
	requestService: IRequestService,
	options: { url: string; headers: Record<string, string>; callSite: string },
	token: CancellationToken,
) {
	try {
		return await requestService.request({ type: 'GET', url: options.url, headers: options.headers, callSite: options.callSite }, token);
	} catch (err) {
		const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
		throw new Error(`Network error during ${options.callSite} (GET ${options.url}): ${reason}`, { cause: err instanceof Error ? err : undefined });
	}
}

/**
 * Resolve a ref (branch / tag / SHA / undefined for default branch) to a
 * commit SHA via the GitHub commits API.
 */
export async function resolveGitHubRefToSha(
	requestService: IRequestService,
	repo: IGitHubRepoRef,
	ref: string | undefined,
	authToken: string | undefined,
	token: CancellationToken,
): Promise<string> {
	const refSegment = ref && ref.length > 0 ? encodeURIComponent(ref) : 'HEAD';
	const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/commits/${refSegment}`;
	const headers: Record<string, string> = {
		'Accept': 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}

	const ctx = await loggedRequest(requestService, { url, headers, callSite: 'pluginGit.resolveSha' }, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const status = ctx.res.statusCode ?? 0;
	if (status === 403 && isRateLimited(ctx.res.headers)) {
		throw new GitHubRateLimitError(`GitHub rate limit hit resolving ref '${ref ?? 'HEAD'}' on ${repo.owner}/${repo.repo}`, retryAfterFromHeaders(ctx.res.headers));
	}
	if (status === 401 || status === 403) {
		throw new GitHubAuthRequiredError(`GitHub returned ${status} resolving ref '${ref ?? 'HEAD'}' on ${repo.owner}/${repo.repo}`);
	}
	if (status === 404) {
		throw new Error(`GitHub repository or ref not found: ${repo.owner}/${repo.repo}@${ref ?? 'HEAD'}`);
	}
	if (!isSuccess(ctx)) {
		throw new Error(`GitHub returned ${status}${isClientError(ctx) ? ' (client error)' : ''} resolving ref for ${repo.owner}/${repo.repo}`);
	}
	const body = await asJson<IGitHubCommitResponse>(ctx);
	if (!body || typeof body.sha !== 'string') {
		throw new Error(`GitHub commit response for ${repo.owner}/${repo.repo} missing 'sha' field`);
	}
	return body.sha;
}

/**
 * Thrown when GitHub responds with 401/403 to indicate the caller needs to
 * sign in (or has insufficient permissions) for a private repository.
 */
export class GitHubAuthRequiredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GitHubAuthRequiredError';
	}
}

/**
 * Thrown when GitHub responds with 403 + `X-RateLimit-Remaining: 0` to
 * indicate the caller has exhausted the request quota for the current
 * window. Distinct from {@link GitHubAuthRequiredError} so callers don't
 * push users to sign in when the actual fix is "wait".
 */
export class GitHubRateLimitError extends Error {
	constructor(message: string, public readonly retryAfterSeconds?: number) {
		super(message);
		this.name = 'GitHubRateLimitError';
	}
}

function isRateLimited(headers: Record<string, string | string[] | undefined> | undefined): boolean {
	if (!headers) {
		return false;
	}
	if (readHeader(headers, 'x-ratelimit-remaining') === '0') {
		return true;
	}
	// Secondary rate limit: GitHub omits X-RateLimit-Remaining but sets Retry-After.
	return readHeader(headers, 'retry-after') !== undefined;
}

function retryAfterFromHeaders(headers: Record<string, string | string[] | undefined> | undefined): number | undefined {
	if (!headers) {
		return undefined;
	}
	const value = readHeader(headers, 'retry-after');
	if (!value) {
		return undefined;
	}
	const parsed = parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function readHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

/**
 * Fetches the file tree of a GitHub repository at the given SHA and writes
 * each blob into {@link targetDir} via {@link IFileService}.
 *
 * Uses two CORS-friendly endpoints on `api.github.com` (the `/tarball/` host
 * has no CORS, and `raw.githubusercontent.com` rejects the OPTIONS preflight
 * forced by an `Authorization` header):
 *
 *  - `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` for the listing.
 *  - `GET /repos/{owner}/{repo}/git/blobs/{blob_sha}` for each blob (base64).
 *
 * Extraction is staged to a sibling directory and atomically swapped into
 * place on success; failures clean up the staging dir and leave `targetDir`
 * untouched. Symlinks (`mode === '120000'`) and submodules (`type === 'commit'`)
 * are skipped — neither is representable in the workbench virtual file system.
 */
export async function fetchAndExtractGitHubRepo(
	requestService: IRequestService,
	fileService: IFileService,
	logService: ILogService,
	repo: IGitHubRepoRef,
	sha: string,
	targetDir: URI,
	authToken: string | undefined,
	token: CancellationToken,
): Promise<void> {
	const tree = await fetchGitHubTree(requestService, repo, sha, authToken, token);
	if (tree.truncated) {
		// GitHub caps the recursive tree response at ~100K entries / ~7MB.
		logService.warn(`[GitHubRepoFetcher] Tree for ${repo.owner}/${repo.repo}@${sha} is truncated; some files will be missing from the install`);
	}

	const stagingDir = joinPath(dirname(targetDir), `.staging-${generateUuid()}`);
	try {
		await fileService.createFolder(stagingDir);
		const blobsToFetch: { entry: IGitHubTreeEntry; dest: URI }[] = [];
		const createdDirs = new Set<string>([stagingDir.toString()]);

		for (const entry of tree.tree) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (entry.type === 'commit') {
				logService.trace(`[GitHubRepoFetcher] Skipping submodule entry ${entry.path}`);
				continue;
			}
			if (entry.mode === '120000') {
				logService.trace(`[GitHubRepoFetcher] Skipping symlink entry ${entry.path}`);
				continue;
			}
			const dest = safeJoinUnderTarget(stagingDir, entry.path);
			if (!dest) {
				logService.warn(`[GitHubRepoFetcher] Skipping unsafe tree entry path: ${entry.path}`);
				continue;
			}
			if (entry.type === 'tree') {
				if (!createdDirs.has(dest.toString())) {
					await fileService.createFolder(dest);
					createdDirs.add(dest.toString());
				}
				continue;
			}
			if (entry.type !== 'blob') {
				logService.trace(`[GitHubRepoFetcher] Skipping tree entry with unsupported type '${entry.type}': ${entry.path}`);
				continue;
			}
			// Pre-create the parent directory so parallel blob writes don't race on `createFolder`.
			const parent = dirname(dest);
			if (parent.toString() !== dest.toString() && !createdDirs.has(parent.toString())) {
				await fileService.createFolder(parent);
				createdDirs.add(parent.toString());
			}
			blobsToFetch.push({ entry, dest });
		}

		const limiter = new Limiter<void>(MAX_PARALLEL_BLOB_FETCHES);
		await Promise.all(blobsToFetch.map(({ entry, dest }) => limiter.queue(async () => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const content = await fetchGitHubBlob(requestService, repo, sha, entry, authToken, token);
			await fileService.writeFile(dest, content);
		})));

		await fileService.move(stagingDir, targetDir, true);
	} catch (err) {
		try {
			if (await fileService.exists(stagingDir)) {
				await fileService.del(stagingDir, { recursive: true });
			}
		} catch (cleanupErr) {
			logService.warn(`[GitHubRepoFetcher] Failed to clean up staging dir ${stagingDir.toString()}:`, cleanupErr);
		}
		throw err;
	}
}

/** Maximum number of blob downloads to issue in parallel. */
const MAX_PARALLEL_BLOB_FETCHES = 10;

/** A single entry in a GitHub git-trees API response. */
interface IGitHubTreeEntry {
	readonly path: string;
	/**
	 * File mode as a string of octal digits. The values we care about are
	 * `'120000'` (symlink, skipped) and the various blob/tree modes.
	 */
	readonly mode: string;
	/** `'blob'` for files, `'tree'` for directories, `'commit'` for submodules. */
	readonly type: 'blob' | 'tree' | 'commit';
	readonly sha: string;
	readonly size?: number;
}

/** Response shape from `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`. */
interface IGitHubTreeResponse {
	readonly sha: string;
	readonly tree: readonly IGitHubTreeEntry[];
	readonly truncated: boolean;
}

async function fetchGitHubTree(
	requestService: IRequestService,
	repo: IGitHubRepoRef,
	sha: string,
	authToken: string | undefined,
	token: CancellationToken,
): Promise<IGitHubTreeResponse> {
	const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`;
	const headers: Record<string, string> = {
		'Accept': 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}

	const ctx = await loggedRequest(requestService, { url, headers, callSite: 'pluginGit.tree' }, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const status = ctx.res.statusCode ?? 0;
	if (status === 403 && isRateLimited(ctx.res.headers)) {
		throw new GitHubRateLimitError(`GitHub rate limit hit fetching tree for ${repo.owner}/${repo.repo}@${sha}`, retryAfterFromHeaders(ctx.res.headers));
	}
	if (status === 401 || status === 403) {
		throw new GitHubAuthRequiredError(`GitHub returned ${status} fetching tree for ${repo.owner}/${repo.repo}@${sha}`);
	}
	if (status === 404) {
		throw new Error(`GitHub repository or commit not found: ${repo.owner}/${repo.repo}@${sha}`);
	}
	if (!isSuccess(ctx)) {
		throw new Error(`GitHub returned ${status}${isClientError(ctx) ? ' (client error)' : ''} fetching tree for ${repo.owner}/${repo.repo}@${sha}`);
	}
	const body = await asJson<IGitHubTreeResponse>(ctx);
	if (!body || !Array.isArray(body.tree)) {
		throw new Error(`GitHub tree response for ${repo.owner}/${repo.repo}@${sha} missing 'tree' array`);
	}
	return body;
}

async function fetchGitHubBlob(
	requestService: IRequestService,
	repo: IGitHubRepoRef,
	commitSha: string,
	entry: IGitHubTreeEntry,
	authToken: string | undefined,
	token: CancellationToken,
): Promise<VSBuffer> {
	// Use api.github.com's blobs endpoint rather than raw.githubusercontent.com:
	// the raw host rejects the OPTIONS preflight that an `Authorization` header
	// forces. The blob SHA comes from the tree response.
	const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/blobs/${encodeURIComponent(entry.sha)}`;
	const headers: Record<string, string> = {
		'Accept': 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}

	const ctx = await loggedRequest(requestService, { url, headers, callSite: 'pluginGit.blob' }, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const status = ctx.res.statusCode ?? 0;
	if (status === 403 && isRateLimited(ctx.res.headers)) {
		throw new GitHubRateLimitError(`GitHub rate limit hit fetching blob '${entry.path}' for ${repo.owner}/${repo.repo}@${commitSha}`, retryAfterFromHeaders(ctx.res.headers));
	}
	if (status === 401 || status === 403) {
		throw new GitHubAuthRequiredError(`GitHub returned ${status} fetching blob '${entry.path}' for ${repo.owner}/${repo.repo}@${commitSha}`);
	}
	if (!isSuccess(ctx)) {
		throw new Error(`GitHub returned ${status} fetching blob '${entry.path}' for ${repo.owner}/${repo.repo}@${commitSha}`);
	}
	const body = await asJson<IGitHubBlobResponse>(ctx);
	if (!body || typeof body.content !== 'string') {
		throw new Error(`GitHub blob response for '${entry.path}' missing 'content' field`);
	}
	if (body.encoding !== 'base64') {
		throw new Error(`GitHub blob response for '${entry.path}' has unsupported encoding '${body.encoding}'`);
	}
	// GitHub wraps base64 at 60 columns; strip whitespace before decoding.
	return decodeBase64(body.content.replace(/\s+/g, ''));
}

/** Response shape from `GET /repos/{owner}/{repo}/git/blobs/{sha}`. */
interface IGitHubBlobResponse {
	readonly content: string;
	readonly encoding: string;
}

/**
 * Sanitize a tree entry path to safe segments under {@link targetDir}. Rejects
 * NUL bytes, absolute paths, `.`/`..` segments, and segments containing a
 * backslash (which Windows path APIs would treat as a separator). The result
 * is double-checked with `isEqualOrParent` as defence in depth.
 *
 * @returns the resolved URI, or `undefined` for paths that should be skipped.
 */
function safeJoinUnderTarget(targetDir: URI, inner: string): URI | undefined {
	if (inner.includes('\0') || inner.startsWith('/') || inner.startsWith('\\')) {
		return undefined;
	}
	const segments: string[] = [];
	for (const seg of inner.split('/')) {
		if (seg.length === 0 || seg === '.') {
			continue;
		}
		if (seg === '..' || seg.includes('\\')) {
			return undefined;
		}
		segments.push(seg);
	}
	if (segments.length === 0) {
		return undefined;
	}
	const dest = joinPath(targetDir, ...segments);
	// Defence in depth: ensure the joined URI has not escaped via any
	// platform-specific normalisation we missed.
	if (!isEqualOrParent(dest, targetDir)) {
		return undefined;
	}
	return dest;
}
