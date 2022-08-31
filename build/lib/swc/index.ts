/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { Readable } from 'stream';
import { join } from 'path';
import * as util from 'util';
import * as gulp from 'gulp';

/**
 * SWC transpile stream. Can be used as stream but `exec` is the prefered way because under the
 * hood this simply shells out to swc-cli. There is room for improvement but this already works.
 * Ideas
 *  * use API, not swc-cli
 *  * invoke binaries directly, don't go through swc-cli
 *  * understand how to configure both setups in one (https://github.com/swc-project/swc/issues/4989)
 */
export function createSwcClientStream(): Readable & { exec(print?: boolean): Promise<boolean> } {

	const execAsync = util.promisify(exec);

	const cwd = join(__dirname, '../../../');
	const srcDir = join(__dirname, '../../../src');
	const outDir = join(__dirname, '../../../out');

	const pathConfigAmd = join(__dirname, '.swcrc-amd');
	const pathConfigNoModule = join(__dirname, '.swcrc-no-mod');

	return new class extends Readable {

		private _isStarted = false;

		constructor() {
			super({ objectMode: true, highWaterMark: Number.MAX_SAFE_INTEGER });
		}

		async exec(print?: boolean) {
			const t1 = Date.now();
			const errors: string[] = [];
			try {
				const data1 = await execAsync(`npx swc --config-file ${pathConfigAmd} ${srcDir}/ --out-dir ${outDir}`, { encoding: 'utf-8', cwd });
				errors.push(data1.stderr);

				const data2 = await execAsync(`npx swc --config-file ${pathConfigNoModule} ${srcDir}/vs/base/worker/workerMain.ts --out-dir ${outDir}`, { encoding: 'utf-8', cwd });
				errors.push(data2.stderr);
				return true;
			} catch (error) {
				console.error(errors);
				console.error(error);
				this.destroy(error);
				return false;
			} finally {
				if (print) {
					console.log(`DONE with SWC after ${Date.now() - t1}ms`);
				}
			}
		}

		async _read(_size: number): Promise<void> {
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

if (process.argv[1] === __filename) {
	createSwcClientStream().exec(true);
}
