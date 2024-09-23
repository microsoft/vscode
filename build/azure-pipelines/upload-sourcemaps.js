"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const es = require("event-stream");
const vfs = require("vinyl-fs");
const util = require("../lib/util");
const amd_1 = require("../lib/amd");
// @ts-ignore
const deps = require("../lib/dependencies");
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const root = path.dirname(path.dirname(__dirname));
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
// optionally allow to pass in explicit base/maps to upload
const [, , base, maps] = process.argv;
function src(base, maps = `${base}/**/*.map`) {
    return vfs.src(maps, { base })
        .pipe(es.mapSync((f) => {
        f.path = `${f.base}/core/${f.relative}`;
        return f;
    }));
}
function main() {
    if ((0, amd_1.isAMD)()) {
        return Promise.resolve(); // in AMD we run into some issues, but we want to unblock the build for recovery
    }
    const sources = [];
    // vscode client maps (default)
    if (!base) {
        const vs = src('out-vscode-min'); // client source-maps only
        sources.push(vs);
        const productionDependencies = deps.getProductionDependencies(root);
        const productionDependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => `./${d}/**/*.map`);
        const nodeModules = vfs.src(productionDependenciesSrc, { base: '.' })
            .pipe(util.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
            .pipe(util.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`)));
        sources.push(nodeModules);
        const extensionsOut = vfs.src(['.build/extensions/**/*.js.map', '!**/node_modules/**'], { base: '.build' });
        sources.push(extensionsOut);
    }
    // specific client base/maps
    else {
        sources.push(src(base, maps));
    }
    return new Promise((c, e) => {
        es.merge(...sources)
            .pipe(es.through(function (data) {
            console.log('Uploading Sourcemap', data.relative); // debug
            this.emit('data', data);
        }))
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: 'sourcemaps',
            prefix: commit + '/'
        }))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=upload-sourcemaps.js.map