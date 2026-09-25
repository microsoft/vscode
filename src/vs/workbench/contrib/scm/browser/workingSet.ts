/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { getProviderKey } from './util.js';
import { ISCMRepository, ISCMService } from '../common/scm.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { applyWorkingSetWithPinnedEditors, SCMWorkingSetRestoreQueue } from './workingSetPins.js';

type ISCMSerializedWorkingSet = {
	readonly providerKey: string;
	readonly currentHistoryItemGroupId: string;
	readonly editorWorkingSets: [string, IEditorWorkingSet][];
};

interface ISCMRepositoryWorkingSet {
	readonly currentHistoryItemGroupId: string;
	readonly editorWorkingSets: Map<string, IEditorWorkingSet>;
}

export class SCMWorkingSetController extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.scmWorkingSets';

	private _enabledConfig: IObservable<boolean>;
	private _workingSets!: Map<string, ISCMRepositoryWorkingSet>;

	private readonly _repositoryDisposables = new DisposableMap<ISCMRepository>();
	private readonly _restoreQueue = new SCMWorkingSetRestoreQueue();
	private _restoreGeneration = 0;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
		@ISCMService private readonly scmService: ISCMService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		this._enabledConfig = observableConfigValue<boolean>('scm.workingSets.enabled', false, this.configurationService);

		this._store.add(autorun(reader => {
			if (!this._enabledConfig.read(reader)) {
				this._restoreGeneration++; // Discard any queued work from the previous enabled session.
				this.storageService.remove('scm.workingSets', StorageScope.WORKSPACE);
				this._repositoryDisposables.clearAndDisposeAll();
				return;
			}

			this._workingSets = this._loadWorkingSets();

			this.scmService.onDidAddRepository(this._onDidAddRepository, this, reader.store);
			this.scmService.onDidRemoveRepository(this._onDidRemoveRepository, this, reader.store);

			for (const repository of this.scmService.repositories) {
				this._onDidAddRepository(repository);
			}
		}));
	}

	private _onDidAddRepository(repository: ISCMRepository): void {
		const disposables = new DisposableStore();

		const historyItemRefId = derived(reader => {
			const historyProvider = repository.provider.historyProvider.read(reader);
			const historyItemRef = historyProvider?.historyItemRef.read(reader);

			return historyItemRef?.id;
		});

		disposables.add(autorun(reader => {
			const historyItemRefIdValue = historyItemRefId.read(reader);

			if (!historyItemRefIdValue) {
				return;
			}

			const providerKey = getProviderKey(repository.provider);
			const restoreGeneration = this._restoreGeneration;

			// Saving the previous branch and applying the next branch must both
			// happen inside the queue. Otherwise a quick second branch switch can
			// save an intermediate layout or overlap pinned-editor reconciliation.
			void this._restoreQueue.queue(async () => {
				if (restoreGeneration !== this._restoreGeneration || !this._repositoryDisposables.has(repository)) {
					return;
				}

				const repositoryWorkingSets = this._workingSets.get(providerKey);
				if (!repositoryWorkingSets) {
					this._workingSets.set(providerKey, { currentHistoryItemGroupId: historyItemRefIdValue, editorWorkingSets: new Map() });
					return;
				}

				// Editors for the current working set are automatically restored.
				if (repositoryWorkingSets.currentHistoryItemGroupId === historyItemRefIdValue) {
					return;
				}

				this._saveWorkingSet(providerKey, historyItemRefIdValue, repositoryWorkingSets);
				await this._restoreWorkingSet(providerKey, historyItemRefIdValue);
			}).catch(onUnexpectedError);
		}));

		this._repositoryDisposables.set(repository, disposables);
	}

	private _onDidRemoveRepository(repository: ISCMRepository): void {
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
			// Applying a working set can be the result of a user action that has been
			// initiated from the terminal (ex: switching branches). As such, we want
			// to preserve the focus in the terminal. This does not cover the scenario
			// in which the terminal is in the editor part.
			const preserveFocus = this.layoutService.hasFocus(Parts.PANEL_PART);

			await applyWorkingSetWithPinnedEditors(
				this.editorGroupsService,
				this.editorService,
				editorWorkingSetId,
				preserveFocus,
				this.configurationService.getValue<boolean>('scm.workingSets.persistPins')
			);
		}
	}

	override dispose(): void {
		this._restoreGeneration++;
		this._repositoryDisposables.dispose();
		super.dispose();
	}
}
