/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';

export const enum DetailPanelTarget {
	Hidden,
	EditorHidden,
	Changes,
	ChangesForced,
	Files,
	FilesForced,
	Preserve
}

/**
 * Shared mechanics for selecting the single-pane detail content.
 */
export class SinglePaneDetailPanelCoordinator extends Disposable {

	private readonly _hasDockedDetailsContext: IContextKey<boolean>;
	private readonly _sequencer = new Sequencer();
	private _generation = 0;
	private _target = DetailPanelTarget.Preserve;

	constructor(
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionsService sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._hasDockedDetailsContext = HasDockedDetailsContext.bindTo(contextKeyService);
		this._register(this._layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.AUXILIARYBAR_PART && event.visible) {
				this._queueTarget(this._target);
			}
		}));
		this._register(autorun(reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			if (!activeSession || (!(activeSession.isQuickChat?.read(reader) ?? false) && !activeSession.workspace.read(reader))) {
				this.sync(DetailPanelTarget.Preserve);
			}
		}));
	}

	/**
	 * Publishes the target context and serializes Changes/Files container selection.
	 */
	sync(target: DetailPanelTarget): void {
		this._target = target;
		this._hasDockedDetailsContext.set(target === DetailPanelTarget.Changes || target === DetailPanelTarget.ChangesForced
			|| target === DetailPanelTarget.Files || target === DetailPanelTarget.FilesForced);
		this._queueTarget(target);
	}

	private _queueTarget(target: DetailPanelTarget): void {
		const generation = ++this._generation;
		void this._sequencer.queue(() => this._syncTarget(target, generation)).catch(onUnexpectedError);
	}

	private async _syncTarget(target: DetailPanelTarget, generation: number): Promise<void> {
		if (generation !== this._generation || !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		switch (target) {
			case DetailPanelTarget.Changes:
			case DetailPanelTarget.ChangesForced:
				await this._viewsService.openViewContainer(CHANGES_VIEW_CONTAINER_ID, false);
				return;
			case DetailPanelTarget.Files:
			case DetailPanelTarget.FilesForced:
				await this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
				return;
			case DetailPanelTarget.Hidden:
			case DetailPanelTarget.EditorHidden:
			case DetailPanelTarget.Preserve:
				return;
		}
	}
}
