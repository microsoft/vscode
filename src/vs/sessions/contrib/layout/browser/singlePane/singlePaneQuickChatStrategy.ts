/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../../base/common/observable.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DetailPanelTarget, SinglePaneDetailPanelCoordinator } from './singlePaneDetailPanelCoordinator.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * Behaviour for the **Quick Chat** lifecycle stage — a workspace-less chat:
 *  - hides the side pane once when Quick Chat becomes active;
 *  - later explicit editor opens follow normal workbench behavior;
 *  - never persists a visibility profile and never touches the managed docked tabs — a quick
 *    chat's session simply reports `wantsChangesTab`/`wantsFilesTab` as `false` to the shared
 *    managed-tabs coordinator (owned by {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}),
 *    which reconciles any stray tabs away on its own ambient session-change trigger.
 */
export class SinglePaneQuickChatStrategy extends SinglePaneLayoutStrategy {

	private _activeQuickChatKey: string | undefined;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
	) {
		super(ctx);

		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession || !(activeSession.isQuickChat?.read(reader) ?? false)) {
				this._activeQuickChatKey = undefined;
				return;
			}

			const sessionKey = activeSession.resource.toString();
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (this._activeQuickChatKey !== sessionKey) {
				this._activeQuickChatKey = sessionKey;
				if (!multipleSessionsVisible) {
					this._layoutService.hideSidePane();
				}
				this._detailPanel.sync(DetailPanelTarget.Hidden);
			}
		}));
	}
}
