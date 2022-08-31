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
const util = require("util");
const gulp = require("gulp");
/**
 * SWC transpile stream. Can be used as stream but `exec` is the prefered way because under the
 * hood this simply shells out to swc-cli. There is room for improvement but this already works.
 * Ideas
 *  * use API, not swc-cli
 *  * invoke binaries directly, don't go through swc-cli
 *  * understand how to configure both setups in one (https://github.com/swc-project/swc/issues/4989)
 */
function createSwcClientStream() {
    const execAsync = util.promisify(child_process_1.exec);
    const cwd = (0, path_1.join)(__dirname, '../../../');
    const srcDir = (0, path_1.join)(__dirname, '../../../src');
    const outDir = (0, path_1.join)(__dirname, '../../../out');
    const pathConfigAmd = (0, path_1.join)(__dirname, '.swcrc-amd');
    const pathConfigNoModule = (0, path_1.join)(__dirname, '.swcrc-no-mod');
    return new class extends stream_1.Readable {
        constructor() {
            super({ objectMode: true, highWaterMark: Number.MAX_SAFE_INTEGER });
            this._isStarted = false;
        }
        async exec(print) {
            const t1 = Date.now();
            const errors = [];
            try {
                const data1 = await execAsync(`npx swc --config-file ${pathConfigAmd} ${srcDir}/ --out-dir ${outDir}`, { encoding: 'utf-8', cwd });
                errors.push(data1.stderr);
                const data2 = await execAsync(`npx swc --config-file ${pathConfigNoModule} ${srcDir}/vs/base/worker/workerMain.ts --out-dir ${outDir}`, { encoding: 'utf-8', cwd });
                errors.push(data2.stderr);
                return true;
            }
            catch (error) {
                console.error(errors);
                console.error(error);
                this.destroy(error);
                return false;
            }
            finally {
                if (print) {
                    console.log(`DONE with SWC after ${Date.now() - t1}ms`);
                }
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
    createSwcClientStream().exec(true);
}
