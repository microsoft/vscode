/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { WorkflowRun, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { EditorInputCapabilities, GroupIdentifier, IEditorOpenContext, IEditorSerializer, ISaveOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { WorkflowRunViewModel } from '../common/workflowRunViewModel.js';
import { WorkflowEditorModel } from './workflowEditorModel.js';
import { WorkflowEditorWidget } from './workflowEditorWidget.js';
import { WorkflowRunWidget } from './workflowRunWidget.js';
import { WorkflowRevealTurn } from './workflowUIService.js';

export class WorkflowEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.workflow';
	private readonly model = this._register(new MutableDisposable<WorkflowEditorModel>());
	private readonly modelListeners = this._register(new DisposableStore());
	private resolving: Promise<WorkflowEditorModel> | undefined;

	constructor(
		readonly entry: WorkflowTemplateEntry,
		readonly workspace: URI | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { super(); }

	override get typeId(): string { return WorkflowEditorInput.ID; }
	override get resource(): URI | undefined { return this.entry.resource; }
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.RequiresModal | ((this.model.value?.readOnly ?? this.entry.readOnly) ? EditorInputCapabilities.Readonly : EditorInputCapabilities.None);
	}
	override getName(): string { return this.model.value?.definition?.label ?? this.entry.label; }
	override getDescription(): string { return this.entry.source.label ?? this.entry.source.id; }
	override isDirty(): boolean { return this.model.value?.isDirty ?? false; }

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof WorkflowEditorInput && other.entry.key === this.entry.key;
	}

	override resolve(): Promise<WorkflowEditorModel> {
		this.resolving ??= this.load().catch(error => {
			this.resolving = undefined;
			this.model.clear();
			this.modelListeners.clear();
			throw error;
		});
		return this.resolving;
	}

	private async load(): Promise<WorkflowEditorModel> {
		const model = this.model.value = this.instantiationService.createInstance(WorkflowEditorModel, this.entry, this.workspace);
		this.modelListeners.clear();
		this.modelListeners.add(model.onDidChange(() => {
			this._onDidChangeDirty.fire();
			this._onDidChangeLabel.fire();
			this._onDidChangeCapabilities.fire();
		}));
		await model.load();
		return model;
	}

	override async save(_group: GroupIdentifier, _options?: ISaveOptions): Promise<EditorInput | undefined> {
		return await (await this.resolve()).save() ? this : undefined;
	}

	override async revert(): Promise<void> {
		await (await this.resolve()).revert();
	}
}

interface SerializedWorkflowEditor {
	readonly key: string;
	readonly label: string;
	readonly source: WorkflowSource;
	readonly resource?: string;
	readonly workspace?: string;
}

export class WorkflowEditorSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean { return editor instanceof WorkflowEditorInput; }

	serialize(editor: EditorInput): string | undefined {
		if (!(editor instanceof WorkflowEditorInput)) {
			return undefined;
		}
		const data: SerializedWorkflowEditor = {
			key: editor.entry.key, label: editor.getName(), source: editor.entry.source,
			resource: editor.resource?.toString(), workspace: editor.workspace?.toString(),
		};
		return JSON.stringify(data);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data: SerializedWorkflowEditor = JSON.parse(serializedEditor);
			if (!data || typeof data.key !== 'string' || typeof data.label !== 'string' || !data.source || typeof data.source.id !== 'string' || !['workspace', 'user', 'extension', 'builtin'].includes(data.source.kind)) {
				return undefined;
			}
			return instantiationService.createInstance(WorkflowEditorInput, {
				key: data.key, label: data.label, source: data.source,
				resource: data.resource ? URI.parse(data.resource) : undefined,
				readOnly: data.source.kind === 'builtin' || data.source.kind === 'extension', diagnostics: [],
			}, data.workspace ? URI.parse(data.workspace) : undefined);
		} catch {
			return undefined;
		}
	}
}

export class WorkflowRunEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.workflowRun';
	constructor(readonly session: URI, readonly run: WorkflowRun, readonly revealTurn?: WorkflowRevealTurn) { super(); }
	override get typeId(): string { return WorkflowRunEditorInput.ID; }
	override get resource(): URI { return this.session; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.RequiresModal; }
	override getName(): string { return localize('workflow.progressTitle', "{0} Checkpoints", this.run.snapshot.label); }
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof WorkflowRunEditorInput && isEqual(other.session, this.session) && other.run.id === this.run.id;
	}
}

export class WorkflowEditorPane extends EditorPane {
	static readonly ID = 'workbench.editor.workflow';
	private container!: HTMLElement;
	private readonly widget = this._register(new MutableDisposable<WorkflowEditorWidget>());
	private dimension: dom.Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { super(WorkflowEditorPane.ID, group, telemetryService, themeService, storageService); }

	protected override createEditor(parent: HTMLElement): void { this.container = dom.append(parent, dom.$('.workflow-editor-pane')); }

	override async setInput(input: WorkflowEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		const model = await input.resolve();
		if (token.isCancellationRequested || this.input !== input) {
			return;
		}
		this.widget.clear();
		dom.clearNode(this.container);
		this.widget.value = this.instantiationService.createInstance(WorkflowEditorWidget, this.container, model);
		if (this.dimension) {
			this.widget.value.layout(this.dimension);
		}
	}

	override clearInput(): void {
		this.widget.clear();
		if (this.container) {
			dom.clearNode(this.container);
		}
		super.clearInput();
	}
	override layout(dimension: dom.Dimension): void { this.dimension = dimension; this.widget.value?.layout(dimension); }
	override focus(): void { this.widget.value?.focus(); }
}

export class WorkflowRunEditorPane extends EditorPane {
	static readonly ID = 'workbench.editor.workflowRun';
	private container!: HTMLElement;
	private readonly model = this._register(new MutableDisposable<WorkflowRunViewModel>());
	private readonly widget = this._register(new MutableDisposable<WorkflowRunWidget>());
	private dimension: dom.Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { super(WorkflowRunEditorPane.ID, group, telemetryService, themeService, storageService); }

	protected override createEditor(parent: HTMLElement): void { this.container = dom.append(parent, dom.$('.workflow-editor-pane')); }

	override async setInput(input: WorkflowRunEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || this.input !== input) {
			return;
		}
		this.widget.clear();
		this.model.clear();
		dom.clearNode(this.container);
		this.model.value = this.instantiationService.createInstance(WorkflowRunViewModel, input.session, input.run);
		this.widget.value = this.instantiationService.createInstance(WorkflowRunWidget, this.container, this.model.value, { revealTurn: input.revealTurn });
		if (this.dimension) {
			this.widget.value.layout(this.dimension);
		}
	}

	override clearInput(): void {
		this.widget.clear();
		this.model.clear();
		if (this.container) {
			dom.clearNode(this.container);
		}
		super.clearInput();
	}
	override layout(dimension: dom.Dimension): void { this.dimension = dimension; this.widget.value?.layout(dimension); }
	override focus(): void { this.widget.value?.focus(); }
}
