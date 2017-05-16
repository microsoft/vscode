/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { execSync } from 'child_process';
import { DocumentClient } from 'documentdb';
import * as azure from 'azure-storage';

interface Asset {
	platform: string;
	type: string;
	url: string;
	mooncakeUrl: string;
	hash: string;
}

function queueSigningRequest(quality: string, commit: string): Promise<void> {
	const retryOperations = new azure.ExponentialRetryPolicyFilter();
	const queueSvc = azure
		.createQueueService(process.env['AZURE_STORAGE_ACCOUNT_2'], process.env['AZURE_STORAGE_ACCESS_KEY_2'])
		.withFilter(retryOperations);

	queueSvc.messageEncoder = new azure.QueueMessageEncoder.TextBase64QueueMessageEncoder();

	const message = `${quality}/${commit}`;

	return new Promise<void>((c, e) => queueSvc.createMessage('sign-darwin', message, err => err ? e(err) : c()));
}

function isBuildSigned(quality: string, commit: string): Promise<boolean> {
	const client = new DocumentClient(process.env['AZURE_DOCUMENTDB_ENDPOINT'], { masterKey: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
	const collection = 'dbs/builds/colls/' + quality;
	const updateQuery = {
		query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
		parameters: [{ name: '@id', value: commit }]
	};

	return new Promise<boolean>((c, e) => {
		client.queryDocuments(collection, updateQuery).toArray((err, results) => {
			if (err) { return e(err); }
			if (results.length !== 1) { return e(new Error('No such build')); }

			const [release] = results;
			const assets: Asset[] = release.assets;
			const isSigned = assets.some(a => a.platform === 'darwin' && a.type === 'archive');

			c(isSigned);
		});
	});
}

async function waitForSignedBuild(quality: string, commit: string): Promise<void> {
	let retries = 0;

	while (retries < 180) {
		if (await isBuildSigned(quality, commit)) {
			return;
		}

		await new Promise<void>(c => setTimeout(c, 10000));
		retries++;
	}

	throw new Error('Timed out waiting for signed build');
}

async function main(quality: string): Promise<void> {
	const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

	console.log(`Queueing signing request for '${quality}/${commit}'...`);
	await queueSigningRequest(quality, commit);

	console.log('Waiting on signed build...');
	await waitForSignedBuild(quality, commit);

	console.log('Found signed build!');
}

main(process.argv[2]).catch(err => {
	console.error(err);
	process.exit(1);
});