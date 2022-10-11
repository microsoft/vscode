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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const es = __importStar(require("event-stream"));
const vinyl_1 = __importDefault(require("vinyl"));
const vfs = __importStar(require("vinyl-fs"));
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const gulp_gzip_1 = __importDefault(require("gulp-gzip"));
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
async function main() {
    const files = [];
    const options = {
        account: process.env.AZURE_STORAGE_ACCOUNT,
        credential,
        container: process.env.VSCODE_QUALITY,
        prefix: commit + '/',
        contentSettings: {
            contentEncoding: 'gzip',
            cacheControl: 'max-age=31536000, public'
        }
    };
    await new Promise((c, e) => {
        vfs.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
            .pipe((0, gulp_filter_1.default)(f => !f.isDirectory()))
            .pipe((0, gulp_gzip_1.default)({ append: false }))
            .pipe(es.through(function (data) {
            console.log('Uploading:', data.relative); // debug
            files.push(data.relative);
            this.emit('data', data);
        }))
            .pipe(azure.upload(options))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
    await new Promise((c, e) => {
        const listing = new vinyl_1.default({
            path: 'files.txt',
            contents: Buffer.from(files.join('\n')),
            stat: { mode: 0o666 }
        });
        console.log(`Uploading: files.txt (${files.length} files)`); // debug
        es.readArray([listing])
            .pipe((0, gulp_gzip_1.default)({ append: false }))
            .pipe(azure.upload(options))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
