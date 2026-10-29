/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join } from '../../../../../base/common/path.js';

/**
 * Creates folders that each contain a `file.txt` and a symbolic link to every folder. ripgrep needs
 * exponential time to follow these links because it only detects links that point to an ancestor.
 *
 * @returns the absolute paths of the created files
 */
export async function createCrossLinkedFolders(root: string, folderCount: number, fileContents: string): Promise<string[]> {
	const files: string[] = [];
	for (let i = 0; i < folderCount; i++) {
		const folder = join(root, `${i}`);
		await fs.promises.mkdir(folder, { recursive: true });

		const file = join(folder, 'file.txt');
		await fs.promises.writeFile(file, fileContents);
		files.push(file);

		for (let j = 0; j < folderCount; j++) {
			await fs.promises.symlink(`../${j}`, join(folder, `link${j}`));
		}
	}

	return files;
}
