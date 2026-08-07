// Copyright 2025 OpenAI

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//        http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Based on the Codex implementation https://github.com/openai/codex/blob/b73426c1c40187ca13c74c03912a681072c2884f/codex-cli/src/parse-apply-patch.ts#L1

/* eslint-disable header/header */
export type ApplyPatchCreateFileOp = {
	type: 'create';
	path: string;
	content: string;
};

export type ApplyPatchDeleteFileOp = {
	type: 'delete';
	path: string;
};

export type ApplyPatchUpdateFileOp = {
	type: 'update';
	path: string;
	update: string;
	added: number;
	deleted: number;
};

export type ApplyPatchOp =
	| ApplyPatchCreateFileOp
	| ApplyPatchDeleteFileOp
	| ApplyPatchUpdateFileOp;

export const PATCH_PREFIX = '*** Begin Patch\n';
export const PATCH_SUFFIX = '\n*** End Patch';
export const ADD_FILE_PREFIX = '*** Add File: ';
export const DELETE_FILE_PREFIX = '*** Delete File: ';
export const UPDATE_FILE_PREFIX = '*** Update File: ';
export const MOVE_FILE_TO_PREFIX = '*** Move to: ';
export const END_OF_FILE_PREFIX = '*** End of File';
export const HUNK_ADD_LINE_PREFIX = '+';
export const HUNK_DELETE_LINE_PREFIX = '-';

/**
 * @returns null when the patch is invalid
 */
export function parseApplyPatch(patch: string): Array<ApplyPatchOp> | null {
	if (!patch.startsWith(PATCH_PREFIX)) {
		// Patch must begin with '*** Begin Patch'
		return null;
	} else if (!patch.endsWith(PATCH_SUFFIX)) {
		// Patch must end with '*** End Patch'
		return null;
	}

	const patchBody = patch.slice(
		PATCH_PREFIX.length,
		patch.length - PATCH_SUFFIX.length,
	);

	const lines = patchBody.split('\n');

	const ops: Array<ApplyPatchOp> = [];

	for (const line of lines) {
		if (line.startsWith(END_OF_FILE_PREFIX)) {
			continue;
		} else if (line.startsWith(ADD_FILE_PREFIX)) {
			ops.push({
				type: 'create',
				path: line.slice(ADD_FILE_PREFIX.length).trim(),
				content: '',
			});
			continue;
		} else if (line.startsWith(DELETE_FILE_PREFIX)) {
			ops.push({
				type: 'delete',
				path: line.slice(DELETE_FILE_PREFIX.length).trim(),
			});
			continue;
		} else if (line.startsWith(UPDATE_FILE_PREFIX)) {
			ops.push({
				type: 'update',
				path: line.slice(UPDATE_FILE_PREFIX.length).trim(),
				update: '',
				added: 0,
				deleted: 0,
			});
			continue;
		}

		const lastOp = ops[ops.length - 1];

		if (lastOp?.type === 'create') {
			lastOp.content = appendLine(
				lastOp.content,
				line.slice(HUNK_ADD_LINE_PREFIX.length),
			);
			continue;
		}

		if (lastOp?.type !== 'update') {
			// Expected update op but got ${lastOp?.type} for line ${line}
			return null;
		}

		if (line.startsWith(HUNK_ADD_LINE_PREFIX)) {
			lastOp.added += 1;
		} else if (line.startsWith(HUNK_DELETE_LINE_PREFIX)) {
			lastOp.deleted += 1;
		}
		lastOp.update += lastOp.update ? '\n' + line : line;
	}

	return ops;
}

function appendLine(content: string, line: string) {
	if (!content.length) {
		return line;
	}
	return [content, line].join('\n');
}
