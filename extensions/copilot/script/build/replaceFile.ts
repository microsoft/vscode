/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

// Files of installed packages can be hard links into pnpm's shared store: pnpm links package
// files from its store on file systems without copy-on-write clones (such as ext4 and NTFS).
// Writing into such a file changes the store and every project and worktree that uses it, so
// these helpers replace the file with a new one instead of writing into it.

/**
 * Writes `content` to a new file next to `filePath` and renames it over `filePath`.
 */
export async function writeFileReplacing(filePath: string, content: string | Uint8Array): Promise<void> {
	const tempPath = `${filePath}.${process.pid}.tmp`;
	await fs.promises.writeFile(tempPath, content);
	try {
		await fs.promises.rename(tempPath, filePath);
	} catch (err) {
		await fs.promises.rm(tempPath, { force: true });
		throw err;
	}
}

/**
 * Copies `source` to a new file at `target`, removing an existing `target` first.
 */
export async function copyFileReplacing(source: string, target: string): Promise<void> {
	await fs.promises.rm(target, { force: true });
	await fs.promises.copyFile(source, target);
}
