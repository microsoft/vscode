"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const identity_1 = require("@azure/identity");
const https = require("https");
const dotenv = require("dotenv");
async function main([username, password]) {
    const credential = new identity_1.ClientSecretCredential('72f988bf-86f1-41af-91ab-2d7cd011db47', username, password);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const body = JSON.stringify({
        ReleaseId: '36df8da5-4670-4b9f-acd3-c53de62ea93d',
        PortalName: 'VSCode',
        PublisherCode: 'VSCode',
        ProvisionedFilesCollection: [{
                PublisherKey: '2fa7b08c-d022-4165-846f-6f5bfaab4479',
                IsStaticFriendlyFileName: true,
                FriendlyFileName: 'test/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz',
                MaxTTL: '1440',
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
        }, res => {
            console.log('STATUS', res.statusCode);
            // if (res.statusCode !== 200) {
            // 	return e(new Error(`Unexpected status code: ${res.statusCode}`));
            // }
            // https://vscode.download.prss.microsoft.com/dbazure/download/test/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
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
        req.on('error', e);
        req.write(body);
        req.end();
    });
}
exports.main = main;
if (require.main === module) {
    dotenv.config();
    main([
        process.env['AZURE_CLIENT_ID'],
        process.env['AZURE_CLIENT_SECRET']
    ]).then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvdmlzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLDhDQUF5RDtBQUN6RCwrQkFBK0I7QUFDL0IsaUNBQWlDO0FBRTFCLEtBQUssVUFBVSxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFXO0lBQ3hELE1BQU0sVUFBVSxHQUFHLElBQUksaUNBQXNCLENBQUMsc0NBQXNDLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFHLE1BQU0sV0FBVyxHQUFHLE1BQU0sVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLG1FQUFtRSxDQUFDLENBQUMsQ0FBQztJQUVySCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQzNCLFNBQVMsRUFBRSxzQ0FBc0M7UUFDakQsVUFBVSxFQUFFLFFBQVE7UUFDcEIsYUFBYSxFQUFFLFFBQVE7UUFDdkIsMEJBQTBCLEVBQUUsQ0FBQztnQkFDNUIsWUFBWSxFQUFFLHNDQUFzQztnQkFDcEQsd0JBQXdCLEVBQUUsSUFBSTtnQkFDOUIsZ0JBQWdCLEVBQUUsK0VBQStFO2dCQUNqRyxNQUFNLEVBQUUsTUFBTTtnQkFDZCxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUM7YUFDcEIsQ0FBQztLQUNGLENBQUMsQ0FBQztJQUVILE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDaEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxxRkFBcUYsRUFBRTtZQUNoSCxNQUFNLEVBQUUsTUFBTTtZQUNkLE9BQU8sRUFBRTtnQkFDUixlQUFlLEVBQUUsVUFBVSxXQUFXLENBQUMsS0FBSyxFQUFFO2dCQUM5QyxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsTUFBTTthQUM3QjtTQUNELEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDUixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFdEMsZ0NBQWdDO1lBQ2hDLHFFQUFxRTtZQUNyRSxJQUFJO1lBRUosNElBQTRJO1lBRTVJLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztZQUM1QixHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUM1QyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUU7Z0JBQ2xCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBRTlDLElBQUksQ0FBQztvQkFDSixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNsQixDQUFDLEVBQUUsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2QsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNSLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQixHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFyREQsb0JBcURDO0FBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUVoQixJQUFJLENBQUM7UUFDSixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFO1FBQy9CLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUU7S0FDbkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7UUFDWixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pCLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtRQUNSLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMifQ==