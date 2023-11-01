"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const identity_1 = require("@azure/identity");
const https = require("https");
async function main([username, password]) {
    const credential = new identity_1.ClientSecretCredential('72f988bf-86f1-41af-91ab-2d7cd011db47', username, password);
    const accessToken = await credential.getToken('https://microsoft.onmicrosoft.com/DS.ProvisioningUAT.WebApi/.default');
    const body = JSON.stringify({
        ReleaseId: '36df8da5-4670-4b9f-acd3-c53de62ea93d',
        PortalName: 'VSCode',
        PublisherCode: 'VSCode',
        ProvisionedFilesCollection: [{
                PublisherKey: '2fa7b08c-d022-4165-846f-6f5bfaab4479',
                IsStaticFriendlyFileName: true,
                FriendlyFileName: '/_test/stable/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz',
                MaxTTL: '31536000',
                CdnMappings: ['ECN']
            }]
    });
    await new Promise((c, e) => {
        const req = https.request(`https://dsprovisionapi.microsoft.com/api/v2/ProvisionedFiles/CreateProvisionedFiles`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json',
                'Content-Length': body.length
            }
        });
        req.on('error', e);
        req.on('response', res => {
            if (res.statusCode !== 200) {
                return e(new Error(`Unexpected status code: ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                console.log(chunks);
                const body = Buffer.concat(chunks).toString();
                try {
                    const json = JSON.parse(body);
                    console.log(json);
                    c();
                }
                catch (err) {
                    e(err);
                }
            });
        });
        req.end(body, 'utf8');
    });
}
exports.main = main;
if (require.main === module) {
    main(process.argv.slice(2));
    process.exit(0);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvdmlzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLDhDQUF5RDtBQUN6RCwrQkFBK0I7QUFFeEIsS0FBSyxVQUFVLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQVc7SUFDeEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxpQ0FBc0IsQ0FBQyxzQ0FBc0MsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUcsTUFBTSxXQUFXLEdBQUcsTUFBTSxVQUFVLENBQUMsUUFBUSxDQUFDLHNFQUFzRSxDQUFDLENBQUM7SUFFdEgsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUMzQixTQUFTLEVBQUUsc0NBQXNDO1FBQ2pELFVBQVUsRUFBRSxRQUFRO1FBQ3BCLGFBQWEsRUFBRSxRQUFRO1FBQ3ZCLDBCQUEwQixFQUFFLENBQUM7Z0JBQzVCLFlBQVksRUFBRSxzQ0FBc0M7Z0JBQ3BELHdCQUF3QixFQUFFLElBQUk7Z0JBQzlCLGdCQUFnQixFQUFFLHdGQUF3RjtnQkFDMUcsTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLFdBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQzthQUNwQixDQUFDO0tBQ0YsQ0FBQyxDQUFDO0lBRUgsTUFBTSxJQUFJLE9BQU8sQ0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNoQyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLHFGQUFxRixFQUFFO1lBQ2hILE1BQU0sRUFBRSxNQUFNO1lBQ2QsT0FBTyxFQUFFO2dCQUNSLGVBQWUsRUFBRSxVQUFVLFdBQVcsQ0FBQyxLQUFLLEVBQUU7Z0JBQzlDLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxNQUFNO2FBQzdCO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDeEIsSUFBSSxHQUFHLENBQUMsVUFBVSxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUM1QixPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQywyQkFBMkIsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsRSxDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1lBQzVCLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzVDLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRTtnQkFDbEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFFOUMsSUFBSSxDQUFDO29CQUNKLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2xCLENBQUMsRUFBRSxDQUFDO2dCQUNMLENBQUM7Z0JBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztvQkFDZCxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ1IsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFuREQsb0JBbURDO0FBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzdCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVCLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakIsQ0FBQyJ9