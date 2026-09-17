/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { WorkflowEvidence } from '../../../../platform/workflow/common/workflow.js';
import { getWorkflowProgress, getWorkflowProgressDescription, getWorkflowProgressLabel, getWorkflowStatusLabel } from '../../../../platform/workflow/common/workflowProgress.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../browser/labels.js';
import { computeIssueIcon } from '../../../common/chatIssue.js';
import { computePullRequestIcon } from '../../../common/chatPullRequest.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../files/browser/views/explorerView.js';
import { WorkflowRunViewModel } from '../common/workflowRunViewModel.js';
import { getWorkflowProofDocumentUri, workflowProofDocumentScheme } from '../common/workflowProofDocuments.js';
import { IWorkflowAccessibilityService } from './workflowAccessibility.js';
import { WorkflowRevealTurn } from './workflowUIService.js';
import { WorkflowStoppingPointWidget } from './workflowStoppingPointWidget.js';
import { WorkflowInputWidget } from './workflowInputWidget.js';

import './media/workflows.css';

const startConditionEvidenceLabel = localize('workflow.startConditionEvidence', "Before starting (previously checked)");
const startConditionEvidenceHint = localize('workflow.startConditionHistorical', "Historical evidence only. Conditions are checked again before work starts.");

function evidenceStateDescription(evidence: WorkflowEvidence): string | undefined {
	if (evidence.kind === 'pullRequest' && evidence.state) {
		switch (evidence.state) {
			case 'draft': return localize('workflow.evidenceDraft', "Draft pull request at this checkpoint");
			case 'open': return localize('workflow.evidenceOpenPr', "Open pull request at this checkpoint");
			case 'merged': return localize('workflow.evidenceMerged', "Merged pull request at this checkpoint");
			case 'closed': return localize('workflow.evidenceClosedPr', "Closed pull request at this checkpoint");
		}
	}
	if (evidence.kind === 'issue' && evidence.state) {
		return evidence.state === 'open' ? localize('workflow.evidenceOpenIssue', "Open issue at this checkpoint") : localize('workflow.evidenceClosedIssue', "Closed issue at this checkpoint");
	}
	return undefined;
}

export interface WorkflowRunWidgetOptions {
	readonly revealTurn?: WorkflowRevealTurn;
	/** Prepares an independent draft; the caller owns its stopping point and explicit start. */
	readonly createLinkedWorkflow?: (checkpointId: string) => void | Promise<void>;
}

export class WorkflowRunWidget extends Disposable {
	readonly domNode: HTMLElement;
	private readonly content: HTMLElement;
	private readonly rendered = this._register(new DisposableStore());
	private readonly labels: ResourceLabels;
	private readonly scrollable: DomScrollableElement;
	private readonly focusTargets = new Map<string, { focus(): void }>();
	private stoppingPoint: WorkflowStoppingPointWidget | undefined;
	private creatingLinkedWorkflow = false;

	constructor(
		container: HTMLElement,
		readonly viewModel: WorkflowRunViewModel,
		private readonly options: WorkflowRunWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IThemeService themeService: IThemeService,
		@IWorkflowAccessibilityService accessibilityService: IWorkflowAccessibilityService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('.monaco-workflow-run', { role: 'region', 'aria-label': localize('workflow.progressAria', "Workflow checkpoints"), tabindex: '-1' }));
		this.content = dom.$('.workflow-run-content');
		this.scrollable = this._register(new DomScrollableElement(this.content, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		this.domNode.appendChild(this.scrollable.getDomNode());
		this.labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this._register(createFileIconThemableTreeContainerScope(this.domNode, themeService));
		this._register(accessibilityService.register(this.domNode, () => this.getAccessibleContent()));
		this._register(autorun(reader => {
			viewModel.run.read(reader);
			viewModel.expandedCheckpoints.read(reader);
			viewModel.busy.read(reader);
			this.render();
		}));
	}

	layout(dimension: dom.Dimension): void {
		this.domNode.style.height = `${dimension.height}px`;
		this.scrollable.scanDomNode();
	}

	focus(): void {
		const run = this.viewModel.run.get();
		this.focusTargets.get(`checkpoint-${getWorkflowProgress(run).checkpointId}`)?.focus();
	}

	getAccessibleContent(): string {
		const run = this.viewModel.run.get();
		const progress = getWorkflowProgress(run);
		return [
			run.snapshot.label,
			getWorkflowProgressLabel(progress),
			getWorkflowProgressDescription(progress),
			localize('workflow.accessibleStop', "Work until: {0}", run.snapshot.checkpoints.find(checkpoint => checkpoint.id === run.stopAfter)?.label ?? run.stopAfter),
			this.options.createLinkedWorkflow ? localize('workflow.linkedAccessible', "New Linked Workflow prepares an independent workflow from a checkpoint. Choose its stopping point and start it explicitly; it does not inherit this workflow's stopping point.") : '',
			...run.snapshot.checkpoints.map((checkpoint, index) => {
				const receipt = run.receipts.find(candidate => candidate.checkpointId === checkpoint.id);
				const startCondition = run.startConditionReceipts?.find(candidate => candidate.checkpointId === checkpoint.id);
				return [
					localize('workflow.accessibleCheckpoint', "{0}. {1}: {2}", index + 1, checkpoint.label, receipt ? getWorkflowStatusLabel('completed') : checkpoint.id === progress.checkpointId ? getWorkflowStatusLabel(progress.status) : localize('workflow.notStarted', "Not started")),
					checkpoint.instructions,
					...(run.inputRequest?.checkpointId === checkpoint.id ? [localize('workflow.accessibleInputs', "Inputs needed: {0}. Provide them in this checkpoint and activate Continue.", run.inputRequest.keys.map(key => run.snapshot.inputSchema?.properties?.[key]?.title ?? key).join(', '))] : []),
					...(startCondition ? [
						startConditionEvidenceLabel,
						startConditionEvidenceHint,
						...startCondition.evidence.map(evidence => `${evidence.label}: ${evidence.uri}`),
						localize('workflow.startConditionDetails', "Before-start check details"),
						JSON.stringify(startCondition.output, null, 2),
					] : []),
					receipt?.provenance === 'checked' ? localize('workflow.checked', "Checked completion") : receipt ? localize('workflow.reported', "Agent-reported completion") : '',
					...(receipt?.evidence.map(evidence => `${evidence.label}: ${evidence.uri}`) ?? []),
					...(receipt ? [localize('workflow.proofDetails', "Proof details"), JSON.stringify(receipt.proof, null, 2)] : []),
				].join('\n');
			}),
		].filter(Boolean).join('\n\n');
	}

	private render(): void {
		const focused = dom.getActiveElement();
		const inputSelection = focused instanceof dom.getWindow(this.domNode).HTMLInputElement || focused instanceof dom.getWindow(this.domNode).HTMLTextAreaElement
			? { start: focused.selectionStart, end: focused.selectionEnd } : undefined;
		const focusKey = dom.isHTMLElement(focused) && this.domNode.contains(focused) ? focused.closest<HTMLElement>('[data-workflow-focus]')?.dataset.workflowFocus : undefined;
		this.rendered.clear();
		this.stoppingPoint = undefined;
		this.focusTargets.clear();
		dom.clearNode(this.content);
		const run = this.viewModel.run.get();
		const progress = getWorkflowProgress(run);
		const progressLabel = getWorkflowProgressLabel(progress);
		const progressDescription = getWorkflowProgressDescription(progress);
		const header = dom.append(this.content, dom.$('.workflow-run-header'));
		const title = dom.append(header, dom.$('h2.workflow-ellipsis'));
		title.textContent = run.snapshot.label;
		this.rendered.add(this.hoverService.setupDelayedHover(title, { content: run.snapshot.label }));
		const state = dom.append(header, dom.$('span.workflow-secondary.workflow-ellipsis'));
		state.textContent = progressLabel;
		this.rendered.add(this.hoverService.setupDelayedHover(state, { content: `${progressLabel}\n${progressDescription}` }));
		const message = dom.append(this.content, dom.$('.workflow-message', { role: 'status' }));
		this.rendered.add(autorun(reader => {
			const error = this.viewModel.error.read(reader);
			message.hidden = !error && !progress.reason;
			message.textContent = error ?? (progress.reason ? progressDescription : '');
			this.scrollable.scanDomNode();
		}));
		const steps = dom.append(this.content, dom.$('ol.workflow-checkpoints', { 'aria-label': localize('workflow.railAria', "Checkpoint progress") }));
		const rows: HTMLElement[] = [];
		const stopIndex = run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === run.stopAfter);
		for (const [index, checkpoint] of run.snapshot.checkpoints.entries()) {
			const receipt = run.receipts.find(candidate => candidate.checkpointId === checkpoint.id);
			const expanded = !!receipt && this.viewModel.expandedCheckpoints.get().has(checkpoint.id);
			const row = dom.append(steps, dom.$('li.workflow-checkpoint'));
			rows.push(row);
			row.dataset.checkpointId = checkpoint.id;
			row.classList.toggle('expanded', expanded);
			row.classList.toggle('completed', !!receipt);
			row.classList.toggle('current', checkpoint.id === progress.checkpointId);
			row.classList.toggle('within-stop', index <= stopIndex);
			row.classList.toggle('last', index === run.snapshot.checkpoints.length - 1);
			const enclosure = dom.append(row, dom.$('.workflow-checkpoint-enclosure'));
			const checkpointHeader = dom.append(enclosure, dom.$('.workflow-checkpoint-header'));
			const marker = dom.append(checkpointHeader, dom.$('span.workflow-checkpoint-marker', { 'aria-hidden': 'true' }));
			if (receipt) {
				marker.appendChild(renderIcon(Codicon.checkCompact));
			} else {
				marker.textContent = String(index + 1);
			}
			const toggleExpanded = () => this.viewModel.toggleCheckpoint(checkpoint.id);
			const toggle = this.button(checkpointHeader, `checkpoint-${checkpoint.id}`, checkpoint.label, () => {
				if (receipt) {
					toggleExpanded();
				} else {
					this.viewModel.proposeStop(checkpoint.id);
					this.stoppingPoint?.handle.focus();
					this.stoppingPoint?.domNode.scrollIntoView({ block: 'nearest' });
				}
			}, true, true, 'checkpoint');
			toggle.element.classList.add('workflow-checkpoint-title');
			toggle.enabled = !!receipt || this.viewModel.canChangeStop;
			if (receipt) {
				toggle.element.setAttribute('aria-expanded', String(expanded));
			}
			toggle.element.setAttribute('aria-label', localize('workflow.checkpointAria', "{0}, {1}", checkpoint.label, receipt ? getWorkflowStatusLabel('completed') : checkpoint.id === progress.checkpointId ? getWorkflowStatusLabel(progress.status) : localize('workflow.notStarted', "Not started")));
			if (checkpoint.id === progress.checkpointId) {
				toggle.element.setAttribute('aria-description', progressDescription);
			}
			this.rendered.add(dom.addDisposableListener(toggle.element, 'keydown', (event: KeyboardEvent) => {
				const target = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? run.snapshot.checkpoints.length - 1 : undefined;
				if (target !== undefined) {
					event.preventDefault();
					event.stopPropagation();
					const next = run.snapshot.checkpoints[Math.min(run.snapshot.checkpoints.length - 1, Math.max(0, target))];
					this.focusTargets.get(`checkpoint-${next.id}`)?.focus();
				}
			}));
			const rowActions = dom.append(checkpointHeader, dom.$('.workflow-checkpoint-actions'));
			if (this.options.createLinkedWorkflow) {
				const linked = this.rendered.add(new Action(`workflow.linked.${checkpoint.id}`, localize('workflow.newLinked', "New Linked Workflow"), undefined, !this.creatingLinkedWorkflow,
					() => this.runAction(() => this.createLinkedWorkflow(checkpoint.id))));
				const more = this.iconButton(rowActions, `more-${checkpoint.id}`, localize('workflow.checkpointActions', "More Actions for {0}", checkpoint.label), Codicon.ellipsis, () => {
					this.contextMenuService.showContextMenu({ getAnchor: () => more.element, getActions: () => [linked] });
				});
				more.element.classList.add('workflow-secondary-action');
				more.enabled = !this.creatingLinkedWorkflow;
				this.rendered.add(dom.addDisposableListener(checkpointHeader, 'contextmenu', (event: MouseEvent) => {
					event.preventDefault();
					event.stopPropagation();
					this.contextMenuService.showContextMenu({ getAnchor: () => more.element, getActions: () => [linked] });
				}));
			}
			const firstTurn = run.firstTurns[checkpoint.id];
			if (firstTurn && this.options.revealTurn) {
				this.iconButton(rowActions, `chat-${checkpoint.id}`, localize('workflow.showInChatFor', "Show First Chat Turn for {0}", checkpoint.label), Codicon.commentDiscussion,
					() => this.options.revealTurn!(firstTurn)).element.classList.add('workflow-secondary-action', 'workflow-chat-link');
			}
			if (receipt) {
				const expand = this.iconButton(rowActions, `expand-${checkpoint.id}`, expanded ? localize('workflow.collapseProof', "Collapse Proof for {0}", checkpoint.label) : localize('workflow.expandProof', "Expand Proof for {0}", checkpoint.label),
					expanded ? Codicon.chevronDown : Codicon.chevronRight, toggleExpanded);
				expand.element.setAttribute('aria-expanded', String(expanded));
				expand.element.tabIndex = -1;
			}
			if (expanded && receipt) {
				const detail = dom.append(enclosure, dom.$('ul.workflow-checkpoint-proof-list', { 'aria-label': localize('workflow.proofList', "Proof for {0}", checkpoint.label) }));
				const evidence = receipt.evidence.length ? receipt.evidence : [{
					kind: 'file' as const, uri: getWorkflowProofDocumentUri(run, checkpoint.id).toString(), label: localize('workflow.viewProof', "View Proof"),
				}];
				for (const item of evidence) {
					this.renderEvidence(dom.append(detail, dom.$('li')), item, `completion-${checkpoint.id}`);
				}
			}
			if (run.inputRequest?.checkpointId === checkpoint.id) {
				const inputs = this.rendered.add(this.instantiationService.createInstance(WorkflowInputWidget, enclosure, this.viewModel));
				for (const [key, element] of inputs.focusTargets) {
					this.focusTargets.set(key, element);
				}
			}
		}
		this.stoppingPoint = this.rendered.add(this.instantiationService.createInstance(WorkflowStoppingPointWidget, steps, rows, this.content, this.viewModel, () => this.scrollable.scanDomNode()));
		this.focusTargets.set('stop', this.stoppingPoint.handle);
		this.scrollable.scanDomNode();
		if (focusKey) {
			const target = this.focusTargets.get(focusKey) ?? this.focusTargets.get(`checkpoint-${progress.checkpointId}`) ?? this.domNode;
			target.focus();
			if (inputSelection && (target instanceof dom.getWindow(this.domNode).HTMLInputElement || target instanceof dom.getWindow(this.domNode).HTMLTextAreaElement)) {
				target.setSelectionRange(inputSelection.start, inputSelection.end);
			}
		}
	}

	private async createLinkedWorkflow(checkpointId: string): Promise<void> {
		const create = this.options.createLinkedWorkflow;
		if (!create || this.creatingLinkedWorkflow || this._store.isDisposed) {
			return;
		}
		this.creatingLinkedWorkflow = true;
		this.render();
		try {
			await create(checkpointId);
		} finally {
			this.creatingLinkedWorkflow = false;
			if (!this._store.isDisposed) {
				this.render();
			}
		}
	}

	private renderEvidence(container: HTMLElement, evidence: WorkflowEvidence, key: string): void {
		let resource: URI;
		try {
			resource = URI.parse(evidence.uri);
		} catch {
			dom.append(container, dom.$('span.workflow-message')).textContent = localize('workflow.invalidEvidence', "Invalid evidence resource: {0}", evidence.label);
			return;
		}
		const proofDocument = resource.scheme === workflowProofDocumentScheme;
		const evidenceLabel = evidence.kind === 'file' && !proofDocument ? basename(resource) : evidence.label;
		const row = this.button(container, `evidence-${key}-${evidence.uri}`, evidenceLabel, async () => {
			if (evidence.kind === 'file' && ![Schemas.http, Schemas.https, Schemas.command].includes(resource.scheme)) {
				await this.editorService.openEditor({ resource });
			} else if (resource.scheme === Schemas.http || resource.scheme === Schemas.https) {
				await this.openerService.open(resource, { allowCommands: false, fromUserGesture: true });
			} else {
				throw new Error(localize('workflow.unsupportedEvidence', "This proof resource cannot be opened from a workflow."));
			}
		}, true, false, evidence.kind === 'link' ? 'link' : 'label');
		row.element.classList.add('workflow-evidence');
		row.element.setAttribute('role', 'link');
		const stateDescription = evidenceStateDescription(evidence);
		if (stateDescription) {
			row.element.setAttribute('aria-description', stateDescription);
		}
		dom.clearNode(row.element);
		const icon: ThemeIcon | undefined = evidence.kind === 'pullRequest' ? evidence.state ? computePullRequestIcon(evidence.state) : Codicon.gitPullRequest
			: evidence.kind === 'issue' ? evidence.state ? computeIssueIcon(evidence.state, evidence.stateReason) : Codicon.issueOpened
				: evidence.kind === 'file' ? undefined : Codicon.link;
		if (icon?.color) {
			row.element.classList.add('workflow-github-evidence');
			row.element.style.setProperty('--vscode-icon-foreground', asCssVariable(icon.color.id));
		}
		const label = this.rendered.add(this.labels.create(dom.append(row.element, dom.$('.workflow-evidence-label'))));
		if (evidence.kind === 'file' && !proofDocument) {
			label.setFile(resource, { hidePath: true, title: '' });
		} else {
			label.setResource({ resource, name: evidence.label }, { forceLabel: true, icon, title: '' });
		}
		this.rendered.add(this.hoverService.setupDelayedHoverAtMouse(row.element, () => {
			if (proofDocument) {
				return { content: localize('workflow.proofDocumentHint', "Open the accepted proof as a read-only document.") };
			}
			const content = dom.$('.workflow-evidence-hover');
			dom.append(content, dom.$('strong')).textContent = evidenceLabel;
			if (stateDescription) {
				dom.append(content, dom.$('div')).textContent = stateDescription;
			}
			dom.append(content, dom.$('div')).textContent = resource.toString(true);
			return { content };
		}));
	}

	private iconButton(container: HTMLElement, key: string, label: string, icon: ThemeIcon, run: () => void | Promise<unknown>): Button {
		const button = this.button(container, key, label, run, true, true, 'label');
		button.element.classList.add('workflow-icon-button');
		const element = renderIcon(icon);
		element.setAttribute('aria-hidden', 'true');
		button.element.replaceChildren(element);
		return button;
	}

	private async runAction(run: () => void | Promise<unknown>): Promise<void> {
		try {
			await run();
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private button(container: HTMLElement, key: string, label: string, run: () => void | Promise<unknown>, secondary = true, hover = true, appearance: 'default' | 'label' | 'link' | 'checkpoint' = 'default'): Button {
		const styles = appearance === 'default' ? defaultButtonStyles : {
			...defaultButtonStyles,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: appearance === 'checkpoint' ? 'transparent' : 'var(--vscode-toolbar-hoverBackground)',
			buttonSecondaryForeground: appearance === 'checkpoint' ? 'inherit' : appearance === 'link' ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-foreground)',
			buttonSecondaryBorder: 'transparent',
		};
		const button = this.rendered.add(new Button(container, { ...styles, secondary, title: false, ariaLabel: label }));
		button.label = label;
		button.element.dataset.workflowFocus = key;
		this.focusTargets.set(key, button.element);
		this.rendered.add(button.onDidClick(() => this.runAction(run)));
		if (hover) {
			this.rendered.add(this.hoverService.setupDelayedHover(button.element, { content: label }));
		}
		return button;
	}
}
