/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Parts, IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from './sessionChangesService.js';

const enum DetailPanelTarget {
	Hidden,
	Changes,
	Files
}

export class DetailPanelController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.detailPanelController';

	private readonly _activeEditorObs: IObservable<EditorInput | undefined>;
	private readonly _auxBarVisibleObs: IObservable<boolean>;
	private readonly _sequencer = new Sequencer();
	private _generation = 0;

	constructor(
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
	) {
		super();

		this._activeEditorObs = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
		this._auxBarVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));

		this._register(autorun(reader => {
			const target = this._computeTarget(reader);
			const auxBarVisible = this._auxBarVisibleObs.read(reader);
			const generation = ++this._generation;
			void this._sequencer.queue(() => this._syncTarget(target, auxBarVisible, generation)).catch(onUnexpectedError);
		}));
	}

	private _computeTarget(reader: IReader): DetailPanelTarget {
		const activeSession = this._sessionsService.activeSession.read(reader);
		const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
		const sessionHasWorkspace = !!activeSession?.workspace.read(reader);
		if (isQuickChat || !sessionHasWorkspace) {
			return DetailPanelTarget.Hidden;
		}

		const activeEditor = this._activeEditorObs.read(reader);
		if (!activeEditor) {
			return activeSession?.isCreated.read(reader) ? DetailPanelTarget.Changes : DetailPanelTarget.Files;
		}

		if (activeEditor instanceof BrowserEditorInput) {
			return DetailPanelTarget.Hidden;
		}

		return this._isChangesEditor(activeEditor) ? DetailPanelTarget.Changes : DetailPanelTarget.Files;
	}

	private async _syncTarget(target: DetailPanelTarget, auxBarVisible: boolean, generation: number): Promise<void> {
		if (generation !== this._generation) {
			return;
		}

		switch (target) {
			case DetailPanelTarget.Hidden:
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				return;
			case DetailPanelTarget.Changes:
				// Only switch the active container while the detail panel is visible so the
				// user can hide it; toggling it back on then shows the contextual container.
				if (auxBarVisible) {
					await this._viewsService.openViewContainer(CHANGES_VIEW_CONTAINER_ID, false);
				}
				return;
			case DetailPanelTarget.Files:
				if (auxBarVisible) {
					await this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
				}
				return;
		}
	}

	private _isChangesEditor(editor: EditorInput): boolean {
		const resource = editor.resource;
		return !!resource && this._sessionChangesService.getSessionResource(resource) !== undefined;
	}
}
