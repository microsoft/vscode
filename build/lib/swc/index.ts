/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import { Readable } from 'stream';
import { join } from 'path';
import * as gulp from 'gulp';

export function createSwcClientStream() {

	const srcDir = join(__dirname, '../../../src');
	const outDir = join(__dirname, '../../../out');

	const pathConfigAmd = join(__dirname, '.swcrc-amd');
	const pathConfigNoModule = join(__dirname, '.swcrc-no-mod');

	return new class extends Readable {

		private _isStarted = false;

		constructor() {
			super({ objectMode: true, highWaterMark: Number.MAX_SAFE_INTEGER });
		}

		exec() {
			try {
				const out1 = execSync(`npx swc --config-file ${pathConfigAmd} ${srcDir}/ --copy-files --out-dir ${outDir}`, { encoding: 'utf-8' });
				console.log(out1);

				const out2 = execSync(`npx swc --config-file ${pathConfigNoModule} ${srcDir}/vs/base/worker/workerMain.ts --copy-files --out-dir ${outDir}`, { encoding: 'utf-8' });
				console.log(out2);
				return true;
			} catch (error) {
				console.error();
				this.destroy(error);
				return false;
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
	createSwcClientStream().exec();
}
