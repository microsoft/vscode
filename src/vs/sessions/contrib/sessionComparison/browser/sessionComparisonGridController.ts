/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../common/sessionComparison.js';

const HIDE_INACTIVE_COMPARISON_INPUTS_CLASS = 'session-comparison-hide-inactive-inputs';
const COMPARISON_GRID_ACTIVE_CLASS = 'session-comparison-grid-active';

export class SessionComparisonGridController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionComparisonGridController';
	private _comparisonGridActive = false;
	private _isolatedJudgeSessionId: string | undefined;
	private _keepSidePaneHidden = false;
	private _pendingJudgeIsolationSessionId: string | undefined;
	private readonly _partsHiddenByController = new Set<Parts>();

	constructor(
		@ISessionsPartService sessionsPartService: ISessionsPartService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();
		const hideInactiveInputs = observableFromEvent(
			this,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(HIDE_INACTIVE_COMPARISON_INPUTS_SETTING)),
			() => configurationService.getValue<boolean>(HIDE_INACTIVE_COMPARISON_INPUTS_SETTING),
		);
		const screenReaderOptimized = observableFromEvent(
			this,
			accessibilityService.onDidChangeScreenReaderOptimized,
			() => accessibilityService.isScreenReaderOptimized(),
		);
		this._register(autorun(reader => {
			const layout = this.sessionsService.sessionGridLayout.read(reader);
			const visibleSessions = this.sessionsService.visibleSessions.read(reader);
			const activeSession = this.sessionsService.activeSession.read(reader);
			const comparisons = this.comparisonService.comparisons.read(reader);
			this._comparisonGridActive = layout === 'grid' && this._isComparisonGrid(visibleSessions, comparisons);
			this.layoutService.mainContainer.classList.toggle(COMPARISON_GRID_ACTIVE_CLASS, this._comparisonGridActive);
			this.layoutService.mainContainer.classList.toggle(
				HIDE_INACTIVE_COMPARISON_INPUTS_CLASS,
				hideInactiveInputs.read(reader)
				&& !screenReaderOptimized.read(reader)
				&& layout === 'grid'
				&& visibleSessions.length > 2
				&& this._isAttemptComparisonGrid(visibleSessions, comparisons),
			);
			if (!this._comparisonGridActive && this._isolatedJudgeSessionId
				&& (visibleSessions.length !== 1
					|| visibleSessions[0]?.sessionId !== this._isolatedJudgeSessionId
					|| activeSession?.sessionId !== this._isolatedJudgeSessionId)) {
				this._isolatedJudgeSessionId = undefined;
			}
			const keepSidePaneHidden = this._comparisonGridActive || this._isolatedJudgeSessionId !== undefined;
			const activeJudgeSessionId = this._getJudgeSessionId(activeSession, visibleSessions, comparisons);
			if (activeJudgeSessionId) {
				this._scheduleJudgeIsolation(activeJudgeSessionId);
			}
			this._setSidePaneSuppressed(keepSidePaneHidden);
		}));
		this._register(this.layoutService.onDidChangePartVisibility(event => {
			if (event.visible && this._keepSidePaneHidden
				&& (event.partId === Parts.EDITOR_PART || event.partId === Parts.AUXILIARYBAR_PART)) {
				this._partsHiddenByController.delete(event.partId);
			}
		}));
		this._register(sessionsPartService.onDidFocusSession(sessionId => this._onDidFocusSession(sessionId)));
		this._register(toDisposable(() => {
			this._setSidePaneSuppressed(false);
			this.layoutService.mainContainer.classList.remove(HIDE_INACTIVE_COMPARISON_INPUTS_CLASS, COMPARISON_GRID_ACTIVE_CLASS);
		}));
	}

	private _onDidFocusSession(sessionId: string | undefined): void {
		if (sessionId === undefined) {
			return;
		}
		const visibleSessions = this.sessionsService.visibleSessions.get();
		const focusedSession = visibleSessions.find(session => session?.sessionId === sessionId);
		if (this._getJudgeSessionId(focusedSession, visibleSessions, this.comparisonService.comparisons.get()) !== sessionId) {
			return;
		}
		this._isolateJudge(sessionId);
	}

	private _scheduleJudgeIsolation(sessionId: string): void {
		if (this._pendingJudgeIsolationSessionId === sessionId) {
			return;
		}
		this._pendingJudgeIsolationSessionId = sessionId;
		queueMicrotask(() => {
			if (this._pendingJudgeIsolationSessionId !== sessionId) {
				return;
			}
			this._pendingJudgeIsolationSessionId = undefined;
			this._isolateJudge(sessionId);
		});
	}

	private _isolateJudge(sessionId: string): void {
		const visibleSessions = this.sessionsService.visibleSessions.get();
		const judgeSession = visibleSessions.find(session => session?.sessionId === sessionId);
		if (!judgeSession || this._getJudgeSessionId(judgeSession, visibleSessions, this.comparisonService.comparisons.get()) !== sessionId) {
			return;
		}
		this._isolatedJudgeSessionId = sessionId;
		this.sessionsService.showOnlySession(judgeSession);
		this._setSidePaneSuppressed(true);
	}

	private _isComparisonGrid(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): boolean {
		return this._getComparisonForVisibleSessions(visibleSessions, comparisons) !== undefined;
	}

	private _isAttemptComparisonGrid(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): boolean {
		const comparison = this._getComparisonForVisibleSessions(visibleSessions, comparisons);
		return !!comparison && visibleSessions.every(session => comparison.participants.some(participant =>
			participant.role === SessionComparisonParticipantRole.Attempt
			&& participant.sessionResource
			&& isEqual(participant.sessionResource, session!.resource)));
	}

	private _getJudgeSessionId(session: IActiveSession | undefined, visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): string | undefined {
		if (!session) {
			return undefined;
		}
		const comparison = this._getComparisonForVisibleSessions(visibleSessions, comparisons);
		const participant = comparison?.participants.find(candidate =>
			candidate.sessionResource && isEqual(candidate.sessionResource, session.resource));
		return participant?.role === SessionComparisonParticipantRole.Judge ? session.sessionId : undefined;
	}

	private _getComparisonForVisibleSessions(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): ISessionComparison | undefined {
		if (visibleSessions.length <= 1 || visibleSessions.some(session => !session)) {
			return undefined;
		}
		const firstSession = visibleSessions[0]!;
		const comparison = comparisons.find(candidate =>
			candidate.participants.some(participant => participant.sessionResource && isEqual(participant.sessionResource, firstSession.resource)));
		return comparison && visibleSessions.every(session => comparison.participants.some(participant =>
			participant.sessionResource && isEqual(participant.sessionResource, session!.resource)))
			? comparison
			: undefined;
	}

	private _setSidePaneSuppressed(suppressed: boolean): void {
		if (this._keepSidePaneHidden === suppressed) {
			return;
		}
		this._keepSidePaneHidden = suppressed;
		if (suppressed) {
			this._hideSidePane();
		} else {
			this._restoreSidePane();
		}
	}

	private _hideSidePane(): void {
		const suppression = this.layoutService.suppressEditorPartAutoVisibility();
		try {
			if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._partsHiddenByController.add(Parts.AUXILIARYBAR_PART);
				this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._partsHiddenByController.add(Parts.EDITOR_PART);
				this.layoutService.setPartHidden(true, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	private _restoreSidePane(): void {
		for (const part of this._partsHiddenByController) {
			if (!this.layoutService.isVisible(part, mainWindow)) {
				this.layoutService.setPartHidden(false, part);
			}
		}
		this._partsHiddenByController.clear();
	}

}
