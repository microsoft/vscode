/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../../platform/filesystem/common/fileTypes';
import { IIgnoreService } from '../../../../../platform/ignore/common/ignoreService';
import { shouldAlwaysIgnoreFile } from '../../../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { isDefined } from '../../../../../util/vs/base/common/types';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';

export type FileEntry =
	| { readonly type: FileType.File; readonly uri: URI; readonly name: string }
	| { readonly type: FileType.Directory; readonly uri: URI; readonly name: string; getChildren: () => Promise<FileList> };

type FileList = ReadonlyArray<FileEntry>;

type Part =
	| { type: 'text'; uri: URI | undefined; value: string }
	| { type: 'dir'; uri: URI; value: string; level: number; getChildren: () => Promise<FileList> };

function partsLength(parts: readonly Part[]): number {
	const len = parts.reduce((p, c) => p + c.value.length, 0);
	return len + Math.max(0, parts.length - 1); // Account for new lines between parts
}

export interface IFileTreeData {
	/** Files and directories mentioned in the tree */
	files: URI[];
	/** Tree as a string */
	tree: string;
}

/**
 * Converts a file tree into a nicely formatted multi-line string representation.
 *
 * This attempts to smartly truncate the string to fit within `maxLength` characters. It does this by doing
 * breadth-first expansion of the file nodes and adding in `...` when we run out of space.
 */
export async function visualFileTree(files: FileList, maxLength = Infinity, token?: CancellationToken): Promise<IFileTreeData> {
	let parts = toParts(0, files, maxLength);
	let remainingSpace = maxLength - partsLength(parts);

	while (true) {
		let didExpand = false;
		const newParts: Part[] = [];

		for (const part of parts) {
			if (part.type === 'text') {
				newParts.push(part);
			} else if (part.type === 'dir') {
				newParts.push({ type: 'text', uri: part.uri, value: part.value });

				const children = await part.getChildren();
				if (token?.isCancellationRequested) {
					return emptyTree();
				}

				const subParts = toParts(part.level + 1, children, remainingSpace - 1);
				if (subParts.length) {
					didExpand = true;
					remainingSpace -= partsLength(subParts) + 1;
					newParts.push(...subParts);
				}
			}
		}

		parts = newParts;
		if (!didExpand) {
			break;
		}
	}

	return {
		files: parts.map(p => p.uri).filter(isDefined),
		tree: parts.map(x => x.value).join('\n'),
	};
}

function toParts(level: number, files: FileList, maxLength: number): Part[] {
	const indent = '\t'.repeat(level);

	const parts: Part[] = [];
	let remainingSpace = maxLength;
	for (let i = 0; i < files.length; ++i) {
		const item = files[i];
		const str = indent + item.name + (item.type === FileType.Directory ? '/' : '');
		if (str.length > remainingSpace) {
			// Not enough space for item. Try adding `...` as a placeholder
			const placeholder = indent + '...';

			// Remove previous segments until there's space for the placeholder
			while (placeholder.length > remainingSpace && parts.length > 0) {
				remainingSpace += parts.pop()!.value.length + 1; // Account for newline
			}

			// Finally check to see if there's space for our placeholder
			if (placeholder.length <= remainingSpace) {
				parts.push({ type: 'text', uri: undefined, value: placeholder });
			}

			break;
		}

		if (item.type === FileType.Directory) {
			parts.push({ type: 'dir', uri: item.uri, level, value: str, getChildren: item.getChildren });
		} else {
			parts.push({ type: 'text', uri: item.uri, value: str });
		}

		remainingSpace -= str.length;
		if (i !== files.length - 1) {
			remainingSpace -= 1; // Account for newline
		}
	}
	return parts;
}

export interface IWorkspaceVisualTreeOptions {
	maxLength: number;
	excludeDotFiles?: boolean;
}

export async function workspaceVisualFileTree(accessor: ServicesAccessor, root: URI, options: IWorkspaceVisualTreeOptions, token: CancellationToken): Promise<IFileTreeData> {
	const fs = accessor.get(IFileSystemService);
	const ignoreService = accessor.get(IIgnoreService);

	async function buildFileList(root: URI): Promise<FileList> {
		let rootNodes: [string, FileType][];
		try {
			rootNodes = await fs.readDirectory(root);
		} catch (err) {
			return [];
		}
		if (token.isCancellationRequested) {
			return [];
		}

		// Ensure files are listed in a consistent order across platforms
		rootNodes.sort((a, b) => {
			if (a[1] === b[1]) {
				return a[0].localeCompare(b[0]);
			}
			return a[1] === FileType.Directory ? 1 : -1;
		});

		return Promise.all(
			rootNodes.map(async x => {
				const uri = URI.joinPath(root, x[0]);
				return !(options.excludeDotFiles && x[0].startsWith('.')) && !shouldAlwaysIgnoreFile(uri) && !await ignoreService.isCopilotIgnored(uri) ? x : null;
			})
		).then(entries =>
			entries.filter((entry): entry is [string, FileType] => !!entry)
				.map((entry: [string, FileType]): FileEntry => {
					const uri = URI.joinPath(root, entry[0]);
					if (entry[1] === FileType.Directory) {
						return { type: FileType.Directory, uri, name: entry[0], getChildren: () => buildFileList(uri) };
					} else {
						return { type: FileType.File, uri, name: entry[0] };
					}
				})
		);
	}

	await ignoreService.init();
	if (token.isCancellationRequested) {
		return emptyTree();
	}

	const rootFiles = await buildFileList(root);
	if (token.isCancellationRequested) {
		return emptyTree();
	}

	return visualFileTree(rootFiles, options.maxLength, token);
}

const emptyTree = (): IFileTreeData => ({ tree: '', files: [] });
