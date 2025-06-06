/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientAssertionCredential } from '@azure/identity';
import { CosmosClient } from '@azure/cosmos';
import { retry } from './retry';

if (process.argv.length !== 3) {
	console.error('Usage: node createBuild.js VERSION');
	process.exit(-1);
}

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

async function main(): Promise<void> {
	const [, , _version] = process.argv;
	const quality = getEnv('VSCODE_QUALITY');
	const commit = getEnv('BUILD_SOURCEVERSION');
	const queuedBy = getEnv('BUILD_QUEUEDBY');
	const sourceBranch = getEnv('BUILD_SOURCEBRANCH');
	const version = _version + (quality === 'stable' ? '' : `-${quality}`);

	console.log('Creating build...');
	console.log('Quality:', quality);
	console.log('Version:', version);
	console.log('Commit:', commit);

	const build = {
		id: commit,
		timestamp: (new Date()).getTime(),
		version,
		isReleased: false,
		private: process.env['VSCODE_PRIVATE_BUILD']?.toLowerCase() === 'true',
		sourceBranch,
		queuedBy,
		assets: [],
		updates: {}
	};

	const aadCredentials = new ClientAssertionCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, () => Promise.resolve(process.env['AZURE_ID_TOKEN']!));
	const client = new CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT']!, aadCredentials });
	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('createBuild').execute('', [{ ...build, _partitionKey: '' }]));
}

main().then(() => {
	console.log('Build successfully created');
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
