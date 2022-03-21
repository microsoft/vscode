/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
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
