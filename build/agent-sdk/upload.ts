/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Upload one agent-SDK tarball + sidecar to the `main.vscode-cdn.net` storage
 * account at the path `agent-sdk/<sdk>/<sdkVersion>/<sdkTarget>.tgz`.
 *
 * Usage:
 *   node build/agent-sdk/upload.ts --tarball=<path/to/foo.tgz>
 *
 * The `.tgz.json` sidecar produced by `package.ts` is the source of truth for
 * sdk/version/target/sha256 — no re-hashing, no filename parsing.
 *
 * Auth: reads `AZURE_STORAGE_ACCOUNT`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
 * `AZURE_ID_TOKEN` from env, same shape as `build/azure-pipelines/upload-cdn.ts`.
 *
 * Idempotency: HEAD the blob first.
 *   - Absent → upload.
 *   - Present with matching sha256 → skip (re-run of the same pipeline).
 *   - Present with different/missing sha256 → fail loud. Recovery is to
 *     delete the offending blob in the Azure Portal (we refuse to overwrite
 *     content-addressed history from automation).
 */

import * as fs from 'fs';
import { ClientAssertionCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { fail, parseFlags, readSidecar, sidecarPathFor } from './common.ts';

const SCRIPT = 'upload.ts';

interface ICliArgs {
	tarball: string;
}

function parseArgs(): ICliArgs {
	const flags = parseFlags(process.argv.slice(2));
	const tarball = flags.get('tarball');
	if (!tarball) {
		fail(SCRIPT, 'Missing --tarball=<path>');
	}
	return { tarball };
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		fail(SCRIPT, `Missing required environment variable: ${name}`);
	}
	return value;
}

async function main(): Promise<void> {
	const args = parseArgs();
	if (!fs.existsSync(args.tarball)) {
		fail(SCRIPT, `Tarball does not exist: ${args.tarball}`);
	}
	const sidecarPath = sidecarPathFor(args.tarball);
	if (!fs.existsSync(sidecarPath)) {
		fail(SCRIPT, `Sidecar does not exist: ${sidecarPath} (was the tarball produced by package.ts?)`);
	}
	const sidecar = readSidecar(sidecarPath, SCRIPT);

	const account = requireEnv('AZURE_STORAGE_ACCOUNT');
	const tenantId = requireEnv('AZURE_TENANT_ID');
	const clientId = requireEnv('AZURE_CLIENT_ID');
	const idToken = requireEnv('AZURE_ID_TOKEN');

	const credential = new ClientAssertionCredential(tenantId, clientId, () => Promise.resolve(idToken));
	const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
	const container = service.getContainerClient('$web');
	const blobName = `agent-sdk/${sidecar.sdk}/${sidecar.sdkVersion}/${sidecar.sdkTarget}.tgz`;
	const blob = container.getBlockBlobClient(blobName);

	console.log(`[${SCRIPT}] target: https://${account}.blob.core.windows.net/$web/${blobName}`);
	console.log(`[${SCRIPT}] local sha256: ${sidecar.sha256}`);

	// HEAD-and-decide. We stamp our sha256 into the blob's `metadata.sha256`
	// at upload time and re-read it here to compare. Azure normalizes
	// metadata keys to lowercase on read; `sha256` round-trips cleanly.
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
		if (remoteSha === sidecar.sha256) {
			console.log(`[${SCRIPT}] blob already present with matching sha256 — skipping upload (idempotent re-run).`);
			return;
		}
		fail(
			SCRIPT,
			`Blob already present with ${remoteSha ? 'DIFFERENT' : 'NO'} sha256 metadata — refusing to overwrite content-addressed history.\n` +
			`  remote: ${remoteSha ?? '<no metadata.sha256 — was this blob uploaded out-of-band?>'}\n` +
			`  local:  ${sidecar.sha256}\n` +
			`If determinism drift is the cause (e.g. an agent image bump changed gzip bytes), investigate ` +
			`whether to bump the SDK version or fix the build. To re-publish: delete the blob in Azure Portal and re-run.`,
		);
	}

	console.log(`[${SCRIPT}] uploading ${fs.statSync(args.tarball).size} bytes…`);
	await blob.uploadFile(args.tarball, {
		blobHTTPHeaders: {
			blobContentType: 'application/gzip',
			blobCacheControl: 'max-age=31536000, immutable',
		},
		metadata: {
			sha256: sidecar.sha256,
		},
	});
	console.log(`[${SCRIPT}] ✓ uploaded.`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
