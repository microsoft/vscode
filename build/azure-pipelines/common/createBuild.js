"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const identity_1 = require("@azure/identity");
const cosmos_1 = require("@azure/cosmos");
const retry_1 = require("./retry");
if (process.argv.length !== 3) {
    console.error('Usage: node createBuild.js VERSION');
    process.exit(-1);
}
function getEnv(name) {
    const result = process.env[name];
    if (typeof result === 'undefined') {
        throw new Error('Missing env: ' + name);
    }
    return result;
}
async function main() {
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
    const aadCredentials = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], aadCredentials });
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('createBuild').execute('', [{ ...build, _partitionKey: '' }]));
}
main().then(() => {
    console.log('Build successfully created');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlQnVpbGQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGVCdWlsZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLDhDQUF5RDtBQUN6RCwwQ0FBNkM7QUFDN0MsbUNBQWdDO0FBRWhDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQzlCLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztJQUNwRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDakI7QUFFRCxTQUFTLE1BQU0sQ0FBQyxJQUFZO0lBQzNCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFakMsSUFBSSxPQUFPLE1BQU0sS0FBSyxXQUFXLEVBQUU7UUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDeEM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxLQUFLLFVBQVUsSUFBSTtJQUNsQixNQUFNLENBQUMsRUFBRSxBQUFELEVBQUcsUUFBUSxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztJQUNwQyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUN6QyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUM3QyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUMxQyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUNsRCxNQUFNLE9BQU8sR0FBRyxRQUFRLEdBQUcsQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQztJQUV2RSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsTUFBTSxLQUFLLEdBQUc7UUFDYixFQUFFLEVBQUUsTUFBTTtRQUNWLFNBQVMsRUFBRSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUU7UUFDakMsT0FBTztRQUNQLFVBQVUsRUFBRSxLQUFLO1FBQ2pCLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssTUFBTTtRQUN0RSxZQUFZO1FBQ1osUUFBUTtRQUNSLE1BQU0sRUFBRSxFQUFFO1FBQ1YsT0FBTyxFQUFFLEVBQUU7S0FDWCxDQUFDO0lBRUYsTUFBTSxjQUFjLEdBQUcsSUFBSSxpQ0FBc0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUUsQ0FBQyxDQUFDO0lBQ3pKLE1BQU0sTUFBTSxHQUFHLElBQUkscUJBQVksQ0FBQyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUN6RyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDckUsTUFBTSxJQUFBLGFBQUssRUFBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsS0FBSyxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxRyxDQUFDO0FBRUQsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtJQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7SUFDMUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUU7SUFDUixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakIsQ0FBQyxDQUFDLENBQUMifQ==