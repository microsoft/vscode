/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

export function buildDate(outDir: string) {
	const result = () => new Promise<void>((resolve, _) => {
		const root = path.join(__dirname, '..', '..');

		const outDirectory = path.join(root, outDir);
		fs.mkdirSync(outDirectory, { recursive: true });

		const date = new Date().toISOString();
		fs.writeFileSync(path.join(outDirectory, 'date'), date, 'utf8');

		resolve();
	});
	result.taskName = 'build-date-file';
	return result;
}
