/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from 'vscode';

/**
 * Shared, immutable ThemeIcon instances used across the git extension. ThemeIcon has no
 * mutable state, so a single instance can safely be reused wherever the same icon id is
 * needed, instead of allocating a new instance per ref/commit/artifact on every refresh.
 * This avoids allocating large numbers of short-lived ThemeIcon instances when rendering
 * many refs, tags, worktrees, or stashes across many repositories.
 */
export const Icons = {
	account: new ThemeIcon('account'),
	branch: new ThemeIcon('git-branch'),
	chatWorktree: new ThemeIcon('chat-sparkle'),
	head: new ThemeIcon('target'),
	remoteBranch: new ThemeIcon('cloud'),
	repository: new ThemeIcon('repo'),
	stash: new ThemeIcon('git-stash'),
	tag: new ThemeIcon('tag'),
	worktree: new ThemeIcon('worktree'),
} as const;
