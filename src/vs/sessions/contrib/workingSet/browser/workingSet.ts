/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, derivedOpts, IObservable, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionWorkingSetController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWorkingSetController';

	private readonly _useModalConfigObs: IObservable<'off' | 'some' | 'all'>;
	private readonly _workingSets = new ResourceMap<IEditorWorkingSet>();
	private readonly _workingSetSequencer = new Sequencer();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		const activeSession = derivedOpts<IActiveSession | undefined>({
			equalsFn: ((a, b) => isEqual(a?.resource, b?.resource))
		}, reader => {
			return this._sessionManagementService.activeSession.read(reader);
		});

		this._register(autorun(reader => {
			const _useModalConfig = this._useModalConfigObs.read(reader);
			if (_useModalConfig === 'all') {
				return;
			}

			// Session changed (save)
			reader.store.add(runOnChange(activeSession, (_, previousSession) => {
				if (!previousSession || previousSession.status.read(undefined) === SessionStatus.Untitled) {
					return;
				}

				this._saveWorkingSet(previousSession.resource);
			}));

			// Workspace folders changes (apply)
			reader.store.add(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
				const activeSessionResource = activeSession.read(undefined)?.resource;
				if (!activeSessionResource) {
					return;
				}

				void this._applyWorkingSet(activeSessionResource);
			}));
		}));
	}

	private _saveWorkingSet(sessionResource: URI): void {
		const existingWorkingSet = this._workingSets.get(sessionResource);
		if (existingWorkingSet) {
			this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
		}

		const workingSet = this._editorGroupsService.saveWorkingSet(`session-working-set:${sessionResource.toString()}`);
		this._workingSets.set(sessionResource, workingSet);
	}

	private async _applyWorkingSet(sessionResource: URI): Promise<void> {
		const workingSet: IEditorWorkingSet | 'empty' = this._workingSets.get(sessionResource) ?? 'empty';
		const preserveFocus = this._layoutService.hasFocus(Parts.PANEL_PART);

		return this._workingSetSequencer.queue(async () => {
			const applied = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			if (applied && this._editorService.visibleEditors.length > 0) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		});
	}

	override dispose(): void {
		for (const [, workingSet] of this._workingSets) {
			this._editorGroupsService.deleteWorkingSet(workingSet);
		}

		super.dispose();
	}
}
