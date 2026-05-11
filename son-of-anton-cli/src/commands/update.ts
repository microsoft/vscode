/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `sota update` — two operational modes:
 *
 *   1. **npm-managed install** (default when not running under SEA):
 *      check `son-of-anton-cli` on the npm registry and print
 *      `npm i -g son-of-anton-cli@latest` if a newer version exists.
 *      Self-modification is left to npm — the binary lives in
 *      `dist/cli.js` inside the global `node_modules` tree and replacing
 *      it ourselves would race with npm's own bookkeeping.
 *
 *   2. **SEA single-binary install** (`require('node:sea').isSea()`
 *      returns true): the running process IS the installable artefact,
 *      so we can replace it in-place. Fetch the latest GitHub Release
 *      tagged `sota-v*`, find the artefact matching `${platform}-${arch}`,
 *      verify its SHA256 against `SHA256SUMS.txt`, and atomically swap.
 *
 *      Atomic swap trick (POSIX):
 *        - rename(runningBinary, runningBinary + '.old')   // atomic
 *        - rename(downloaded,     runningBinary)           // atomic
 *        - chmod +x on runningBinary
 *        The OS keeps the still-running process pointed at the now-renamed
 *        `.old` file via its open file descriptor, so the current sota
 *        invocation continues to work until exit. The user re-runs `sota`
 *        to pick up the new binary.
 *
 *      On Windows: file locks prevent renaming a binary that is currently
 *      executing. The same rename pair often works anyway because the OS
 *      allows renaming the source (it tracks the open handle by file ID);
 *      if it fails we surface a clear error telling the user to retry from
 *      another shell.
 *
 * A `--dry-run` flag prints the planned actions without writing anything.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { SOTA_EXIT_CODES } from '../headless';

interface UpdateOptions {
	check?: boolean;
	dryRun?: boolean;
	output?: 'text' | 'json';
}

const REGISTRY_URL = 'https://registry.npmjs.org/son-of-anton-cli';
const RELEASES_API = 'https://api.github.com/repos/CodeHalwell/Son-Of-Anton/releases';
const CACHE_FILE = path.join(os.homedir(), '.son-of-anton', 'data', 'update-check.json');
const QUIET_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCheckResult {
	current: string;
	latest: string;
	upToDate: boolean;
	upgradeCommand: string;
	mode: 'npm' | 'sea';
}

interface RegistryResponse {
	'dist-tags'?: { latest?: string };
}

interface GitHubReleaseAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

interface GitHubRelease {
	tag_name: string;
	name?: string;
	draft: boolean;
	prerelease: boolean;
	assets: GitHubReleaseAsset[];
}

/**
 * Lazy-load the package version from the bundled package.json. Reading at
 * call-time (rather than top-level) keeps the import side-effect-free and
 * makes the function easy to test.
 */
function readCurrentVersion(): string {
	const pkgPath = path.join(__dirname, '..', '..', 'package.json');
	try {
		const raw = fs.readFileSync(pkgPath, 'utf8');
		const parsed = JSON.parse(raw) as { version?: string };
		return parsed.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/**
 * Compare two semver-ish version strings. Treats missing parts as 0; ignores
 * pre-release suffixes (anything after `-`). Sufficient for "is the new one
 * strictly greater" — full semver comparison would pull in another dep.
 */
function isStrictlyGreater(candidate: string, base: string): boolean {
	const parse = (v: string): number[] => v.split('-')[0].split('.').map((p) => parseInt(p, 10) || 0);
	const a = parse(candidate);
	const b = parse(base);
	for (let i = 0; i < 3; i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av > bv) {
			return true;
		}
		if (av < bv) {
			return false;
		}
	}
	return false;
}

async function fetchLatestVersion(): Promise<string | null> {
	try {
		const res = await fetch(REGISTRY_URL, {
			headers: { Accept: 'application/vnd.npm.install-v1+json' },
		});
		if (!res.ok) {
			return null;
		}
		const body = (await res.json()) as RegistryResponse;
		return body['dist-tags']?.latest ?? null;
	} catch {
		return null;
	}
}

/**
 * Public helper consumed by `sota chat` startup: at most once per
 * `QUIET_CHECK_INTERVAL_MS`, fetch the latest version and write a banner to
 * stderr if a newer one exists. Failures (offline, registry blip) are
 * intentionally silent — an update nag must never block the REPL.
 */
export async function maybeNagAboutUpdate(): Promise<void> {
	try {
		const cached = readCache();
		if (cached && Date.now() - cached.checkedAt < QUIET_CHECK_INTERVAL_MS) {
			return;
		}
		const latest = await fetchLatestVersion();
		if (!latest) {
			return;
		}
		const current = readCurrentVersion();
		writeCache({ checkedAt: Date.now(), latest });
		if (isStrictlyGreater(latest, current)) {
			const cmd = isRunningUnderSea() ? 'sota update' : 'npm i -g son-of-anton-cli@latest';
			process.stderr.write(
				`(sota ${latest} is available — current ${current}. Upgrade with: ${cmd})\n`,
			);
		}
	} catch {
		// Quiet by design.
	}
}

interface UpdateCache {
	checkedAt: number;
	latest: string;
}

function readCache(): UpdateCache | null {
	try {
		const raw = fs.readFileSync(CACHE_FILE, 'utf8');
		const parsed = JSON.parse(raw) as UpdateCache;
		if (typeof parsed.checkedAt === 'number' && typeof parsed.latest === 'string') {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function writeCache(cache: UpdateCache): void {
	try {
		fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true, mode: 0o700 });
		fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), { mode: 0o600 });
	} catch {
		// Cache failures are not fatal.
	}
}

/**
 * Detect whether we're running inside a Node SEA binary. Mirrors the
 * detection used in `src/seaEntry.ts` so the two stay consistent — a `sota`
 * built via the SEA pipeline is the only build flavour that can self-replace.
 */
function isRunningUnderSea(): boolean {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const sea = require('node:sea') as { isSea?: () => boolean };
		return typeof sea.isSea === 'function' && sea.isSea();
	} catch {
		return false;
	}
}

/**
 * Top-level `sota update` command. Branches on SEA-vs-npm based on how the
 * binary was installed:
 *
 *   - SEA: fetch the latest GitHub Release, verify SHA256, replace the
 *     running binary in-place.
 *   - npm: print the upgrade command and let the user run it. (npm itself
 *     is the right tool to drive a global package upgrade.)
 */
export async function runUpdate(opts: UpdateOptions): Promise<void> {
	if (isRunningUnderSea()) {
		await runSeaSelfUpdate(opts);
		return;
	}
	await runNpmUpdateCheck(opts);
}

/**
 * Pre-SEA flow: check npm, print upgrade instructions. Unchanged behaviour
 * from before the self-update work — keeps the existing dev experience
 * intact for contributors running `node dist/cli.js`.
 */
async function runNpmUpdateCheck(opts: UpdateOptions): Promise<void> {
	const current = readCurrentVersion();
	const latest = await fetchLatestVersion();

	if (!latest) {
		const message = 'Could not reach the npm registry to check for updates.';
		if (opts.output === 'json') {
			process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const upToDate = !isStrictlyGreater(latest, current);
	const result: UpdateCheckResult = {
		current,
		latest,
		upToDate,
		upgradeCommand: 'npm i -g son-of-anton-cli@latest',
		mode: 'npm',
	};

	writeCache({ checkedAt: Date.now(), latest });

	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify(result, null, 2) + '\n');
		return;
	}

	if (upToDate) {
		process.stdout.write(`sota ${current} is the latest release.\n`);
		return;
	}

	process.stdout.write(`A newer release is available: ${latest} (you have ${current}).\n`);
	process.stdout.write(`Upgrade with:\n  ${result.upgradeCommand}\n`);
	if (opts.check) {
		// `--check` exits 0 even when an upgrade is available — the result is in stdout.
		return;
	}
}

interface SeaArtefactPick {
	platformKey: string;
	binaryAssetName: string;
	finalBinaryName: string;
}

/**
 * Map (platform, arch) to the GitHub Release artefact name produced by
 * `.github/workflows/release-sota.yml`. The release workflow flattens the
 * per-target binaries to `sota-<platform>-<arch>{.exe}` filenames.
 */
function pickSeaArtefact(): SeaArtefactPick | null {
	const platform = process.platform;
	const arch = process.arch;
	if (platform === 'darwin' && arch === 'arm64') {
		return {
			platformKey: 'macos-arm64',
			binaryAssetName: 'sota-macos-arm64',
			finalBinaryName: 'sota',
		};
	}
	if (platform === 'linux' && arch === 'x64') {
		return {
			platformKey: 'linux-x64',
			binaryAssetName: 'sota-linux-x64',
			finalBinaryName: 'sota-linux-x64',
		};
	}
	if (platform === 'win32' && arch === 'x64') {
		return {
			platformKey: 'windows-x64',
			binaryAssetName: 'sota-windows-x64.exe',
			finalBinaryName: 'sota-windows-x64.exe',
		};
	}
	return null;
}

/**
 * Fetch the most recent (non-draft) release tagged `sota-v*` from the GitHub
 * REST API. Returns the parsed release or null if the API is unreachable or
 * no matching release exists.
 */
async function fetchLatestSeaRelease(): Promise<GitHubRelease | null> {
	try {
		const res = await fetch(`${RELEASES_API}?per_page=10`, {
			headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
		});
		if (!res.ok) {
			return null;
		}
		const body = (await res.json()) as GitHubRelease[];
		const candidates = body
			.filter((r) => !r.draft && r.tag_name?.startsWith('sota-v'))
			.sort((a, b) => (a.tag_name < b.tag_name ? 1 : -1));
		return candidates[0] ?? null;
	} catch {
		return null;
	}
}

function tagToVersion(tag: string): string {
	// `sota-v0.1.0` → `0.1.0`. Tolerates the bare version too (just in case).
	return tag.replace(/^sota-v/, '');
}

/**
 * Stream a URL to a file on disk while computing the SHA256 along the way.
 * Returns the hex-encoded digest.
 */
async function downloadWithHash(url: string, dest: string): Promise<string> {
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok || !res.body) {
		throw new Error(`download failed: HTTP ${res.status} for ${url}`);
	}
	const hash = crypto.createHash('sha256');
	const writer = fs.createWriteStream(dest, { mode: 0o755 });
	// `Readable.fromWeb` is the supported bridge from the WHATWG body stream
	// returned by `fetch` to a Node `Readable`. We pipe through a transform
	// that updates the hash.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Readable } = require('stream') as typeof import('stream');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { pipeline } = require('stream/promises') as typeof import('stream/promises');
	// `fetch().body` is a WHATWG ReadableStream; wrap once for Node-stream APIs.
	const nodeReadable = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
	await pipeline(
		nodeReadable,
		async function* (source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
			for await (const chunk of source) {
				hash.update(chunk);
				yield chunk;
			}
		},
		writer,
	);
	return hash.digest('hex');
}

/**
 * Parse a `SHA256SUMS.txt` file in the standard coreutils format:
 *   <hex>  <filename>
 * (two spaces) or
 *   <hex> *<filename>
 * (binary mode marker). Returns a map from filename to lowercase hex digest.
 */
function parseSha256Sums(body: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
		if (m) {
			map.set(m[2], m[1].toLowerCase());
		}
	}
	return map;
}

async function fetchSha256Sums(release: GitHubRelease): Promise<Map<string, string> | null> {
	const asset = release.assets.find((a) => a.name === 'SHA256SUMS.txt');
	if (!asset) {
		return null;
	}
	try {
		const res = await fetch(asset.browser_download_url, { redirect: 'follow' });
		if (!res.ok) {
			return null;
		}
		const body = await res.text();
		return parseSha256Sums(body);
	} catch {
		return null;
	}
}

/**
 * Replace the running SEA binary with `newBinaryPath` using the
 * rename-old / rename-new trick. Returns true on success.
 *
 * The .old file is left behind on disk — most OSes will delete it as soon as
 * the current sota process exits and closes its file descriptor, but on
 * Windows it can linger if anything else has a handle. The next `sota`
 * invocation cleans up stale .old files (see `removeStaleOldBinary`).
 */
function swapBinary(runningPath: string, newBinaryPath: string): void {
	const oldPath = runningPath + '.old';
	// Remove any leftover .old from a prior swap. On Windows it may still be
	// locked; ignore the error and let the next run handle it.
	try {
		fs.rmSync(oldPath, { force: true });
	} catch {
		// best effort
	}
	fs.renameSync(runningPath, oldPath);
	try {
		fs.renameSync(newBinaryPath, runningPath);
	} catch (err) {
		// Try to roll back so the user isn't left with a missing binary.
		try {
			fs.renameSync(oldPath, runningPath);
		} catch {
			// If we can't roll back either, the .old file is the only copy.
			throw new Error(`update failed mid-swap; previous binary is at ${oldPath}: ${String(err)}`);
		}
		throw err;
	}
	if (process.platform !== 'win32') {
		fs.chmodSync(runningPath, 0o755);
	}
}

/**
 * SEA self-update flow. Steps:
 *   1. Resolve which artefact this platform needs (`sota-<platform>-<arch>`).
 *   2. Fetch the latest GitHub Release and its SHA256SUMS.txt.
 *   3. If the release tag isn't strictly greater than the current version,
 *      report up-to-date.
 *   4. Otherwise, download the binary to a temp file, verify the digest,
 *      atomically swap, and exit 0 with a "run sota again" message.
 *
 * `--dry-run` short-circuits after step 3 with a plan.
 */
async function runSeaSelfUpdate(opts: UpdateOptions): Promise<void> {
	const current = readCurrentVersion();
	const pick = pickSeaArtefact();
	if (!pick) {
		emitError(opts, `Unsupported platform for self-update: ${process.platform}/${process.arch}`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const release = await fetchLatestSeaRelease();
	if (!release) {
		emitError(opts, 'Could not reach GitHub Releases to check for updates.');
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const latest = tagToVersion(release.tag_name);
	const upToDate = !isStrictlyGreater(latest, current);
	writeCache({ checkedAt: Date.now(), latest });

	if (opts.output === 'json' && (upToDate || opts.check)) {
		const result: UpdateCheckResult = {
			current,
			latest,
			upToDate,
			upgradeCommand: 'sota update',
			mode: 'sea',
		};
		process.stdout.write(JSON.stringify(result, null, 2) + '\n');
		if (upToDate || opts.check) {
			return;
		}
	}

	if (upToDate) {
		process.stdout.write(`sota ${current} is the latest release.\n`);
		return;
	}

	if (opts.check) {
		process.stdout.write(`A newer release is available: ${latest} (you have ${current}).\n`);
		process.stdout.write(`Run \`sota update\` to install it.\n`);
		return;
	}

	const runningPath = process.execPath;
	if (opts.dryRun) {
		process.stdout.write(`[dry-run] Would update sota ${current} → ${latest}.\n`);
		process.stdout.write(`[dry-run]   Source asset:   ${pick.binaryAssetName} from ${release.tag_name}\n`);
		process.stdout.write(`[dry-run]   Target binary:  ${runningPath}\n`);
		process.stdout.write(`[dry-run]   Atomic swap:    rename(${runningPath}, ${runningPath}.old) then rename(<tmp>, ${runningPath})\n`);
		return;
	}

	const asset = release.assets.find((a) => a.name === pick.binaryAssetName);
	if (!asset) {
		emitError(opts, `Release ${release.tag_name} has no ${pick.binaryAssetName} asset.`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const sums = await fetchSha256Sums(release);
	if (!sums) {
		emitError(opts, `Release ${release.tag_name} has no SHA256SUMS.txt — refusing to install an unverified binary.`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}
	const expectedHash = sums.get(pick.binaryAssetName);
	if (!expectedHash) {
		emitError(opts, `SHA256SUMS.txt does not list ${pick.binaryAssetName}.`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sota-update-'));
	const tmpBinary = path.join(tmpDir, pick.binaryAssetName);
	try {
		process.stdout.write(`Downloading ${pick.binaryAssetName} from ${release.tag_name}…\n`);
		const actualHash = await downloadWithHash(asset.browser_download_url, tmpBinary);
		if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
			throw new Error(
				`SHA256 mismatch for ${pick.binaryAssetName}: expected ${expectedHash}, got ${actualHash}`,
			);
		}
		swapBinary(runningPath, tmpBinary);
	} catch (err) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		emitError(opts, err instanceof Error ? err.message : String(err));
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}
	fs.rmSync(tmpDir, { recursive: true, force: true });

	if (opts.output === 'json') {
		const result: UpdateCheckResult = {
			current,
			latest,
			upToDate: false,
			upgradeCommand: 'sota update',
			mode: 'sea',
		};
		process.stdout.write(JSON.stringify({ ...result, updated: true }, null, 2) + '\n');
		return;
	}

	process.stdout.write(`Updated to sota v${latest}. Run \`sota\` again to use the new binary.\n`);
	if (process.platform === 'win32') {
		process.stdout.write('(Windows: if you see "Access is denied" on the next run, close any open sota processes and retry.)\n');
	}
}

function emitError(opts: UpdateOptions, message: string): void {
	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
	} else {
		process.stderr.write(`error: ${message}\n`);
	}
}
