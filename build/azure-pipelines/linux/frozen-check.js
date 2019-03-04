/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const documentdb_1 = require("documentdb");
function createDefaultConfig(quality) {
    return {
        id: quality,
        frozen: false
    };
}
function getConfig(quality) {
    const client = new documentdb_1.DocumentClient(process.env['AZURE_DOCUMENTDB_ENDPOINT'], { masterKey: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
    const collection = 'dbs/builds/colls/config';
    const query = {
        query: `SELECT TOP 1 * FROM c WHERE c.id = @quality`,
        parameters: [
            { name: '@quality', value: quality }
        ]
    };
    return new Promise((c, e) => {
        client.queryDocuments(collection, query).toArray((err, results) => {
            if (err && err.code !== 409) {
                return e(err);
            }
            c(!results || results.length === 0 ? createDefaultConfig(quality) : results[0]);
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
