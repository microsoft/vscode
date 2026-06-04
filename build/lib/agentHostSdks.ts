/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { ZipFile } from 'yazl';
import { createWriteStream } from 'fs';

/**
 * Shared build-time logic for packaging the agent host SDKs (Codex / Claude)
 * into version-keyed, per-platform `.zip` assets that are published to the
 * download CDN and fetched on demand at runtime.
 *
 * The same packaging code is used by the `update-agent-host-sdks` maintainer
 * script (to compute and pin `{file, sha256}` into `product.json`) and by the
 * CI publish stage (to produce byte-identical archives that match the pin).
 *
 * See `src/vs/platform/agentHost/AGENT_HOST_SDK_DELIVERY_PLAN.md`.
 */

export type AgentHostSdkId = 'codex' | 'claude';

/** npm package each SDK is sourced from (matches the `package.json` devDependency). */
export const AGENT_HOST_SDK_PACKAGES: Record<AgentHostSdkId, string> = {
	codex: '@openai/codex',
	claude: '@anthropic-ai/claude-agent-sdk',
};

export interface IAgentHostSdkTarget {
	/** {@link TargetPlatform}-style key used in `product.json` and at runtime. */
	readonly platform: string;
	/** Value passed to `npm install --os`. */
	readonly npmOs: 'darwin' | 'linux' | 'win32';
	/** Value passed to `npm install --cpu`. */
	readonly npmCpu: 'x64' | 'arm64' | 'arm';
	/** Value passed to `npm install --libc` (musl for Alpine). */
	readonly npmLibc?: 'musl' | 'glibc';
}

/**
 * All targets we publish an SDK asset for. macOS `universal` is intentionally
 * absent: the universal app resolves `darwin-x64`/`darwin-arm64` from the
 * running machine's `process.arch` at runtime.
 */
export const AGENT_HOST_SDK_TARGETS: readonly IAgentHostSdkTarget[] = [
	{ platform: 'darwin-x64', npmOs: 'darwin', npmCpu: 'x64' },
	{ platform: 'darwin-arm64', npmOs: 'darwin', npmCpu: 'arm64' },
	{ platform: 'linux-x64', npmOs: 'linux', npmCpu: 'x64', npmLibc: 'glibc' },
	{ platform: 'linux-arm64', npmOs: 'linux', npmCpu: 'arm64', npmLibc: 'glibc' },
	{ platform: 'linux-armhf', npmOs: 'linux', npmCpu: 'arm', npmLibc: 'glibc' },
	{ platform: 'alpine-x64', npmOs: 'linux', npmCpu: 'x64', npmLibc: 'musl' },
	{ platform: 'alpine-arm64', npmOs: 'linux', npmCpu: 'arm64', npmLibc: 'musl' },
	{ platform: 'win32-x64', npmOs: 'win32', npmCpu: 'x64' },
	{ platform: 'win32-arm64', npmOs: 'win32', npmCpu: 'arm64' },
];

export interface IAgentHostSdkAsset {
	readonly file: string;
	readonly sha256: string;
}

export interface IAgentHostSdkPin {
	readonly version: string;
	readonly platforms: Record<string, IAgentHostSdkAsset>;
}

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export function readPackageJson(): { devDependencies: Record<string, string> } {
	return JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
}

export function productJsonPath(): string {
	return path.join(repoRoot, 'product.json');
}

export function readProductSdks(): Record<AgentHostSdkId, IAgentHostSdkPin | undefined> {
	const product = JSON.parse(readFileSync(productJsonPath(), 'utf8'));
	return (product.agentHostSdks ?? {}) as Record<AgentHostSdkId, IAgentHostSdkPin | undefined>;
}

/** The pinned (devDependency) version, with any leading range specifier stripped. */
export function pinnedDevDependencyVersion(sdk: AgentHostSdkId): string {
	const spec = readPackageJson().devDependencies[AGENT_HOST_SDK_PACKAGES[sdk]];
	if (!spec) {
		throw new Error(`Missing devDependency '${AGENT_HOST_SDK_PACKAGES[sdk]}' in package.json`);
	}
	return spec.replace(/^[\^~]/, '');
}

/**
 * Offline guardrail: assert the `package.json` devDependency version equals the
 * `product.json` pin for each SDK. Returns a list of human-readable problems
 * (empty when consistent).
 */
export function checkVersionsPinnedEqual(): string[] {
	const problems: string[] = [];
	const productSdks = readProductSdks();
	for (const sdk of Object.keys(AGENT_HOST_SDK_PACKAGES) as AgentHostSdkId[]) {
		const devVersion = pinnedDevDependencyVersion(sdk);
		const pin = productSdks[sdk];
		if (!pin) {
			problems.push(`product.json is missing agentHostSdks.${sdk}`);
			continue;
		}
		if (pin.version !== devVersion) {
			problems.push(`Version skew for '${sdk}': package.json devDependency is ${devVersion} but product.json pin is ${pin.version}. Keep them equal (update both, then run 'npm run update-agent-host-sdks').`);
		}
	}
	return problems;
}

export function assetFileName(sdk: AgentHostSdkId, target: IAgentHostSdkTarget, version: string): string {
	return `agent-host-sdk-${sdk}-${target.platform}-${version}.zip`;
}

/**
 * Fetches the pinned SDK for a single target into `<destDir>/node_modules`,
 * downloading only the prebuilt leaf packages for that os/arch. Returns the
 * `node_modules` root.
 */
export function fetchSdkForTarget(sdk: AgentHostSdkId, version: string, target: IAgentHostSdkTarget, destDir: string): string {
	mkdirSync(destDir, { recursive: true });
	const args = [
		'install', `${AGENT_HOST_SDK_PACKAGES[sdk]}@${version}`,
		'--prefix', destDir,
		'--no-save', '--no-package-lock', '--ignore-scripts',
		'--os', target.npmOs,
		'--cpu', target.npmCpu,
	];
	if (target.npmLibc) {
		args.push('--libc', target.npmLibc);
	}
	execFileSync('npm', args, { stdio: 'inherit' });
	return path.join(destDir, 'node_modules');
}

/** Locates the on-disk codex native executable inside a fetched bundle. */
function findCodexExecutable(nodeModulesDir: string, target: IAgentHostSdkTarget): string {
	const binaryName = target.npmOs === 'win32' ? 'codex.exe' : 'codex';
	const found = findFile(nodeModulesDir, binaryName, dir => path.basename(dir).startsWith('@openai'));
	if (!found) {
		throw new Error(`Could not locate '${binaryName}' in fetched codex bundle for ${target.platform}`);
	}
	return found;
}

function findFile(root: string, name: string, dirFilter?: (dir: string) => boolean): string | undefined {
	const stack = [root];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			let isDir = false;
			try {
				isDir = statSync(full).isDirectory();
			} catch {
				continue;
			}
			if (isDir) {
				if (!dirFilter || dirFilter(full) || dir === root || full.includes(`${path.sep}@`) || full.includes('codex')) {
					stack.push(full);
				}
			} else if (entry === name) {
				return full;
			}
		}
	}
	return undefined;
}

/**
 * Packages a fetched bundle into a deterministic `.zip` plus its bundle
 * manifest, and returns the asset descriptor. The archive preserves the
 * `node_modules` subtree so module resolution works at runtime.
 */
export async function packageSdkBundle(sdk: AgentHostSdkId, version: string, target: IAgentHostSdkTarget, nodeModulesDir: string, outDir: string): Promise<IAgentHostSdkAsset> {
	mkdirSync(outDir, { recursive: true });
	const file = assetFileName(sdk, target, version);
	const outPath = path.join(outDir, file);

	// Build the manifest entry path (bundle-relative, posix separators).
	let manifest: Record<string, string>;
	if (sdk === 'codex') {
		const exec = findCodexExecutable(nodeModulesDir, target);
		const rel = path.relative(path.dirname(nodeModulesDir), exec);
		manifest = { kind: 'codex', version, exec: toPosix(rel) };
	} else {
		manifest = { kind: 'claude', version, packageRoot: 'node_modules/@anthropic-ai/claude-agent-sdk' };
	}

	const zip = new ZipFile();
	addDirDeterministic(zip, nodeModulesDir, 'node_modules');
	zip.addBuffer(Buffer.from(JSON.stringify(manifest), 'utf8'), 'agent-host-sdk.json', { mtime: FIXED_MTIME, mode: 0o644 });
	await finalizeZip(zip, outPath);

	return { file, sha256: sha256OfFile(outPath) };
}

const FIXED_MTIME = new Date(0);

/** Strip patterns that never affect runtime behaviour, to shrink the asset. */
const STRIP = [/\.map$/, /\.d\.ts$/, /\.md$/i, /(^|\/)(test|tests|__tests__|docs?)(\/|$)/i];

function addDirDeterministic(zip: ZipFile, dir: string, zipPathPrefix: string): void {
	for (const entry of readdirSync(dir).sort()) {
		const full = path.join(dir, entry);
		const zipPath = `${zipPathPrefix}/${entry}`;
		const stat = statSync(full);
		if (stat.isDirectory()) {
			addDirDeterministic(zip, full, zipPath);
		} else {
			if (STRIP.some(re => re.test(toPosix(zipPath)))) {
				continue;
			}
			const mode = (stat.mode & 0o111) ? 0o755 : 0o644;
			zip.addFile(full, zipPath, { mtime: FIXED_MTIME, mode });
		}
	}
}

function finalizeZip(zip: ZipFile, outPath: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const stream = createWriteStream(outPath);
		zip.outputStream.pipe(stream);
		zip.outputStream.once('error', reject);
		stream.once('error', reject);
		stream.once('finish', () => resolve());
		zip.end();
	});
}

export function sha256OfFile(file: string): string {
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function toPosix(p: string): string {
	return p.split(path.sep).join('/');
}

export function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
	const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	try {
		return fn(dir);
	} finally {
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
}
