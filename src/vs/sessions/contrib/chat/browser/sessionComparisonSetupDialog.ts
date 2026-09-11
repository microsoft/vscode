/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonSetupDialog.css';
import * as dom from '../../../../base/browser/dom.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Button, IButton } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
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

export interface ISessionComparisonSetupContext {
	readonly workspace: URI;
	readonly workspaceLabel: string;
	readonly branch?: string;
	readonly attachedContextCount: number;
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

	async show(context: ISessionComparisonSetupContext, initialAttempts: readonly ISessionComparisonAttemptConfiguration[]): Promise<readonly ISessionComparisonAttemptConfiguration[] | undefined> {
		const disposables = new DisposableStore();
		this.activeDialog.value = disposables;
		const rowsDisposables = disposables.add(new DisposableStore());
		let attempts = [...initialAttempts];
		let body: HTMLElement | undefined;
		let confirmButton: IButton | undefined;
		let validationElement: HTMLElement | undefined;

		const getHarnesses = (): readonly ISessionComparisonHarness[] => this.sessionsManagementService.getSessionTypesForFolder(context.workspace)
			.filter(({ sessionType }) => sessionType.supportsWorktreeConfiguration)
			.map(({ providerId, sessionType }) => ({
				providerId,
				sessionTypeId: sessionType.id,
				label: sessionType.label,
			}));

		const updateValidation = (): void => {
			const count = attempts.length;
			if (confirmButton) {
				confirmButton.enabled = count >= 2;
				confirmButton.label = count === 1
					? localize('sessionComparisonSetup.useOneAttempt', "Use 1 Attempt")
					: localize('sessionComparisonSetup.useAttempts', "Use {0} Attempts", count);
			}
			if (validationElement) {
				validationElement.hidden = count >= 2;
				validationElement.textContent = count >= 2 ? '' : localize('sessionComparisonSetup.minimumSelection', "Add at least two attempts.");
			}
		};

		const renderRows = (focusAttemptId?: string): void => {
			if (!body) {
				return;
			}
			rowsDisposables.clear();
			dom.clearNode(body);
			validationElement = undefined;

			const description = dom.append(body, dom.$('.session-comparison-setup-description'));
			description.textContent = localize('sessionComparisonSetup.description', "Configure independent attempts. You can repeat an agent, a model, or the same combination.");

			const contextSection = dom.append(body, dom.$('.session-comparison-setup-context'));
			dom.append(contextSection, dom.$('h3.session-comparison-setup-section-title')).textContent = localize('sessionComparisonSetup.sharedContext', "Shared context");
			const contextList = dom.append(contextSection, dom.$('dl.session-comparison-setup-context-list'));
			const appendContext = (label: string, value: string): void => {
				dom.append(contextList, dom.$('dt')).textContent = label;
				dom.append(contextList, dom.$('dd')).textContent = value;
			};
			appendContext(localize('sessionComparisonSetup.repository', "Repository"), context.workspaceLabel);
			appendContext(localize('sessionComparisonSetup.branch', "Branch"), context.branch ?? localize('sessionComparisonSetup.currentBranch', "Current branch"));
			appendContext(localize('sessionComparisonSetup.prompt', "Prompt"), localize('sessionComparisonSetup.currentPrompt', "Current composer prompt"));
			appendContext(
				localize('sessionComparisonSetup.attachedContext', "Attached context"),
				context.attachedContextCount === 0
					? localize('sessionComparisonSetup.noAttachedContext', "None")
					: localize('sessionComparisonSetup.attachedContextCount', "{0} items", context.attachedContextCount),
			);
			appendContext(localize('sessionComparisonSetup.isolation', "Isolation"), localize('sessionComparisonSetup.isolatedWorktrees', "One isolated worktree per attempt"));
			const contextNote = dom.append(contextSection, dom.$('p.session-comparison-setup-context-note'));
			contextNote.textContent = localize('sessionComparisonSetup.contextNote', "The prompt and attached context are frozen when you run the attempts. Every provider receives the same inputs but may interpret them differently.");

			const usage = dom.append(body, dom.$('.session-comparison-setup-usage'));
			usage.textContent = localize(
				'sessionComparisonSetup.usage',
				"{0} implementation attempts will run in isolated worktrees, plus one coordinator and one Judge. Provider usage depends on the selected models. Synthesis starts only when you choose it.",
				attempts.length,
			);

			const rows = dom.append(body, dom.$('.session-comparison-setup-rows'));
			const harnesses = getHarnesses();
			if (harnesses.length === 0) {
				const empty = dom.append(rows, dom.$('.session-comparison-setup-empty'));
				empty.textContent = localize('sessionComparisonSetup.noHarnesses', "No agents that support worktree isolation are available.");
			}

			for (const [index, attempt] of attempts.entries()) {
				const harnessIndex = harnesses.findIndex(harness =>
					harnessKey(harness.providerId, harness.sessionTypeId) === harnessKey(attempt.harness.providerId, attempt.harness.sessionTypeId));
				const selectedHarnessIndex = Math.max(0, harnessIndex);
				let harness = harnesses[selectedHarnessIndex];
				if (!harness) {
					continue;
				}
				if (harnessIndex < 0) {
					status(localize('sessionComparisonSetup.agentReset', "The agent for attempt {0} is no longer available. The first available agent will be used.", index + 1));
					attempts[index] = { id: attempt.id, harness };
				} else {
					harness = attempt.harness;
				}
				const provider = this.sessionsProvidersService.getProvider(harness.providerId);
				const models = provider?.getModelsSnapshotForCreation?.(context.workspace, harness.sessionTypeId).models ?? [];
				if (harness.modelId && !models.some(model => model.identifier === harness.modelId)) {
					harness = { ...harness, modelId: undefined, modelLabel: undefined };
					attempts[index] = { id: attempt.id, harness };
					status(localize('sessionComparisonSetup.modelReset', "The selected model for attempt {0} is no longer available. The agent default will be used.", index + 1));
				}

				const row = dom.append(rows, dom.$('.session-comparison-setup-row'));
				row.dataset.attemptId = attempt.id;
				const header = dom.append(row, dom.$('.session-comparison-setup-row-header'));
				dom.append(header, dom.$('.session-comparison-setup-label')).textContent =
					localize('sessionComparisonSetup.attempt', "Attempt {0}", index + 1);
				const removeButton = rowsDisposables.add(new Button(header, {
					...defaultButtonStyles,
					secondary: true,
					ariaLabel: localize('sessionComparisonSetup.removeAttemptAriaLabel', "Remove attempt {0}", index + 1),
				}));
				removeButton.label = localize('sessionComparisonSetup.removeAttempt', "Remove");
				rowsDisposables.add(removeButton.onDidClick(() => {
					attempts = attempts.filter(candidate => candidate.id !== attempt.id);
					renderRows(attempts[Math.min(index, attempts.length - 1)]?.id);
				}));

				const controls = dom.append(row, dom.$('.session-comparison-setup-row-controls'));
				const agentField = dom.append(controls, dom.$('.session-comparison-setup-field'));
				dom.append(agentField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.agent', "Agent");
				const harnessOptions = harnesses.map(candidate => ({
					text: candidate.label,
					detail: this.sessionsProvidersService.getProvider(candidate.providerId)?.label ?? candidate.providerId,
				}));
				const agentSelect = rowsDisposables.add(new SelectBox(
					harnessOptions,
					selectedHarnessIndex,
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: localize('sessionComparisonSetup.agentForAttempt', "Agent for attempt {0}", index + 1),
						optionsAsChildren: true,
					},
				));
				agentSelect.render(agentField);
				dom.append(agentField, dom.$('span.session-comparison-setup-provider')).textContent =
					provider?.label ?? harness.providerId;
				rowsDisposables.add(agentSelect.onDidSelect(({ index: selectedIndex }) => {
					const selectedHarness = harnesses[selectedIndex];
					if (selectedHarness) {
						attempts[index] = { id: attempt.id, harness: selectedHarness };
						renderRows(attempt.id);
					}
				}));

				const modelOptions = [
					{ text: localize('sessionComparisonSetup.defaultModel', "Default") },
					...models.map(model => ({ text: model.metadata.name, detail: model.metadata.detail })),
				];
				const selectedModelIndex = harness.modelId
					? Math.max(0, models.findIndex(model => model.identifier === harness.modelId) + 1)
					: 0;
				const modelField = dom.append(controls, dom.$('.session-comparison-setup-field'));
				dom.append(modelField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.model', "Model");
				const modelSelect = rowsDisposables.add(new SelectBox(
					modelOptions,
					selectedModelIndex,
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: localize('sessionComparisonSetup.modelForAttempt', "Model for attempt {0}", index + 1),
						optionsAsChildren: true,
					},
				));
				modelSelect.render(modelField);
				modelSelect.setEnabled(modelOptions.length > 1);
				rowsDisposables.add(modelSelect.onDidSelect(({ index: selectedIndex }) => {
					const model = selectedIndex === 0 ? undefined : models[selectedIndex - 1];
					attempts[index] = {
						id: attempt.id,
						harness: {
							...harness,
							modelId: model?.identifier,
							modelLabel: model?.metadata.name,
						},
					};
				}));

				if (focusAttemptId === attempt.id) {
					agentSelect.focus();
				}
			}

			const addButton = rowsDisposables.add(new Button(body, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonSetup.addAttemptAriaLabel', "Add another comparison attempt"),
			}));
			addButton.element.classList.add('session-comparison-setup-add');
			addButton.label = localize('sessionComparisonSetup.addAttempt', "Add Attempt");
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

			validationElement = dom.append(body, dom.$('.session-comparison-setup-validation'));
			validationElement.setAttribute('aria-live', 'polite');
			updateValidation();
		};

		try {
			const dialog = disposables.add(new Dialog(
				this.layoutService.activeContainer,
				localize('sessionComparisonSetup.title', "Compare Agents"),
				[
					localize('sessionComparisonSetup.confirm', "Use Attempts"),
					localize('sessionComparisonSetup.singleAgent', "Use Single Agent"),
					localize('sessionComparisonSetup.cancel', "Cancel"),
				],
				{
					cancelId: 2,
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
			if (result.button === 0) {
				return attempts;
			}
			return result.button === 1 ? [] : undefined;
		} finally {
			if (this.activeDialog.value === disposables) {
				this.activeDialog.clear();
			} else {
				disposables.dispose();
			}
		}
	}
}
