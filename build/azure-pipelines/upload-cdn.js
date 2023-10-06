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
const mime = require("mime");
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
mime.define({
    'application/typescript': ['ts'],
    'application/json': ['code-snippets'],
});
// From default AFD configuration
const MimeTypesToCompress = new Set([
    'application/eot',
    'application/font',
    'application/font-sfnt',
    'application/javascript',
    'application/json',
    'application/opentype',
    'application/otf',
    'application/pkcs7-mime',
    'application/truetype',
    'application/ttf',
    'application/typescript',
    'application/vnd.ms-fontobject',
    'application/xhtml+xml',
    'application/xml',
    'application/xml+rss',
    'application/x-font-opentype',
    'application/x-font-truetype',
    'application/x-font-ttf',
    'application/x-httpd-cgi',
    'application/x-javascript',
    'application/x-mpegurl',
    'application/x-opentype',
    'application/x-otf',
    'application/x-perl',
    'application/x-ttf',
    'font/eot',
    'font/ttf',
    'font/otf',
    'font/opentype',
    'image/svg+xml',
    'text/css',
    'text/csv',
    'text/html',
    'text/javascript',
    'text/js',
    'text/markdown',
    'text/plain',
    'text/richtext',
    'text/tab-separated-values',
    'text/xml',
    'text/x-script',
    'text/x-component',
    'text/x-java-source'
]);
function wait(stream) {
    return new Promise((c, e) => {
        stream.on('end', () => c());
        stream.on('error', (err) => e(err));
    });
}
async function main() {
    const files = [];
    const options = (compressed) => ({
        account: process.env.AZURE_STORAGE_ACCOUNT,
        credential,
        container: process.env.VSCODE_QUALITY,
        prefix: commit + '/',
        contentSettings: {
            contentEncoding: compressed ? 'gzip' : undefined,
            cacheControl: 'max-age=31536000, public'
        }
    });
    const all = vfs.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
        .pipe(filter(f => !f.isDirectory()));
    const compressed = all
        .pipe(filter(f => MimeTypesToCompress.has(mime.lookup(f.path))))
        .pipe(gzip({ append: false }))
        .pipe(azure.upload(options(true)));
    const uncompressed = all
        .pipe(filter(f => !MimeTypesToCompress.has(mime.lookup(f.path))))
        .pipe(azure.upload(options(false)));
    const out = es.merge(compressed, uncompressed)
        .pipe(es.through(function (f) {
        console.log('Uploaded:', f.relative);
        files.push(f.relative);
        this.emit('data', f);
    }));
    console.log(`Uploading files to CDN...`); // debug
    await wait(out);
    const listing = new Vinyl({
        path: 'files.txt',
        contents: Buffer.from(files.join('\n')),
        stat: { mode: 0o666 }
    });
    const filesOut = es.readArray([listing])
        .pipe(gzip({ append: false }))
        .pipe(azure.upload(options(true)));
    console.log(`Uploading: files.txt (${files.length} files)`); // debug
    await wait(filesOut);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLWNkbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwbG9hZC1jZG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxtQ0FBbUM7QUFDbkMsK0JBQStCO0FBQy9CLGdDQUFnQztBQUNoQyxzQ0FBc0M7QUFDdEMsa0NBQWtDO0FBQ2xDLDZCQUE2QjtBQUM3Qiw4Q0FBeUQ7QUFDekQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFFNUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ2xELE1BQU0sVUFBVSxHQUFHLElBQUksaUNBQXNCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFFLENBQUMsQ0FBQztBQUVySixJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ1gsd0JBQXdCLEVBQUUsQ0FBQyxJQUFJLENBQUM7SUFDaEMsa0JBQWtCLEVBQUUsQ0FBQyxlQUFlLENBQUM7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsaUNBQWlDO0FBQ2pDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDbkMsaUJBQWlCO0lBQ2pCLGtCQUFrQjtJQUNsQix1QkFBdUI7SUFDdkIsd0JBQXdCO0lBQ3hCLGtCQUFrQjtJQUNsQixzQkFBc0I7SUFDdEIsaUJBQWlCO0lBQ2pCLHdCQUF3QjtJQUN4QixzQkFBc0I7SUFDdEIsaUJBQWlCO0lBQ2pCLHdCQUF3QjtJQUN4QiwrQkFBK0I7SUFDL0IsdUJBQXVCO0lBQ3ZCLGlCQUFpQjtJQUNqQixxQkFBcUI7SUFDckIsNkJBQTZCO0lBQzdCLDZCQUE2QjtJQUM3Qix3QkFBd0I7SUFDeEIseUJBQXlCO0lBQ3pCLDBCQUEwQjtJQUMxQix1QkFBdUI7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