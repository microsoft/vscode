/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the per-platform dictation-runtime build pipeline. Called
 * from `package.ts`, `upload.ts`, and `produce.ts`, plus the gulpfiles'
 * `packageTask` (via `readDictationRuntimeResults`) so each VS Code build can
 * stamp its own `product.dictationRuntime` into the per-platform `product.json`
 * at packaging time.
 *
 * This mirrors `build/agent-sdk/` but for the Foundry Local native runtime used
 * by on-device dictation: a prebuilt N-API addon (`foundry_local_napi.node`)
 * plus the Foundry Local Core / onnxruntime / onnxruntime-genai shared
 * libraries. Rather than downloading those from npm + NuGet at runtime, each
 * platform build job produces its own tarball and uploads it to
 * `main.vscode-cdn.net`; the runtime downloads the single content-addressed
 * tarball for its target (see `foundryLocalRuntime.ts`).
 *
 * There is exactly ONE runtime (unlike the multi-SDK agent-sdk pipeline), so
 * `product.dictationRuntime` is a single `{version, urlTemplate}` object rather
 * than a map keyed by id. The version is the pinned `foundry-local-sdk`
 * dependency in the repo-root `package.json` — the same package the runtime
 * loads — so the shipped types and the CDN payload stay in lockstep.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root `package.json`, the source of truth for the pinned SDK version. */
const ROOT_PACKAGE_JSON = path.join(THIS_DIR, '..', '..', 'package.json');

/** The npm package whose native payload we republish to the CDN. */
export const SDK_PACKAGE_NAME = 'foundry-local-sdk';

/**
 * Path segment under the CDN URL and the conceptual id of the runtime. Kept as a
 * named constant (rather than inlined) so the blob layout, the url builders, and
 * `upload.ts`'s filename parsing agree on one string.
 */
export const RUNTIME_ID = 'foundry-local';

interface IRootPackageJson {
	readonly dependencies?: Readonly<Record<string, string>>;
}

let _versionCache: string | undefined;

/**
 * The exact pinned `foundry-local-sdk` version from the repo-root
 * `package.json`. Rejects `^`/`~` ranges — a range would let the build resolve
 * a different version than the runtime types were compiled against, and the
 * content-addressed CDN upload would then diverge across runs.
 */
export function getRuntimeVersion(): string {
	if (_versionCache) {
		return _versionCache;
	}
	const json = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, 'utf8')) as IRootPackageJson;
	const version = json.dependencies?.[SDK_PACKAGE_NAME];
	if (!version) {
		throw new Error(`Expected a '${SDK_PACKAGE_NAME}' entry in ${ROOT_PACKAGE_JSON} dependencies.`);
	}
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		throw new Error(`Refusing to use ${SDK_PACKAGE_NAME}@${version} from ${ROOT_PACKAGE_JSON}: must be an exact version (no ^ or ~ ranges).`);
	}
	_versionCache = version;
	return version;
}

/** Strict subset of VS Code build platforms the dictation runtime can target. */
export type VscodeBuildPlatform = 'darwin' | 'linux' | 'win32';

/** Runtime whitelist mirroring `VscodeBuildPlatform`, for CLI guards. */
export const KNOWN_VSCODE_PLATFORMS: ReadonlySet<string> = new Set<VscodeBuildPlatform>([
	'darwin', 'linux', 'win32',
]);

/**
 * The set of `<platform>-<arch>` targets Foundry Local ships a native runtime
 * for. Mirrors `FOUNDRY_LOCAL_SUPPORTED_PLATFORMS` in
 * `src/vs/platform/localTranscription/node/foundryLocalRuntime.ts` and the
 * `SUPPORTED_TARGETS` runtime gate — keep the three in sync.
 */
export const SUPPORTED_TARGETS: ReadonlySet<string> = new Set([
	'darwin-arm64',
	'linux-x64',
	'linux-arm64',
	'win32-x64',
	'win32-arm64',
]);

/**
 * Resolves the runtime target for a particular VS Code build, or `undefined`
 * when that `(platform, arch)` has no Foundry Local runtime (e.g. `darwin-x64`,
 * Alpine/musl, armhf, web). The macOS build is Universal but Foundry Local only
 * ships `darwin-arm64`, so `darwin-x64` returns `undefined` — the runtime gate
 * reports on-device dictation unsupported there and never downloads.
 *
 * The legacy Alpine x64 encoding (`{platform: 'linux', arch: 'alpine'}`) and any
 * real `alpine` platform return `undefined`: the core libraries are glibc-linked.
 */
export function getRuntimeTargetForBuild(vscodePlatform: string, arch: string): string | undefined {
	if (vscodePlatform === 'alpine' || arch === 'alpine' || arch === 'musl') {
		return undefined;
	}
	const target = `${vscodePlatform}-${arch}`;
	return SUPPORTED_TARGETS.has(target) ? target : undefined;
}

/**
 * Whether a given VS Code build should stamp `product.dictationRuntime`, EVEN IF
 * this build's own `(platform, arch)` has no CDN payload of its own.
 *
 * The stamp — `{version, urlTemplate}` — is target-agnostic (the `{target}`
 * placeholder is resolved by the runtime per launch), so it must be present on
 * every product whose app can host on-device dictation, whether or not this
 * particular job produced/uploaded the payload:
 *
 *   - `darwin-x64`: the macOS app is Universal. Its x64 and arm64 slices are
 *     merged into one bundle whose single `product.json` must carry the runtime
 *     config so dictation works when the Universal app runs natively on Apple
 *     Silicon — even though only the `darwin-arm64` job builds/uploads the
 *     payload. So `darwin-x64` stamps but does not produce.
 *   - non-publish product builds: packaging always strips the SDK's native
 *     payload (`getFoundryLocalExcludeFilter` in `gulpfile.vscode.ts`), so a
 *     packaged build with no stamp would have NEITHER a CDN location NOR a
 *     `node_modules` fallback. Stamping regardless of `VSCODE_PUBLISH` gives the
 *     packaged app a usable CDN source; the payload for that version is uploaded
 *     (idempotently) by publish runs. Only local dev-from-source (which never
 *     runs `produce.ts`) keeps the `node_modules` payload.
 *
 * Returns `false` for platforms/arches that can never host dictation (armhf,
 * Alpine/musl, web) so their `product.json` stays clean.
 */
export function shouldStampRuntime(vscodePlatform: string, arch: string): boolean {
	if (getRuntimeTargetForBuild(vscodePlatform, arch)) {
		return true;
	}
	// The Universal macOS x64 slice must match its arm64 sibling's stamp.
	return vscodePlatform === 'darwin' && arch === 'x64';
}

/**
 * The CDN URL `product.dictationRuntime.urlTemplate` resolves to for a concrete
 * target. Content-addressed under
 * `dictation-runtime/<RUNTIME_ID>/<version>/<target>.tgz`. Matches the upload
 * path written by `upload.ts`.
 */
export function buildCdnUrl(version: string, target: string): string {
	return `https://main.vscode-cdn.net/dictation-runtime/${RUNTIME_ID}/${version}/${target}.tgz`;
}

/**
 * The `format2`-style URL template stamped into
 * `product.dictationRuntime.urlTemplate`. The runtime substitutes `{target}`
 * per launch via `foundryLocalPlatformKey()`; every platform job emits the same
 * template so a macOS Universal bundle can share one `product.json`.
 */
export function buildCdnUrlTemplate(version: string): string {
	return `https://main.vscode-cdn.net/dictation-runtime/${RUNTIME_ID}/${version}/{target}.tgz`;
}

/** Streams `filePath` into a sha256 hasher without buffering the whole file. */
export function sha256OfFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

/** Parses `--key=value` CLI flags into a Map. */
export function parseFlags(argv: readonly string[]): Map<string, string> {
	const flags = new Map<string, string>();
	for (const arg of argv) {
		const m = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
		if (m) {
			flags.set(m[1], m[2]);
		}
	}
	return flags;
}

/**
 * The `product.dictationRuntime` entry, written by `produce.ts` and read by the
 * gulpfiles' `packageTask`. Shape matches `IDictationRuntimeProductConfig` in
 * `src/vs/base/common/product.ts`.
 */
export interface IDictationRuntimeResult {
	readonly version: string;
	readonly urlTemplate: string;
}

/**
 * Reads the per-platform dictation-runtime results file written by `produce.ts`.
 * Returns `undefined` when `DICTATION_RUNTIME_RESULTS_FILE` is unset, the file
 * doesn't exist, or the build can't host dictation. In a pipeline build that CAN
 * host dictation this is always present (publish or not); it is absent for local
 * dev-from-source (which never runs `produce.ts`) — that path ships product.json
 * without `dictationRuntime` and the runtime falls back to the SDK's own
 * `node_modules` payload.
 */
export function readDictationRuntimeResults(): IDictationRuntimeResult | undefined {
	const filePath = process.env.DICTATION_RUNTIME_RESULTS_FILE;
	if (!filePath || !fs.existsSync(filePath)) {
		return undefined;
	}
	const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`DICTATION_RUNTIME_RESULTS_FILE at ${filePath} is not a JSON object`);
	}
	const result = parsed as Partial<IDictationRuntimeResult>;
	if (typeof result.version !== 'string' || typeof result.urlTemplate !== 'string') {
		return undefined;
	}
	return { version: result.version, urlTemplate: result.urlTemplate };
}
