/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { MockFileSystemService } from '../../../filesystem/node/test/mockFileSystemService';

/**
 * A single mock file entry: an absolute filesystem path and the file's
 * contents as an array of lines (joined with `\n`).
 *
 * Mirrors the `IMockFileEntry` shape used by core's
 * `src/vs/workbench/contrib/chat/test/common/promptSyntax/testUtils/mockFilesystem.ts`.
 */
export interface IMockFileEntry {
	readonly path: string;
	readonly contents: readonly string[];
}

/**
 * Populate a {@link MockFileSystemService} with the given file entries.
 *
 * Each entry's parent directories are registered (so `readDirectory` on
 * any ancestor returns the correct child listing) and the file contents
 * are written. Pass an empty `contents` array to register an empty file —
 * useful for marker files like `.git/HEAD` whose existence (rather than
 * contents) is what the test cares about.
 */
export async function mockFiles(fileSystem: MockFileSystemService, entries: readonly IMockFileEntry[]): Promise<void> {
	for (const entry of entries) {
		const uri = URI.file(entry.path);
		// Recursively register all ancestor directories so each
		// grandparent's listing contains the next path component.
		await fileSystem.createDirectory(dirname(uri));
		// Writing the file also registers it in its immediate parent's listing.
		const text = entry.contents.join('\n');
		await fileSystem.writeFile(uri, new TextEncoder().encode(text));
	}
}
