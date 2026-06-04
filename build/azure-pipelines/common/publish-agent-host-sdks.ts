/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { BlobServiceClient, ContainerSASPermissions, generateBlobSASQueryParameters } from '@azure/storage-blob';
import { retry } from './retry.ts';
import { ESRPReleaseService, withLease, e } from './publish.ts';

/**
 * Publishes the agent host SDK `.zip` bundles produced by the `AgentHostSdks`
 * stage to the PRSS download CDN via ESRP.
 *
 * Unlike `publish.ts` (which keys assets by commit and records a CosmosDB asset
 * so they appear on the builds page), the SDK bundles are released to a stable,
 * **version-keyed, commit-independent** path:
 *
 *   ${PRSS_CDN_URL}/${quality}/agent-host-sdks/<file>
 *
 * The file name already carries the SDK version (e.g.
 * `agent-host-sdk-codex-darwin-arm64-0.134.0.zip`), so re-publishing an
 * unchanged version is a no-op (the existing CDN object is detected via an
 * HTTP 200 and left untouched). No CosmosDB asset is created — these bundles
 * are an implementation detail fetched on demand by the product, not a
 * user-facing download.
 *
 * Usage: node publish-agent-host-sdks.ts <directory-of-zips>
 *
 * See `src/vs/platform/agentHost/AGENT_HOST_SDK_DELIVERY_PLAN.md`.
 */

async function releaseBundle(blobServiceClient: BlobServiceClient, filePath: string): Promise<void> {
	const quality = e('VSCODE_QUALITY');
	const version = e('BUILD_SOURCEVERSION');
	const fileName = path.basename(filePath);
	const friendlyFileName = `${quality}/agent-host-sdks/${fileName}`;
	const log = (...args: unknown[]) => console.log(`[${fileName}]`, ...args);

	const leasesContainerClient = blobServiceClient.getContainerClient('leases');
	await leasesContainerClient.createIfNotExists();
	const leaseBlobClient = leasesContainerClient.getBlockBlobClient(friendlyFileName);

	log(`Acquiring lease for: ${friendlyFileName}`);

	await withLease(leaseBlobClient, async () => {
		log(`Successfully acquired lease for: ${friendlyFileName}`);

		const url = `${e('PRSS_CDN_URL')}/${friendlyFileName}`;
		const res = await retry(() => fetch(url));

		if (res.status === 200) {
			log(`Already released and provisioned: ${url}`);
			return;
		}

		const stagingContainerClient = blobServiceClient.getContainerClient('staging');
		await stagingContainerClient.createIfNotExists();

		const now = new Date().valueOf();
		const oneHour = 120 * 60 * 1000;
		const oneHourAgo = new Date(now - oneHour);
		const oneHourFromNow = new Date(now + oneHour);
		const userDelegationKey = await blobServiceClient.getUserDelegationKey(oneHourAgo, oneHourFromNow);
		const sasOptions = { containerName: 'staging', permissions: ContainerSASPermissions.from({ read: true }), startsOn: oneHourAgo, expiresOn: oneHourFromNow };
		const stagingSasToken = generateBlobSASQueryParameters(sasOptions, userDelegationKey, e('VSCODE_STAGING_BLOB_STORAGE_ACCOUNT_NAME')).toString();

		const releaseService = await ESRPReleaseService.create(
			log,
			e('RELEASE_TENANT_ID'),
			e('RELEASE_CLIENT_ID'),
			e('RELEASE_AUTH_CERT'),
			e('RELEASE_REQUEST_SIGNING_CERT'),
			stagingContainerClient,
			stagingSasToken
		);

		await releaseService.createRelease(version, filePath, friendlyFileName);
		log(`Successfully released: ${url}`);
	});
}

async function main(): Promise<void> {
	const dir = process.argv[2];
	if (!dir) {
		throw new Error('Usage: node publish-agent-host-sdks.ts <directory-of-zips>');
	}

	const files = fs.readdirSync(dir)
		.filter(f => f.endsWith('.zip'))
		.map(f => path.join(dir, f));

	if (files.length === 0) {
		throw new Error(`No .zip bundles found in ${dir}`);
	}

	const { blobServiceAccessToken } = JSON.parse(e('PUBLISH_AUTH_TOKENS'));
	const blobServiceClient = new BlobServiceClient(
		`https://${e('VSCODE_STAGING_BLOB_STORAGE_ACCOUNT_NAME')}.blob.core.windows.net/`,
		{ getToken: async () => blobServiceAccessToken }
	);

	// Release serially to avoid hammering ESRP / staging storage.
	for (const filePath of files) {
		await releaseBundle(blobServiceClient, filePath);
	}

	console.log(`All ${files.length} agent host SDK bundles published!`);
}

if (import.meta.main) {
	main().then(() => process.exit(0), err => {
		console.error(err);
		process.exit(1);
	});
}
