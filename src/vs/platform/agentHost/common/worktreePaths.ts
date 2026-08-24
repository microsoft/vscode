/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/path.js';
import { isEqual, isEqualOrParent, normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * The `<repo>.worktrees` sibling directory where per-session isolated worktrees
 * are created, e.g. `/src/vscode` → `/src/vscode.worktrees`.
 *
 * Shared across layers: the node agent host creates worktrees here, and the
 * browser workspace-trust gates use it as a structural provenance guard (only a
 * working directory under this root is treated as a VS Code-created worktree
 * eligible to inherit trust from its base repository).
 */
export function getWorktreesRoot(repositoryRoot: URI): URI {
	return URI.joinPath(repositoryRoot, '..', `${basename(repositoryRoot.fsPath)}.worktrees`);
}

/**
 * Whether `candidate` is an individual VS Code-created worktree of
 * `repositoryRoot` — a **strict descendant** of {@link getWorktreesRoot}, never
 * the shared `<repo>.worktrees` container itself.
 *
 * The browser workspace-trust gates use this to decide whether a working
 * directory may inherit trust from its (trusted) base repository. The container
 * must be excluded: trusting `<repo>.worktrees` would, via workspace trust's
 * equal-or-descendant resolution, silently trust every current and future
 * worktree under it. Paths are normalized first so an equivalent spelling of the
 * container (e.g. a trailing `.`) cannot slip past the strict-descendant check.
 */
export function isWorktreeUnderRepository(candidate: URI, repositoryRoot: URI): boolean {
	const worktreesRoot = normalizePath(getWorktreesRoot(repositoryRoot));
	const normalizedCandidate = normalizePath(candidate);
	return isEqualOrParent(normalizedCandidate, worktreesRoot) && !isEqual(normalizedCandidate, worktreesRoot);
}
