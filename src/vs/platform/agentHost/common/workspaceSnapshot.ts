/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownCodeBlockFence } from '../../../base/common/htmlContent.js';

/** One listed file or folder of a {@link IWorkspaceSnapshotRoot}. */
export interface IWorkspaceSnapshotEntry {
	/** Absolute file system path, checked against the session's content exclusion policy. */
	readonly path: string;
	/** Nesting level below the root. An entry's descendants directly follow it. */
	readonly depth: number;
	/** The rendered line, already indented and escaped. */
	readonly line: string;
}

export interface IWorkspaceSnapshotRoot {
	/** The rendered root path. */
	readonly heading: string;
	/** Entries in display order. */
	readonly entries: readonly IWorkspaceSnapshotEntry[];
	/** Whether entries were left out to fit the size budget. */
	readonly truncated: boolean;
}

/**
 * A bounded file-name tree of the directories a conversation starts in. It is
 * kept structured until the provider sends it, so that paths excluded by the
 * session's content exclusion policy can be dropped first.
 */
export interface IWorkspaceSnapshot {
	readonly roots: readonly IWorkspaceSnapshotRoot[];
}

/** The unique paths the snapshot lists. */
export function getWorkspaceSnapshotPaths(snapshot: IWorkspaceSnapshot): string[] {
	return [...new Set(snapshot.roots.flatMap(root => root.entries.map(entry => entry.path)))];
}

/**
 * Renders the snapshot's roots as a tree. An entry for which `isExcluded`
 * returns true is dropped together with everything below it, and a root left
 * without entries is dropped.
 */
export function renderWorkspaceSnapshotStructure(snapshot: IWorkspaceSnapshot, isExcluded: (path: string) => boolean = () => false): string {
	const trees: string[] = [];
	for (const root of snapshot.roots) {
		const lines: string[] = [];
		let excludedDepth: number | undefined;
		for (const entry of root.entries) {
			if (excludedDepth !== undefined && entry.depth > excludedDepth) {
				continue;
			}
			excludedDepth = undefined;
			if (isExcluded(entry.path)) {
				excludedDepth = entry.depth;
				continue;
			}
			lines.push(entry.line);
		}
		if (lines.length) {
			trees.push([root.heading, ...lines, ...(root.truncated ? ['...'] : [])].join('\n'));
		}
	}
	return trees.join('\n\n');
}

/**
 * Renders the snapshot as a host instruction, dropping excluded entries as
 * {@link renderWorkspaceSnapshotStructure} does. Returns `undefined` when
 * nothing is left.
 */
export function renderWorkspaceSnapshot(snapshot: IWorkspaceSnapshot, isExcluded?: (path: string) => boolean): string | undefined {
	const structure = renderWorkspaceSnapshotStructure(snapshot, isExcluded);
	if (!structure) {
		return undefined;
	}
	return `<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`;
}
