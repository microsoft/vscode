/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared NuGet download and extraction utilities for install scripts.
// Derived from foundry-local-sdk 1.2.3 with VS Code feed authentication.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const AdmZip = require('adm-zip');

const VSCODE_FEED_PREFIX = 'https://pkgs.dev.azure.com/monacotools/';

function getRequestOptions(url) {
	if (!url.startsWith(VSCODE_FEED_PREFIX)) {
		return {};
	}
	const token = process.env.VSS_NUGET_ACCESSTOKEN;
	if (!token) {
		throw new Error('VSS_NUGET_ACCESSTOKEN is required to access the VS Code NuGet feed.');
	}
	return {
		headers: {
			Authorization: `Basic ${Buffer.from(`vscode:${token}`).toString('base64')}`,
		},
	};
}

const PLATFORM_MAP = {
	'win32-x64': 'win-x64',
	'win32-arm64': 'win-arm64',
	'linux-x64': 'linux-x64',
	'linux-arm64': 'linux-arm64',
	'darwin-arm64': 'osx-arm64',
};
const platformKey = `${os.platform()}-${os.arch()}`;
const RID = PLATFORM_MAP[platformKey];
// Install binaries into foundry-local-core/<platform> inside the package root.
const BIN_DIR = path.join(__dirname, '..', 'foundry-local-core', platformKey);
const EXT = os.platform() === 'win32' ? '.dll' : os.platform() === 'darwin' ? '.dylib' : '.so';

const REQUIRED_FILES = [
	`Microsoft.AI.Foundry.Local.Core${EXT}`,
	`${os.platform() === 'win32' ? '' : 'lib'}onnxruntime${EXT}`,
	`${os.platform() === 'win32' ? '' : 'lib'}onnxruntime-genai${EXT}`,
];

const FEED = 'https://pkgs.dev.azure.com/monacotools/Monaco/_packaging/vscode/nuget/v3/index.json';

// --- Download helpers ---

async function downloadWithRetryAndRedirects(url, destStream = null) {
	const maxRedirects = 5;
	let currentUrl = url;
	let redirects = 0;

	while (redirects < maxRedirects) {
		const response = await new Promise((resolve, reject) => {
			https.get(currentUrl, getRequestOptions(currentUrl), (res) => resolve(res))
				.on('error', reject);
		});

		if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
			currentUrl = response.headers.location;
			response.resume();
			redirects++;
			console.log(`  Following redirect to ${new URL(currentUrl).host}...`);
			continue;
		}

		if (response.statusCode !== 200) {
			throw new Error(`Download failed with status ${response.statusCode}: ${currentUrl}`);
		}

		if (destStream) {
			response.pipe(destStream);
			return new Promise((resolve, reject) => {
				destStream.on('finish', resolve);
				destStream.on('error', reject);
				response.on('error', reject);
			});
		} else {
			let data = '';
			response.on('data', chunk => data += chunk);
			return new Promise((resolve, reject) => {
				response.on('end', () => resolve(data));
				response.on('error', reject);
			});
		}
	}
	throw new Error('Too many redirects');
}

async function downloadJson(url) {
	return JSON.parse(await downloadWithRetryAndRedirects(url));
}

async function downloadFile(url, dest) {
	const file = fs.createWriteStream(dest);
	try {
		await downloadWithRetryAndRedirects(url, file);
		file.close();
	} catch (e) {
		file.close();
		if (fs.existsSync(dest)) {
			fs.unlinkSync(dest);
		}
		throw e;
	}
}

const serviceIndexCache = new Map();

function expectedFileForPackage(pkgName) {
	const prefix = os.platform() === 'win32' ? '' : 'lib';
	if (pkgName.includes('Foundry.Local.Core')) {
		return `Microsoft.AI.Foundry.Local.Core${EXT}`;
	}
	if (pkgName.includes('Windows.AI.MachineLearning')) {
		return `Microsoft.Windows.AI.MachineLearning${EXT}`;
	}
	if (pkgName.includes('OnnxRuntimeGenAI')) {
		return `${prefix}onnxruntime-genai${EXT}`;
	}
	if (pkgName.includes('OnnxRuntime')) {
		return `${prefix}onnxruntime${EXT}`;
	}
	return undefined;
}

function entryFileName(entry) {
	const normalized = entry.entryName.replace(/\\/g, '/');
	return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function nativeEntriesForRid(zip, includeFiles) {
	const includedNames = includeFiles
		? new Set(includeFiles.map(name => name.toLowerCase()))
		: null;
	const nativePrefix = `runtimes/${RID}/native/`.toLowerCase();
	const runtimePrefix = `runtimes/${RID}/`.toLowerCase();
	return zip.getEntries().filter(e => {
		const p = e.entryName.toLowerCase();
		if (!p.endsWith(EXT)) {
			return false;
		}

		const inNativePath = p.startsWith(nativePrefix);
		let inRuntimePath = false;
		if (p.startsWith(runtimePrefix)) {
			const relativePath = p.slice(runtimePrefix.length);
			inRuntimePath = relativePath.length > 0 && !relativePath.includes('/');
		}

		if (!inNativePath && !inRuntimePath) {
			return false;
		}

		if (includedNames && !includedNames.has(entryFileName(e).toLowerCase())) {
			return false;
		}

		return true;
	});
}

function removeFiles(binDir, files) {
	for (const file of files || []) {
		const filePath = path.join(binDir, file);
		if (fs.existsSync(filePath)) {
			fs.rmSync(filePath, { force: true });
			console.log(`    Removed ${file}`);
		}
	}
}

async function getBaseAddress(feedUrl) {
	if (!serviceIndexCache.has(feedUrl)) {
		serviceIndexCache.set(feedUrl, await downloadJson(feedUrl));
	}
	const resources = serviceIndexCache.get(feedUrl).resources || [];
	const res = resources.find(r => r['@type'] && r['@type'].startsWith('PackageBaseAddress/3.0.0'));
	if (!res) {
		throw new Error('Could not find PackageBaseAddress/3.0.0 in NuGet feed.');
	}
	const baseAddress = res['@id'];
	return baseAddress.endsWith('/') ? baseAddress : baseAddress + '/';
}

async function installPackage(artifact, tempDir, binDir, skipIfPresent) {
	const pkgName = artifact.name;
	const pkgVer = artifact.version;

	// Skip download if this package's main native binary is already present
	// (e.g. pre-populated by CI from a locally-built artifact).
	// Callers pass skipIfPresent=false when overriding (e.g. WinML over standard).
	if (skipIfPresent) {
		const expectedFile = expectedFileForPackage(pkgName);
		if (expectedFile && fs.existsSync(path.join(binDir, expectedFile))) {
			console.log(`  ${pkgName}: already present, skipping download.`);
			return;
		}
	}

	const baseAddress = await getBaseAddress(FEED);
	const nameLower = pkgName.toLowerCase();
	const verLower = pkgVer.toLowerCase();
	const downloadUrl = `${baseAddress}${nameLower}/${verLower}/${nameLower}.${verLower}.nupkg`;

	const nupkgPath = path.join(tempDir, `${pkgName}.${pkgVer}.nupkg`);
	console.log(`  Downloading ${pkgName} ${pkgVer} from ${new URL(FEED).host}...`);
	await downloadFile(downloadUrl, nupkgPath);

	console.log(`  Extracting...`);
	const zip = new AdmZip(nupkgPath);
	const entries = nativeEntriesForRid(zip, artifact.includeFiles);

	if (entries.length > 0) {
		entries.forEach(entry => {
			zip.extractEntryTo(entry, binDir, false, true);
			console.log(`    Extracted ${entry.name}`);
		});
	} else {
		console.warn(`    No files found for RID ${RID} in ${pkgName}.`);
	}

	removeFiles(binDir, artifact.removeFiles);

	// Write a metadata package.json with version info for diagnostics
	if (pkgName.startsWith('Microsoft.AI.Foundry.Local.Core')) {
		const pkgJsonPath = path.join(binDir, 'package.json');
		const pkgContent = {
			name: `@foundry-local-core/${platformKey}`,
			version: pkgVer,
			description: `Native binaries for Foundry Local SDK (${platformKey})`,
			private: true
		};
		fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgContent, null, 2));
	}
}

async function runInstall(artifacts, options) {
	if (!RID) {
		console.warn(`[foundry-local] Unsupported platform: ${platformKey}. Skipping.`);
		return;
	}

	const binDir = (options && options.binDir) || BIN_DIR;
	// When a custom binDir is provided (e.g. WinML overriding standard),
	// don't skip packages whose output files already exist — we need to
	// overwrite them with the variant's binaries.
	const skipIfPresent = !(options && options.binDir);

	console.log(`[foundry-local] Installing native libraries for ${RID}...`);
	fs.mkdirSync(binDir, { recursive: true });

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-install-'));
	try {
		for (const artifact of artifacts) {
			await installPackage(artifact, tempDir, binDir, skipIfPresent);
		}
		console.log('[foundry-local] Installation complete.');
	} finally {
		try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
	}
}

module.exports = { runInstall };
