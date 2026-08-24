/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/path.js';
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
