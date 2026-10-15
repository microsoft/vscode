/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute, resolve } from '../../../../base/common/path.js';
import { FileEditKind } from '../../common/state/sessionState.js';

export interface ICodexPatchFile {
	readonly path: string;
	readonly kind: FileEditKind;
	readonly originalPath?: string;
}

/** Reads operation headers and resolves patch paths against the tool's working directory. */
export function parseCodexApplyPatch(patch: string, cwd: string): { files: ICodexPatchFile[]; patch: string } {
	const lines = patch.trim().split(/\r?\n/);
	if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
		throw new Error('Invalid apply_patch envelope');
	}
	const files: ICodexPatchFile[] = [];
	for (let index = 1; index < lines.length - 1; index++) {
		const line = lines[index];
		const header = /^\*\*\* (?<operation>Add File|Update File|Delete File|Move to): (?<path>.+)$/.exec(line);
		if (!header?.groups) {
			if (line.startsWith('*** Environment:')) {
				throw new Error('Edit tracking does not support remote apply_patch environments');
			}
			continue;
		}
		const path = resolve(cwd, header.groups.path.trim());
		if (!isAbsolute(cwd) || !header.groups.path.trim()) {
			throw new Error('apply_patch paths require an absolute working directory');
		}
		lines[index] = `*** ${header.groups.operation}: ${path}`;
		if (header.groups.operation === 'Move to') {
			const previous = files.at(-1);
			if (!previous || previous.kind !== FileEditKind.Edit) {
				throw new Error('apply_patch move must follow an update');
			}
			files[files.length - 1] = { path, originalPath: previous.path, kind: FileEditKind.Rename };
		} else {
			const kind = header.groups.operation === 'Add File' ? FileEditKind.Create
				: header.groups.operation === 'Delete File' ? FileEditKind.Delete : FileEditKind.Edit;
			files.push({ path, kind });
		}
	}
	const filesByPath = new Map<string, ICodexPatchFile>();
	for (const file of files) {
		if (!filesByPath.has(file.path)) {
			filesByPath.set(file.path, file);
		}
	}
	return { files: [...filesByPath.values()], patch: lines.join('\n') };
}
