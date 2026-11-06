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
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../../../../workbench/contrib/sessions/common/sessionComparisonConstants.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';

const HIDE_INACTIVE_COMPARISON_INPUTS_CLASS = 'session-comparison-hide-inactive-inputs';
const COMPARISON_GRID_ACTIVE_CLASS = 'session-comparison-grid-active';

export class SessionComparisonGridController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionComparisonGridController';
	private _comparisonGridActive = false;
	private _isolatedJudge: { paneId: string; chatResource: URI } | undefined;
	private _keepSidePaneHidden = false;
	private _pendingJudgeIsolationPaneId: string | undefined;
	private _visibleComparison: ISessionComparison | undefined;
	private _comparisonGridCollapseRequest = 0;
	private readonly _partsHiddenByController = new Set<Parts>();

	constructor(
		@ISessionsPartService sessionsPartService: ISessionsPartService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsHostLayoutService private readonly hostLayoutService: ISessionsHostLayoutService,
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
			const panes = this.sessionsService.panes.read(reader);
			const activePane = this.sessionsService.activePane.read(reader);
			const comparisons = this.comparisonService.comparisons.read(reader);
			const comparison = this._getComparisonForPanes(panes, comparisons, reader);
			const previousComparison = this._visibleComparison;
			this._visibleComparison = comparison;
			if (comparison) {
				this._comparisonGridCollapseRequest++;
			} else if (previousComparison && panes.length > 1) {
				this._scheduleComparisonGridCollapse(previousComparison, panes, activePane, reader);
			}
			this._comparisonGridActive = comparison !== undefined;
			this.layoutService.mainContainer.classList.toggle(COMPARISON_GRID_ACTIVE_CLASS, this._comparisonGridActive);
			this.layoutService.mainContainer.classList.toggle(
				HIDE_INACTIVE_COMPARISON_INPUTS_CLASS,
				hideInactiveInputs.read(reader)
				&& !screenReaderOptimized.read(reader)
				&& panes.length > 2
				&& comparison !== undefined,
			);
			const activeSession = activePane?.session.read(reader);
			if (!this._comparisonGridActive && this._isolatedJudge
				&& (panes.length !== 1
					|| panes[0].id !== this._isolatedJudge.paneId
					|| !activePane || !activeSession
					|| activePane.id !== this._isolatedJudge.paneId
					|| !isEqual(activePane.chat.read(reader)?.resource, this._isolatedJudge.chatResource)
					|| !comparisons.some(candidate => candidate.archivedAt === undefined && candidate.participants.some(participant =>
						participant.role === SessionComparisonParticipantRole.Judge
						&& isEqual(participant.sessionResource, activeSession.resource)
						&& (!participant.chatResource || isEqual(participant.chatResource, activePane.chat.read(reader)?.resource)))))) {
				this._isolatedJudge = undefined;
			}
			const keepSidePaneHidden = this._comparisonGridActive || this._isolatedJudge !== undefined;
			const activeJudgePaneId = this._getJudgePaneId(activePane, panes, comparisons, reader);
			if (activeJudgePaneId) {
				this._scheduleJudgeIsolation(activeJudgePaneId);
			}
			this._setSidePaneSuppressed(keepSidePaneHidden);
		}));
		this._register(this.layoutService.onDidChangePartVisibility(event => {
			if (event.visible && this._keepSidePaneHidden
				&& (event.partId === Parts.EDITOR_PART || event.partId === Parts.AUXILIARYBAR_PART)) {
				this._partsHiddenByController.delete(event.partId);
			}
		}));
		this._register(sessionsPartService.onDidFocusPane(paneId => this._onDidFocusPane(paneId)));
		this._register(toDisposable(() => {
			this._setSidePaneSuppressed(false);
			this.layoutService.mainContainer.classList.remove(HIDE_INACTIVE_COMPARISON_INPUTS_CLASS, COMPARISON_GRID_ACTIVE_CLASS);
		}));
	}

	private _scheduleComparisonGridCollapse(
		comparison: ISessionComparison,
		panes: readonly ISessionGridPane[],
		activePane: ISessionGridPane | undefined,
		reader: IReader,
	): void {
		const isParticipant = (pane: ISessionGridPane) => {
			const session = pane.session.read(reader);
			return !!session && comparison.participants.some(participant =>
				participant.sessionResource && isEqual(participant.sessionResource, session.resource));
		};
		const preferredPane = (activePane?.session.read(reader) && panes.includes(activePane) && !isParticipant(activePane) ? activePane : undefined)
			?? panes.find(pane => pane.session.read(reader) && !isParticipant(pane));
		const request = ++this._comparisonGridCollapseRequest;
		queueMicrotask(() => {
			if (request !== this._comparisonGridCollapseRequest) {
				return;
			}
			this._collapseComparisonGrid(preferredPane?.id);
		});
	}

	private _collapseComparisonGrid(preferredPaneId: string | undefined): void {
		const panes = this.sessionsService.panes.get();
		if (panes.length <= 1 || this._getComparisonForPanes(panes, this.comparisonService.comparisons.get()) !== undefined) {
			return;
		}
		const activePane = this.sessionsService.activePane.get();
		let survivor = preferredPaneId ? panes.find(pane => pane.id === preferredPaneId) : undefined;
		if (!survivor && activePane?.session.get() && panes.includes(activePane)) {
			survivor = activePane;
		}
		if (!survivor) {
			// The new-session slot survives, else the first pane that shows a session.
			survivor = panes.find(pane => !pane.session.get()) ?? panes.find(pane => pane.session.get());
		}
		if (survivor) {
			this.sessionsService.collapseToPane(survivor);
		}
	}

	private _onDidFocusPane(paneId: string): void {
		const panes = this.sessionsService.panes.get();
		const focused = panes.find(pane => pane.id === paneId);
		const judgePaneId = this._getJudgePaneId(focused, panes, this.comparisonService.comparisons.get());
		if (!judgePaneId) {
			return;
		}
		this._isolateJudge(judgePaneId);
	}

	private _scheduleJudgeIsolation(paneId: string): void {
		if (this._pendingJudgeIsolationPaneId === paneId) {
			return;
		}
		this._pendingJudgeIsolationPaneId = paneId;
		queueMicrotask(() => {
			if (this._pendingJudgeIsolationPaneId !== paneId) {
				return;
			}
			this._pendingJudgeIsolationPaneId = undefined;
			this._isolateJudge(paneId);
		});
	}

	private _isolateJudge(paneId: string): void {
		const panes = this.sessionsService.panes.get();
		const judgePane = panes.find(pane => pane.id === paneId);
		const judgeSession = judgePane?.session.get();
		const judgeChat = judgePane?.chat.get();
		if (!judgePane || !judgeSession || !judgeChat || this._getJudgePaneId(judgePane, panes, this.comparisonService.comparisons.get()) !== paneId) {
			return;
		}
		this._isolatedJudge = { paneId, chatResource: judgeChat.resource };
		if (judgePane.kind === SessionGridPaneKind.Detached || panes.some(pane => pane !== judgePane && pane.session.get()?.sessionId === judgeSession.sessionId)) {
			this.sessionsService.collapseToPane(judgePane);
			this._setSidePaneSuppressed(true);
			return;
		}
		for (const pane of panes) {
			if (pane.session.get()?.sessionId !== judgeSession.sessionId) {
				this.sessionsService.closePane(pane);
			}
		}
		this.sessionsService.showSession(judgeSession.resource);
		this._setSidePaneSuppressed(true);
	}

	private _getJudgePaneId(pane: ISessionGridPane | undefined, panes: readonly ISessionGridPane[], comparisons: readonly ISessionComparison[], reader?: IReader): string | undefined {
		const session = pane?.session.read(reader);
		if (!pane || !session) {
			return undefined;
		}
		const comparison = this._getComparisonForPanes(panes, comparisons, reader);
		const participant = comparison?.participants.find(candidate =>
			candidate.sessionResource && isEqual(candidate.sessionResource, session.resource)
			&& (!candidate.chatResource || isEqual(candidate.chatResource, pane.chat.read(reader)?.resource)));
		return participant?.role === SessionComparisonParticipantRole.Judge ? pane.id : undefined;
	}

	/** The comparison every pane of the grid shows a participant of, when it shows two or more and no new-session slot. */
	private _getComparisonForPanes(panes: readonly ISessionGridPane[], comparisons: readonly ISessionComparison[], reader?: IReader): ISessionComparison | undefined {
		if (panes.length <= 1 || panes.some(pane => !pane.session.read(reader))) {
			return undefined;
		}
		const isParticipantOf = (comparison: ISessionComparison, pane: ISessionGridPane) => comparison.participants.some(participant =>
			participant.sessionResource && isEqual(participant.sessionResource, pane.session.read(reader)!.resource)
			&& (!participant.chatResource || isEqual(participant.chatResource, pane.chat.read(reader)?.resource)));
		// Archived comparisons are history only; they must not drive the comparison layout.
		const comparison = comparisons.find(candidate => candidate.archivedAt === undefined && isParticipantOf(candidate, panes[0]));
		return comparison && panes.every(pane => isParticipantOf(comparison, pane)) ? comparison : undefined;
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
		const suppression = this.hostLayoutService.suppressEditorPartAutoVisibility();
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
