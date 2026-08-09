/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Uploads one agent-SDK tarball to the `main.vscode-cdn.net` storage account.
 * Callable as both a library function (`uploadOne(...)`) and a thin CLI.
 *
 * Auth: reads `AZURE_STORAGE_ACCOUNT`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
 * `AZURE_ID_TOKEN` from env — same shape as `build/azure-pipelines/upload-cdn.ts`.
 *
 * Idempotency: HEAD-first on the `.tgz` blob.
 *   - Absent → upload.
 *   - Present with matching sha256 (in `metadata.sha256`) → skip.
 *   - Present with different / no sha256 metadata → fail loud, refusing to
 *     overwrite content-addressed history. Recovery: delete the blob in the
 *     Azure Portal and re-run.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClientAssertionCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { buildCdnUrl, getAgentMeta, parseFlags, type Sdk, sha256OfFile } from './common.ts';

const SCRIPT = 'upload.ts';

export interface IUploadArgs {
	readonly sdk: Sdk;
	readonly sdkVersion: string;
	readonly sdkTarget: string;
	readonly tgzPath: string;
	/** Pre-computed sha (e.g. from `buildOne()`); if omitted, computed here. */
	readonly sha256?: string;
}

export interface IUploadResult {
	readonly url: string;
	readonly sha256: string;
}

export async function uploadOne(args: IUploadArgs): Promise<IUploadResult> {
	if (!fs.existsSync(args.tgzPath)) {
		throw new Error(`[${SCRIPT}] Tarball does not exist: ${args.tgzPath}`);
	}
	const sha256 = args.sha256 ?? await sha256OfFile(args.tgzPath);

	const account = requireEnv('AZURE_STORAGE_ACCOUNT');
	const tenantId = requireEnv('AZURE_TENANT_ID');
	const clientId = requireEnv('AZURE_CLIENT_ID');
	const idToken = requireEnv('AZURE_ID_TOKEN');

	const credential = new ClientAssertionCredential(tenantId, clientId, () => Promise.resolve(idToken));
	const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
	const container = service.getContainerClient('$web');
	const blobName = `agent-sdk/${args.sdk}/${args.sdkVersion}/${args.sdkTarget}.tgz`;
	const blob = container.getBlockBlobClient(blobName);

	console.log(`[${SCRIPT}] target: https://${account}.blob.core.windows.net/$web/${blobName}`);
	console.log(`[${SCRIPT}] local sha256: ${sha256}`);

	let existing;
	try {
		existing = await blob.getProperties();
	} catch (err) {
		const status = (err as { statusCode?: number }).statusCode;
		if (status !== 404) {
			throw err;
		}
		existing = undefined;
	}

	if (existing) {
		const remoteSha = existing.metadata?.sha256;
		if (remoteSha === sha256) {
			console.log(`[${SCRIPT}] blob already present with matching sha256 — skipping upload (idempotent).`);
			return { url: buildCdnUrl(args.sdk, args.sdkVersion, args.sdkTarget), sha256 };
		}
		throw new Error(
			`[${SCRIPT}] Blob already present with ${remoteSha ? 'DIFFERENT' : 'NO'} sha256 metadata — refusing to overwrite content-addressed history.\n` +
			`  remote: ${remoteSha ?? '<no metadata.sha256 — was this blob uploaded out-of-band?>'}\n` +
			`  local:  ${sha256}\n` +
			`If the local build is what should ship, delete the remote blob in Azure Portal and re-run. ` +
			`Otherwise: investigate why the same ${getAgentMeta(args.sdk).name}@${args.sdkVersion} produced different bytes.`,
		);
	}

	console.log(`[${SCRIPT}] uploading ${fs.statSync(args.tgzPath).size} bytes…`);
	await blob.uploadFile(args.tgzPath, {
		blobHTTPHeaders: {
			blobContentType: 'application/gzip',
			blobCacheControl: 'max-age=31536000, immutable',
		},
		metadata: { sha256 },
	});
	console.log(`[${SCRIPT}] ✓ uploaded.`);
	return { url: buildCdnUrl(args.sdk, args.sdkVersion, args.sdkTarget), sha256 };
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`[${SCRIPT}] Missing required environment variable: ${name}`);
	}
	return value;
}

// #region CLI entry point

function isCliInvocation(): boolean {
	// `import.meta.filename` is already a real filesystem path; comparing
	// it directly to `process.argv[1]` works on Windows (where the
	// manual `file://${argv}` construction breaks because Node URL-encodes
	// drive letters and spaces). Pattern matches `build/npm/installStateHash.ts:143`.
	return import.meta.filename === process.argv[1];
}

function parseCliArgs(): IUploadArgs {
	const flags = parseFlags(process.argv.slice(2));
	const tgzPath = flags.get('tarball');
	if (!tgzPath) { throw new Error('--tarball=<path> is required'); }
	// Filename convention from package.ts: `<sdk>-<sdkVersion>-<sdkTarget>.tgz`.
	const basename = path.basename(tgzPath);
	const match = /^(claude|codex)-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-((?:darwin|linux|win32)-(?:x64|arm64)(?:-musl)?)\.tgz$/.exec(basename);
	if (!match) {
		throw new Error(`Cannot derive (sdk, version, target) from tarball filename '${basename}'`);
	}
	const [, sdk, sdkVersion, sdkTarget] = match;
	return { sdk: sdk as Sdk, sdkVersion, sdkTarget, tgzPath: path.resolve(tgzPath) };
}

if (isCliInvocation()) {
	uploadOne(parseCliArgs()).catch(err => {
		console.error(err);
		process.exit(1);
	});
}

// #endregion
