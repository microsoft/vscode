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
    const sources = [];
    // vscode client maps (default)
    if (!base) {
        const vs = src('out-vscode-min'); // client source-maps only
        sources.push(vs);
        const productionDependencies = deps.getProductionDependencies(root);
        const productionDependenciesSrc = productionDependencies.map(d => path.relative(root, d.path)).map(d => `./${d}/**/*.map`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLXNvdXJjZW1hcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1cGxvYWQtc291cmNlbWFwcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLDZCQUE2QjtBQUM3QixtQ0FBbUM7QUFFbkMsZ0NBQWdDO0FBQ2hDLG9DQUFvQztBQUNwQyxhQUFhO0FBQ2IsNENBQTRDO0FBQzVDLDhDQUF5RDtBQUN6RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUU1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNuRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDbEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxpQ0FBc0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUUsQ0FBQyxDQUFDO0FBRXJKLDJEQUEyRDtBQUMzRCxNQUFNLENBQUMsRUFBRSxBQUFELEVBQUcsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFFdEMsU0FBUyxHQUFHLENBQUMsSUFBWSxFQUFFLElBQUksR0FBRyxHQUFHLElBQUksV0FBVztJQUNuRCxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUM7U0FDNUIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFRLEVBQUUsRUFBRTtRQUM3QixDQUFDLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7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