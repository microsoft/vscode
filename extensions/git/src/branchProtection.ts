/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, LogOutputChannel, Uri, workspace } from 'vscode';
import type { BranchProtection, BranchProtectionProvider } from './api/git';
import { dispose, filterEvent } from './util';

export interface IBranchProtectionProviderRegistry {
	readonly onDidChangeBranchProtectionProviders: Event<Uri>;

	getBranchProtectionProviders(root: Uri): BranchProtectionProvider[];
	registerBranchProtectionProvider(root: Uri, provider: BranchProtectionProvider): Disposable;
}

export class GitBranchProtectionProvider implements BranchProtectionProvider {

	private readonly _onDidChangeBranchProtection = new EventEmitter<Uri>();
	onDidChangeBranchProtection = this._onDidChangeBranchProtection.event;

	private branchProtection!: BranchProtection;

	private disposables: Disposable[] = [];

	constructor(
		private readonly repositoryRoot: Uri,
		private readonly logger: LogOutputChannel
	) {
		const onDidChangeBranchProtectionEvent = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.branchProtection', repositoryRoot));
		onDidChangeBranchProtectionEvent(this.updateBranchProtection, this, this.disposables);

		// Update default branch protection when the workspace folders change
		workspace.onDidChangeWorkspaceFolders(this.updateBranchProtection, this, this.disposables);

		this.updateBranchProtection();
	}

	provideBranchProtection(): BranchProtection[] {
		return [this.branchProtection];
	}

	private updateBranchProtection(): void {
		const scopedConfig = workspace.getConfiguration('git', this.repositoryRoot);
		const branchProtectionConfig = scopedConfig.get<unknown>('branchProtection') ?? [];
		const branchProtectionValues = Array.isArray(branchProtectionConfig) ? branchProtectionConfig : [branchProtectionConfig];

		this.logger.trace('[GitBranchProtectionProvider][updateBranchProtection] Updating branch protection for repository:', this.repositoryRoot.fsPath);
		this.logger.trace('[GitBranchProtectionProvider][updateBranchProtection] Workspace folders:', workspace.workspaceFolders?.map(folder => folder.uri.fsPath));
		this.logger.trace('[GitBranchProtectionProvider][updateBranchProtection] BranchProtection configuration values:', branchProtectionValues);

		const branches = branchProtectionValues
			.map(bp => typeof bp === 'string' ? bp.trim() : '')
			.filter(bp => bp !== '');

		this.branchProtection = { remote: '', rules: [{ include: branches }] };
		this._onDidChangeBranchProtection.fire(this.repositoryRoot);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
