/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { IAICustomizationManagementSectionWidget } from '../../chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { IWorkflowCatalogService, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { IWorkflowAccessibilityService } from './workflowAccessibility.js';
import { WorkflowCatalogViewModel } from './workflowCatalogViewModel.js';
import { WorkflowListItem, WorkflowListRenderer } from './workflowListRenderer.js';
import { IWorkflowUIService } from './workflowUIService.js';

import './media/workflows.css';

interface WorkflowTemplateItem extends WorkflowListItem {
	readonly entry: WorkflowTemplateEntry;
}

export class WorkflowCatalogWidget extends Disposable implements IAICustomizationManagementSectionWidget {
	readonly domNode: HTMLElement;
	private readonly model: WorkflowCatalogViewModel;
	private readonly search: InputBox;
	private readonly list: WorkbenchList<WorkflowTemplateItem>;
	private readonly listContainer: HTMLElement;
	private readonly detail: HTMLElement;
	private readonly message: HTMLElement;
	private readonly details = this._register(new DisposableStore());
	private readonly count = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this.count.event;
	private source: WorkflowSource['kind'] | undefined;
	private dimension = new dom.Dimension(800, 600);
	private visibleEntries: readonly WorkflowTemplateEntry[] = [];

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
		@IWorkflowUIService private readonly uiService: IWorkflowUIService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkflowAccessibilityService accessibilityService: IWorkflowAccessibilityService,
	) {
		super();
		this.model = this._register(instantiationService.createInstance(WorkflowCatalogViewModel));
		this.domNode = dom.append(container, dom.$('.monaco-workflow-catalog', { role: 'region', 'aria-label': localize('workflow.catalogAria', "Workflow templates"), tabindex: '-1' }));
		const header = dom.append(this.domNode, dom.$('.workflow-catalog-header'));
		dom.append(header, dom.$('h2')).textContent = localize('workflow.catalogTitle', "Workflows");
		dom.append(header, dom.$('p.workflow-secondary')).textContent = localize('workflow.catalogDescription', "Reusable checkpoint assignments. Choose where automatic work stops; existing tool permissions still apply.");
		const actions = dom.append(header, dom.$('.workflow-actions'));
		this.button(actions, this._store, localize('workflow.create', "New Workflow"), () => this.createWorkflow(), false);
		this.button(actions, this._store, localize('workflow.library', "Checkpoint Library"), () => this.openCheckpointLibrary());
		this.button(actions, this._store, localize('workflow.filterSources', "Filter Sources"), () => this.chooseSource());
		this.search = this._register(new InputBox(header, undefined, { inputBoxStyles: defaultInputBoxStyles, placeholder: localize('workflow.search', "Search workflows"), ariaLabel: localize('workflow.search', "Search workflows") }));
		this._register(this.search.onDidChange(() => this.render()));
		const body = dom.append(this.domNode, dom.$('.workflow-catalog-body'));
		this.listContainer = dom.append(body, dom.$('.workflow-catalog-list'));
		this.list = this._register(instantiationService.createInstance(WorkbenchList<WorkflowTemplateItem>, 'WorkflowCatalog', this.listContainer,
			{ getHeight: () => 52, getTemplateId: () => 'workflow-item' }, [new WorkflowListRenderer(hoverService)], {
				multipleSelectionSupport: false,
				identityProvider: { getId: item => item.id },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
				accessibilityProvider: { getAriaLabel: item => localize('workflow.templateAria', "{0}, {1}", item.label, item.description ?? ''), getWidgetAriaLabel: () => localize('workflow.catalogAria', "Workflow templates") },
			}));
		this.detail = dom.append(body, dom.$('.workflow-catalog-detail'));
		this.message = dom.append(this.domNode, dom.$('.workflow-message', { role: 'status' }));
		this._register(this.list.onDidChangeSelection(event => this.renderDetail(event.elements[0]?.entry)));
		this._register(this.list.onDidOpen(event => {
			if (event.element) {
				void this.uiService.openEditor(event.element.entry, this.model.workspace).catch(error => this.notificationService.error(error));
			}
		}));
		this._register(this.model.onDidChange(() => this.render()));
		this._register(accessibilityService.register(this.domNode, () => [
			localize('workflow.catalogTitle', "Workflows"),
			...this.visibleEntries.map(entry => `${entry.label}\n${entry.definition?.description ?? ''}\n${entry.source.label ?? entry.source.id}\n${entry.diagnostics.map(diagnostic => diagnostic.message).join('\n')}`),
			...this.model.catalog.diagnostics.map(diagnostic => diagnostic.message),
		].join('\n\n')));
		this.render();
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		this.domNode.style.height = `${dimension.height}px`;
		this.domNode.classList.toggle('narrow', (this.domNode.clientWidth || dimension.width) < 660);
		this.list.layout(this.listContainer.clientHeight, this.listContainer.clientWidth);
	}

	focus(): void { this.search.focus(); }
	async refresh(): Promise<void> { await this.model.refresh(); }
	fireItemCount(): void { this.count.fire(this.model.getCount()); }

	private render(): void {
		const selected = this.list.getSelectedElements()[0]?.id;
		const query = this.search.value.toLocaleLowerCase().trim();
		this.visibleEntries = this.model.catalog.workflows.filter(entry => (!this.source || entry.source.kind === this.source) && (!query || `${entry.label} ${entry.definition?.description ?? ''} ${entry.source.label ?? ''}`.toLocaleLowerCase().includes(query)));
		this.list.splice(0, this.list.length, this.visibleEntries.map(entry => ({ id: entry.key, label: entry.label, description: localize('workflow.templateSource', "{0} · {1}", entry.source.label ?? entry.source.id, entry.diagnostics.length ? localize('workflow.needsFix', "Needs attention") : localize('workflow.templateCheckpoints', "{0} checkpoints", entry.definition?.checkpoints.length ?? 0)), entry })));
		const selectedIndex = this.visibleEntries.findIndex(entry => entry.key === selected);
		this.list.setSelection(this.visibleEntries.length ? [Math.max(0, selectedIndex)] : []);
		this.renderDetail(this.list.getSelectedElements()[0]?.entry);
		this.message.textContent = this.model.error ?? (this.model.loading ? localize('workflow.loading', "Loading workflows…") : this.model.catalog.diagnostics.filter(diagnostic => diagnostic.code === 'source' || !diagnostic.resource).map(diagnostic => diagnostic.message).join('\n'));
		this.fireItemCount();
		this.layout(this.dimension);
	}

	private renderDetail(entry?: WorkflowTemplateEntry): void {
		this.details.clear();
		dom.clearNode(this.detail);
		if (!entry) {
			dom.append(this.detail, dom.$('p')).textContent = localize('workflow.empty', "No workflows match this view. Create one or choose another source.");
			return;
		}
		dom.append(this.detail, dom.$('h3')).textContent = entry.label;
		dom.append(this.detail, dom.$('p')).textContent = entry.definition?.description ?? '';
		dom.append(this.detail, dom.$('p.workflow-secondary')).textContent = localize('workflow.provenance', "Source: {0}{1}", entry.source.label ?? entry.source.id, entry.readOnly ? localize('workflow.readOnlySuffix', " (read-only)") : '');
		for (const diagnostic of entry.diagnostics) {
			dom.append(this.detail, dom.$('p.workflow-message')).textContent = diagnostic.message;
		}
		const actions = dom.append(this.detail, dom.$('.workflow-actions'));
		this.button(actions, this.details, entry.readOnly ? localize('workflow.inspect', "Inspect Workflow") : localize('workflow.edit', "Edit Workflow"), () => this.uiService.openEditor(entry, this.model.workspace));
		const use = this.button(actions, this.details, localize('workflow.useNewSession', "Use in New Session"), () => this.uiService.useInNewSession(entry, this.model.workspace), false);
		use.enabled = !!entry.definition && !entry.diagnostics.some(diagnostic => diagnostic.severity === 'error');
		dom.append(this.detail, dom.$('p.workflow-secondary')).textContent = localize('workflow.catalogDoesNotStart', "Selection opens setup in a new session. It does not start work.");
	}

	private async chooseSource(): Promise<void> {
		const source = await this.quickInputService.pick([
			{ label: localize('workflow.allSources', "All Sources"), kind: undefined },
			{ label: localize('workflow.workspace', "Workspace"), kind: 'workspace' as const },
			{ label: localize('workflow.personal', "Personal"), kind: 'user' as const },
			{ label: localize('workflow.extensions', "Extensions"), kind: 'extension' as const },
			{ label: localize('workflow.builtin', "Built-in"), kind: 'builtin' as const },
		], { title: localize('workflow.filterSources', "Filter Sources") });
		if (source) {
			this.source = source.kind;
			this.render();
		}
	}

	private async createWorkflow(): Promise<void> {
		const label = await this.quickInputService.input({ title: localize('workflow.create', "New Workflow"), prompt: localize('workflow.namePrompt', "Name the workflow template"), validateInput: async value => value.trim() ? undefined : localize('workflow.nameRequired', "Enter a workflow name.") });
		if (!label) {
			return;
		}
		const destination = await this.quickInputService.pick([
			...(this.model.workspace ? [{ label: localize('workflow.workspace', "Workspace"), target: this.model.workspace }] : []),
			{ label: localize('workflow.personal', "Personal"), target: 'user' as const },
		], { title: localize('workflow.createLocation', "Workflow Location") });
		if (!destination) {
			return;
		}
		const definition: WorkflowDefinition = {
			id: `custom/${generateUuid()}`,
			version: 1,
			label: label.trim(),
			checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }],
		};
		const resource = await this.catalogService.createWorkflow(definition, destination.target);
		await this.model.refresh();
		const entry = this.model.catalog.workflows.find(entry => isEqual(entry.resource, resource));
		if (entry) {
			await this.uiService.openEditor(entry, this.model.workspace);
		}
	}

	private async openCheckpointLibrary(): Promise<void> {
		const choice = await this.quickInputService.pick([
			{ label: localize('workflow.newCheckpointType', "New Checkpoint Type…"), description: '', detail: localize('workflow.libraryScope', "Library edits affect future snapshots. To change one workflow only, copy its contract in the workflow editor."), entry: undefined },
			...this.model.catalog.checkpointTypes.map(entry => ({
				label: entry.label,
				description: entry.source.label ?? entry.source.id,
				detail: entry.diagnostics.map(diagnostic => diagnostic.message).join(' ') || entry.definition?.description,
				entry,
			})),
		], { title: localize('workflow.library', "Checkpoint Library"), matchOnDescription: true, matchOnDetail: true });
		if (choice?.entry) {
			await this.uiService.openCheckpointType(choice.entry, this.model.workspace);
		} else if (choice) {
			await this.createCheckpointType();
		}
	}

	private async createCheckpointType(): Promise<void> {
		const label = await this.quickInputService.input({ title: localize('workflow.newCheckpointType', "New Checkpoint Type…"), prompt: localize('workflow.checkpointNamePrompt', "Name a reusable checkpoint contract"), validateInput: async value => value.trim() ? undefined : localize('workflow.nameRequired', "Enter a workflow name.") });
		if (!label) {
			return;
		}
		const destination = await this.quickInputService.pick([
			...(this.model.workspace ? [{ label: localize('workflow.workspace', "Workspace"), target: this.model.workspace }] : []),
			{ label: localize('workflow.personal', "Personal"), target: 'user' as const },
		], { title: localize('workflow.checkpointLocation', "Checkpoint Type Location") });
		if (!destination) {
			return;
		}
		const definition: WorkflowCheckpointType = {
			id: `custom/${generateUuid()}`, version: 1, label: label.trim(),
			instructions: localize('workflow.newCheckpointInstructions', "Complete this checkpoint and submit a summary of the result."),
			proofSchema: { type: 'object', properties: { summary: { type: 'string', minLength: 1 } }, required: ['summary'], additionalProperties: false },
			completion: { kind: 'reported' },
		};
		const resource = await this.catalogService.createCheckpointType(definition, destination.target);
		await this.model.refresh();
		const entry = this.model.catalog.checkpointTypes.find(entry => isEqual(entry.resource, resource));
		if (entry) {
			await this.uiService.openCheckpointType(entry, this.model.workspace);
		}
	}

	private button(container: HTMLElement, store: DisposableStore, label: string, run: () => void | Promise<unknown>, secondary = true): Button {
		const button = store.add(new Button(container, { ...defaultButtonStyles, secondary, title: false }));
		button.label = label;
		store.add(this.hoverService.setupDelayedHover(button.element, { content: label }));
		store.add(button.onDidClick(async () => {
			try { await run(); } catch (error) { this.notificationService.error(error); }
		}));
		return button;
	}
}
