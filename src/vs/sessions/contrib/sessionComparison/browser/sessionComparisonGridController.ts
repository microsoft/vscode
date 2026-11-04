/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
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

function getPaneId(session: IActiveSession | undefined): string | undefined {
	return session?.scopedChatResource?.toString() ?? session?.sessionId;
}

export class SessionComparisonGridController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionComparisonGridController';
	private _comparisonGridActive = false;
	private _isolatedJudge: { paneId: string; chatResource: URI } | undefined;
	private _keepSidePaneHidden = false;
	private _pendingJudgeIsolationSessionId: string | undefined;
	private _visibleComparison: ISessionComparison | undefined;
	private _comparisonGridCollapseRequest = 0;
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
			const visibleSessions = this.sessionsService.visibleSessionPanes.read(reader);
			const activeSession = this.sessionsService.activeSession.read(reader);
			const comparisons = this.comparisonService.comparisons.read(reader);
			const comparison = this._getComparisonForVisibleSessions(visibleSessions, comparisons, reader);
			const previousComparison = this._visibleComparison;
			this._visibleComparison = comparison;
			if (comparison) {
				this._comparisonGridCollapseRequest++;
			} else if (previousComparison && visibleSessions.length > 1) {
				this._scheduleComparisonGridCollapse(previousComparison, visibleSessions, activeSession);
			}
			this._comparisonGridActive = comparison !== undefined;
			this.layoutService.mainContainer.classList.toggle(COMPARISON_GRID_ACTIVE_CLASS, this._comparisonGridActive);
			this.layoutService.mainContainer.classList.toggle(
				HIDE_INACTIVE_COMPARISON_INPUTS_CLASS,
				hideInactiveInputs.read(reader)
				&& !screenReaderOptimized.read(reader)
				&& visibleSessions.length > 2
				&& comparison !== undefined,
			);
			if (!this._comparisonGridActive && this._isolatedJudge
				&& (visibleSessions.length !== 1
					|| getPaneId(visibleSessions[0]) !== this._isolatedJudge.paneId
					|| !activeSession
					|| getPaneId(activeSession) !== this._isolatedJudge.paneId
					|| !isEqual(activeSession.activeChat.read(reader).resource, this._isolatedJudge.chatResource)
					|| !comparisons.some(candidate => candidate.archivedAt === undefined && candidate.participants.some(participant =>
						participant.role === SessionComparisonParticipantRole.Judge
						&& isEqual(participant.sessionResource, activeSession.resource)
						&& (!participant.chatResource || isEqual(participant.chatResource, activeSession.activeChat.read(reader).resource)))))) {
				this._isolatedJudge = undefined;
			}
			const keepSidePaneHidden = this._comparisonGridActive || this._isolatedJudge !== undefined;
			const activeJudgeSessionId = this._getJudgeSessionId(activeSession, visibleSessions, comparisons, reader);
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

	private _scheduleComparisonGridCollapse(
		comparison: ISessionComparison,
		visibleSessions: readonly (IActiveSession | undefined)[],
		activeSession: IActiveSession | undefined,
	): void {
		const isParticipant = (session: IActiveSession | undefined) => !!session && comparison.participants.some(participant =>
			participant.sessionResource && isEqual(participant.sessionResource, session.resource));
		const preferredSession = visibleSessions.find(session => getPaneId(session) === getPaneId(activeSession) && !isParticipant(session))
			?? visibleSessions.find(session => session && !isParticipant(session));
		const request = ++this._comparisonGridCollapseRequest;
		queueMicrotask(() => {
			if (request !== this._comparisonGridCollapseRequest) {
				return;
			}
			this._collapseComparisonGrid(getPaneId(preferredSession));
		});
	}

	private _collapseComparisonGrid(preferredSessionId: string | undefined): void {
		const visibleSessions = this.sessionsService.visibleSessionPanes.get();
		if (visibleSessions.length <= 1 || this._isComparisonGrid(visibleSessions, this.comparisonService.comparisons.get())) {
			return;
		}
		const activeSession = this.sessionsService.activeSession.get();
		let survivor = preferredSessionId
			? visibleSessions.find(session => getPaneId(session) === preferredSessionId)
			: undefined;
		if (!survivor && activeSession) {
			survivor = visibleSessions.find(session => getPaneId(session) === getPaneId(activeSession));
		}
		if (!survivor && !visibleSessions.some(session => session === undefined)) {
			survivor = visibleSessions.find(session => session);
		}
		this.sessionsService.collapseToSession(survivor);
	}

	private _onDidFocusSession(sessionId: string | undefined): void {
		if (sessionId === undefined) {
			return;
		}
		const visibleSessions = this.sessionsService.visibleSessionPanes.get();
		const active = this.sessionsService.activeSession.get();
		const focusedSession = active?.sessionId === sessionId ? active : visibleSessions.find(session => session?.sessionId === sessionId);
		const judgePaneId = this._getJudgeSessionId(focusedSession, visibleSessions, this.comparisonService.comparisons.get());
		if (!judgePaneId) {
			return;
		}
		this._isolateJudge(judgePaneId);
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
		const visibleSessions = this.sessionsService.visibleSessionPanes.get();
		const judgeSession = visibleSessions.find(session => getPaneId(session) === sessionId);
		if (!judgeSession || this._getJudgeSessionId(judgeSession, visibleSessions, this.comparisonService.comparisons.get()) !== sessionId) {
			return;
		}
		this._isolatedJudge = { paneId: sessionId, chatResource: judgeSession.activeChat.get().resource };
		if (judgeSession.scopedChatResource || visibleSessions.some(session => session !== judgeSession && session?.sessionId === judgeSession.sessionId)) {
			this.sessionsService.collapseToSession(judgeSession);
			this._setSidePaneSuppressed(true);
			return;
		}
		for (const session of visibleSessions) {
			if (session?.sessionId !== sessionId) {
				this.sessionsService.closeSession(session);
			}
		}
		this.sessionsService.showSession(judgeSession.resource);
		this._setSidePaneSuppressed(true);
	}

	private _isComparisonGrid(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): boolean {
		return this._getComparisonForVisibleSessions(visibleSessions, comparisons) !== undefined;
	}

	private _getJudgeSessionId(session: IActiveSession | undefined, visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[], reader?: IReader): string | undefined {
		if (!session) {
			return undefined;
		}
		const comparison = this._getComparisonForVisibleSessions(visibleSessions, comparisons, reader);
		const participant = comparison?.participants.find(candidate =>
			candidate.sessionResource && isEqual(candidate.sessionResource, session.resource)
			&& (!candidate.chatResource || isEqual(candidate.chatResource, session.activeChat.read(reader).resource)));
		return participant?.role === SessionComparisonParticipantRole.Judge ? getPaneId(session) : undefined;
	}

	private _getComparisonForVisibleSessions(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[], reader?: IReader): ISessionComparison | undefined {
		if (visibleSessions.length <= 1 || visibleSessions.some(session => !session)) {
			return undefined;
		}
		const firstSession = visibleSessions[0]!;
		// Archived comparisons are history only; they must not drive the comparison layout.
		const comparison = comparisons.find(candidate => candidate.archivedAt === undefined
			&& candidate.participants.some(participant => participant.sessionResource && isEqual(participant.sessionResource, firstSession.resource)
				&& (!participant.chatResource || isEqual(participant.chatResource, firstSession.activeChat.read(reader).resource))));
		return comparison && visibleSessions.every(session => comparison.participants.some(participant =>
			participant.sessionResource && isEqual(participant.sessionResource, session!.resource)
			&& (!participant.chatResource || isEqual(participant.chatResource, session!.activeChat.read(reader).resource))))
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
