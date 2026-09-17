/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { findNodeAtLocation, parseTree } from '../../../../base/common/json.js';
import { setProperty, withFormatting } from '../../../../base/common/jsonEdit.js';
import { Disposable, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { WorkflowCheckpoint, WorkflowCheckpointType, WorkflowDefinition, WorkflowSnapshot } from '../../../../platform/workflow/common/workflow.js';
import { resolveWorkflowDefinition } from '../../../../platform/workflow/common/workflowValidation.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IWorkflowCatalogService, WorkflowCatalogDiagnostic, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { getUsableCheckpointTypes, parseWorkflowDocument } from '../common/workflowCatalogModel.js';
import { makeWorkflowLocalContract, moveWorkflowCheckpoint, removeWorkflowCheckpoint } from '../common/workflowEditing.js';

/** A form projection of the real JSONC document; all edits participate in its undo and save lifecycle. */
export class WorkflowEditorModel extends Disposable {
	private readonly reference = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());
	private readonly change = this._register(new Emitter<void>());
	readonly onDidChange = this.change.event;
	private types: readonly WorkflowCheckpointType[] = [];
	private parsed: WorkflowDefinition | undefined;
	private problems: readonly WorkflowCatalogDiagnostic[] = [];
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => void this.refreshCatalog(), 150));
	private catalogGeneration = 0;

	constructor(
		readonly entry: WorkflowTemplateEntry,
		readonly workspace: URI | undefined,
		@ITextModelService private readonly resolver: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
	) {
		super();
		this.parsed = entry.definition;
		this.problems = entry.diagnostics;
	}

	get definition(): WorkflowDefinition | undefined { return this.parsed; }
	get structuredDefinition(): WorkflowDefinition | undefined { return this.parsed; }
	get diagnostics(): readonly WorkflowCatalogDiagnostic[] { return this.problems; }
	get checkpointTypes(): readonly WorkflowCheckpointType[] { return this.types; }
	get textModel(): ITextModel | undefined { return this.reference.value?.object.textEditorModel; }
	get isDirty(): boolean { return !!this.entry.resource && this.textFileService.isDirty(this.entry.resource); }
	get readOnly(): boolean { return this.entry.readOnly || !!this.reference.value?.object.isReadonly(); }

	async load(): Promise<void> {
		this._register(this.catalogService.watch(this.workspace));
		this._register(this.catalogService.onDidChange(() => this.refreshScheduler.schedule()));
		const catalog = await this.catalogService.getCatalog(this.workspace);
		if (this._store.isDisposed) {
			return;
		}
		this.types = getUsableCheckpointTypes(catalog);
		const current = catalog.workflows.find(entry => entry.key === this.entry.key);
		if (!this.entry.resource) {
			this.parsed = current?.definition;
			this.problems = current?.diagnostics ?? [{ code: 'source', severity: 'error', message: localize('workflow.sourceUnavailable', "The source no longer provides this workflow.") }];
		}
		if (this.entry.resource) {
			this.reference.value = await this.resolver.createModelReference(this.entry.resource);
			if (this._store.isDisposed) {
				return;
			}
			this._register(this.textModel!.onDidChangeContent(() => this.updateFromDocument()));
			this._register(this.textFileService.files.onDidChangeDirty(model => {
				if (model === this.textFileService.files.get(this.entry.resource!)) {
					this.change.fire();
				}
			}));
			this._register(this.textFileService.files.onDidChangeReadonly(model => {
				if (model === this.textFileService.files.get(this.entry.resource!)) {
					this.change.fire();
				}
			}));
			this.updateFromDocument();
		}
		this.change.fire();
	}

	resolveSnapshot(): WorkflowSnapshot {
		if (!this.parsed || this.problems.some(problem => problem.severity === 'error')) {
			throw new Error(this.problems.map(problem => problem.message).join('\n') || localize('workflow.invalidDocument', "Correct the workflow document before using it."));
		}
		return resolveWorkflowDefinition(this.parsed, this.types);
	}

	update(path: (string | number)[], value: string | number | object | undefined): void {
		const model = this.textModel;
		if (this.readOnly || !model) {
			throw new Error(localize('workflow.readOnlyDocument', "Make an editable copy before changing this workflow."));
		}
		const text = model.getValue();
		const formatting = { insertSpaces: model.getOptions().insertSpaces, tabSize: model.getOptions().tabSize, eol: model.getEOL() };
		const tree = typeof path.at(-1) === 'number' ? parseTree(text) : undefined;
		const existing = tree && findNodeAtLocation(tree, path);
		// setProperty inserts array elements; form updates replace an existing element.
		const edits = existing && value !== undefined
			? withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, formatting)
			: setProperty(text, path, value, formatting);
		model.pushStackElement();
		model.pushEditOperations(null, edits.map(edit => ({
			range: Range.fromPositions(model.getPositionAt(edit.offset), model.getPositionAt(edit.offset + edit.length)),
			text: edit.content,
		})), () => null);
		model.pushStackElement();
	}

	updateCheckpoint(id: string, property: keyof WorkflowCheckpoint, value: string | object | undefined): void {
		const index = this.parsed?.checkpoints.findIndex(checkpoint => checkpoint.id === id) ?? -1;
		if (index >= 0) {
			this.update(['checkpoints', index, property], value);
		}
	}

	makeLocalContract(id: string): void {
		const definition = this.parsed;
		const checkpoint = definition?.checkpoints.find(candidate => candidate.id === id);
		if (!definition || !checkpoint || checkpoint.localType) {
			return;
		}
		const type = this.resolveSnapshot().checkpoints.find(candidate => candidate.id === id)?.type;
		if (!type) {
			return;
		}
		this.update(['checkpoints', definition.checkpoints.indexOf(checkpoint)], makeWorkflowLocalContract(definition, checkpoint, type));
	}

	move(id: string, position: number): void {
		if (this.parsed) {
			this.update(['checkpoints'], moveWorkflowCheckpoint(this.parsed, id, position, this.types).checkpoints);
		}
	}

	remove(id: string): void {
		if (this.parsed) {
			this.update(['checkpoints'], removeWorkflowCheckpoint(this.parsed, id, this.types).checkpoints);
		}
	}

	async save(): Promise<boolean> {
		return !!this.entry.resource && !this.readOnly && !!await this.textFileService.save(this.entry.resource);
	}

	private async refreshCatalog(): Promise<void> {
		const generation = ++this.catalogGeneration;
		try {
			const catalog = await this.catalogService.getCatalog(this.workspace);
			if (this._store.isDisposed || generation !== this.catalogGeneration) {
				return;
			}
			this.types = getUsableCheckpointTypes(catalog);
			if (this.textModel) {
				this.updateFromDocument();
			} else {
				const current = catalog.workflows.find(entry => entry.key === this.entry.key);
				this.parsed = current?.definition;
				this.problems = current?.diagnostics ?? [{ code: 'source', severity: 'error', message: localize('workflow.sourceUnavailable', "The source no longer provides this workflow.") }];
				this.change.fire();
			}
		} catch (error) {
			if (!this._store.isDisposed && generation === this.catalogGeneration) {
				this.problems = [{ code: 'source', severity: 'error', message: String(error) }];
				this.change.fire();
			}
		}
	}

	async revert(): Promise<void> {
		if (this.entry.resource && !this.readOnly) {
			await this.textFileService.revert(this.entry.resource);
		}
	}

	private updateFromDocument(): void {
		if (!this.textModel) {
			return;
		}
		const entry = parseWorkflowDocument({ kind: 'workflow', content: this.textModel.getValue(), resource: this.entry.resource, source: this.entry.source });
		this.parsed = entry.definition as WorkflowDefinition | undefined;
		this.problems = entry.diagnostics;
		if (this.parsed && !this.problems.length) {
			try {
				resolveWorkflowDefinition(this.parsed, this.types);
			} catch (error) {
				this.problems = [{ code: 'invalid', severity: 'error', message: String(error), resource: this.entry.resource }];
			}
		}
		this.change.fire();
	}
}
