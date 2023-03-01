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
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLWNkbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwbG9hZC1jZG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxtQ0FBbUM7QUFDbkMsK0JBQStCO0FBQy9CLGdDQUFnQztBQUNoQyxzQ0FBc0M7QUFDdEMsa0NBQWtDO0FBQ2xDLDZCQUE2QjtBQUM3Qiw4Q0FBeUQ7QUFDekQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFFNUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUN6RixNQUFNLFVBQVUsR0FBRyxJQUFJLGlDQUFzQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLENBQUM7QUFFckosSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNYLHdCQUF3QixFQUFFLENBQUMsSUFBSSxDQUFDO0lBQ2hDLGtCQUFrQixFQUFFLENBQUMsZUFBZSxDQUFDO0NBQ3JDLENBQUMsQ0FBQztBQUVILGlDQUFpQztBQUNqQyxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ25DLGlCQUFpQjtJQUNqQixrQkFBa0I7SUFDbEIsdUJBQXVCO0lBQ3ZCLHdCQUF3QjtJQUN4QixrQkFBa0I7SUFDbEIsc0JBQXNCO0lBQ3RCLGlCQUFpQjtJQUNqQix3QkFBd0I7SUFDeEIsc0JBQXNCO0lBQ3RCLGlCQUFpQjtJQUNqQix3QkFBd0I7SUFDeEIsK0JBQStCO0lBQy9CLHVCQUF1QjtJQUN2QixpQkFBaUI7SUFDakIscUJBQXFCO0lBQ3JCLDZCQUE2QjtJQUM3Qiw2QkFBNkI7SUFDN0Isd0JBQXdCO0lB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