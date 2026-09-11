/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/createPullRequest.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonBar, ButtonWithDropdown, IButton } from '../../../../base/browser/ui/button/button.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { toAction } from '../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionPullRequestAgentMergeOptions, ISessionPullRequestCreation, ISessionPullRequestDetails, ISessionPullRequestOptions, SessionPullRequestMergeMethod } from '../common/pullRequestCreation.js';
import { CreatePullRequestAction, CreatePullRequestMergeMode, ICreatePullRequestPreferences } from '../common/createPullRequestPreferences.js';

type AgentMergeRepairAction = Exclude<keyof ISessionPullRequestAgentMergeOptions, 'mergePullRequest'>;
const agentMergePolicies = ['never', 'ifUnchanged', 'always'] as const;

export interface ICreatePullRequestWidgetOptions {
	readonly creation: ISessionPullRequestCreation;
	readonly branchName?: string;
	readonly baseBranchName?: string;
	readonly initialDraft?: boolean;
	readonly sendToChat?: (options: ISessionPullRequestOptions) => Promise<void>;
	readonly preferences?: ICreatePullRequestPreferences;
	readonly onDidChangePreferences?: (change: ICreatePullRequestPreferences) => void;
	readonly onCancel: () => void;
	readonly onCreated: (options: ISessionPullRequestOptions, message: string | void) => void;
	readonly onDidSendToChat?: () => void;
	readonly onDetachedError: (error: Error) => void;
	readonly onLayout?: () => void;
}

export class CreatePullRequestWidget extends Disposable {
	readonly domNode: HTMLElement;
	readonly ready: Promise<void>;

	private readonly repositoryContext: HTMLElement;
	private readonly repository: IconLabel;
	private readonly branches: HTMLElement;
	private readonly baseBranch: IconLabel;
	private readonly sourceBranch: IconLabel;
	private readonly branchesLoading: HTMLElement;
	private readonly titleInput: InputBox;
	private readonly descriptionInput: InputBox;
	private readonly titleLoading: HTMLElement;
	private readonly descriptionLoading: HTMLElement;
	private readonly draftCheckbox: Checkbox;
	private readonly mergeModeRadio: Radio;
	private readonly mergeDescription: HTMLElement;
	private readonly agentMergeOptionsSection: HTMLElement;
	private readonly agentMergeCheckboxes: Record<AgentMergeRepairAction, Checkbox>;
	private readonly agentMergePolicyRadio: Radio;
	private readonly agentMergePolicyDescription: HTMLElement;
	private readonly mergeMethodSection: HTMLElement;
	private readonly mergeMethodRadio: Radio;
	private readonly mergeMethodDescription: HTMLElement;
	private readonly generationStatus: HTMLElement;
	private readonly statusText: HTMLElement;
	private readonly retryButton: Button;
	private readonly error: HTMLElement;
	private readonly cancelButton: IButton;
	private readonly createButton: IButton;
	private readonly scrollable: DomScrollableElement;
	private readonly generation = this._register(new MutableDisposable<CancellationTokenSource>());
	private details: ISessionPullRequestDetails | undefined;
	private mergeModes: CreatePullRequestMergeMode[] = ['manual', 'auto'];
	private preferredMergeMode: CreatePullRequestMergeMode;
	private preferredMergeMethod: SessionPullRequestMergeMethod;
	private primaryAction: CreatePullRequestAction;
	private mergeMode: CreatePullRequestMergeMode = 'manual';
	private mergeMethod: SessionPullRequestMergeMethod = 'SQUASH';
	private agentMergePolicy: ISessionPullRequestAgentMergeOptions['mergePullRequest'] = 'never';
	private agentMergeOptionsEdited = false;
	private loading = true;
	private submitting = false;
	private titleEdited = false;
	private descriptionEdited = false;
	private applyingGeneratedValues = false;

	constructor(
		private readonly options: ICreatePullRequestWidgetOptions,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super();
		this.preferredMergeMode = options.preferences?.mergeMode ?? 'manual';
		this.preferredMergeMethod = options.preferences?.mergeMethod ?? 'SQUASH';
		this.primaryAction = options.sendToChat ? options.preferences?.primaryAction ?? 'create' : 'create';

		const id = generateUuid();
		this.domNode = dom.$('.create-pull-request-widget', {
			role: 'dialog',
			'aria-labelledby': `${id}-heading`,
		});

		const header = dom.append(this.domNode, dom.$('.create-pr-header'));
		const heading = dom.append(header, dom.$('.create-pr-heading'));
		const icon = dom.append(heading, renderIcon(Codicon.gitPullRequestCreate));
		icon.setAttribute('aria-hidden', 'true');
		const headingLabel = this._register(new IconLabel(dom.append(heading, dom.$('h2', { id: `${id}-heading` }))));
		const headingText = localize('createPR.heading', "Create pull request");
		headingLabel.setLabel(headingText, undefined, { title: headingText });
		this.repositoryContext = dom.append(heading, dom.$('.create-pr-repository-context'));
		dom.append(this.repositoryContext, dom.$('span.create-pr-heading-separator', { 'aria-hidden': 'true' }, '\u00b7'));
		this.repository = this._register(new IconLabel(this.repositoryContext));
		this.branches = dom.append(header, dom.$('.create-pr-branches', { role: 'img', dir: 'ltr' }));
		this.baseBranch = this._register(new IconLabel(this.branches));
		dom.append(this.branches, renderIcon(Codicon.arrowLeft)).setAttribute('aria-hidden', 'true');
		this.sourceBranch = this._register(new IconLabel(this.branches));
		this.branchesLoading = dom.append(header, dom.$('.create-pr-branches-loading', undefined, localize('createPR.loadingBranches', "Loading branch information...")));
		this.updateRepository(options.branchName, options.baseBranchName);

		const body = dom.$('.create-pr-body');
		this.scrollable = this._register(new DomScrollableElement(body, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.domNode.appendChild(this.scrollable.getDomNode());

		const loadingIcon = ThemeIcon.modify(Codicon.loading, 'spin');
		const titleField = dom.append(body, dom.$('.create-pr-field'));
		const titleLabel = dom.append(titleField, dom.$('label.create-pr-label.create-pr-field-label', { for: `${id}-title` }, localize('createPR.title', "Title")));
		this.titleLoading = dom.append(titleLabel, renderIcon(loadingIcon));
		this.titleLoading.setAttribute('aria-hidden', 'true');
		this.titleInput = this._register(new InputBox(titleField, undefined, {
			placeholder: localize('createPR.enterTitle', "Summarize your changes"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.titleInput.inputElement.id = `${id}-title`;
		this.titleInput.inputElement.maxLength = 256;
		this.titleInput.inputElement.setAttribute('aria-required', 'true');

		const descriptionField = dom.append(body, dom.$('.create-pr-field.create-pr-description-field'));
		const descriptionLabel = dom.append(descriptionField, dom.$('label.create-pr-label.create-pr-field-label', { for: `${id}-description` }, localize('createPR.description', "Description")));
		this.descriptionLoading = dom.append(descriptionLabel, renderIcon(loadingIcon));
		this.descriptionLoading.setAttribute('aria-hidden', 'true');
		this.descriptionInput = this._register(new InputBox(descriptionField, undefined, {
			placeholder: localize('createPR.enterDescription', "Describe what changed and how it was tested"),
			flexibleHeight: true,
			flexibleMaxHeight: 180,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.descriptionInput.inputElement.id = `${id}-description`;
		this.descriptionInput.inputElement.maxLength = 65536;

		this.generationStatus = dom.append(body, dom.$('.create-pr-generation'));
		dom.append(this.generationStatus, renderIcon(Codicon.warning)).setAttribute('aria-hidden', 'true');
		this.statusText = dom.append(this.generationStatus, dom.$('span.create-pr-generation-text', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
		this.retryButton = this._register(new Button(this.generationStatus, { ...defaultButtonStyles, secondary: true, small: true }));
		this.retryButton.label = localize('createPR.retry', "Retry");
		this.retryButton.element.hidden = true;
		this._register(this.retryButton.onDidClick(() => this.prepare()));

		const draftRow = dom.append(body, dom.$('.create-pr-draft'));
		this.draftCheckbox = this._register(new Checkbox(localize('createPR.draft', "Create as Draft"), options.initialDraft ?? options.preferences?.draft ?? false, defaultCheckboxStyles));
		draftRow.appendChild(this.draftCheckbox.domNode);
		const draftText = dom.append(draftRow, dom.$('.create-pr-option-text'));
		dom.append(draftText, dom.$('span.create-pr-label', undefined, localize('createPR.draft', "Create as Draft")));
		const draftHint = localize('createPR.draftHint', "Keep the pull request in draft until it is ready for review.");
		dom.append(draftText, dom.$('span', { id: `${id}-draft-hint`, hidden: true }, draftHint));
		this.draftCheckbox.domNode.setAttribute('aria-describedby', `${id}-draft-hint`);
		this._register(hoverService.setupDelayedHoverAtMouse(draftText, { content: draftHint }));
		this._register(dom.addDisposableListener(draftText, dom.EventType.CLICK, () => {
			if (this.draftCheckbox.enabled) {
				this.draftCheckbox.checked = !this.draftCheckbox.checked;
				this.draftCheckbox.focus();
				this.options.onDidChangePreferences?.({ draft: this.draftCheckbox.checked });
				this.updateMergeOptions();
			}
		}));
		this._register(this.draftCheckbox.onChange(() => {
			this.options.onDidChangePreferences?.({ draft: this.draftCheckbox.checked });
			this.updateMergeOptions();
		}));

		const mergeField = dom.append(body, dom.$('.create-pr-field'));
		dom.append(mergeField, dom.$('.create-pr-label', undefined, localize('createPR.afterCreation', "After creation")));
		this.mergeModeRadio = this._register(new Radio({
			items: [],
			ariaLabel: localize('createPR.afterCreation', "After creation"),
		}));
		mergeField.appendChild(this.mergeModeRadio.domNode);
		this.mergeDescription = dom.append(mergeField, dom.$('.create-pr-hint.create-pr-merge-description', { id: `${id}-merge-hint` }));
		this.mergeModeRadio.domNode.setAttribute('aria-describedby', `${id}-merge-hint`);
		this._register(this.mergeModeRadio.onDidSelect(index => {
			this.mergeMode = this.mergeModes[index];
			this.preferredMergeMode = this.mergeMode;
			this.options.onDidChangePreferences?.({ mergeMode: this.preferredMergeMode });
			if (this.mergeMode === 'agent' && this.details?.agentMergeOptions) {
				this.saveAgentMergePreferences();
			}
			this.updateMergeDescription();
		}));

		this.agentMergeOptionsSection = dom.append(body, dom.$('.create-pr-field.create-pr-agent-merge', {
			role: 'group',
			'aria-label': localize('createPR.agentMergeOptions', "Agent Merge configuration for this session"),
		}));
		const repairActions = dom.append(this.agentMergeOptionsSection, dom.$('.create-pr-agent-merge-actions'));
		const createRepairCheckbox = (label: string, description: string): Checkbox => {
			const row = dom.append(repairActions, dom.$('.create-pr-agent-merge-option'));
			const checkbox = this._register(new Checkbox('', false, defaultCheckboxStyles));
			checkbox.domNode.setAttribute('aria-label', label);
			row.appendChild(checkbox.domNode);
			const labelContainer = dom.append(row, dom.$('.create-pr-agent-merge-label'));
			const text = dom.append(labelContainer, dom.$('span.create-pr-agent-merge-label-text', undefined, label));
			const info = dom.append(labelContainer, renderIcon(Codicon.info));
			info.classList.add('create-pr-agent-merge-info');
			info.setAttribute('aria-hidden', 'true');
			const descriptionId = generateUuid();
			dom.append(row, dom.$('span', { id: descriptionId, hidden: true }, description));
			checkbox.domNode.setAttribute('aria-describedby', descriptionId);
			this._register(hoverService.setupDelayedHoverAtMouse(info, { content: description }));
			this._register(dom.addDisposableListener(text, dom.EventType.CLICK, () => {
				if (checkbox.enabled) {
					checkbox.checked = !checkbox.checked;
					checkbox.focus();
					this.saveAgentMergePreferences();
				}
			}));
			this._register(checkbox.onChange(() => this.saveAgentMergePreferences()));
			return checkbox;
		};
		this.agentMergeCheckboxes = {
			addressReviews: createRepairCheckbox(
				localize('createPR.addressReviews', "Address Reviews"),
				localize('createPR.addressReviewsHint', "Agent Merge will automatically ask the agent to address feedback when the pull request has unresolved review comments."),
			),
			fixCI: createRepairCheckbox(
				localize('createPR.fixCI', "Fix CI Failures"),
				localize('createPR.fixCIHint', "Agent Merge will automatically ask the agent to investigate and fix failures when required CI checks fail."),
			),
			resolveConflicts: createRepairCheckbox(
				localize('createPR.resolveConflicts', "Resolve Conflicts and Behind Branches"),
				localize('createPR.resolveConflictsHint', "Agent Merge will automatically ask the agent to update the source branch when it has merge conflicts or falls behind the base branch."),
			),
		};
		dom.append(this.agentMergeOptionsSection, dom.$('.create-pr-label', undefined, localize('createPR.agentMergePolicy', "Merge Pull Request")));
		this.agentMergePolicyRadio = this._register(new Radio({
			ariaLabel: localize('createPR.agentMergePolicy', "Merge Pull Request"),
			items: [
				{ text: localize('createPR.agentMergeNever', "Off"), isActive: true },
				{ text: localize('createPR.agentMergeUnchanged', "If Unchanged") },
				{ text: localize('createPR.agentMergeAlways', "When Ready") },
			],
		}));
		this.agentMergeOptionsSection.appendChild(this.agentMergePolicyRadio.domNode);
		this.agentMergePolicyDescription = dom.append(this.agentMergeOptionsSection, dom.$('.create-pr-hint', { id: `${id}-agent-merge-policy-hint` }));
		this.agentMergePolicyRadio.domNode.setAttribute('aria-describedby', `${id}-agent-merge-policy-hint`);
		this._register(this.agentMergePolicyRadio.onDidSelect(index => {
			this.agentMergePolicy = agentMergePolicies[index];
			this.saveAgentMergePreferences();
			this.updateMergeDescription();
		}));
		if (options.preferences?.agentMergeOptions) {
			this.applyAgentMergeOptions(options.preferences.agentMergeOptions);
			this.agentMergeOptionsEdited = true;
		}

		this.mergeMethodSection = dom.append(body, dom.$('.create-pr-field'));
		dom.append(this.mergeMethodSection, dom.$('.create-pr-label', undefined, localize('createPR.mergeMethod', "Merge method")));
		this.mergeMethodRadio = this._register(new Radio({
			items: [],
			ariaLabel: localize('createPR.mergeMethod', "Merge method"),
		}));
		this.mergeMethodSection.appendChild(this.mergeMethodRadio.domNode);
		this.mergeMethodDescription = dom.append(this.mergeMethodSection, dom.$('.create-pr-hint'));
		this._register(this.mergeMethodRadio.onDidSelect(index => {
			this.mergeMethod = this.details!.mergeMethods[index];
			this.preferredMergeMethod = this.mergeMethod;
			this.options.onDidChangePreferences?.({ mergeMethod: this.preferredMergeMethod });
			this.updateMergeMethodDescription();
		}));

		this.error = dom.append(body, dom.$('.create-pr-error', { role: 'alert' }));
		this.error.hidden = true;

		const footer = dom.append(this.domNode, dom.$('.create-pr-footer'));
		dom.append(footer, dom.$('.create-pr-hint', undefined, localize('createPR.pushHint', "Uncommitted changes will be committed and your branch pushed.")));
		const buttons = this._register(new ButtonBar(dom.append(footer, dom.$('.create-pr-buttons'))));
		this.cancelButton = buttons.addButton({ ...defaultButtonStyles, secondary: true });
		this.cancelButton.label = localize('createPR.cancel', "Cancel");
		this.createButton = options.sendToChat ? buttons.addButtonWithDropdown({
			...defaultButtonStyles,
			supportIcons: true,
			contextMenuProvider: contextMenuService,
			addPrimaryActionToDropdown: false,
			actions: {
				getActions: () => (['create', 'sendToChat'] as const).map(action => toAction({
					id: `sessions.createPullRequest.${action}`,
					label: this.actionLabel(action),
					checked: this.primaryAction === action,
					enabled: this.createButton.enabled,
					run: () => this.submit(action),
				})),
			},
		}) : buttons.addButton({ ...defaultButtonStyles, supportIcons: true });
		const primaryButton = this.createButton instanceof ButtonWithDropdown ? this.createButton.primaryButton : this.createButton;
		primaryButton.element.classList.add('create-pr-submit');
		if (this.createButton instanceof ButtonWithDropdown) {
			this.createButton.dropdownButton.setAriaLabel(localize('createPR.actions', "Pull Request Actions"));
		}
		this._register(this.cancelButton.onDidClick(() => options.onCancel()));
		this._register(this.createButton.onDidClick(() => this.submit()));
		this._register(this.titleInput.onDidChange(() => {
			if (!this.applyingGeneratedValues) {
				this.titleEdited = true;
			}
			this.updateSubmitButton();
		}));
		this._register(this.descriptionInput.onDidChange(() => {
			if (!this.applyingGeneratedValues) {
				this.descriptionEdited = true;
			}
		}));
		this._register(this.descriptionInput.onDidHeightChange(() => this.relayout()));
		// Capture before child buttons consume Escape and blur themselves.
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => this.onKeyDown(event), true));
		this.updateMergeOptions();
		this.ready = this.prepare();
	}

	get isSubmitting(): boolean { return this.submitting; }

	focus(): void {
		this.titleInput.focus();
	}

	layout(): void {
		this.scrollable.scanDomNode();
	}

	private relayout(): void {
		this.layout();
		this.options.onLayout?.();
	}

	private updateRepository(branchName?: string, baseBranchName?: string, repository?: string): void {
		this.repository.setLabel(repository ?? '', undefined, {
			title: repository,
			extraClasses: ['create-pr-repository'],
		});
		this.repositoryContext.hidden = !repository;
		const hasBranches = !!branchName && !!baseBranchName;
		this.branches.hidden = !hasBranches;
		this.branchesLoading.hidden = hasBranches;
		const createsBranch = hasBranches && branchName === baseBranchName;
		const branchDescription = createsBranch
			? localize('createPR.newBranch', "A new branch will be created from {0}", baseBranchName)
			: localize('createPR.branchDirection', "Merge source branch {0} into base branch {1}", branchName ?? '', baseBranchName ?? '');
		this.branches.setAttribute('aria-label', branchDescription);
		this.baseBranch.setLabel(baseBranchName ?? '', undefined, {
			title: localize('createPR.baseBranch', "Base branch: {0}", baseBranchName ?? ''),
			extraClasses: ['create-pr-base-branch'],
		});
		this.sourceBranch.setLabel(createsBranch ? localize('createPR.newBranchLabel', "New branch") : branchName ?? '', undefined, {
			title: createsBranch ? branchDescription : localize('createPR.sourceBranch', "Source branch: {0}", branchName ?? ''),
			extraClasses: ['create-pr-source-branch'],
		});
	}

	private async prepare(): Promise<void> {
		this.generation.value?.cancel();
		const cancellation = new CancellationTokenSource();
		this.generation.value = cancellation;
		this.loading = true;
		this.setGenerationError(undefined);
		this.updateLoadingState();
		this.updateSubmitButton();
		this.updateMergeOptions();
		if (this.domNode.isConnected) {
			status(localize('createPR.generating', "Generating pull request title and description."));
		}

		try {
			const details = await this.options.creation.prepare(cancellation.token);
			if (this._store.isDisposed || cancellation.token.isCancellationRequested) {
				return;
			}
			this.details = details;
			if (details.agentMergeOptions && !this.agentMergeOptionsEdited) {
				this.applyAgentMergeOptions(details.agentMergeOptions);
			}
			this.applyingGeneratedValues = true;
			try {
				if (!this.titleEdited) {
					this.titleInput.value = details.title;
				}
				if (!this.descriptionEdited) {
					this.descriptionInput.value = details.description;
				}
			} finally {
				this.applyingGeneratedValues = false;
			}
			this.updateRepository(details.branchName, details.baseBranchName, details.repository);
			const generationFailed = details.generationError !== undefined;
			this.setGenerationError(generationFailed
				? details.generationError
					? localize('createPR.generationFailed', "Could not generate details: {0} Enter your own or retry.", details.generationError)
					: localize('createPR.generationFailedWithoutMessage', "Could not generate details. Enter your own or retry.")
				: undefined);
			if (!generationFailed && this.domNode.isConnected) {
				status(localize('createPR.detailsReady', "Pull request details are ready."));
			}
		} catch (error) {
			if (this._store.isDisposed || cancellation.token.isCancellationRequested) {
				return;
			}
			this.setGenerationError(localize('createPR.prepareFailed', "Could not load pull request details: {0} Enter your own or retry.", toErrorMessage(error)));
		} finally {
			if (!this._store.isDisposed && !cancellation.token.isCancellationRequested) {
				this.loading = false;
				this.updateLoadingState();
				this.updateSubmitButton();
				this.updateMergeOptions();
				this.relayout();
			}
		}
	}

	private updateLoadingState(): void {
		this.titleLoading.hidden = !this.loading;
		this.descriptionLoading.hidden = !this.loading;
		this.titleInput.inputElement.setAttribute('aria-busy', String(this.loading));
		this.descriptionInput.inputElement.setAttribute('aria-busy', String(this.loading));
	}

	private setGenerationError(message: string | undefined): void {
		if (message === undefined && this.retryButton.hasFocus()) {
			this.titleInput.focus();
		}
		this.generationStatus.hidden = message === undefined;
		this.retryButton.element.hidden = message === undefined;
		this.statusText.textContent = message ?? '';
	}

	private updateMergeOptions(): void {
		const autoMergeAllowed = this.details?.autoMergeAllowed && !this.draftCheckbox.checked && this.details.mergeMethods.length > 0;
		this.mergeMode = this.preferredMergeMode;
		if ((this.mergeMode === 'auto' && !autoMergeAllowed) || (this.mergeMode === 'agent' && !this.details?.agentMergeAvailable)) {
			this.mergeMode = 'manual';
		}
		this.mergeModes = this.details?.agentMergeAvailable ? ['manual', 'agent', 'auto'] : ['manual', 'auto'];
		const labels: Record<CreatePullRequestMergeMode, string> = {
			manual: localize('createPR.manual', "Merge Manually"),
			agent: localize('createPR.agentMerge', "Agent Merge"),
			auto: localize('createPR.autoMerge', "Auto-Merge"),
		};
		this.mergeModeRadio.setItems(this.mergeModes.map(mode => ({
			text: labels[mode],
			ariaLabel: labels[mode],
			isActive: this.mergeMode === mode,
			disabled: this.loading || this.submitting || (mode === 'auto' && !autoMergeAllowed),
			tooltip: mode === 'auto' && !autoMergeAllowed
				? this.draftCheckbox.checked
					? localize('createPR.autoMergeDraft', "Mark the pull request ready before enabling GitHub auto-merge.")
					: localize('createPR.autoMergeUnavailable', "GitHub auto-merge is not available for this repository or session.")
				: labels[mode],
		})));
		const mergeMethods = this.details?.mergeMethods ?? [];
		this.mergeMethod = this.preferredMergeMethod;
		if (mergeMethods.length > 0 && !mergeMethods.includes(this.mergeMethod)) {
			this.mergeMethod = mergeMethods[0];
		}
		const methodLabels: Record<SessionPullRequestMergeMethod, string> = {
			SQUASH: localize('createPR.squash', "Squash"),
			MERGE: localize('createPR.mergeCommit', "Merge Commit"),
			REBASE: localize('createPR.rebase', "Rebase"),
		};
		this.mergeMethodRadio.setItems(mergeMethods.map(method => ({
			text: methodLabels[method],
			isActive: this.mergeMethod === method,
			disabled: this.loading || this.submitting,
		})));
		this.updateMergeDescription();
	}

	private updateMergeDescription(): void {
		this.mergeMethodSection.hidden = this.mergeMode !== 'auto';
		this.agentMergeOptionsSection.hidden = this.mergeMode !== 'agent' || !this.details?.agentMergeOptions;
		const agentMergeControlsEnabled = !this.agentMergeOptionsSection.hidden && !this.loading && !this.submitting;
		for (const checkbox of Object.values(this.agentMergeCheckboxes)) {
			if (agentMergeControlsEnabled) {
				checkbox.enable();
			} else {
				checkbox.disable();
			}
		}
		this.agentMergePolicyRadio.setEnabled(agentMergeControlsEnabled);
		this.mergeDescription.textContent = this.mergeMode === 'agent'
			? this.details?.agentMergeOptions
				? localize('createPR.agentSessionHint', "Applied to this session on submission. Your choices are remembered for future pull requests. Additional agent usage may apply.")
				: localize('createPR.agentConfigurationUnavailable', "Uses the session's existing Agent Merge settings. Update the agent host to configure them here.")
			: this.mergeMode === 'auto'
				? localize('createPR.autoHint', "GitHub merges when required checks and approvals pass. It does not fix failing checks or address reviews.")
				: localize('createPR.manualHint', "You decide when to merge. No automatic fixes or merging.");
		const policyDescription = this.agentMergePolicy === 'never'
			? localize('createPR.agentMergeNeverHint', "Leave the pull request open for you to merge.")
			: this.agentMergePolicy === 'ifUnchanged'
				? localize('createPR.agentMergeUnchangedHint', "Merge only if Agent Merge made no changes. A repair commit switches merging off.")
				: localize('createPR.agentMergeAlwaysHint', "Merge when required checks and approvals pass.");
		this.agentMergePolicyDescription.textContent = this.draftCheckbox.checked && this.agentMergePolicy !== 'never'
			? localize('createPR.agentMergeDraftPolicyHint', "{0} Drafts can be marked ready automatically.", policyDescription)
			: policyDescription;
		this.updateMergeMethodDescription();
		this.relayout();
	}

	private updateMergeMethodDescription(): void {
		this.mergeMethodDescription.textContent = this.mergeMethod === 'SQUASH'
			? localize('createPR.squashHint', "Combine all changes into one commit on the base branch.")
			: this.mergeMethod === 'REBASE'
				? localize('createPR.rebaseHint', "Replay each commit on the base branch without a merge commit.")
				: localize('createPR.mergeCommitHint', "Preserve all commits and add a merge commit.");
	}

	private updateSubmitButton(): void {
		this.createButton.enabled = !this.loading && !this.submitting && this.titleInput.value.trim().length > 0;
		const label = this.submitting
			? this.primaryAction === 'sendToChat'
				? localize('createPR.sending', "Sending Message...")
				: localize('createPR.creating', "Creating PR...")
			: this.actionLabel(this.primaryAction);
		this.createButton.label = this.submitting ? `$(loading~spin) ${label}` : label;
		this.createButton.setAriaLabel(label);
	}

	private actionLabel(action: CreatePullRequestAction): string {
		return action === 'sendToChat'
			? localize('createPR.sendToChat', "Send Create PR Message")
			: localize('createPR.create', "Create PR");
	}

	private applyAgentMergeOptions(options: ISessionPullRequestAgentMergeOptions): void {
		for (const action of Object.keys(this.agentMergeCheckboxes) as AgentMergeRepairAction[]) {
			this.agentMergeCheckboxes[action].checked = options[action];
		}
		this.agentMergePolicy = options.mergePullRequest;
		this.agentMergePolicyRadio.setActiveItem(agentMergePolicies.indexOf(this.agentMergePolicy));
	}

	private getAgentMergeOptions(): ISessionPullRequestAgentMergeOptions {
		return {
			addressReviews: this.agentMergeCheckboxes.addressReviews.checked,
			fixCI: this.agentMergeCheckboxes.fixCI.checked,
			resolveConflicts: this.agentMergeCheckboxes.resolveConflicts.checked,
			mergePullRequest: this.agentMergePolicy,
		};
	}

	private saveAgentMergePreferences(): void {
		this.agentMergeOptionsEdited = true;
		this.options.onDidChangePreferences?.({ agentMergeOptions: this.getAgentMergeOptions() });
	}

	private async submit(action = this.primaryAction): Promise<void> {
		const sendToChat = this.options.sendToChat;
		if (this._store.isDisposed || !this.createButton.enabled || (action === 'sendToChat' && !sendToChat)) {
			return;
		}
		this.primaryAction = action;
		this.options.onDidChangePreferences?.({
			...(sendToChat ? { primaryAction: action } : {}),
			draft: this.draftCheckbox.checked,
			mergeMode: this.preferredMergeMode,
			mergeMethod: this.preferredMergeMethod,
			...(this.details?.agentMergeOptions ? { agentMergeOptions: this.getAgentMergeOptions() } : {}),
		});
		const previouslyFocused = dom.getActiveElement();
		const previouslyFocusedRadio = [this.mergeModeRadio, this.mergeMethodRadio].find(radio => radio.domNode.contains(previouslyFocused));
		this.submitting = true;
		this.domNode.setAttribute('aria-busy', 'true');
		this.error.hidden = true;
		this.titleInput.disable();
		this.descriptionInput.disable();
		this.draftCheckbox.disable();
		this.cancelButton.enabled = false;
		this.retryButton.enabled = false;
		this.updateSubmitButton();
		this.updateMergeOptions();
		const focusAfterDisabling = dom.getActiveElement();

		const options: ISessionPullRequestOptions = {
			title: this.titleInput.value.trim(),
			description: this.descriptionInput.value,
			...(this.details?.context ? { expectedContext: this.details.context } : {}),
			draft: this.draftCheckbox.checked,
			agentMerge: this.mergeMode === 'agent',
			...(this.mergeMode === 'agent' && this.details?.agentMergeOptions ? {
				agentMergeOptions: this.getAgentMergeOptions(),
			} : {}),
			...(this.mergeMode === 'auto' ? { autoMergeMethod: this.mergeMethod } : {}),
		};
		let message: string | void = undefined;
		let failed = false;
		try {
			if (action === 'sendToChat' && sendToChat) {
				await sendToChat(options);
			} else {
				message = await this.options.creation.create(options);
			}
		} catch (error) {
			failed = true;
			if (this._store.isDisposed) {
				this.options.onDetachedError(error instanceof Error ? error : new Error(toErrorMessage(error)));
				return;
			}
			this.error.textContent = action === 'sendToChat'
				? localize('createPR.sendFailed', "Could not send the create pull request message: {0}", toErrorMessage(error))
				: localize('createPR.createFailed', "Could not create the pull request: {0}", toErrorMessage(error));
			this.error.hidden = false;
			return;
		} finally {
			if (!this._store.isDisposed) {
				this.submitting = false;
				this.domNode.setAttribute('aria-busy', 'false');
				this.titleInput.enable();
				this.descriptionInput.enable();
				this.draftCheckbox.enable();
				this.cancelButton.enabled = true;
				this.retryButton.enabled = true;
				this.updateSubmitButton();
				this.updateMergeOptions();
				this.relayout();
				if (failed && dom.getActiveElement() === focusAfterDisabling) {
					if (previouslyFocusedRadio) {
						previouslyFocusedRadio.focusActiveItem();
					} else if (dom.isHTMLElement(previouslyFocused) && previouslyFocused.isConnected && this.domNode.contains(previouslyFocused)) {
						previouslyFocused.focus();
					}
				}
			}
		}
		if (action === 'sendToChat') {
			this.options.onDidSendToChat?.();
		} else {
			this.options.onCreated(options, message);
		}
	}

	private onKeyDown(event: KeyboardEvent): void {
		const key = new StandardKeyboardEvent(event);
		if (key.equals(KeyCode.Escape)) {
			dom.EventHelper.stop(event, true);
			if (!this.submitting) {
				this.options.onCancel();
			}
		} else if (key.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
			dom.EventHelper.stop(event, true);
			void this.submit();
		} else if (key.keyCode === KeyCode.Tab) {
			const focusable = [
				this.titleInput.inputElement,
				this.descriptionInput.inputElement,
				this.retryButton.element,
				this.draftCheckbox.domNode,
				...this.mergeModeRadio.optionElements,
				...(this.agentMergeOptionsSection.hidden ? [] : [
					...Object.values(this.agentMergeCheckboxes).map(checkbox => checkbox.domNode),
					...this.agentMergePolicyRadio.optionElements,
				]),
				...(this.mergeMethodSection.hidden ? [] : this.mergeMethodRadio.optionElements),
				this.cancelButton.element,
				...(this.createButton instanceof ButtonWithDropdown
					? [this.createButton.primaryButton.element, this.createButton.dropdownButton.element]
					: [this.createButton.element]),
			].filter(element => !element.hidden && element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true');
			const index = focusable.findIndex(element => element === dom.getActiveElement());
			const next = focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
			if (next) {
				dom.EventHelper.stop(event, true);
				next.focus();
			}
		}
	}

	override dispose(): void {
		this.generation.value?.cancel();
		super.dispose();
	}
}
