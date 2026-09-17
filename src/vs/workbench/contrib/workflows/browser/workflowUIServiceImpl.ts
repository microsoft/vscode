/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowSchemaFormat, WorkflowSnapshot, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { validateWorkflowInputs } from '../../../../platform/workflow/common/workflowValidation.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkflowCatalogService, WorkflowCheckpointEntry, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { WorkflowSettingId } from '../common/workflowConfiguration.js';
import { IWorkflowService, WorkflowSelection } from '../common/workflowService.js';
import { parseWorkflowProofDocumentUri, workflowProofDocumentScheme } from '../common/workflowProofDocuments.js';
import { WorkflowEditorInput, WorkflowRunEditorInput } from './workflowEditors.js';
import { IWorkflowUIService, WorkflowGroupChoice, WorkflowRevealTurn } from './workflowUIService.js';

const checkpointDocumentScheme = 'vscode-workflow-checkpoint';

interface WorkflowPickItem {
	readonly id: string;
	readonly entry?: WorkflowTemplateEntry;
}

export class WorkflowUIService extends Disposable implements IWorkflowUIService {
	declare readonly _serviceBrand: undefined;
	private sessionStarter: ((selection: WorkflowSelection, workspace?: URI) => Promise<void>) | undefined;
	private groups: ((workspace?: URI) => readonly WorkflowGroupChoice[]) | undefined;

	constructor(
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
		@IWorkflowService private readonly workflowService: IWorkflowService,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ITextModelService resolver: ITextModelService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._register(toDisposable(() => {
			this.sessionStarter = undefined;
			this.groups = undefined;
		}));
		this._register(resolver.registerTextModelContentProvider(checkpointDocumentScheme, {
			provideTextContent: async resource => {
				const catalog = await this.catalogService.getCatalog(resource.query ? URI.parse(resource.query) : undefined);
				const entry = catalog.checkpointTypes.find(entry => entry.key === decodeURIComponent(resource.path.slice(1)));
				return entry?.definition ? modelService.getModel(resource) ?? modelService.createModel(JSON.stringify(entry.definition, null, '\t'), languageService.createById('jsonc'), resource) : null;
			},
		}));
		this._register(resolver.registerTextModelContentProvider(workflowProofDocumentScheme, {
			provideTextContent: async resource => {
				const existing = modelService.getModel(resource);
				if (existing) {
					return existing;
				}
				const reference = parseWorkflowProofDocumentUri(resource);
				const watch = this.workflowService.watchSession(reference.session);
				try {
					const run = await this.workflowService.getSessionRun(reference.session);
					const receipt = run?.id === reference.runId ? run.receipts.find(receipt => receipt.checkpointId === reference.checkpointId) : undefined;
					if (!receipt) {
						throw new Error(localize('workflow.proofUnavailable', "The accepted checkpoint proof is not available. Reconnect to its workflow host and try again."));
					}
					return modelService.createModel(JSON.stringify(receipt.proof, null, '\t'), languageService.createById('json'), resource);
				} finally {
					watch.dispose();
				}
			},
		}));
	}

	private get canAuthorWorkflows(): boolean {
		return this.configurationService.getValue<boolean>(WorkflowSettingId.Enabled) === true && !this.entitlementService.sentiment.hidden;
	}

	async selectWorkflow(workspace?: URI, selection?: WorkflowSelection, anchor?: HTMLElement): Promise<WorkflowSelection | null | undefined> {
		if (this.entitlementService.sentiment.hidden) {
			return undefined;
		}
		const focused = dom.getActiveElement();
		const target = anchor ?? (dom.isHTMLElement(focused) ? focused : undefined);
		if (!target) {
			throw new Error(localize('workflow.pickerUnavailable', "Open a session to choose a workflow."));
		}
		const watch = this.canAuthorWorkflows ? this.catalogService.watch(workspace) : Disposable.None;
		try {
			const catalog = this.canAuthorWorkflows ? await this.catalogService.getCatalog(workspace) : undefined;
			if (this.entitlementService.sentiment.hidden || this.actionWidgetService.isVisible || anchor && !anchor.isConnected) {
				return undefined;
			}
			const groups: readonly { kind: WorkflowSource['kind']; label: string }[] = [
				{ kind: 'workspace', label: localize('workflow.sourceWorkspace', "Workspace") },
				{ kind: 'user', label: localize('workflow.sourceUser', "User") },
				{ kind: 'builtin', label: localize('workflow.sourceBuiltin', "Built-in") },
				{ kind: 'extension', label: localize('workflow.sourceExtension', "Extensions") },
			];
			const none: WorkflowPickItem = { id: 'none' };
			const items: IActionListItem<WorkflowPickItem>[] = [{
				kind: ActionListItemKind.Action,
				label: localize('workflow.noWorkflow', "No Workflow"),
				ariaDescription: selection ? undefined : localize('workflow.selected', "selected"),
				group: { title: '', icon: selection ? Codicon.blank : Codicon.check },
				item: none,
			}];
			let activeItem: WorkflowPickItem | undefined;
			for (const group of groups) {
				const entries = this.canAuthorWorkflows ? catalog?.workflows.filter(entry => entry.source.kind === group.kind && entry.definition && !entry.diagnostics.some(diagnostic => diagnostic.severity === 'error')) ?? [] : [];
				if (!entries.length) {
					continue;
				}
				items.push({ kind: ActionListItemKind.Separator, label: '' }, { kind: ActionListItemKind.Header, label: group.label });
				for (const entry of entries) {
					const item: WorkflowPickItem = { id: entry.key, entry };
					const selected = !!selection && entry.definition?.id === selection.snapshot.id && (!selection.snapshot.source || entry.source.id === selection.snapshot.source.id);
					items.push({
						kind: ActionListItemKind.Action, label: entry.label, item,
						detail: entry.definition?.description,
						ariaDescription: selected ? localize('workflow.selected', "selected") : undefined,
						group: { title: '', icon: selected ? Codicon.check : Codicon.blank },
						hover: entry.definition?.description ? { content: entry.definition.description } : undefined,
					});
					if (selected) {
						activeItem = item;
					}
				}
			}
			const choice = await new Promise<WorkflowPickItem | undefined>(resolve => {
				anchor?.setAttribute('aria-expanded', 'true');
				this.actionWidgetService.show('workflowPicker', false, items, {
					onSelect: item => {
						resolve(item);
						this.actionWidgetService.hide();
					},
					onHide: () => {
						anchor?.setAttribute('aria-expanded', 'false');
						if (target.isConnected) {
							target.focus();
						}
						resolve(undefined);
					},
				}, target, undefined, [], {
					getWidgetAriaLabel: () => localize('workflow.pickerAriaLabel', "Workflow"),
				}, {
					minWidth: 240,
					maxWidth: 380,
					initialFocusItemId: activeItem?.id ?? none.id,
					showFilter: true,
					filterAsCombobox: true,
					focusFilterOnOpen: true,
					filterPlaceholder: localize('workflow.filterTemplates', "Search workflows"),
				});
			});
			if (!choice || this.entitlementService.sentiment.hidden) {
				return undefined;
			}
			if (!choice.entry) {
				return null;
			}
			if (!this.canAuthorWorkflows) {
				return undefined;
			}
			if (choice === activeItem && selection) {
				validateWorkflowInputs(selection.inputs ?? {}, selection.snapshot.inputSchema);
				return selection;
			}
			return this.setup(await this.catalogService.resolve(choice.entry, workspace));
		} finally {
			anchor?.setAttribute('aria-expanded', 'false');
			watch.dispose();
		}
	}

	async showWorkflow(session: URI, revealTurn?: WorkflowRevealTurn): Promise<void> {
		if (this.entitlementService.sentiment.hidden) {
			return;
		}
		const watch = this.workflowService.watchSession(session);
		try {
			const run = await this.workflowService.getSessionRun(session);
			if (!run) {
				throw new Error(this.workflowService.getUnsupportedReason(session) ?? localize('workflow.noRun', "This session does not have a workflow run."));
			}
			await this.editorService.openEditor(new WorkflowRunEditorInput(session, run, revealTurn));
		} finally {
			watch.dispose();
		}
	}

	async openEditor(entry: WorkflowTemplateEntry, workspace?: URI): Promise<void> {
		if (this.canAuthorWorkflows) {
			await this.editorService.openEditor(this.instantiationService.createInstance(WorkflowEditorInput, entry, workspace), { pinned: true });
		}
	}

	async openCheckpointType(entry: WorkflowCheckpointEntry, workspace?: URI): Promise<void> {
		if (!this.canAuthorWorkflows) {
			return;
		}
		const resource = entry.resource && !entry.readOnly ? entry.resource : URI.from({ scheme: checkpointDocumentScheme, path: `/${encodeURIComponent(entry.key)}`, query: workspace?.toString() });
		await this.editorService.openEditor({ resource, options: { pinned: true } });
	}

	async useInNewSession(entry: WorkflowTemplateEntry, workspace?: URI): Promise<void> {
		if (!this.canAuthorWorkflows) {
			return;
		}
		const starter = this.sessionStarter;
		if (!starter) {
			throw new Error(localize('workflow.sessionStarterUnavailable', "This window cannot create a session with a workflow."));
		}
		const selection = await this.setup(await this.catalogService.resolve(entry, workspace));
		if (selection && this.canAuthorWorkflows) {
			if (starter !== this.sessionStarter) {
				throw new Error(localize('workflow.sessionStarterChanged', "The workflow session entry point changed. Select the workflow again."));
			}
			await starter(selection, workspace);
		}
	}

	registerSessionStarter(handler: (selection: WorkflowSelection, workspace?: URI) => Promise<void>): IDisposable {
		if (this.sessionStarter) {
			throw new Error(localize('workflow.sessionStarterRegistered', "A workflow session entry point is already registered."));
		}
		this.sessionStarter = handler;
		return toDisposable(() => {
			if (this.sessionStarter === handler) {
				this.sessionStarter = undefined;
			}
		});
	}

	registerGroupProvider(provider: (workspace?: URI) => readonly WorkflowGroupChoice[]): IDisposable {
		if (this.groups) {
			throw new Error(localize('workflow.groupsRegistered', "A workflow session group provider is already registered."));
		}
		this.groups = provider;
		return toDisposable(() => {
			if (this.groups === provider) {
				this.groups = undefined;
			}
		});
	}

	getGroups(workspace?: URI): readonly WorkflowGroupChoice[] {
		return this.groups?.(workspace) ?? [];
	}

	private setup(snapshot: WorkflowSnapshot): WorkflowSelection | undefined {
		if (!this.canAuthorWorkflows) {
			return undefined;
		}
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const initial = Object.fromEntries(Object.entries(snapshot.inputSchema?.properties ?? {})
			.filter(([, schema]) => schema.type === 'string' && schema.format === WorkflowSchemaFormat.IanaTimeZone
				&& (schema.const === undefined || schema.const === timeZone) && (!schema.enum || schema.enum.includes(timeZone)))
			.map(([name]) => [name, timeZone]));
		validateWorkflowInputs(initial, snapshot.inputSchema);
		return { snapshot, stopAfter: snapshot.checkpoints[0].id, inputs: Object.keys(initial).length ? initial : undefined, origin: undefined };
	}
}
