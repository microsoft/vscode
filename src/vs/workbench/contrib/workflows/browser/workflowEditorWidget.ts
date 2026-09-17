/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDragAndDropData } from '../../../../base/browser/dnd.js';
import { ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../base/browser/ui/list/listView.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../base/common/actions.js';
import { findNodeAtLocation, parseTree } from '../../../../base/common/json.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { WorkflowCheckpoint, WorkflowCheckpointType } from '../../../../platform/workflow/common/workflow.js';
import { getWorkflowCheckpointTypeReference } from '../../../../platform/workflow/common/workflowValidation.js';
import { IWorkflowCatalogService } from '../common/workflowCatalog.js';
import { IWorkflowAccessibilityService } from './workflowAccessibility.js';
import { WorkflowEditorModel } from './workflowEditorModel.js';
import { WorkflowOutlineItem, WorkflowOutlineRenderer } from './workflowOutlineRenderer.js';
import { IWorkflowUIService } from './workflowUIService.js';

import './media/workflows.css';

export class WorkflowEditorWidget extends Disposable {
	readonly domNode: HTMLElement;
	private commitTitle: (() => boolean) | undefined;
	private readonly metadata: HTMLElement;
	private readonly diagnostics: HTMLElement;
	private readonly outline: HTMLElement;
	private readonly detail: HTMLElement;
	private readonly body: HTMLElement;
	private readonly detailStore = this._register(new DisposableStore());
	private readonly contextMenuActions = this._register(new MutableDisposable<DisposableStore>());
	private readonly sourceEditor = this._register(new MutableDisposable<CodeEditorWidget>());
	private readonly list: WorkbenchList<WorkflowOutlineItem>;
	private outlineItems: readonly WorkflowOutlineItem[] = [];
	private readonly listContainer: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly save: Button;
	private readonly revert: Button;
	private readonly add: Button;
	private selectedId = '$workflow';
	private sourcePath: (string | number)[] | undefined;
	private sourceContract: WorkflowCheckpointType | undefined;
	private dimension = new dom.Dimension(800, 600);
	private updatingOutline = false;
	private updatingForm = false;
	private firstDetailInput: HTMLElement | undefined;
	private readonly detailInputs: InputBox[] = [];
	private readonly focusTargets = new Map<string, HTMLElement>();

	constructor(
		container: HTMLElement,
		readonly model: WorkflowEditorModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IWorkflowUIService private readonly uiService: IWorkflowUIService,
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkflowAccessibilityService accessibilityService: IWorkflowAccessibilityService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('.monaco-workflow-editor', { role: 'region', 'aria-label': localize('workflow.editorAria', "Workflow editor"), tabindex: '-1' }));
		const header = dom.append(this.domNode, dom.$('.workflow-editor-header'));
		const identity = dom.append(header, dom.$('.workflow-editor-identity'));
		this.editableTitle(identity, this._store, 'workflow-title', localize('workflow.titleAria', "Workflow title"),
			() => this.model.definition?.label ?? this.model.entry.label, value => this.model.update(['label'], value));
		this.metadata = dom.append(identity, dom.$('.workflow-secondary.workflow-ellipsis'));
		const toolbar = dom.append(header, dom.$('.workflow-actions'));
		this.button(toolbar, this._store, localize('workflow.viewJson', "View JSONC"), () => this.showSource([]));
		this.revert = this.button(toolbar, this._store, localize('workflow.revert', "Revert"), () => this.model.revert());
		this.save = this.button(toolbar, this._store, localize('workflow.save', "Save"), async () => {
			if (this.commitTitle && !this.commitTitle()) {
				return;
			}
			if (!await this.model.save()) {
				throw new Error(localize('workflow.saveFailed', "The workflow was not saved. Check the file's save status before continuing."));
			}
		}, { secondary: false });
		if (model.readOnly) {
			this.button(toolbar, this._store, localize('workflow.editCopy', "Make Editable Copy"), () => this.makeCopy());
		}
		this.body = dom.append(this.domNode, dom.$('.workflow-editor-body'));
		this.outline = dom.append(this.body, dom.$('nav.workflow-editor-outline', { 'aria-label': localize('workflow.outlineAria', "Workflow outline") }));
		this.listContainer = dom.append(this.outline, dom.$('.workflow-outline-list'));
		this.list = this._register(instantiationService.createInstance(WorkbenchList<WorkflowOutlineItem>, 'WorkflowOutline', this.listContainer,
			{ getHeight: () => 40, getTemplateId: () => 'workflow-outline' }, [instantiationService.createInstance(WorkflowOutlineRenderer, () => model.readOnly, () => model.structuredDefinition?.checkpoints.length ?? 0, (id, offset) => this.moveCheckpoint(id, offset))], {
				multipleSelectionSupport: false,
				identityProvider: { getId: item => item.id },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
				accessibilityProvider: { getAriaLabel: item => item.label, getWidgetAriaLabel: () => localize('workflow.outlineAria', "Workflow outline") },
				dnd: {
					getDragURI: item => !model.readOnly && item.step !== undefined ? `workflow-checkpoint:${item.id}` : null,
					getDragLabel: items => items[0]?.label,
					onDragOver: (data, target, _index, sector) => !model.readOnly && !!this.getDraggedCheckpoint(data) && !!target ? {
						accept: true,
						effect: { type: ListDragOverEffectType.Move, position: sector === ListViewTargetSector.BOTTOM || sector === ListViewTargetSector.CENTER_BOTTOM ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before },
					} : false,
					drop: (data, _target, targetIndex, sector) => {
						const source = this.getDraggedCheckpoint(data);
						const definition = model.structuredDefinition;
						if (!source || !definition || model.readOnly) {
							return;
						}
						const sourceIndex = definition.checkpoints.findIndex(checkpoint => checkpoint.id === source.id);
						let position = targetIndex === undefined ? definition.checkpoints.length : Math.max(0, targetIndex - 1 + (sector === ListViewTargetSector.BOTTOM || sector === ListViewTargetSector.CENTER_BOTTOM ? 1 : 0));
						if (sourceIndex < position) {
							position--;
						}
						this.moveCheckpoint(source.id, Math.max(0, position) - sourceIndex);
					},
					dispose: () => { },
				},
			}));
		this._register(dom.addDisposableListener(this.listContainer, 'keydown', (event: KeyboardEvent) => {
			if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
				const item = this.list.getFocusedElements()[0];
				if (item?.step !== undefined) {
					event.preventDefault();
					event.stopPropagation();
					this.moveCheckpoint(item.id, event.key === 'ArrowUp' ? -1 : 1);
				}
			}
		}));
		this._register(this.list.onDidChangeSelection(event => {
			if (!this.updatingOutline && event.elements[0]) {
				this.selectedId = event.elements[0].id;
				this.sourcePath = undefined;
				this.sourceContract = undefined;
				this.sourceEditor.clear();
				this.renderDetail();
			}
		}));
		this._register(this.list.onDidOpen(() => {
			this.domNode.classList.add('show-detail');
			this.layout(this.dimension);
			(this.firstDetailInput ?? this.domNode).focus();
		}));
		this._register(this.list.onContextMenu(event => {
			const item = event.element;
			if (item?.step === undefined) {
				return;
			}
			const actions = this.contextMenuActions.value = new DisposableStore();
			const remove = actions.add(new Action('workflow.checkpoint.remove', localize('workflow.removeCheckpoint', "Remove"), undefined, !this.model.readOnly, async () => this.removeCheckpoint(item.id)));
			this.contextMenuService.showContextMenu({
				getAnchor: () => event.anchor,
				getActions: () => [remove],
				onHide: () => {
					if (this.contextMenuActions.value === actions) {
						this.contextMenuActions.clear();
					}
					this.list.domFocus();
				},
			});
		}));
		const library = dom.append(this.outline, dom.$('.workflow-actions'));
		this.add = this.button(library, this._store, localize('workflow.addCheckpoint', "Add Checkpoint"), () => this.addCheckpoint());
		this.add.element.classList.add('workflow-outline-add');
		const addIcon = renderIcon(Codicon.add);
		addIcon.setAttribute('aria-hidden', 'true');
		this.add.element.prepend(addIcon);
		this.detail = dom.$('.workflow-editor-detail');
		this.scrollable = this._register(new DomScrollableElement(this.detail, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		this.scrollable.getDomNode().classList.add('workflow-detail-scrollable');
		this.body.appendChild(this.scrollable.getDomNode());
		this.diagnostics = dom.append(this.domNode, dom.$('.workflow-editor-diagnostics', { role: 'status' }));
		this._register(accessibilityService.register(this.domNode, () => this.getAccessibleContent()));
		this._register(dom.addDisposableListener(this.domNode, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !this.sourceEditor.value && !this.commitTitle) {
				event.preventDefault();
				event.stopPropagation();
				this.showOutline();
			}
		}, true));
		this._register(model.onDidChange(() => this.refresh()));
		this.refresh();
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		this.domNode.style.height = `${dimension.height}px`;
		this.domNode.classList.toggle('narrow', (this.domNode.clientWidth || dimension.width) < 660);
		this.list.layout(this.listContainer.clientHeight, this.listContainer.clientWidth);
		for (const input of this.detailInputs) {
			input.layout();
		}
		this.sourceEditor.value?.layout({ width: Math.max(0, this.detail.clientWidth - 32), height: Math.max(160, dimension.height - 216) });
		this.scrollable.scanDomNode();
	}

	focus(): void {
		if (this.sourceEditor.value) {
			this.sourceEditor.value.focus();
		} else if (this.domNode.classList.contains('narrow') && this.domNode.classList.contains('show-detail')) {
			(this.firstDetailInput ?? this.domNode).focus();
		} else {
			this.list.domFocus();
		}
	}

	revealCheckpoint(id: string): void {
		const index = this.model.structuredDefinition?.checkpoints.findIndex(checkpoint => checkpoint.id === id) ?? -1;
		if (index >= 0) {
			this.list.setFocus([index + 1]);
			this.list.setSelection([index + 1]);
			this.list.reveal(index + 1);
			this.domNode.classList.add('show-detail');
			this.layout(this.dimension);
		}
	}

	getAccessibleContent(): string {
		const definition = this.model.structuredDefinition;
		return [
			definition?.label ?? this.model.entry.label,
			this.model.entry.source.label ?? this.model.entry.source.id,
			this.model.isDirty ? localize('workflow.unsaved', "Unsaved changes") : localize('workflow.saved', "Saved"),
			localize('workflow.authoringScope', "Edits affect this workflow only. Existing runs keep their saved snapshot."),
			...(definition?.checkpoints.map((checkpoint, index) => `${index + 1}. ${checkpoint.label ?? checkpoint.id}\n${checkpoint.instructions ?? this.getType(checkpoint)?.instructions ?? ''}`) ?? []),
			...this.model.diagnostics.map(diagnostic => diagnostic.message),
		].join('\n\n');
	}

	private refresh(): void {
		const activeElement = dom.getActiveElement();
		const focusKey = dom.isHTMLElement(activeElement) && this.domNode.contains(activeElement) ? activeElement.dataset.workflowEditorFocus : undefined;
		this.metadata.textContent = localize('workflow.editorMetadata', "{0} · {1}", this.model.entry.source.label ?? this.model.entry.source.id, this.model.readOnly ? localize('workflow.readOnly', "Read-only") : this.model.isDirty ? localize('workflow.unsaved', "Unsaved changes") : localize('workflow.saved', "Saved"));
		this.save.enabled = !this.model.readOnly && this.model.isDirty;
		this.revert.enabled = !this.model.readOnly && this.model.isDirty;
		this.add.enabled = !this.model.readOnly && !!this.model.structuredDefinition;
		this.diagnostics.textContent = this.model.diagnostics.map(diagnostic => diagnostic.message).join('\n');
		this.sourceEditor.value?.updateOptions({ readOnly: this.model.readOnly || !!this.sourceContract });
		// Form edits must not replace the focused input or the target of an impending click.
		if (this.updatingForm) {
			return;
		}
		this.updatingOutline = true;
		const model = this.model;
		const getCheckpoint = (id: string) => model.structuredDefinition?.checkpoints.find(checkpoint => checkpoint.id === id);
		const getType = (checkpoint: WorkflowCheckpoint) => this.getType(checkpoint);
		const items: WorkflowOutlineItem[] = [
			{ id: '$workflow', label: localize('workflow.outlineSettings', "Workflow Settings"), description: model.definition?.label ?? model.entry.label, onDidChange: model.onDidChange },
			...(model.structuredDefinition?.checkpoints.map((checkpoint, index) => ({
				id: checkpoint.id,
				get label() {
					const current = getCheckpoint(checkpoint.id) ?? checkpoint;
					return current.label ?? getType(current)?.label ?? current.id;
				},
				step: index + 1,
				get description() {
					const current = getCheckpoint(checkpoint.id) ?? checkpoint;
					return current.afterCompletion?.group ? localize('workflow.moveAfter', "After completion: {0}", current.afterCompletion.group) : getType(current)?.description;
				},
				onDidChange: model.onDidChange,
			})) ?? []),
		];
		this.outlineItems = items;
		this.list.splice(0, this.list.length, items);
		let selected = items.findIndex(item => item.id === this.selectedId);
		if (selected < 0) {
			selected = 0;
			this.selectedId = '$workflow';
		}
		this.list.setSelection([selected]);
		this.updatingOutline = false;
		if (!this.sourceEditor.value) {
			this.renderDetail();
		}
		this.layout(this.dimension);
		if (focusKey) {
			(this.focusTargets.get(focusKey) ?? this.firstDetailInput ?? this.domNode).focus();
		}
	}

	private renderDetail(): void {
		this.sourceEditor.clear();
		this.detailStore.clear();
		this.detailInputs.length = 0;
		this.firstDetailInput = undefined;
		dom.clearNode(this.detail);
		if (this.sourcePath) {
			this.renderSource(this.sourcePath);
			return;
		}
		const definition = this.model.structuredDefinition;
		if (!definition) {
			dom.append(this.detail, dom.$('p')).textContent = localize('workflow.fixSource', "Correct the JSONC document to use the workflow editor.");
			this.button(this.detail, this.detailStore, localize('workflow.viewJson', "View JSONC"), () => this.showSource([]));
			return;
		}
		const checkpoint = definition.checkpoints.find(candidate => candidate.id === this.selectedId);
		const heading = dom.append(this.detail, dom.$('.workflow-detail-heading'));
		const backLabel = localize('workflow.backToCheckpoints', "Back to Checkpoints");
		const back = this.button(heading, this.detailStore, '', () => this.showOutline(), { quiet: true, key: 'back-to-checkpoints', hover: backLabel });
		back.element.classList.add('workflow-editor-back');
		back.element.setAttribute('aria-label', backLabel);
		back.element.appendChild(renderIcon(Codicon.arrowLeft)).setAttribute('aria-hidden', 'true');
		if (!checkpoint) {
			dom.append(heading, dom.$('h2')).textContent = localize('workflow.settings', "Workflow settings");
			this.field(this.detail, localize('workflow.description', "Description"), definition.description ?? '', value => this.model.update(['description'], value), true);
			this.field(this.detail, localize('workflow.id', "Identifier"), definition.id, value => this.model.update(['id'], value));
			this.button(this.detail, this.detailStore, this.model.readOnly ? localize('workflow.viewInputs', "View Workflow Input Schema") : localize('workflow.editInputs', "Edit Workflow Input Schema"), () => this.showSource(['inputSchema']));
			this.scrollable.scanDomNode();
			return;
		}
		const type = this.getType(checkpoint);
		const index = definition.checkpoints.indexOf(checkpoint);
		this.editableTitle(heading, this.detailStore, 'checkpoint-title', localize('workflow.checkpointTitle', "Checkpoint title"),
			() => this.model.structuredDefinition?.checkpoints.find(candidate => candidate.id === checkpoint.id)?.label ?? type?.label ?? checkpoint.id,
			value => this.model.updateCheckpoint(checkpoint.id, 'label', value));
		const scope = dom.append(this.detail, dom.$('span.workflow-detail-scope', undefined, localize('workflow.localEditScope', "This Workflow Only")));
		this.detailStore.add(this.hoverService.setupDelayedHover(scope, { content: localize('workflow.localEditScopeHint', "Names, instructions, and settings here affect only this workflow. Other workflows and existing runs do not change.") }));
		const instructions = this.section(localize('workflow.instructions', "Instructions"));
		this.field(instructions, localize('workflow.instructionsScope', "Instructions for this workflow only"), checkpoint.instructions ?? type?.instructions ?? '', value => this.model.updateCheckpoint(checkpoint.id, 'instructions', value), true, false);
		const proof = this.section(localize('workflow.proof', "Proof"));
		const verification = dom.append(proof, dom.$('p.workflow-secondary'));
		verification.textContent = type?.completion?.kind === 'checked' ? localize('workflow.checkedProof', "Checked") : localize('workflow.reportedProof', "Agent-Reported");
		this.detailStore.add(this.hoverService.setupDelayedHover(verification, {
			content: type?.completion?.kind === 'checked'
				? localize('workflow.proofChecked', "Checked by {0}", type.completion.check.check)
				: localize('workflow.proofReported', "The agent reports completion using the proof contract."),
		}));
		const contractActions = dom.append(proof, dom.$('.workflow-actions'));
		this.button(contractActions, this.detailStore, localize('workflow.viewContract', "View Contract"), () => this.showSource(checkpoint.localType ? ['checkpoints', index, 'localType'] : [], checkpoint.localType ? undefined : type));
		if (!this.model.readOnly && !checkpoint.localType) {
			this.button(contractActions, this.detailStore, localize('workflow.localContract', "Customize for This Workflow"), () => this.model.makeLocalContract(checkpoint.id));
		}
		if (checkpoint.localType) {
			const customized = dom.append(proof, dom.$('span.workflow-detail-scope', undefined, localize('workflow.localContractLabel', "Customized")));
			this.detailStore.add(this.hoverService.setupDelayedHover(customized, { content: localize('workflow.localContractScope', "Local contract: changes affect this workflow only, not the library checkpoint.") }));
			this.button(contractActions, this.detailStore, this.model.readOnly ? localize('workflow.viewProof', "View Proof Schema") : localize('workflow.editProof', "Edit Proof Schema"), () => this.showSource(['checkpoints', index, 'localType', 'proofSchema']));
			this.button(contractActions, this.detailStore, this.model.readOnly ? localize('workflow.viewTypeInputs', "View Input Schema") : localize('workflow.editTypeInputs', "Edit Input Schema"), () => this.showSource(['checkpoints', index, 'localType', 'inputSchema']));
			this.button(contractActions, this.detailStore, this.model.readOnly ? localize('workflow.viewCompletion', "View Completion Rule") : localize('workflow.editCompletion', "Edit Completion Rule"), () => this.showSource(['checkpoints', index, 'localType', 'completion']));
		}
		this.button(contractActions, this.detailStore, this.model.readOnly ? localize('workflow.viewBindings', "View Input Bindings") : localize('workflow.bindInputs', "Edit Input Bindings"), () => this.showSource(['checkpoints', index, 'inputs']));
		const before = this.section(localize('workflow.beforeStarting', "Before starting"));
		const start = dom.append(before, dom.$('p'));
		start.textContent = type?.startCondition ? localize('workflow.hasCondition', "Condition Required")
			: index === 0 ? localize('workflow.atStart', "At Workflow Start") : localize('workflow.afterPrevious', "After Previous Checkpoint");
		this.detailStore.add(this.hoverService.setupDelayedHover(start, {
			content: type?.startCondition
				? localize('workflow.startCondition', "Wait until {0} is satisfied.", type.startCondition.check)
				: localize('workflow.noStartCondition', "Work starts only when the workflow is explicitly running and its stopping point includes this checkpoint."),
		}));
		if (checkpoint.localType) {
			this.button(before, this.detailStore, this.model.readOnly ? localize('workflow.viewCondition', "View Start Condition") : localize('workflow.editCondition', "Edit Start Condition"), () => this.showSource(['checkpoints', index, 'localType', 'startCondition']));
		}
		const after = this.section(localize('workflow.afterCompletion', "After completion"));
		const groupId = checkpoint.afterCompletion?.group;
		const groupLabel = this.uiService.getGroups(this.model.workspace).find(group => group.id === groupId)?.label ?? groupId ?? localize('workflow.noGroup', "Keep Current Group");
		const group = this.button(dom.append(after, dom.$('.workflow-actions')), this.detailStore, groupLabel, () => this.selectGroup(checkpoint), {
			key: 'after-completion-group',
			hover: localize('workflow.groupDeferred', "Choose an existing or planned group. A new group is created only when this checkpoint completes and the session moves."),
		});
		group.enabled = !this.model.readOnly;
		this.scrollable.scanDomNode();
	}

	private getType(checkpoint: WorkflowCheckpoint): WorkflowCheckpointType | undefined {
		return checkpoint.localType ?? this.model.checkpointTypes.find(type => getWorkflowCheckpointTypeReference(type) === checkpoint.type);
	}

	private section(title: string): HTMLElement {
		const section = dom.append(this.detail, dom.$('section.workflow-detail-section'));
		dom.append(section, dom.$('h3')).textContent = title;
		return dom.append(section, dom.$('.workflow-detail-section-body'));
	}

	private getDraggedCheckpoint(data: IDragAndDropData): WorkflowOutlineItem | undefined {
		return data instanceof ElementsDragAndDropData
			? this.outlineItems.find(item => item.step !== undefined && data.elements.includes(item))
			: undefined;
	}

	private showOutline(): void {
		this.domNode.classList.remove('show-detail');
		this.layout(this.dimension);
		this.list.domFocus();
	}

	private removeCheckpoint(id: string): void {
		const definition = this.model.structuredDefinition;
		const index = definition?.checkpoints.findIndex(checkpoint => checkpoint.id === id) ?? -1;
		const selected = this.selectedId === id;
		try {
			this.model.remove(id);
			const remaining = this.model.structuredDefinition?.checkpoints;
			const next = remaining?.[Math.min(index, remaining.length - 1)];
			if (selected && next) {
				this.revealCheckpoint(next.id);
			}
			this.list.domFocus();
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private moveCheckpoint(id: string, offset: number): void {
		const definition = this.model.structuredDefinition;
		if (!definition || this.model.readOnly) {
			return;
		}
		const index = definition.checkpoints.findIndex(checkpoint => checkpoint.id === id);
		if (index < 0) {
			this.notificationService.error(localize('workflow.moveMissingCheckpoint', "The checkpoint no longer exists in this workflow."));
			return;
		}
		const position = Math.max(0, Math.min(definition.checkpoints.length - 1, index + offset));
		if (index === position) {
			return;
		}
		try {
			this.model.move(id, position);
			this.revealCheckpoint(id);
			this.list.domFocus();
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private editableTitle(container: HTMLElement, store: DisposableStore, key: string, label: string, read: () => string, update: (value: string) => void): void {
		const heading = dom.append(container, dom.$('h2.workflow-editable-title'));
		const editing = store.add(new MutableDisposable<DisposableStore>());
		const button = this.button(heading, store, '', () => {
			if (this.model.readOnly || editing.value) {
				return;
			}
			const editStore = new DisposableStore();
			editing.value = editStore;
			const input = editStore.add(new InputBox(heading, undefined, { inputBoxStyles: defaultInputBoxStyles, ariaLabel: label }));
			editStore.add(toDisposable(() => input.element.remove()));
			input.element.classList.add('workflow-title-input');
			input.value = read();
			this.trackFocusTarget(input.inputElement, `rename-input-${key}`, editStore);
			button.element.hidden = true;
			let finished = false;
			const finish = (commit: boolean, restoreFocus: boolean): boolean => {
				if (finished) {
					return true;
				}
				const value = input.value.trim();
				if (commit && !value) {
					input.inputElement.setAttribute('aria-invalid', 'true');
					this.notificationService.error(localize('workflow.renameRequired', "Enter a name before applying the rename."));
					return false;
				}
				finished = true;
				editing.clear();
				if (commit) {
					this.updateForm(() => update(value));
				}
				if (restoreFocus) {
					button.element.focus();
				}
				return true;
			};
			const commit = () => finish(true, true);
			this.commitTitle = commit;
			editStore.add(toDisposable(() => {
				finished = true;
				if (this.commitTitle === commit) {
					this.commitTitle = undefined;
				}
				button.element.hidden = false;
			}));
			editStore.add(input.onDidChange(() => input.inputElement.removeAttribute('aria-invalid')));
			editStore.add(dom.addDisposableListener(input.inputElement, 'keydown', (event: KeyboardEvent) => {
				if (event.isComposing) {
					return;
				}
				if (event.key === 'Enter' || event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					finish(event.key === 'Enter', true);
				} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
					finish(true, true);
				}
			}));
			editStore.add(dom.addDisposableListener(input.inputElement, 'blur', () => finish(false, false)));
			input.focus();
			input.select();
		}, { key: `rename-${key}`, quiet: true });
		button.element.classList.add('workflow-title-button');
		this.firstDetailInput ??= store === this.detailStore ? button.element : undefined;
		const render = () => {
			button.element.replaceChildren(dom.$('span.workflow-title-text', undefined, read()));
			button.element.setAttribute('aria-label', localize('workflow.renameTitle', "Rename {0}: {1}", label, read()));
			button.enabled = !this.model.readOnly;
		};
		store.add(this.model.onDidChange(render));
		render();
		store.add(this.hoverService.setupDelayedHover(button.element, () => ({
			content: this.model.readOnly
				? localize('workflow.renameReadonly', "{0}\nMake an editable copy to rename this workflow.", read())
				: localize('workflow.renameHint', "{0}\nClick to rename. Enter applies; Escape or clicking away cancels.", read()),
		})));
	}

	private async addCheckpoint(): Promise<void> {
		const type = await this.quickInputService.pick(this.model.checkpointTypes.map(checkpointType => ({ label: checkpointType.label, description: checkpointType.source?.label ?? checkpointType.source?.id, detail: checkpointType.description, checkpointType })), {
			title: localize('workflow.checkpointLibrary', "Checkpoint Library"),
			matchOnDescription: true,
			matchOnDetail: true,
		});
		const definition = this.model.structuredDefinition;
		if (!type || !definition) {
			return;
		}
		const base = type.checkpointType.id.split('/').at(-1) ?? 'checkpoint';
		let id = base;
		for (let count = 2; definition.checkpoints.some(checkpoint => checkpoint.id === id); count++) {
			id = `${base}-${count}`;
		}
		this.model.update(['checkpoints'], [...definition.checkpoints, { id, type: getWorkflowCheckpointTypeReference(type.checkpointType) }]);
		this.revealCheckpoint(id);
		(this.firstDetailInput ?? this.domNode).focus();
	}

	private async selectGroup(checkpoint: WorkflowCheckpoint): Promise<void> {
		const existing = this.uiService.getGroups(this.model.workspace);
		const planned = [...new Set(this.model.definition?.checkpoints.map(candidate => candidate.afterCompletion?.group).filter((group): group is string => !!group))].filter(group => !existing.some(candidate => candidate.id === group));
		const choice = await this.quickInputService.pick([
			{ label: localize('workflow.noGroup', "Keep Current Group"), id: '' },
			...existing.map(group => ({ label: group.label, id: group.id, description: localize('workflow.existingGroup', "Existing group") })),
			...planned.map(group => ({ label: group, id: group, description: localize('workflow.plannedGroup', "Planned group") })),
			{ label: localize('workflow.newGroup', "New Group…"), id: '$new' },
		], { title: localize('workflow.groupAfter', "Move to Group After Completion") });
		if (!choice) {
			return;
		}
		const group = choice.id === '$new' ? await this.quickInputService.input({ title: localize('workflow.newGroup', "New Group…"), prompt: localize('workflow.newGroupPrompt', "Plan a group name. Nothing is created or moved now."), validateInput: async value => value.trim() ? undefined : localize('workflow.groupNameRequired', "Enter a group name.") }) : choice.id;
		if (group !== undefined) {
			this.model.updateCheckpoint(checkpoint.id, 'afterCompletion', group ? { group: group.trim() } : undefined);
		}
	}

	private showSource(path: (string | number)[], contract?: WorkflowCheckpointType): void {
		this.sourcePath = path;
		this.sourceContract = contract;
		this.domNode.classList.add('show-detail');
		this.renderDetail();
		this.layout(this.dimension);
		this.sourceEditor.value?.focus();
	}

	private renderSource(path: (string | number)[]): void {
		this.button(this.detail, this.detailStore, localize('workflow.backToForm', "Back to Workflow"), () => {
			this.sourcePath = undefined;
			this.sourceContract = undefined;
			this.renderDetail();
			(this.firstDetailInput ?? this.domNode).focus();
		});
		dom.append(this.detail, dom.$('p.workflow-secondary')).textContent = this.sourceContract
			? localize('workflow.sharedContractScope', "This shared checkpoint contract is read-only here. Use Customize for This Workflow to change its proof or conditions without changing other templates.")
			: this.model.readOnly
				? localize('workflow.readOnlyDocumentScope', "This workflow is read-only. Make an editable copy to change its instructions, inputs, proof, or conditions without changing the original.")
				: localize('workflow.schemaDocumentScope', "This is the workflow's JSONC document. Schema and local-contract edits apply to this workflow only; Save and Revert use the same file.");
		const container = dom.append(this.detail, dom.$('.workflow-source-editor'));
		const textModel = !this.sourceContract && this.model.textModel || this.detailStore.add(this.modelService.createModel(JSON.stringify(this.sourceContract ?? this.model.definition, null, '\t'), this.languageService.createById('jsonc')));
		const editor = this.sourceEditor.value = this.instantiationService.createInstance(CodeEditorWidget, container, {
			readOnly: this.model.readOnly || !!this.sourceContract,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			ariaLabel: localize('workflow.schemaEditorAria', "Workflow JSONC document"),
		}, { isSimpleWidget: true });
		editor.setModel(textModel);
		const tree = parseTree(textModel.getValue());
		const node = tree && findNodeAtLocation(tree, path);
		if (node) {
			const position = textModel.getPositionAt(node.offset);
			editor.setPosition(position);
			editor.revealPositionInCenter(position);
		}
		this.layout(this.dimension);
	}

	private async makeCopy(): Promise<void> {
		const definition = this.model.definition;
		if (!definition) {
			return;
		}
		const id = await this.quickInputService.input({ title: localize('workflow.copyTitle', "Make Editable Workflow Copy"), value: `${definition.id}-copy`, prompt: localize('workflow.copyPrompt', "Choose a distinct identifier for your personal workflow. The original will not change."), validateInput: async value => value.trim() && value !== definition.id ? undefined : localize('workflow.copyIdRequired', "Enter a different non-empty identifier.") });
		if (!id) {
			return;
		}
		const resource = await this.catalogService.createWorkflow({ ...definition, id, checkpoints: definition.checkpoints.map(checkpoint => ({
			...checkpoint,
			localType: this.getType(checkpoint),
		})) }, 'user');
		const catalog = await this.catalogService.getCatalog(this.model.workspace);
		const entry = catalog.workflows.find(candidate => isEqual(candidate.resource, resource));
		if (entry) {
			await this.uiService.openEditor(entry, this.model.workspace);
		}
	}

	private field(container: HTMLElement, label: string, value: string, update: (value: string) => void, multiline = false, showLabel = true): void {
		const field = dom.append(container, dom.$('.workflow-field'));
		if (showLabel) {
			dom.append(field, dom.$('label')).textContent = label;
		}
		const input = this.detailStore.add(new InputBox(field, undefined, { inputBoxStyles: defaultInputBoxStyles, ariaLabel: label, flexibleHeight: multiline, flexibleMaxHeight: 220 }));
		if (multiline) {
			this.detailInputs.push(input);
			this.detailStore.add(input.onDidHeightChange(() => this.scrollable.scanDomNode()));
		}
		input.value = value;
		input.inputElement.readOnly = this.model.readOnly;
		this.firstDetailInput ??= input.inputElement;
		this.trackFocusTarget(input.inputElement, `field-${label}`, this.detailStore);
		const commit = () => {
			if (!this.model.readOnly && input.value !== value) {
				this.updateForm(() => {
					update(input.value);
					value = input.value;
				});
			}
		};
		this.detailStore.add(input.onDidChange(commit));
		this.detailStore.add(dom.addDisposableListener(input.inputElement, 'blur', commit));
	}

	private updateForm(update: () => void): void {
		this.updatingForm = true;
		try { update(); } catch (error) { this.notificationService.error(error); } finally { this.updatingForm = false; }
	}

	private trackFocusTarget(element: HTMLElement, key: string, store: DisposableStore): void {
		element.dataset.workflowEditorFocus = key;
		this.focusTargets.set(key, element);
		store.add(toDisposable(() => {
			if (this.focusTargets.get(key) === element) {
				this.focusTargets.delete(key);
			}
		}));
	}

	private button(container: HTMLElement, store: DisposableStore, label: string, run: () => void | Promise<unknown>, options: { secondary?: boolean; key?: string; quiet?: boolean; hover?: string } = {}): Button {
		const styles = options.quiet ? {
			...defaultButtonStyles, buttonSecondaryBackground: 'transparent', buttonSecondaryBorder: 'transparent',
			buttonSecondaryForeground: 'var(--vscode-foreground)', buttonSecondaryHoverBackground: 'var(--vscode-toolbar-hoverBackground)',
		} : defaultButtonStyles;
		const button = store.add(new Button(container, { ...styles, secondary: options.secondary ?? true, title: false }));
		button.label = label;
		this.trackFocusTarget(button.element, `${store === this.detailStore ? 'detail' : 'toolbar'}-${options.key ?? label}`, store);
		if (options.hover || label) {
			store.add(this.hoverService.setupDelayedHover(button.element, { content: options.hover ?? label }));
		}
		store.add(button.onDidClick(async () => {
			try { await run(); } catch (error) { this.notificationService.error(error); }
		}));
		return button;
	}
}
