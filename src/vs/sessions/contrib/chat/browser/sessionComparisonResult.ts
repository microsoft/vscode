/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonResult.css';
import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptLabel, ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';

export class SessionComparisonResult extends Disposable {

	readonly domNode = dom.$('.session-comparison-result');
	private readonly renderStore = this._register(new DisposableStore());
	private announcedComparisonId: string | undefined;

	constructor(
		currentSession: IObservable<ISession | undefined>,
		private readonly onDidChangeLayout: () => void,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.domNode.hidden = true;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', localize('sessionComparisonResult.ariaLabel', "Attempt comparison result"));

		this._register(autorun(reader => {
			const session = currentSession.read(reader);
			const comparison = session
				? this.comparisonService.comparisons.read(reader).find(candidate => isJudgeSession(candidate, session))
				: undefined;
			this.render(comparison?.verdict ? comparison : undefined);
		}));
	}

	private render(comparison: ISessionComparison | undefined): void {
		this.renderStore.clear();
		dom.clearNode(this.domNode);
		const wasHidden = this.domNode.hidden;
		this.domNode.hidden = !comparison;
		if (!comparison?.verdict) {
			if (!wasHidden) {
				this.onDidChangeLayout();
			}
			return;
		}

		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const winner = attempts.find(participant => participant.id === comparison.verdict?.recommendedParticipantId);
		if (!winner) {
			this.domNode.hidden = true;
			return;
		}
		const winnerLabel = getSessionComparisonAttemptLabel(winner, attempts.indexOf(winner));
		dom.append(this.domNode, dom.$('h2.session-comparison-result-title')).textContent =
			localize('sessionComparisonResult.winner', "{0} won", winnerLabel);
		dom.append(this.domNode, dom.$('h3.session-comparison-result-subtitle')).textContent =
			localize('sessionComparisonResult.whyWinner', "Why it won");
		dom.append(this.domNode, dom.$('p.session-comparison-result-explanation')).textContent = comparison.verdict.explanation;

		const otherAttempts = attempts.filter(attempt => attempt.id !== winner.id);
		if (otherAttempts.length > 0) {
			dom.append(this.domNode, dom.$('h3.session-comparison-result-subtitle')).textContent =
				localize('sessionComparisonResult.otherStrengths', "Strong points from other attempts");
			const table = dom.append(this.domNode, dom.$('table.session-comparison-result-strengths'));
			const head = dom.append(table, dom.$('thead'));
			const headerRow = dom.append(head, dom.$('tr'));
			const attemptHeader = dom.append(headerRow, dom.$('th'));
			attemptHeader.setAttribute('scope', 'col');
			attemptHeader.textContent = localize('sessionComparisonResult.attempt', "Attempt");
			const strengthsHeader = dom.append(headerRow, dom.$('th'));
			strengthsHeader.setAttribute('scope', 'col');
			strengthsHeader.textContent = localize('sessionComparisonResult.strongPoints', "Strong points");
			const body = dom.append(table, dom.$('tbody'));
			for (const attempt of otherAttempts) {
				const verdict = comparison.verdict.attempts.find(candidate => candidate.participantId === attempt.id);
				const strengths = verdict?.notableDifferences.length ? verdict.notableDifferences : verdict?.summary ? [verdict.summary] : [];
				const row = dom.append(body, dom.$('tr'));
				const label = getSessionComparisonAttemptLabel(attempt, attempts.indexOf(attempt));
				const attemptHeader = dom.append(row, dom.$('th'));
				attemptHeader.setAttribute('scope', 'row');
				attemptHeader.textContent = label;
				dom.append(row, dom.$('td')).textContent = strengths.length > 0
					? strengths.join('; ')
					: localize('sessionComparisonResult.noStrengths', "No distinct strong points reported");
			}
		}

		const actions = dom.append(this.domNode, dom.$('.session-comparison-result-actions'));
		if (winner.sessionResource) {
			const focusWinner = this.renderStore.add(new Button(actions, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonResult.focusWinnerAriaLabel', "Focus winning session, {0}", winnerLabel),
			}));
			focusWinner.label = localize('sessionComparisonResult.focusWinner', "Focus Winning Session");
			this.renderStore.add(focusWinner.onDidClick(() => this.focusWinner(comparison, winner, focusWinner)));
		}

		const synthesis = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis);
		const synthesize = this.renderStore.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: localize('sessionComparisonResult.synthesizeAriaLabel', "Synthesize the best concepts from all attempts"),
		}));
		synthesize.label = synthesis
			? localize('sessionComparisonResult.synthesisStarted', "Synthesis Started")
			: localize('sessionComparisonResult.synthesize', "Synthesize Best Concepts");
		synthesize.enabled = !synthesis;
		if (!synthesis) {
			this.renderStore.add(synthesize.onDidClick(() => this.synthesize(comparison, synthesize)));
		}

		if (this.announcedComparisonId !== comparison.id) {
			this.announcedComparisonId = comparison.id;
			status(localize('sessionComparisonResult.ready', "{0} won. Comparison result ready.", winnerLabel));
		}
		if (wasHidden) {
			this.onDidChangeLayout();
		}
	}

	private async focusWinner(comparison: ISessionComparison, winner: ISessionComparisonParticipant, button: Button): Promise<void> {
		if (!winner.sessionResource) {
			return;
		}
		button.enabled = false;
		try {
			this.comparisonService.selectAttempt(comparison.id, winner.id);
			await this.sessionsService.openSession(winner.sessionResource, { source: 'chat' });
		} catch (error) {
			this.notificationService.error(error);
			button.enabled = true;
		}
	}

	private async synthesize(comparison: ISessionComparison, button: Button): Promise<void> {
		button.enabled = false;
		try {
			await this.comparisonService.synthesize(comparison.id);
		} catch (error) {
			this.notificationService.error(error);
			button.enabled = true;
		}
	}
}

function isJudgeSession(comparison: ISessionComparison, session: ISession): boolean {
	return comparison.participants.some(participant =>
		participant.role === SessionComparisonParticipantRole.Judge
		&& !!participant.sessionResource
		&& isEqual(participant.sessionResource, session.resource),
	);
}
