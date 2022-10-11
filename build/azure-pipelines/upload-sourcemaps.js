"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const es = __importStar(require("event-stream"));
const vfs = __importStar(require("vinyl-fs"));
const util = __importStar(require("../lib/util"));
// @ts-ignore
const deps = __importStar(require("../lib/dependencies"));
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const root = path.dirname(path.dirname(__dirname));
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
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
            .pipe(util.cleanNodeModules(path.join(root, 'build', '.moduleignore')));
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
