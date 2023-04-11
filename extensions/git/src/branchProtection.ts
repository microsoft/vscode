/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, Uri, workspace } from 'vscode';
import { BranchProtectionProvider } from './api/git';
import { dispose, filterEvent } from './util';

export interface IBranchProtectionProviderRegistry {
	readonly onDidChangeBranchProtectionProviders: Event<Uri>;

	getBranchProtectionProviders(repositoryRoot: Uri): BranchProtectionProvider[];
	registerBranchProtectionProvider(repositoryRoot: Uri, provider: BranchProtectionProvider): Disposable;
}

export class GitBranchProtectionProvider implements BranchProtectionProvider {

	private readonly _onDidChangeProtectedBranches = new EventEmitter<Uri>();
	onDidChangeProtectedBranches = this._onDidChangeProtectedBranches.event;

	private protectedBranches = new Map<'', string[]>();
	private disposables: Disposable[] = [];

	constructor(private readonly repositoryRoot: Uri) {
		const onDidChangeBranchProtection = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.branchProtection', repositoryRoot));
		onDidChangeBranchProtection(this.updateBranchProtection, this, this.disposables);
		this.updateBranchProtection();
	}

	provideProtectedBranches(): Map<string, string[]> {
		return this.protectedBranches;
	}

	private updateBranchProtection(): void {
		const scopedConfig = workspace.getConfiguration('git', this.repositoryRoot);
		const branchProtectionConfig = scopedConfig.get<unknown>('branchProtection') ?? [];
		const branchProtectionValues = Array.isArray(branchProtectionConfig) ? branchProtectionConfig : [branchProtectionConfig];

		this.protectedBranches.set('', branchProtectionValues
			.map(bp => typeof bp === 'string' ? bp.trim() : '')
			.filter(bp => bp !== ''));

		this._onDidChangeProtectedBranches.fire(this.repositoryRoot);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
