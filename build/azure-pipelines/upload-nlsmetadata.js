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
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLW5sc21ldGFkYXRhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXBsb2FkLW5sc21ldGFkYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsbUNBQW1DO0FBRW5DLGdDQUFnQztBQUNoQyx5Q0FBeUM7QUFDekMsa0NBQWtDO0FBQ2xDLDhDQUF5RDtBQUN6RCw2QkFBOEI7QUFDOUIsMkJBQWtDO0FBQ2xDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRTVDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDekYsTUFBTSxVQUFVLEdBQUcsSUFBSSxpQ0FBc0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUUsQ0FBQyxDQUFDO0FBUXJKLFNBQVMsSUFBSTtJQUNaLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFFM0IsRUFBRSxDQUFDLEtBQUssQ0FDUCxHQUFHLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFDL0UsR0FBRyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsRUFBRSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxDQUFDLEVBQ2hGLEdBQUcsQ0FBQyxHQUFHLENBQUMsK0NBQStDLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxFQUN2RixHQUFHLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQzthQUMvRSxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ1gsUUFBUSxFQUFFLDRCQUE0QjtZQUN0QyxTQUFTLEVBQUUsRUFBRTtZQUNiLFlBQVksRUFBRSxJQUFJO1lBQ2xCLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRTtnQkFDMUIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLG9CQUFvQixFQUFFO29CQUN2QyxPQUFPLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDO2lCQUM5QjtnQkFFRCx3RUFBd0U7Z0JBQ3hFLFFBQVEsSUFBSSxDQUFDLFFBQVEsRUFBRTtvQkFDdEIsS0FBSyxrQkFBa0I7d0JBQ3RCLDBEQUEwRDt3QkFDMUQsdURBQXVEO3dCQUN2RCw2Q0FBNkM7d0JBQzdDLFVBQVUsR0FBRzs0QkFDWixRQUFRLEVBQUU7Z0NBQ1QsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDOzZCQUNsQzs0QkFDRCxJQUFJLEVBQUU7Z0NBQ0wsT0FBTyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDOzZCQUNoQzs0QkFDRCxPQUFPLEVBQUU7Z0NBQ1IsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDOzZCQUNqQjt5QkFDRCxDQUFDO3dCQUNGLE1BQU07b0JBRVAsS0FBSywwQkFBMEI7d0JBQzlCLFVBQVUsR0FBRyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQzt3QkFDcEMsTUFBTTtvQkFFUCxLQUFLLG1CQUFtQixDQUFDLENBQUM7d0JBQ3pCLDJEQUEyRDt3QkFDM0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFFeEMsTUFBTSxJQUFJLEdBQWdCOzRCQUN6QixJQUFJLEVBQUUsRUFBRTs0QkFDUixRQUFRLEVBQUUsRUFBRTs0QkFDWixPQUFPLEVBQUU7Z0NBQ1IsSUFBSSxFQUFFLEVBQUU7NkJBQ1I7eUJBQ0QsQ0FBQzt3QkFDRixLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRTs0QkFDN0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDOzRCQUNwRCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUM7NEJBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzt5QkFDL0I7d0JBQ0QsVUFBVSxHQUFHLElBQUksQ0FBQzt3QkFDbEIsTUFBTTtxQkFDTjtpQkFDRDtnQkFFRCwyQ0FBMkM7Z0JBQzNDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyRSxNQUFNLFFBQVEsR0FBRyxJQUFBLGlCQUFZLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQzlFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzFDLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxTQUFTLEdBQUcsR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7Z0JBQzdELE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQzlCLENBQUM7U0FDRCxDQUFDLENBQUM7YUFDRixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7YUFDN0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7YUFDL0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFXO1lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUN0QywwQkFBMEI7WUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2RkFBNkYsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDdEgsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUM7YUFDRixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUI7WUFDMUMsVUFBVTtZQUNWLFNBQVMsRUFBRSxhQUFhO1lBQ3hCLE1BQU0sRUFBRSxNQUFNLEdBQUcsR0FBRztZQUNwQixlQUFlLEVBQUU7Z0JBQ2hCLGVBQWUsRUFBRSxNQUFNO2dCQUN2QixZQUFZLEVBQUUsMEJBQTBCO2FBQ3hDO1NBQ0QsQ0FBQyxDQUFDO2FBQ0YsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUNwQixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNyQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDbEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pCLENBQUMsQ0FBQyxDQUFDIn0=