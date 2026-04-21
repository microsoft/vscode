/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, derivedObservableWithCache, IObservable, observableFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

type ISessionSerializedWorkingSet = {
	readonly sessionResource: string;
	readonly editorWorkingSet: IEditorWorkingSet;
};

export class SessionWorkingSetController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWorkingSetController';
	private static readonly STORAGE_KEY = 'sessions.workingSets';

	private readonly _useModalConfigObs: IObservable<'off' | 'some' | 'all'>;
	private readonly _workingSets: ResourceMap<IEditorWorkingSet>;
	private readonly _workingSetSequencer = new Sequencer();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._workingSets = this._loadWorkingSets();

		this._useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		// Workspace folders
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders);

		const activeSession = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, lastValue) => {
			const workspaceFolders = workspaceFoldersObs.read(reader);
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionWorkspace = activeSession?.workspace.read(reader)?.repositories[0];
			const activeSessionWorkspaceUri = activeSessionWorkspace?.workingDirectory ?? activeSessionWorkspace?.uri;

			// The active session is updated before the workspace folders are updated. We
			// need to wait until the workspace folders are updated before considering the
			// active session.
			if (
				activeSessionWorkspaceUri &&
				!workspaceFolders.some(folder => isEqual(folder.uri, activeSessionWorkspaceUri))
			) {
				return lastValue;
			}

			if (isEqual(activeSession?.resource, lastValue?.resource)) {
				return lastValue;
			}

			return activeSession;
		});

		this._register(autorun(reader => {
			const _useModalConfig = this._useModalConfigObs.read(reader);
			if (_useModalConfig === 'all') {
				return;
			}

			// Session changed (save, apply)
			reader.store.add(runOnChange(activeSession, (session, previousSession) => {
				// Save working set for previous session (skip for untitled sessions)
				if (previousSession && previousSession.status.read(undefined) !== SessionStatus.Untitled) {
					this._saveWorkingSet(previousSession.resource);
				}

				// Apply working set for current session
				void this._applyWorkingSet(session?.resource);
			}));

			// Session state changed (archive, delete)
			reader.store.add(this._sessionManagementService.onDidChangeSessions(e => {
				const archivedSessions = e.changed.filter(session => session.isArchived.read(undefined));
				for (const session of [...e.removed, ...archivedSessions]) {
					this._deleteWorkingSet(session.resource);
				}
			}));

			// Save working sets to storage
			reader.store.add(this._storageService.onWillSaveState(() => {
				const activeSession = this._sessionManagementService.activeSession.read(undefined);

				// Save working set for previous session (skip for untitled sessions)
				if (activeSession && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
					this._saveWorkingSet(activeSession.resource);
				}

				this._storeWorkingSets();
			}));
		}));
	}

	private _loadWorkingSets(): ResourceMap<IEditorWorkingSet> {
		const workingSets = new ResourceMap<IEditorWorkingSet>();
		const workingSetsRaw = this._storageService.get(SessionWorkingSetController.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!workingSetsRaw) {
			return workingSets;
		}

		for (const serializedWorkingSet of JSON.parse(workingSetsRaw) as ISessionSerializedWorkingSet[]) {
			const sessionResource = URI.parse(serializedWorkingSet.sessionResource);
			workingSets.set(sessionResource, serializedWorkingSet.editorWorkingSet);
		}

		return workingSets;
	}

	private _storeWorkingSets(): void {
		if (this._workingSets.size === 0) {
			this._storageService.remove(SessionWorkingSetController.STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const serializedWorkingSets: ISessionSerializedWorkingSet[] = [];
		for (const [sessionResource, editorWorkingSet] of this._workingSets) {
			serializedWorkingSets.push({ sessionResource: sessionResource.toString(), editorWorkingSet });
		}

		this._storageService.store(SessionWorkingSetController.STORAGE_KEY, JSON.stringify(serializedWorkingSets), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _applyWorkingSet(sessionResource: URI | undefined): Promise<void> {
		const preserveFocus = this._layoutService.hasFocus(Parts.PANEL_PART);
		const workingSet: IEditorWorkingSet | 'empty' = sessionResource
			? (this._workingSets.get(sessionResource) ?? 'empty')
			: 'empty';

		return this._workingSetSequencer.queue(async () => {
			if (workingSet === 'empty') {
				// Applying an empty working set closes all editors, and we already have an
				// event listener that listens to the editor close event to hide the editor
				// part if there are no visible editors
				await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				return;
			}

			if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				// Applying the working set requires the editor part to be visible
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}

			// Applying the working set closes all editors which triggers the event listener
			// to close the editor part. After we apply the working set we need to show the
			// editor part
			const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			if (result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		});
	}

	private _saveWorkingSet(sessionResource: URI): void {
		// Delete existing working set
		this._deleteWorkingSet(sessionResource);

		// Add new working set
		if (this._editorService.visibleEditors.length > 0) {
			const workingSetName = `session-working-set:${sessionResource.toString()}`;
			const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
			this._workingSets.set(sessionResource, workingSet);
		}
	}

	private _deleteWorkingSet(sessionResource: URI): void {
		const existingWorkingSet = this._workingSets.get(sessionResource);
		if (!existingWorkingSet) {
			return;
		}

		this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
		this._workingSets.delete(sessionResource);
	}
}
