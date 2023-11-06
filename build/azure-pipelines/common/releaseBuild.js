"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const identity_1 = require("@azure/identity");
const cosmos_1 = require("@azure/cosmos");
const retry_1 = require("./retry");
function getEnv(name) {
    const result = process.env[name];
    if (typeof result === 'undefined') {
        throw new Error('Missing env: ' + name);
    }
    return result;
}
function createDefaultConfig(quality) {
    return {
        id: quality,
        frozen: false
    };
}
async function getConfig(client, quality) {
    const query = `SELECT TOP 1 * FROM c WHERE c.id = "${quality}"`;
    const res = await client.database('builds').container('config').items.query(query).fetchAll();
    if (res.resources.length === 0) {
        return createDefaultConfig(quality);
    }
    return res.resources[0];
}
async function main(force) {
    const commit = getEnv('BUILD_SOURCEVERSION');
    const quality = getEnv('VSCODE_QUALITY');
    const aadCredentials = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], aadCredentials });
    if (!force) {
        const config = await getConfig(client, quality);
        console.log('Quality config:', config);
        if (config.frozen) {
            console.log(`Skipping release because quality ${quality} is frozen.`);
            return;
        }
    }
    console.log(`Releasing build ${commit}...`);
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('releaseBuild').execute('', [commit]));
}
const [, , force] = process.argv;
console.log(process.argv);
main(/^true$/i.test(force)).then(() => {
    console.log('Build successfully released');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZUJ1aWxkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmVsZWFzZUJ1aWxkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsOENBQXlEO0FBQ3pELDBDQUE2QztBQUM3QyxtQ0FBZ0M7QUFFaEMsU0FBUyxNQUFNLENBQUMsSUFBWTtJQUMzQixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssV0FBVyxFQUFFLENBQUM7UUFDbkMsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQU9ELFNBQVMsbUJBQW1CLENBQUMsT0FBZTtJQUMzQyxPQUFPO1FBQ04sRUFBRSxFQUFFLE9BQU87UUFDWCxNQUFNLEVBQUUsS0FBSztLQUNiLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLFNBQVMsQ0FBQyxNQUFvQixFQUFFLE9BQWU7SUFDN0QsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLE9BQU8sR0FBRyxDQUFDO0lBRWhFLE1BQU0sR0FBRyxHQUFHLE1BQU0sTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUU5RixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2hDLE9BQU8sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELE9BQU8sR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQVcsQ0FBQztBQUNuQyxDQUFDO0FBRUQsS0FBSyxVQUFVLElBQUksQ0FBQyxLQUFjO0lBQ2pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQzdDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRXpDLE1BQU0sY0FBYyxHQUFHLElBQUksaUNBQXNCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFFLENBQUMsQ0FBQztJQUN6SixNQUFNLE1BQU0sR0FBRyxJQUFJLHFCQUFZLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFFekcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1osTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWhELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFdkMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsT0FBTyxhQUFhLENBQUMsQ0FBQztZQUN0RSxPQUFPO1FBQ1IsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixNQUFNLEtBQUssQ0FBQyxDQUFDO0lBRTVDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNyRSxNQUFNLElBQUEsYUFBSyxFQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRixDQUFDO0FBRUQsTUFBTSxDQUFDLEVBQUUsQUFBRCxFQUFHLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFFakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO0lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pCLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtJQUNSLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDLENBQUMsQ0FBQyJ9