/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownCodeBlockFence } from '../../../base/common/htmlContent.js';

/** One working directory's rendered file-name tree. */
export interface IWorkspaceSnapshotRoot {
	/** The rendered root path. */
	readonly heading: string;
	/** The listed entries in display order, already indented and escaped. */
	readonly lines: readonly string[];
	/** Whether entries were left out to fit the size budget. */
	readonly truncated: boolean;
}

/**
 * A bounded file-name tree of the directories a conversation starts in. The
 * provider adds it to the turn's prompt and reports when it was submitted.
 */
export interface IWorkspaceSnapshot {
	readonly roots: readonly IWorkspaceSnapshotRoot[];
	/**
	 * Called by the provider when it submits the turn's prompt to the model.
	 * Not called when the send is abandoned before submission, so the snapshot
	 * is not considered sent.
	 */
	readonly onDidDeliver?: () => void;
}

/** Renders the snapshot's roots as a tree. */
export function renderWorkspaceSnapshotStructure(snapshot: IWorkspaceSnapshot): string {
	return snapshot.roots
		.map(root => [root.heading, ...root.lines, ...(root.truncated ? ['...'] : [])].join('\n'))
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
