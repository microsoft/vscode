/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the per-platform agent SDK build pipeline (`package.ts`,
 * `upload.ts`, `drift-check.ts`). Called from those scripts and from the
 * gulpfiles' `packageTask` so each VS Code build can stamp its own
 * `product.agentSdks.<sdk>` into the per-platform `product.json` at
 * packaging time.
 *
 * The pipeline DOES NOT keep a parallel list of supported targets. The single
 * source of truth is the SDK's own `package.json` `optionalDependencies`
 * (e.g. `@anthropic-ai/claude-agent-sdk-darwin-arm64`), looked up via
 * `getSdkTargetForBuild()` for a `(vscodePlatform, arch, sdk)` triple.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** SDKs distributed by `build/agent-sdk/`. */
export type Sdk = 'claude' | 'codex';

/** All SDKs the pipeline knows about. Used by gulpfile iteration. */
export const SDKS: readonly Sdk[] = ['claude', 'codex'];

/** The npm registry package each SDK is published under. */
export const PACKAGE_NAME: { readonly [K in Sdk]: string } = {
	claude: '@anthropic-ai/claude-agent-sdk',
	codex: '@openai/codex',
};

/** Strict subset of VS Code build platforms — the SDK pipeline only knows
 *  about platforms it can target. `web` is excluded (no SDK on web). */
export type VscodeBuildPlatform = 'darwin' | 'linux' | 'alpine' | 'win32';

/** Runtime whitelist mirroring `VscodeBuildPlatform`. Used by CLI guards so
 *  a typo like `--vscode-platform=lnux` fails loud instead of silently
 *  emitting an empty results file. */
export const KNOWN_VSCODE_PLATFORMS: ReadonlySet<VscodeBuildPlatform> = new Set([
	'darwin', 'linux', 'alpine', 'win32',
]);

/** Strict subset of architectures. `armhf` is excluded — no SDK ships armhf. */
export type VscodeBuildArch = 'x64' | 'arm64';

/**
 * Resolves the SDK's npm `optionalDependencies` suffix for a particular VS
 * Code build. Returns undefined when the VS Code build's `(platform, arch)`
 * has no compatible SDK (e.g. armhf, web, any combination we don't ship).
 *
 * - Claude ships `linux-{x64,arm64}-musl` packages separately from the glibc
 *   variants. Alpine REH builds get the `-musl` variant; regular Linux gets
 *   the plain `linux-*`.
 * - Codex's Linux binaries are statically musl-linked and ship under a
 *   single `linux-*` SKU that runs on both glibc and musl hosts. Alpine
 *   REH gets the same `linux-*` package as regular Linux.
 *
 * REH uses two encodings for Alpine x64: the modern `{platform: 'alpine',
 * arch: 'x64'}` and the legacy `{platform: 'linux', arch: 'alpine'}`. Both
 * are accepted.
 */
export function getSdkTargetForBuild(
	vscodePlatform: string,
	arch: string,
	sdk: Sdk,
): string | undefined {
	// Normalize the legacy Alpine x64 encoding into the modern one.
	if (vscodePlatform === 'linux' && arch === 'alpine') {
		vscodePlatform = 'alpine';
		arch = 'x64';
	}
	if (arch !== 'x64' && arch !== 'arm64') {
		return undefined;
	}
	switch (vscodePlatform) {
		case 'darwin': return `darwin-${arch}`;
		case 'win32': return `win32-${arch}`;
		case 'linux': return `linux-${arch}`;
		case 'alpine':
			return sdk === 'claude' ? `linux-${arch}-musl` : `linux-${arch}`;
		default:
			return undefined;
	}
}

/**
 * Resolves the pinned SDK version from the repo-root `package.json` devDeps.
 * Bumping the devDep is the entire "land a new SDK" workflow.
 *
 * Both SDKs MUST be pinned to exact versions (no `^` or `~` ranges) in
 * `package.json`. Ranges would let `npm install` resolve different versions
 * across runs, breaking the "this build is reproducible given the same
 * inputs" contract that the CDN's HEAD-then-fail upload depends on.
 */
export function getSdkVersion(sdk: Sdk): string {
	const thisDir = path.dirname(fileURLToPath(import.meta.url));
	const packageJsonPath = path.resolve(thisDir, '..', '..', 'package.json');
	const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
		devDependencies?: Record<string, string>;
	};
	const version = json.devDependencies?.[PACKAGE_NAME[sdk]];
	if (!version) {
		throw new Error(`Cannot resolve ${sdk} SDK version: ${PACKAGE_NAME[sdk]} is not in repo-root package.json devDependencies`);
	}
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		throw new Error(`Refusing to use ${PACKAGE_NAME[sdk]}@${version} from package.json: must be an exact version (no ^ or ~ ranges)`);
	}
	return version;
}

/**
 * Builds the CDN URL the per-platform `product.agentSdks.<sdk>.url` points at.
 * Content-addressed under `agent-sdk/<sdk>/<version>/<target>.tgz`. Matches
 * the upload path written by `upload.ts`.
 */
export function buildCdnUrl(sdk: Sdk, sdkVersion: string, sdkTarget: string): string {
	return `https://main.vscode-cdn.net/agent-sdk/${sdk}/${sdkVersion}/${sdkTarget}.tgz`;
}

/** Streams `filePath` into a sha256 hasher. Avoids reading the whole file
 *  into memory — agent SDK tarballs are 50-100MB. */
export function sha256OfFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

/** Parses `--key=value` CLI flags into a Map. Shared by the script-mode
 *  entry points in `package.ts`, `upload.ts`, and `produce.ts`. */
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
 * Per-SDK product.json entry, written by `produce.ts` and read by the
 * gulpfiles' `packageTask`. Shape matches `IAgentSdkProductConfig` in
 * `src/vs/base/common/product.ts` so the values can be dropped straight
 * into `product.agentSdks`.
 */
export interface IAgentSdkResults {
	[packageId: string]: {
		readonly version: string;
		readonly url: string;
		readonly sha256: string;
	};
}

/**
 * Reads the per-platform agent-SDK results file written by `produce.ts`.
 * Returns `{}` when `AGENT_SDK_RESULTS_FILE` is unset or the file doesn't
 * exist — that's the local-dev path (no agent SDKs produced, ship
 * product.json without `agentSdks`, providers don't register).
 */
export function readAgentSdkResults(): IAgentSdkResults {
	const filePath = process.env.AGENT_SDK_RESULTS_FILE;
	if (!filePath || !fs.existsSync(filePath)) {
		return {};
	}
	const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`AGENT_SDK_RESULTS_FILE at ${filePath} is not a JSON object`);
	}
	return parsed as IAgentSdkResults;
}
