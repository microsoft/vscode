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
    const commit = process.env['VSCODE_DISTRO_COMMIT'] || getEnv('BUILD_SOURCEVERSION');
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
main(force === 'true').then(() => {
    console.log('Build successfully released');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZUJ1aWxkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmVsZWFzZUJ1aWxkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsOENBQXlEO0FBQ3pELDBDQUE2QztBQUM3QyxtQ0FBZ0M7QUFFaEMsU0FBUyxNQUFNLENBQUMsSUFBWTtJQUMzQixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssV0FBVyxFQUFFO1FBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFDO0tBQ3hDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBT0QsU0FBUyxtQkFBbUIsQ0FBQyxPQUFlO0lBQzNDLE9BQU87UUFDTixFQUFFLEVBQUUsT0FBTztRQUNYLE1BQU0sRUFBRSxLQUFLO0tBQ2IsQ0FBQztBQUNILENBQUM7QUFFRCxLQUFLLFVBQVUsU0FBUyxDQUFDLE1BQW9CLEVBQUUsT0FBZTtJQUM3RCxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsT0FBTyxHQUFHLENBQUM7SUFFaEUsTUFBTSxHQUFHLEdBQUcsTUFBTSxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBRTlGLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQy9CLE9BQU8sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7S0FDcEM7SUFFRCxPQUFPLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFXLENBQUM7QUFDbkMsQ0FBQztBQUVELEtBQUssVUFBVSxJQUFJLENBQUMsS0FBYztJQUNqQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLElBQUksTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDcEYsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFFekMsTUFBTSxjQUFjLEdBQUcsSUFBSSxpQ0FBc0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUUsQ0FBQyxDQUFDO0lBQ3pKLE1BQU0sTUFBTSxHQUFHLElBQUkscUJBQVksQ0FBQyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUV6RyxJQUFJLENBQUMsS0FBSyxFQUFFO1FBQ1gsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWhELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFdkMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2xCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLE9BQU8sYUFBYSxDQUFDLENBQUM7WUFDdEUsT0FBTztTQUNQO0tBQ0Q7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixNQUFNLEtBQUssQ0FBQyxDQUFDO0lBRTVDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNyRSxNQUFNLElBQUEsYUFBSyxFQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRixDQUFDO0FBRUQsTUFBTSxDQUFDLEVBQUUsQUFBRCxFQUFHLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFFakMsSUFBSSxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO0lBQ2hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pCLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtJQUNSLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDLENBQUMsQ0FBQyJ9