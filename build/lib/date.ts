/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';

const root = path.join(import.meta.dirname, '..', '..');

/**
 * Writes a `outDir/date` file with the contents of the build
 * so that other tasks during the build process can use it and
 * all use the same date.
 */
export function writeISODate(outDir: string) {
	const result = () => new Promise<void>((resolve, _) => {
		const outDirectory = path.join(root, outDir);
		fs.mkdirSync(outDirectory, { recursive: true });

		const date = new Date().toISOString();
		fs.writeFileSync(path.join(outDirectory, 'date'), date, 'utf8');

		resolve();
	});
	result.taskName = 'build-date-file';
	return result;
}

export function readISODate(outDir: string): string {
	const outDirectory = path.join(root, outDir);
	return fs.readFileSync(path.join(outDirectory, 'date'), 'utf8');
}
