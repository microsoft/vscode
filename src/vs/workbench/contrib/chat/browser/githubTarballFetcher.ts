/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { VSBuffer, streamToBuffer } from '../../../../base/common/buffer.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
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
	const path = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
	const segments = path.split('/');
	// Require exactly two non-empty segments so we don't mis-parse non-clone
	// GitHub URLs (e.g. https://github.com/owner/repo/issues/42) as repos.
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

	const ctx = await requestService.request({ type: 'GET', url, headers, callSite: 'pluginGit.resolveSha' }, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const status = ctx.res.statusCode ?? 0;
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
 * Fetches a GitHub repository tarball at the given SHA and extracts its
 * contents into {@link targetDir} via {@link IFileService}.
 *
 * The tarball is fetched from `codeload.github.com` (resolved via the
 * standard `/tarball` redirect). All entries are extracted relative to the
 * repository root: GitHub wraps every file in a top-level
 * `{repo}-{shortSha}/` directory which is stripped here so callers see a
 * clean tree.
 */
export async function fetchAndExtractGitHubTarball(
	requestService: IRequestService,
	fileService: IFileService,
	logService: ILogService,
	repo: IGitHubRepoRef,
	sha: string,
	targetDir: URI,
	authToken: string | undefined,
	token: CancellationToken,
): Promise<void> {
	const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/tarball/${encodeURIComponent(sha)}`;
	const headers: Record<string, string> = {
		'Accept': 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}

	logService.trace(`[GitHubTarballFetcher] GET ${url}`);
	const ctx = await requestService.request({ type: 'GET', url, headers, followRedirects: 5, callSite: 'pluginGit.tarball' }, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const status = ctx.res.statusCode ?? 0;
	if (status === 401 || status === 403) {
		throw new GitHubAuthRequiredError(`GitHub returned ${status} downloading tarball for ${repo.owner}/${repo.repo}@${sha}`);
	}
	if (!isSuccess(ctx)) {
		throw new Error(`GitHub returned ${status} downloading tarball for ${repo.owner}/${repo.repo}@${sha}`);
	}

	const gzipped = await streamToBuffer(ctx.stream);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}

	const tar = await gunzip(gzipped.buffer);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}

	// Wipe any prior contents so files removed upstream don't linger and so
	// that we never partially overlay a previous extraction.
	if (await fileService.exists(targetDir)) {
		try {
			await fileService.del(targetDir, { recursive: true });
		} catch (err) {
			logService.warn(`[GitHubTarballFetcher] Failed to clear ${targetDir.toString()} before extraction:`, err);
		}
	}

	await extractTarToFileService(tar, targetDir, fileService, logService, token);
}

/**
 * Decompress a gzip stream using the platform-provided
 * `DecompressionStream`. Available natively in browsers and in Node 20+.
 *
 * Implemented via a one-shot `ReadableStream` that enqueues the buffer
 * directly so the call type-checks under stricter DOM types -- both
 * `BodyInit` and `BlobPart` reject `Uint8Array<ArrayBufferLike>`. We
 * normalise the input to `Uint8Array<ArrayBuffer>` via `.slice()` so the
 * stream's element type matches the writable side of
 * `DecompressionStream` (which requires `Uint8Array<ArrayBuffer>`).
 */
async function gunzip(input: Uint8Array): Promise<Uint8Array> {
	const safeInput = input.slice();
	const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(controller) {
			controller.enqueue(safeInput);
			controller.close();
		},
	});
	const inflated = source.pipeThrough(new DecompressionStream('gzip'));
	const out = await new Response(inflated).arrayBuffer();
	return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// Minimal TAR parser (USTAR + GNU long-name extension)
// ---------------------------------------------------------------------------

const BLOCK_SIZE = 512;

/**
 * Decode an octal-encoded numeric field from a tar header. Tar uses
 * NUL/space-terminated octal strings for size, mode, mtime, etc.
 */
function readOctal(view: Uint8Array, offset: number, length: number): number {
	let end = offset + length;
	while (end > offset && (view[end - 1] === 0 || view[end - 1] === 0x20)) {
		end--;
	}
	let value = 0;
	for (let i = offset; i < end; i++) {
		const ch = view[i];
		if (ch < 0x30 || ch > 0x37) {
			break; // stop at first non-octal digit
		}
		value = (value << 3) | (ch - 0x30);
	}
	return value;
}

/** Read a NUL-terminated ASCII string out of a fixed-width header field. */
function readAsciiField(view: Uint8Array, offset: number, length: number): string {
	let end = offset;
	const limit = offset + length;
	while (end < limit && view[end] !== 0) {
		end++;
	}
	let s = '';
	for (let i = offset; i < end; i++) {
		s += String.fromCharCode(view[i]);
	}
	return s;
}

/**
 * Strip the leading GitHub-archive directory component from an entry path
 * (e.g. `vscode-abcdef0/src/foo.ts` → `src/foo.ts`). Returns `undefined`
 * when the entry is the wrapper directory itself or has no inner path.
 */
function stripArchiveRoot(path: string): string | undefined {
	const idx = path.indexOf('/');
	if (idx < 0) {
		return undefined;
	}
	const rest = path.substring(idx + 1);
	return rest.length > 0 ? rest : undefined;
}

/**
 * Sanitize a tar entry path to safe segments under {@link targetDir}.
 *
 * Rejects empty / `.` / `..` segments, absolute paths (leading `/`), and
 * NUL bytes. Returns the resolved URI plus the segments used to create it,
 * or `undefined` for paths that would escape `targetDir`.
 */
function safeJoinUnderTarget(targetDir: URI, inner: string): URI | undefined {
	if (inner.includes('\0') || inner.startsWith('/')) {
		return undefined;
	}
	const segments: string[] = [];
	for (const seg of inner.split('/')) {
		if (seg.length === 0 || seg === '.') {
			continue;
		}
		if (seg === '..') {
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

/**
 * Stream a parsed TAR archive into the file service rooted at {@link targetDir}.
 *
 * Supports regular files (typeflag '0' / NUL), directories ('5'), and the
 * GNU `LongLink` extension ('L'). PAX extended headers ('x', 'g') are
 * skipped — the GitHub tarball does not produce them for normal source
 * archives. Other unsupported entry types, including symlinks and
 * hardlinks, are skipped (with a debug log) since the virtual file
 * service has no concept of them.
 */
async function extractTarToFileService(
	tar: Uint8Array,
	targetDir: URI,
	fileService: IFileService,
	logService: ILogService,
	token: CancellationToken,
): Promise<void> {
	await fileService.createFolder(targetDir);

	let offset = 0;
	let pendingLongName: string | undefined;
	const createdDirs = new Set<string>([targetDir.toString()]);

	while (offset + BLOCK_SIZE <= tar.length) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		// All-zero block signals end of archive (two such blocks in a row,
		// but a single one is a sufficient stop signal in practice).
		if (isZeroBlock(tar, offset)) {
			break;
		}

		const name = pendingLongName ?? readAsciiField(tar, offset, 100);
		const size = readOctal(tar, offset + 124, 12);
		const typeFlag = String.fromCharCode(tar[offset + 156] || 0x30);
		const prefix = readAsciiField(tar, offset + 345, 155);
		pendingLongName = undefined;

		const fullName = prefix && !name.startsWith(prefix) ? `${prefix}/${name}` : name;
		const dataStart = offset + BLOCK_SIZE;
		const dataEnd = dataStart + size;
		const padded = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

		if (dataEnd > tar.length) {
			throw new Error('Corrupt tar archive: entry extends past end of stream');
		}

		if (typeFlag === 'L') {
			// GNU long-name: payload is the NUL-terminated path of the
			// next entry. Capture it and continue to that entry.
			pendingLongName = readAsciiField(tar, dataStart, size);
			offset = dataStart + padded;
			continue;
		}

		if (typeFlag === 'x' || typeFlag === 'g') {
			// PAX extended header — skip; GitHub source tarballs don't use
			// it for regular files.
			offset = dataStart + padded;
			continue;
		}

		const inner = stripArchiveRoot(fullName);
		if (!inner) {
			offset = dataStart + padded;
			continue;
		}

		const dest = safeJoinUnderTarget(targetDir, inner);
		if (!dest) {
			logService.warn(`[GitHubTarballFetcher] Skipping unsafe tar entry path: ${fullName}`);
			offset = dataStart + padded;
			continue;
		}

		if (typeFlag === '5') {
			// Directory entry
			if (!createdDirs.has(dest.toString())) {
				await fileService.createFolder(dest);
				createdDirs.add(dest.toString());
			}
		} else if (typeFlag === '0' || typeFlag === '\u0000') {
			// Regular file. Ensure parent directory exists, then write.
			const parent = dirname(dest);
			if (parent.toString() !== dest.toString() && !createdDirs.has(parent.toString())) {
				await fileService.createFolder(parent);
				createdDirs.add(parent.toString());
			}
			const content = VSBuffer.wrap(tar.subarray(dataStart, dataEnd));
			await fileService.writeFile(dest, content);
		} else {
			// Symlinks ('2'), hardlinks ('1'), devices, FIFOs, etc. —
			// not representable in the virtual file system.
			logService.trace(`[GitHubTarballFetcher] Skipping tar entry with unsupported type '${typeFlag}': ${fullName}`);
		}

		offset = dataStart + padded;
	}
}

function isZeroBlock(view: Uint8Array, offset: number): boolean {
	for (let i = 0; i < BLOCK_SIZE; i++) {
		if (view[offset + i] !== 0) {
			return false;
		}
	}
	return true;
}
