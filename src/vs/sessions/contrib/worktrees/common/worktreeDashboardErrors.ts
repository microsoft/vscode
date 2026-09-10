/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';

export class WorktreeContainsChangesError extends Error {
	constructor(readonly worktreePath: URI) {
		super(localize('worktreeContainsChanges', "The worktree contains uncommitted changes: {0}", worktreePath.fsPath));
		this.name = 'WorktreeContainsChangesError';
	}
}
