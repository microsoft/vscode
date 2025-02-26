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
const vinyl_fs_1 = __importDefault(require("vinyl-fs"));
const gulp_merge_json_1 = __importDefault(require("gulp-merge-json"));
const gulp_gzip_1 = __importDefault(require("gulp-gzip"));
const identity_1 = require("@azure/identity");
const path = require("path");
const fs_1 = require("fs");
const azure = require('gulp-azure-storage');
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientAssertionCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], () => Promise.resolve(process.env['AZURE_ID_TOKEN']));
function main() {
    return new Promise((c, e) => {
        const combinedMetadataJson = event_stream_1.default.merge(
        // vscode: we are not using `out-build/nls.metadata.json` here because
        // it includes metadata for translators for `keys`. but for our purpose
        // we want only the `keys` and `messages` as `string`.
        event_stream_1.default.merge(vinyl_fs_1.default.src('out-build/nls.keys.json', { base: 'out-build' }), vinyl_fs_1.default.src('out-build/nls.messages.json', { base: 'out-build' }))
            .pipe((0, gulp_merge_json_1.default)({
            fileName: 'vscode.json',
            jsonSpace: '',
            concatArrays: true,
            edit: (parsedJson, file) => {
                if (file.base === 'out-build') {
                    if (file.basename === 'nls.keys.json') {
                        return { keys: parsedJson };
                    }
                    else {
                        return { messages: parsedJson };
                    }
                }
            }
        })), 
        // extensions
        vinyl_fs_1.default.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }), vinyl_fs_1.default.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }), vinyl_fs_1.default.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' })).pipe((0, gulp_merge_json_1.default)({
            fileName: 'combined.nls.metadata.json',
            jsonSpace: '',
            concatArrays: true,
            edit: (parsedJson, file) => {
                if (file.basename === 'vscode.json') {
                    return { vscode: parsedJson };
                }
                // Handle extensions and follow the same structure as the Core nls file.
                switch (file.basename) {
                    case 'package.nls.json':
                        // put package.nls.json content in Core NlsMetadata format
                        // language packs use the key "package" to specify that
                        // translations are for the package.json file
                        parsedJson = {
                            messages: {
                                package: Object.values(parsedJson)
                            },
                            keys: {
                                package: Object.keys(parsedJson)
                            },
                            bundles: {
                                main: ['package']
                            }
                        };
                        break;
                    case 'nls.metadata.header.json':
                        parsedJson = { header: parsedJson };
                        break;
                    case 'nls.metadata.json': {
                        // put nls.metadata.json content in Core NlsMetadata format
                        const modules = Object.keys(parsedJson);
                        const json = {
                            keys: {},
                            messages: {},
                            bundles: {
                                main: []
                            }
                        };
                        for (const module of modules) {
                            json.messages[module] = parsedJson[module].messages;
                            json.keys[module] = parsedJson[module].keys;
                            json.bundles.main.push(module);
                        }
                        parsedJson = json;
                        break;
                    }
                }
                // Get extension id and use that as the key
                const folderPath = path.join(file.base, file.relative.split('/')[0]);
                const manifest = (0, fs_1.readFileSync)(path.join(folderPath, 'package.json'), 'utf-8');
                const manifestJson = JSON.parse(manifest);
                const key = manifestJson.publisher + '.' + manifestJson.name;
                return { [key]: parsedJson };
            },
        }));
        const nlsMessagesJs = vinyl_fs_1.default.src('out-build/nls.messages.js', { base: 'out-build' });
        event_stream_1.default.merge(combinedMetadataJson, nlsMessagesJs)
            .pipe((0, gulp_gzip_1.default)({ append: false }))
            .pipe(vinyl_fs_1.default.dest('./nlsMetadata'))
            .pipe(event_stream_1.default.through(function (data) {
            console.log(`Uploading ${data.path}`);
            // trigger artifact upload
            console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=${data.basename}]${data.path}`);
            this.emit('data', data);
        }))
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: '$web',
            prefix: `nlsmetadata/${commit}/`,
            contentSettings: {
                contentEncoding: 'gzip',
                cacheControl: 'max-age=31536000, public'
            }
        }))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=upload-nlsmetadata.js.map