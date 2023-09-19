/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import { BlobServiceClient, BlockBlobParallelUploadOptions, StoragePipelineOptions, StorageRetryPolicyType } from '@azure/storage-blob';
import * as mime from 'mime';
import { CosmosClient } from '@azure/cosmos';
import { ClientSecretCredential } from '@azure/identity';
import { retry } from './retry';

interface Asset {
	platform: string;
	type: string;
	url: string;
	mooncakeUrl?: string;
	hash: string;
	sha256hash: string;
	size: number;
	supportsFastUpdate?: boolean;
}

if (process.argv.length !== 8) {
	console.error('Usage: node createAsset.js PRODUCT OS ARCH TYPE NAME FILE');
	process.exit(-1);
}

// Contains all of the logic for mapping details to our actual product names in CosmosDB
function getPlatform(product: string, os: string, arch: string, type: string): string {
	switch (os) {
		case 'win32':
			switch (product) {
				case 'client': {
					const asset = arch === 'ia32' ? 'win32' : `win32-${arch}`;
					switch (type) {
						case 'archive':
							return `${asset}-archive`;
						case 'setup':
							return asset;
						case 'user-setup':
							return `${asset}-user`;
						default:
							throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
				}
				case 'server':
					if (arch === 'arm64') {
						throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
					return arch === 'ia32' ? 'server-win32' : `server-win32-${arch}`;
				case 'web':
					if (arch === 'arm64') {
						throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
					return arch === 'ia32' ? 'server-win32-web' : `server-win32-${arch}-web`;
				case 'cli':
					return `cli-win32-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'alpine':
			switch (product) {
				case 'server':
					return `server-alpine-${arch}`;
				case 'web':
					return `server-alpine-${arch}-web`;
				case 'cli':
					return `cli-alpine-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'linux':
			switch (type) {
				case 'snap':
					return `linux-snap-${arch}`;
				case 'archive-unsigned':
					switch (product) {
						case 'client':
							return `linux-${arch}`;
						case 'server':
							return `server-linux-${arch}`;
						case 'web':
							return arch === 'standalone' ? 'web-standalone' : `server-linux-${arch}-web`;
						default:
							throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
				case 'deb-package':
					return `linux-deb-${arch}`;
				case 'rpm-package':
					return `linux-rpm-${arch}`;
				case 'cli':
					return `cli-linux-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'darwin':
			switch (product) {
				case 'client':
					if (arch === 'x64') {
						return 'darwin';
					}
					return `darwin-${arch}`;
				case 'server':
					if (arch === 'x64') {
						return 'server-darwin';
					}
					return `server-darwin-${arch}`;
				case 'web':
					if (arch === 'x64') {
						return 'server-darwin-web';
					}
					return `server-darwin-${arch}-web`;
				case 'cli':
					return `cli-darwin-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		default:
			throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
	}
}

// Contains all of the logic for mapping types to our actual types in CosmosDB
function getRealType(type: string) {
	switch (type) {
		case 'user-setup':
			return 'setup';
		case 'deb-package':
		case 'rpm-package':
			return 'package';
		default:
			return type;
	}
}

function hashStream(hashName: string, stream: Readable): Promise<string> {
	return new Promise<string>((c, e) => {
		const shasum = crypto.createHash(hashName);

		stream
			.on('data', shasum.update.bind(shasum))
			.on('error', e)
			.on('close', () => c(shasum.digest('hex')));
	});
}

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

async function main(): Promise<void> {
	const [, , product, os, arch, unprocessedType, fileName, filePath] = process.argv;
	// getPlatform needs the unprocessedType
	const platform = getPlatform(product, os, arch, unprocessedType);
	const type = getRealType(unprocessedType);
	const quality = getEnv('VSCODE_QUALITY');
	const commit = getEnv('BUILD_SOURCEVERSION');

	console.log('Creating asset...');

	const stat = await new Promise<fs.Stats>((c, e) => fs.stat(filePath, (err, stat) => err ? e(err) : c(stat)));
	const size = stat.size;

	console.log('Size:', size);

	const stream = fs.createReadStream(filePath);
	const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);

	console.log('SHA1:', sha1hash);
	console.log('SHA256:', sha256hash);

	const blobName = commit + '/' + fileName;

	const storagePipelineOptions: StoragePipelineOptions = { retryOptions: { retryPolicyType: StorageRetryPolicyType.EXPONENTIAL, maxTries: 6, tryTimeoutInMs: 10 * 60 * 1000 } };

	const credential = new ClientSecretCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, process.env['AZURE_CLIENT_SECRET']!);
	const blobServiceClient = new BlobServiceClient(`https://vscode.blob.core.windows.net`, credential, storagePipelineOptions);
	const containerClient = blobServiceClient.getContainerClient(quality);
	const blobClient = containerClient.getBlockBlobClient(blobName);

	const blobOptions: BlockBlobParallelUploadOptions = {
		blobHTTPHeaders: {
			blobContentType: mime.lookup(filePath),
			blobContentDisposition: `attachment; filename="${fileName}"`,
			blobCacheControl: 'max-age=31536000, public'
		}
	};

	const uploadPromises: Promise<void>[] = [];

	uploadPromises.push((async () => {
		console.log(`Checking for blob in Azure...`);

		if (await retry(() => blobClient.exists())) {
			throw new Error(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
		} else {
			await retry(async (attempt) => {
				console.log(`Uploading blobs to Azure storage (attempt ${attempt})...`);
				await blobClient.uploadFile(filePath, blobOptions);
				console.log('Blob successfully uploaded to Azure storage.');
			});
		}
	})());

	const shouldUploadToMooncake = /true/i.test(process.env['VSCODE_PUBLISH_TO_MOONCAKE'] ?? 'true');

	if (shouldUploadToMooncake) {
		const mooncakeCredential = new ClientSecretCredential(process.env['AZURE_MOONCAKE_TENANT_ID']!, process.env['AZURE_MOONCAKE_CLIENT_ID']!, process.env['AZURE_MOONCAKE_CLIENT_SECRET']!);
		const mooncakeBlobServiceClient = new BlobServiceClient(`https://vscode.blob.core.chinacloudapi.cn`, mooncakeCredential, storagePipelineOptions);
		const mooncakeContainerClient = mooncakeBlobServiceClient.getContainerClient(quality);
		const mooncakeBlobClient = mooncakeContainerClient.getBlockBlobClient(blobName);

		uploadPromises.push((async () => {
			console.log(`Checking for blob in Mooncake Azure...`);

			if (await retry(() => mooncakeBlobClient.exists())) {
				throw new Error(`Mooncake Blob ${quality}, ${blobName} already exists, not publishing again.`);
			} else {
				await retry(async (attempt) => {
					console.log(`Uploading blobs to Mooncake Azure storage (attempt ${attempt})...`);
					await mooncakeBlobClient.uploadFile(filePath, blobOptions);
					console.log('Blob successfully uploaded to Mooncake Azure storage.');
				});
			}
		})());
	}

	const promiseResults = await Promise.allSettled(uploadPromises);
	const rejectedPromiseResults = promiseResults.filter(result => result.status === 'rejected') as PromiseRejectedResult[];

	if (rejectedPromiseResults.length === 0) {
		console.log('All blobs successfully uploaded.');
	} else if (rejectedPromiseResults[0]?.reason?.message?.includes('already exists')) {
		console.warn(rejectedPromiseResults[0].reason.message);
		console.log('Some blobs successfully uploaded.');
	} else {
		// eslint-disable-next-line no-throw-literal
		throw rejectedPromiseResults[0]?.reason;
	}

	const assetUrl = `${process.env['AZURE_CDN_URL']}/${quality}/${blobName}`;
	const blobPath = new URL(assetUrl).pathname;
	const mooncakeUrl = `${process.env['MOONCAKE_CDN_URL']}${blobPath}`;

	const asset: Asset = {
		platform,
		type,
		url: assetUrl,
		hash: sha1hash,
		mooncakeUrl,
		sha256hash,
		size
	};

	// Remove this if we ever need to rollback fast updates for windows
	if (/win32/.test(platform)) {
		asset.supportsFastUpdate = true;
	}

	console.log('Asset:', JSON.stringify(asset, null, '  '));

	const client = new CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT']!, aadCredentials: credential });
	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));

	console.log(`  Done ✔️`);
}

main().then(() => {
	console.log('Asset successfully created');
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
