/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonSetupDialog.css';
import * as dom from '../../../../base/browser/dom.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Button, IButton } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionComparisonAttemptConfiguration, ISessionComparisonHarness } from '../../../services/sessions/common/sessionComparison.js';
import { NEW_SESSION_PROMPT_PLACEHOLDER } from './newChatInput.js';

export interface ISessionComparisonSetupContext {
	readonly workspace: URI;
	readonly workspaceLabel: string;
	readonly branch?: string;
	readonly attachedContextCount: number;
	readonly prompt: string;
	readonly setPrompt: (prompt: string) => void;
}

export interface ISessionComparisonSetupResult {
	readonly confirmed: boolean;
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness: ISessionComparisonHarness;
}

function harnessKey(providerId: string, sessionTypeId: string): string {
	return `${providerId}\0${sessionTypeId}`;
}

export class SessionComparisonSetupDialog extends Disposable {

	private readonly activeDialog = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	async show(context: ISessionComparisonSetupContext, initialAttempts: readonly ISessionComparisonAttemptConfiguration[], initialJudgeHarness: ISessionComparisonHarness): Promise<ISessionComparisonSetupResult> {
		const disposables = new DisposableStore();
		this.activeDialog.value = disposables;
		const rowsDisposables = disposables.add(new DisposableStore());
		let attempts = [...initialAttempts];
		let body: HTMLElement | undefined;
		let confirmButton: IButton | undefined;
		let validationElement: HTMLElement | undefined;
		let prompt = context.prompt;
		let judgeHarness = initialJudgeHarness;
		let evaluationExpanded = false;
		let renderedEvaluation: HTMLDetailsElement | undefined;

		const getHarnesses = (): readonly ISessionComparisonHarness[] => this.sessionsManagementService.getSessionTypesForFolder(context.workspace)
			.filter(({ sessionType }) => sessionType.supportsWorktreeConfiguration)
			.map(({ providerId, sessionType }) => ({
				providerId,
				sessionTypeId: sessionType.id,
				label: sessionType.label,
			}));

		const updateValidation = (): void => {
			const count = attempts.length;
			const hasPrompt = prompt.trim().length > 0;
			const hasWorktreeBase = context.branch !== undefined;
			const hasHarnesses = getHarnesses().length > 0;
			if (confirmButton) {
				confirmButton.enabled = count >= 2 && hasPrompt && hasWorktreeBase && hasHarnesses;
				confirmButton.label = localize('sessionComparisonSetup.runAttemptCount', "Run {0} attempts", count);
			}
			if (validationElement) {
				validationElement.hidden = count >= 2 && hasPrompt && hasWorktreeBase && hasHarnesses;
				validationElement.textContent = !hasWorktreeBase
					? localize('sessionComparisonSetup.gitRepositoryRequired', "Comparisons require a Git repository with at least one commit.")
					: !hasHarnesses
						? localize('sessionComparisonSetup.noAvailableAgents', "No agents that support worktree isolation are available.")
						: count < 2
							? localize('sessionComparisonSetup.minimumSelection', "Add at least two attempts.")
							: hasPrompt ? '' : localize('sessionComparisonSetup.promptRequired', "Enter a prompt to run the attempts.");
			}
		};

		const renderRows = (focusAttemptId?: string): void => {
			if (!body) {
				return;
			}
			evaluationExpanded = renderedEvaluation?.open ?? evaluationExpanded;
			renderedEvaluation = undefined;
			rowsDisposables.clear();
			dom.clearNode(body);
			validationElement = undefined;

			const promptSection = dom.append(body, dom.$('.session-comparison-setup-prompt'));
			const promptHeading = dom.append(promptSection, dom.$('h3.session-comparison-setup-section-title'));
			promptHeading.id = `session-comparison-prompt-${generateUuid()}`;
			promptHeading.textContent = localize('sessionComparisonSetup.prompt', "Prompt");
			promptSection.setAttribute('role', 'group');
			promptSection.setAttribute('aria-labelledby', promptHeading.id);
			const promptInput = rowsDisposables.add(new InputBox(promptSection, this.contextViewService, {
				ariaLabel: localize('sessionComparisonSetup.promptAriaLabel', "Prompt shared by every comparison attempt"),
				placeholder: NEW_SESSION_PROMPT_PLACEHOLDER,
				flexibleHeight: true,
				flexibleMaxHeight: 100,
				inputBoxStyles: defaultInputBoxStyles,
			}));
			promptInput.value = prompt;
			rowsDisposables.add(promptInput.onDidChange(value => {
				prompt = value;
				context.setPrompt(value);
				updateValidation();
			}));
			const contextSummary = dom.append(body, dom.$('.session-comparison-setup-context-summary'));
			dom.append(contextSummary, dom.$('span')).textContent = localize('sessionComparisonSetup.startingFrom', "Starting from");
			dom.append(contextSummary, dom.$('span.session-comparison-setup-context-value')).textContent = context.workspaceLabel;
			if (context.branch !== undefined) {
				const separator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
				separator.setAttribute('aria-hidden', 'true');
				separator.textContent = '·';
				dom.append(contextSummary, dom.$('span.session-comparison-setup-context-value')).textContent = context.branch;
			}
			if (context.attachedContextCount > 0) {
				const separator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
				separator.setAttribute('aria-hidden', 'true');
				separator.textContent = '·';
				dom.append(contextSummary, dom.$('span')).textContent =
					localize('sessionComparisonSetup.attachedContextCount', "{0} context items", context.attachedContextCount);
			}

			const usage = dom.append(body, dom.$('.session-comparison-setup-usage'));
			usage.textContent = localize('sessionComparisonSetup.usage', "Each attempt runs in an isolated worktree. Nothing is applied automatically.");

			const attemptsSection = dom.append(body, dom.$('.session-comparison-setup-attempts'));
			const attemptsHeading = dom.append(attemptsSection, dom.$('h3.session-comparison-setup-section-title'));
			attemptsHeading.id = `session-comparison-attempts-${generateUuid()}`;
			attemptsHeading.textContent =
				localize('sessionComparisonSetup.attempts', "Attempts");
			attemptsSection.setAttribute('role', 'group');
			attemptsSection.setAttribute('aria-labelledby', attemptsHeading.id);
			const rows = dom.$('.session-comparison-setup-rows');
			const rowsScrollable = rowsDisposables.add(new DomScrollableElement(rows, {
				horizontal: ScrollbarVisibility.Hidden,
				vertical: ScrollbarVisibility.Auto,
				useShadows: true,
				consumeMouseWheelIfScrollbarIsNeeded: true,
			}));
			rowsScrollable.getDomNode().classList.add('session-comparison-setup-rows-scroll');
			dom.append(attemptsSection, rowsScrollable.getDomNode());
			const harnesses = getHarnesses();
			if (harnesses.length === 0) {
				const empty = dom.append(rows, dom.$('.session-comparison-setup-empty'));
				empty.textContent = localize('sessionComparisonSetup.noHarnesses', "No agents that support worktree isolation are available.");
			}
			const showProviderLabels = new Set(harnesses.map(harness => harness.providerId)).size > 1;

			const renderHarnessControls = (
				container: HTMLElement,
				selectedHarness: ISessionComparisonHarness,
				agentAriaLabel: string,
				modelAriaLabel: string,
				unavailableAgentMessage: string,
				unavailableModelMessage: string,
				onChange: (harness: ISessionComparisonHarness) => void,
			): SelectBox | undefined => {
				const harnessIndex = harnesses.findIndex(harness =>
					harnessKey(harness.providerId, harness.sessionTypeId) === harnessKey(selectedHarness.providerId, selectedHarness.sessionTypeId));
				const selectedHarnessIndex = Math.max(0, harnessIndex);
				let harness = harnesses[selectedHarnessIndex];
				if (!harness) {
					return undefined;
				}
				if (harnessIndex < 0) {
					status(unavailableAgentMessage);
					onChange(harness);
				} else {
					harness = selectedHarness;
				}
				const provider = this.sessionsProvidersService.getProvider(harness.providerId);
				const models = provider?.getModelsSnapshotForCreation?.(context.workspace, harness.sessionTypeId).models ?? [];
				if (harness.modelId && !models.some(model => model.identifier === harness.modelId)) {
					harness = { ...harness, modelId: undefined, modelLabel: undefined };
					onChange(harness);
					status(unavailableModelMessage);
				}

				const agentField = dom.append(container, dom.$('.session-comparison-setup-field'));
				dom.append(agentField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.agent', "Agent");
				const agentSelect = rowsDisposables.add(new SelectBox(
					harnesses.map(candidate => ({
						text: candidate.label,
						detail: showProviderLabels ? (this.sessionsProvidersService.getProvider(candidate.providerId)?.label ?? candidate.providerId) : undefined,
					})),
					selectedHarnessIndex,
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: agentAriaLabel,
						useCustomDrawn: true,
						contextViewLayer: 1,
					},
				));
				agentSelect.render(dom.append(agentField, dom.$('.session-comparison-setup-select')));
				if (showProviderLabels) {
					dom.append(agentField, dom.$('span.session-comparison-setup-provider')).textContent =
						provider?.label ?? harness.providerId;
				}
				rowsDisposables.add(agentSelect.onDidSelect(({ index }) => {
					const selected = harnesses[index];
					if (selected) {
						onChange(selected);
						renderRows();
					}
				}));

				const modelOptions = [
					{ text: localize('sessionComparisonSetup.defaultModel', "Auto") },
					...models.map(model => ({ text: model.metadata.name, detail: model.metadata.detail })),
				];
				const selectedModelIndex = harness.modelId
					? Math.max(0, models.findIndex(model => model.identifier === harness.modelId) + 1)
					: 0;
				const modelField = dom.append(container, dom.$('.session-comparison-setup-field'));
				dom.append(modelField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.model', "Model");
				const modelSelect = rowsDisposables.add(new SelectBox(
					modelOptions,
					selectedModelIndex,
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: modelAriaLabel,
						useCustomDrawn: true,
						contextViewLayer: 1,
					},
				));
				modelSelect.render(dom.append(modelField, dom.$('.session-comparison-setup-select')));
				modelSelect.setEnabled(modelOptions.length > 1);
				rowsDisposables.add(modelSelect.onDidSelect(({ index }) => {
					const model = index === 0 ? undefined : models[index - 1];
					onChange({
						...harness,
						modelId: model?.identifier,
						modelLabel: model?.metadata.name,
					});
				}));
				return agentSelect;
			};

			for (const [index, attempt] of attempts.entries()) {
				const row = dom.append(rows, dom.$('.session-comparison-setup-row'));
				row.dataset.attemptId = attempt.id;
				const header = dom.append(row, dom.$('.session-comparison-setup-row-header'));
				const attemptLabel = dom.append(header, dom.$('.session-comparison-setup-label'));
				attemptLabel.id = `session-comparison-attempt-${attempt.id}`;
				attemptLabel.textContent =
					localize('sessionComparisonSetup.attempt', "Attempt {0}", index + 1);
				row.setAttribute('role', 'group');
				row.setAttribute('aria-labelledby', attemptLabel.id);
				if (attempts.length > 2) {
					const removeButton = rowsDisposables.add(new Button(header, {
						...defaultButtonStyles,
						secondary: true,
						ariaLabel: localize('sessionComparisonSetup.removeAttemptAriaLabel', "Remove attempt {0}", index + 1),
					}));
					removeButton.element.classList.add('session-comparison-setup-remove');
					removeButton.label = localize('sessionComparisonSetup.removeAttempt', "Remove");
					rowsDisposables.add(removeButton.onDidClick(() => {
						attempts = attempts.filter(candidate => candidate.id !== attempt.id);
						renderRows(attempts[Math.min(index, attempts.length - 1)]?.id);
					}));
				}

				const controls = dom.append(row, dom.$('.session-comparison-setup-row-controls'));
				const agentSelect = renderHarnessControls(
					controls,
					attempt.harness,
					localize('sessionComparisonSetup.agentForAttempt', "Agent for attempt {0}", index + 1),
					localize('sessionComparisonSetup.modelForAttempt', "Model for attempt {0}", index + 1),
					localize('sessionComparisonSetup.agentReset', "The agent for attempt {0} is no longer available. The first available agent will be used.", index + 1),
					localize('sessionComparisonSetup.modelReset', "The selected model for attempt {0} is no longer available. The agent default will be used.", index + 1),
					harness => attempts[index] = { id: attempt.id, harness },
				);

				if (focusAttemptId === attempt.id) {
					agentSelect?.focus();
				}
			}

			rowsScrollable.scanDomNode();

			const addButton = rowsDisposables.add(new Button(attemptsSection, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonSetup.addAttemptAriaLabel', "Add another comparison attempt"),
			}));
			addButton.element.classList.add('session-comparison-setup-add');
			addButton.label = localize('sessionComparisonSetup.addAttempt', "Add attempt");
			addButton.enabled = harnesses.length > 0;
			rowsDisposables.add(addButton.onDidClick(() => {
				const harness = attempts.at(-1)?.harness ?? harnesses[0];
				if (!harness) {
					return;
				}
				const attempt = { id: generateUuid(), harness };
				attempts = [...attempts, attempt];
				renderRows(attempt.id);
			}));

			const evaluation = dom.append(body, dom.$('details.session-comparison-setup-evaluation')) as HTMLDetailsElement;
			renderedEvaluation = evaluation;
			evaluation.open = evaluationExpanded;
			const evaluationSummary = dom.append(evaluation, dom.$('summary.session-comparison-setup-evaluation-summary'));
			dom.append(evaluationSummary, dom.$('span.session-comparison-setup-label')).textContent =
				localize('sessionComparisonSetup.evaluation', "Evaluation");
			const judgeLabel = judgeHarness.modelLabel
				? localize('sessionComparisonSetup.judgeHarnessAndModel', "{0} · {1}", judgeHarness.label, judgeHarness.modelLabel)
				: localize('sessionComparisonSetup.judgeHarnessAuto', "{0} · Auto", judgeHarness.label);
			dom.append(evaluationSummary, dom.$('span.session-comparison-setup-evaluation-value')).textContent = judgeLabel;
			const judgeRow = dom.append(evaluation, dom.$('.session-comparison-setup-judge'));
			judgeRow.setAttribute('role', 'group');
			judgeRow.setAttribute('aria-label', localize('sessionComparisonSetup.judgeConfiguration', "Judge configuration"));
			dom.append(judgeRow, dom.$('.session-comparison-setup-judge-description')).textContent =
				localize('sessionComparisonSetup.judgeDescription', "Reviews the finished attempts and recommends a result.");
			renderHarnessControls(
				dom.append(judgeRow, dom.$('.session-comparison-setup-row-controls')),
				judgeHarness,
				localize('sessionComparisonSetup.agentForJudge', "Agent for the Judge"),
				localize('sessionComparisonSetup.modelForJudge', "Model for the Judge"),
				localize('sessionComparisonSetup.judgeAgentReset', "The Judge agent is no longer available. The first available agent will be used."),
				localize('sessionComparisonSetup.judgeModelReset', "The selected Judge model is no longer available. The agent default will be used."),
				harness => judgeHarness = harness,
			);
			rowsDisposables.add(dom.addDisposableListener(evaluation, 'toggle', () => {
				evaluationExpanded = evaluation.open;
			}));

			validationElement = dom.append(body, dom.$('.session-comparison-setup-validation'));
			validationElement.setAttribute('role', 'status');
			validationElement.setAttribute('aria-live', 'polite');
			updateValidation();
		};

		try {
			const dialog = disposables.add(new Dialog(
				this.layoutService.activeContainer,
				localize('sessionComparisonSetup.title', "Run and Compare Agents"),
				[
					localize('sessionComparisonSetup.confirm', "Run {0} attempts", attempts.length),
					localize('sessionComparisonSetup.cancel', "Cancel"),
				],
				{
					cancelId: 1,
					type: 'none',
					extraClasses: ['session-comparison-setup-dialog'],
					isExternalFocusAllowed: target => !!target.closest('.monaco-select-box-dropdown-container'),
					buttonStyles: defaultButtonStyles,
					checkboxStyles: defaultCheckboxStyles,
					inputBoxStyles: defaultInputBoxStyles,
					dialogStyles: defaultDialogStyles,
					buttonOptions: [{
						styleButton: button => {
							confirmButton = button;
							updateValidation();
						},
					}],
					renderBody: container => {
						body = container;
						body.classList.add('session-comparison-setup-body');
						renderRows();
					},
				},
			));

			for (const provider of this.sessionsProvidersService.getProviders()) {
				disposables.add(provider.onDidChangeModels(() => renderRows()));
			}
			disposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => renderRows()));

			const result = await dialog.show();
			return { confirmed: result.button === 0, attempts, judgeHarness };
		} finally {
			if (this.activeDialog.value === disposables) {
				this.activeDialog.clear();
			} else {
				disposables.dispose();
			}
		}
	}
}
