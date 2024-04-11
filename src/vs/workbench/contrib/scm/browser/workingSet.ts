/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableMap, DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { getProviderKey } from 'vs/workbench/contrib/scm/browser/util';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IEditorGroupsService, IEditorWorkingSet } from 'vs/workbench/services/editor/common/editorGroupsService';

type ISCMSerializedWorkingSet = {
	readonly providerKey: string;
	readonly currentHistoryItemGroupId: string;
	readonly editorWorkingSets: [string, IEditorWorkingSet][];
};

interface ISCMRepositoryWorkingSet {
	readonly currentHistoryItemGroupId: string;
	readonly editorWorkingSets: Map<string, IEditorWorkingSet>;
}

export class SCMWorkingSetController implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.scmWorkingSets';

	private _workingSets!: Map<string, ISCMRepositoryWorkingSet>;
	private readonly _repositoryDisposables = new DisposableMap<ISCMRepository>();
	private readonly _scmServiceDisposables = new DisposableStore();
	private readonly _disposables = new DisposableStore();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ISCMService private readonly scmService: ISCMService,
		@IStorageService private readonly storageService: IStorageService
	) {
		const onDidChangeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.workingSets.enabled'), this._disposables);
		this._disposables.add(Event.runAndSubscribe(onDidChangeConfiguration, () => this._onDidChangeConfiguration()));
	}

	private _onDidChangeConfiguration(): void {
		if (!this.configurationService.getValue<boolean>('scm.workingSets.enabled')) {
			this.storageService.remove('scm.workingSets', StorageScope.WORKSPACE);

			this._scmServiceDisposables.clear();
			this._repositoryDisposables.clearAndDisposeAll();

			return;
		}

		this._workingSets = this._loadWorkingSets();

		this.scmService.onDidAddRepository(this._onDidAddRepository, this, this._scmServiceDisposables);
		this.scmService.onDidRemoveRepository(this._onDidRemoveRepository, this, this._scmServiceDisposables);

		for (const repository of this.scmService.repositories) {
			this._onDidAddRepository(repository);
		}
	}

	private _onDidAddRepository(repository: ISCMRepository): void {
		const disposables = new DisposableStore();

		disposables.add(Event.runAndSubscribe(repository.provider.onDidChangeHistoryProvider, () => {
			if (!repository.provider.historyProvider) {
				return;
			}

			disposables.add(Event.runAndSubscribe(repository.provider.historyProvider.onDidChangeCurrentHistoryItemGroup, async () => {
				if (!repository.provider.historyProvider?.currentHistoryItemGroup?.id) {
					return;
				}

				const providerKey = getProviderKey(repository.provider);
				const currentHistoryItemGroupId = repository.provider.historyProvider.currentHistoryItemGroup.id;
				const repositoryWorkingSets = this._workingSets.get(providerKey);

				if (!repositoryWorkingSets) {
					this._workingSets.set(providerKey, { currentHistoryItemGroupId, editorWorkingSets: new Map() });
					return;
				}

				if (repositoryWorkingSets.currentHistoryItemGroupId === currentHistoryItemGroupId) {
					return;
				}

				// Save the working set
				this._saveWorkingSet(providerKey, currentHistoryItemGroupId, repositoryWorkingSets);

				// Restore the working set
				await this._restoreWorkingSet(providerKey, currentHistoryItemGroupId);
			}));
		}));

		this._repositoryDisposables.set(repository, disposables);
	}

	private _onDidRemoveRepository(repository: ISCMRepository): void {
		this._workingSets.delete(getProviderKey(repository.provider));
		this._repositoryDisposables.deleteAndDispose(repository);
	}

	private _loadWorkingSets(): Map<string, ISCMRepositoryWorkingSet> {
		const workingSets = new Map<string, ISCMRepositoryWorkingSet>();
		const workingSetsRaw = this.storageService.get('scm.workingSets', StorageScope.WORKSPACE);
		if (!workingSetsRaw) {
			return workingSets;
		}

		for (const serializedWorkingSet of JSON.parse(workingSetsRaw) as ISCMSerializedWorkingSet[]) {
			workingSets.set(serializedWorkingSet.providerKey, {
				currentHistoryItemGroupId: serializedWorkingSet.currentHistoryItemGroupId,
				editorWorkingSets: new Map(serializedWorkingSet.editorWorkingSets)
			});
		}

		return workingSets;
	}

	private _saveWorkingSet(providerKey: string, currentHistoryItemGroupId: string, repositoryWorkingSets: ISCMRepositoryWorkingSet): void {
		const previousHistoryItemGroupId = repositoryWorkingSets.currentHistoryItemGroupId;
		const editorWorkingSets = repositoryWorkingSets.editorWorkingSets;

		const editorWorkingSet = this.editorGroupsService.saveWorkingSet(previousHistoryItemGroupId);
		this._workingSets.set(providerKey, { currentHistoryItemGroupId, editorWorkingSets: editorWorkingSets.set(previousHistoryItemGroupId, editorWorkingSet) });

		// Save to storage
		const workingSets: ISCMSerializedWorkingSet[] = [];
		for (const [providerKey, { currentHistoryItemGroupId, editorWorkingSets }] of this._workingSets) {
			workingSets.push({ providerKey, currentHistoryItemGroupId, editorWorkingSets: [...editorWorkingSets] });
		}
		this.storageService.store('scm.workingSets', JSON.stringify(workingSets), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _restoreWorkingSet(providerKey: string, currentHistoryItemGroupId: string): Promise<void> {
		const workingSets = this._workingSets.get(providerKey);
		if (!workingSets) {
			return;
		}

		let editorWorkingSetId: IEditorWorkingSet | 'empty' | undefined = workingSets.editorWorkingSets.get(currentHistoryItemGroupId);
		if (!editorWorkingSetId && this.configurationService.getValue<'empty' | 'current'>('scm.workingSets.default') === 'empty') {
			editorWorkingSetId = 'empty';
		}

		if (editorWorkingSetId) {
			await this.editorGroupsService.applyWorkingSet(editorWorkingSetId);
		}
	}

	dispose(): void {
		this._repositoryDisposables.dispose();
		this._scmServiceDisposables.dispose();
		this._disposables.dispose();
	}
}
