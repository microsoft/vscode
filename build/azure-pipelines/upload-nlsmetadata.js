"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const es = require("event-stream");
const vfs = require("vinyl-fs");
const merge = require("gulp-merge-json");
const gzip = require("gulp-gzip");
const identity_1 = require("@azure/identity");
const path = require("path");
const fs_1 = require("fs");
const azure = require('gulp-azure-storage');
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
function main() {
    return new Promise((c, e) => {
        es.merge(vfs.src('out-vscode-web-min/nls.metadata.json', { base: 'out-vscode-web-min' }), vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }), vfs.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }), vfs.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' }))
            .pipe(merge({
            fileName: 'combined.nls.metadata.json',
            jsonSpace: '',
            concatArrays: true,
            edit: (parsedJson, file) => {
                if (file.base === 'out-vscode-web-min') {
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
        }))
            .pipe(gzip({ append: false }))
            .pipe(vfs.dest('./nlsMetadata'))
            .pipe(es.through(function (data) {
            console.log(`Uploading ${data.path}`);
            // trigger artifact upload
            console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=combined.nls.metadata.json]${data.path}`);
            this.emit('data', data);
        }))
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: 'nlsmetadata',
            prefix: commit + '/',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLW5sc21ldGFkYXRhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXBsb2FkLW5sc21ldGFkYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsbUNBQW1DO0FBRW5DLGdDQUFnQztBQUNoQyx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBQ2xDLDhDQUF5RDtBQUN6RCw2QkFBOEI7QUFDOUIsMkJBQWtDO0FBQ2xDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRTVDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGlDQUFzQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLENBQUM7QUFRckosU0FBUyxJQUFJO0lBQ1osT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUUzQixFQUFFLENBQUMsS0FBSyxDQUNQLEdBQUcsQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEVBQUUsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUMvRSxHQUFHLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLENBQUMsRUFDaEYsR0FBRyxDQUFDLEdBQUcsQ0FBQywrQ0FBK0MsRUFBRSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxDQUFDLEVBQ3ZGLEdBQUcsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO2FBQy9FLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDWCxRQUFRLEVB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