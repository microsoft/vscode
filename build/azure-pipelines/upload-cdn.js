"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const es = require("event-stream");
const Vinyl = require("vinyl");
const vfs = require("vinyl-fs");
const filter = require("gulp-filter");
const gzip = require("gulp-gzip");
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
async function main() {
    const files = [];
    const options = {
        account: process.env.AZURE_STORAGE_ACCOUNT,
        credential,
        container: process.env.VSCODE_QUALITY,
        prefix: commit + '/',
        contentSettings: {
            contentEncoding: 'gzip',
            cacheControl: 'max-age=31536000, public'
        }
    };
    await new Promise((c, e) => {
        vfs.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
            .pipe(filter(f => !f.isDirectory()))
            .pipe(gzip({ append: false }))
            .pipe(es.through(function (data) {
            console.log('Uploading:', data.relative); // debug
            files.push(data.relative);
            this.emit('data', data);
        }))
            .pipe(azure.upload(options))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
    await new Promise((c, e) => {
        const listing = new Vinyl({
            path: 'files.txt',
            contents: Buffer.from(files.join('\n')),
            stat: { mode: 0o666 }
        });
        console.log(`Uploading: files.txt (${files.length} files)`); // debug
        es.readArray([listing])
            .pipe(gzip({ append: false }))
            .pipe(azure.upload(options))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLWNkbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwbG9hZC1jZG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxtQ0FBbUM7QUFDbkMsK0JBQStCO0FBQy9CLGdDQUFnQztBQUNoQyxzQ0FBc0M7QUFDdEMsa0NBQWtDO0FBQ2xDLDhDQUF5RDtBQUN6RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUU1QyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ3pGLE1BQU0sVUFBVSxHQUFHLElBQUksaUNBQXNCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFFLENBQUMsQ0FBQztBQUVySixLQUFLLFVBQVUsSUFBSTtJQUNsQixNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFDM0IsTUFBTSxPQUFPLEdBQUc7UUFDZixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUI7UUFDMUMsVUFBVTtRQUNWLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7UUFDckMsTUFBTSxFQUFFLE1BQU0sR0FBRyxHQUFHO1FBQ3BCLGVBQWUsRUFBRTtZQUNoQixlQUFlLEVBQUUsTUFBTTtZQUN2QixZQUFZLEVBQUUsMEJBQTBCO1NBQ3hDO0tBQ0QsQ0FBQztJQUVGLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDaEMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxHQUFHLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDO2FBQ3ZFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO2FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQzthQUM3QixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQVc7WUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUTtZQUNsRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQzthQUNGLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQzNCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7YUFDcEIsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDckMsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDO1lBQ3pCLElBQUksRUFBRSxXQUFXO1lBQ2pCLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBUztTQUM1QixDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixLQUFLLENBQUMsTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVE7UUFDckUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQzthQUM3QixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUMzQixFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQ3BCLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxHQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakIsQ0FBQyxDQUFDLENBQUMifQ==