/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache } from '../../../../../base/common/observable.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';

export const enum DetailPanelTarget {
	Hidden,
	EditorHidden,
	Changes,
	ChangesForced,
	Files,
	FilesHidden,
	FilesForced,
	Preserve
}

/**
 * Shared mechanics for selecting the desktop detail content.
 */
export class DesktopDetailPanelCoordinator extends Disposable {

	private readonly _hasDockedDetailsContext: IContextKey<boolean>;
	private readonly _sequencer = new Sequencer();
	private _generation = 0;
	private _target = DetailPanelTarget.Preserve;
	private _transientHide: 'editor' | 'layout' | undefined;
	private _changingVisibility = false;

	private readonly _hasChanges = derivedObservableWithCache<boolean>(this, (reader, lastValue) => {
		if (this._changesViewService.activeSessionChangesetLoadingObs.read(reader)) {
			return lastValue ?? true;
		}
		return this._changesViewService.activeSessionChangesObs.read(reader).length > 0;
	});

	readonly hasChangesDetails = derived(this, reader => this._hasChanges.read(reader)
		|| (this._gitHubService.activeSessionPullRequestCIObs.read(reader)?.checks.read(reader).length ?? 0) > 0);

	get hiddenTransiently(): boolean { return this._transientHide !== undefined; }
	get hiddenByEditor(): boolean { return this._transientHide === 'editor'; }
	get changingVisibility(): boolean { return this._changingVisibility; }

	get intendedVisible(): boolean {
		return this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
			|| (this.hiddenTransiently && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
	}

	constructor(
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionsService sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
	) {
		super();
		this._hasDockedDetailsContext = HasDockedDetailsContext.bindTo(contextKeyService);
		this._register(this._layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.AUXILIARYBAR_PART && event.source !== 'resize') {
				this.resetTransientVisibility();
			}
			if (event.partId === Parts.AUXILIARYBAR_PART && event.visible) {
				this._queueTarget(this._target);
			}
		}));
		this._register(autorun(reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			const activeChat = activeSession?.activeChat.read(reader);
			if (!activeSession || (!(activeSession.isQuickChat?.read(reader) ?? false) && !activeChat?.workspace.read(reader))) {
				this.sync(DetailPanelTarget.Preserve);
			}
		}));
	}

	resetTransientVisibility(): void {
		this._transientHide = undefined;
	}

	setHiddenTransiently(hidden: boolean, byEditor = false): void {
		this._transientHide = hidden ? (byEditor ? 'editor' : 'layout') : undefined;
		this._changingVisibility = true;
		try {
			this._layoutService.setAuxiliaryBarHiddenForResize(hidden);
		} finally {
			this._changingVisibility = false;
		}
	}

	/**
	 * Publishes the target context and serializes Changes/Files container selection.
	 */
	sync(target: DetailPanelTarget): void {
		this._target = target;
		this._hasDockedDetailsContext.set(target === DetailPanelTarget.Changes || target === DetailPanelTarget.ChangesForced
			|| target === DetailPanelTarget.Files || target === DetailPanelTarget.FilesHidden || target === DetailPanelTarget.FilesForced);
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
			case DetailPanelTarget.FilesHidden:
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
