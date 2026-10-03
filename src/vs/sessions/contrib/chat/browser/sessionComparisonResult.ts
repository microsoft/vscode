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
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Action, toAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { safeIntl } from '../../../../base/common/date.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { language } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../../common/layoutConstants.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptLabel, getSessionComparisonHarnessConfigurationLabel, ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonParticipant, ISessionComparisonRationale, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';

export const SessionComparisonResultFocused = new RawContextKey<boolean>('sessionComparisonResultFocused', false);

type ValidationKey = keyof ISessionComparisonAttemptVerdict['validation'];

interface IScorecardContext {
	readonly comparison: ISessionComparison;
	readonly verdict: ISessionComparisonVerdict;
	readonly attempts: readonly ISessionComparisonParticipant[];
	readonly maxElapsedMs: number;
	readonly maxTokenCount: number;
	/** Whether attempts ran in more than one agent, so each row also names its agent. */
	readonly showAgent: boolean;
	/** Set when every attempt shares the same non-pass/fail check state, so repeating it row by row would add nothing. */
	readonly uniformValidationNote: string | undefined;
}

interface IScorecardRow {
	readonly attempt: ISessionComparisonParticipant;
	readonly element: HTMLElement;
	readonly toggle: HTMLButtonElement;
	readonly detail: HTMLElement;
}

/**
 * The Judge's verdict, docked above the Judge chat input as a scorecard: the winner with the
 * Judge's explanation and the next actions, then every attempt with its validation checks,
 * time, and tokens, recommended first. A row expands to the Judge's reasoning for that attempt.
 */
export class SessionComparisonResult extends Disposable {

	readonly domNode = dom.$('.session-comparison-result');
	private readonly renderStore = this._register(new DisposableStore());
	private readonly titleId = `session-comparison-result-title-${generateUuid()}`;
	private announcedComparisonId: string | undefined;
	private renderedComparisonId: string | undefined;
	private renderedVerdict: ISessionComparison['verdict'];
	private renderedParticipants: ISessionComparison['participants'] | undefined;
	private winnerTitle: string | undefined;
	private expandedAttemptId: string | undefined;

	constructor(
		currentSession: IObservable<ISession | undefined>,
		private readonly onDidChangeLayout: () => void,
		private readonly markdownRenderer: IMarkdownRenderer,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.domNode.hidden = true;
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-labelledby', this.titleId);
		const focusContext = SessionComparisonResultFocused.bindTo(contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => focusContext.reset()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.SessionsChat)) {
				this.updateAriaLabel();
			}
		}));

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

	layout(availableWidth: number): void {
		const centeredContentWidth = Math.min(availableWidth, AGENTS_CENTERED_CONTENT_MAX_WIDTH);
		this.domNode.style.width = `calc(${availableWidth}px - var(--session-view-content-horizontal-padding, var(--vscode-spacing-size320)) - var(--session-view-content-horizontal-padding, var(--vscode-spacing-size320)))`;
		this.domNode.style.marginLeft = `${(centeredContentWidth - availableWidth) / 2}px`;
		this.domNode.style.marginRight = '0';
	}

	private render(comparison: ISessionComparison | undefined): void {
		if (comparison?.id !== this.renderedComparisonId) {
			this.expandedAttemptId = undefined;
		}
		this.renderedComparisonId = comparison?.id;
		this.renderedVerdict = comparison?.verdict;
		this.renderedParticipants = comparison?.participants;
		this.renderStore.clear();
		dom.clearNode(this.domNode);
		this.winnerTitle = undefined;
		const wasHidden = this.domNode.hidden;
		const verdict = comparison?.verdict;
		const attempts = comparison?.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt) ?? [];
		const winner = verdict && attempts.find(participant => participant.id === verdict.recommendedParticipantId);
		this.domNode.hidden = !comparison || !verdict || !winner;
		if (!comparison || !verdict || !winner) {
			this.updateAriaLabel();
			if (!wasHidden) {
				this.onDidChangeLayout();
			}
			return;
		}

		const winnerNumber = attempts.indexOf(winner) + 1;
		const winnerLabel = getSessionComparisonAttemptLabel(winner, winnerNumber);
		this.winnerTitle = localize('sessionComparisonResult.winner', "{0} won", winnerLabel);
		this.updateAriaLabel();
		this.renderHeader(comparison, verdict, attempts, winner, winnerNumber);
		this.renderScorecard({
			comparison,
			verdict,
			attempts,
			maxElapsedMs: Math.max(0, ...attempts.map(attempt => attempt.completion?.elapsedMs ?? 0)),
			maxTokenCount: Math.max(0, ...attempts.map(attempt => attempt.completion?.tokenCount ?? 0)),
			showAgent: new Set(attempts.map(attempt => attempt.harness.label)).size > 1,
			uniformValidationNote: getUniformValidationNote(verdict),
		}, winner);

		if (this.announcedComparisonId !== comparison.id) {
			this.announcedComparisonId = comparison.id;
			status(localize('sessionComparisonResult.ready', "{0} won. Comparison result ready.", winnerLabel));
		}
		this.onDidChangeLayout();
	}

	private updateAriaLabel(): void {
		if (!this.winnerTitle) {
			this.domNode.removeAttribute('aria-label');
			this.domNode.setAttribute('aria-labelledby', this.titleId);
			return;
		}
		this.domNode.removeAttribute('aria-labelledby');
		const accessibleViewKeybinding = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsChat)
			? this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibleView)?.getAriaLabel()
			: undefined;
		this.domNode.setAttribute('aria-label', accessibleViewKeybinding
			? localize('sessionComparisonResult.ariaLabelWithAccessibleViewHint', "{0}. Use {1} to open the comparison result in the Accessible View.", this.winnerTitle, accessibleViewKeybinding)
			: this.winnerTitle);
	}

	private renderHeader(comparison: ISessionComparison, verdict: ISessionComparisonVerdict, attempts: readonly ISessionComparisonParticipant[], winner: ISessionComparisonParticipant, winnerNumber: number): void {
		const header = dom.append(this.domNode, dom.$('.session-comparison-result-header'));
		const heading = dom.append(header, dom.$('.session-comparison-result-heading'));
		const title = dom.append(heading, dom.$('h2.session-comparison-result-title'));
		title.id = this.titleId;
		const modelLabel = getAttemptModelLabel(winner);
		const titleText = localize('sessionComparisonResult.winnerModel', "{0} won", modelLabel);
		const text = dom.append(title, dom.$('span.session-comparison-result-title-text'));
		const modelOffset = titleText.indexOf(modelLabel);
		if (modelOffset >= 0) {
			text.append(titleText.slice(0, modelOffset));
			dom.append(text, dom.$('span.session-comparison-result-title-model')).textContent = modelLabel;
			text.append(titleText.slice(modelOffset + modelLabel.length));
		} else {
			text.textContent = titleText;
		}
		this.renderMarkdown(dom.append(heading, dom.$('.session-comparison-result-summary')), verdict.explanation);

		const actions = dom.append(header, dom.$('.session-comparison-result-actions'));
		actions.setAttribute('role', 'group');
		actions.setAttribute('aria-label', localize('sessionComparisonResult.actionsAriaLabel', "Comparison result actions"));
		this.renderOpenAction(actions, comparison, attempts, winner, winnerNumber);
		this.renderSynthesizeAction(actions, comparison);
	}

	private renderOpenAction(container: HTMLElement, comparison: ISessionComparison, attempts: readonly ISessionComparisonParticipant[], winner: ISessionComparisonParticipant, winnerNumber: number): void {
		if (!winner.sessionResource) {
			return;
		}
		const ariaLabel = localize('sessionComparisonResult.openWinnerAriaLabel', "Open the winning attempt, {0}", getSessionComparisonAttemptLabel(winner, winnerNumber));
		const otherAttempts = attempts.filter(attempt => attempt !== winner && !!attempt.sessionResource);
		let open: IButton;
		if (otherAttempts.length > 0) {
			const dropdown = this.renderStore.add(new ButtonWithDropdown(container, {
				...defaultButtonStyles,
				secondary: true,
				small: true,
				ariaLabel,
				contextMenuProvider: this.contextMenuService,
				actions: otherAttempts.map(attempt => toAction({
					id: `sessionComparisonResult.openAttempt.${attempt.id}`,
					label: localize('sessionComparisonResult.openAttempt', "Open {0}", getSessionComparisonAttemptLabel(attempt, attempts.indexOf(attempt) + 1)),
					run: () => this.focusAttempt(comparison, attempt),
				})),
				addPrimaryActionToDropdown: false,
			}));
			const openAnotherLabel = localize('sessionComparisonResult.openAnotherAttempt', "Open another attempt");
			dropdown.dropdownButton.setAriaLabel(openAnotherLabel);
			dropdown.dropdownButton.setTitle(openAnotherLabel);
			open = dropdown;
		} else {
			open = this.renderStore.add(new Button(container, { ...defaultButtonStyles, secondary: true, small: true, ariaLabel }));
		}
		open.label = localize('sessionComparisonResult.openWinner', "Open Attempt {0}", winnerNumber);
		this.renderStore.add(open.onDidClick(() => this.focusAttempt(comparison, winner, open)));
	}

	private renderSynthesizeAction(container: HTMLElement, comparison: ISessionComparison): void {
		if (comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Synthesis)) {
			const started = this.renderStore.add(new Button(container, {
				...defaultButtonStyles,
				small: true,
				ariaLabel: localize('sessionComparisonResult.synthesisStartedAriaLabel', "Synthesis has started"),
			}));
			started.label = localize('sessionComparisonResult.synthesisStarted', "Synthesis Started");
			started.enabled = false;
			return;
		}
		if (!comparison.synthesisHarness) {
			return;
		}
		const instructions = this.renderSynthesisInstructions(comparison);
		const customizeInstructions = this.renderStore.add(new Action(
			'sessionComparison.additionalSynthesisInstructions',
			localize('sessionComparisonResult.additionalInstructionsAction', "Additional Synthesis Instructions..."),
			undefined,
			true,
			() => instructions.toggle(),
		));
		const synthesize = this.renderStore.add(new ButtonWithDropdown(container, {
			...defaultButtonStyles,
			small: true,
			ariaLabel: localize('sessionComparisonResult.synthesizeAriaLabel', "Synthesize using the Judge recommendation"),
			contextMenuProvider: this.contextMenuService,
			actions: [customizeInstructions],
			addPrimaryActionToDropdown: false,
			dropdownLayer: 1,
		}));
		synthesize.label = localize('sessionComparisonResult.synthesize', "Synthesize");
		synthesize.dropdownButton.setAriaLabel(localize('sessionComparisonResult.synthesisOptionsAriaLabel', "More synthesis options"));
		this.renderStore.add(synthesize.onDidClick(() => this.synthesize(comparison, synthesize, createRecommendedSynthesisPlan(instructions.getValue()))));
	}

	private renderScorecard(context: IScorecardContext, winner: ISessionComparisonParticipant): void {
		const scorecard = dom.append(this.domNode, dom.$('.session-comparison-scorecard'));
		const columns = dom.append(scorecard, dom.$('.session-comparison-scorecard-columns'));
		columns.setAttribute('aria-hidden', 'true');
		dom.append(columns, dom.$('span'));
		for (const label of [
			localize('sessionComparisonResult.attempt', "Attempt"),
			localize('sessionComparisonResult.checks', "Checks"),
			localize('sessionComparisonResult.time', "Time"),
			localize('sessionComparisonResult.tokens', "Tokens"),
		]) {
			dom.append(columns, dom.$('span')).textContent = label;
		}
		if (context.uniformValidationNote) {
			dom.append(scorecard, dom.$('p.session-comparison-scorecard-checks-note')).textContent = context.uniformValidationNote;
		}

		const list = dom.append(scorecard, dom.$('ul.session-comparison-scorecard-rows'));
		list.setAttribute('aria-label', localize('sessionComparisonResult.attemptsAriaLabel', "Attempts, recommended first"));
		const rows = [winner, ...context.attempts.filter(attempt => attempt !== winner)].map(attempt => this.renderScorecardRow(list, context, attempt));
		const setExpanded = (attemptId: string | undefined) => {
			this.expandedAttemptId = attemptId;
			for (const row of rows) {
				const expanded = row.attempt.id === attemptId;
				row.element.classList.toggle('expanded', expanded);
				row.toggle.setAttribute('aria-expanded', String(expanded));
				row.detail.hidden = !expanded;
			}
		};
		for (const row of rows) {
			this.renderStore.add(dom.addDisposableListener(row.toggle, dom.EventType.CLICK, () => {
				setExpanded(this.expandedAttemptId === row.attempt.id ? undefined : row.attempt.id);
				this.onDidChangeLayout();
			}));
		}
		this.renderStore.add(dom.addDisposableListener(list, dom.EventType.KEY_DOWN, event => {
			const toggles = rows.map(row => row.toggle);
			const current = toggles.findIndex(toggle => toggle === dom.getActiveElement());
			if (current < 0) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			let next: number | undefined;
			if (keyboardEvent.equals(KeyCode.DownArrow)) {
				next = Math.min(toggles.length - 1, current + 1);
			} else if (keyboardEvent.equals(KeyCode.UpArrow)) {
				next = Math.max(0, current - 1);
			} else if (keyboardEvent.equals(KeyCode.Home)) {
				next = 0;
			} else if (keyboardEvent.equals(KeyCode.End)) {
				next = toggles.length - 1;
			}
			if (next !== undefined) {
				dom.EventHelper.stop(event, true);
				toggles[next].focus();
			}
		}));
		setExpanded(rows.some(row => row.attempt.id === this.expandedAttemptId) ? this.expandedAttemptId : undefined);
	}

	private renderScorecardRow(list: HTMLElement, context: IScorecardContext, attempt: ISessionComparisonParticipant): IScorecardRow {
		const { comparison, verdict, attempts } = context;
		const attemptNumber = attempts.indexOf(attempt) + 1;
		const attemptLabel = getSessionComparisonAttemptLabel(attempt, attemptNumber);
		const isWinner = attempt.id === verdict.recommendedParticipantId;
		const attemptVerdict = verdict.attempts.find(candidate => candidate.participantId === attempt.id);
		const element = dom.append(list, dom.$('li.session-comparison-scorecard-row'));
		element.classList.toggle('recommended', isWinner);
		const line = dom.append(element, dom.$('.session-comparison-scorecard-line'));
		const toggle = dom.append(line, dom.$<HTMLButtonElement>('button.session-comparison-scorecard-toggle'));
		toggle.type = 'button';
		dom.append(toggle, renderIcon(Codicon.chevronRight)).classList.add('session-comparison-scorecard-chevron');

		const identity = dom.append(toggle, dom.$('span.session-comparison-scorecard-identity'));
		dom.append(identity, dom.$('span.session-comparison-scorecard-model')).textContent = getAttemptModelLabel(attempt);
		const configurationLabel = getAttemptConfigurationLabel(attempt, context.showAgent);
		if (configurationLabel) {
			dom.append(identity, dom.$('span.session-comparison-scorecard-configuration')).textContent = configurationLabel;
		}
		const tag = getAttemptTag(attempt, isWinner);
		if (tag) {
			const tagElement = dom.append(identity, dom.$('span.session-comparison-result-tag'));
			tagElement.classList.toggle('recommended', isWinner);
			tagElement.textContent = tag;
		}

		const checks = dom.append(toggle, dom.$('span.session-comparison-scorecard-checks'));
		const checkDescriptions: string[] = [];
		if (attemptVerdict) {
			if (context.uniformValidationNote) {
				const summary = dom.append(checks, dom.$('span.session-comparison-check-summary'));
				summary.textContent = '\u2014';
				summary.setAttribute('aria-hidden', 'true');
				checkDescriptions.push(context.uniformValidationNote);
				this.renderStore.add(this.hoverService.setupDelayedHover(summary, { content: context.uniformValidationNote }));
			} else {
				for (const check of getValidationChecks()) {
					const evidence = attemptVerdict.validation[check.key];
					const description = describeValidation(check.label, evidence, getValidationCheckPurpose(check.key));
					checkDescriptions.push(description);
					const glyph = dom.append(checks, renderValidationGlyph(evidence));
					this.renderStore.add(this.hoverService.setupDelayedHover(glyph, { content: description }));
				}
			}
		}
		const elapsedMs = attempt.completion?.elapsedMs;
		const tokenCount = attempt.completion?.tokenCount;
		renderMetric(toggle, elapsedMs, context.maxElapsedMs, formatElapsedTime);
		renderMetric(toggle, tokenCount, context.maxTokenCount, value => formatCompactTokenCount(value, attempt.completion?.tokenCountIsComplete));
		toggle.setAttribute('aria-label', [
			isWinner ? localize('sessionComparisonResult.recommendedAttempt', "{0}, recommended by the Judge", attemptLabel) : attemptLabel,
			...checkDescriptions,
			localize('sessionComparisonResult.timeAriaLabel', "Time {0}", elapsedMs === undefined ? localize('sessionComparisonResult.unavailable', "Unavailable") : formatElapsedTime(elapsedMs)),
			localize('sessionComparisonResult.tokensAriaLabel', "Tokens {0}", tokenCount === undefined ? localize('sessionComparisonResult.unavailable', "Unavailable") : formatTokenCount(tokenCount, attempt.completion?.tokenCountIsComplete)),
		].join(', '));

		if (attempt.sessionResource) {
			const openLabel = localize('sessionComparisonResult.openAttempt', "Open {0}", attemptLabel);
			const open = dom.append(line, dom.$<HTMLButtonElement>('button.session-comparison-scorecard-open'));
			open.type = 'button';
			open.setAttribute('aria-label', openLabel);
			open.append(renderIcon(Codicon.arrowRight));
			this.renderStore.add(this.hoverService.setupDelayedHover(open, { content: openLabel }));
			this.renderStore.add(dom.addDisposableListener(open, dom.EventType.CLICK, () => this.focusAttempt(comparison, attempt)));
		}

		const detail = dom.append(element, dom.$('.session-comparison-scorecard-detail'));
		detail.id = `session-comparison-scorecard-detail-${generateUuid()}`;
		toggle.setAttribute('aria-controls', detail.id);
		if (isWinner && verdict.rationale) {
			renderDetailTitle(detail, localize('sessionComparisonResult.whyWinner', "Why it won"));
			this.renderRationale(detail, verdict.rationale);
			this.renderChecksStrip(detail, attemptVerdict, context.uniformValidationNote);
		} else {
			this.renderAttemptDetail(detail, attempt, attemptVerdict, isWinner, context.uniformValidationNote);
		}
		return { attempt, element, toggle, detail };
	}

	private renderAttemptDetail(detail: HTMLElement, attempt: ISessionComparisonParticipant, attemptVerdict: ISessionComparisonAttemptVerdict | undefined, isWinner: boolean, uniformValidationNote: string | undefined): void {
		const story = dom.append(detail, dom.$('.session-comparison-scorecard-story'));
		if (attempt.launchError) {
			renderDetailTitle(story, localize('sessionComparisonResult.launchFailed', "Failed to start"));
			dom.append(story, dom.$('p.session-comparison-scorecard-note')).textContent = attempt.launchError;
		}
		const strengths = attemptVerdict?.notableDifferences.length ? attemptVerdict.notableDifferences : attemptVerdict?.summary ? [attemptVerdict.summary] : [];
		if (strengths.length > 0) {
			renderDetailTitle(story, isWinner
				? localize('sessionComparisonResult.summary', "Summary")
				: localize('sessionComparisonResult.worthKeeping', "Worth keeping"));
			this.renderBullets(story, strengths);
		}
		const gaps = attemptVerdict?.unresolvedIssues ?? [];
		if (gaps.length > 0) {
			renderDetailTitle(story, localize('sessionComparisonResult.gaps', "Gaps"));
			this.renderBullets(story, gaps);
		}
		if (!attempt.launchError && strengths.length === 0 && gaps.length === 0) {
			dom.append(story, dom.$('p.session-comparison-scorecard-note')).textContent = localize('sessionComparisonResult.noStrengths', "No distinct strong points reported");
		}
		this.renderChecksStrip(detail, attemptVerdict, uniformValidationNote);
	}

	/**
	 * The four validation checks as one compact row, shared by every expanded attempt
	 * (including the winner) so the detail is consistent from row to row. Suppressed
	 * in favor of the scorecard's shared note when every attempt is uninformatively
	 * the same (e.g. nothing ran for any of them).
	 */
	private renderChecksStrip(detail: HTMLElement, attemptVerdict: ISessionComparisonAttemptVerdict | undefined, uniformValidationNote: string | undefined): void {
		if (!attemptVerdict || uniformValidationNote) {
			return;
		}
		const checks = dom.append(detail, dom.$('.session-comparison-scorecard-checks-strip'));
		checks.setAttribute('role', 'list');
		for (const check of getValidationChecks()) {
			const evidence = attemptVerdict.validation[check.key];
			const item = dom.append(checks, dom.$('span.session-comparison-scorecard-check-item'));
			item.setAttribute('role', 'listitem');
			item.append(renderValidationGlyph(evidence));
			dom.append(item, dom.$('span.session-comparison-scorecard-check-item-label')).textContent = check.label;
			const description = describeValidation(check.label, evidence, getValidationCheckPurpose(check.key));
			this.renderStore.add(this.hoverService.setupDelayedHover(item, { content: description }));
		}
	}

	private renderRationale(container: HTMLElement, rationale: ISessionComparisonRationale): void {
		const list = dom.append(container, dom.$('dl.session-comparison-result-rationale'));
		for (const entry of [
			{ label: localize('sessionComparisonResult.rationale.comparison', "Comparison"), point: rationale.comparison },
			{ label: localize('sessionComparisonResult.rationale.validation', "Validation"), point: rationale.validation },
			{ label: localize('sessionComparisonResult.rationale.codeQuality', "Code quality"), point: rationale.codeQuality },
			{ label: localize('sessionComparisonResult.rationale.solution', "Solution"), point: rationale.solution },
		]) {
			dom.append(list, dom.$('dt')).textContent = entry.label;
			this.renderMarkdown(dom.append(list, dom.$('dd')), entry.point);
		}
	}

	private renderBullets(container: HTMLElement, items: readonly string[]): void {
		const list = dom.append(container, dom.$('ul.session-comparison-result-bullets'));
		for (const item of items) {
			this.renderMarkdown(dom.append(list, dom.$('li')), item);
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
		const title = dom.append(panel, dom.$('h3.session-comparison-result-eyebrow'));
		title.id = `${panel.id}-title`;
		title.textContent = localize('sessionComparisonResult.additionalInstructions', "Additional synthesis instructions");
		panel.setAttribute('aria-labelledby', title.id);
		const description = dom.append(panel, dom.$('p.session-comparison-synthesis-instructions-description'));
		description.id = `${panel.id}-description`;
		description.textContent = localize('sessionComparisonResult.additionalInstructionsDescription', "Add requirements for synthesis, then use Start Synthesis with Instructions or press Ctrl+Enter (Cmd+Enter on macOS).");
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
			small: true,
			ariaLabel: localize('sessionComparisonResult.startWithInstructionsAriaLabel', "Start recommended synthesis with the additional instructions"),
		}));
		start.label = localize('sessionComparisonResult.startWithInstructions', "Start Synthesis with Instructions");
		const updateStartEnabled = () => start.enabled = getValue() !== undefined;
		const startWithInstructions = () => {
			flushInstructions();
			const plan = createRecommendedSynthesisPlan(getValue());
			if (plan) {
				void this.synthesize(comparison, start, plan);
			}
		};
		let instructionsPending = false;
		const persistInstructions = () => {
			if (!instructionsPending) {
				return;
			}
			instructionsPending = false;
			const current = this.comparisonService.getComparison(comparison.id);
			if (!current) {
				return;
			}
			this.comparisonService.setSynthesisPlan(
				comparison.id,
				createRecommendedSynthesisPlan(getValue()),
			);
		};
		const saveInstructions = new RunOnceScheduler(persistInstructions, 250);
		const flushInstructions = () => {
			saveInstructions.cancel();
			persistInstructions();
		};
		this.renderStore.add(toDisposable(flushInstructions));
		this.renderStore.add(saveInstructions);
		updateStartEnabled();
		this.renderStore.add(input.onDidChange(() => {
			instructionsPending = true;
			saveInstructions.schedule();
			updateStartEnabled();
		}));
		this.renderStore.add(dom.addDisposableListener(input.inputElement, dom.EventType.BLUR, flushInstructions));
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
		} finally {
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

function renderDetailTitle(container: HTMLElement, text: string): void {
	dom.append(container, dom.$('h3.session-comparison-result-eyebrow')).textContent = text;
}

function renderMetric(container: HTMLElement, value: number | undefined, max: number, format: (value: number) => string): void {
	const cell = dom.append(container, dom.$('span.session-comparison-scorecard-metric'));
	const text = dom.append(cell, dom.$('span.session-comparison-scorecard-metric-value'));
	if (value === undefined) {
		cell.classList.add('unavailable');
		text.textContent = localize('sessionComparisonResult.unavailable', "Unavailable");
		return;
	}
	text.textContent = format(value);
	const meter = dom.append(cell, dom.$('span.session-comparison-meter'));
	const fill = dom.append(meter, dom.$('span.session-comparison-meter-fill'));
	fill.style.width = `${max <= 0 ? 0 : Math.max(4, Math.round(value / max * 100))}%`;
}

function getValidationChecks(): readonly { readonly key: ValidationKey; readonly label: string }[] {
	return [
		{ key: 'tests', label: localize('sessionComparisonResult.check.tests', "Tests") },
		{ key: 'build', label: localize('sessionComparisonResult.check.build', "Build") },
		{ key: 'lint', label: localize('sessionComparisonResult.check.lint', "Lint") },
		{ key: 'diagnostics', label: localize('sessionComparisonResult.check.diagnostics', "Diagnostics") },
	];
}

function renderValidationGlyph(evidence: SessionComparisonValidationEvidence): HTMLElement {
	const { icon, className } = getValidationIcon(evidence);
	const glyph = renderIcon(icon);
	glyph.classList.add('session-comparison-check', className);
	glyph.setAttribute('aria-hidden', 'true');
	return glyph;
}

function getValidationIcon(evidence: SessionComparisonValidationEvidence): { readonly icon: ThemeIcon; readonly className: string } {
	switch (evidence.state) {
		case SessionComparisonValidationState.Passed: return { icon: Codicon.checkCompact, className: 'passed' };
		case SessionComparisonValidationState.Failed: return { icon: Codicon.closeCompact, className: 'failed' };
		case SessionComparisonValidationState.NotRun: return { icon: Codicon.circleSlash, className: 'not-run' };
		case SessionComparisonValidationState.NotApplicable: return { icon: Codicon.dash, className: 'not-applicable' };
		default: return { icon: Codicon.question, className: 'unknown' };
	}
}

function describeValidationState(evidence: SessionComparisonValidationEvidence): string {
	switch (evidence.state) {
		case SessionComparisonValidationState.Passed: return localize('sessionComparisonResult.validation.passed', "Passed");
		case SessionComparisonValidationState.Failed: return localize('sessionComparisonResult.validation.failed', "Failed");
		case SessionComparisonValidationState.NotRun: return localize('sessionComparisonResult.validation.notRun', "Not run");
		case SessionComparisonValidationState.NotApplicable: return localize('sessionComparisonResult.validation.notApplicable', "Not applicable");
		default: return localize('sessionComparisonResult.validation.unknown', "No evidence");
	}
}

function describeValidationSource(evidence: SessionComparisonValidationEvidence): string | undefined {
	switch (evidence.source) {
		case SessionComparisonValidationSource.JudgeRun: return localize('sessionComparisonResult.validation.judgeRun', "Judge run");
		case SessionComparisonValidationSource.AttemptReport: return localize('sessionComparisonResult.validation.attemptReport', "Attempt report");
		default: return undefined;
	}
}

function describeValidation(label: string, evidence: SessionComparisonValidationEvidence, purpose: string): string {
	const source = describeValidationSource(evidence);
	const state = source
		? localize('sessionComparisonResult.validation.withSource', "{0}: {1} ({2})", label, describeValidationState(evidence), source)
		: localize('sessionComparisonResult.validation.withoutSource', "{0}: {1}", label, describeValidationState(evidence));
	return localize('sessionComparisonResult.validation.withPurpose', "{0}. {1}", state, purpose);
}

/** What each check actually verifies, shown on hover alongside its state. */
function getValidationCheckPurpose(key: ValidationKey): string {
	switch (key) {
		case 'tests': return localize('sessionComparisonResult.check.tests.purpose', "Whether the attempt's automated tests were run and passed.");
		case 'build': return localize('sessionComparisonResult.check.build.purpose', "Whether the project built or compiled successfully.");
		case 'lint': return localize('sessionComparisonResult.check.lint.purpose', "Whether static analysis or linting ran cleanly.");
		case 'diagnostics': return localize('sessionComparisonResult.check.diagnostics.purpose', "Whether the changed files are free of editor errors and warnings.");
	}
}

/**
 * True when every attempt shares the exact same not-run, not-applicable, or unknown
 * state for every check, so the checks column would repeat the same uninformative
 * icons for each attempt instead of showing anything that actually differs.
 */
function isValidationUninformative(verdict: ISessionComparisonVerdict): boolean {
	if (verdict.attempts.length < 2) {
		return false;
	}
	const inertStates: readonly SessionComparisonValidationState[] = [SessionComparisonValidationState.NotRun, SessionComparisonValidationState.NotApplicable, SessionComparisonValidationState.Unknown];
	return getValidationChecks().every(check => {
		const first = verdict.attempts[0].validation[check.key].state;
		return inertStates.includes(first) && verdict.attempts.every(attempt => attempt.validation[check.key].state === first);
	});
}

/** A single shared explanation to show once instead of repeating the same uninformative checks on every row. */
function getUniformValidationNote(verdict: ISessionComparisonVerdict): string | undefined {
	return isValidationUninformative(verdict)
		? localize('sessionComparisonResult.noChecksRan', "Tests, build, lint, and diagnostics did not run for this comparison; the Judge reviewed the code changes only.")
		: undefined;
}

function getAttemptModelLabel(attempt: ISessionComparisonParticipant): string {
	return attempt.harness.modelLabel ?? attempt.harness.label;
}

function getAttemptConfigurationLabel(attempt: ISessionComparisonParticipant, showAgent: boolean): string | undefined {
	const configuration = getSessionComparisonHarnessConfigurationLabel(attempt.harness);
	const agent = showAgent && attempt.harness.modelLabel ? attempt.harness.label : undefined;
	return configuration && agent
		? localize('sessionComparisonResult.configurationAndAgent', "{0} · {1}", configuration, agent)
		: configuration ?? agent;
}

function getAttemptTag(attempt: ISessionComparisonParticipant, isWinner: boolean): string | undefined {
	if (isWinner) {
		return localize('sessionComparisonResult.recommended', "Recommended");
	}
	if (attempt.launchError) {
		return localize('sessionComparisonResult.failedToStartTag', "Failed to start");
	}
	if (attempt.missingSession) {
		return localize('sessionComparisonResult.sessionUnavailable', "Session unavailable");
	}
	return undefined;
}

export function buildSessionComparisonAccessibleContent(comparison: ISessionComparison): string {
	const verdict = comparison.verdict;
	if (!verdict) {
		return '';
	}
	const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
	const winner = attempts.find(participant => participant.id === verdict.recommendedParticipantId);
	if (!winner) {
		return '';
	}
	const attemptLabels = new Map(attempts.map((attempt, index) => [attempt.id, getSessionComparisonAttemptLabel(attempt, index + 1)]));
	const winnerLabel = attemptLabels.get(winner.id) ?? winner.id;
	const lines = [
		localize('sessionComparisonAccessibleView.title', "Comparison result"),
		localize('sessionComparisonResult.winner', "{0} won", winnerLabel),
		'',
		localize('sessionComparisonResult.whyWinner', "Why it won"),
	];
	if (verdict.rationale) {
		lines.push(
			formatAccessibleLabelValue(localize('sessionComparisonResult.rationale.comparison', "Comparison"), toPlainText(verdict.rationale.comparison)),
			formatAccessibleLabelValue(localize('sessionComparisonResult.rationale.validation', "Validation"), toPlainText(verdict.rationale.validation)),
			formatAccessibleLabelValue(localize('sessionComparisonResult.rationale.codeQuality', "Code quality"), toPlainText(verdict.rationale.codeQuality)),
			formatAccessibleLabelValue(localize('sessionComparisonResult.rationale.solution', "Solution"), toPlainText(verdict.rationale.solution)),
		);
	} else {
		lines.push(toPlainText(verdict.explanation));
	}

	const otherAttempts = attempts.filter(attempt => attempt.id !== winner.id);
	if (otherAttempts.length > 0) {
		lines.push('', localize('sessionComparisonResult.otherStrengths', "Strong points from other attempts"));
		for (const attempt of otherAttempts) {
			const attemptVerdict = verdict.attempts.find(candidate => candidate.participantId === attempt.id);
			const strengths = attemptVerdict?.notableDifferences.length
				? attemptVerdict.notableDifferences
				: attemptVerdict?.summary ? [attemptVerdict.summary] : [];
			lines.push(formatAccessibleLabelValue(
				attemptLabels.get(attempt.id) ?? attempt.id,
				strengths.length > 0
					? strengths.map(toPlainText).join('; ')
					: localize('sessionComparisonResult.noStrengths', "No distinct strong points reported"),
			));
		}
	}

	lines.push('', localize('sessionComparisonResult.attemptMetrics', "Attempt time and token usage"));
	const timeWinners = getMetricWinnerIds(attempts, attempt => attempt.completion?.elapsedMs);
	const tokenWinners = getMetricWinnerIds(attempts, attempt => attempt.completion?.tokenCountIsComplete === false ? undefined : attempt.completion?.tokenCount);
	for (const attempt of attempts) {
		const elapsed = attempt.completion?.elapsedMs === undefined
			? localize('sessionComparisonResult.unavailable', "Unavailable")
			: formatElapsedTime(attempt.completion.elapsedMs);
		const tokens = attempt.completion?.tokenCount === undefined
			? localize('sessionComparisonResult.unavailable', "Unavailable")
			: formatTokenCount(attempt.completion.tokenCount, attempt.completion.tokenCountIsComplete);
		lines.push(localize(
			'sessionComparisonAccessibleView.attemptMetrics',
			"{0}: Total time {1}{2}; Tokens used {3}{4}",
			attemptLabels.get(attempt.id) ?? attempt.id,
			elapsed,
			timeWinners.has(attempt.id) ? localize('sessionComparisonAccessibleView.winner', " (winner)") : '',
			tokens,
			tokenWinners.has(attempt.id) ? localize('sessionComparisonAccessibleView.winner', " (winner)") : '',
		));
	}
	return lines.join('\n');
}

function toPlainText(markdown: string): string {
	return renderAsPlaintext(new MarkdownString(markdown), { omitMarkdownSyntax: true });
}

function formatAccessibleLabelValue(label: string, value: string): string {
	return localize('sessionComparisonAccessibleView.labelValue', "{0}: {1}", label, value);
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

function getMetricWinnerIds(
	attempts: readonly ISessionComparisonParticipant[],
	getValue: (attempt: ISessionComparisonParticipant) => number | undefined,
): ReadonlySet<string> {
	const available = attempts
		.map(attempt => ({ id: attempt.id, value: getValue(attempt) }))
		.filter((entry): entry is { id: string; value: number } => entry.value !== undefined);
	if (available.length < 2) {
		return new Set();
	}
	const winningValue = Math.min(...available.map(entry => entry.value));
	return new Set(available.filter(entry => entry.value === winningValue).map(entry => entry.id));
}

function formatTokenCount(tokenCount: number, isComplete: boolean | undefined): string {
	const formatted = tokenCount.toLocaleString();
	return isComplete === false
		? localize('sessionComparisonResult.partialTokenCount', "At least {0}", formatted)
		: formatted;
}

const compactTokenFormat = safeIntl.NumberFormat(language, { notation: 'compact', maximumSignificantDigits: 3 });

function formatCompactTokenCount(tokenCount: number, isComplete: boolean | undefined): string {
	const formatted = compactTokenFormat.value.format(tokenCount);
	return isComplete === false
		? localize('sessionComparisonResult.partialCompactTokenCount', "{0}+", formatted)
		: formatted;
}

function createRecommendedSynthesisPlan(instructions: string | undefined): ISessionComparisonSynthesisPlan | undefined {
	return instructions ? { instructions } : undefined;
}

function normalizeSynthesisInstructions(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function isJudgeSession(comparison: ISessionComparison, session: ISession): boolean {
	return comparison.participants.some(participant =>
		participant.role === SessionComparisonParticipantRole.Judge
		&& !!participant.sessionResource
		&& isEqual(participant.sessionResource, session.resource),
	);
}
