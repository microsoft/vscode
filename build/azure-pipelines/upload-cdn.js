"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const event_stream_1 = __importDefault(require("event-stream"));
const vinyl_1 = __importDefault(require("vinyl"));
const vinyl_fs_1 = __importDefault(require("vinyl-fs"));
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const gulp_gzip_1 = __importDefault(require("gulp-gzip"));
const mime_1 = __importDefault(require("mime"));
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientAssertionCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], () => Promise.resolve(process.env['AZURE_ID_TOKEN']));
mime_1.default.define({
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
        container: '$web',
        prefix: `${process.env.VSCODE_QUALITY}/${commit}/`,
        contentSettings: {
            contentEncoding: compressed ? 'gzip' : undefined,
            cacheControl: 'max-age=31536000, public'
        }
    });
    const all = vinyl_fs_1.default.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
        .pipe((0, gulp_filter_1.default)(f => !f.isDirectory()));
    const compressed = all
        .pipe((0, gulp_filter_1.default)(f => MimeTypesToCompress.has(mime_1.default.lookup(f.path))))
        .pipe((0, gulp_gzip_1.default)({ append: false }))
        .pipe(azure.upload(options(true)));
    const uncompressed = all
        .pipe((0, gulp_filter_1.default)(f => !MimeTypesToCompress.has(mime_1.default.lookup(f.path))))
        .pipe(azure.upload(options(false)));
    const out = event_stream_1.default.merge(compressed, uncompressed)
        .pipe(event_stream_1.default.through(function (f) {
        console.log('Uploaded:', f.relative);
        files.push(f.relative);
        this.emit('data', f);
    }));
    console.log(`Uploading files to CDN...`); // debug
    await wait(out);
    const listing = new vinyl_1.default({
        path: 'files.txt',
        contents: Buffer.from(files.join('\n')),
        stat: { mode: 0o666 }
    });
    const filesOut = event_stream_1.default.readArray([listing])
        .pipe((0, gulp_gzip_1.default)({ append: false }))
        .pipe(azure.upload(options(true)));
    console.log(`Uploading: files.txt (${files.length} files)`); // debug
    await wait(filesOut);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=upload-cdn.js.map