/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosClient } from '@azure/cosmos';
import { retry } from './retry.ts';

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
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

async function getConfig(client: CosmosClient, quality: string): Promise<Config> {
	const query = `SELECT TOP 1 * FROM c WHERE c.id = "${quality}"`;

	const res = await client.database('builds').container('config').items.query(query).fetchAll();

	if (res.resources.length === 0) {
		return createDefaultConfig(quality);
	}

	return res.resources[0] as Config;
}

async function main(force: boolean): Promise<'released' | 'skipped'> {
	const commit = getEnv('BUILD_SOURCEVERSION');
	const quality = getEnv('VSCODE_QUALITY');

	const { cosmosDBAccessToken } = JSON.parse(getEnv('PUBLISH_AUTH_TOKENS'));
	const client = new CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT']!, tokenProvider: () => Promise.resolve(`type=aad&ver=1.0&sig=${cosmosDBAccessToken.token}`) });

	if (!force) {
		const config = await getConfig(client, quality);

		console.log('Quality config:', config);

		if (config.frozen) {
			return 'skipped';
		}
	}

	console.log(`Releasing build ${commit}...`);

	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('releaseBuild').execute('', [commit]));
	return 'released';
}

const [, , force] = process.argv;

console.log(process.argv);

main(/^true$/i.test(force)).then(result => {
	if (result === 'skipped') {
		// The step still succeeds, but the build must not read as released
		const quality = getEnv('VSCODE_QUALITY');
		console.log(`##vso[task.logissue type=warning]Build not released, since quality ${quality} is frozen. Release it manually once the quality is unfrozen.`);
		console.log('##vso[build.addbuildtag]release-skipped-frozen');
		console.log(`Build NOT released: quality ${quality} is frozen`);
	} else {
		console.log('Build successfully released');
	}
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
