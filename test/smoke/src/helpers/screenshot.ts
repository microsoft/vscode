/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { Application } from 'spectron';
import { sanitize } from './utilities';

export class ScreenCapturer {

	private static counter = 0;

	constructor(
		private application: Application,
		public suiteName: string,
		private screenshotsDirPath: string | undefined,
	) { }

	async capture(name: string): Promise<void> {
		if (!this.screenshotsDirPath) {
			return;
		}

		const screenshotPath = path.join(
			this.screenshotsDirPath,
			sanitize(this.suiteName),
			`${ScreenCapturer.counter++}-${sanitize(name)}.png`
		);

		const image = await this.application.browserWindow.capturePage();
		await new Promise((c, e) => mkdirp(path.dirname(screenshotPath), err => err ? e(err) : c()));
		await new Promise((c, e) => fs.writeFile(screenshotPath, image, err => err ? e(err) : c()));
	}
}
