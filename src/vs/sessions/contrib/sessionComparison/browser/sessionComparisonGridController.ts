/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionComparisonGridController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionComparisonGridController';
	private _gridKey: string | undefined;
	private _ignoredInitialFocusGridKey: string | undefined;
	private _comparisonGridActive = false;
	private _isolatedJudgeSessionId: string | undefined;
	private _keepSidePaneHidden = false;

	constructor(
		@ISessionsPartService sessionsPartService: ISessionsPartService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
	) {
		super();
		this._register(autorun(reader => {
			const layout = this.sessionsService.sessionGridLayout.read(reader);
			const visibleSessions = this.sessionsService.visibleSessions.read(reader);
			const activeSession = this.sessionsService.activeSession.read(reader);
			const comparisons = this.comparisonService.comparisons.read(reader);
			this._comparisonGridActive = layout === 'grid' && this._isComparisonGrid(visibleSessions, comparisons);
			if (!this._comparisonGridActive && this._isolatedJudgeSessionId
				&& (visibleSessions.length !== 1
					|| visibleSessions[0]?.sessionId !== this._isolatedJudgeSessionId
					|| activeSession?.sessionId !== this._isolatedJudgeSessionId)) {
				this._isolatedJudgeSessionId = undefined;
			}
			this._keepSidePaneHidden = this._comparisonGridActive || this._isolatedJudgeSessionId !== undefined;
			this._updateGridKey(this._comparisonGridActive
				? visibleSessions.map(session => session?.sessionId ?? '').join('\0')
				: undefined);
			if (this._keepSidePaneHidden) {
				this._hideSidePane();
			}
		}));
		this._register(this.layoutService.onDidChangePartVisibility(event => {
			if (event.visible && this._keepSidePaneHidden
				&& (event.partId === Parts.EDITOR_PART || event.partId === Parts.AUXILIARYBAR_PART)) {
				this._hideSidePane();
			}
		}));
		this._register(sessionsPartService.onDidFocusSession(sessionId => this._onDidFocusSession(sessionId)));
	}

	private _onDidFocusSession(sessionId: string): void {
		const visibleSessions = this.sessionsService.visibleSessions.get();
		if (this.sessionsService.sessionGridLayout.get() !== 'grid'
			|| !this._isComparisonGrid(visibleSessions, this.comparisonService.comparisons.get())) {
			return;
		}
		const gridKey = visibleSessions.map(session => session?.sessionId ?? '').join('\0');
		this._updateGridKey(gridKey);
		if (this._ignoredInitialFocusGridKey === gridKey) {
			this._ignoredInitialFocusGridKey = undefined;
			return;
		}
		const focusedSession = visibleSessions.find(session => session?.sessionId === sessionId);
		if (!focusedSession) {
			return;
		}
		const comparison = this.comparisonService.getComparisonForSession(focusedSession.resource);
		const participant = comparison?.participants.find(candidate =>
			candidate.sessionResource && isEqual(candidate.sessionResource, focusedSession.resource));
		if (participant?.role !== SessionComparisonParticipantRole.Judge) {
			return;
		}
		this._isolatedJudgeSessionId = sessionId;
		this._keepSidePaneHidden = true;
		for (const session of visibleSessions) {
			if (session?.sessionId !== sessionId) {
				this.sessionsService.closeSession(session);
			}
		}
		this.sessionsService.resetSessionGridLayout();
		this._hideSidePane();
	}

	private _isComparisonGrid(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): boolean {
		if (visibleSessions.length <= 1 || visibleSessions.some(session => !session)) {
			return false;
		}
		const firstSession = visibleSessions[0]!;
		const comparison = comparisons.find(candidate =>
			candidate.participants.some(participant => participant.sessionResource && isEqual(participant.sessionResource, firstSession.resource)));
		return !!comparison && visibleSessions.every(session => comparison.participants.some(participant =>
			participant.sessionResource && isEqual(participant.sessionResource, session!.resource)));
	}

	private _hideSidePane(): void {
		const suppression = this.layoutService.suppressEditorPartAutoVisibility();
		try {
			if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this.layoutService.setPartHidden(true, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	private _updateGridKey(gridKey: string | undefined): void {
		if (this._gridKey === gridKey) {
			return;
		}
		this._gridKey = gridKey;
		this._ignoredInitialFocusGridKey = gridKey;
		if (gridKey) {
			queueMicrotask(() => {
				if (this._ignoredInitialFocusGridKey === gridKey) {
					this._ignoredInitialFocusGridKey = undefined;
				}
			});
		}
	}
}
