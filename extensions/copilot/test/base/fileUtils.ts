/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';

/**
 * @returns file contents (utf8) or undefined if the file does not exist
 *
 * @throws if reading the file fails for any reason other than the file not existing
 */
export async function readFileIfExists(filePath: string): Promise<string | undefined> {
	try {
		const fileContents = await fs.promises.readFile(filePath, 'utf8');
		return fileContents;
	} catch (err) {
		if (err.code === 'ENOENT') {
			return undefined;
		}
		throw err;
	}
}
