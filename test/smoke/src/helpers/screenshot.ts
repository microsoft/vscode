/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from "../spectron/application";
var fs = require('fs');

const __testTime = new Date().toISOString();

export class Screenshot {
	private index: number = 0;
	private testPath: string;

	constructor(private spectron: SpectronApplication, testName: string, testRetry: number) {
		const testTime = this.sanitizeFolderName(__testTime);
		testName = this.sanitizeFolderName(testName);

		this.testPath = `test_data/screenshots/${testTime}/${testName}/${testRetry}`;
		this.createFolder(this.testPath);
	}

	public async capture(): Promise<any> {
		return new Promise(async (res, rej) => {
			const image: Electron.NativeImage = await this.spectron.app.browserWindow.capturePage();
			fs.writeFile(`${this.testPath}/${this.index}.png`, image, (err) => {
				if (err) {
					rej(err);
				}
				this.index++;
				res();
			});
		});
	}

	private createFolder(name: string): void {
		name.split('/').forEach((folderName, i, fullPath) => {
			const folder = fullPath.slice(0, i + 1).join('/');
			if (!fs.existsSync(folder)) {
				fs.mkdirSync(folder);
			}
		});
	}

	private sanitizeFolderName(name: string): string {
		return name.replace(/[&*:\/]/g, '');
	}
}