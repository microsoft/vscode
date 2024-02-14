/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, commands } from 'vscode';
import { combinedDisposable, dispose, filterEvent } from './util';
import { Model } from './model';
import { Repository } from './repository';
import { OperationKind } from './operation';

type WorkingSet = {
	main: unknown;
	auxiliary: unknown;
};

export class GitBranchWorkingSetManager {

	private readonly workingSets = new Map<string, Map<string, any>>();
	private readonly repositoryDisposables = new Map<Repository, Disposable>();
	private readonly disposables: Disposable[] = [];

	constructor(model: Model) {
		model.onDidOpenRepository(this.onDidOpenRepository, this, this.disposables);
		model.onDidCloseRepository(this.onDidCloseRepository, this, this.disposables);
	}

	private onDidOpenRepository(repository: Repository): void {
		const disposable = combinedDisposable([
			filterEvent(repository.onRunOperation,
				e =>
					e === OperationKind.Branch ||
					e === OperationKind.Checkout ||
					e === OperationKind.CheckoutTracking)(() => this.saveWorkingSet(repository)),
			filterEvent(repository.onDidRunOperation,
				e =>
					e.operation.kind === OperationKind.Branch ||
					e.operation.kind === OperationKind.Checkout ||
					e.operation.kind === OperationKind.CheckoutTracking)(() => this.restoreWorkingSet(repository))
		]);

		this.repositoryDisposables.set(repository, disposable);
	}

	private onDidCloseRepository(repository: Repository): void {
		this.repositoryDisposables.get(repository)?.dispose();
		this.repositoryDisposables.delete(repository);
	}

	// private getGlobalStateKey(repository: Repository): string {
	// 	return `workingSet:${repository.root}`;
	// }

	private async saveWorkingSet(repository: Repository): Promise<void> {
		if (!repository.historyProvider.currentHistoryItemGroup) {
			return;
		}

		const currentWorkingSet = await commands.executeCommand<WorkingSet>('vscode.getEditorWorkingSet');
		const repositoryWorkingSets = this.workingSets.get(repository.root) ?? new Map<string, WorkingSet>();

		repositoryWorkingSets.set(repository.historyProvider.currentHistoryItemGroup.id, currentWorkingSet);
		this.workingSets.set(repository.root, repositoryWorkingSets);
	}

	private async restoreWorkingSet(repository: Repository): Promise<void> {
		if (!repository.historyProvider.currentHistoryItemGroup) {
			return;
		}

		const workingSet = this.workingSets.get(repository.root)?.get(repository.historyProvider.currentHistoryItemGroup.id);
		if (!workingSet) {
			return;
		}

		await commands.executeCommand('vscode.setEditorWorkingSet', workingSet);
	}

	dispose() {
		dispose([...this.repositoryDisposables.values()]);
		this.repositoryDisposables.clear();

		dispose(this.disposables);
	}
}
