/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * A single git worktree belonging to a repository. Each worktree has a
 * unique filesystem path and is bound to a branch/ref.
 */
export interface IWorktree {
	/** Filesystem URI of the worktree directory. */
	readonly uri: URI;

	/** URI of the main repository's `.git` directory (the common dir). */
	readonly commonDir: URI;

	/** Display name for the worktree (basename or "main" for the primary). */
	readonly label: IObservable<string>;

	/** Current branch name, or `undefined` if detached HEAD. */
	readonly branch: IObservable<string | undefined>;

	/** Whether this is the main (primary) worktree. */
	readonly isMain: boolean;
}

/**
 * Event payload describing changes to the known worktree list.
 */
export interface IWorktreesChangeEvent {
	readonly added: readonly IWorktree[];
	readonly removed: readonly IWorktree[];
}

export interface IWorktreeGroupService {
	readonly _serviceBrand: undefined;

	/** All worktrees discovered for the active repository. */
	readonly worktrees: IObservable<readonly IWorktree[]>;

	/**
	 * The currently active worktree. This is the worktree whose path matches
	 * the first workspace folder; `undefined` when the workspace is empty or
	 * does not correspond to any known worktree.
	 */
	readonly activeWorktree: IObservable<IWorktree | undefined>;

	/** Fires whenever the discovered worktree list changes. */
	readonly onDidChangeWorktrees: Event<IWorktreesChangeEvent>;

	/** Look up a worktree by its filesystem URI. */
	getWorktree(uri: URI): IWorktree | undefined;

	/**
	 * Switch to the given worktree. Triggers a workspace folder swap so the
	 * explorer, source control, and search rebase onto the worktree path.
	 * Layout state and terminal visibility follow reactively.
	 */
	openWorktree(uri: URI): Promise<void>;

	/** Re-scan `.git/worktrees/` and refresh the list. */
	refresh(): Promise<void>;
}

export const IWorktreeGroupService = createDecorator<IWorktreeGroupService>('worktreeGroupService');
