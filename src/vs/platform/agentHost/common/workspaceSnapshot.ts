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
	/** Absolute file system path of the root, checked against content exclusion like its entries. */
	readonly path: string;
	/** The rendered root path. */
	readonly heading: string;
	/** Entries in display order. */
	readonly entries: readonly IWorkspaceSnapshotEntry[];
	/** Whether entries were left out to fit the size budget. */
	readonly truncated: boolean;
}

/** What reached the model when a turn carrying a {@link IWorkspaceSnapshot} was submitted. */
export interface IWorkspaceSnapshotDelivery {
	/** `unavailable` when content exclusion could not be evaluated, in which case no snapshot was sent. */
	readonly contentExclusion: 'evaluated' | 'unavailable';
	/** Listed paths, roots included, that content exclusion excludes. */
	readonly excludedPathCount: number;
	/** Roots that remained after content exclusion. */
	readonly includedRootCount: number;
	/** Length of the tree that was sent, or 0 when none was. */
	readonly snapshotLength: number;
}

/**
 * A bounded file-name tree of the directories a conversation starts in. It is
 * kept structured until the provider submits the turn, so that paths excluded
 * by the session's content exclusion policy can be dropped first.
 */
export interface IWorkspaceSnapshot {
	readonly roots: readonly IWorkspaceSnapshotRoot[];
	/**
	 * Called by the provider when it submits the turn's prompt to the model,
	 * with what remained of the snapshot. Not called when the send is
	 * abandoned before submission, so the snapshot is not considered sent.
	 */
	readonly onDidDeliver?: (delivery: IWorkspaceSnapshotDelivery) => void;
}

/** The unique paths the snapshot lists, roots included. */
export function getWorkspaceSnapshotPaths(snapshot: IWorkspaceSnapshot): string[] {
	return [...new Set(snapshot.roots.flatMap(root => [root.path, ...root.entries.map(entry => entry.path)]))];
}

/**
 * Drops each root and entry for which `isExcluded` returns true, together
 * with everything below it, and each root left without entries.
 */
export function filterWorkspaceSnapshot(snapshot: IWorkspaceSnapshot, isExcluded: (path: string) => boolean): IWorkspaceSnapshot {
	const roots: IWorkspaceSnapshotRoot[] = [];
	for (const root of snapshot.roots) {
		if (isExcluded(root.path)) {
			continue;
		}
		const entries: IWorkspaceSnapshotEntry[] = [];
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
			entries.push(entry);
		}
		if (entries.length) {
			roots.push({ ...root, entries });
		}
	}
	return { roots };
}

/** Renders the snapshot's roots as a tree. */
export function renderWorkspaceSnapshotStructure(snapshot: IWorkspaceSnapshot): string {
	return snapshot.roots
		.map(root => [root.heading, ...root.entries.map(entry => entry.line), ...(root.truncated ? ['...'] : [])].join('\n'))
		.join('\n\n');
}

/** Renders the snapshot as a host instruction, or `undefined` when it has no roots. */
export function renderWorkspaceSnapshot(snapshot: IWorkspaceSnapshot): string | undefined {
	const structure = renderWorkspaceSnapshotStructure(snapshot);
	if (!structure) {
		return undefined;
	}
	return `<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`;
}
