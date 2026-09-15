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
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonDecisionSection, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';

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
			if (comparison.verdict.decisionSections?.length) {
				this.renderSynthesisPlan(comparison, attempts, actions);
			}
		}

		if (this.announcedComparisonId !== comparison.id) {
			this.announcedComparisonId = comparison.id;
			status(localize('sessionComparisonResult.ready', "{0} won. Comparison result ready.", winnerLabel));
		}
		if (wasHidden) {
			this.onDidChangeLayout();
		}
	}

	private renderSynthesisPlan(comparison: ISessionComparison, attempts: readonly ISessionComparisonParticipant[], actions: HTMLElement): void {
		const decisionSections = comparison.verdict?.decisionSections ?? [];
		const attemptLabels = new Map(attempts.map(attempt => [attempt.id, getSessionComparisonHarnessLabel(attempt)]));
		const storedSelections = new Map(comparison.synthesisPlan?.selections.map(selection => [selection.sectionId, selection.participantId]));
		const selections = new Map<string, string | undefined>();

		const custom = this.renderStore.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('sessionComparisonResult.customSynthesisAriaLabel', "Customize synthesis decisions"),
		}));
		custom.label = localize('sessionComparisonResult.customSynthesis', "Custom Synthesis");
		custom.element.setAttribute('aria-expanded', 'false');

		const panel = dom.append(this.domNode, dom.$('section.session-comparison-synthesis-plan'));
		panel.hidden = true;
		panel.id = `session-comparison-synthesis-plan-${generateUuid()}`;
		custom.element.setAttribute('aria-controls', panel.id);
		const title = dom.append(panel, dom.$('h3.session-comparison-result-subtitle'));
		title.id = `${panel.id}-title`;
		title.textContent = localize('sessionComparisonResult.customSynthesis', "Custom Synthesis");
		panel.setAttribute('aria-labelledby', title.id);
		dom.append(panel, dom.$('p.session-comparison-synthesis-plan-description')).textContent =
			localize('sessionComparisonResult.customizeSynthesisDescription', "Choose which attempt's approach the synthesis agent should follow for each implementation decision. The agent will reconcile dependencies and validate the combined result in a new worktree.");

		this.renderStore.add(custom.onDidClick(() => {
			panel.hidden = !panel.hidden;
			custom.element.setAttribute('aria-expanded', String(!panel.hidden));
			this.onDidChangeLayout();
			if (!panel.hidden) {
				panel.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
			}
		}));

		const scroller = dom.append(panel, dom.$('.session-comparison-synthesis-table-scroll'));
		const table = dom.append(scroller, dom.$('table.session-comparison-synthesis-table'));
		const head = dom.append(table, dom.$('thead'));
		const headerRow = dom.append(head, dom.$('tr'));
		const decisionHeader = dom.append(headerRow, dom.$('th'));
		decisionHeader.setAttribute('scope', 'col');
		decisionHeader.textContent = localize('sessionComparisonResult.decision', "Decision");
		for (const attempt of attempts) {
			const attemptHeader = dom.append(headerRow, dom.$('th'));
			attemptHeader.setAttribute('scope', 'col');
			attemptHeader.textContent = attemptLabels.get(attempt.id) ?? attempt.id;
		}
		const synthesizerHeader = dom.append(headerRow, dom.$('th'));
		synthesizerHeader.setAttribute('scope', 'col');
		synthesizerHeader.textContent = localize('sessionComparisonResult.synthesizer', "Synthesizer");
		const body = dom.append(table, dom.$('tbody'));

		for (const section of decisionSections) {
			const storedParticipantId = storedSelections.has(section.id)
				? storedSelections.get(section.id)
				: section.recommendedParticipantId;
			selections.set(section.id, section.options.some(option => option.participantId === storedParticipantId) ? storedParticipantId : undefined);
			this.renderDecisionRow(body, comparison, section, attempts, attemptLabels, decisionSections, selections);
		}

		const planActions = dom.append(panel, dom.$('.session-comparison-synthesis-plan-actions'));
		const start = this.renderStore.add(new Button(planActions, {
			...defaultButtonStyles,
			ariaLabel: localize('sessionComparisonResult.startCustomSynthesisAriaLabel', "Start custom synthesis with the selected approaches"),
		}));
		start.label = localize('sessionComparisonResult.startCustomSynthesis', "Start Custom Synthesis");
		this.renderStore.add(start.onDidClick(() => this.synthesize(comparison, start, createSynthesisPlan(decisionSections, selections))));
	}

	private renderDecisionRow(
		table: HTMLElement,
		comparison: ISessionComparison,
		section: ISessionComparisonDecisionSection,
		attempts: readonly ISessionComparisonParticipant[],
		attemptLabels: ReadonlyMap<string, string>,
		decisionSections: readonly ISessionComparisonDecisionSection[],
		selections: Map<string, string | undefined>,
	): void {
		const row = dom.append(table, dom.$('tr'));
		const decision = dom.append(row, dom.$('th.session-comparison-synthesis-decision'));
		decision.setAttribute('scope', 'row');
		dom.append(decision, dom.$('.session-comparison-synthesis-decision-title')).textContent = section.title;
		dom.append(decision, dom.$('.session-comparison-synthesis-decision-description')).textContent = section.description;
		if (section.affectedFiles.length) {
			dom.append(decision, dom.$('.session-comparison-synthesis-decision-files')).textContent = section.affectedFiles.join(', ');
		}

		const choiceButtons: { button: Button; participantId: string | undefined; ariaLabel: (selected: boolean) => string }[] = [];
		const updateChoiceState = (participantId: string | undefined): void => {
			for (const choice of choiceButtons) {
				const selected = choice.participantId === participantId;
				choice.button.element.classList.toggle('selected', selected);
				choice.button.element.setAttribute('aria-pressed', String(selected));
				choice.button.element.setAttribute('aria-label', choice.ariaLabel(selected));
			}
		};
		const select = (participantId: string | undefined): void => {
			selections.set(section.id, participantId);
			updateChoiceState(participantId);
			this.comparisonService.setSynthesisPlan(comparison.id, createSynthesisPlan(decisionSections, selections));
		};

		for (const attempt of attempts) {
			const option = section.options.find(candidate => candidate.participantId === attempt.id);
			const cell = dom.append(row, dom.$('td'));
			if (!option) {
				dom.append(cell, dom.$('.session-comparison-synthesis-unavailable')).textContent =
					localize('sessionComparisonResult.noDistinctApproach', "No distinct approach");
				continue;
			}
			dom.append(cell, dom.$('.session-comparison-synthesis-approach')).textContent = option.approach;
			const assessment = option.assessment ?? SessionComparisonDecisionAssessment.Neutral;
			const assessmentLabel = getAssessmentLabel(assessment);
			dom.append(cell, dom.$(`.session-comparison-synthesis-assessment.${assessment}`)).textContent = assessmentLabel;
			const attemptLabel = attemptLabels.get(attempt.id) ?? attempt.id;
			const ariaLabel = (selected: boolean): string => localize(
				'sessionComparisonResult.selectAttemptApproachAriaLabel',
				"{0} for {1}. {2}. {3} {4}",
				attemptLabel,
				section.title,
				assessmentLabel,
				option.approach,
				selected ? localize('sessionComparisonResult.selected', "Selected") : localize('sessionComparisonResult.notSelected', "Not selected"),
			);
			const button = this.renderStore.add(new Button(cell, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: ariaLabel(selections.get(section.id) === attempt.id),
			}));
			button.label = localize('sessionComparisonResult.useAttempt', "Use {0}", attemptLabel);
			choiceButtons.push({ button, participantId: attempt.id, ariaLabel });
			this.renderStore.add(button.onDidClick(() => select(attempt.id)));
		}

		const synthesizerCell = dom.append(row, dom.$('td'));
		dom.append(synthesizerCell, dom.$('.session-comparison-synthesis-approach')).textContent =
			localize('sessionComparisonResult.synthesizerDecidesDescription', "Reconcile the available approaches.");
		const synthesizerAriaLabel = (selected: boolean): string => localize(
			'sessionComparisonResult.synthesizerDecidesAriaLabel',
			"Let the Synthesizer decide for {0}. {1}",
			section.title,
			selected ? localize('sessionComparisonResult.selected', "Selected") : localize('sessionComparisonResult.notSelected', "Not selected"),
		);
		const synthesizerButton = this.renderStore.add(new Button(synthesizerCell, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: synthesizerAriaLabel(selections.get(section.id) === undefined),
		}));
		synthesizerButton.label = localize('sessionComparisonResult.synthesizerDecides', "Synthesizer Decides");
		choiceButtons.push({ button: synthesizerButton, participantId: undefined, ariaLabel: synthesizerAriaLabel });
		this.renderStore.add(synthesizerButton.onDidClick(() => select(undefined)));
		updateChoiceState(selections.get(section.id));
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

function getAssessmentLabel(assessment: SessionComparisonDecisionAssessment): string {
	switch (assessment) {
		case SessionComparisonDecisionAssessment.Better:
			return localize('sessionComparisonResult.betterChoice', "Better choice");
		case SessionComparisonDecisionAssessment.Neutral:
			return localize('sessionComparisonResult.neutralChoice', "Neutral choice");
		case SessionComparisonDecisionAssessment.Worse:
			return localize('sessionComparisonResult.worseChoice', "Worse choice");
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
