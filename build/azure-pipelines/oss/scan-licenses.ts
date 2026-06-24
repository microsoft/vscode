/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Scan for LICENSE files that Component Governance misses.
 *
 *  Section 1: Built-in extension dependencies (CG skips engines.vscode packages)
 *  Section 2: Root node_modules ClearlyDefined gaps (LICENSE on disk but not in CG output)
 *  Section 3: cgmanifest.json git components CG can't harvest from ClearlyDefined
 *  Section 4: Cargo.lock crates missing or stubbed in CG (crates.io + repo LICENSE)
 *  Section 5: Platform-specific binary packages (arch optionalDependencies)
 *  Section 6: OS-gated whole packages skipped by npm on the build host (lockfile)
 *  Section 7: Pre-built built-in extension deps (disk extensionsCG/<name>/, else
 *             self-fetched from the extension's public package-lock.json)
 *
 *  Usage:
 *    node scan-licenses.js --repo <path> --output <path>
 *
 *  --repo         Path to the vscode repo root
 *  --output       Path to write the supplemental NOTICE entries
 *  --strict-builtin-extensions   Fail the build if any built-in extension lockfile
 *                 cannot be obtained from disk or self-fetch (Section 7 guard)
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fetchUriText } from './apply-overrides.js';
import { parseNoticeFile } from './parse-notices.js';
import { parseArgs } from './utils.js';

interface LicenseEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
	/** Which extension pulled this in */
	fromExtension: string;
}

/**
 * The OSS tool validates that LICENSE text contains a copyright statement.
 * This regex matches the same patterns: "copyright", "(c)", or the copyright symbol.
 * See: vscode-build-tools/distro-tools/lib/item.ts resolveLicense()
 */
// allow-any-unicode-next-line
const COPYRIGHT_PATTERN = /copyright|(\(c\)|©)/i;

/** Minimum length for a license body to be considered real (not a symlink stub or SPDX stub). */
const MIN_LICENSE_BODY_LENGTH = 40;

function validateCopyright(name: string, licenseText: string, source: string): void {
	if (!COPYRIGHT_PATTERN.test(licenseText)) {
		// allow-any-unicode-next-line
		console.warn(`  MISSING COPYRIGHT: ${name} (${source}) \u2014 license found but no copyright statement`);
	}
}

/**
 * Find a LICENSE file in the given package directory.
 */
function findLicenseFile(pkgDir: string): string | undefined {
	try {
		const files = fs.readdirSync(pkgDir);
		const licenseFile = files.find(f =>
			/^license(\.md|\.txt|\.mit|\.bsd|\.apache)?$/i.test(f) ||
			/^licence(\.md|\.txt)?$/i.test(f)
		);
		return licenseFile ? path.join(pkgDir, licenseFile) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Build candidate raw.githubusercontent.com URLs for a LICENSE file in a git
 * component, pinned to the exact commit hash (NOT a branch -- pinning avoids the
 * symlink/branch-drift trap where raw.githubusercontent serves a moved or
 * symlinked file's target string instead of real text).
 *
 * Only GitHub is handled: every git component CG fails to harvest in this repo
 * is GitHub-hosted. Other hosts return [] and fall through to a warning.
 */
function githubRawLicenseCandidates(repositoryUrl: string, commitHash: string): string[] {
	const m = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
	if (!m) {
		return [];
	}
	const owner = m[1];
	const repo = m[2];
	const fileNames = [
		'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt',
		'LICENSE-MIT', 'LICENSE.MIT', 'LICENSE-APACHE', 'COPYING', 'LICENCE', 'LICENCE.md',
		'LICENSE.markdown'
	];
	return fileNames.map(f => `https://raw.githubusercontent.com/${owner}/${repo}/${commitHash}/${f}`);
}

/**
 * Fetch the real LICENSE text for a git component from its repo at the pinned
 * commit. Tries common LICENSE filenames; returns the first that looks like a
 * real license body. Returns undefined if none resolve.
 *
 * Guards against the symlink-stub trap: a fetched body that is a short relative
 * path (e.g. "../../LICENSE-MIT") is rejected -- raw.githubusercontent serves a
 * symlink's target string, not the file it points at.
 */
export async function fetchLicenseFromGitRepo(repositoryUrl: string, commitHash: string): Promise<string | undefined> {
	if (!repositoryUrl || !commitHash) {
		return undefined;
	}
	for (const uri of githubRawLicenseCandidates(repositoryUrl, commitHash)) {
		const text = await fetchUriText(uri);
		if (!text) {
			continue;
		}
		const trimmed = text.trim();
		// Reject symlink-target stubs (short relative paths) and empty bodies.
		if (trimmed.length > MIN_LICENSE_BODY_LENGTH && !/^\.{1,2}\//.test(trimmed)) {
			return trimmed;
		}
	}
	return undefined;
}

// =============================================================================
// SECTION 4 helpers: Rust crate (Cargo.lock) harvesting.
//
// These are exported so they can be unit-tested without running main() (see the
// entry-point guard at the bottom of this file, mirroring parse-notices.ts).
// =============================================================================

/** The User-Agent crates.io requires -- it rejects requests without a descriptive one. */
const CRATES_IO_USER_AGENT = 'vscode-oss-scanner';

export interface CrateInfo {
	crate: { id: string; repository: string };
	versions: Array<{ num: string; license: string }>;
}

export interface CargoPackage {
	name: string;
	version: string;
	source?: string;
}

/**
 * Hand-rolled parser for Cargo.lock `[[package]]` blocks. We only need three
 * fields (name, version, source), the format is stable, and the `oss/` dir has
 * no package.json -- so we avoid adding a `toml` dependency (spec Q4).
 *
 * Packages with no `source` are first-party workspace crates (e.g. the CLI
 * itself), not third-party OSS -- callers skip those.
 */
export function parseCargoLock(content: string): CargoPackage[] {
	const packages: CargoPackage[] = [];
	// Split on the [[package]] table header. Each block holds key = "value" lines.
	const blocks = content.split(/^\s*\[\[package\]\]\s*$/m);
	// blocks[0] is the file preamble (version = 3, etc.) -- skip it.
	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i];
		let name = '';
		let version = '';
		let source: string | undefined;
		for (const rawLine of block.split('\n')) {
			const line = rawLine.trim();
			// Stop at the start of the next table (e.g. [[patch]] or [metadata]).
			if (line.startsWith('[')) {
				break;
			}
			const m = line.match(/^(name|version|source)\s*=\s*"([^"]*)"/);
			if (!m) {
				continue;
			}
			if (m[1] === 'name') {
				name = m[2];
			} else if (m[1] === 'version') {
				version = m[2];
			} else {
				source = m[2];
			}
		}
		if (name && version) {
			packages.push({ name, version, source });
		}
	}
	return packages;
}

/**
 * Resolve a crate's canonical GitHub repo URL. Some crates.io `repository`
 * fields are wrong or point at non-GitHub mirrors; this ports the legacy
 * override map (distro-tools/lib/cargo.ts getRepository) verbatim and falls
 * back to the crates.io-reported repository otherwise.
 */
export function getCrateRepository(info: CrateInfo): string {
	switch (info.crate.id) {
		case 'isatty': return 'https://github.com/dtolnay/isatty';
		case 'redox_syscall': return 'https://github.com/redox-os/syscall';
		case 'redox_termios': return 'https://github.com/redox-os/termios';
		case 'termion': return 'https://github.com/redox-os/termion';
		default: return info.crate.repository || '';
	}
}

/**
 * Ordered list of git refs to try when pinning a crate's license fetch. Tag
 * conventions vary across crates, so we try the common version-tag shapes first
 * (reproducible, immutable), then fall back to the repo default branch
 * (parity-acceptable -- the legacy tool fetched unpinned from the default
 * branch). See spec Q1.
 */
export function crateLicenseRefs(name: string, version: string): string[] {
	return [
		`v${version}`,
		`${version}`,
		`${name}-v${version}`,
		`${name}-${version}`,
		'main',
		'master',
	];
}

/**
 * Detect a CG "stub" license body: a body that is just an SPDX license
 * expression (e.g. "Zlib OR Apache-2.0 OR MIT" or the deprecated slash form
 * "MIT/Apache-2.0") rather than real license text. Five gates, ALL must pass --
 * the combination makes a false positive require a body that is simultaneously
 * tiny, single-line, SPDX-shaped, and prose-free, which is the definition of a
 * stub. See spec section 4.
 */
export function isSpdxStub(body: string): boolean {
	const trimmed = (body || '').trim();
	if (!trimmed) {
		return false;
	}
	// Gate 1: length -- SPDX expressions are tiny; real licenses are long.
	if (trimmed.length > 120) {
		return false;
	}
	// Gate 2: single logical line -- real license texts are multi-line.
	if (trimmed.split(/\n/).filter(l => l.trim()).length > 1) {
		return false;
	}
	// Gate 3: no license-prose words. A real license
	// always has at least one; an SPDX stub never does. (Case-insensitive.)
	// allow-any-unicode-next-line
	if (/copyright|permission|redistribution|warranty|\(c\)|©/i.test(trimmed)) {
		return false;
	}
	// Gate 4: SPDX-expression shape. Tokens separated by uppercase OR/AND/WITH
	// operators OR the deprecated "/" disjunction (e.g. winapi's "MIT/Apache-2.0").
	// Operators are case-sensitive (uppercase) -- this is what separates an SPDX
	// expression from prose like "Permission is granted...". Parens are stripped
	// first (mirroring gate 5) so compound expressions with INTERNAL parens like
	// "(MIT OR Apache-2.0) AND BSD-3-Clause" (e.g. encoding_rs) are still detected.
	const deparen = trimmed.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
	const spdxShape = /^[A-Za-z0-9.+-]+(?:\s*(?:\/|\s+(?:OR|AND|WITH)\s+)\s*[A-Za-z0-9.+-]+)*$/;
	if (!spdxShape.test(deparen)) {
		return false;
	}
	// Gate 5: token sanity -- every non-operator/non-separator token must contain
	// a letter (guards against a punctuation-only body sneaking through).
	const tokens = trimmed
		.replace(/[()]/g, ' ')
		.split(/\s*\/\s*|\s+(?:OR|AND|WITH)\s+/)
		.map(t => t.trim())
		.filter(t => t.length > 0);
	if (tokens.length === 0 || !tokens.every(t => /[A-Za-z]/.test(t))) {
		return false;
	}
	return true;
}

/**
 * GET https://crates.io/api/v1/crates/<name> with the required User-Agent.
 * fetchUriText() can't set headers, so we use a small dedicated fetcher here.
 * Resolves undefined on any failure (caller logs + continues -- never crashes).
 */
export function fetchCratesIoJson(name: string, timeoutMs = 10_000): Promise<CrateInfo | undefined> {
	return new Promise(resolve => {
		const options: https.RequestOptions = {
			host: 'crates.io',
			path: `/api/v1/crates/${encodeURIComponent(name)}`,
			headers: { 'User-Agent': CRATES_IO_USER_AGENT, 'Accept': 'application/json' },
			timeout: timeoutMs,
		};
		const req = https.get(options, res => {
			if (res.statusCode !== 200) {
				res.resume();
				resolve(undefined);
				return;
			}
			const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
			let data = '';
			res.setEncoding('utf8');
			res.on('data', chunk => {
				data += chunk;
				if (data.length > MAX_BODY_SIZE) {
					req.destroy();
					resolve(undefined);
					return;
				}
			});
			res.on('end', () => {
				try {
					resolve(JSON.parse(data) as CrateInfo);
				} catch {
					resolve(undefined);
				}
			});
		});
		req.on('error', () => resolve(undefined));
		req.on('timeout', () => { req.destroy(); resolve(undefined); });
	});
}

/**
 * Run async tasks with a small concurrency cap (crates.io asks crawlers to be
 * gentle). Order of results is not significant -- each task mutates shared state.
 */
async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
	let next = 0;
	const workers: Promise<void>[] = [];
	const worker = async (): Promise<void> => {
		while (next < tasks.length) {
			const idx = next++;
			await tasks[idx]();
		}
	};
	for (let i = 0; i < Math.min(limit, tasks.length); i++) {
		workers.push(worker());
	}
	await Promise.all(workers);
}

/** Extract {owner, repo} from a GitHub repository URL, or undefined if not GitHub. */
function githubOwnerRepo(repositoryUrl: string): { owner: string; repo: string } | undefined {
	const m = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
	return m ? { owner: m[1], repo: m[2] } : undefined;
}

/**
 * A fetched body counts as a real license only if it is long enough, is not a
 * symlink-target stub (a short relative path), and is not an aggregate "pointer"
 * doc -- e.g. objc2's LICENSE.md which just links to ./LICENSE-MIT.txt etc.
 * rather than containing actual license text.
 */
function isRealLicenseBody(text: string): boolean {
	const t = text.trim();
	if (t.length <= MIN_LICENSE_BODY_LENGTH) {
		return false;
	}
	if (/^\.{1,2}\//.test(t)) {
		return false;
	}
	// Pointer/aggregate docs reference other license files by relative path.
	if (/\.\/LICENSE/i.test(t)) {
		return false;
	}
	// Aggregate "# License" pointer docs (e.g. objc2's LICENSE.md) start with a
	// markdown License heading and explain a multi-license choice / link to the
	// real per-license files, rather than being actual license text. Real
	// licenses start with "MIT License", "Copyright", "Apache License",
	// "Permission...", etc. -- never a "# License" heading -- so this is safe.
	if (/^#+\s*licen[sc]e\b/i.test(t) && /at your option|licensing (of|in)|\bLICENSE-[A-Z]/i.test(t)) {
		return false;
	}
	return true;
}

/** Common `LICENSE-<X>` filename stems for well-known SPDX ids. */
const SPDX_LICENSE_FILENAMES: { [id: string]: string[] } = {
	'MIT': ['LICENSE-MIT', 'LICENSE-MIT.txt', 'LICENSE-MIT.md'],
	'APACHE-2.0': ['LICENSE-APACHE', 'LICENSE-APACHE.txt', 'LICENSE-APACHE.md'],
	'ZLIB': ['LICENSE-ZLIB', 'LICENSE-ZLIB.txt'],
	'UNLICENSE': ['UNLICENSE', 'UNLICENSE.txt', 'LICENSE-UNLICENSE'],
	'BSD-3-CLAUSE': ['LICENSE-BSD', 'LICENSE-BSD3', 'LICENSE-BSD-3-Clause'],
	'BSD-2-CLAUSE': ['LICENSE-BSD', 'LICENSE-BSD2'],
	'MPL-2.0': ['LICENSE-MPL', 'LICENSE-MPL-2.0', 'LICENSE-MPL2'],
};

/** Split an SPDX expression into its license ids (drop OR/AND/WITH and `/`). */
export function spdxLicenseIds(expr: string): string[] {
	const ids: string[] = [];
	for (const raw of (expr || '').split(/\s*\/\s*|\s+(?:OR|AND|WITH)\s+/)) {
		const id = raw.replace(/[()]/g, '').trim();
		if (id.length > 0 && /[A-Za-z]/.test(id) && ids.indexOf(id) === -1) {
			ids.push(id);
		}
	}
	return ids;
}

/**
 * Detect a conjunctive (`AND`) SPDX expression -- one where ALL named licenses
 * are legally required, not the licensee's choice. For `OR` it's fine to emit a
 * single license's text (we pick one); for `AND` emitting only one produces a
 * legally deficient notice. We tokenize on the `AND` operator (case-sensitive,
 * matching the SPDX grammar and isSpdxStub gate 3). Parens are irrelevant to
 * presence detection -- an `AND` anywhere makes at least one conjunction.
 */
export function hasSpdxAnd(expr: string): boolean {
	return /\bAND\b/.test(expr || '');
}

/** Candidate file paths (relative to repo root) for a given SPDX license id. */
function licenseFileCandidates(id: string): string[] {
	const up = id.toUpperCase();
	const out: string[] = [];
	if (SPDX_LICENSE_FILENAMES[up]) {
		out.push(...SPDX_LICENSE_FILENAMES[up]);
	}
	// REUSE-style LICENSES/ directory uses the exact SPDX id (case-sensitive).
	out.push(`LICENSES/${id}.txt`, `LICENSES/${id}`, `LICENSE-${up}`, `LICENSE-${up}.txt`);
	return out;
}

/**
 * Fetch the real license text for a Rust crate. Unlike the generic Section 3
 * fetcher, this is SPDX-id-driven: it uses the crate's license expression to
 * target the per-license files (LICENSE-MIT, LICENSES/Apache-2.0.txt, …) so it
 * gets the ACTUAL license text for the chosen license instead of an aggregate
 * pointer doc (e.g. objc2's LICENSE.md).
 *
 * IMPORTANT -- disjunctive vs conjunctive: this returns the FIRST SPDX id that
 * yields a real file. For `OR` expressions that is legally correct (the
 * licensee chooses one license). For `AND` expressions ALL named licenses are
 * legally required, so a single body is an INCOMPLETE notice -- we do NOT yet
 * concatenate all of them, so the caller must warn loudly (see hasSpdxAnd at
 * the call site) until proper multi-text concatenation lands. None of today's
 * target crates use `AND`. Falls back to the generic LICENSE/COPYING fetcher
 * (pointer-rejected) for single-file-licensed crates.
 *
 * Tries the tag-pin refs in order, then the default-branch fallbacks. Returns
 * the first real body found, with the ref it came from. Returns undefined if no
 * license file exists in the repo (caller logs + continues; such crates need a
 * cglicenses.json override).
 */
export async function fetchCargoLicense(repoUrl: string, name: string, version: string, license: string): Promise<{ text: string; ref: string } | undefined> {
	const or = githubOwnerRepo(repoUrl);
	const ids = spdxLicenseIds(license);
	for (const ref of crateLicenseRefs(name, version)) {
		// SPDX-driven: first license id that yields a real per-license file wins.
		if (or) {
			for (const id of ids) {
				for (const file of licenseFileCandidates(id)) {
					const url = `https://raw.githubusercontent.com/${or.owner}/${or.repo}/${ref}/${file}`;
					const text = await fetchUriText(url);
					if (text && isRealLicenseBody(text)) {
						return { text: text.trim(), ref };
					}
				}
			}
		}
		// Generic fallback (plain LICENSE/COPYING), pointer-doc rejected.
		const generic = await fetchLicenseFromGitRepo(repoUrl, ref);
		if (generic && isRealLicenseBody(generic)) {
			return { text: generic, ref };
		}
	}
	return undefined;
}

/**
 * Read package.json fields we need.
 */
function readPkgJson(pkgDir: string): { name: string; version: string; license: string; repository: string } | undefined {
	const pkgPath = path.join(pkgDir, 'package.json');
	if (!fs.existsSync(pkgPath)) {
		return undefined;
	}
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
		const repo = typeof pkg.repository === 'string'
			? pkg.repository
			: pkg.repository?.url || '';
		return {
			name: pkg.name || '',
			version: pkg.version || '',
			license: typeof pkg.license === 'string' ? pkg.license : '',
			repository: repo.replace(/^git\+/, '').replace(/\.git$/, ''),
		};
	} catch {
		return undefined;
	}
}

/**
 * Walk a node_modules directory and collect all packages (including scoped).
 */
function collectPackagesInNodeModules(nmDir: string): string[] {
	const packages: string[] = [];
	if (!fs.existsSync(nmDir)) {
		return packages;
	}

	try {
		for (const entry of fs.readdirSync(nmDir)) {
			if (entry.startsWith('.')) {
				continue;
			}
			const full = path.join(nmDir, entry);
			if (!fs.statSync(full).isDirectory()) {
				continue;
			}

			if (entry.startsWith('@')) {
				// Scoped package -- read subdirectories
				try {
					for (const sub of fs.readdirSync(full)) {
						const subFull = path.join(full, sub);
						if (fs.statSync(subFull).isDirectory() && fs.existsSync(path.join(subFull, 'package.json'))) {
							packages.push(`${entry}/${sub}`);
						}
					}
				} catch { /* skip */ }
			} else if (fs.existsSync(path.join(full, 'package.json'))) {
				packages.push(entry);
			}
		}
	} catch { /* skip */ }

	return packages;
}

// =============================================================================
// SECTION 5 helpers: Platform-binary (arch-specific npm package) enumeration.
//
// Architecture-specific npm packages (e.g. @img/sharp-win32-x64) are declared
// as optionalDependencies of an arch-independent PARENT (sharp). On a
// single-platform build agent only the host arch is installed on disk, so the
// scanner misses the other arches that the legacy OSS tool emitted. We
// enumerate EVERY arch from each parent's optionalDependencies and resolve each
// arch child's OWN license (a child can differ from its parent: parent `sharp`
// is Apache-2.0 but `@img/sharp-win32-x64` is "Apache-2.0 AND LGPL-3.0-or-later").
//
// Exported helpers are unit-tested without running main() (see the entry-point
// guard at the bottom of this file, mirroring the Section 4 helpers).
// =============================================================================

/**
 * Matches an npm package name that ends in a platform+arch token, optionally
 * followed by a libc/abi suffix. Used both to recognize an arch package and to
 * find the arch-bearing keys inside a parent's optionalDependencies.
 *
 * The leading separator is [/-] to handle both dash-prefixed names
 * (e.g. @img/sharp-win32-x64) and scope-separated names (e.g. @esbuild/linux-x64).
 *
 * MATCHES:      @img/sharp-win32-x64, @img/sharp-libvips-darwin-arm64,
 *               @napi-rs/canvas-linux-arm-gnueabihf, @parcel/watcher-linux-x64-glibc,
 *               @esbuild/linux-x64, @esbuild/darwin-arm64.
 * DOES NOT match the arch-independent parents: sharp, @napi-rs/canvas,
 *               @parcel/watcher, @github/copilot, esbuild.
 */
export const ARCH_SUFFIX_RE = /[/-](?:darwin|linux|linuxmusl|win32|android|freebsd|openbsd|netbsd|sunos|aix)-(?:x64|arm64|arm|ia32|ppc64|ppc64le|s390x|riscv64|loong64|mips64el|universal)(?:-(?:gnu|musl|msvc|glibc|gnueabihf|eabihf|androideabi))?$/;

/** True when the package name ends in a platform+arch token (see ARCH_SUFFIX_RE). */
export function isArchPackageName(name: string): boolean {
	return ARCH_SUFFIX_RE.test(name || '');
}

/**
 * Platforms and architectures VS Code actually ships. Used by Section 5 to
 * skip arch packages for platforms we don't target (android, freebsd, etc.).
 *
 * Source of truth: build/azure-pipelines/product-build.yml build matrix +
 * build/agent-sdk/common.ts (KNOWN_VSCODE_PLATFORMS / VscodeBuildArch).
 * "alpine" in build config = "linuxmusl" in npm package names.
 */
const VSCODE_SHIPPED_PLATFORMS = new Set(['darwin', 'linux', 'linuxmusl', 'win32']);
const VSCODE_SHIPPED_ARCHS = new Set(['x64', 'arm64', 'arm']);

/**
 * npm `os` values for the platforms VS Code ships, spelled the way npm package
 * manifests do. VSCODE_SHIPPED_PLATFORMS uses the build-config name "linuxmusl",
 * but an npm `os` field only ever says "linux" (musl is a libc variant, not an
 * os value), so the npm-spelled shipped set collapses linuxmusl into linux.
 */
export const NPM_SHIPPED_OS = new Set(['darwin', 'linux', 'win32']);

/**
 * Evaluate an npm `os` constraint list against a single platform using npm's own
 * semantics: a platform is allowed when it is not explicitly negated AND (there
 * are no positive entries OR it matches a positive entry).
 *   ["win32"]           -> only win32
 *   ["!win32"]          -> everything except win32
 *   ["darwin", "linux"] -> darwin or linux
 */
export function osAllows(osList: string[], platform: string): boolean {
	let hasPositive = false;
	let positiveMatch = false;
	for (const raw of osList) {
		if (typeof raw !== 'string' || raw.length === 0) {
			continue;
		}
		if (raw[0] === '!') {
			if (raw.slice(1) === platform) {
				return false; // an explicit negation always wins
			}
		} else {
			hasPositive = true;
			if (raw === platform) {
				positiveMatch = true;
			}
		}
	}
	return hasPositive ? positiveMatch : true;
}

/**
 * True when a package's `os` constraint means it will NOT install on the build
 * host yet WILL ship on at least one platform VS Code targets. These packages
 * are invisible to the on-disk scanner on a single-platform NOTICE agent, so
 * Section 6 seeds them into the presence index from the lockfile instead.
 */
export function isOsGatedShippedElsewhere(osList: string[], hostPlatform: string): boolean {
	if (!Array.isArray(osList) || osList.length === 0) {
		return false;
	}
	if (osAllows(osList, hostPlatform)) {
		return false; // installs on the host -> the normal scanner already sees it
	}
	for (const shipped of NPM_SHIPPED_OS) {
		if (osAllows(osList, shipped)) {
			return true;
		}
	}
	return false;
}

/**
 * The built-in extension names declared in product.json. These are PRE-BUILT
 * extensions (js-debug, js-debug-companion, js-profile-table, ...) that VS Code
 * downloads as finished VSIXs rather than building from source, so their bundled
 * dependencies never land in this repo's node_modules and are invisible to CG.
 * Section 7 reads each one's package-lock.json (downloaded into extensionsCG/ by
 * the `download-builtin-extensions-cg` build step) to recover that coverage.
 */
export function readBuiltInExtensionNames(productJson: unknown): string[] {
	const names: string[] = [];
	const pj = productJson as { builtInExtensions?: unknown; webBuiltInExtensions?: unknown } | undefined;
	if (!pj) {
		return names;
	}
	for (const list of [pj.builtInExtensions, pj.webBuiltInExtensions]) {
		if (Array.isArray(list)) {
			for (const ext of list) {
				const n = (ext as { name?: unknown })?.name;
				if (typeof n === 'string' && n) {
					names.push(n);
				}
			}
		}
	}
	return names;
}

/**
 * The full built-in extension manifest (name + version + repo) declared in
 * product.json. Section 7 needs version + repo (not just the name) so it can
 * self-fetch each extension's package-lock.json directly from GitHub when the
 * `download-builtin-extensions-cg` step did not deposit it into extensionsCG/
 * (that step is continueOnError and has silently failed in CI). Entries without
 * a usable name are dropped; version/repo default to '' when absent.
 */
export function readBuiltInExtensionManifest(productJson: unknown): Array<{ name: string; version: string; repo: string }> {
	const out: Array<{ name: string; version: string; repo: string }> = [];
	const pj = productJson as { builtInExtensions?: unknown; webBuiltInExtensions?: unknown } | undefined;
	if (!pj) {
		return out;
	}
	for (const list of [pj.builtInExtensions, pj.webBuiltInExtensions]) {
		if (Array.isArray(list)) {
			for (const ext of list) {
				const e = ext as { name?: unknown; version?: unknown; repo?: unknown };
				if (typeof e?.name === 'string' && e.name) {
					out.push({
						name: e.name,
						version: typeof e.version === 'string' ? e.version : '',
						repo: typeof e.repo === 'string' ? e.repo : '',
					});
				}
			}
		}
	}
	return out;
}

/**
 * Build the public raw.githubusercontent.com URL for a built-in extension's
 * package-lock.json at its release tag. These repos are PUBLIC, so no token is
 * needed (and embedding one in the URL userinfo makes native fetch throw -- the
 * exact bug that left extensionsCG/ empty in CI). Mirrors the host parsing in
 * githubRawLicenseCandidates. Returns undefined for a non-GitHub/unparseable
 * repo or a missing version so the caller can warn rather than build a bad URL.
 */
export function builtInExtensionLockfileUrl(repo: string, version: string): string | undefined {
	if (!repo || !version) {
		return undefined;
	}
	const m = repo.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
	if (!m) {
		return undefined;
	}
	return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/v${version}/package-lock.json`;
}

/**
 * Enumerate the PRODUCTION dependencies recorded in a package-lock.json
 * (lockfileVersion 2/3 `packages` map). Returns one {name, version} per distinct
 * dependency, skipping:
 *   - the root project entry (lockKey has no `node_modules/` segment)
 *   - dev-only dependencies (`dev: true` -- they do not ship)
 *   - workspace link entries (`link: true`)
 *   - arch-suffixed binaries (Section 5 enumerates those from their parent's
 *     optionalDependencies; double-handling would duplicate them)
 * Optional and peer production deps are KEPT -- deliberate over-inclusion, since
 * the legacy OSS tool listed them and crediting a license you do not strictly
 * need is the safe direction. Returns [] for a lockfileVersion-1 file (no
 * `packages` map) so the caller can warn rather than silently miss coverage.
 */
export function enumerateLockfileProdDeps(lockJson: unknown): Array<{ name: string; version: string }> {
	const lock = lockJson as { packages?: Record<string, { version?: string; dev?: boolean; link?: boolean }> } | undefined;
	const pkgs = lock?.packages;
	if (!pkgs || typeof pkgs !== 'object') {
		return [];
	}
	const out: Array<{ name: string; version: string }> = [];
	const seen = new Set<string>();
	for (const lockKey of Object.keys(pkgs)) {
		const meta = pkgs[lockKey];
		if (!meta || meta.dev === true || meta.link === true) {
			continue;
		}
		const nmIdx = lockKey.lastIndexOf('node_modules/');
		if (nmIdx < 0) {
			continue; // the root project entry, not a dependency
		}
		const name = lockKey.slice(nmIdx + 'node_modules/'.length);
		if (!name || isArchPackageName(name)) {
			continue;
		}
		const key = name.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push({ name, version: meta.version || '' });
	}
	return out;
}

const _shippedSuffixCache = new Set<string>();
function _buildShippedSuffixes(): Set<string> {
	if (_shippedSuffixCache.size > 0) {
		return _shippedSuffixCache;
	}
	for (const p of VSCODE_SHIPPED_PLATFORMS) {
		for (const a of VSCODE_SHIPPED_ARCHS) {
			_shippedSuffixCache.add(`${p}-${a}`);
		}
	}
	// darwin-universal is a macOS composite build, not a separate npm arch
	_shippedSuffixCache.add('darwin-universal');
	return _shippedSuffixCache;
}

/**
 * True when the arch suffix matches a platform+arch VS Code ships.
 * Strips ABI qualifiers (-gnu, -musl, -msvc, -glibc, -gnueabihf) before matching.
 */
export function isShippedArch(name: string): boolean {
	const m = name.match(ARCH_SUFFIX_RE);
	if (!m) {
		return false;
	}
	// Remove the leading separator and any trailing ABI qualifier
	const suffix = m[0].replace(/^[/-]/, '').replace(/-(gnu|musl|msvc|glibc|gnueabihf|eabihf|androideabi)$/, '');
	return _buildShippedSuffixes().has(suffix);
}

/**
 * Extract a license id from the many shapes an npm package.json / packument
 * version object can use for its `license`/`licenses` field: a plain SPDX
 * string, the legacy `{ type: 'MIT' }` object, or the legacy
 * `licenses: [{ type: 'MIT' }]` array. Returns '' when none is present.
 */
export function npmLicenseId(pkg: { license?: unknown; licenses?: unknown } | undefined): string {
	if (!pkg) {
		return '';
	}
	const lic = pkg.license;
	if (typeof lic === 'string') {
		return lic;
	}
	if (lic && typeof lic === 'object' && typeof (lic as { type?: unknown }).type === 'string') {
		return (lic as { type: string }).type;
	}
	const arr = pkg.licenses;
	if (Array.isArray(arr) && arr.length > 0) {
		const first = arr[0];
		if (typeof first === 'string') {
			return first;
		}
		if (first && typeof first === 'object' && typeof (first as { type?: unknown }).type === 'string') {
			return (first as { type: string }).type;
		}
	}
	return '';
}

/** Normalize a package.json/packument `repository` field (string or {url}) to a bare URL. */
function normalizeRepoUrl(repo: unknown): string {
	let url = '';
	if (typeof repo === 'string') {
		url = repo;
	} else if (repo && typeof repo === 'object' && typeof (repo as { url?: unknown }).url === 'string') {
		url = (repo as { url: string }).url;
	}
	return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** Read and JSON-parse a package's package.json, returning the raw object (or undefined). */
function readPackageJsonRaw(pkgDir: string): Record<string, unknown> | undefined {
	const pkgPath = path.join(pkgDir, 'package.json');
	try {
		if (!fs.existsSync(pkgPath)) {
			return undefined;
		}
		return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

/** Filter an optionalDependencies object to its arch-bearing entries (name + version). */
function archChildrenFromOptionalDeps(optDeps: unknown): Array<{ name: string; version: string }> {
	const out: Array<{ name: string; version: string }> = [];
	if (!optDeps || typeof optDeps !== 'object') {
		return out;
	}
	for (const [depName, depVer] of Object.entries(optDeps as Record<string, unknown>)) {
		if (isArchPackageName(depName)) {
			out.push({ name: depName, version: typeof depVer === 'string' ? depVer : '' });
		}
	}
	return out;
}

/** A trimmed-down npm registry packument: the parts Section 5 reads. */
export interface NpmPackument {
	repository?: unknown;
	versions?: { [version: string]: { license?: unknown; licenses?: unknown; repository?: unknown; optionalDependencies?: unknown } };
}

/**
 * Fetch a package's registry packument from registry.npmjs.org. Modeled on
 * fetchCratesIoJson: resolves undefined on any non-200, parse error, network
 * error, or timeout so a registry hiccup never crashes the build. Exported for
 * testing (the unit tests do NOT call it over the network).
 */
export function fetchNpmRegistryJson(name: string, timeoutMs = 10_000): Promise<NpmPackument | undefined> {
	return new Promise(resolve => {
		const options: https.RequestOptions = {
			host: 'registry.npmjs.org',
			path: '/' + encodeURIComponent(name),
			headers: { 'Accept': 'application/json' },
			timeout: timeoutMs,
		};
		const req = https.get(options, res => {
			if (res.statusCode !== 200) {
				res.resume();
				resolve(undefined);
				return;
			}
			const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
			let data = '';
			res.setEncoding('utf8');
			res.on('data', chunk => {
				data += chunk;
				if (data.length > MAX_BODY_SIZE) {
					req.destroy();
					resolve(undefined);
					return;
				}
			});
			res.on('end', () => {
				try {
					resolve(JSON.parse(data) as NpmPackument);
				} catch {
					resolve(undefined);
				}
			});
		});
		req.on('error', () => resolve(undefined));
		req.on('timeout', () => { req.destroy(); resolve(undefined); });
	});
}

/**
 * Resolve the license TEXT for one arch package, with family-level reuse. The
 * text is uniform across arches of the SAME package family, so we cache it by
 * repository URL and reuse it for siblings (fetch once). Resolution order:
 *   (own)    text this arch resolved from disk (a) or its repo (b),
 *   (parent) the seed parent's already-resolved license text (c),
 *   (none)   empty body, last resort (d) - the caller warns.
 * Returns the resolved text plus the source label for counters.
 */
export function familyText(
	cache: Map<string, { text: string; source: string }>,
	repoUrl: string,
	ownText: string | undefined,
	ownSource: 'disk' | 'repo' | undefined,
	parentText: string | undefined,
): { text: string; source: string } {
	if (repoUrl) {
		const hit = cache.get(repoUrl);
		if (hit) {
			return hit;
		}
	}
	let result: { text: string; source: string };
	if (ownText && ownSource) {
		result = { text: ownText, source: ownSource };
	} else if (parentText) {
		result = { text: parentText, source: 'parent' };
	} else {
		result = { text: '', source: 'none' };
	}
	if (repoUrl && result.text) {
		cache.set(repoUrl, result);
	}
	return result;
}

/**
 * Guard for the parent-text fallback. Parent license TEXT may only be reused
 * for a child when their license IDS match. Reusing text across an id boundary
 * (e.g. an Apache-2.0 parent's text under an LGPL-3.0 child id - the nested
 * sharp -> sharp-libvips case) is the legacy libvips defect we must not
 * replicate. Returns the parent text when safe, otherwise undefined (the caller
 * then emits an empty body + a NO LICENSE TEXT warning for a human to resolve).
 */
export function parentTextIfCompatible(parentLicenseId: string, childLicenseId: string, parentText: string): string | undefined {
	if (!parentText) {
		return undefined;
	}
	if (parentLicenseId && childLicenseId && parentLicenseId.toLowerCase() === childLicenseId.toLowerCase()) {
		return parentText;
	}
	return undefined;
}

/**
 * Recursively find all files with a given name in the repo (excluding node_modules,
 * .git, out, test directories and symlinks).
 */
function findFilesRecursive(repoRoot: string, targetFileName: string): string[] {
	const results: string[] = [];

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = fs.readdirSync(dir);
		} catch { return; }
		for (const entry of entries) {
			if (entry === 'node_modules' || entry === '.git' || entry === 'out' || entry === 'test') {
				continue;
			}
			const full = path.join(dir, entry);
			if (entry === targetFileName) {
				results.push(full);
			} else {
				try {
					if (fs.statSync(full).isDirectory() && !fs.lstatSync(full).isSymbolicLink()) {
						walk(full);
					}
				} catch { /* broken symlink or inaccessible -- skip entry, continue */ }
			}
		}
	}

	walk(repoRoot);
	return results;
}

function findCgManifestFiles(repoRoot: string): string[] {
	return findFilesRecursive(repoRoot, 'cgmanifest.json');
}

function findCargoLockFiles(repoRoot: string): string[] {
	return findFilesRecursive(repoRoot, 'Cargo.lock');
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const repoRoot = args['repo'];
	const outputPath = args['output'];

	if (!repoRoot || !outputPath) {
		console.error('Usage: scan-licenses.js --repo <path> --output <path> [--cg <ThirdPartyNotices.generated.txt>]');
		process.exit(1);
	}

	// Optional: CG's generated NOTICE. When provided, Section 3 only fetches
	// license text for cgmanifest git components that CG did NOT already cover
	// (i.e. ClearlyDefined "not harvested"), avoiding redundant network calls
	// for the components CG resolved itself.
	const cgCovered = new Set<string>();
	// CG license bodies keyed by lowercased name. Section 4 uses these to detect
	// "stub" bodies (CG emitted the SPDX expression instead of real text) and to
	// gate fetches (don't re-fetch crates CG already covered with real text).
	const cgBodies = new Map<string, string>();
	const cgNoticePath = args['cg'];
	if (cgNoticePath && fs.existsSync(cgNoticePath)) {
		try {
			for (const e of parseNoticeFile(cgNoticePath)) {
				cgCovered.add(e.name.toLowerCase());
				if (typeof e.licenseText !== 'undefined' && !cgBodies.has(e.name.toLowerCase())) {
					cgBodies.set(e.name.toLowerCase(), e.licenseText);
				}
			}
			console.log(`Loaded CG coverage set: ${cgCovered.size} packages from ${cgNoticePath}`);
		} catch (err) {
			console.warn(`  WARN: could not parse --cg notice (${cgNoticePath}): ${err}`);
		}
	}

	// Step 1: Find all built-in extensions
	const extensionsDir = path.join(repoRoot, 'extensions');
	if (!fs.existsSync(extensionsDir)) {
		console.error(`ERROR: extensions directory not found at ${extensionsDir}`);
		process.exit(1);
	}

	const extensions = fs.readdirSync(extensionsDir).filter(name => {
		const pkgPath = path.join(extensionsDir, name, 'package.json');
		if (!fs.existsSync(pkgPath)) {
			return false;
		}
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
			return pkg.engines && pkg.engines.vscode;
		} catch {
			return false;
		}
	});

	// Log extensions using their package.json name, not folder name
	const extensionNames = extensions.map(folder => {
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(extensionsDir, folder, 'package.json'), 'utf8'));
			return { folder, name: pkg.name || folder };
		} catch {
			return { folder, name: folder };
		}
	});

	console.log(`Found ${extensions.length} built-in extensions with engines.vscode`);
	for (const ext of extensionNames) {
		if (ext.name !== ext.folder) {
			console.log(`  ${ext.name} (folder: ${ext.folder})`);
		}
	}

	// =========================================================================
	// SECTION 1: Scan built-in extension dependencies
	//
	// Component Governance (CG) skips all packages whose package.json contains
	// "engines": { "vscode": "..." }. This is hardcoded in CG's NpmComponentDetector
	// (microsoft/component-detection, NpmComponentDetector.cs lines 85-97).
	//
	// CG does this because for most repos, VS Code extensions are dev tools --
	// not shipping code. But we ARE VS Code. Our built-in extensions ship in
	// the installer, and their transitive dependencies get webpack-bundled into
	// the extension JS. CG skips them all, so we scan them here.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 1: Scanning built-in extension dependencies');
	console.log('  Why: CG skips all packages with engines.vscode in their package.json.');
	console.log('  This is a CG workaround for consumers of VS Code extensions, but we');
	console.log('  ARE VS Code -- our built-in extensions ship in the product.');
	console.log('=========================================================================');
	console.log('');

	// Step 3: Scan each extension's node_modules
	const entries = new Map<string, LicenseEntry>();
	// Presence index: packages found on disk in node_modules but with NO license
	// file. These never reach the NOTICE output, but they ARE shipped -- so we
	// record name+version here. merge-notices.ts reads this sibling file to tell
	// "present but unlicensed" (an override should INJECT) apart from "not shipped"
	// (an override is stale and should be deleted). Keyed by lowercased name.
	const noLicenseSeen = new Map<string, { name: string; version: string }>();
	// Section 4 stub-override signal: `<name>@<version>` keys whose CG entry is a
	// stub (SPDX-as-body) that the scanner is replacing. Written as a sibling
	// *.stuboverride.json file that merge-notices.ts consumes to let the scanner
	// entry beat CG on collision (mirrors the presence.json sibling pattern).
	const stubOverrideKeys = new Set<string>();
	// Unresolved index: packages the scanner TRIED to resolve but for which it
	// created NO row at all (fetch failed / no license / API failed). Written as
	// a sibling *.unresolved.json that merge-notices.ts cross-checks against the
	// final merged NOTICE so packages rescued downstream (e.g. via a
	// cglicenses.json override) are excluded from the "not accounted for" list.
	const unresolved: Array<{ name: string; version: string; reason: string }> = [];
	let scanned = 0;
	let noLicense = 0;

	// TODO(future): expand the scanner to walk EVERY node_modules folder in the
	// repo (e.g. remote/node_modules, remote/web/node_modules, and nested
	// node_modules), not just the extension + root roots below. The copilot
	// extension folder has no node_modules, so it is naturally excluded. Walking
	// all node_modules would make the presence index complete; until then the
	// presence index is best-effort and the stale-override signal is warn-only.

	for (const ext of extensions) {
		const nmDirs = [
			path.join(extensionsDir, ext, 'node_modules'),
			path.join(extensionsDir, ext, 'server', 'node_modules'),
			path.join(extensionsDir, ext, 'server', 'lib', 'node_modules'),
		];

		for (const nmDir of nmDirs) {
			const packages = collectPackagesInNodeModules(nmDir);

			for (const pkgName of packages) {
				const pkgDir = path.join(nmDir, ...pkgName.split('/'));
				const pkgInfo = readPkgJson(pkgDir);
				const resolvedName = pkgInfo?.name || pkgName;
				const key = resolvedName.toLowerCase();

				// Skip if we already found it from another extension
				if (entries.has(key)) {
					continue;
				}

				scanned++;
				const licenseFilePath = findLicenseFile(pkgDir);

				if (licenseFilePath) {
					let licenseText: string;
					try {
						licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
					} catch (err) {
						console.warn(`  WARN: could not read ${licenseFilePath}: ${(err as Error).message}`);
						continue;
					}
					validateCopyright(resolvedName, licenseText, `extension: ${ext}`);
					entries.set(key, {
						name: resolvedName,
						version: pkgInfo?.version || '',
						license: pkgInfo?.license || '',
						url: pkgInfo?.repository || '',
						licenseText,
						fromExtension: ext,
					});
				} else {
					noLicense++;
					noLicenseSeen.set(key, { name: resolvedName, version: pkgInfo?.version || '' });
					console.warn(`  NO LICENSE: ${resolvedName} (extension: ${ext})`);
				}
			}
		}
	}

	// =========================================================================
	// SECTION 2: Scan root node_modules for ClearlyDefined gaps
	//
	// CG detects packages in root node_modules/ but relies on ClearlyDefined
	// to produce the license text for the NOTICE file. Some packages have
	// low or zero ClearlyDefined scores (e.g., @vscode/* internal packages,
	// @xterm/* beta versions, @parcel/watcher platform binaries). When
	// ClearlyDefined can't resolve the text, CG's notice@0 silently omits
	// the package from the NOTICE output.
	//
	// The LICENSE files are right there in node_modules/ -- we just read them.
	// This is a best-effort gap fill, not a replacement for CG.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 2: Scanning root node_modules for ClearlyDefined gaps');
	console.log('  Why: CG detects these packages but ClearlyDefined may not have their');
	console.log('  license text. The LICENSE files exist on disk -- we read them directly.');
	console.log('=========================================================================');
	console.log('');

	let rootScanned = 0;
	let rootNoLicense = 0;

	const rootNmDir = path.join(repoRoot, 'node_modules');
	if (fs.existsSync(rootNmDir)) {
		const rootPackages = collectPackagesInNodeModules(rootNmDir);

		for (const pkgName of rootPackages) {
			const pkgDir = path.join(rootNmDir, ...pkgName.split('/'));
			const pkgInfo = readPkgJson(pkgDir);
			const resolvedName = pkgInfo?.name || pkgName;
			const key = resolvedName.toLowerCase();

			// Skip if already found from extension scan
			if (entries.has(key)) {
				continue;
			}

			rootScanned++;
			const licenseFilePath = findLicenseFile(pkgDir);

			if (licenseFilePath) {
				let licenseText: string;
				try {
					licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
				} catch (err) {
					console.warn(`  WARN: could not read ${licenseFilePath}: ${(err as Error).message}`);
					continue;
				}
				validateCopyright(resolvedName, licenseText, 'root node_modules');
				entries.set(key, {
					name: resolvedName,
					version: pkgInfo?.version || '',
					license: pkgInfo?.license || '',
					url: pkgInfo?.repository || '',
					licenseText,
					fromExtension: '(root)',
				});
			} else {
				rootNoLicense++;
				noLicenseSeen.set(key, { name: resolvedName, version: pkgInfo?.version || '' });
				console.warn(`  NO LICENSE: ${resolvedName} (root node_modules)`);
			}
		}
	}

	console.log(`  Root packages scanned: ${rootScanned}`);
	console.log(`  Root LICENSE found: ${rootScanned - rootNoLicense}`);
	console.log(`  Root NO LICENSE: ${rootNoLicense}`);

	// =========================================================================
	// SECTION 3: Extract licenses from cgmanifest.json entries
	//
	// Language grammars, vendored code (chromium, electron, nodejs), and other
	// manually declared components are registered in cgmanifest.json files
	// throughout the repo. These are not npm packages -- they don't exist in
	// node_modules. The license text is stored inline in a custom
	// "licenseDetail" field (an array of strings, one per line).
	//
	// This is the same field that the manual OSS tool read. CG ignores it --
	// licenseDetail is not part of the CG schema.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 3: Extracting licenses from cgmanifest.json licenseDetail');
	console.log('  Why: Language grammars, vendored code, and other manually declared');
	console.log('  components have license text inline in cgmanifest.json. CG ignores');
	console.log('  this field -- it is a VS Code custom extension.');
	console.log('=========================================================================');
	console.log('');

	let cgManifestFound = 0;
	let cgManifestNoDetail = 0;
	let cgManifestFetched = 0;
	let cgManifestFetchFailed = 0;
	let cgManifestSkippedCgCovered = 0;

	const cgManifestFiles = findCgManifestFiles(repoRoot);
	console.log(`  Found ${cgManifestFiles.length} cgmanifest.json files`);

	for (const manifestPath of cgManifestFiles) {
		let data: { registrations?: unknown[]; Registrations?: unknown[] };
		try {
			data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		} catch {
			console.warn(`  WARN: Could not parse ${manifestPath}`);
			continue;
		}
		const registrations = (data.registrations || data.Registrations || []) as Array<{
			component?: { git?: { name?: string; repositoryUrl?: string; commitHash?: string }; npm?: { name?: string }; other?: { name?: string; downloadUrl?: string } };
			licenseDetail?: unknown;
			license?: unknown;
			version?: string;
		}>;

		for (const reg of registrations) {
			const comp = reg.component;
			if (!comp) {
				continue;
			}

			const inner = comp.git || comp.npm || comp.other || {};
			const name = (inner as { name?: string }).name || '';
			if (!name) {
				continue;
			}

			const key = name.toLowerCase();

			// Skip if already found from extension or root scan
			if (entries.has(key)) {
				continue;
			}

			// Extract licenseDetail if available
			if (reg.licenseDetail && (reg.licenseDetail as unknown[]).length > 0) {
				const detail = reg.licenseDetail as string[] | string[][];
				let licenseText: string;
				if (Array.isArray(detail[0])) {
					// Nested array format
					licenseText = (detail[0] as string[]).join('\n');
				} else {
					licenseText = (detail as string[]).join('\n');
				}

				const url = comp.git?.repositoryUrl || comp.other?.downloadUrl || '';
				const version = reg.version || comp.git?.commitHash?.substring(0, 7) || '';
				const license = typeof reg.license === 'string' ? reg.license : '';
				const relPath = path.relative(repoRoot, manifestPath);
				validateCopyright(name, licenseText, `cgmanifest: ${relPath}`);

				entries.set(key, {
					name,
					version,
					license,
					url,
					licenseText,
					fromExtension: `(cgmanifest: ${relPath})`,
				});
				cgManifestFound++;
				continue;
			}

			// No inline licenseDetail. If CG already covered this component
			// (ClearlyDefined harvested it), there's nothing to do -- skip.
			if (cgCovered.has(key)) {
				cgManifestSkippedCgCovered++;
				continue;
			}

			// CG did NOT cover it and there's no inline text. If it's a git
			// component with a repo + pinned commit, fetch the LICENSE from the
			// repo directly (this is what the legacy OSS tool did). Reading the
			// real LICENSE file is CELA-clean -- we never manufacture text.
			const relPath = path.relative(repoRoot, manifestPath);
			const repoUrl = comp.git?.repositoryUrl || '';
			const commitHash = comp.git?.commitHash || '';
			if (repoUrl && commitHash) {
				const fetched = await fetchLicenseFromGitRepo(repoUrl, commitHash);
				if (fetched) {
					const license = typeof reg.license === 'string' ? reg.license : '';
					const version = reg.version || commitHash.substring(0, 7);
					validateCopyright(name, fetched, `cgmanifest-fetch: ${relPath}`);
					entries.set(key, {
						name,
						version,
						license,
						url: repoUrl,
						licenseText: fetched,
						fromExtension: `(cgmanifest-fetch: ${relPath})`,
					});
					cgManifestFetched++;
					console.log(`  FETCHED LICENSE: ${name} (${repoUrl}@${commitHash.substring(0, 7)})`);
					continue;
				}
				cgManifestFetchFailed++;
				unresolved.push({ name, version: reg.version || commitHash.substring(0, 7), reason: 'cgmanifest-fetch-failed' });
				console.warn(`  FETCH FAILED: ${name} (${repoUrl}@${commitHash.substring(0, 7)}) -- no LICENSE resolved`);
				continue;
			}

			cgManifestNoDetail++;
			console.warn(`  NO LICENSE DETAIL: ${name} (${relPath})`);
		}
	}

	console.log(`  Entries with licenseDetail: ${cgManifestFound}`);
	console.log(`  Entries without licenseDetail: ${cgManifestNoDetail}`);

	// =========================================================================
	// SECTION 4: Harvest Rust crate licenses from Cargo.lock files
	//
	// Rust crates reach the product via Cargo.lock (cli/, build/win32/) but CG
	// handles them imperfectly, leaving two gaps Section 4 closes:
	//   (a) Coverage gap: ~17 crates ship but appear in NO cgmanifest and are
	//       absent from CG entirely (the scanner doesn't walk Cargo today).
	//   (b) Stub-defect gap: ~17 crates ARE in CG, but CG emitted the SPDX
	//       expression as the license BODY (e.g. "Zlib OR Apache-2.0 OR MIT")
	//       instead of the real license text.
	//
	// Both are closed by the same pipeline: parse Cargo.lock -> crates.io API ->
	// resolve repo URL -> fetch the REAL license text from the repo (tag-pinned).
	// CG-coverage gating bounds network calls to ~34 crates, not all ~419.
	//
	// We never manufacture license text -- the SPDX id is used only as the
	// `license` field label; the body is always the real upstream LICENSE file.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 4: Harvesting Rust crate licenses from Cargo.lock');
	console.log('  Why: CG misses some Rust crates entirely and emits the SPDX expression');
	console.log('  as the license body for others. We fetch the real LICENSE text from');
	console.log('  each crate\'s repo (tag-pinned), gated by CG coverage to bound fetches.');
	console.log('=========================================================================');
	console.log('');

	let cargoCratesSeen = 0;
	let cargoNoSource = 0;
	let cargoGitSource = 0;
	let cargoSkippedCgCovered = 0;
	let cargoSkippedAlready = 0;
	let cargoFetched = 0;
	let cargoStubOverride = 0;
	let cargoFetchFailed = 0;
	let cargoApiFailed = 0;
	// Crates with a conjunctive (AND) SPDX expression where we emitted only one
	// license's text -- a legally incomplete notice that needs a cglicenses.json
	// override with the full combined text. See hasSpdxAnd. (0 for today's set.)
	let cargoAndIncomplete = 0;

	const cargoLockFiles = findCargoLockFiles(repoRoot);
	console.log(`  Found ${cargoLockFiles.length} Cargo.lock files`);

	// Collect the crates to resolve first (dedupe by lowercased name, gated by CG
	// coverage), then fetch with a small concurrency cap.
	interface PendingCrate {
		name: string;
		version: string;
		relPath: string;
		isStubOverride: boolean;
	}
	const pending: PendingCrate[] = [];
	const seenCargoKeys = new Set<string>();

	for (const lockPath of cargoLockFiles) {
		const relPath = path.relative(repoRoot, lockPath);
		let pkgs: CargoPackage[];
		try {
			pkgs = parseCargoLock(fs.readFileSync(lockPath, 'utf8'));
		} catch (err) {
			console.warn(`  WARN: could not parse ${relPath}: ${err}`);
			continue;
		}
		console.log(`  ${relPath}: ${pkgs.length} packages`);

		for (const pkg of pkgs) {
			cargoCratesSeen++;
			// Skip first-party workspace crates (no source) -- not third-party OSS.
			if (!pkg.source) {
				cargoNoSource++;
				continue;
			}
			// git+ sources embed their own commit; none of our targets use this.
			// Log-and-skip (spec Q3) -- cheap to add later, no current consumer.
			if (pkg.source.startsWith('git+')) {
				cargoGitSource++;
				console.log(`  SKIP (git source, TODO): ${pkg.name}@${pkg.version}`);
				continue;
			}

			const key = pkg.name.toLowerCase();
			// Already resolved by another section, or an earlier lock file.
			if (entries.has(key) || seenCargoKeys.has(key)) {
				cargoSkippedAlready++;
				continue;
			}

			const cgBody = cgBodies.get(key);
			const cgHasIt = cgCovered.has(key);
			if (cgHasIt && (typeof cgBody === 'undefined' || !isSpdxStub(cgBody))) {
				// CG covered it with real text -- nothing to do, do NOT fetch.
				cargoSkippedCgCovered++;
				continue;
			}

			seenCargoKeys.add(key);
			pending.push({
				name: pkg.name,
				version: pkg.version,
				relPath,
				// Stub-override only when CG actually has it AND its body is a stub.
				isStubOverride: cgHasIt && typeof cgBody !== 'undefined' && isSpdxStub(cgBody),
			});
		}
	}

	console.log(`  Resolving ${pending.length} crates via crates.io (coverage-gated)`);

	const cargoTasks = pending.map(p => async (): Promise<void> => {
		try {
			const info = await fetchCratesIoJson(p.name);
			if (!info) {
				cargoApiFailed++;
				unresolved.push({ name: p.name, version: p.version, reason: 'cargo-api-failed' });
				console.warn(`  CRATES.IO FAILED: ${p.name}@${p.version} -- no crate info`);
				return;
			}
			// Shape guard: fetchCratesIoJson only guarantees "HTTP 200 + JSON.parse
			// succeeded" -- NOT object shape. A 200 with an unexpected body (error
			// envelope `{errors:[…]}`, schema drift, missing `versions`/`crate`)
			// would make the dereferences below throw a TypeError, rejecting the
			// task → Promise.all → main() → process.exit(1), crashing the build.
			// Spec sec. 6.6: a failed crates.io call must log and continue, never crash.
			if (!Array.isArray(info.versions) || !info.crate || typeof info.crate.id !== 'string') {
				cargoApiFailed++;
				unresolved.push({ name: p.name, version: p.version, reason: 'cargo-api-failed' });
				console.warn(`  CRATES.IO FAILED: ${p.name}@${p.version} -- unexpected response shape (no versions/crate)`);
				return;
			}
			const versionInfo = info.versions.find(v => v.num === p.version);
			const license = versionInfo?.license || '';
			if (!versionInfo) {
				console.warn(`  WARN: version ${p.version} not found for crate ${p.name} -- using repo default`);
			}
			const repoUrl = getCrateRepository(info);
			if (!repoUrl) {
				cargoFetchFailed++;
				unresolved.push({ name: p.name, version: p.version, reason: 'cargo-no-repo-url' });
				console.warn(`  FETCH FAILED: ${p.name}@${p.version} -- no repository URL`);
				return;
			}

			// SPDX-id-driven, tag-pinned fetch. For OR expressions, fetching the
			// first available license's text is correct (licensee's choice). For AND
			// expressions, ALL named licenses are legally required but we currently
			// emit only the first -- warn loudly so an AND-licensed crate can never
			// silently ship a one-sided (deficient) notice. See hasSpdxAnd / spec sec. 6.
			const result = await fetchCargoLicense(repoUrl, p.name, p.version, license);
			if (!result) {
				cargoFetchFailed++;
				unresolved.push({ name: p.name, version: p.version, reason: 'cargo-no-license-resolved' });
				console.warn(`  FETCH FAILED: ${p.name}@${p.version} (${repoUrl}) -- no LICENSE resolved at any ref (needs cglicenses.json override)`);
				return;
			}
			if (hasSpdxAnd(license)) {
				cargoAndIncomplete++;
				console.warn(`  AND-LICENSE INCOMPLETE: ${p.name}@${p.version} -- SPDX "${license}" is conjunctive (AND); only one license's text was fetched. ALL named licenses are legally required -- add a cglicenses.json override with the full combined text.`);
			}
			const fetched = result.text;
			const usedRef = result.ref;

			const key = p.name.toLowerCase();
			// Relaxed copyright validation for Cargo source: many crates ship license
			// files with no copyright line. Per CELA this is acceptable for cargo
			// components (legacy item.ts:286 skips the check for ItemSource.CARGO_LOCK),
			// so we deliberately do NOT call validateCopyright() here.
			entries.set(key, {
				name: p.name,
				version: p.version,
				license,
				url: repoUrl,
				licenseText: fetched,
				fromExtension: p.isStubOverride ? `(cargo-stub-override: ${p.relPath})` : `(cargo: ${p.relPath})`,
			});
			if (p.isStubOverride) {
				cargoStubOverride++;
				stubOverrideKeys.add(`${key}@${p.version}`);
				console.log(`  STUB OVERRIDE: ${p.name}@${p.version} (${repoUrl}@${usedRef})`);
			} else {
				cargoFetched++;
				console.log(`  FETCHED LICENSE: ${p.name}@${p.version} (${repoUrl}@${usedRef})`);
			}
		} catch (err) {
			// Defense-in-depth: any unexpected throw in this task must log and
			// continue, never reject (which would crash the build per sec. 6.6).
			cargoApiFailed++;
			unresolved.push({ name: p.name, version: p.version, reason: 'cargo-api-failed' });
			console.warn(`  CRATES.IO FAILED: ${p.name}@${p.version} -- unexpected error: ${(err as Error).message}`);
		}
	});

	await runWithConcurrency(cargoTasks, 4);

	console.log(`  Crates added (coverage gap): ${cargoFetched}`);
	console.log(`  Crates stub-overridden: ${cargoStubOverride}`);

	// =========================================================================
	// SECTION 5: Platform-binary enumeration
	//
	// Closes a parity gap with the legacy OSS tool. Arch-specific npm packages
	// (e.g. @img/sharp-win32-x64) are optionalDependencies of an arch-independent
	// PARENT (sharp). On a single-platform build agent only the host arch is
	// installed on disk, so the scanner above misses every other arch. Legacy
	// enumerated EVERY arch from the parent's optionalDependencies and resolved
	// EACH arch's OWN license. We do the same here: enumerate all arches (even
	// ones VS Code does not ship - deliberate, harmless over-inclusion), resolve
	// each arch child's own license id + url + text, and recurse into nested
	// arch-specific optionalDependencies (sharp -> @img/sharp-<arch> ->
	// @img/sharp-libvips-<arch>). Every fetch is wrapped so a registry/network
	// failure resolves to undefined and continues - this must never crash the build.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 5: Enumerating platform-specific binary packages (shipped arches)');
	console.log('  Why: arch-specific npm packages are optionalDependencies of an');
	console.log('  arch-independent parent. Only the host arch installs on disk, so the');
	console.log('  scan above misses the rest. We enumerate every SHIPPED arch.');
	console.log('  Shipped platforms: ' + Array.from(VSCODE_SHIPPED_PLATFORMS).join(', '));
	console.log('  Shipped arches: ' + Array.from(VSCODE_SHIPPED_ARCHS).join(', '));
	console.log('=========================================================================');
	console.log('');

	let pbParentsFound = 0;
	let pbAdded = 0;
	let pbFetchedRegistry = 0;
	let pbTextFromDisk = 0;
	let pbTextFromRepo = 0;
	let pbTextFromParent = 0;
	let pbNoText = 0;
	let pbSkippedAlready = 0;
	let pbSkippedCg = 0;
	let pbSkippedNotShipped = 0;

	// node_modules roots the scanner already knows: repo root, remote, build, and
	// every extension root (+ server / server-lib). Seeds and on-disk lookups
	// both walk these.
	const pbRoots = [
		path.join(repoRoot, 'node_modules'),
		path.join(repoRoot, 'remote', 'node_modules'),
		path.join(repoRoot, 'build', 'node_modules'),
	];
	for (const ext of extensions) {
		pbRoots.push(path.join(extensionsDir, ext, 'node_modules'));
		pbRoots.push(path.join(extensionsDir, ext, 'server', 'node_modules'));
		pbRoots.push(path.join(extensionsDir, ext, 'server', 'lib', 'node_modules'));
	}

	// Index every on-disk package (lowercased name -> dir) and, in the same pass,
	// collect the SEED PARENTS: packages whose optionalDependencies have >=1
	// arch-bearing key (this naturally finds sharp / canvas / parcel-watcher / copilot).
	const pbOnDisk = new Map<string, string>();
	const pbSeedKeys = new Set<string>();
	const pbSeedParents: Array<{ key: string; dir: string; optDeps: Record<string, unknown> }> = [];
	for (const root of pbRoots) {
		for (const pkgName of collectPackagesInNodeModules(root)) {
			const dir = path.join(root, ...pkgName.split('/'));
			const ck = pkgName.toLowerCase();
			if (!pbOnDisk.has(ck)) {
				pbOnDisk.set(ck, dir);
			}
			const raw = readPackageJsonRaw(dir);
			const opt = raw?.optionalDependencies;
			if (!pbSeedKeys.has(ck) && opt && typeof opt === 'object' && archChildrenFromOptionalDeps(opt).length >= 1) {
				pbSeedKeys.add(ck);
				pbSeedParents.push({ key: ck, dir, optDeps: opt as Record<string, unknown> });
			}
		}
	}
	pbParentsFound = pbSeedParents.length;
	console.log(`  Found ${pbParentsFound} platform-binary parent packages on disk`);

	// Family license text cache (keyed by repository URL): fetch once, reuse for
	// every arch sibling of the same family.
	const pbTextByRepo = new Map<string, { text: string; source: string }>();
	// Dedupe arch children by lowercased name across the whole BFS.
	const pbVisited = new Set<string>();

	// BFS frontier: each node carries the optionalDependencies to enumerate plus
	// the seed parent identity (used for the parent license-text fallback). Seed
	// parents are the level-0 frontier; their resolved arch children become the
	// next frontier (recursing into the nested libvips level, and beyond).
	interface PbFrontierNode {
		optDeps: unknown;
		seedParentKey: string;
		seedParentLicenseId: string;
		seedParentText: string;
	}
	let pbFrontier: PbFrontierNode[] = pbSeedParents.map(p => ({
		optDeps: p.optDeps,
		seedParentKey: p.key,
		seedParentLicenseId: npmLicenseId(readPackageJsonRaw(p.dir)),
		seedParentText: entries.get(p.key)?.licenseText || '',
	}));

	while (pbFrontier.length > 0) {
		// Expand the frontier into the unique arch children to resolve this level.
		const childrenThisLevel: Array<{ name: string; version: string; seedParentKey: string; seedParentLicenseId: string; seedParentText: string }> = [];
		for (const node of pbFrontier) {
			for (const child of archChildrenFromOptionalDeps(node.optDeps)) {
				const ck = child.name.toLowerCase();
				if (pbVisited.has(ck)) {
					continue;
				}
				pbVisited.add(ck);
				if (!isShippedArch(child.name)) {
					pbSkippedNotShipped++;
					continue;
				}
				childrenThisLevel.push({
					name: child.name,
					version: child.version,
					seedParentKey: node.seedParentKey,
					seedParentLicenseId: node.seedParentLicenseId,
					seedParentText: node.seedParentText,
				});
			}
		}
		if (childrenThisLevel.length === 0) {
			break;
		}

		const nextFrontier: PbFrontierNode[] = [];
		const tasks = childrenThisLevel.map(child => async (): Promise<void> => {
			try {
				const ck = child.name.toLowerCase();
				const onDiskDir = pbOnDisk.get(ck);

				// Resolve license id, repo url, and this arch's own optionalDependencies
				// (for recursion) - from disk if installed, else from the packument.
				let licenseId = '';
				let repoUrl = '';
				let childOptDeps: unknown;
				if (onDiskDir) {
					const raw = readPackageJsonRaw(onDiskDir);
					licenseId = npmLicenseId(raw);
					repoUrl = normalizeRepoUrl(raw?.repository);
					childOptDeps = raw?.optionalDependencies;
				} else {
					const packument = await fetchNpmRegistryJson(child.name);
					if (packument) {
						pbFetchedRegistry++;
						const v = packument.versions ? packument.versions[child.version] : undefined;
						licenseId = npmLicenseId(v);
						repoUrl = normalizeRepoUrl(v?.repository ?? packument.repository);
						childOptDeps = v?.optionalDependencies;
					}
				}

				// Recurse into this arch's own arch-specific optionalDependencies
				// (the libvips level) regardless of whether we emit it below.
				nextFrontier.push({
					optDeps: childOptDeps,
					seedParentKey: child.seedParentKey,
					seedParentLicenseId: child.seedParentLicenseId,
					seedParentText: child.seedParentText,
				});

				// Only ADD genuinely-missing arches. Host arch may already be in
				// `entries` (Section 1/2); CG may already emit it.
				if (entries.has(ck)) {
					pbSkippedAlready++;
					return;
				}
				if (cgCovered.has(ck)) {
					pbSkippedCg++;
					return;
				}

				// Resolve license TEXT with family-level reuse (fetch once per repo).
				let resolved = repoUrl ? pbTextByRepo.get(repoUrl) : undefined;
				if (!resolved) {
					let ownText: string | undefined;
					let ownSource: 'disk' | 'repo' | undefined;
					// (a) any arch of this family on disk -> read its LICENSE file.
					if (onDiskDir) {
						const lf = findLicenseFile(onDiskDir);
						if (lf) {
							try {
								ownText = fs.readFileSync(lf, 'utf8').trim();
								ownSource = 'disk';
							} catch { /* fall through */ }
						}
					}
					// (b) else fetch the family text once from its repository.
					if (!ownText && repoUrl) {
						for (const ref of [`v${child.version}`, child.version, 'main', 'master']) {
							const text = await fetchLicenseFromGitRepo(repoUrl, ref);
							if (text && isRealLicenseBody(text)) {
								ownText = text;
								ownSource = 'repo';
								break;
							}
						}
					}
					// (c) parent fallback / (d) empty - handled by familyText.
					// Parent text is only safe across a matching license id (never
					// reuse Apache parent text under an LGPL child - the legacy bug).
					const safeParentText = parentTextIfCompatible(child.seedParentLicenseId, licenseId, child.seedParentText);
					resolved = familyText(pbTextByRepo, repoUrl, ownText, ownSource, safeParentText);
				}

				if (resolved.source === 'disk') {
					pbTextFromDisk++;
				} else if (resolved.source === 'repo') {
					pbTextFromRepo++;
				} else if (resolved.source === 'parent') {
					pbTextFromParent++;
				} else {
					pbNoText++;
					console.warn(`  NO LICENSE TEXT: ${child.name}@${child.version} - emitting entry with empty body (id=${licenseId || 'unknown'}, url=${repoUrl || 'none'})`);
				}

				entries.set(ck, {
					name: child.name,
					version: child.version,
					license: licenseId,
					url: repoUrl,
					licenseText: resolved.text,
					fromExtension: 'platform-binary-enumeration',
				});
				pbAdded++;
				console.log(`  ADDED (arch): ${child.name}@${child.version} - ${licenseId || 'unknown'} (text: ${resolved.source})`);
			} catch (err) {
				// Defense-in-depth: any unexpected throw must log and continue,
				// never reject (which would crash the build).
				console.warn(`  PLATFORM-BINARY FAILED: ${child.name}@${child.version} - unexpected error: ${(err as Error).message}`);
			}
		});

		await runWithConcurrency(tasks, 4);
		pbFrontier = nextFrontier;
	}

	console.log(`  Platform-binary arch entries added: ${pbAdded}`);

	// =========================================================================
	// SECTION 6: OS-gated whole-package enumeration (lockfile-driven)
	//
	// Sections 1-2 only see what npm actually installed on THIS build host. The
	// NOTICE job runs on a single Linux agent, so a package gated to another OS
	// via its `os` field (e.g. @vscode/windows-ca-certs, os:["win32"]) is never
	// on disk here -> the scanner misses it -> it silently drops from the notice
	// even though it ships in the win32 product. The legacy OSS tool caught these
	// because it walked the lockfile, not the installed tree.
	//
	// Fix: read the package-lock.json files (the manifest of EVERY dependency,
	// installed or not) and seed any package that (a) will not install on the
	// host but (b) ships on a platform we target into the presence index. The
	// cglicenses.json override then supplies the human-authored license text; if
	// no override exists the package surfaces as "present but unlicensed" (loud,
	// shift-left) instead of vanishing (silent). Arch-suffixed binaries
	// (@img/sharp-win32-x64, @esbuild/linux-x64, ...) are NOT handled here -
	// Section 5 already enumerates those from their parents' optionalDependencies.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 6: OS-gated whole-package enumeration (lockfile-driven)');
	console.log(`  Host platform: ${process.platform}`);
	console.log('=========================================================================');

	const hostPlatform = process.platform;
	const s6LockFiles = [
		path.join(repoRoot, 'package-lock.json'),
		path.join(repoRoot, 'remote', 'package-lock.json'),
		path.join(repoRoot, 'build', 'package-lock.json'),
	];
	let s6Seeded = 0;
	let s6AlreadyResolved = 0;
	let s6AlreadyPresent = 0;
	const s6Seen = new Set<string>();
	for (const lockPath of s6LockFiles) {
		if (!fs.existsSync(lockPath)) {
			continue;
		}
		let lock: { packages?: Record<string, { version?: string; os?: unknown }> };
		try {
			lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
		} catch (err) {
			console.warn(`  WARN: could not parse ${lockPath}: ${(err as Error).message}`);
			continue;
		}
		const pkgs = lock.packages || {};
		for (const lockKey of Object.keys(pkgs)) {
			const meta = pkgs[lockKey];
			if (!isOsGatedShippedElsewhere(meta?.os as string[], hostPlatform)) {
				continue;
			}
			const nmIdx = lockKey.lastIndexOf('node_modules/');
			if (nmIdx < 0) {
				continue; // the root project entry, not a dependency
			}
			const name = lockKey.slice(nmIdx + 'node_modules/'.length);
			if (!name) {
				continue;
			}
			// Section 5 owns arch-suffixed binaries; don't double-handle them.
			if (isArchPackageName(name)) {
				continue;
			}
			const key = name.toLowerCase();
			if (s6Seen.has(key)) {
				continue;
			}
			s6Seen.add(key);
			if (entries.has(key)) {
				s6AlreadyResolved++; // already resolved with a license elsewhere
				continue;
			}
			if (noLicenseSeen.has(key)) {
				s6AlreadyPresent++;
				continue;
			}
			noLicenseSeen.set(key, { name, version: meta?.version || '' });
			s6Seeded++;
			console.log(`  SEEDED (os:[${(meta!.os as string[]).join(', ')}]): ${name}@${meta?.version || ''}`);
		}
	}
	console.log(`  Section 6 seeded ${s6Seeded} os-gated package(s) into the presence index ` +
		`(${s6AlreadyResolved} already licensed, ${s6AlreadyPresent} already present).`);

	// =========================================================================
	// SECTION 7: Built-in (pre-built) extension dependency enumeration
	//
	// js-debug, js-debug-companion and js-profile-table are PRE-BUILT extensions:
	// VS Code downloads them as finished VSIXs (product.json `builtInExtensions`)
	// rather than building them from source. Their bundled npm dependencies are
	// therefore never installed into this repo's node_modules and never scanned by
	// CG, so ~14 of js-debug's runtime deps (acorn-loose, astring, preact, signale,
	// @c4312/chromehash, ...) silently drop from the notice even though they ship in
	// the product. The legacy OSS tool caught them by walking each extension's
	// package-lock.json.
	//
	// Fix: obtain each extension's package-lock.json, enumerate the production
	// dependencies that CG / Sections 1-6 did not already cover, and resolve each
	// one's license text from its repository (the same packument -> repo LICENSE
	// fetch path as Section 5). A dep whose text cannot be fetched is seeded into
	// the presence index (loud, shift-left) so a cglicenses override can supply it
	// rather than the package vanishing.
	//
	// Lockfile acquisition is disk-first, self-fetch-fallback:
	//   1. Prefer extensionsCG/<name>/package-lock.json, deposited by the
	//      `download-builtin-extensions-cg` build step.
	//   2. If that file is absent, self-fetch the lockfile straight from the public
	//      raw.githubusercontent.com URL at the release tag -- no token needed.
	// The download step is continueOnError and has silently failed in CI for ~2y
	// (it embeds a token in the URL userinfo, which makes native fetch throw), so
	// the self-fetch fallback is what actually delivers coverage today. Keeping the
	// disk path means we still use the step's output for free once it is repaired.
	//
	// Guard: an extension whose lockfile cannot be obtained from EITHER source is a
	// genuine coverage hole. In CI (TF_BUILD/BUILD_BUILDID set) that is logged as an
	// ERROR; --strict-builtin-extensions turns any missing lockfile into a hard
	// build failure. Offline local runs (no disk copy, no network) log a quiet NOTE.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 7: Built-in (pre-built) extension dependency enumeration');
	console.log('=========================================================================');

	let s7Added = 0;
	let s7Seeded = 0;
	let s7SkippedCg = 0;
	let s7SkippedAlready = 0;
	let s7DepsEnumerated = 0;
	let s7LockfilesFound = 0;
	let s7LockfilesFromDisk = 0;
	let s7LockfilesFetched = 0;
	let s7ExtCount = 0;
	const s7MissingLockfiles: string[] = [];
	const strictBuiltin = process.argv.includes('--strict-builtin-extensions');
	const inCI = !!(process.env.TF_BUILD || process.env.BUILD_BUILDID);

	const extensionsCgDir = path.join(repoRoot, 'extensionsCG');
	{
		let extManifest: Array<{ name: string; version: string; repo: string }> = [];
		const productJsonPath = path.join(repoRoot, 'product.json');
		try {
			extManifest = readBuiltInExtensionManifest(JSON.parse(fs.readFileSync(productJsonPath, 'utf8')));
		} catch (err) {
			console.warn(`  WARN: could not read built-in extensions from ${productJsonPath}: ${(err as Error).message}`);
		}
		s7ExtCount = extManifest.length;
		console.log(`  Built-in extensions in product.json: ${s7ExtCount}` +
			`${s7ExtCount ? ' (' + extManifest.map(e => e.name).join(', ') + ')' : ''}`);

		// Acquire each extension's package-lock.json -- disk first (deposited by the
		// download-builtin-extensions-cg step), then self-fetch the public raw URL
		// at the release tag when disk is empty. Runs concurrently; each extension
		// lands in lockByExt or s7MissingLockfiles.
		const lockByExt = new Map<string, unknown>();
		const acquireTasks = extManifest.map(ext => async (): Promise<void> => {
			const lockPath = path.join(extensionsCgDir, ext.name, 'package-lock.json');
			if (fs.existsSync(lockPath)) {
				try {
					lockByExt.set(ext.name, JSON.parse(fs.readFileSync(lockPath, 'utf8')));
					s7LockfilesFound++;
					s7LockfilesFromDisk++;
					return;
				} catch (err) {
					console.warn(`  WARN: could not parse ${lockPath}: ${(err as Error).message}`);
				}
			}
			const lockUrl = builtInExtensionLockfileUrl(ext.repo, ext.version);
			if (!lockUrl) {
				console.warn(`  WARN: ${ext.name} has no parseable GitHub repo/version in product.json -- cannot self-fetch its lockfile`);
				s7MissingLockfiles.push(ext.name);
				return;
			}
			const body = await fetchUriText(lockUrl);
			if (body) {
				try {
					lockByExt.set(ext.name, JSON.parse(body));
					s7LockfilesFound++;
					s7LockfilesFetched++;
					console.log(`  self-fetched lockfile: ${ext.name}@${ext.version} (${lockUrl})`);
					return;
				} catch (err) {
					console.warn(`  WARN: could not parse self-fetched lockfile for ${ext.name}: ${(err as Error).message}`);
				}
			}
			s7MissingLockfiles.push(ext.name);
		});
		await runWithConcurrency(acquireTasks, 4);

		// Collect the production deps across every acquired lockfile, deduped by
		// lowercased name, skipping anything Sections 1-6 / CG covered.
		const s7Pending = new Map<string, { name: string; version: string }>();
		for (const ext of extManifest) {
			const lockJson = lockByExt.get(ext.name);
			if (!lockJson) {
				continue;
			}
			const deps = enumerateLockfileProdDeps(lockJson);
			if (deps.length === 0) {
				console.warn(`  WARN: ${ext.name} lockfile produced 0 production deps (lockfileVersion 1, or empty)`);
			}
			for (const dep of deps) {
				const key = dep.name.toLowerCase();
				if (entries.has(key)) { s7SkippedAlready++; continue; }
				if (cgCovered.has(key)) { s7SkippedCg++; continue; }
				if (!s7Pending.has(key)) {
					s7Pending.set(key, dep);
				}
			}
		}
		s7DepsEnumerated = s7Pending.size;
		console.log(`  ${s7LockfilesFound} lockfile(s) acquired (${s7LockfilesFromDisk} disk, ${s7LockfilesFetched} self-fetched); ${s7DepsEnumerated} uncovered production dep(s) to resolve`);

		// Resolve license text for each missing dep: packument -> license id + repo
		// url, then fetch the LICENSE from the repository (same path as Section 5).
		// Every fetch is wrapped so a network failure logs and continues -- never
		// crashes the build. A dep with no fetchable text is seeded into the
		// presence index so a cglicenses override can supply it (loud, not silent).
		const s7Tasks = [...s7Pending.values()].map(dep => async (): Promise<void> => {
			try {
				const key = dep.name.toLowerCase();
				const packument = await fetchNpmRegistryJson(dep.name);
				let licenseId = '';
				let repoUrl = '';
				if (packument) {
					const v = packument.versions ? packument.versions[dep.version] : undefined;
					licenseId = npmLicenseId(v);
					repoUrl = normalizeRepoUrl(v?.repository ?? packument.repository);
				}
				let text: string | undefined;
				if (repoUrl) {
					for (const ref of [`v${dep.version}`, dep.version, 'main', 'master']) {
						const t = await fetchLicenseFromGitRepo(repoUrl, ref);
						if (t && isRealLicenseBody(t)) {
							text = t;
							break;
						}
					}
				}
				if (text) {
					validateCopyright(dep.name, text, 'builtin-extension');
					entries.set(key, {
						name: dep.name,
						version: dep.version,
						license: licenseId,
						url: repoUrl,
						licenseText: text,
						fromExtension: 'builtin-extension-enumeration',
					});
					s7Added++;
					console.log(`  ADDED (builtin-ext): ${dep.name}@${dep.version} - ${licenseId || 'unknown'} (text: repo)`);
				} else {
					if (!noLicenseSeen.has(key)) {
						noLicenseSeen.set(key, { name: dep.name, version: dep.version });
						s7Seeded++;
					}
					console.warn(`  NO LICENSE TEXT: ${dep.name}@${dep.version} - seeded into presence index (id=${licenseId || 'unknown'}, url=${repoUrl || 'none'})`);
				}
			} catch (err) {
				console.warn(`  BUILTIN-EXTENSION FAILED: ${dep.name}@${dep.version} - unexpected error: ${(err as Error).message}`);
			}
		});
		await runWithConcurrency(s7Tasks, 4);

		if (s7MissingLockfiles.length > 0) {
			const detail = `${s7MissingLockfiles.length} built-in extension(s) have NO obtainable package-lock.json (neither extensionsCG/ nor self-fetch): ${s7MissingLockfiles.join(', ')}`;
			if (inCI) {
				console.error(`  ERROR: ${detail}`);
				console.error('  Their bundled dependencies are NOT covered. The download-builtin-extensions-cg step likely failed AND the GitHub self-fetch fallback could not reach the lockfile.');
			} else {
				console.log(`  NOTE: ${detail}`);
				console.log('  (Expected for offline local runs; CI self-fetches each lockfile from GitHub.)');
			}
		}
		console.log(`  Section 7 added ${s7Added} dep(s) with text, seeded ${s7Seeded} into presence; ` +
			`skipped ${s7SkippedCg} CG-covered, ${s7SkippedAlready} already-resolved.`);
	}

	// Step 4: Sort and write output
	const sorted = [...entries.values()].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	const SEPARATOR = '---------------------------------------------------------';
	let output = '';

	for (const entry of sorted) {
		output += '\n' + SEPARATOR + '\n\n';
		output += entry.name;
		if (entry.version) {
			output += ' ' + entry.version;
		}
		if (entry.license) {
			output += ' - ' + entry.license;
		}
		output += '\n';
		if (entry.url) {
			output += entry.url + '\n';
		}
		output += '\n';
		if (entry.licenseText) {
			output += entry.licenseText + '\n';
		}
	}

	output += '\n' + SEPARATOR + '\n';

	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	fs.writeFileSync(outputPath, output, 'utf8');

	// Write the presence index as a sibling file. A package counts as
	// "present but unlicensed" only if it was never resolved with a license
	// anywhere (filter out anything that later landed in `entries`).
	const presencePath = args['presence'] || (outputPath + '.presence.json');
	const presence = [...noLicenseSeen.entries()]
		.filter(([k]) => !entries.has(k))
		.map(([, v]) => ({ name: v.name, version: v.version }))
		.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
	fs.writeFileSync(presencePath, JSON.stringify(presence, null, '\t'), 'utf8');

	// Write the stub-override index as a sibling file. merge-notices.ts reads it
	// to let these cargo entries beat CG on `<name>@<version>` collision (CG
	// otherwise always wins). Mirrors the presence.json sibling pattern.
	const stubOverridePath = args['stuboverride'] || (outputPath + '.stuboverride.json');
	const stubOverrideList = [...stubOverrideKeys].sort();
	fs.writeFileSync(stubOverridePath, JSON.stringify(stubOverrideList, null, '\t'), 'utf8');

	// Write the unresolved index as a sibling file. These are packages the scanner
	// tried to resolve but produced NO row for. merge-notices.ts cross-checks this
	// against the final merged NOTICE so packages rescued downstream (e.g. a
	// cglicenses.json override) are excluded. Mirrors the presence.json sibling.
	const unresolvedPath = args['unresolved'] || (outputPath + '.unresolved.json');
	const unresolvedSorted = unresolved.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
	fs.writeFileSync(unresolvedPath, JSON.stringify(unresolvedSorted, null, '\t'), 'utf8');

	// Summary
	console.log('');
	console.log('=== License Scan Summary ===');
	console.log(`  Section 1 -- Extensions:`);
	console.log(`    Extensions scanned:        ${extensions.length}`);
	console.log(`    Packages found:            ${scanned}`);
	console.log(`    LICENSE found:             ${scanned - noLicense}`);
	console.log(`    NO LICENSE:                ${noLicense}`);
	console.log(`  Section 2 -- Root node_modules:`);
	console.log(`    Packages found:            ${rootScanned}`);
	console.log(`    LICENSE found:             ${rootScanned - rootNoLicense}`);
	console.log(`    NO LICENSE:                ${rootNoLicense}`);
	console.log(`  Section 3 -- cgmanifest.json:`);
	console.log(`    Files scanned:             ${cgManifestFiles.length}`);
	console.log(`    Entries with licenseDetail: ${cgManifestFound}`);
	console.log(`    Fetched from git repo:     ${cgManifestFetched}`);
	console.log(`    Fetch failed (no LICENSE): ${cgManifestFetchFailed}`);
	console.log(`    Skipped (CG already covers): ${cgManifestSkippedCgCovered}`);
	console.log(`    No detail, not fetchable:  ${cgManifestNoDetail}`);
	console.log(`  Section 4 -- Cargo.lock crates:`);
	console.log(`    Lock files scanned:        ${cargoLockFiles.length}`);
	console.log(`    Crates seen:               ${cargoCratesSeen}`);
	console.log(`    Workspace crates skipped:  ${cargoNoSource}`);
	console.log(`    git-source crates skipped: ${cargoGitSource}`);
	console.log(`    Skipped (already resolved): ${cargoSkippedAlready}`);
	console.log(`    Skipped (CG covers w/ text): ${cargoSkippedCgCovered}`);
	console.log(`    Added (coverage gap):      ${cargoFetched}`);
	console.log(`    Stub-overridden:           ${cargoStubOverride}`);
	console.log(`    crates.io API failed:      ${cargoApiFailed}`);
	console.log(`    Fetch failed (no LICENSE): ${cargoFetchFailed}`);
	console.log(`    AND-license incomplete:    ${cargoAndIncomplete}`);
	console.log(`  Section 5 - Platform binaries:`);
	console.log(`    Parent packages found:     ${pbParentsFound}`);
	console.log(`    Arch entries added:        ${pbAdded}`);
	console.log(`    Fetched from registry:     ${pbFetchedRegistry}`);
	console.log(`    Text from disk:            ${pbTextFromDisk}`);
	console.log(`    Text from repo:            ${pbTextFromRepo}`);
	console.log(`    Text from parent fallback: ${pbTextFromParent}`);
	console.log(`    No text (warned):          ${pbNoText}`);
	console.log(`    Skipped (already resolved): ${pbSkippedAlready}`);
	console.log(`    Skipped (CG covers):       ${pbSkippedCg}`);
	console.log(`    Skipped (not shipped):     ${pbSkippedNotShipped}`);
	console.log(`  Section 6 - OS-gated whole packages:`);
	console.log(`    Seeded into presence:      ${s6Seeded}`);
	console.log(`  Section 7 - Built-in extension deps:`);
	console.log(`    Built-in extensions:       ${s7ExtCount}`);
	console.log(`    Lockfiles found:           ${s7LockfilesFound} (${s7LockfilesFromDisk} disk, ${s7LockfilesFetched} self-fetched)`);
	console.log(`    Lockfiles missing:         ${s7MissingLockfiles.length}${s7MissingLockfiles.length ? ' (' + s7MissingLockfiles.join(', ') + ')' : ''}`);
	console.log(`    Uncovered deps resolved:   ${s7DepsEnumerated}`);
	console.log(`    Added (text from repo):    ${s7Added}`);
	console.log(`    Seeded into presence:      ${s7Seeded}`);
	console.log(`    Skipped (CG covers):       ${s7SkippedCg}`);
	console.log(`    Skipped (already resolved): ${s7SkippedAlready}`);
	console.log(`  Total entries in output:     ${entries.size}`);
	console.log(`  Output: ${outputPath}`);
	console.log(`  Presence index (present but unlicensed): ${presence.length}`);
	console.log(`  Presence output: ${presencePath}`);
	console.log(`  Unresolved (tried, no row created): ${unresolved.length}`);
	console.log(`  Stub-override index: ${stubOverrideList.length}`);
	console.log(`  Stub-override output: ${stubOverridePath}`);

	// Guard: any built-in extension whose lockfile could not be obtained from disk
	// OR self-fetch is a real coverage hole. Outputs are already written above so
	// the artifact still publishes; --strict-builtin-extensions turns this into a
	// hard failure. (The CI-vs-offline distinction for logging is handled inline
	// above via `inCI`; --strict is an explicit opt-in regardless of environment.)
	if (strictBuiltin && s7MissingLockfiles.length > 0) {
		console.error(`--strict-builtin-extensions: failing build -- ${s7MissingLockfiles.length} built-in extension lockfile(s) unobtainable (disk or self-fetch): ${s7MissingLockfiles.join(', ')}`);
		process.exit(1);
	}
}

// Only run main() when scan-licenses is the entry point -- not when a test or
// another module imports the exported helpers (mirrors parse-notices.ts).
if (/scan-licenses(\.[jt]s)?$/.test(process.argv[1] || '')) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
