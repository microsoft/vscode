/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SEA (Single Executable Application) entrypoint shim for the `sota` CLI.
 *
 * This file performs three jobs, in order, before delegating to the real
 * commander CLI in `./cli`:
 *
 *   1. **Trampoline mode** — when the binary is invoked as
 *      `sota --sota-run-node <script.js> [args...]`, we behave like a
 *      regular Node interpreter: load the script with the correct
 *      `__dirname` / `require` resolution and run it. This is how the
 *      vendored `claude` / `codex` launcher shims re-enter the SEA binary
 *      to execute their JavaScript bodies, because Node SEA binaries
 *      cannot otherwise be used as generic Node interpreters (the embedded
 *      blob always wins on a plain invocation — see the Node SEA docs).
 *
 *   2. **Prompt shim** — patch `fs.readFileSync` so any lookup ending in
 *      `prompts/<file>.prompt.md` is satisfied from the SEA-asset table
 *      instead of the missing on-disk directory. Used by
 *      `son-of-anton-core`'s prompt loader.
 *
 *   3. **Vendor extraction** — on first run for a given sota version,
 *      extract the embedded `vendor.tgz` asset (containing the upstream
 *      `claude` / `codex` CLIs with their platform-correct optional-dep
 *      binaries) into the per-user cache directory, then prepend
 *      `<cache>/node_modules/.bin/` to `PATH`. The existing
 *      `isClaudeCodeAvailable` / `isCodexAvailable` probes walk `PATH` so
 *      this is enough to make them discover the vendored copies.
 *
 * All three operations are no-ops when running outside SEA (e.g. during
 * `node dist/cli.js` development), so this file remains the esbuild
 * entrypoint for both the SEA bundle and any future non-SEA single-file
 * bundle.
 */

// We use `require` rather than `import` so we can mutate the `fs` module's
// `readFileSync` property below. ES module imports are immutable bindings
// and esbuild rightly refuses to compile an assignment to one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require('os') as typeof import('os');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const child_process = require('child_process') as typeof import('child_process');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module') as typeof import('module');

interface SeaApi {
	isSea?: () => boolean;
	getAsset: (key: string) => ArrayBuffer;
}

function loadSeaApi(): SeaApi | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const sea = require('node:sea') as SeaApi;
		if (sea && typeof sea.isSea === 'function' && sea.isSea()) {
			return sea;
		}
	} catch {
		// `node:sea` only exists inside SEA binaries. Outside, we're done.
	}
	return undefined;
}

const sea = loadSeaApi();

// ---------------------------------------------------------------------------
// 1. Trampoline mode
// ---------------------------------------------------------------------------

/**
 * If invoked as `<sota-binary> --sota-run-node <script.js> [args...]`, behave
 * like a regular `node <script>` invocation: synthesise a CommonJS context
 * for the script, expose the remaining argv as `process.argv`, and require()
 * the script. This is the re-entry point used by the vendored launcher
 * shims; without it the SEA binary always runs the embedded CLI blob.
 *
 * Note: we deliberately keep this *before* the prompt shim and the vendor
 * extraction. The launcher shims do not need either of those — they are
 * regular JS files with their own dependencies.
 */
/**
 * Detect trampoline mode early so we can branch the rest of seaEntry on it.
 *
 * Inside a SEA binary, `process.argv` is `[exePath, exePath, ...userArgs]`
 * — the executable path appears twice (per the Node SEA docs) because
 * there is no separate main-module script path. So the first user-supplied
 * argument lives at index 2. We require `--sota-run-node` to be in that
 * exact position so we don't accidentally trigger on a user command that
 * happens to mention the literal deeper in argv.
 *
 * (In a non-SEA invocation — `node dist/seaEntry.js …` — argv is
 * `[node, scriptPath, ...userArgs]` so argv[2] is the first user arg. We
 * never actually invoke seaEntry that way; the dev entrypoint is
 * `node dist/cli.js`. The check is still correct in both cases because
 * the launcher shims only ever pass the flag in the slot we expect.)
 */
function trampolineScript(): string | undefined {
	if (process.argv[2] !== '--sota-run-node') {
		return undefined;
	}
	const scriptPath = process.argv[3];
	if (!scriptPath) {
		process.stderr.write('sota: --sota-run-node requires a script path\n');
		process.exit(2);
	}
	return scriptPath;
}

/**
 * Load the trampolined script. We try synchronous `require()` first because
 * it produces the simplest stack traces — but a script that uses top-level
 * `await` (e.g. `@openai/codex`'s ESM bin file) requires asynchronous ESM
 * loading via `import()`. Fall back to that on ERR_REQUIRE_ASYNC_MODULE /
 * ERR_REQUIRE_ESM.
 */
async function runScriptInTrampoline(absoluteScript: string): Promise<void> {
	const scriptUrl = pathToFileUrl(absoluteScript);
	try {
		const requireFromScript = Module.createRequire(absoluteScript);
		requireFromScript(absoluteScript);
		return;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code !== 'ERR_REQUIRE_ASYNC_MODULE' && code !== 'ERR_REQUIRE_ESM') {
			process.stderr.write(`sota: trampoline failed for ${absoluteScript}: ${formatTrampolineError(err)}\n`);
			process.exit(1);
		}
	}
	try {
		// Dynamic `import()` accepts file URLs, which is the only shape that
		// works reliably on Windows (a bare path with drive letters fails
		// the URL parser). Indirected through `Function` so esbuild doesn't
		// try to bundle the dynamic spec.
		await (Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(scriptUrl);
	} catch (importErr) {
		process.stderr.write(`sota: trampoline failed for ${absoluteScript}: ${formatTrampolineError(importErr)}\n`);
		process.exit(1);
	}
}

function pathToFileUrl(p: string): string {
	// `require('url').pathToFileURL` is more robust than the WHATWG URL
	// constructor on Windows drive letters.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const url = require('url') as typeof import('url');
	return url.pathToFileURL(p).href;
}

function formatTrampolineError(err: unknown): string {
	return err instanceof Error ? err.stack ?? err.message : String(err);
}

const trampolineTarget = trampolineScript();
if (trampolineTarget !== undefined) {
	const absoluteScript = path.resolve(trampolineTarget);
	// argv layout coming in (SEA-style):
	//   [sotaBin, sotaBin, '--sota-run-node', script, ...userArgs]
	// argv layout we want for the trampolined script (Node-style):
	//   [sotaBin, scriptAbsPath, ...userArgs]
	const trailing = process.argv.slice(4);
	const originalArgv0 = process.argv[0];
	process.argv = [originalArgv0, absoluteScript, ...trailing];
	// We *don't* run the prompt-asset shim or vendor extraction here: the
	// trampolined script is just a regular JS file with its own module
	// graph that has nothing to do with sota's CLI.
	runScriptInTrampoline(absoluteScript).then(
		() => { /* loaded script controls process; let event loop drain. */ },
		(err: unknown) => {
			process.stderr.write(`sota: trampoline error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
			process.exit(1);
		},
	);
} else {
	runSotaCli();
}

function runSotaCli(): void {
	installSeaPromptShim();
	ensureVendorExtracted();
	prependVendorBinToPath();
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require('./cli');
}

// ---------------------------------------------------------------------------
// 2. Prompt-asset shim
// ---------------------------------------------------------------------------

function installSeaPromptShim(): void {
	if (!sea) {
		return;
	}

	const originalReadFileSync = fs.readFileSync.bind(fs);
	const decoded = new Map<string, string>();
	const decoder = new TextDecoder('utf-8');

	const readPromptAsset = (filename: string, encoding: BufferEncoding | null | undefined): string | Buffer => {
		let value = decoded.get(filename);
		if (value === undefined) {
			const buf = sea.getAsset(filename);
			value = decoder.decode(new Uint8Array(buf));
			decoded.set(filename, value);
		}
		if (encoding === undefined || encoding === null) {
			return Buffer.from(value, 'utf8');
		}
		return value;
	};

	const patched = ((target: import('fs').PathOrFileDescriptor, options?: { encoding?: BufferEncoding | null | undefined; flag?: string } | BufferEncoding | null) => {
		try {
			const asString = typeof target === 'string'
				? target
				: typeof target === 'object' && target !== null && 'toString' in target
					? String(target)
					: '';
			// Match anything that looks like `<…>/prompts/<name>.prompt.md`,
			// regardless of platform separator. The asset key we ship in
			// sea-config.json is just the bare filename.
			const match = asString.match(/[\\\/]prompts[\\\/]([^\\\/]+\.prompt\.md)$/);
			if (match) {
				const filename = match[1];
				const encoding = typeof options === 'string'
					? options
					: options && typeof options === 'object' && 'encoding' in options
						? (options.encoding ?? undefined)
						: undefined;
				return readPromptAsset(filename, encoding);
			}
		} catch {
			// Fall through to the original on any patch failure — better to
			// surface the underlying ENOENT than to mask it with a patch bug.
		}
		return originalReadFileSync(target, options as Parameters<typeof originalReadFileSync>[1]);
	}) as typeof fs.readFileSync;

	(fs as { readFileSync: typeof fs.readFileSync }).readFileSync = patched;
}

// ---------------------------------------------------------------------------
// 3. Vendor extraction
// ---------------------------------------------------------------------------

/**
 * Resolve the version pinned in `son-of-anton-cli/package.json`. esbuild
 * inlines the JSON import at bundle time, so the version is baked in at
 * build time rather than read from disk at runtime — there's no real
 * package.json next to the SEA executable.
 *
 * We resolve lazily on first use so initialisation order with the
 * dispatcher above doesn't matter.
 */
let cachedSotaVersion: string | undefined;
function getSotaVersion(): string {
	if (cachedSotaVersion === undefined) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const pj = require('../package.json') as { version?: string };
			cachedSotaVersion = pj?.version ?? '0.0.0-dev';
		} catch {
			cachedSotaVersion = '0.0.0-dev';
		}
	}
	return cachedSotaVersion;
}

function vendorCacheRoot(): string {
	return path.join(os.homedir(), '.sota', 'cache', getSotaVersion());
}

function vendorBinDir(): string {
	return path.join(vendorCacheRoot(), 'node_modules', '.bin');
}

/**
 * Extract `vendor.tgz` into `~/.sota/cache/<sota-version>/` on first run. We
 * use a sibling temp directory + atomic rename so a concurrent extraction
 * (e.g. two `sota` invocations racing) doesn't leave a half-written tree
 * that the survivor would then trust.
 *
 * The system `tar` binary is available on macOS, Linux, and Windows 10+
 * (which ships bsdtar at C:\Windows\System32\tar.exe). We rely on that
 * instead of pulling in a Node `tar` library that would inflate the SEA
 * blob unnecessarily.
 */
function ensureVendorExtracted(): boolean {
	if (!sea) {
		return false;
	}
	const cacheRoot = vendorCacheRoot();
	const sentinel = path.join(cacheRoot, '.extracted');
	if (fs.existsSync(sentinel)) {
		return true;
	}
	let archive: ArrayBuffer;
	try {
		archive = sea.getAsset('vendor.tgz');
	} catch {
		// Older builds may not have vendor.tgz — that's fine, the user's
		// PATH might still have a system-installed claude/codex.
		return false;
	}
	const tmpDir = path.join(os.tmpdir(), `sota-vendor-${process.pid}-${Date.now()}`);
	const tmpArchive = path.join(tmpDir, 'vendor.tgz');
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(tmpArchive, Buffer.from(archive));
	const stage = path.join(tmpDir, 'stage');
	fs.mkdirSync(stage, { recursive: true });
	const tarBin = process.platform === 'win32' ? 'tar.exe' : 'tar';
	const result = child_process.spawnSync(tarBin, ['-xzf', tmpArchive, '-C', stage], { stdio: 'pipe' });
	if (result.status !== 0) {
		process.stderr.write(`sota: failed to extract vendor.tgz (${tarBin}): ${result.stderr?.toString() ?? ''}\n`);
		return false;
	}
	// Move the staged tree into the final cache location atomically. On
	// races, only one process wins; the others surface the survivor's tree
	// via the sentinel check above.
	fs.mkdirSync(path.dirname(cacheRoot), { recursive: true });
	try {
		fs.renameSync(stage, cacheRoot);
	} catch (err) {
		if (fs.existsSync(cacheRoot)) {
			// Another process won the race; clean our staging and trust theirs.
			fs.rmSync(stage, { recursive: true, force: true });
		} else {
			process.stderr.write(`sota: failed to install vendor cache at ${cacheRoot}: ${String(err)}\n`);
			fs.rmSync(tmpDir, { recursive: true, force: true });
			return false;
		}
	}
	patchShimsToCurrentBinary(vendorBinDir());
	try {
		fs.writeFileSync(sentinel, new Date().toISOString());
	} catch {
		// Sentinel is best-effort; the next run will just re-extract.
	}
	fs.rmSync(tmpDir, { recursive: true, force: true });
	return true;
}

/**
 * Rewrite the `__SOTA_BIN__` placeholder in each vendored shim with the
 * absolute path of the running SEA binary. We do this at extraction time
 * (rather than at build time) because the build-time `dist-bundle/sota`
 * path is unlikely to be the user's install location.
 */
function patchShimsToCurrentBinary(binDir: string): void {
	if (!fs.existsSync(binDir)) {
		return;
	}
	const replacement = process.execPath;
	for (const entry of fs.readdirSync(binDir)) {
		const full = path.join(binDir, entry);
		let stat;
		try {
			stat = fs.lstatSync(full);
		} catch {
			continue;
		}
		if (!stat.isFile()) {
			continue;
		}
		let body: string;
		try {
			body = fs.readFileSync(full, 'utf8');
		} catch {
			continue;
		}
		if (!body.includes('__SOTA_BIN__')) {
			continue;
		}
		// `process.execPath` on Windows already uses backslashes; CMD's
		// double-quoted strings treat them literally, so we don't need any
		// extra escaping. On POSIX the value is forward-slash-only.
		fs.writeFileSync(full, body.split('__SOTA_BIN__').join(replacement));
	}
}

function prependVendorBinToPath(): void {
	if (!sea) {
		return;
	}
	const binDir = vendorBinDir();
	if (!fs.existsSync(binDir)) {
		return;
	}
	const currentPath = process.env.PATH ?? '';
	const parts = currentPath.split(path.delimiter).filter(Boolean);
	if (parts[0] === binDir) {
		return; // already in front
	}
	process.env.PATH = [binDir, ...parts.filter(p => p !== binDir)].join(path.delimiter);
}
