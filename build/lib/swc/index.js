"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSwcClientStream = void 0;
const child_process_1 = require("child_process");
const stream_1 = require("stream");
const path_1 = require("path");
const gulp = require("gulp");
function createSwcClientStream() {
    const srcDir = (0, path_1.join)(__dirname, '../../../src');
    const outDir = (0, path_1.join)(__dirname, '../../../out');
    const pathConfigAmd = (0, path_1.join)(__dirname, '.swcrc-amd');
    const pathConfigNoModule = (0, path_1.join)(__dirname, '.swcrc-no-mod');
    return new class extends stream_1.Readable {
        constructor() {
            super({ objectMode: true, highWaterMark: Number.MAX_SAFE_INTEGER });
            this._isStarted = false;
        }
        exec() {
            try {
                const out1 = (0, child_process_1.execSync)(`npx swc --config-file ${pathConfigAmd} ${srcDir}/ --copy-files --out-dir ${outDir}`, { encoding: 'utf-8' });
                console.log(out1);
                const out2 = (0, child_process_1.execSync)(`npx swc --config-file ${pathConfigNoModule} ${srcDir}/vs/base/worker/workerMain.ts --copy-files --out-dir ${outDir}`, { encoding: 'utf-8' });
                console.log(out2);
                return true;
            }
            catch (error) {
                console.error();
                this.destroy(error);
                return false;
            }
        }
        async _read(_size) {
            if (this._isStarted) {
                return;
            }
            this._isStarted = true;
            if (!this.exec()) {
                this.push(null);
                return;
            }
            for await (const file of gulp.src(`${outDir}/**/*.js`, { base: outDir })) {
                this.push(file);
            }
            this.push(null);
        }
    };
}
exports.createSwcClientStream = createSwcClientStream;
if (process.argv[1] === __filename) {
    createSwcClientStream().exec();
}
