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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const event_stream_1 = __importDefault(require("event-stream"));
const vinyl_fs_1 = __importDefault(require("vinyl-fs"));
const util = __importStar(require("../lib/util"));
const dependencies_1 = require("../lib/dependencies");
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientAssertionCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], () => Promise.resolve(process.env['AZURE_ID_TOKEN']));
// optionally allow to pass in explicit base/maps to upload
const [, , base, maps] = process.argv;
function src(base, maps = `${base}/**/*.map`) {
    return vinyl_fs_1.default.src(maps, { base })
        .pipe(event_stream_1.default.mapSync((f) => {
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
        const productionDependencies = (0, dependencies_1.getProductionDependencies)(root);
        const productionDependenciesSrc = productionDependencies.map((d) => path_1.default.relative(root, d)).map((d) => `./${d}/**/*.map`);
        const nodeModules = vinyl_fs_1.default.src(productionDependenciesSrc, { base: '.' })
            .pipe(util.cleanNodeModules(path_1.default.join(root, 'build', '.moduleignore')))
            .pipe(util.cleanNodeModules(path_1.default.join(root, 'build', `.moduleignore.${process.platform}`)));
        sources.push(nodeModules);
        const extensionsOut = vinyl_fs_1.default.src(['.build/extensions/**/*.js.map', '!**/node_modules/**'], { base: '.build' });
        sources.push(extensionsOut);
    }
    // specific client base/maps
    else {
        sources.push(src(base, maps));
    }
    return new Promise((c, e) => {
        event_stream_1.default.merge(...sources)
            .pipe(event_stream_1.default.through(function (data) {
            console.log('Uploading Sourcemap', data.relative); // debug
            this.emit('data', data);
        }))
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: '$web',
            prefix: `sourcemaps/${commit}/`
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