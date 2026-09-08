/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Name of the `.git`-nested worktrees container used when the repository root
 * is the user's home directory (see {@link getWorktreesRoot}). Exported so
 * {@link ../node/shared/worktreeIsolation.js}'s repository-root recovery can
 * recognize this layout without duplicating the literal.
 */
export const HOME_DIRECTORY_WORKTREES_CONTAINER_NAME = 'vscode-worktrees';

/**
 * The `<repo>.worktrees` sibling directory where per-session isolated worktrees
 * are created, e.g. `/src/vscode` → `/src/vscode.worktrees`.
 *
 * Shared across layers: the node agent host creates worktrees here, and the
 * browser workspace-trust gates use it as a structural provenance guard (only a
 * working directory under this root is treated as a VS Code-created worktree
 * eligible to inherit trust from its base repository).
 *
 * When `repositoryRoot` *is* the user's home directory, the sibling location
 * would land under the home directory's parent (e.g. `/home/alice` →
 * `/home/alice.worktrees`), which on a standard Linux/FHS layout the user has
 * no permission to create. Callers that know the home directory (currently
 * only the node agent host; the browser trust gate has no such notion and
 * keeps the sibling behavior) pass it as `homeDirectory` so this falls back to
 * a location under `.git` instead: writable (git itself requires `.git` to be
 * writable), and — unlike a plain subdirectory of the repository's working
 * tree — never walked by `git ls-files`, so it cannot dirty `git status` or
 * have a previous session's worktree content swept up by the agent host's
 * gitignored-file copy step (which lists ignored-but-untracked files under
 * `repositoryRoot` and would otherwise recurse into it).
 */
export function getWorktreesRoot(repositoryRoot: URI, homeDirectory?: URI): URI {
	// Local file-scheme paths from the OS: compare with the platform's own case
	// sensitivity (ignored on Windows/macOS, honored on Linux) so a casing
	// difference between the repository root and `os.homedir()` doesn't cause
	// the home-directory case below to be missed.
	if (homeDirectory && extUriBiasedIgnorePathCase.isEqual(extUriBiasedIgnorePathCase.normalizePath(repositoryRoot), extUriBiasedIgnorePathCase.normalizePath(homeDirectory))) {
		return URI.joinPath(repositoryRoot, '.git', HOME_DIRECTORY_WORKTREES_CONTAINER_NAME);
	}
	return URI.joinPath(repositoryRoot, '..', `${basename(repositoryRoot.fsPath)}.worktrees`);
}

/**
 * Whether `candidate` is an individual VS Code-created worktree of
 * `repositoryRoot` — a **strict descendant** of one of the two possible
 * {@link getWorktreesRoot} containers, never a container itself.
 *
 * The browser workspace-trust gates (which have no notion of the user's home
 * directory, see {@link getWorktreesRoot}) use this to decide whether a working
 * directory may inherit trust from its (trusted) base repository, so both the
 * sibling container and the `.git`-nested one used when `repositoryRoot` is the
 * home directory are checked: passing `repositoryRoot` as its own `homeDirectory`
 * deterministically reproduces the latter without actually needing to know the
 * real home directory here. Each container itself must be excluded: trusting a
 * container would, via workspace trust's equal-or-descendant resolution, silently
 * trust every current and future worktree under it. Paths are normalized first
 * so an equivalent spelling of a container (e.g. a trailing `.`) cannot slip past
 * the strict-descendant check.
 */
export function isWorktreeUnderRepository(candidate: URI, repositoryRoot: URI): boolean {
	const normalizedCandidate = normalizePath(candidate);
	return [getWorktreesRoot(repositoryRoot), getWorktreesRoot(repositoryRoot, repositoryRoot)].some(container => {
		const worktreesRoot = normalizePath(container);
		return isEqualOrParent(normalizedCandidate, worktreesRoot) && !isEqual(normalizedCandidate, worktreesRoot);
	});
}
