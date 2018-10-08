/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DocumentClient } from 'documentdb';

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
	const client = new DocumentClient(process.env['AZURE_DOCUMENTDB_ENDPOINT']!, { masterKey: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
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

getConfig(process.argv[2])
	.then(config => {
		console.log(config.frozen);
		process.exit(0);
	})
	.catch(err => {
		console.error(err);
		process.exit(1);
	});