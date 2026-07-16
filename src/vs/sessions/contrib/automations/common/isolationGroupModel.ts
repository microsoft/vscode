/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';

const GENERATED_WORKTREE_BRANCH_MARKER = 'copilot-worktree-';

function isSelectableAutomationBranch(name: string | undefined): name is string {
	return !!name && !name.includes(GENERATED_WORKTREE_BRANCH_MARKER);
}

export function normalizeAutomationBranchNames(names: Iterable<string | undefined>): readonly string[] {
	return [...new Set([...names].filter(isSelectableAutomationBranch))].sort((a, b) => a.localeCompare(b));
}

export interface IAutomationIsolationFormState {
	folderUri: URI | undefined;
	isolationMode: string | undefined;
	branch: string | undefined;
}

/**
 * Keeps explicit Worktree branch intent separate from the repository's live HEAD.
 */
export class AutomationIsolationModel {
	private _headBranch: string | undefined;
	private _selectedBranch: string | undefined;
	private _supportsWorktreeConfiguration = false;

	constructor(private readonly _state: IAutomationIsolationFormState) {
		const branch = _state.isolationMode === 'worktree' ? _state.branch : undefined;
		this._selectedBranch = isSelectableAutomationBranch(branch) ? branch : undefined;
		this._state.branch = this._selectedBranch;
	}

	get folderUri(): URI | undefined {
		return this._state.folderUri;
	}

	get isolationMode(): string {
		return this._state.isolationMode ?? 'workspace';
	}

	get selectedBranch(): string | undefined {
		return this._selectedBranch;
	}

	get headBranch(): string | undefined {
		return this._headBranch;
	}

	get displayBranch(): string | undefined {
		return this.isolationMode === 'worktree'
			? this._selectedBranch ?? this._headBranch
			: this._headBranch;
	}

	get persistedBranch(): string | undefined {
		if (!this._state.folderUri || this.isolationMode !== 'worktree' || !this._supportsWorktreeConfiguration) {
			return undefined;
		}
		return this._selectedBranch ?? this._headBranch;
	}

	get supportsWorktreeConfiguration(): boolean {
		return this._supportsWorktreeConfiguration;
	}

	get branchPickerAvailable(): boolean {
		return !!this._state.folderUri && this.isolationMode === 'worktree' && this._supportsWorktreeConfiguration;
	}

	setSupportsWorktreeConfiguration(supported: boolean): void {
		this._supportsWorktreeConfiguration = supported;
	}

	selectIsolationMode(mode: 'workspace' | 'worktree'): boolean {
		if (mode === 'worktree' && (!this._state.folderUri || !this._supportsWorktreeConfiguration)) {
			return false;
		}
		this._state.isolationMode = mode;
		return true;
	}

	setWorkspace(folderUri: URI | undefined): void {
		if (isEqual(this._state.folderUri, folderUri)) {
			return;
		}
		this._state.folderUri = folderUri;
		this._headBranch = undefined;
		this._selectedBranch = undefined;
		this._state.branch = undefined;
		if (!folderUri) {
			this._state.isolationMode = 'workspace';
		}
	}

	setHeadBranch(branch: string | undefined): void {
		this._headBranch = isSelectableAutomationBranch(branch) ? branch : undefined;
	}

	selectBranch(branch: string): void {
		if (!isSelectableAutomationBranch(branch)) {
			return;
		}
		this._selectedBranch = branch;
		this._state.branch = branch;
	}
}
