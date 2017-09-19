/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { Application } from 'spectron';
import { SCREENSHOTS_DIR } from '../spectron/application';

function sanitize(name: string): string {
	return name.replace(/[&*:\/]/g, '');
}

export class ScreenCapturer {

	private static counter = 0;
	testName: string = 'default';

	constructor(private application: Application, private suiteName: string) { }

	async capture(name: string): Promise<void> {
		if (!SCREENSHOTS_DIR) {
			return;
		}

		const screenshotPath = path.join(
			SCREENSHOTS_DIR,
			sanitize(this.suiteName),
			sanitize(this.testName),
			`${ScreenCapturer.counter++}-${sanitize(name)}.png`
		);

		const image = await this.application.browserWindow.capturePage();
		await new Promise((c, e) => mkdirp(path.dirname(screenshotPath), err => err ? e(err) : c()));
		await new Promise((c, e) => fs.writeFile(screenshotPath, image, err => err ? e(err) : c()));
	}
}
