/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonResult.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IRenderedMarkdown, renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Action, toAction } from '../../../../base/common/actions.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IMarkdownRenderer } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptLabel, ISessionComparison, ISessionComparisonDecisionSection, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';

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
		private readonly markdownRenderer: IMarkdownRenderer,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
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
		const winnerLabel = getSessionComparisonAttemptLabel(winner, attempts.indexOf(winner) + 1);
		const title = dom.append(this.domNode, dom.$('h2.session-comparison-result-title'));
		title.id = this.titleId;
		const winnerTitle = localize('sessionComparisonResult.winner', "{0} won", winnerLabel);
		const winnerLabelOffset = winnerTitle.indexOf(winnerLabel);
		if (winner.sessionResource && winnerLabelOffset >= 0) {
			title.append(winnerTitle.slice(0, winnerLabelOffset));
			this.renderAttemptLink(title, comparison, winner, winnerLabel);
			title.append(winnerTitle.slice(winnerLabelOffset + winnerLabel.length));
		} else {
			title.textContent = winnerTitle;
		}
		dom.append(this.domNode, dom.$('h3.session-comparison-result-subtitle')).textContent =
			localize('sessionComparisonResult.whyWinner', "Why it won");
		this.renderRationale(comparison.verdict);

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
				const label = getSessionComparisonAttemptLabel(attempt, attempts.indexOf(attempt) + 1);
				const attemptHeader = dom.append(row, dom.$('th'));
				attemptHeader.setAttribute('scope', 'row');
				if (attempt.sessionResource) {
					this.renderAttemptLink(attemptHeader, comparison, attempt, label);
				} else {
					attemptHeader.textContent = label;
				}
				const strengthsCell = dom.append(row, dom.$('td'));
				if (strengths.length > 0) {
					this.renderMarkdown(strengthsCell, strengths.join('; '));
				} else {
					strengthsCell.textContent = localize('sessionComparisonResult.noStrengths', "No distinct strong points reported");
				}
			}
		}

		this.renderAttemptMetrics(attempts);

		const actions = dom.append(this.domNode, dom.$('.session-comparison-result-actions'));
		actions.setAttribute('role', 'group');
		actions.setAttribute('aria-label', localize('sessionComparisonResult.actionsAriaLabel', "Comparison result actions"));
		if (winner.sessionResource) {
			const focusableOtherAttempts = otherAttempts.filter(attempt => !!attempt.sessionResource);
			let focusWinner: IButton;
			if (focusableOtherAttempts.length > 0) {
				const focusOtherActions = focusableOtherAttempts.map(attempt => toAction({
					id: `sessionComparisonResult.focusAttempt.${attempt.id}`,
					label: localize('sessionComparisonResult.focusAttempt', "Focus {0}", getSessionComparisonAttemptLabel(attempt, attempts.indexOf(attempt) + 1)),
					run: () => this.focusAttempt(comparison, attempt),
				}));
				const focusDropdown = this.renderStore.add(new ButtonWithDropdown(actions, {
					...defaultButtonStyles,
					secondary: true,
					ariaLabel: localize('sessionComparisonResult.focusWinnerAriaLabel', "Focus winning session, {0}", winnerLabel),
					contextMenuProvider: this.contextMenuService,
					actions: focusOtherActions,
					addPrimaryActionToDropdown: false,
				}));
				const focusOtherLabel = localize('sessionComparisonResult.focusOtherAttempts', "Focus another attempt");
				focusDropdown.dropdownButton.setAriaLabel(focusOtherLabel);
				focusDropdown.dropdownButton.setTitle(focusOtherLabel);
				focusWinner = focusDropdown;
			} else {
				focusWinner = this.renderStore.add(new Button(actions, {
					...defaultButtonStyles,
					secondary: true,
					ariaLabel: localize('sessionComparisonResult.focusWinnerAriaLabel', "Focus winning session, {0}", winnerLabel),
				}));
			}
			focusWinner.label = localize('sessionComparisonResult.focusWinner', "Focus Winning Session");
			this.renderStore.add(focusWinner.onDidClick(() => this.focusAttempt(comparison, winner, focusWinner)));
		}

		const decisionCount = comparison.verdict.decisionSections?.length ?? 0;
		const synthesis = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis);
		if (synthesis) {
			const synthesize = this.renderStore.add(new Button(actions, {
				...defaultButtonStyles,
				ariaLabel: localize('sessionComparisonResult.synthesisStartedAriaLabel', "Synthesis has started"),
			}));
			synthesize.label = localize('sessionComparisonResult.synthesisStarted', "Synthesis Started");
			synthesize.enabled = false;
		} else if (decisionCount !== 1) {
			const instructions = this.renderSynthesisInstructions(comparison);
			const customizeInstructions = this.renderStore.add(new Action(
				'sessionComparison.additionalSynthesisInstructions',
				localize('sessionComparisonResult.additionalInstructionsAction', "Additional Synthesis Instructions..."),
				undefined,
				true,
				() => instructions.toggle(),
			));
			const synthesize = this.renderStore.add(new ButtonWithDropdown(actions, {
				...defaultButtonStyles,
				ariaLabel: localize('sessionComparisonResult.synthesizeAriaLabel', "Synthesize using the Judge recommendation"),
				contextMenuProvider: this.contextMenuService,
				actions: [customizeInstructions],
				addPrimaryActionToDropdown: false,
				dropdownLayer: 1,
			}));
			synthesize.label = localize('sessionComparisonResult.synthesize', "Synthesize Recommended");
			synthesize.dropdownButton.setAriaLabel(localize('sessionComparisonResult.synthesisOptionsAriaLabel', "More synthesis options"));
			this.renderStore.add(synthesize.onDidClick(() => this.synthesize(comparison, synthesize, createRecommendedSynthesisPlan(instructions.getValue()))));
			if (decisionCount > 1) {
				this.renderSynthesisPlan(comparison, attempts, actions, instructions.getValue);
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

	private renderAttemptMetrics(attempts: readonly ISessionComparisonParticipant[]): void {
		const details = dom.append(this.domNode, dom.$('details.session-comparison-result-metrics'));
		const summary = dom.append(details, dom.$('summary.session-comparison-result-metrics-summary'));
		summary.id = `session-comparison-metrics-${generateUuid()}`;
		summary.textContent = localize('sessionComparisonResult.attemptMetrics', "Attempt time and token usage");
		this.renderStore.add(dom.addDisposableListener(details, 'toggle', () => this.onDidChangeLayout()));

		const description = dom.append(details, dom.$('p.session-comparison-result-metrics-description'));
		description.textContent = localize('sessionComparisonResult.attemptMetricsDescription', "Time is the provider-reported duration of the terminal first turn. Total tokens are provider-reported input plus output tokens.");

		const scrollContainer = dom.append(details, dom.$('.session-comparison-result-metrics-scroll'));
		const table = dom.append(scrollContainer, dom.$('table.session-comparison-result-metrics-table'));
		table.setAttribute('aria-labelledby', summary.id);
		const head = dom.append(table, dom.$('thead'));
		const headerRow = dom.append(head, dom.$('tr'));
		for (const label of [
			localize('sessionComparisonResult.attempt', "Attempt"),
			localize('sessionComparisonResult.totalTime', "Total time"),
			localize('sessionComparisonResult.totalTokens', "Total tokens"),
		]) {
			const header = dom.append(headerRow, dom.$('th'));
			header.setAttribute('scope', 'col');
			header.textContent = label;
		}

		const body = dom.append(table, dom.$('tbody'));
		for (const attempt of attempts) {
			const row = dom.append(body, dom.$('tr'));
			const attemptHeader = dom.append(row, dom.$('th'));
			attemptHeader.setAttribute('scope', 'row');
			attemptHeader.textContent = getSessionComparisonAttemptLabel(attempt, attempts.indexOf(attempt) + 1);
			dom.append(row, dom.$('td')).textContent = attempt.completion?.elapsedMs === undefined
				? localize('sessionComparisonResult.unavailable', "Unavailable")
				: formatElapsedTime(attempt.completion.elapsedMs);
			dom.append(row, dom.$('td')).textContent = attempt.completion?.tokenCount === undefined
				? localize('sessionComparisonResult.unavailable', "Unavailable")
				: attempt.completion.tokenCount.toLocaleString();
		}
	}

	private renderRationale(verdict: ISessionComparisonVerdict): void {
		if (!verdict.rationale) {
			this.renderMarkdown(dom.append(this.domNode, dom.$('.session-comparison-result-explanation')), verdict.explanation);
			return;
		}
		const entries = [
			{ label: localize('sessionComparisonResult.rationale.comparison', "Comparison"), point: verdict.rationale.comparison },
			{ label: localize('sessionComparisonResult.rationale.validation', "Validation"), point: verdict.rationale.validation },
			{ label: localize('sessionComparisonResult.rationale.codeQuality', "Code quality"), point: verdict.rationale.codeQuality },
			{ label: localize('sessionComparisonResult.rationale.solution', "Solution"), point: verdict.rationale.solution },
		];
		const list = dom.append(this.domNode, dom.$('dl.session-comparison-result-rationale'));
		for (const entry of entries) {
			dom.append(list, dom.$('dt.session-comparison-result-rationale-category')).textContent = entry.label;
			const value = dom.append(list, dom.$('dd'));
			const points = dom.append(value, dom.$('ul'));
			this.renderMarkdown(dom.append(points, dom.$('li.session-comparison-result-rationale-point')), entry.point);
		}
	}

	private renderMarkdown(container: HTMLElement, value: string): IRenderedMarkdown {
		container.classList.add('session-comparison-result-markdown');
		return this.renderStore.add(this.markdownRenderer.render(new MarkdownString(value), undefined, container));
	}

	private renderSynthesisInstructions(comparison: ISessionComparison): { readonly getValue: () => string | undefined; readonly toggle: () => void } {
		const panel = dom.append(this.domNode, dom.$('section.session-comparison-synthesis-instructions'));
		panel.hidden = true;
		panel.id = `session-comparison-synthesis-instructions-${generateUuid()}`;
		const title = dom.append(panel, dom.$('h3.session-comparison-result-subtitle'));
		title.id = `${panel.id}-title`;
		title.textContent = localize('sessionComparisonResult.additionalInstructions', "Additional synthesis instructions");
		panel.setAttribute('aria-labelledby', title.id);
		const description = dom.append(panel, dom.$('p.session-comparison-synthesis-instructions-description'));
		description.id = `${panel.id}-description`;
		description.textContent = localize('sessionComparisonResult.additionalInstructionsDescription', "Add requirements for recommended or custom synthesis, then use Start Synthesis with Instructions or press Ctrl+Enter (Cmd+Enter on macOS).");
		const inputContainer = dom.append(panel, dom.$('.session-comparison-synthesis-instructions-input'));
		const input = this.renderStore.add(new InputBox(inputContainer, undefined, {
			ariaLabel: localize('sessionComparisonResult.additionalInstructionsInputAriaLabel', "Additional synthesis instructions"),
			placeholder: localize('sessionComparisonResult.additionalInstructionsPlaceholder', "For example: preserve the public API and add focused tests"),
			flexibleHeight: true,
			flexibleMaxHeight: 160,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		input.inputElement.maxLength = SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH;
		input.inputElement.setAttribute('aria-describedby', description.id);
		input.value = comparison.synthesisPlan?.instructions ?? '';

		const getValue = (): string | undefined => normalizeSynthesisInstructions(input.value);
		const actions = dom.append(panel, dom.$('.session-comparison-synthesis-instructions-actions'));
		const start = this.renderStore.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: localize('sessionComparisonResult.startWithInstructionsAriaLabel', "Start recommended synthesis with the additional instructions"),
		}));
		start.label = localize('sessionComparisonResult.startWithInstructions', "Start Synthesis with Instructions");
		const updateStartEnabled = () => start.enabled = getValue() !== undefined;
		const startWithInstructions = () => {
			const plan = createRecommendedSynthesisPlan(getValue());
			if (plan) {
				void this.synthesize(comparison, start, plan);
			}
		};
		updateStartEnabled();
		this.renderStore.add(input.onDidChange(() => {
			const currentSelections = this.comparisonService.getComparison(comparison.id)?.synthesisPlan?.selections ?? [];
			this.comparisonService.setSynthesisPlan(comparison.id, createSynthesisPlanWithSelections(currentSelections, getValue()));
			updateStartEnabled();
		}));
		this.renderStore.add(input.onDidHeightChange(() => this.onDidChangeLayout()));
		this.renderStore.add(start.onDidClick(startWithInstructions));
		this.renderStore.add(dom.addDisposableListener(input.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (start.enabled && keyboardEvent.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
				dom.EventHelper.stop(event, true);
				startWithInstructions();
			}
		}));

		return {
			getValue,
			toggle: () => {
				panel.hidden = !panel.hidden;
				this.onDidChangeLayout();
				if (!panel.hidden) {
					input.focus();
				}
			},
		};
	}

	private renderSynthesisPlan(
		comparison: ISessionComparison,
		attempts: readonly ISessionComparisonParticipant[],
		actions: HTMLElement,
		getInstructions: () => string | undefined,
	): void {
		const decisionSections = comparison.verdict?.decisionSections ?? [];
		const attemptLabels = new Map(attempts.map((attempt, index) => [attempt.id, getSessionComparisonAttemptLabel(attempt, index + 1)]));
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

		let firstSelectedButton: HTMLElement | undefined;
		for (const section of decisionSections) {
			const storedParticipantId = storedSelections.has(section.id)
				? storedSelections.get(section.id)
				: section.recommendedParticipantId;
			selections.set(section.id, section.options.some(option => option.participantId === storedParticipantId) ? storedParticipantId : undefined);
			const selectedButton = this.renderDecisionRow(body, comparison, section, attempts, attemptLabels, decisionSections, selections, getInstructions);
			firstSelectedButton ??= selectedButton;
		}

		this.renderStore.add(custom.onDidClick(() => {
			panel.hidden = !panel.hidden;
			custom.element.setAttribute('aria-expanded', String(!panel.hidden));
			this.onDidChangeLayout();
			if (!panel.hidden) {
				firstSelectedButton?.focus();
			}
		}));

		const planActions = dom.append(panel, dom.$('.session-comparison-synthesis-plan-actions'));
		const start = this.renderStore.add(new Button(planActions, {
			...defaultButtonStyles,
			ariaLabel: localize('sessionComparisonResult.startCustomSynthesisAriaLabel', "Start custom synthesis with the selected approaches"),
		}));
		start.label = localize('sessionComparisonResult.startCustomSynthesis', "Start Custom Synthesis");
		this.renderStore.add(start.onDidClick(() => this.synthesize(comparison, start, createSynthesisPlan(decisionSections, selections, getInstructions()))));
	}

	private renderDecisionRow(
		table: HTMLElement,
		comparison: ISessionComparison,
		section: ISessionComparisonDecisionSection,
		attempts: readonly ISessionComparisonParticipant[],
		attemptLabels: ReadonlyMap<string, string>,
		decisionSections: readonly ISessionComparisonDecisionSection[],
		selections: Map<string, string | undefined>,
		getInstructions: () => string | undefined,
	): HTMLElement | undefined {
		const row = dom.append(table, dom.$('tr'));
		const decision = dom.append(row, dom.$('th.session-comparison-synthesis-decision'));
		decision.setAttribute('scope', 'row');
		const sectionTitle = renderAsPlaintext(new MarkdownString(section.title), { omitMarkdownSyntax: true });
		this.renderMarkdown(dom.append(decision, dom.$('.session-comparison-synthesis-decision-title')), section.title);
		this.renderMarkdown(dom.append(decision, dom.$('.session-comparison-synthesis-decision-description')), section.description);
		if (section.affectedFiles.length) {
			dom.append(decision, dom.$('.session-comparison-synthesis-decision-files')).textContent = section.affectedFiles.length === 1
				? localize('sessionComparisonResult.oneAffectedFile', "1 file affected")
				: localize('sessionComparisonResult.affectedFileCount', "{0} files affected", section.affectedFiles.length);
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
			this.comparisonService.setSynthesisPlan(comparison.id, createSynthesisPlan(decisionSections, selections, getInstructions()));
		};

		for (const attempt of attempts) {
			const option = section.options.find(candidate => candidate.participantId === attempt.id);
			const cell = dom.append(row, dom.$('td'));
			if (!option) {
				dom.append(cell, dom.$('.session-comparison-synthesis-unavailable')).textContent =
					localize('sessionComparisonResult.noDistinctApproach', "No distinct approach");
				continue;
			}
			this.renderMarkdown(dom.append(cell, dom.$('.session-comparison-synthesis-approach')), option.approach);
			const assessment = option.assessment ?? SessionComparisonDecisionAssessment.Neutral;
			const assessmentLabel = getAssessmentLabel(assessment);
			dom.append(cell, dom.$(`.session-comparison-synthesis-assessment.${assessment}`)).textContent = assessmentLabel;
			const attemptLabel = attemptLabels.get(attempt.id) ?? attempt.id;
			const approach = renderAsPlaintext(new MarkdownString(option.approach), { omitMarkdownSyntax: true });
			const ariaLabel = (selected: boolean): string => localize(
				'sessionComparisonResult.selectAttemptApproachAriaLabel',
				"{0} for {1}. {2}. {3} {4}",
				attemptLabel,
				sectionTitle,
				assessmentLabel,
				approach,
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
			sectionTitle,
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
		return choiceButtons.find(choice => choice.participantId === selections.get(section.id))?.button.element;
	}

	private renderAttemptLink(container: HTMLElement, comparison: ISessionComparison, attempt: ISessionComparisonParticipant, label: string): void {
		const link = dom.append(container, dom.$('a.session-comparison-result-attempt-link'));
		link.setAttribute('href', '#');
		link.textContent = label;
		this.renderStore.add(dom.addDisposableListener(link, dom.EventType.CLICK, event => {
			event.preventDefault();
			void this.focusAttempt(comparison, attempt);
		}));
	}

	private async focusAttempt(comparison: ISessionComparison, attempt: ISessionComparisonParticipant, button?: IButton): Promise<void> {
		if (!attempt.sessionResource) {
			return;
		}
		if (button) {
			button.enabled = false;
		}
		try {
			this.comparisonService.selectAttempt(comparison.id, attempt.id);
			await this.sessionsService.openSession(attempt.sessionResource, { source: 'chat' });
		} catch (error) {
			this.notificationService.error(error);
			if (button) {
				button.enabled = true;
			}
		}
	}

	private async synthesize(comparison: ISessionComparison, button: IButton, plan: ISessionComparisonSynthesisPlan | undefined): Promise<void> {
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

function formatElapsedTime(elapsedMs: number): string {
	const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
	if (totalSeconds < 60) {
		return localize('sessionComparisonResult.seconds', "{0}s", totalSeconds);
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return seconds === 0
		? localize('sessionComparisonResult.minutes', "{0}m", minutes)
		: localize('sessionComparisonResult.minutesSeconds', "{0}m {1}s", minutes, seconds);
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
	instructions?: string,
): ISessionComparisonSynthesisPlan {
	return {
		selections: (sections ?? []).map(section => ({
			sectionId: section.id,
			participantId: selections.get(section.id),
		})),
		...(instructions ? { instructions } : {}),
	};
}

function createRecommendedSynthesisPlan(instructions: string | undefined): ISessionComparisonSynthesisPlan | undefined {
	return instructions ? { selections: [], instructions } : undefined;
}

function createSynthesisPlanWithSelections(
	selections: readonly ISessionComparisonSynthesisPlan['selections'][number][],
	instructions: string | undefined,
): ISessionComparisonSynthesisPlan | undefined {
	return selections.length > 0 || instructions
		? { selections, ...(instructions ? { instructions } : {}) }
		: undefined;
}

function normalizeSynthesisInstructions(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isJudgeSession(comparison: ISessionComparison, session: ISession): boolean {
	return comparison.participants.some(participant =>
		participant.role === SessionComparisonParticipantRole.Judge
		&& !!participant.sessionResource
		&& isEqual(participant.sessionResource, session.resource),
	);
}
