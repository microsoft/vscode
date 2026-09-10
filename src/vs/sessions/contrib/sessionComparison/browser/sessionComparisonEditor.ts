/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonEditor.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { SessionComparisonEditorFocusedContext } from '../../../common/contextkeys.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionComparisonFileKey, ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { SessionComparisonEditorInput } from './sessionComparisonEditorInput.js';

export class SessionComparisonEditor extends EditorPane {
	static readonly ID = SessionComparisonEditorInput.EDITOR_ID;

	private _container: HTMLElement | undefined;
	private readonly _inputStore = this._register(new MutableDisposable<IDisposable>());
	private readonly _contentStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _discardPrompted = new Set<string>();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
	) {
		super(SessionComparisonEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = dom.append(parent, dom.$('.session-comparison-editor'));
		this._container.tabIndex = 0;
		this._container.role = 'region';
		const accessibilityHint = this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.SessionComparison);
		this._container.ariaLabel = accessibilityHint
			? localize('sessionComparisonEditor.ariaLabelWithHint', "Implementation attempt comparison. {0}", accessibilityHint)
			: localize('sessionComparisonEditor.ariaLabel', "Implementation attempt comparison");
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this._container));
		SessionComparisonEditorFocusedContext.bindTo(scopedContextKeyService).set(true);
	}

	override async setInput(input: SessionComparisonEditorInput, options: object | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this._container) {
			return;
		}
		this._inputStore.value = autorun(reader => {
			const comparison = this.sessionComparisonService.comparisons.read(reader).find(candidate => candidate.id === input.comparisonId);
			for (const participant of comparison?.participants ?? []) {
				if (participant.sessionResource) {
					const session = this.sessionsManagementService.getSession(participant.sessionResource);
					session?.status.read(reader);
					session?.changesSummary?.read(reader);
					session?.changes.read(reader);
					session?.updatedAt.read(reader);
					session?.workspace.read(reader);
					if (participant.role === SessionComparisonParticipantRole.Synthesis && session?.status.read(reader) === SessionStatus.Completed) {
						this._promptToDiscardOriginals(input.comparisonId);
					}
				}
			}
			this._render(input.comparisonId);
		});
	}

	override clearInput(): void {
		this._inputStore.clear();
		this._contentStore.clear();
		if (this._container) {
			dom.clearNode(this._container);
		}
		super.clearInput();
	}

	override layout(dimension: Dimension): void {
		if (this._container) {
			this._container.style.width = `${dimension.width}px`;
			this._container.style.height = `${dimension.height}px`;
		}
	}

	private _render(comparisonId: string): void {
		if (!this._container) {
			return;
		}
		dom.clearNode(this._container);
		const store = new DisposableStore();
		this._contentStore.value = store;
		const comparison = this.sessionComparisonService.getComparison(comparisonId);
		if (!comparison) {
			dom.append(this._container, dom.$('p.session-comparison-empty')).textContent =
				localize('sessionComparisonEditor.missing', "This comparison is no longer available.");
			return;
		}

		const content = dom.append(this._container, dom.$('.session-comparison-content'));
		dom.append(content, dom.$('h1.session-comparison-title')).textContent = comparison.title;
		dom.append(content, dom.$('p.session-comparison-subtitle')).textContent =
			localize('sessionComparisonEditor.subtitle', "Independent attempts run from the same task and remain in separate worktrees.");

		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const startState = getStartingState(attempts, this.sessionsManagementService);
		const startStateElement = dom.append(content, dom.$(`p.session-comparison-start-state ${startState === 'different' ? 'session-comparison-error' : ''}`));
		startStateElement.textContent = startingStateLabel(startState);
		const grid = dom.append(content, dom.$('.session-comparison-attempts'));
		for (const attempt of attempts) {
			this._renderAttempt(grid, comparison, attempt);
		}
		this._renderChangeComparison(content, attempts);
		this._renderJudge(content, comparison);
		this._renderSynthesis(content, comparison);
	}

	private _renderAttempt(container: HTMLElement, comparison: ISessionComparison, participant: ISessionComparisonParticipant): void {
		const card = dom.append(container, dom.$('.session-comparison-attempt'));
		const heading = dom.append(card, dom.$('h2.session-comparison-attempt-title'));
		heading.textContent = participant.harness.label;

		if (participant.launchError) {
			dom.append(card, dom.$('p.session-comparison-error')).textContent =
				localize('sessionComparisonEditor.launchFailed', "Failed to start: {0}", participant.launchError);
			return;
		}

		const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
		const summary = session?.changesSummary?.get();
		const status = session ? sessionStatusLabel(session.status.get()) : localize('sessionComparisonEditor.statusUnknown', "Unknown");
		const evidence = dom.append(card, dom.$('dl.session-comparison-evidence'));
		appendEvidence(evidence, localize('sessionComparisonEditor.status', "Status"), status);
		appendEvidence(
			evidence,
			localize('sessionComparisonEditor.elapsed', "Elapsed"),
			session ? formatDuration(Math.max(0, session.updatedAt.get().getTime() - session.createdAt.getTime())) : localize('sessionComparisonEditor.unknown', "Unknown"),
		);
		appendEvidence(evidence, localize('sessionComparisonEditor.usage', "Usage"), localize('sessionComparisonEditor.unknown', "Unknown"));
		appendEvidence(
			evidence,
			localize('sessionComparisonEditor.changedFiles', "Changed files"),
			summary ? localize('sessionComparisonEditor.changedFilesValue', "{0} files, +{1}, -{2}", summary.files, summary.additions, summary.deletions) : localize('sessionComparisonEditor.unknown', "Unknown"),
		);
		const verdict = comparison.verdict?.attempts.find(candidate => candidate.participantId === participant.id);
		appendEvidence(evidence, localize('sessionComparisonEditor.tests', "Tests"), validationLabel(verdict?.validation.tests));
		appendEvidence(evidence, localize('sessionComparisonEditor.build', "Build"), validationLabel(verdict?.validation.build));
		appendEvidence(evidence, localize('sessionComparisonEditor.lint', "Lint"), validationLabel(verdict?.validation.lint));
		appendEvidence(evidence, localize('sessionComparisonEditor.diagnostics', "Diagnostics"), validationLabel(verdict?.validation.diagnostics));

		if (verdict?.summary) {
			dom.append(card, dom.$('p.session-comparison-summary')).textContent = verdict.summary;
		}

		if (participant.sessionResource) {
			const actions = dom.append(card, dom.$('.session-comparison-actions'));
			const useAttempt = this._contentStore.value?.add(new Button(actions, {
				...defaultButtonStyles,
				ariaLabel: localize('sessionComparisonEditor.useAttemptAriaLabel', "Use {0} attempt", participant.harness.label),
			}));
			if (useAttempt) {
				useAttempt.label = comparison.selectedParticipantId === participant.id
					? localize('sessionComparisonEditor.selectedAttempt', "Selected")
					: localize('sessionComparisonEditor.useAttempt', "Use Attempt");
				useAttempt.enabled = comparison.selectedParticipantId !== participant.id;
				this._contentStore.value?.add(useAttempt.onDidClick(async () => {
					this.sessionComparisonService.selectAttempt(comparison.id, participant.id);
					await this.sessionsService.openSession(participant.sessionResource!, { source: 'chat' });
				}));
			}
		}
	}

	private _renderChangeComparison(container: HTMLElement, attempts: readonly ISessionComparisonParticipant[]): void {
		const filesByAttempt = new Map<string, Set<string>>();
		for (const attempt of attempts) {
			const session = attempt.sessionResource ? this.sessionsManagementService.getSession(attempt.sessionResource) : undefined;
			filesByAttempt.set(attempt.id, new Set((session?.changes.get() ?? []).map(change => {
				const resource = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
				return getSessionComparisonFileKey(resource, session?.workspace.get()?.folders ?? []);
			})));
		}
		const counts = new Map<string, number>();
		for (const files of filesByAttempt.values()) {
			for (const file of files) {
				counts.set(file, (counts.get(file) ?? 0) + 1);
			}
		}
		const overlap = [...counts].filter(([, count]) => count > 1).map(([file]) => file).sort();
		const specific = [...counts].filter(([, count]) => count === 1).map(([file]) => file).sort();
		if (overlap.length === 0 && specific.length === 0) {
			return;
		}
		const section = dom.append(container, dom.$('section.session-comparison-section'));
		dom.append(section, dom.$('h2')).textContent = localize('sessionComparisonEditor.changeComparison', "Change Comparison");
		appendFileList(section, localize('sessionComparisonEditor.overlappingFiles', "Overlapping Files"), overlap);
		appendFileList(section, localize('sessionComparisonEditor.attemptSpecificFiles', "Attempt-Specific Files"), specific);
	}

			private _renderJudge(container: HTMLElement, comparison: ISessionComparison): void {
				const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
				const section = dom.append(container, dom.$('section.session-comparison-section'));
				dom.append(section, dom.$('h2')).textContent = localize('sessionComparisonEditor.judge', "Judge");
				if (!judge) {
					dom.append(section, dom.$('p.session-comparison-subtitle')).textContent =
						localize('sessionComparisonEditor.judgeWaiting', "The Judge starts after all attempts finish.");
					return;
				}
				if (judge.launchError) {
					dom.append(section, dom.$('p.session-comparison-error')).textContent = judge.launchError;
					return;
				}
				const judgeSession = judge.sessionResource ? this.sessionsManagementService.getSession(judge.sessionResource) : undefined;
				if (!comparison.verdict) {
					dom.append(section, dom.$('p')).textContent = judgeSession
						? localize('sessionComparisonEditor.judgeStatus', "Status: {0}", sessionStatusLabel(judgeSession.status.get()))
						: localize('sessionComparisonEditor.statusUnknown', "Unknown");
				} else {
					const recommendation = comparison.participants.find(participant => participant.id === comparison.verdict?.recommendedParticipantId);
					dom.append(section, dom.$('p.session-comparison-recommendation')).textContent =
						localize('sessionComparisonEditor.recommendation', "Recommended: {0}", recommendation?.harness.label ?? localize('sessionComparisonEditor.unknown', "Unknown"));
					dom.append(section, dom.$('p')).textContent = comparison.verdict.explanation;
					if (comparison.verdict.conflicts.length > 0) {
						dom.append(section, dom.$('h3')).textContent = localize('sessionComparisonEditor.conflicts', "Conflicts to Resolve");
						const conflicts = dom.append(section, dom.$('ul'));
						for (const conflict of comparison.verdict.conflicts) {
							dom.append(conflicts, dom.$('li')).textContent = conflict;
						}
					}
				}
				if (judge.sessionResource) {
					this._appendOpenSessionButton(section, judge.sessionResource, localize('sessionComparisonEditor.openJudge', "Open Judge"));
				}
			}

			private _renderSynthesis(container: HTMLElement, comparison: ISessionComparison): void {
				const section = dom.append(container, dom.$('section.session-comparison-section'));
				dom.append(section, dom.$('h2')).textContent = localize('sessionComparisonEditor.synthesis', "Synthesis");
				const synthesis = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis);
				if (!synthesis) {
					dom.append(section, dom.$('p.session-comparison-subtitle')).textContent =
						localize('sessionComparisonEditor.synthesisDescription', "Create a new isolated attempt that combines the strongest parts without changing the originals.");
					if (comparison.verdict || comparison.selectedParticipantId) {
						const actions = dom.append(section, dom.$('.session-comparison-actions'));
						const button = this._contentStore.value?.add(new Button(actions, {
							...defaultButtonStyles,
							ariaLabel: localize('sessionComparisonEditor.synthesizeAriaLabel', "Synthesize a new attempt"),
						}));
						if (button) {
							button.label = localize('sessionComparisonEditor.synthesize', "Synthesize");
							this._contentStore.value?.add(button.onDidClick(async () => {
								button.enabled = false;
								try {
									await this.sessionComparisonService.synthesize(comparison.id);
								} catch (error) {
									this.notificationService.error(error);
									button.enabled = true;
								}
							}));
						}
					}
					return;
				}
				if (synthesis.launchError) {
					dom.append(section, dom.$('p.session-comparison-error')).textContent = synthesis.launchError;
					return;
				}
				if (!synthesis.sessionResource) {
					return;
				}
				const synthesisSession = this.sessionsManagementService.getSession(synthesis.sessionResource);
				dom.append(section, dom.$('p')).textContent = synthesisSession
					? localize('sessionComparisonEditor.synthesisStatus', "Status: {0}", sessionStatusLabel(synthesisSession.status.get()))
					: localize('sessionComparisonEditor.statusUnknown', "Unknown");
				this._appendOpenSessionButton(section, synthesis.sessionResource, localize('sessionComparisonEditor.openSynthesis', "Open Synthesis"));
				if (synthesisSession?.status.get() === SessionStatus.Completed) {
					const actions = dom.append(section, dom.$('.session-comparison-actions'));
					const discard = this._contentStore.value?.add(new Button(actions, {
						...defaultButtonStyles,
						ariaLabel: localize('sessionComparisonEditor.discardOriginalsAriaLabel', "Discard original attempts"),
					}));
					if (discard) {
						discard.label = localize('sessionComparisonEditor.discardOriginals', "Discard Original Attempts");
						this._contentStore.value?.add(discard.onDidClick(async () => {
							const confirmation = await this.dialogService.confirm({
								message: localize('sessionComparisonEditor.confirmDiscard', "Discard the original implementation attempts?"),
								detail: localize('sessionComparisonEditor.confirmDiscardDetail', "This deletes their sessions and isolated worktrees. The synthesis and Judge are kept."),
								primaryButton: localize('sessionComparisonEditor.confirmDiscardButton', "Discard Attempts"),
							});
							if (!confirmation.confirmed) {
								return;
							}
							const failures = await this.sessionComparisonService.discardOriginalAttempts(comparison.id);
							if (failures.length > 0) {
								this.notificationService.notify({
									severity: Severity.Error,
									message: localize('sessionComparisonEditor.discardFailures', "Some original attempts could not be discarded: {0}", failures.join('; ')),
								});
							}
						}));
					}
				}
			}

			private _appendOpenSessionButton(container: HTMLElement, resource: NonNullable<ISessionComparisonParticipant['sessionResource']>, label: string): void {
				const actions = dom.append(container, dom.$('.session-comparison-actions'));
				const button = this._contentStore.value?.add(new Button(actions, {
					...defaultButtonStyles,
					ariaLabel: label,
				}));
				if (button) {
					button.label = label;
					this._contentStore.value?.add(button.onDidClick(() => this.sessionsService.openSession(resource, { source: 'chat' })));
				}
	}

	private _promptToDiscardOriginals(comparisonId: string): void {
		if (this._discardPrompted.has(comparisonId)) {
			return;
		}
		this._discardPrompted.add(comparisonId);
		void this.dialogService.confirm({
			message: localize('sessionComparisonEditor.synthesisComplete', "Synthesis completed. Discard the original implementation attempts?"),
			detail: localize('sessionComparisonEditor.synthesisCompleteDetail', "Discarding deletes the original attempt sessions and their isolated worktrees. The synthesis and Judge are kept."),
			primaryButton: localize('sessionComparisonEditor.confirmDiscardButton', "Discard Attempts"),
		}).then(async confirmation => {
			if (!confirmation.confirmed) {
				return;
			}
			const failures = await this.sessionComparisonService.discardOriginalAttempts(comparisonId);
			if (failures.length > 0) {
				this.notificationService.error(localize('sessionComparisonEditor.discardFailures', "Some original attempts could not be discarded: {0}", failures.join('; ')));
			}
		});
	}
}

function appendEvidence(container: HTMLElement, label: string, value: string): void {
	dom.append(container, dom.$('dt')).textContent = label;
	dom.append(container, dom.$('dd')).textContent = value;
}

function appendFileList(container: HTMLElement, title: string, files: readonly string[]): void {
	dom.append(container, dom.$('h3')).textContent = title;
	if (files.length === 0) {
		dom.append(container, dom.$('p.session-comparison-subtitle')).textContent = localize('sessionComparisonEditor.noFiles', "None");
		return;
	}
	const list = dom.append(container, dom.$('ul.session-comparison-file-list'));
	for (const file of files) {
		dom.append(list, dom.$('li')).textContent = file;
	}
}

function getStartingState(attempts: readonly ISessionComparisonParticipant[], sessionsManagementService: ISessionsManagementService): 'same' | 'different' | 'unknown' {
	const states = attempts.map(attempt => {
		const session = attempt.sessionResource ? sessionsManagementService.getSession(attempt.sessionResource) : undefined;
		const repository = session?.workspace.get()?.folders[0]?.gitRepository;
		return repository?.baseBranchName
			? `${repository.uri.toString()}\0${repository.baseBranchName}`
			: undefined;
	});
	if (states.some(state => state === undefined)) {
		return 'unknown';
	}
	return new Set(states).size === 1 ? 'same' : 'different';
}

function startingStateLabel(state: 'same' | 'different' | 'unknown'): string {
	switch (state) {
		case 'same':
			return localize('sessionComparisonEditor.startStateSame', "Starting repository state: same source and base branch");
		case 'different':
			return localize('sessionComparisonEditor.startStateDifferent', "Starting repository state: different sources or base branches");
		case 'unknown':
			return localize('sessionComparisonEditor.startStateUnknown', "Starting repository state: unknown because one or more harnesses did not report it");
	}
}

function formatDuration(milliseconds: number): string {
	const seconds = Math.round(milliseconds / 1000);
	if (seconds < 60) {
		return localize('sessionComparisonEditor.durationSeconds', "{0}s", seconds);
	}
	const minutes = Math.floor(seconds / 60);
	return localize('sessionComparisonEditor.durationMinutes', "{0}m {1}s", minutes, seconds % 60);
}

function sessionStatusLabel(status: SessionStatus): string {
	switch (status) {
		case SessionStatus.Untitled:
			return localize('sessionComparisonEditor.statusStarting', "Starting");
		case SessionStatus.InProgress:
			return localize('sessionComparisonEditor.statusInProgress', "In progress");
		case SessionStatus.NeedsInput:
			return localize('sessionComparisonEditor.statusNeedsInput', "Needs input");
		case SessionStatus.Completed:
			return localize('sessionComparisonEditor.statusCompleted', "Completed");
		case SessionStatus.Error:
			return localize('sessionComparisonEditor.statusError', "Error");
	}
}

function validationLabel(state: SessionComparisonValidationState | undefined): string {
	switch (state) {
		case SessionComparisonValidationState.Passed:
			return localize('sessionComparisonEditor.validationPassed', "Passed");
		case SessionComparisonValidationState.Failed:
			return localize('sessionComparisonEditor.validationFailed', "Failed");
		case SessionComparisonValidationState.NotRun:
			return localize('sessionComparisonEditor.validationNotRun', "Not run");
		default:
			return localize('sessionComparisonEditor.validationUnknown', "Unknown");
	}
}
