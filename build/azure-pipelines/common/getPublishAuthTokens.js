"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
const msal_node_1 = require("@azure/msal-node");
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
async function getAccessToken(endpoint, tenantId, clientId, idToken) {
    const app = new msal_node_1.ConfidentialClientApplication({
        auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
            clientAssertion: idToken
        }
    });
    const result = await app.acquireTokenByClientCredential({ scopes: [`${endpoint}.default`] });
    if (!result) {
        throw new Error('Failed to get access token');
    }
    return {
        token: result.accessToken,
        expiresOnTimestamp: result.expiresOn.getTime(),
        refreshAfterTimestamp: result.refreshOn?.getTime()
    };
}
async function main() {
    const cosmosDBAccessToken = await getAccessToken(e('AZURE_DOCUMENTDB_ENDPOINT'), e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_ID_TOKEN'));
    const blobServiceAccessToken = await getAccessToken(`https://${e('VSCODE_STAGING_BLOB_STORAGE_ACCOUNT_NAME')}.blob.core.windows.net/`, process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_ID_TOKEN']);
    console.log(JSON.stringify({ cosmosDBAccessToken, blobServiceAccessToken }));
}
if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=getPublishAuthTokens.js.map