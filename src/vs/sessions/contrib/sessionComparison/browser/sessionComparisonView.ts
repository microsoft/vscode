/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonView.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatContentMarkdownRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { getCompactModelPickerIcon } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptNames, ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonDecisionSection, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, nameSessionComparisonAttempts, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionComparisonRunPillContext, SessionComparisonRunPill, SessionComparisonRunStatus } from './sessionComparisonRunPill.js';
import { ISessionComparisonViewService } from './sessionComparisonViewService.js';

/** Whether focus is inside the comparison view, for its Accessible View. */
export const SessionComparisonViewFocused = new RawContextKey<boolean>('sessionComparisonViewFocused', false);

const OPEN_RUN_ACTION_ID = 'sessionComparison.openRun';

/** The comparison shown as one conversation: the prompt, its parallel runs, the review and what to keep. */
export class SessionComparisonCustomView extends AbstractCustomView {

	readonly title: IObservable<string>;
	override readonly description: IObservable<string | undefined>;

	private readonly comparison: IObservable<ISessionComparison | undefined>;
	private transcript: SessionComparisonTranscript | undefined;

	constructor(
		@ISessionComparisonViewService viewService: ISessionComparisonViewService,
		@ISessionComparisonService comparisonService: ISessionComparisonService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.comparison = derived(this, reader => {
			const id = viewService.activeComparisonId.read(reader);
			return id ? comparisonService.comparisons.read(reader).find(candidate => candidate.id === id) : undefined;
		});
		this.title = derived(this, reader => this.comparison.read(reader)?.title || localize('sessionComparisonView.title', "Comparison"));
		this.description = derived(this, reader => {
			const comparison = this.comparison.read(reader);
			if (!comparison) {
				return undefined;
			}
			const runs = getRuns(comparison);
			const harness = runs[0]?.harness.label;
			if (!harness) {
				return undefined;
			}
			return comparison.branch
				? localize('sessionComparisonView.descriptionWithBranch', "{0} models in parallel · {1} · from {2}", runs.length, harness, comparison.branch)
				: localize('sessionComparisonView.description', "{0} models in parallel · {1}", runs.length, harness);
		});
	}

	render(container: HTMLElement): void {
		container.classList.add('session-comparison-view');
		const markdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
		this.transcript = this._register(this.instantiationService.createInstance(SessionComparisonTranscript, this.comparison, markdownRenderer));
		container.appendChild(this.transcript.domNode);
	}

	layout(_width: number, _height: number): void { }

	override focus(): void {
		this.transcript?.focus();
	}
}

function getRuns(comparison: ISessionComparison): readonly ISessionComparisonParticipant[] {
	return comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
}

function getRunLabel(participant: ISessionComparisonParticipant): string {
	return participant.harness.modelLabel ?? participant.harness.label;
}

/** Judge-written text with its "Attempt N" references named by model. */
function nameAttempts(comparison: ISessionComparison, text: string): string {
	return nameSessionComparisonAttempts(text, getSessionComparisonAttemptNames(comparison));
}

function isTerminal(status: SessionComparisonRunStatus): boolean {
	return status === SessionComparisonRunStatus.Completed || status === SessionComparisonRunStatus.Failed;
}

/**
 * Renders one comparison, keeping each participant's pill alive across updates
 * so its spinner and activity transitions are not restarted.
 */
export class SessionComparisonTranscript extends Disposable {

	readonly domNode = dom.$('.session-comparison-transcript');

	private readonly sessionsChanged: IObservable<void>;
	private readonly content = this._register(new MutableDisposable<DisposableStore>());
	private readonly announcedVerdicts = new Set<string>();
	private readonly runRows: RunRow[] = [];
	private resultsFocusTarget: HTMLElement | undefined;
	private renderedComparisonId: string | undefined;

	constructor(
		private readonly comparison: IObservable<ISessionComparison | undefined>,
		private readonly markdownRenderer: IMarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionComparisonViewService private readonly viewService: ISessionComparisonViewService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.domNode.tabIndex = -1;
		this.sessionsChanged = observableSignalFromEvent(this, this.managementService.onDidChangeSessions);

		const focusContext = SessionComparisonViewFocused.bindTo(contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => focusContext.reset()));

		this._register(autorun(reader => {
			const id = this.comparison.read(reader)?.id;
			if (id !== this.renderedComparisonId || !this.content.value) {
				this.renderedComparisonId = id;
				this.renderComparison(id);
			}
		}));
	}

	focus(): void {
		// Once reviewed, the choice in hand is what to keep; before that, the first run.
		if (this.resultsFocusTarget?.isConnected) {
			this.resultsFocusTarget.focus();
		} else if (!this.runRows[0]?.focus()) {
			this.domNode.focus();
		}
	}

	private renderComparison(comparisonId: string | undefined): void {
		dom.clearNode(this.domNode);
		this.runRows.length = 0;
		this.resultsFocusTarget = undefined;
		const store = new DisposableStore();
		this.content.value = store;
		if (!comparisonId) {
			this.renderMissing();
			return;
		}
		const comparison = derivedOpts<ISessionComparison | undefined>({ owner: this }, reader => {
			const current = this.comparison.read(reader);
			return current?.id === comparisonId ? current : undefined;
		});
		const initial = comparison.get();
		if (!initial) {
			this.renderMissing();
			return;
		}

		this.renderRequest(initial);
		const response = dom.append(this.domNode, dom.$('.session-comparison-response'));
		response.setAttribute('role', 'region');
		response.setAttribute('aria-label', localize('sessionComparisonView.responseAriaLabel', "Parallel runs"));

		const statusLine = dom.append(response, dom.$('.session-comparison-status'));
		statusLine.setAttribute('role', 'status');
		const runs = dom.append(response, dom.$('.session-comparison-runs'));
		runs.setAttribute('role', 'list');
		const review = dom.append(response, dom.$('.session-comparison-review'));
		const results = dom.append(response, dom.$('.session-comparison-results'));
		const synthesis = dom.append(response, dom.$('.session-comparison-synthesis'));

		const rows = store.add(new DisposableMap<string, RunRow>());
		store.add(autorun(reader => {
			const current = comparison.read(reader);
			if (!current) {
				return;
			}
			const runParticipants = getRuns(current);
			for (const [index, participant] of runParticipants.entries()) {
				if (!rows.has(participant.id)) {
					const row = this.instantiationService.createInstance(RunRow, comparison, participant.id, index + 1, runParticipants.length, this.sessionsChanged, this.markdownRenderer);
					rows.set(participant.id, row);
					this.runRows.push(row);
					runs.appendChild(row.domNode);
				}
			}
		}));

		const runStatuses = derived(this, reader => {
			const current = comparison.read(reader);
			this.sessionsChanged.read(reader);
			return current ? getRuns(current).map(run => this.getParticipantStatus(current, run, reader)) : [];
		});
		store.add(this.renderStatusLine(statusLine, comparison, runStatuses));
		store.add(this.renderReview(review, comparison, runStatuses));
		store.add(this.renderResults(results, comparison));
		store.add(this.renderSynthesis(synthesis, comparison));
	}

	private renderMissing(): void {
		const empty = dom.append(this.domNode, dom.$('.session-comparison-empty'));
		dom.append(empty, dom.$('p')).textContent = localize('sessionComparisonView.missing', "This comparison is no longer available.");
		const back = this.content.value?.add(new Button(empty, { ...defaultButtonStyles, secondary: true }));
		if (back) {
			back.label = localize('sessionComparisonView.close', "Close Comparison");
			this.content.value?.add(back.onDidClick(() => this.viewService.close()));
		}
	}

	private renderRequest(comparison: ISessionComparison): void {
		const request = dom.append(this.domNode, dom.$('.session-comparison-request'));
		request.setAttribute('role', 'region');
		request.setAttribute('aria-label', localize('sessionComparisonView.requestAriaLabel', "Your prompt"));
		const bubble = dom.append(request, dom.$('.session-comparison-request-bubble'));
		bubble.textContent = comparison.prompt;
		const attachmentCount = comparison.attachedContext?.length ?? 0;
		if (attachmentCount > 0) {
			const meta = dom.append(request, dom.$('.session-comparison-request-meta'));
			meta.append(renderIcon(Codicon.attach), attachmentCount === 1
				? localize('sessionComparisonView.oneAttachment', "1 attachment")
				: localize('sessionComparisonView.attachments', "{0} attachments", attachmentCount));
		}
	}

	private renderStatusLine(container: HTMLElement, comparison: IObservable<ISessionComparison | undefined>, runStatuses: IObservable<readonly SessionComparisonRunStatus[]>): IDisposable {
		const store = new DisposableStore();
		const icon = dom.append(container, dom.$('span.session-comparison-status-icon'));
		const label = dom.append(container, dom.$('span.session-comparison-status-label'));
		let announced: string | undefined;
		store.add(autorun(reader => {
			const current = comparison.read(reader);
			if (!current) {
				return;
			}
			const statuses = runStatuses.read(reader);
			const done = statuses.filter(isTerminal).length;
			const judge = current.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
			const judgeStatus = judge ? this.getParticipantStatus(current, judge, reader) : undefined;
			const synthesis = current.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis);
			const synthesisStatus = synthesis ? this.getParticipantStatus(current, synthesis, reader) : undefined;

			let text: string;
			let active = true;
			let iconId: ThemeIcon | undefined;
			if (current.cancelledAt !== undefined) {
				text = localize('sessionComparisonView.status.stopped', "Comparison stopped");
				active = false;
				iconId = Codicon.circleSlash;
			} else if (synthesisStatus !== undefined) {
				active = !isTerminal(synthesisStatus);
				text = active
					? localize('sessionComparisonView.status.combining', "Combining the changes you kept")
					: synthesisStatus === SessionComparisonRunStatus.Completed
						? localize('sessionComparisonView.status.combined', "The combined version is ready")
						: localize('sessionComparisonView.status.combineFailed', "Combining the changes stopped");
				iconId = active ? undefined : synthesisStatus === SessionComparisonRunStatus.Completed ? Codicon.check : Codicon.error;
			} else if (current.verdict) {
				text = localize('sessionComparisonView.status.reviewed', "Here's what each model did");
				active = false;
				iconId = Codicon.checklist;
			} else if (done < statuses.length) {
				text = current.launching
					? localize('sessionComparisonView.status.starting', "Starting {0} runs in parallel", statuses.length)
					: done === 0
						? localize('sessionComparisonView.status.running', "Running {0} models in parallel", statuses.length)
						: localize('sessionComparisonView.status.runningWithDone', "Running {0} models in parallel · {1} of {0} finished", statuses.length, done);
			} else if (judgeStatus !== undefined && !isTerminal(judgeStatus)) {
				text = localize('sessionComparisonView.status.reviewing', "Reviewing the {0} runs", statuses.length);
			} else if (judge?.launchError) {
				text = localize('sessionComparisonView.status.reviewFailed', "All runs finished · the review couldn't start");
				active = false;
				iconId = Codicon.warning;
			} else {
				text = localize('sessionComparisonView.status.allFinished', "All {0} runs finished · starting the review", statuses.length);
			}
			label.textContent = text;
			container.classList.toggle('active', active);
			dom.clearNode(icon);
			icon.appendChild(renderIcon(active ? ThemeIcon.modify(Codicon.loading, 'spin') : iconId ?? Codicon.check));
			if (!active && announced !== text) {
				announced = text;
				status(text);
			}
		}));
		return store;
	}

	private renderReview(container: HTMLElement, comparison: IObservable<ISessionComparison | undefined>, runStatuses: IObservable<readonly SessionComparisonRunStatus[]>): IDisposable {
		const store = new DisposableStore();
		const pillHost = store.add(new ParticipantPill(container, this.instantiationService, id => this.openParticipant(comparison.get(), id)));
		const note = dom.append(container, dom.$('.session-comparison-review-note'));
		const retry = store.add(new MutableDisposable<DisposableStore>());
		store.add(autorun(reader => {
			const current = comparison.read(reader);
			if (!current) {
				return;
			}
			this.sessionsChanged.read(reader);
			const judge = current.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
			const reviewer = judge?.harness ?? current.judgeHarness;
			const reviewerLabel = reviewer ? reviewer.modelLabel ?? reviewer.label : undefined;
			dom.clearNode(note);
			retry.clear();
			if (!judge || (!judge.sessionResource && !judge.launchError)) {
				pillHost.hide();
				const running = runStatuses.read(reader).some(runStatus => !isTerminal(runStatus));
				note.hidden = !running || !reviewerLabel;
				if (reviewerLabel) {
					note.textContent = localize('sessionComparisonView.reviewPending', "When every run finishes, {0} reviews them side by side and runs any missing checks.", reviewerLabel);
				}
				return;
			}
			if (judge.launchError && !judge.sessionResource) {
				pillHost.hide();
				note.hidden = false;
				note.textContent = localize('sessionComparisonView.reviewFailed', "The review couldn't start: {0}", judge.launchError);
				if (this.comparisonService.canRetryJudge(current.id)) {
					const retryStore = retry.value = new DisposableStore();
					const button = retryStore.add(new Button(note, { ...defaultButtonStyles, secondary: true }));
					button.label = localize('sessionComparisonView.retryReview', "Retry Review");
					retryStore.add(button.onDidClick(() => this.comparisonService.retryJudge(current.id)));
				}
				return;
			}
			note.hidden = true;
			const judgeStatus = this.getParticipantStatus(current, judge, reader);
			pillHost.update(judge.id, this.getPillContext(current, judge, judgeStatus, reader, {
				title: reviewerLabel
					? localize('sessionComparisonView.reviewTitle', "Review · {0}", reviewerLabel)
					: localize('sessionComparisonView.reviewTitleNoModel', "Review"),
				role: localize('sessionComparisonView.reviewRole', "Reviewer"),
			}));
		}));
		return store;
	}

	private renderSynthesis(container: HTMLElement, comparison: IObservable<ISessionComparison | undefined>): IDisposable {
		const store = new DisposableStore();
		const pillHost = store.add(new ParticipantPill(container, this.instantiationService, id => this.openParticipant(comparison.get(), id)));
		const actions = dom.append(container, dom.$('.session-comparison-synthesis-actions'));
		const continueButton = store.add(new Button(actions, { ...defaultButtonStyles }));
		continueButton.label = localize('sessionComparisonView.continueCombined', "Continue with Combined Version");
		let synthesisId: string | undefined;
		store.add(continueButton.onDidClick(() => {
			const current = comparison.get();
			if (current && synthesisId) {
				void this.viewService.openParticipant(current.id, synthesisId);
			}
		}));
		store.add(autorun(reader => {
			const current = comparison.read(reader);
			this.sessionsChanged.read(reader);
			const synthesis = current?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis);
			container.hidden = !current || !synthesis;
			if (!current || !synthesis) {
				pillHost.hide();
				return;
			}
			synthesisId = synthesis.id;
			const synthesisStatus = this.getParticipantStatus(current, synthesis, reader);
			pillHost.update(synthesis.id, this.getPillContext(current, synthesis, synthesisStatus, reader, {
				title: localize('sessionComparisonView.combinedTitle', "Combined version · {0}", getRunLabel(synthesis)),
				role: localize('sessionComparisonView.combinedRole', "Combined version"),
			}));
			actions.hidden = synthesisStatus !== SessionComparisonRunStatus.Completed;
		}));
		return store;
	}

	private renderResults(container: HTMLElement, comparison: IObservable<ISessionComparison | undefined>): IDisposable {
		const store = new DisposableStore();
		const content = store.add(new MutableDisposable<DisposableStore>());
		// Re-rendered only when the verdict itself arrives, synthesis starts or the
		// user continues with a run, so choosing what to keep does not rebuild the
		// list under the pointer.
		const key = derivedOpts<{ verdict: ISessionComparison['verdict']; hasSynthesis: boolean; selectedParticipantId: string | undefined } | undefined>({
			owner: this,
			equalsFn: (a, b) => a?.verdict === b?.verdict && a?.hasSynthesis === b?.hasSynthesis && a?.selectedParticipantId === b?.selectedParticipantId,
		}, reader => {
			const current = comparison.read(reader);
			return current ? {
				verdict: current.verdict,
				hasSynthesis: current.participants.some(participant => participant.role === SessionComparisonParticipantRole.Synthesis),
				selectedParticipantId: current.selectedParticipantId,
			} : undefined;
		});
		store.add(autorun(reader => {
			key.read(reader);
			// Everything else is read once per render; picks must not rebuild the list.
			const current = comparison.read(undefined);
			dom.clearNode(container);
			const renderStore = content.value = new DisposableStore();
			container.hidden = !current?.verdict;
			if (current?.verdict) {
				this.renderVerdict(container, current, renderStore);
			}
		}));
		return store;
	}

	private renderVerdict(container: HTMLElement, comparison: ISessionComparison, store: DisposableStore): void {
		const verdict = comparison.verdict!;
		const runs = getRuns(comparison);
		const winner = runs.find(run => run.id === verdict.recommendedParticipantId);
		if (!winner) {
			container.hidden = true;
			return;
		}
		const hasSynthesis = comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Synthesis);

		const headline = dom.append(container, dom.$('.session-comparison-verdict'));
		const headlineTitle = dom.append(headline, dom.$('p.session-comparison-verdict-title'));
		headlineTitle.append(
			this.renderModelChip(winner, store),
			localize('sessionComparisonView.verdictTitle', "is the strongest starting point."),
		);
		this.renderMarkdown(dom.append(headline, dom.$('.session-comparison-verdict-explanation')), nameAttempts(comparison, verdict.explanation), store);
		if (verdict.rationale || verdict.conflicts.length) {
			const why = dom.append(headline, dom.$('details.session-comparison-why'));
			dom.append(why, dom.$('summary')).textContent = localize('sessionComparisonView.why', "Why");
			const list = dom.append(why, dom.$('ul'));
			const points: [string, string][] = verdict.rationale ? [
				[localize('sessionComparisonView.why.comparison', "Compared"), verdict.rationale.comparison],
				[localize('sessionComparisonView.why.validation', "Checks"), verdict.rationale.validation],
				[localize('sessionComparisonView.why.codeQuality', "Code"), verdict.rationale.codeQuality],
				[localize('sessionComparisonView.why.solution', "Solution"), verdict.rationale.solution],
			] : [];
			for (const conflict of verdict.conflicts) {
				points.push([localize('sessionComparisonView.why.conflict', "To reconcile"), conflict]);
			}
			for (const [label, point] of points) {
				const item = dom.append(list, dom.$('li'));
				dom.append(item, dom.$('span.session-comparison-why-label')).textContent = label;
				this.renderMarkdown(dom.append(item, dom.$('span.session-comparison-why-point')), nameAttempts(comparison, point), store);
			}
		}

		const sections = verdict.decisionSections ?? [];
		const picks = new Map<string, string | undefined>();
		const stored = new Map(comparison.synthesisPlan?.selections.map(selection => [selection.sectionId, selection.participantId]));
		for (const section of sections) {
			const pick = stored.has(section.id) ? stored.get(section.id) : section.recommendedParticipantId;
			picks.set(section.id, pick === undefined || section.options.some(option => option.participantId === pick) ? pick : section.recommendedParticipantId);
		}

		let instructions: InputBox | undefined;
		const getInstructions = () => normalizeInstructions(instructions?.value);
		const next = dom.$('.session-comparison-next');
		let actions: HTMLElement | undefined;
		const continued = runs.find(run => run.id === comparison.selectedParticipantId);
		// Once the user continued with a run, going back to it is opening it, not choosing again.
		const continueLabel = (run: ISessionComparisonParticipant) => run === continued
			? localize('sessionComparisonView.openContinued', "Open {0}", getRunLabel(run))
			: localize('sessionComparisonView.continueWith', "Continue with {0}", getRunLabel(run));
		const updateNextSteps = store.add(new MutableDisposable<DisposableStore>());
		const renderNextSteps = () => {
			const nextStore = updateNextSteps.value = new DisposableStore();
			if (!actions && continued && !hasSynthesis) {
				const note = dom.append(next, dom.$('p.session-comparison-continued'));
				note.append(renderIcon(Codicon.check), localize('sessionComparisonView.continued', "You continued with {0}", getRunLabel(continued)));
			}
			actions ??= dom.append(next, dom.$('.session-comparison-next-actions'));
			dom.clearNode(actions);
			if (hasSynthesis) {
				return;
			}
			const chosen = new Set([...picks.values()]);
			const single = sections.length > 0 && chosen.size === 1 ? [...chosen][0] : undefined;
			const keep = runs.find(run => run.id === (sections.length ? single : winner.id));
			const continueWith = (participant: ISessionComparisonParticipant) => {
				this.comparisonService.selectAttempt(comparison.id, participant.id);
				void this.viewService.openParticipant(comparison.id, participant.id);
			};
			const combine = async (button: Button) => {
				button.enabled = false;
				try {
					this.comparisonService.setSynthesisPlan(comparison.id, sections.length
						? createPlan(sections, picks, getInstructions())
						: getInstructions() ? { selections: [], instructions: getInstructions() } : undefined);
					await this.comparisonService.synthesize(comparison.id);
				} catch (error) {
					this.notificationService.error(error);
					button.enabled = true;
				}
			};
			if (keep) {
				const primary = nextStore.add(new Button(actions, { ...defaultButtonStyles }));
				primary.label = continueLabel(keep);
				if (!sections.length) {
					this.resultsFocusTarget = primary.element;
				}
				nextStore.add(primary.onDidClick(() => continueWith(keep)));
				const secondary = nextStore.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
				secondary.label = sections.length
					? localize('sessionComparisonView.combineAnyway', "Combine Instead")
					: localize('sessionComparisonView.combineBest', "Combine the Best Parts");
				nextStore.add(secondary.onDidClick(() => combine(secondary)));
			} else {
				const primary = nextStore.add(new Button(actions, { ...defaultButtonStyles }));
				primary.label = localize('sessionComparisonView.combineChoices', "Combine What You Kept");
				nextStore.add(primary.onDidClick(() => combine(primary)));
				const secondary = nextStore.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
				secondary.label = continueLabel(winner);
				nextStore.add(secondary.onDidClick(() => continueWith(winner)));
			}
		};

		if (sections.length) {
			const differences = dom.append(container, dom.$('.session-comparison-differences'));
			const heading = dom.append(differences, dom.$('h3.session-comparison-heading'));
			heading.textContent = localize('sessionComparisonView.differences', "Where they differ");
			dom.append(differences, dom.$('p.session-comparison-hint')).textContent = hasSynthesis
				? localize('sessionComparisonView.differencesKept', "What each run did, and what you kept for the combined version.")
				: localize('sessionComparisonView.differencesHint', "Pick what to keep for each change, or open a run to see exactly where it happened.");
			for (const section of sections) {
				this.renderDecision(differences, comparison, section, runs, picks, hasSynthesis, store, () => {
					this.comparisonService.setSynthesisPlan(comparison.id, createPlan(sections, picks, getInstructions()));
					renderNextSteps();
				});
			}
		}

		if (!hasSynthesis) {
			container.appendChild(next);
			const inputContainer = dom.append(next, dom.$('.session-comparison-instructions'));
			instructions = store.add(new InputBox(inputContainer, undefined, {
				placeholder: localize('sessionComparisonView.instructionsPlaceholder', "Anything else the combined version should do? (optional)"),
				ariaLabel: localize('sessionComparisonView.instructionsAriaLabel', "Instructions for the combined version"),
				flexibleHeight: true,
				flexibleMaxHeight: 120,
				inputBoxStyles: defaultInputBoxStyles,
			}));
			instructions.inputElement.maxLength = SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH;
			instructions.value = comparison.synthesisPlan?.instructions ?? '';
			const persist = store.add(new RunOnceScheduler(() => {
				if (!this.comparisonService.getComparison(comparison.id)) {
					return;
				}
				this.comparisonService.setSynthesisPlan(comparison.id, sections.length
					? createPlan(sections, picks, getInstructions())
					: getInstructions() ? { selections: [], instructions: getInstructions() } : undefined);
			}, 250));
			store.add(instructions.onDidChange(() => persist.schedule()));
			store.add(toDisposable(() => persist.flush()));
			renderNextSteps();
		}

		if (!this.announcedVerdicts.has(comparison.id)) {
			this.announcedVerdicts.add(comparison.id);
			status(localize('sessionComparisonView.verdictAnnouncement', "Review ready. {0} is the strongest starting point.", getRunLabel(winner)));
		}
	}

	private renderDecision(
		container: HTMLElement,
		comparison: ISessionComparison,
		section: ISessionComparisonDecisionSection,
		runs: readonly ISessionComparisonParticipant[],
		picks: Map<string, string | undefined>,
		readOnly: boolean,
		store: DisposableStore,
		onDidPick: () => void,
	): void {
		const decision = dom.append(container, dom.$('.session-comparison-decision'));
		const header = dom.append(decision, dom.$('.session-comparison-decision-header'));
		const title = dom.append(header, dom.$('span.session-comparison-decision-title'));
		title.id = `session-comparison-decision-${comparison.id}-${section.id}`;
		title.textContent = toPlainText(nameAttempts(comparison, section.title));
		if (section.affectedFiles.length) {
			const files = dom.append(header, dom.$('span.session-comparison-decision-files'));
			files.append(renderIcon(Codicon.file), section.affectedFiles.length === 1
				? basename(section.affectedFiles[0])
				: localize('sessionComparisonView.decisionFiles', "{0} +{1}", basename(section.affectedFiles[0]), section.affectedFiles.length - 1));
			store.add(this.hoverService.setupDelayedHover(files, { content: section.affectedFiles.join('\n') }));
		}
		this.renderMarkdown(dom.append(decision, dom.$('.session-comparison-decision-description')), nameAttempts(comparison, section.description), store);

		const group = dom.append(decision, dom.$('.session-comparison-decision-options'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-labelledby', title.id);
		const radios: { readonly element: HTMLElement; readonly participantId: string | undefined }[] = [];
		const updateChecked = () => {
			const picked = picks.get(section.id);
			for (const radio of radios) {
				const checked = radio.participantId === picked;
				radio.element.setAttribute('aria-checked', String(checked));
				radio.element.tabIndex = checked ? 0 : -1;
				radio.element.closest('.session-comparison-option')?.classList.toggle('checked', checked);
			}
		};
		const pick = (participantId: string | undefined) => {
			if (readOnly || picks.get(section.id) === participantId) {
				return;
			}
			picks.set(section.id, participantId);
			updateChecked();
			onDidPick();
		};
		const addRadio = (row: HTMLElement, participantId: string | undefined, render: (radio: HTMLElement) => void) => {
			const radio = dom.append(row, dom.$('.session-comparison-option-choice'));
			radio.setAttribute('role', 'radio');
			if (readOnly) {
				radio.setAttribute('aria-readonly', 'true');
			}
			dom.append(radio, dom.$('span.session-comparison-option-mark'));
			render(radio);
			radios.push({ element: radio, participantId });
			store.add(dom.addDisposableListener(radio, dom.EventType.CLICK, () => pick(participantId)));
			store.add(dom.addDisposableListener(radio, dom.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				const index = radios.findIndex(candidate => candidate.element === radio);
				if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
					dom.EventHelper.stop(event, true);
					pick(participantId);
				} else if (keyboardEvent.equals(KeyCode.DownArrow) || keyboardEvent.equals(KeyCode.RightArrow) || keyboardEvent.equals(KeyCode.UpArrow) || keyboardEvent.equals(KeyCode.LeftArrow)) {
					dom.EventHelper.stop(event, true);
					const forward = keyboardEvent.equals(KeyCode.DownArrow) || keyboardEvent.equals(KeyCode.RightArrow);
					const target = radios[(index + (forward ? 1 : radios.length - 1)) % radios.length];
					target.element.focus();
					pick(target.participantId);
				}
			}));
		};

		for (const run of runs) {
			const option = section.options.find(candidate => candidate.participantId === run.id);
			if (!option) {
				continue;
			}
			const row = dom.append(group, dom.$('.session-comparison-option'));
			addRadio(row, run.id, radio => {
				const text = dom.append(radio, dom.$('span.session-comparison-option-text'));
				text.append(this.renderModelChip(run, store));
				if (run.id === section.recommendedParticipantId) {
					dom.append(text, dom.$('span.session-comparison-suggested')).textContent = localize('sessionComparisonView.suggested', "Suggested");
				}
				this.renderMarkdown(dom.append(text, dom.$('span.session-comparison-option-approach')), nameAttempts(comparison, option.approach), store);
			});
			if (run.sessionResource) {
				const jump = dom.append(row, dom.$('a.session-comparison-option-jump'));
				jump.setAttribute('role', 'button');
				jump.tabIndex = 0;
				jump.append(renderIcon(Codicon.arrowRight));
				const jumpLabel = localize('sessionComparisonView.jumpToTurn', "Go to where {0} made this change", getRunLabel(run));
				jump.setAttribute('aria-label', jumpLabel);
				store.add(this.hoverService.setupDelayedHover(jump, { content: jumpLabel }));
				const open = () => void this.viewService.openParticipant(comparison.id, run.id, { files: section.affectedFiles });
				store.add(dom.addDisposableListener(jump, dom.EventType.CLICK, event => {
					dom.EventHelper.stop(event, true);
					open();
				}));
				store.add(dom.addDisposableListener(jump, dom.EventType.KEY_DOWN, event => {
					const keyboardEvent = new StandardKeyboardEvent(event);
					if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
						dom.EventHelper.stop(event, true);
						open();
					}
				}));
			}
		}
		const row = dom.append(group, dom.$('.session-comparison-option.session-comparison-option-decide'));
		addRadio(row, undefined, radio => {
			dom.append(radio, dom.$('span.session-comparison-option-text')).textContent = localize('sessionComparisonView.decideWhileCombining', "Let the combined version decide");
		});
		updateChecked();
		this.resultsFocusTarget ??= radios.find(radio => radio.participantId === picks.get(section.id))?.element;
	}

	private renderModelChip(participant: ISessionComparisonParticipant, store: DisposableStore): HTMLElement {
		const chip = dom.$('span.session-comparison-model');
		dom.append(chip, dom.$('span.session-comparison-model-name')).textContent = getRunLabel(participant);
		const modelId = participant.harness.modelId;
		if (!modelId) {
			return chip;
		}
		const addIcon = () => {
			const model = this.languageModelsService.lookupLanguageModel(modelId);
			if (model) {
				chip.prepend(renderIcon(getCompactModelPickerIcon({ identifier: modelId, metadata: model })));
			}
			return !!model;
		};
		// Models register after startup; a comparison restored before then gets its icon when they do.
		if (!addIcon()) {
			const listener = store.add(new MutableDisposable());
			listener.value = this.languageModelsService.onDidChangeLanguageModels(() => {
				if (addIcon()) {
					listener.clear();
				}
			});
		}
		return chip;
	}

	private renderMarkdown(container: HTMLElement, value: string, store: DisposableStore): void {
		container.classList.add('session-comparison-markdown');
		store.add(this.markdownRenderer.render(new MarkdownString(value), undefined, container));
	}

	private openParticipant(comparison: ISessionComparison | undefined, participantId: string): void {
		if (comparison) {
			void this.viewService.openParticipant(comparison.id, participantId);
		}
	}

	getParticipantStatus(comparison: ISessionComparison, participant: ISessionComparisonParticipant, reader: IReader): SessionComparisonRunStatus {
		return getParticipantStatus(comparison, participant, resource => this.managementService.getSession(resource), reader);
	}

	getPillContext(comparison: ISessionComparison, participant: ISessionComparisonParticipant, runStatus: SessionComparisonRunStatus, reader: IReader, labels: { readonly title: string; readonly role: string }): ISessionComparisonRunPillContext {
		const session = participant.sessionResource ? this.managementService.getSession(participant.sessionResource) : undefined;
		return getPillContext(participant, session, runStatus, reader, labels);
	}
}

/** Where a participant is in its lifecycle, derived from its launch record and its session's status. */
export function getParticipantStatus(comparison: ISessionComparison, participant: ISessionComparisonParticipant, getSession: (resource: URI) => ISession | undefined, reader: IReader): SessionComparisonRunStatus {
	if (participant.launchError && !participant.missingSession) {
		return SessionComparisonRunStatus.Failed;
	}
	if (!participant.sessionResource) {
		return comparison.launching || participant.role !== SessionComparisonParticipantRole.Attempt ? SessionComparisonRunStatus.Starting : SessionComparisonRunStatus.Failed;
	}
	const session = getSession(participant.sessionResource);
	if (!session) {
		return participant.missingSession ? SessionComparisonRunStatus.Failed : SessionComparisonRunStatus.Starting;
	}
	switch (session.status.read(reader)) {
		case SessionStatus.InProgress:
			return SessionComparisonRunStatus.Running;
		case SessionStatus.NeedsInput:
			return SessionComparisonRunStatus.NeedsInput;
		case SessionStatus.Completed:
			return SessionComparisonRunStatus.Completed;
		case SessionStatus.Error:
			return SessionComparisonRunStatus.Failed;
		default:
			return SessionComparisonRunStatus.Starting;
	}
}

function getPillContext(participant: ISessionComparisonParticipant, session: ISession | undefined, runStatus: SessionComparisonRunStatus, reader: IReader, labels: { readonly title: string; readonly role: string }): ISessionComparisonRunPillContext {
	const description = session?.description.read(reader);
	const activity = description ? renderAsPlaintext(description, { omitMarkdownSyntax: true }).trim() : undefined;
	const startedAt = session?.createdAt.getTime();
	const lastTurnEnd = session?.lastTurnEnd.read(reader)?.getTime();
	const duration = isTerminal(runStatus) && startedAt !== undefined
		? participant.completion?.elapsedMs ?? (lastTurnEnd !== undefined && lastTurnEnd >= startedAt ? lastTurnEnd - startedAt : undefined)
		: undefined;
	return {
		chatResource: session?.resource.toString() ?? `comparison-participant:${participant.id}`,
		isChatAvailable: !!session,
		title: labels.title,
		role: labels.role,
		runStatus,
		isActive: !isTerminal(runStatus),
		startedAt: runStatus === SessionComparisonRunStatus.Starting ? undefined : startedAt,
		duration,
		activeToolLabel: runStatus === SessionComparisonRunStatus.Running || runStatus === SessionComparisonRunStatus.NeedsInput ? activity || undefined : undefined,
	};
}

/**
 * Hosts one participant pill in the subagent toolbar markup, so it inherits the
 * native pill styling, and keeps the same pill across updates.
 */
class ParticipantPill extends Disposable {

	readonly domNode: HTMLElement;
	private readonly actionBar: ActionBar;
	private readonly action: IAction;
	private participantId: string | undefined;

	constructor(container: HTMLElement, instantiationService: IInstantiationService, open: (participantId: string) => void) {
		super();
		this.domNode = dom.append(container, dom.$('.chat-subagent-open-chat-toolbar.session-comparison-pill'));
		this.domNode.hidden = true;
		this.action = toAction({
			id: OPEN_RUN_ACTION_ID,
			label: localize('sessionComparisonView.openRun', "Open Session"),
			run: () => {
				if (this.participantId) {
					open(this.participantId);
				}
			},
		});
		this.actionBar = this._register(new ActionBar(this.domNode, {
			actionViewItemProvider: (action, options) => {
				if (action.id !== OPEN_RUN_ACTION_ID) {
					return undefined;
				}
				const pill = instantiationService.createInstance(SessionComparisonRunPill, undefined, action, options, false);
				pill.trackEnabled((context, update) => {
					update(context.isChatAvailable !== false);
					return toDisposable(() => { });
				});
				return pill;
			},
		}));
		this.actionBar.push(this.action);
	}

	update(participantId: string, context: ISessionComparisonRunPillContext): void {
		this.participantId = participantId;
		this.domNode.hidden = false;
		this.actionBar.context = context;
	}

	hide(): void {
		this.domNode.hidden = true;
	}

	focus(): boolean {
		if (this.domNode.hidden) {
			return false;
		}
		this.actionBar.focus(0);
		return true;
	}
}

/** One parallel run: its pill, and once reviewed, what it did and how its checks went. */
class RunRow extends Disposable {

	readonly domNode = dom.$('.session-comparison-run');
	private readonly pill: ParticipantPill;

	constructor(
		comparison: IObservable<ISessionComparison | undefined>,
		participantId: string,
		index: number,
		count: number,
		sessionsChanged: IObservable<void>,
		markdownRenderer: IMarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService managementService: ISessionsManagementService,
		@ISessionComparisonViewService viewService: ISessionComparisonViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.domNode.setAttribute('role', 'listitem');
		const pill = this.pill = this._register(new ParticipantPill(this.domNode, instantiationService, id => {
			const current = comparison.read(undefined);
			if (current) {
				void viewService.openParticipant(current.id, id);
			}
		}));
		const facts = dom.append(this.domNode, dom.$('.session-comparison-run-facts'));
		const summary = dom.append(this.domNode, dom.$('.session-comparison-run-summary'));
		const summaryStore = this._register(new MutableDisposable<DisposableStore>());
		let renderedVerdict: ISessionComparisonAttemptVerdict | undefined;
		let renderedSuggested: boolean | undefined;

		this._register(autorun(reader => {
			const current = comparison.read(reader);
			sessionsChanged.read(reader);
			const participant = current?.participants.find(candidate => candidate.id === participantId);
			if (!current || !participant) {
				this.domNode.hidden = true;
				return;
			}
			this.domNode.hidden = false;
			const session = participant.sessionResource ? managementService.getSession(participant.sessionResource) : undefined;
			const runStatus = getParticipantStatus(current, participant, resource => managementService.getSession(resource), reader);
			pill.update(participantId, getPillContext(participant, session, runStatus, reader, {
				title: getRunLabel(participant),
				role: localize('sessionComparisonView.runRole', "Run {0} of {1}", index, count),
			}));

			const suggested = current.verdict?.recommendedParticipantId === participant.id;
			this.domNode.classList.toggle('suggested', suggested);
			this.domNode.classList.toggle('failed', runStatus === SessionComparisonRunStatus.Failed);
			dom.clearNode(facts);
			const factParts: HTMLElement[] = [];
			if (suggested) {
				const badge = dom.$('span.session-comparison-suggested');
				badge.textContent = localize('sessionComparisonView.suggested', "Suggested");
				factParts.push(badge);
			}
			const changes = session?.changesSummary?.read(reader);
			if (changes && changes.files > 0) {
				const diff = dom.$('span.session-comparison-diffstat');
				dom.append(diff, dom.$('span.added')).textContent = `+${changes.additions}`;
				dom.append(diff, dom.$('span.removed')).textContent = `\u2212${changes.deletions}`;
				dom.append(diff, dom.$('span.files')).textContent = changes.files === 1
					? localize('sessionComparisonView.oneFile', "1 file")
					: localize('sessionComparisonView.files', "{0} files", changes.files);
				factParts.push(diff);
			}
			const tokens = participant.completion?.tokenCount;
			if (tokens !== undefined && isTerminal(runStatus)) {
				const tokenLabel = dom.$('span.session-comparison-tokens');
				tokenLabel.textContent = participant.completion?.tokenCountIsComplete === false
					? localize('sessionComparisonView.tokensAtLeast', "at least {0} tokens", formatTokens(tokens))
					: localize('sessionComparisonView.tokens', "{0} tokens", formatTokens(tokens));
				factParts.push(tokenLabel);
			}
			if (runStatus === SessionComparisonRunStatus.Failed && participant.launchError) {
				const error = dom.$('span.session-comparison-run-error');
				error.textContent = participant.launchError;
				factParts.push(error);
			}
			facts.append(...factParts);
			facts.hidden = factParts.length === 0;

			const attemptVerdict = current.verdict?.attempts.find(candidate => candidate.participantId === participant.id);
			if (attemptVerdict === renderedVerdict && suggested === renderedSuggested) {
				return;
			}
			renderedVerdict = attemptVerdict;
			renderedSuggested = suggested;
			const store = summaryStore.value = new DisposableStore();
			dom.clearNode(summary);
			summary.hidden = !attemptVerdict;
			if (!attemptVerdict) {
				return;
			}
			const text = dom.append(summary, dom.$('.session-comparison-run-summary-text.session-comparison-markdown'));
			store.add(markdownRenderer.render(new MarkdownString(nameAttempts(current, attemptVerdict.summary)), undefined, text));
			const checks = dom.append(summary, dom.$('.session-comparison-checks'));
			for (const [label, evidence] of [
				[localize('sessionComparisonView.check.tests', "Tests"), attemptVerdict.validation.tests],
				[localize('sessionComparisonView.check.build', "Build"), attemptVerdict.validation.build],
				[localize('sessionComparisonView.check.lint', "Lint"), attemptVerdict.validation.lint],
				[localize('sessionComparisonView.check.diagnostics', "Problems"), attemptVerdict.validation.diagnostics],
			] as const) {
				const check = renderCheck(label, evidence);
				if (check) {
					checks.appendChild(check);
				}
			}
			for (const issue of attemptVerdict.unresolvedIssues.slice(0, 3)) {
				// Left open, not a failure: an unchecked item beside the checks it did pass.
				const issueElement = dom.append(checks, dom.$('span.session-comparison-check.open'));
				const issueText = toPlainText(nameAttempts(current, issue));
				issueElement.append(renderIcon(Codicon.circleLargeOutline), issueText);
				issueElement.setAttribute('aria-label', localize('sessionComparisonView.leftOpen', "Left open: {0}", issueText));
				store.add(hoverService.setupDelayedHover(issueElement, { content: issueText }));
			}
			if (participant.sessionResource) {
				const jump = dom.append(checks, dom.$('a.session-comparison-run-jump'));
				jump.setAttribute('role', 'button');
				jump.tabIndex = 0;
				jump.textContent = localize('sessionComparisonView.viewFinalTurn', "View Final Turn");
				const comparisonId = current.id;
				const open = () => void viewService.openParticipant(comparisonId, participant.id, {});
				store.add(dom.addDisposableListener(jump, dom.EventType.CLICK, event => {
					dom.EventHelper.stop(event, true);
					open();
				}));
				store.add(dom.addDisposableListener(jump, dom.EventType.KEY_DOWN, event => {
					const keyboardEvent = new StandardKeyboardEvent(event);
					if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
						dom.EventHelper.stop(event, true);
						open();
					}
				}));
			}
			checks.hidden = checks.childElementCount === 0;
		}));
	}

	focus(): boolean {
		return this.pill.focus();
	}
}

function renderCheck(label: string, evidence: SessionComparisonValidationEvidence): HTMLElement | undefined {
	let icon: ThemeIcon;
	let text: string;
	let className: string;
	switch (evidence.state) {
		case SessionComparisonValidationState.Passed:
			icon = Codicon.passFilled;
			text = localize('sessionComparisonView.check.passed', "{0} passed", label);
			className = 'passed';
			break;
		case SessionComparisonValidationState.Failed:
			icon = Codicon.error;
			text = localize('sessionComparisonView.check.failed', "{0} failed", label);
			className = 'failed';
			break;
		case SessionComparisonValidationState.NotRun:
			icon = Codicon.circleLargeOutline;
			text = localize('sessionComparisonView.check.notRun', "{0} not run", label);
			className = 'unknown';
			break;
		case SessionComparisonValidationState.Unknown:
			icon = Codicon.question;
			text = localize('sessionComparisonView.check.unknown', "{0} unknown", label);
			className = 'unknown';
			break;
		default:
			return undefined;
	}
	const check = dom.$(`span.session-comparison-check.${className}`);
	check.append(renderIcon(icon), text);
	return check;
}

function formatTokens(tokens: number): string {
	return tokens >= 1000
		? localize('sessionComparisonView.thousands', "{0}k", (tokens / 1000).toFixed(tokens >= 100_000 ? 0 : 1))
		: String(tokens);
}

function toPlainText(markdown: string): string {
	return renderAsPlaintext(new MarkdownString(markdown), { omitMarkdownSyntax: true });
}

function normalizeInstructions(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function createPlan(sections: readonly ISessionComparisonDecisionSection[], picks: ReadonlyMap<string, string | undefined>, instructions: string | undefined): ISessionComparisonSynthesisPlan {
	return {
		selections: sections.map(section => ({ sectionId: section.id, participantId: picks.get(section.id) })),
		...(instructions ? { instructions } : {}),
	};
}
