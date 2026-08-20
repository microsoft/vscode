/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fetches the Foundry Local native core libraries (Foundry Local Core +
 * onnxruntime + onnxruntime-genai) from NuGet for an EXPLICIT RID, so a single
 * build agent can assemble a tarball for any target regardless of its own
 * `process.platform`/`process.arch`.
 *
 * This is a deliberate re-implementation of the download/extract loop in
 * `foundry-local-sdk`'s `script/install-utils.cjs`, whose `runInstall` derives
 * the RID from the RUNNING host (`os.platform()`/`os.arch()`) at module load and
 * exposes no override. VS Code's ARM64 desktop builds run on x64 pools, so the
 * host-locked installer can never produce the `linux-arm64`/`win32-arm64`
 * tarballs; extracting `runtimes/<rid>/native/*` from the same `.nupkg` files
 * for an explicit RID is host-independent and fixes that.
 *
 * Only the "standard" artifact set is supported (the three packages selected by
 * `package.ts`); the SDK installer's WinML override / `includeFiles` /
 * `removeFiles` paths are intentionally not ported.
 */

import { createRequire } from 'module';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { SDK_PACKAGE_NAME } from './common.ts';

const SCRIPT = 'nuget.ts';
const VSCODE_FEED_PREFIX = 'https://pkgs.dev.azure.com/monacotools/';
const VSS_NUGET_ACCESSTOKEN = 'VSS_NUGET_ACCESSTOKEN';
export const VSCODE_NUGET_FEED = 'https://pkgs.dev.azure.com/monacotools/Monaco/_packaging/vscode/nuget/v3/index.json';

/**
 * `adm-zip`, resolved through `foundry-local-sdk`'s own dependency tree (it is a
 * dependency of the SDK), so we don't add a new build dependency just to unzip
 * `.nupkg` archives.
 */
function loadAdmZip(): any {
	const sdkRequire = createRequire(import.meta.url);
	const fromSdk = createRequire(sdkRequire.resolve(`${SDK_PACKAGE_NAME}/package.json`));
	return fromSdk('adm-zip');
}

/** The authenticated VS Code NuGet feed used for native runtime packages. */
const FEEDS: readonly string[] = [
	VSCODE_NUGET_FEED,
];

function getRequestOptions(url: string): https.RequestOptions {
	if (!url.startsWith(VSCODE_FEED_PREFIX)) {
		return {};
	}
	const token = process.env[VSS_NUGET_ACCESSTOKEN];
	if (!token) {
		throw new Error(`${VSS_NUGET_ACCESSTOKEN} is required to access the VS Code NuGet feed.`);
	}
	return {
		headers: {
			Authorization: `Basic ${Buffer.from(`vscode:${token}`).toString('base64')}`,
		},
	};
}

/** The NuGet Runtime IDentifier for each supported runtime target. */
const RID_BY_TARGET: Readonly<Record<string, string>> = {
	'win32-x64': 'win-x64',
	'win32-arm64': 'win-arm64',
	'linux-x64': 'linux-x64',
	'linux-arm64': 'linux-arm64',
	'darwin-arm64': 'osx-arm64',
};

/** The shared-library file extension for a target's OS. */
function libExt(target: string): string {
	return target.startsWith('win32-') ? '.dll' : target.startsWith('darwin-') ? '.dylib' : '.so';
}

export interface INugetArtifact {
	readonly name: string;
	readonly version: string;
}

export interface IFoundryDependencyVersions {
	readonly 'foundry-local-core': { readonly nuget: string };
	readonly onnxruntime: { readonly version: string };
	readonly 'onnxruntime-genai': { readonly version: string };
}

export interface IFetchCoreLibrariesOptions {
	readonly feeds?: readonly string[];
	readonly skipIfPresent?: boolean;
}

export function supportsCoreLibraryTarget(target: string): boolean {
	return Object.hasOwn(RID_BY_TARGET, target);
}

export function getStandardArtifacts(target: string, dependencies: IFoundryDependencyVersions): readonly INugetArtifact[] {
	const ortPackageName = target === 'linux-x64' ? 'Microsoft.ML.OnnxRuntime.Gpu.Linux' : 'Microsoft.ML.OnnxRuntime.Foundry';
	return [
		{ name: 'Microsoft.AI.Foundry.Local.Core', version: dependencies['foundry-local-core'].nuget },
		{ name: ortPackageName, version: dependencies.onnxruntime.version },
		{ name: 'Microsoft.ML.OnnxRuntimeGenAI.Foundry', version: dependencies['onnxruntime-genai'].version },
	];
}

export function requiredCoreLibraryNames(target: string): readonly string[] {
	const isWin = target.startsWith('win32-');
	const ext = isWin ? '.dll' : target.startsWith('darwin-') ? '.dylib' : '.so';
	const prefix = isWin ? '' : 'lib';
	return [
		`Microsoft.AI.Foundry.Local.Core${ext}`,
		`${prefix}onnxruntime${ext}`,
		`${prefix}onnxruntime-genai${ext}`,
	];
}

/**
 * Download each `artifact` `.nupkg` for `target`'s RID and extract its native
 * shared libraries into `binDir`. Throws if a package can't be fetched from any
 * feed; callers verify the resulting library set separately.
 */
export async function fetchCoreLibraries(target: string, artifacts: readonly INugetArtifact[], binDir: string, options?: IFetchCoreLibrariesOptions): Promise<void> {
	const rid = RID_BY_TARGET[target];
	if (!rid) {
		throw new Error(`[${SCRIPT}] No NuGet RID mapping for target '${target}'.`);
	}
	const ext = libExt(target);
	const AdmZip = loadAdmZip();
	const feeds = options?.feeds ?? FEEDS;

	fs.mkdirSync(binDir, { recursive: true });
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-nuget-'));
	const serviceIndexCache = new Map<string, unknown>();
	try {
		console.log(`[${SCRIPT}] Fetching native libraries for RID ${rid} (target ${target})...`);
		for (const artifact of artifacts) {
			await installPackage(artifact, target, rid, ext, tempDir, binDir, AdmZip, serviceIndexCache, feeds, options?.skipIfPresent ?? false);
		}
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

async function installPackage(
	artifact: INugetArtifact,
	target: string,
	rid: string,
	ext: string,
	tempDir: string,
	binDir: string,
	AdmZip: any,
	serviceIndexCache: Map<string, unknown>,
	feeds: readonly string[],
	skipIfPresent: boolean,
): Promise<void> {
	if (skipIfPresent) {
		const expectedFile = expectedCoreLibraryName(target, artifact.name);
		if (expectedFile && fs.existsSync(path.join(binDir, expectedFile))) {
			console.log(`[${SCRIPT}]   ${artifact.name}: already present, skipping download.`);
			return;
		}
	}

	let lastError: unknown;
	for (let i = 0; i < feeds.length; i++) {
		const feedUrl = feeds[i];
		const feedHost = new URL(feedUrl).host;
		try {
			const baseAddress = await getBaseAddress(feedUrl, serviceIndexCache);
			const nameLower = artifact.name.toLowerCase();
			const verLower = artifact.version.toLowerCase();
			const downloadUrl = `${baseAddress}${nameLower}/${verLower}/${nameLower}.${verLower}.nupkg`;

			const nupkgPath = path.join(tempDir, `${artifact.name}.${artifact.version}.nupkg`);
			console.log(`[${SCRIPT}]   Downloading ${artifact.name} ${artifact.version} from ${feedHost}...`);
			await downloadToFile(downloadUrl, nupkgPath);

			const zip = new AdmZip(nupkgPath);
			const entries = nativeEntriesForRid(zip, rid, ext);
			if (entries.length === 0) {
				console.warn(`[${SCRIPT}]   No files found for RID ${rid} in ${artifact.name}.`);
			}
			for (const entry of entries) {
				zip.extractEntryTo(entry, binDir, false, true);
				console.log(`[${SCRIPT}]     Extracted ${entry.name}`);
			}
			return;
		} catch (err) {
			lastError = err;
			const reason = err instanceof Error ? err.message : String(err);
			if (i < feeds.length - 1) {
				console.warn(`[${SCRIPT}]   ${artifact.name} ${artifact.version}: download from ${feedHost} failed (${reason}); trying next feed...`);
			}
		}
	}
	const feedHosts = feeds.map(feed => new URL(feed).host).join(', ');
	throw new Error(`[${SCRIPT}] Failed to download ${artifact.name} ${artifact.version} from any feed (${feedHosts}): ${lastError instanceof Error ? lastError.message : lastError}`);
}

function expectedCoreLibraryName(target: string, packageName: string): string | undefined {
	const [foundryCore, onnxRuntime, onnxRuntimeGenAI] = requiredCoreLibraryNames(target);
	if (packageName.includes('Foundry.Local.Core')) {
		return foundryCore;
	}
	if (packageName.includes('OnnxRuntimeGenAI')) {
		return onnxRuntimeGenAI;
	}
	if (packageName.includes('OnnxRuntime')) {
		return onnxRuntime;
	}
	return undefined;
}

/**
 * The native shared-library entries in `zip` for `rid`: files ending in `ext`
 * that live under `runtimes/<rid>/native/` or directly under `runtimes/<rid>/`.
 */
function nativeEntriesForRid(zip: any, rid: string, ext: string): any[] {
	const nativePrefix = `runtimes/${rid}/native/`.toLowerCase();
	const runtimePrefix = `runtimes/${rid}/`.toLowerCase();
	return zip.getEntries().filter((e: any) => {
		const p = String(e.entryName).replace(/\\/g, '/').toLowerCase();
		if (!p.endsWith(ext.toLowerCase())) {
			return false;
		}
		if (p.startsWith(nativePrefix)) {
			return true;
		}
		if (p.startsWith(runtimePrefix)) {
			const rest = p.slice(runtimePrefix.length);
			return rest.length > 0 && !rest.includes('/');
		}
		return false;
	});
}

/** Resolve a NuGet feed's `PackageBaseAddress/3.0.0` service endpoint. */
async function getBaseAddress(feedUrl: string, cache: Map<string, unknown>): Promise<string> {
	if (!cache.has(feedUrl)) {
		cache.set(feedUrl, JSON.parse(await downloadToString(feedUrl)));
	}
	const index = cache.get(feedUrl) as { resources?: { '@type'?: string; '@id'?: string }[] };
	const res = (index.resources ?? []).find(r => typeof r['@type'] === 'string' && r['@type']!.startsWith('PackageBaseAddress/3.0.0'));
	if (!res?.['@id']) {
		throw new Error(`[${SCRIPT}] Could not find PackageBaseAddress/3.0.0 in NuGet feed ${feedUrl}.`);
	}
	return res['@id']!.endsWith('/') ? res['@id']! : `${res['@id']}/`;
}

/** GET `url` following redirects, resolving with the response body as a string. */
function downloadToString(url: string): Promise<string> {
	return followRedirects(url, res => new Promise<string>((resolve, reject) => {
		let data = '';
		res.on('data', chunk => data += chunk);
		res.on('end', () => resolve(data));
		res.on('error', reject);
	}));
}

/** GET `url` following redirects, streaming the response body into `dest`. */
function downloadToFile(url: string, dest: string): Promise<void> {
	return followRedirects(url, res => new Promise<void>((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		res.pipe(file);
		file.on('finish', () => file.close(err => err ? reject(err) : resolve()));
		file.on('error', err => { fs.rmSync(dest, { force: true }); reject(err); });
		res.on('error', reject);
	}));
}

/** Issue a GET, following up to 5 redirects, then hand the 200 response to `onOk`. */
function followRedirects<T>(url: string, onOk: (res: import('http').IncomingMessage) => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const request = (currentUrl: string, redirectsLeft: number): void => {
			https.get(currentUrl, getRequestOptions(currentUrl), res => {
				const status = res.statusCode ?? 0;
				if (status >= 300 && status < 400 && res.headers.location) {
					res.resume();
					if (redirectsLeft <= 0) {
						reject(new Error(`Too many redirects downloading ${url}.`));
						return;
					}
					request(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1);
					return;
				}
				if (status !== 200) {
					res.resume();
					reject(new Error(`Download failed with status ${status}: ${currentUrl}`));
					return;
				}
				onOk(res).then(resolve, reject);
			}).on('error', reject);
		};
		request(url, 5);
	});
}
