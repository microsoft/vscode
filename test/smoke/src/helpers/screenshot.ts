/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { Application } from 'spectron';
import { SCREENSHOTS_DIR } from '../spectron/application';
import { mkdirp } from './utilities';

export interface IScreenshot {
	capture(name: string): Promise<void>;
}

export class Screenshot implements IScreenshot {

	private location: string;

	constructor(private application: Application, private relativeLocation: string = '') {
		this.relativeLocation = this.sanitizeFolderName(this.relativeLocation);
	}

	public async capture(name: string): Promise<void> {
		if (!this.location) {
			await this.createLocation();
		}
		const image = await this.application.browserWindow.capturePage();
		await new Promise((c, e) => fs.writeFile(`${this.location}/${name}.png`, image, err => err ? e(err) : c()));
	}

	private async createLocation(): Promise<void> {
		this.location = this.relativeLocation ? path.join(SCREENSHOTS_DIR, this.relativeLocation) : SCREENSHOTS_DIR;
		await mkdirp(this.location);
	}

	private sanitizeFolderName(name: string): string {
		return name.replace(/[&*:\/]/g, '');
	}
}

export class NullScreenshot implements IScreenshot {

	public async capture(name: string): Promise<void> {
		return Promise.resolve();
	}

}