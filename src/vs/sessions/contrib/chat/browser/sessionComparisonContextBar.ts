/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonContextBar.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isActiveSessionStatus, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../sessionComparison/common/sessionComparison.js';

/**
 * A slim line above the chat input of a session that belongs to a comparison:
 * what this session is to the comparison, how the others are doing, and the
 * way back to the whole comparison.
 */
export class SessionComparisonContextBar extends Disposable {

	readonly domNode = dom.$('.session-comparison-context-bar');

	constructor(
		currentSession: IObservable<ISession | undefined>,
		private readonly onDidChangeLayout: () => void,
		@ISessionComparisonService comparisonService: ISessionComparisonService,
		@ISessionsManagementService managementService: ISessionsManagementService,
		@ICommandService commandService: ICommandService,
	) {
		super();
		this.domNode.hidden = true;
		this.domNode.setAttribute('role', 'note');
		this.domNode.appendChild(renderIcon(Codicon.layers));
		const label = dom.append(this.domNode, dom.$('span.session-comparison-context-bar-label'));
		const link = dom.append(this.domNode, dom.$('a.session-comparison-context-bar-link'));
		link.setAttribute('role', 'button');
		link.tabIndex = 0;
		link.textContent = localize('sessionComparisonContextBar.open', "View Comparison");

		let comparisonId: string | undefined;
		const open = () => {
			if (comparisonId) {
				void commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, comparisonId);
			}
		};
		this._register(dom.addDisposableListener(link, dom.EventType.CLICK, event => {
			dom.EventHelper.stop(event, true);
			open();
		}));
		this._register(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				dom.EventHelper.stop(event, true);
				open();
			}
		}));

		const sessionsChanged = observableSignalFromEvent(this, managementService.onDidChangeSessions);
		this._register(autorun(reader => {
			const session = currentSession.read(reader);
			sessionsChanged.read(reader);
			const comparison = session
				? comparisonService.comparisons.read(reader).find(candidate => candidate.archivedAt === undefined
					&& candidate.participants.some(participant => !!participant.sessionResource && isEqual(participant.sessionResource, session.resource)))
				: undefined;
			const participant = comparison?.participants.find(candidate => !!candidate.sessionResource && isEqual(candidate.sessionResource, session?.resource));
			const text = comparison && participant
				? describeSessionComparisonParticipant(comparison, participant, resource => {
					const participantSession = managementService.getSession(resource);
					return participantSession?.status.read(reader);
				})
				: undefined;
			comparisonId = comparison?.id;
			const wasHidden = this.domNode.hidden;
			this.domNode.hidden = !text;
			label.textContent = text ?? '';
			if (wasHidden !== this.domNode.hidden) {
				this.onDidChangeLayout();
			}
		}));
	}

	layout(_width: number): void { }
}

/** What a session is to its comparison, in the words the context bar shows. */
export function describeSessionComparisonParticipant(comparison: ISessionComparison, participant: ISessionComparisonParticipant, getStatus: (resource: NonNullable<ISessionComparisonParticipant['sessionResource']>) => SessionStatus | undefined): string {
	const runs = comparison.participants.filter(candidate => candidate.role === SessionComparisonParticipantRole.Attempt);
	switch (participant.role) {
		case SessionComparisonParticipantRole.Judge:
			return comparison.verdict
				? localize('sessionComparisonContextBar.judgeDone', "Reviewed {0} parallel runs", runs.length)
				: localize('sessionComparisonContextBar.judge', "Reviewing {0} parallel runs", runs.length);
		case SessionComparisonParticipantRole.Synthesis:
			return localize('sessionComparisonContextBar.synthesis', "Combines the changes you kept from {0} parallel runs", runs.length);
		case SessionComparisonParticipantRole.Attempt: {
			const index = runs.indexOf(participant) + 1;
			const running = runs.filter(run => run.sessionResource && isActiveSessionStatus(getStatus(run.sessionResource) ?? SessionStatus.Untitled)).length;
			if (comparison.selectedParticipantId === participant.id) {
				return localize('sessionComparisonContextBar.runContinued', "Run {0} of {1} · you continued with this run", index, runs.length);
			}
			if (comparison.verdict) {
				return comparison.verdict.recommendedParticipantId === participant.id
					? localize('sessionComparisonContextBar.runSuggested', "Run {0} of {1} · suggested by the review", index, runs.length)
					: localize('sessionComparisonContextBar.runReviewed', "Run {0} of {1} · the review is ready", index, runs.length);
			}
			return running > 0
				? localize('sessionComparisonContextBar.runRunning', "Run {0} of {1} · {2} still running", index, runs.length, running)
				: localize('sessionComparisonContextBar.run', "Run {0} of {1} in a comparison", index, runs.length);
		}
		default:
			return localize('sessionComparisonContextBar.participant', "Part of a comparison of {0} runs", runs.length);
	}
}
