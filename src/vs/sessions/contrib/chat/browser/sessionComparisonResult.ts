/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonResult.css';
import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';

export class SessionComparisonResult extends Disposable {

	readonly domNode = dom.$('.session-comparison-result');
	private readonly renderStore = this._register(new DisposableStore());
	private readonly titleId = `session-comparison-result-title-${generateUuid()}`;
	private announcedComparisonId: string | undefined;
	private renderedComparisonId: string | undefined;
	private renderedVerdict: ISessionComparison['verdict'];
	private renderedParticipants: ISessionComparison['participants'] | undefined;

	constructor(
		currentSession: IObservable<ISession | undefined>,
		private readonly onDidChangeLayout: () => void,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super();
		this.domNode.hidden = true;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-labelledby', this.titleId);

		this._register(autorun(reader => {
			const session = currentSession.read(reader);
			const comparison = session
				? this.comparisonService.comparisons.read(reader).find(candidate => isJudgeSession(candidate, session))
				: undefined;
			if (comparison?.id === this.renderedComparisonId
				&& comparison?.verdict === this.renderedVerdict
				&& comparison?.participants === this.renderedParticipants) {
				return;
			}
			this.render(comparison?.verdict ? comparison : undefined);
		}));
	}

	private render(comparison: ISessionComparison | undefined): void {
		this.renderedComparisonId = comparison?.id;
		this.renderedVerdict = comparison?.verdict;
		this.renderedParticipants = comparison?.participants;
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
		const winnerLabel = getSessionComparisonHarnessLabel(winner);
		const title = dom.append(this.domNode, dom.$('h2.session-comparison-result-title'));
		title.id = this.titleId;
		title.textContent =
			localize('sessionComparisonResult.winner', "{0} won", winnerLabel);
		dom.append(this.domNode, dom.$('h3.session-comparison-result-subtitle')).textContent =
			localize('sessionComparisonResult.whyWinner', "Why it won");
		dom.append(this.domNode, dom.$('p.session-comparison-result-explanation')).textContent = comparison.verdict.explanation;

		const otherAttempts = attempts.filter(attempt => attempt.id !== winner.id);
		if (otherAttempts.length > 0) {
			const strengthsTitle = dom.append(this.domNode, dom.$('h3.session-comparison-result-subtitle'));
			strengthsTitle.id = `session-comparison-strengths-${generateUuid()}`;
			strengthsTitle.textContent =
				localize('sessionComparisonResult.otherStrengths', "Strong points from other attempts");
			const table = dom.append(this.domNode, dom.$('table.session-comparison-result-strengths'));
			table.setAttribute('aria-labelledby', strengthsTitle.id);
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
				const label = getSessionComparisonHarnessLabel(attempt);
				const attemptHeader = dom.append(row, dom.$('th'));
				attemptHeader.setAttribute('scope', 'row');
				attemptHeader.textContent = label;
				dom.append(row, dom.$('td')).textContent = strengths.length > 0
					? strengths.join('; ')
					: localize('sessionComparisonResult.noStrengths', "No distinct strong points reported");
			}
		}

		const actions = dom.append(this.domNode, dom.$('.session-comparison-result-actions'));
		actions.setAttribute('role', 'group');
		actions.setAttribute('aria-label', localize('sessionComparisonResult.actionsAriaLabel', "Comparison result actions"));
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
		if (!synthesis && comparison.verdict.decisionSections?.length) {
			this.renderSynthesisPlan(comparison, attempts);
		}
		const synthesize = this.renderStore.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: synthesis
				? localize('sessionComparisonResult.synthesisStartedAriaLabel', "Synthesis has started")
				: localize('sessionComparisonResult.synthesizeAriaLabel', "Synthesize using the Judge recommendation"),
		}));
		synthesize.label = synthesis
			? localize('sessionComparisonResult.synthesisStarted', "Synthesis Started")
			: localize('sessionComparisonResult.synthesize', "Synthesize Recommended");
		synthesize.enabled = !synthesis;
		if (!synthesis) {
			this.renderStore.add(synthesize.onDidClick(() => this.synthesize(comparison, synthesize, undefined)));
		}

		if (this.announcedComparisonId !== comparison.id) {
			this.announcedComparisonId = comparison.id;
			status(localize('sessionComparisonResult.ready', "{0} won. Comparison result ready.", winnerLabel));
		}
		if (wasHidden) {
			this.onDidChangeLayout();
		}
	}

	private renderSynthesisPlan(comparison: ISessionComparison, attempts: readonly ISessionComparisonParticipant[]): void {
		const decisionSections = comparison.verdict?.decisionSections ?? [];
		const attemptLabels = new Map(attempts.map(attempt => [attempt.id, getSessionComparisonHarnessLabel(attempt)]));
		const storedSelections = new Map(comparison.synthesisPlan?.selections.map(selection => [selection.sectionId, selection.participantId]));
		const selections = new Map<string, string | undefined>();
		const details = dom.append(this.domNode, dom.$('details.session-comparison-synthesis-plan'));
		const summary = dom.append(details, dom.$('summary.session-comparison-synthesis-plan-summary'));
		summary.textContent = localize('sessionComparisonResult.customizeSynthesis', "Customize Synthesis");
		this.renderStore.add(dom.addDisposableListener(details, 'toggle', this.onDidChangeLayout));
		dom.append(details, dom.$('p.session-comparison-synthesis-plan-description')).textContent =
			localize('sessionComparisonResult.customizeSynthesisDescription', "Choose which attempt's approach the synthesis agent should follow for each implementation decision. The agent will reconcile dependencies and validate the combined result in a new worktree.");

		for (const section of decisionSections) {
			const card = dom.append(details, dom.$('section.session-comparison-synthesis-section'));
			dom.append(card, dom.$('h4.session-comparison-synthesis-section-title')).textContent = section.title;
			dom.append(card, dom.$('p.session-comparison-synthesis-section-description')).textContent = section.description;
			const selectContainer = dom.append(card, dom.$('.session-comparison-synthesis-section-select'));
			const options = [
				{ text: localize('sessionComparisonResult.synthesizerDecides', "Let Synthesizer Decide") },
				...section.options.map(option => ({
					text: attemptLabels.get(option.participantId) ?? option.participantId,
					detail: option.approach,
					decoratorRight: option.participantId === section.recommendedParticipantId
						? localize('sessionComparisonResult.recommended', "Recommended")
						: undefined,
				})),
			];
			const storedParticipantId = storedSelections.has(section.id)
				? storedSelections.get(section.id)
				: section.recommendedParticipantId;
			const selectedIndex = Math.max(0, section.options.findIndex(option => option.participantId === storedParticipantId) + 1);
			selections.set(section.id, selectedIndex === 0 ? undefined : section.options[selectedIndex - 1].participantId);
			const select = this.renderStore.add(new SelectBox(options, selectedIndex, this.contextViewService, defaultSelectBoxStyles, {
				ariaLabel: localize('sessionComparisonResult.sectionSelection', "Approach for {0}", section.title),
				useCustomDrawn: true,
				contextViewLayer: 1,
			}));
			select.render(selectContainer);
			this.renderStore.add(select.onDidSelect(({ index }) => {
				selections.set(section.id, index === 0 ? undefined : section.options[index - 1].participantId);
				this.comparisonService.setSynthesisPlan(comparison.id, createSynthesisPlan(decisionSections, selections));
			}));
		}

		const actions = dom.append(details, dom.$('.session-comparison-synthesis-plan-actions'));
		const start = this.renderStore.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: localize('sessionComparisonResult.startPlannedSynthesisAriaLabel', "Start synthesis with the selected approaches"),
		}));
		start.label = localize('sessionComparisonResult.startPlannedSynthesis', "Start Planned Synthesis");
		this.renderStore.add(start.onDidClick(() => this.synthesize(comparison, start, createSynthesisPlan(decisionSections, selections))));
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

	private async synthesize(comparison: ISessionComparison, button: Button, plan: ISessionComparisonSynthesisPlan | undefined): Promise<void> {
		button.enabled = false;
		try {
			this.comparisonService.setSynthesisPlan(comparison.id, plan);
			await this.comparisonService.synthesize(comparison.id);
		} catch (error) {
			this.notificationService.error(error);
			button.enabled = true;
		}
	}

}

function createSynthesisPlan(
	sections: NonNullable<ISessionComparison['verdict']>['decisionSections'],
	selections: ReadonlyMap<string, string | undefined>,
): ISessionComparisonSynthesisPlan {
	return {
		selections: (sections ?? []).map(section => ({
			sectionId: section.id,
			participantId: selections.get(section.id),
		})),
	};
}

function isJudgeSession(comparison: ISessionComparison, session: ISession): boolean {
	return comparison.participants.some(participant =>
		participant.role === SessionComparisonParticipantRole.Judge
		&& !!participant.sessionResource
		&& isEqual(participant.sessionResource, session.resource),
	);
}
