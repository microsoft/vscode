/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const es = require("event-stream");
const vfs = require("vinyl-fs");
const util = require("../lib/util");
const merge = require("gulp-merge-json");
const azure = require('gulp-azure-storage');
const root = path.dirname(path.dirname(__dirname));
const commit = util.getVersion(root);
function main() {
    return es.merge(vfs.src('out-vscode-min/nls.metadata.json', { base: 'out-vscode-min' }), vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }), vfs.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }), vfs.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' }))
        .pipe(merge({
        fileName: 'combined.nls.metadata.json',
        edit: (parsedJson, file) => {
            let key;
            if (file.base === 'out-vscode-min') {
                return { vscode: parsedJson };
            }
            // Handle extensions and follow the same structure as the Core nls file.
            switch (file.basename) {
                case 'package.nls.json':
                    // put package.nls.json content in Core NlsMetadata format
                    parsedJson = {
                        messages: {
                            'package.nls.json': Object.values(parsedJson)
                        },
                        keys: {
                            'package.nls.json': Object.keys(parsedJson)
                        }
                    };
                    break;
                case 'nls.metadata.header.json':
                    parsedJson = { header: parsedJson };
                    break;
                case 'nls.metadata.json':
                    // put nls.metadata.json content in Core NlsMetadata format
                    const modules = Object.keys(parsedJson);
                    const json = {
                        keys: {},
                        messages: {}
                    };
                    for (const module of modules) {
                        json.messages[module] = parsedJson[module].messages;
                        json.keys[module] = parsedJson[module].keys;
                    }
                    parsedJson = json;
                    break;
            }
            key = 'vscode.' + file.relative.split('/')[0];
            return { [key]: parsedJson };
        },
    }))
        .pipe(vfs.dest('./nlsMetadata'))
        .pipe(es.through(function (data) {
        console.log(`Uploading ${data.path}`);
        // trigger artifact upload
        console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=combined.nls.metadata.json]${data.path}`);
        this.emit('data', data);
    }))
        .pipe(azure.upload({
        account: process.env.AZURE_STORAGE_ACCOUNT,
        key: process.env.AZURE_STORAGE_ACCESS_KEY,
        container: 'nlsmetadata',
        prefix: commit + '/'
    }));
}
main();
