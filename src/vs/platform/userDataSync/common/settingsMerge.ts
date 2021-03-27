/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { parse, findNodeAtLocation, parseTree, Node } from 'vs/base/common/json';
import { setProperty } from 'vs/base/common/jsonEdit';
import { values } from 'vs/base/common/map';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import * as contentUtil from 'vs/platform/userDataSync/common/content';

export function computeRemoteContent(localContent: string, remoteContent: string, ignoredSettings: string[], formattingOptions: FormattingOptions): string {
	if (ignoredSettings.length) {
		const remote = parse(remoteContent);
		const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set<string>());
		for (const key of ignoredSettings) {
			if (ignored.has(key)) {
				localContent = contentUtil.edit(localContent, [key], remote[key], formattingOptions);
			}
		}
	}
	return localContent;
}

export function merge(localContent: string, remoteContent: string, baseContent: string | null, ignoredSettings: string[], formattingOptions: FormattingOptions): { mergeContent: string, hasChanges: boolean, hasConflicts: boolean } {
	const local = parse(localContent);
	const remote = parse(remoteContent);
	const base = baseContent ? parse(baseContent) : null;
	const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set<string>());

	const localToRemote = compare(local, remote, ignored);
	if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
		// No changes found between local and remote.
		return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
	}

	const conflicts: Set<string> = new Set<string>();
	const baseToLocal = base ? compare(base, local, ignored) : { added: Object.keys(local).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	const baseToRemote = base ? compare(base, remote, ignored) : { added: Object.keys(remote).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	let mergeContent = localContent;

	// Removed settings in Local
	for (const key of values(baseToLocal.removed)) {
		// Got updated in remote
		if (baseToRemote.updated.has(key)) {
			conflicts.add(key);
		}
	}

	// Removed settings in Remote
	for (const key of values(baseToRemote.removed)) {
		if (conflicts.has(key)) {
			continue;
		}
		// Got updated in local
		if (baseToLocal.updated.has(key)) {
			conflicts.add(key);
		} else {
			mergeContent = contentUtil.edit(mergeContent, [key], undefined, formattingOptions);
		}
	}

	// Added settings in Local
	for (const key of values(baseToLocal.added)) {
		if (conflicts.has(key)) {
			continue;
		}
		// Got added in remote
		if (baseToRemote.added.has(key)) {
			// Has different value
			if (localToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		}
	}

	// Added settings in remote
	for (const key of values(baseToRemote.added)) {
		if (conflicts.has(key)) {
			continue;
		}
		// Got added in local
		if (baseToLocal.added.has(key)) {
			// Has different value
			if (localToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		} else {
			mergeContent = contentUtil.edit(mergeContent, [key], remote[key], formattingOptions);
		}
	}

	// Updated settings in Local
	for (const key of values(baseToLocal.updated)) {
		if (conflicts.has(key)) {
			continue;
		}
		// Got updated in remote
		if (baseToRemote.updated.has(key)) {
			// Has different value
			if (localToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		}
	}

	// Updated settings in Remote
	for (const key of values(baseToRemote.updated)) {
		if (conflicts.has(key)) {
			continue;
		}
		// Got updated in local
		if (baseToLocal.updated.has(key)) {
			// Has different value
			if (localToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		} else {
			mergeContent = contentUtil.edit(mergeContent, [key], remote[key], formattingOptions);
		}
	}

	if (conflicts.size > 0) {
		const conflictNodes: { key: string, node: Node | undefined }[] = [];
		const tree = parseTree(mergeContent);
		const eol = formattingOptions.eol!;
		for (const key of values(conflicts)) {
			const node = findNodeAtLocation(tree, [key]);
			conflictNodes.push({ key, node });
		}
		conflictNodes.sort((a, b) => {
			if (a.node && b.node) {
				return b.node.offset - a.node.offset;
			}
			return a.node ? 1 : -1;
		});
		const lastNode = tree.children ? tree.children[tree.children.length - 1] : undefined;
		for (const { key, node } of conflictNodes) {
			const remoteEdit = setProperty(`{${eol}\t${eol}}`, [key], remote[key], { tabSize: 4, insertSpaces: false, eol: eol })[0];
			const remoteContent = remoteEdit ? `${remoteEdit.content.substring(remoteEdit.offset + remoteEdit.length + 1)},${eol}` : '';
			if (node) {
				// Updated in Local and Remote with different value
				const localStartOffset = contentUtil.getLineStartOffset(mergeContent, eol, node.parent!.offset);
				const localEndOffset = contentUtil.getLineEndOffset(mergeContent, eol, node.offset + node.length);
				mergeContent = mergeContent.substring(0, localStartOffset)
					+ `<<<<<<< local${eol}`
					+ mergeContent.substring(localStartOffset, localEndOffset)
					+ `${eol}=======${eol}${remoteContent}>>>>>>> remote`
					+ mergeContent.substring(localEndOffset);
			} else {
				// Removed in Local, but updated in Remote
				if (lastNode) {
					const localStartOffset = contentUtil.getLineEndOffset(mergeContent, eol, lastNode.offset + lastNode.length);
					mergeContent = mergeContent.substring(0, localStartOffset)
						+ `${eol}<<<<<<< local${eol}=======${eol}${remoteContent}>>>>>>> remote`
						+ mergeContent.substring(localStartOffset);
				} else {
					const localStartOffset = tree.offset + 1;
					mergeContent = mergeContent.substring(0, localStartOffset)
						+ `${eol}<<<<<<< local${eol}=======${eol}${remoteContent}>>>>>>> remote${eol}`
						+ mergeContent.substring(localStartOffset);
				}
			}
		}
	}

	return { mergeContent, hasChanges: true, hasConflicts: conflicts.size > 0 };
}

function compare(from: IStringDictionary<any>, to: IStringDictionary<any>, ignored: Set<string>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
	const fromKeys = Object.keys(from).filter(key => !ignored.has(key));
	const toKeys = Object.keys(to).filter(key => !ignored.has(key));
	const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const updated: Set<string> = new Set<string>();

	for (const key of fromKeys) {
		if (removed.has(key)) {
			continue;
		}
		const value1 = from[key];
		const value2 = to[key];
		if (!objects.equals(value1, value2)) {
			updated.add(key);
		}
	}

	return { added, removed, updated };
}
