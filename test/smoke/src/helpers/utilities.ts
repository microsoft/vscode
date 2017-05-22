/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var fs = require('fs');
var rimraf = require('rimraf');

/**
 * Contains methods that are commonly used across test areas.
 */
export class Util {
	constructor() {
		// noop
	}

	public removeFile(filePath: string): void {
		try {
			fs.unlinkSync(`${filePath}`);
		} catch (e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}
	}

	public rimraf(directory: string): Promise<any> {
		return new Promise((res, rej) => {
			rimraf(directory, (err) => {
				if (err) {
					rej(err);
				}
				res();
			});
		});
	}
}