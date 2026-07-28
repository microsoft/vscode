/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { FileStat } from 'vscode';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { PromptReference } from '../../../prompt/common/conversation';
import { coalesceParts, LinkifiedPart, LinkifiedText, LinkifyLocationAnchor, LinkifySymbolAnchor } from '../../common/linkifiedText';
import { ILinkifyService, LinkifyService } from '../../common/linkifyService';

const workspace = URI.file('/workspace');

export function workspaceFile(path: string) {
	return URI.joinPath(workspace, path);
}

export function createMockFsService(listOfFiles: readonly (string | URI)[]): IFileSystemService {
	const workspaceEntries = listOfFiles.map(f => URI.isUri(f) ? f : workspaceFile(f));
	return new class implements Partial<IFileSystemService> {
		async stat(path: URI): Promise<FileStat> {
			if (path.path === '/' || path.path === workspace.path) {
				return { ctime: 0, mtime: 0, size: 0, type: FileType.File };
			}

			const entry = workspaceEntries.find(f => f.toString() === path.toString() || f.toString() === `${path.toString()}/`);
			if (!entry) {
				throw new Error(`File not found: ${path}`);
			}
			const isDirectory = entry.path.endsWith('/');
			return { ctime: 0, mtime: 0, size: 0, type: isDirectory ? FileType.Directory : FileType.File };
		}
	} as any;
}

export function createMockWorkspaceService(): IWorkspaceService {
	return new class implements Partial<IWorkspaceService> {
		getWorkspaceFolders(): URI[] {
			return [workspace];
		}

		getWorkspaceFolder(): URI | undefined {
			return workspace;
		}

		getWorkspaceFolderName(): string {
			return 'workspace';
		}
	} as any;
}

export function createTestLinkifierService(...listOfFiles: readonly (string | URI)[]): ILinkifyService {
	return new LinkifyService(
		createMockFsService(listOfFiles),
		createMockWorkspaceService(),
		NullEnvService.Instance
	);
}

export async function linkify(linkifer: ILinkifyService, text: string, references: readonly PromptReference[] = []): Promise<LinkifiedText> {
	const linkifier = linkifer.createLinkifier({ requestId: undefined, references }, []);

	const initial = await linkifier.append(text, CancellationToken.None);
	const flushed = await linkifier.flush(CancellationToken.None);
	if (!flushed) {
		return initial;
	}

	return {
		parts: coalesceParts(initial.parts.concat(flushed.parts)),
	};
}


export function assertPartsEqual(actualParts: readonly LinkifiedPart[], expectedParts: readonly LinkifiedPart[]) {
	assert.strictEqual(actualParts.length, expectedParts.length, `got ${JSON.stringify(actualParts)}`);

	for (let i = 0; i < actualParts.length; i++) {
		const actual = actualParts[i];
		const expected = expectedParts[i];
		if (typeof actual === 'string') {
			assert.strictEqual(actual, expected);
		} else if (actual instanceof LinkifyLocationAnchor) {
			assert(expected instanceof LinkifyLocationAnchor, 'Expected LinkifyLocationAnchor');
			assert.strictEqual(actual.value.toString(), expected.value.toString());
		} else {
			assert(actual instanceof LinkifySymbolAnchor);
			assert(expected instanceof LinkifySymbolAnchor, 'Expected LinkifySymbolAnchor');
			assert.strictEqual(actual.symbolInformation.name, expected.symbolInformation.name);
		}
	}
}
