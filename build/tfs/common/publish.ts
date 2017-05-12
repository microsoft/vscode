/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as azure from 'azure-storage';
import * as mime from 'mime';
import { DocumentClient, NewDocument } from 'documentdb';

if (process.argv.length < 6) {
	console.error('Usage: node publish.js <product> <platform> <type> <name> <version> <commit> <is_update> <file>');
	process.exit(-1);
}

function sha1hash(file: string): Promise<string> {
	return new Promise<string>((c, e) => {
		const shasum = crypto.createHash('sha1');
		const stream = fs.createReadStream(file);

		stream
			.on('data', shasum.update.bind(shasum))
			.on('error', e)
			.on('close', () => c(shasum.digest('hex')));
	});
}

interface Config {
	id: string;
	frozen: boolean;
}

function createDefaultConfig(quality: string): Config {
	return {
		id: quality,
		frozen: false
	};
}

function getConfig(quality: string): Promise<Config> {
	const client = new DocumentClient(process.env['AZURE_DOCUMENTDB_ENDPOINT'], { masterKey: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
	const collection = 'dbs/builds/colls/config';
	const query = {
		query: `SELECT TOP 1 * FROM c WHERE c.id = @quality`,
		parameters: [
			{ name: '@quality', value: quality }
		]
	};

	return new Promise<Config>((c, e) => {
		client.queryDocuments(collection, query).toArray((err, results) => {
			if (err && err.code !== 409) { return e(err); }

			c(!results || results.length === 0 ? createDefaultConfig(quality) : results[0] as any as Config);
		});
	});
}

interface Asset {
	platform: string;
	type: string;
	url: string;
	mooncakeUrl: string;
	hash: string;
}

function createOrUpdate(commit: string, quality: string, platform: string, type: string, release: NewDocument, asset: Asset, isUpdate: boolean): Promise<void> {
	const client = new DocumentClient(process.env['AZURE_DOCUMENTDB_ENDPOINT'], { masterKey: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
	const collection = 'dbs/builds/colls/' + quality;
	const updateQuery = {
		query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
		parameters: [{ name: '@id', value: commit }]
	};

	let updateTries = 0;

	function update(): Promise<void> {
		updateTries++;

		return new Promise<void>((c, e) => {
			client.queryDocuments(collection, updateQuery).toArray((err, results) => {
				if (err) { return e(err); }
				if (results.length !== 1) { return e(new Error('No documents')); }

				const release = results[0];

				release.assets = [
					...release.assets.filter((a: any) => !(a.platform === platform && a.type === type)),
					asset
				];

				if (isUpdate) {
					release.updates[platform] = type;
				}

				client.replaceDocument(release._self, release, err => {
					if (err && err.code === 409 && updateTries < 5) { return c(update()); }
					if (err) { return e(err); }

					console.log('Build successfully updated.');
					c();
				});
			});
		});
	}

	return new Promise<void>((c, e) => {
		client.createDocument(collection, release, err => {
			if (err && err.code === 409) { return c(update()); }
			if (err) { return e(err); }

			console.log('Build successfully published.');
			c();
		});
	});
}

async function assertContainer(blobService: azure.BlobService, quality: string): Promise<void> {
	await new Promise((c, e) => blobService.createContainerIfNotExists(quality, { publicAccessLevel: 'blob' }, err => err ? e(err) : c()));
}

async function doesAssetExist(blobService: azure.BlobService, quality: string, blobName: string): Promise<boolean> {
	const existsResult = await new Promise<azure.BlobService.BlobResult>((c, e) => blobService.doesBlobExist(quality, blobName, (err, r) => err ? e(err) : c(r)));
	return existsResult.exists;
}

async function uploadBlob(blobService: azure.BlobService, quality: string, blobName: string, file: string): Promise<void> {
	const blobOptions = {
		contentType: mime.lookup(file),
		cacheControl: 'max-age=31536000, public'
	};

	await new Promise((c, e) => blobService.createBlockBlobFromLocalFile(quality, blobName, file, blobOptions, err => err ? e(err) : c()));
}

async function publish(commit: string, quality: string, platform: string, type: string, name: string, version: string, _isUpdate: string, file: string): Promise<void> {
	const isUpdate = _isUpdate === 'true';

	const queuedBy = process.env['BUILD_QUEUEDBY'];
	const sourceBranch = process.env['BUILD_SOURCEBRANCH'];
	const isReleased = quality === 'insider'
		&& /^master$|^refs\/heads\/master$/.test(sourceBranch)
		&& /Project Collection Service Accounts|Microsoft.VisualStudio.Services.TFS/.test(queuedBy);

	console.log('Publishing...');
	console.log('Quality:', quality);
	console.log('Platforn:', platform);
	console.log('Type:', type);
	console.log('Name:', name);
	console.log('Version:', version);
	console.log('Commit:', commit);
	console.log('Is Update:', isUpdate);
	console.log('Is Released:', isReleased);
	console.log('File:', file);

	const hash = await sha1hash(file);
	console.log('Hash:', hash);

	const blobName = commit + '/' + name;
	const storageAccount = process.env['AZURE_STORAGE_ACCOUNT_2'];

	const blobService = azure.createBlobService(storageAccount, process.env['AZURE_STORAGE_ACCESS_KEY_2'])
		.withFilter(new azure.ExponentialRetryPolicyFilter());

	const mooncakeBlobService = azure.createBlobService(storageAccount, process.env['MOONCAKE_STORAGE_ACCESS_KEY'], `${storageAccount}.blob.core.chinacloudapi.cn`)
		.withFilter(new azure.ExponentialRetryPolicyFilter());

	await Promise.all([
		assertContainer(blobService, quality),
		assertContainer(mooncakeBlobService, quality)
	]);

	const [blobExists, moooncakeBlobExists] = await Promise.all([
		doesAssetExist(blobService, quality, blobName),
		doesAssetExist(mooncakeBlobService, quality, blobName)
	]);

	if (blobExists || moooncakeBlobExists) {
		console.log(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
		return;
	}

	console.log('Uploading blobs to Azure storage...');

	await Promise.all([
		uploadBlob(blobService, quality, blobName, file),
		uploadBlob(mooncakeBlobService, quality, blobName, file)
	]);

	console.log('Blobs successfully uploaded.');

	const config = await getConfig(quality);

	console.log('Quality config:', config);

	const asset: Asset = {
		platform: platform,
		type: type,
		url: `${process.env['AZURE_CDN_URL']}/${quality}/${blobName}`,
		mooncakeUrl: `${process.env['MOONCAKE_CDN_URL']}/${quality}/${blobName}`,
		hash: hash
	};

	const release = {
		id: commit,
		timestamp: (new Date()).getTime(),
		version,
		isReleased: config.frozen ? false : isReleased,
		sourceBranch,
		queuedBy,
		assets: [asset],
		updates: {} as any
	};

	if (isUpdate) {
		release.updates[platform] = type;
	}

	await createOrUpdate(commit, quality, platform, type, release, asset, isUpdate);
}

function main(): void {
	const [, , quality, platform, type, name, version, _isUpdate, file] = process.argv;
	const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

	publish(commit, quality, platform, type, name, version, _isUpdate, file).catch(err => {
		console.error(err);
		process.exit(1);
	});
}

main();
