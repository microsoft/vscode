/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeSort } from 'vs/base/common/arrays';
import { dispose, IDisposable, IReference } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLineSequence, IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { isResourceFileEdit, isResourceTextEdit, ResourceFileEdit, ResourceTextEdit, WorkspaceEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModelService, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep, emptyProgress } from 'vs/platform/progress/common/progress';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILabelService } from 'vs/platform/label/common/label';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

abstract class Recording {

	static start(fileService: IFileService): Recording {

		let _changes = new Set<string>();
		let subscription = fileService.onAfterOperation(e => {
			_changes.add(e.resource.toString());
		});

		return {
			stop() { return subscription.dispose(); },
			hasChanged(resource) { return _changes.has(resource.toString()); }
		};
	}

	abstract stop(): void;
	abstract hasChanged(resource: URI): boolean;
}

type ValidationResult = { canApply: true } | { canApply: false, reason: URI };

class ModelEditTask implements IDisposable {

	private readonly _model: ITextModel;

	protected _edits: IIdentifiedSingleEditOperation[];
	private _expectedModelVersionId: number | undefined;
	protected _newEol: EndOfLineSequence | undefined;

	constructor(private readonly _modelReference: IReference<IResolvedTextEditorModel>) {
		this._model = this._modelReference.object.textEditorModel;
		this._edits = [];
	}

	dispose() {
		dispose(this._modelReference);
	}

	addEdit(resourceEdit: ResourceTextEdit): void {
		this._expectedModelVersionId = resourceEdit.modelVersionId;
		for (const edit of resourceEdit.edits) {
			if (typeof edit.eol === 'number') {
				// honor eol-change
				this._newEol = edit.eol;
			}
			if (!edit.range && !edit.text) {
				// lacks both a range and the text
				continue;
			}
			if (Range.isEmpty(edit.range) && !edit.text) {
				// no-op edit (replace empty range with empty text)
				continue;
			}

			// create edit operation
			let range: Range;
			if (!edit.range) {
				range = this._model.getFullModelRange();
			} else {
				range = Range.lift(edit.range);
			}
			this._edits.push(EditOperation.replaceMove(range, edit.text));
		}
	}

	validate(): ValidationResult {
		if (typeof this._expectedModelVersionId === 'undefined' || this._model.getVersionId() === this._expectedModelVersionId) {
			return { canApply: true };
		}
		return { canApply: false, reason: this._model.uri };
	}

	apply(): void {
		if (this._edits.length > 0) {
			this._edits = mergeSort(this._edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this._model.pushStackElement();
			this._model.pushEditOperations([], this._edits, () => []);
			this._model.pushStackElement();
		}
		if (this._newEol !== undefined) {
			this._model.pushStackElement();
			this._model.pushEOL(this._newEol);
			this._model.pushStackElement();
		}
	}
}

class EditorEditTask extends ModelEditTask {

	private _editor: ICodeEditor;

	constructor(modelReference: IReference<IResolvedTextEditorModel>, editor: ICodeEditor) {
		super(modelReference);
		this._editor = editor;
	}

	apply(): void {
		if (this._edits.length > 0) {
			this._edits = mergeSort(this._edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this._editor.pushUndoStop();
			this._editor.executeEdits('', this._edits);
			this._editor.pushUndoStop();
		}
		if (this._newEol !== undefined) {
			if (this._editor.hasModel()) {
				this._editor.pushUndoStop();
				this._editor.getModel().pushEOL(this._newEol);
				this._editor.pushUndoStop();
			}
		}
	}
}

class BulkEditModel implements IDisposable {

	private _textModelResolverService: ITextModelService;
	private _edits = new Map<string, ResourceTextEdit[]>();
	private _editor: ICodeEditor | undefined;
	private _tasks: ModelEditTask[] | undefined;
	private _progress: IProgress<void>;

	constructor(
		textModelResolverService: ITextModelService,
		editor: ICodeEditor | undefined,
		edits: ResourceTextEdit[],
		progress: IProgress<void>
	) {
		this._textModelResolverService = textModelResolverService;
		this._editor = editor;
		this._progress = progress;

		edits.forEach(this.addEdit, this);
	}

	dispose(): void {
		this._tasks = dispose(this._tasks!);
	}

	addEdit(edit: ResourceTextEdit): void {
		let array = this._edits.get(edit.resource.toString());
		if (!array) {
			array = [];
			this._edits.set(edit.resource.toString(), array);
		}
		array.push(edit);
	}

	async prepare(): Promise<BulkEditModel> {

		if (this._tasks) {
			throw new Error('illegal state - already prepared');
		}

		this._tasks = [];
		const promises: Promise<any>[] = [];

		this._edits.forEach((value, key) => {
			const promise = this._textModelResolverService.createModelReference(URI.parse(key)).then(ref => {
				const model = ref.object;

				if (!model || !model.textEditorModel) {
					throw new Error(`Cannot load file ${key}`);
				}

				let task: ModelEditTask;
				if (this._editor && this._editor.hasModel() && this._editor.getModel().uri.toString() === model.textEditorModel.uri.toString()) {
					task = new EditorEditTask(ref, this._editor);
				} else {
					task = new ModelEditTask(ref);
				}

				value.forEach(edit => task.addEdit(edit));
				this._tasks!.push(task);
				this._progress.report(undefined);
			});
			promises.push(promise);
		});

		await Promise.all(promises);

		return this;
	}

	validate(): ValidationResult {
		for (const task of this._tasks!) {
			const result = task.validate();
			if (!result.canApply) {
				return result;
			}
		}
		return { canApply: true };
	}

	apply(): void {
		for (const task of this._tasks!) {
			task.apply();
			this._progress.report(undefined);
		}
	}
}

export type Edit = ResourceFileEdit | ResourceTextEdit;

export class BulkEdit {

	private _edits: Edit[] = [];
	private _editor: ICodeEditor | undefined;
	private _progress: IProgress<IProgressStep>;

	constructor(
		editor: ICodeEditor | undefined,
		progress: IProgress<IProgressStep> | undefined,
		@ILogService private readonly _logService: ILogService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILabelService private readonly _uriLabelServie: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._editor = editor;
		this._progress = progress || emptyProgress;
	}

	add(edits: Edit[] | Edit): void {
		if (Array.isArray(edits)) {
			this._edits.push(...edits);
		} else {
			this._edits.push(edits);
		}
	}

	ariaMessage(): string {
		const editCount = this._edits.reduce((prev, cur) => isResourceFileEdit(cur) ? prev : prev + cur.edits.length, 0);
		const resourceCount = this._edits.length;
		if (editCount === 0) {
			return localize('summary.0', "Made no edits");
		} else if (editCount > 1 && resourceCount > 1) {
			return localize('summary.nm', "Made {0} text edits in {1} files", editCount, resourceCount);
		} else {
			return localize('summary.n0', "Made {0} text edits in one file", editCount, resourceCount);
		}
	}

	async perform(): Promise<void> {

		let seen = new Set<string>();
		let total = 0;

		const groups: Edit[][] = [];
		let group: Edit[] | undefined;
		for (const edit of this._edits) {
			if (!group
				|| (isResourceFileEdit(group[0]) && !isResourceFileEdit(edit))
				|| (isResourceTextEdit(group[0]) && !isResourceTextEdit(edit))
			) {
				group = [];
				groups.push(group);
			}
			group.push(edit);

			if (isResourceFileEdit(edit)) {
				total += 1;
			} else if (!seen.has(edit.resource.toString())) {
				seen.add(edit.resource.toString());
				total += 2;
			}
		}

		// define total work and progress callback
		// for child operations
		this._progress.report({ total });

		let progress: IProgress<void> = { report: _ => this._progress.report({ increment: 1 }) };

		// do it.
		for (const group of groups) {
			if (isResourceFileEdit(group[0])) {
				await this._performFileEdits(<ResourceFileEdit[]>group, progress);
			} else {
				await this._performTextEdits(<ResourceTextEdit[]>group, progress);
			}
		}
	}

	private async _performFileEdits(edits: ResourceFileEdit[], progress: IProgress<void>) {
		this._logService.debug('_performFileEdits', JSON.stringify(edits));
		for (const edit of edits) {
			progress.report(undefined);

			let options = edit.options || {};

			if (edit.newUri && edit.oldUri) {
				// rename
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._textFileService.move(edit.oldUri, edit.newUri, options.overwrite);

			} else if (!edit.newUri && edit.oldUri) {
				// delete file
				if (await this._fileService.exists(edit.oldUri)) {
					let useTrash = this._configurationService.getValue<boolean>('files.enableTrash');
					if (useTrash && !(this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash))) {
						useTrash = false; // not supported by provider
					}
					await this._textFileService.delete(edit.oldUri, { useTrash, recursive: options.recursive });
				} else if (!options.ignoreIfNotExists) {
					throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
				}
			} else if (edit.newUri && !edit.oldUri) {
				// create file
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._textFileService.create(edit.newUri, undefined, { overwrite: options.overwrite });
			}
		}
	}

	private async _performTextEdits(edits: ResourceTextEdit[], progress: IProgress<void>): Promise<void> {
		this._logService.debug('_performTextEdits', JSON.stringify(edits));

		const recording = Recording.start(this._fileService);
		const model = new BulkEditModel(this._textModelService, this._editor, edits, progress);

		await model.prepare();

		const conflicts = edits
			.filter(edit => recording.hasChanged(edit.resource))
			.map(edit => this._uriLabelServie.getUriLabel(edit.resource, { relative: true }));

		recording.stop();

		if (conflicts.length > 0) {
			model.dispose();
			throw new Error(localize('conflict', "These files have changed in the meantime: {0}", conflicts.join(', ')));
		}

		const validationResult = model.validate();
		if (validationResult.canApply === false) {
			throw new Error(`${validationResult.reason.toString()} has changed in the meantime`);
		}

		await model.apply();
		model.dispose();
	}
}

export class BulkEditService implements IBulkEditService {

	_serviceBrand: any;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IModelService private readonly _modelService: IModelService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {

	}

	apply(edit: WorkspaceEdit, options: IBulkEditOptions = {}): Promise<IBulkEditResult> {

		let { edits } = edit;
		let codeEditor = options.editor;

		// First check if loaded models were not changed in the meantime
		for (const edit of edits) {
			if (!isResourceFileEdit(edit) && typeof edit.modelVersionId === 'number') {
				let model = this._modelService.getModel(edit.resource);
				if (model && model.getVersionId() !== edit.modelVersionId) {
					// model changed in the meantime
					return Promise.reject(new Error(`${model.uri.toString()} has changed in the meantime`));
				}
			}
		}

		// try to find code editor
		// todo@joh, prefer edit that gets edited
		if (!codeEditor) {
			let candidate = this._editorService.activeTextEditorWidget;
			if (isCodeEditor(candidate)) {
				codeEditor = candidate;
			}
		}

		if (codeEditor && codeEditor.getConfiguration().readOnly) {
			// If the code editor is readonly still allow bulk edits to be applied #68549
			codeEditor = undefined;
		}
		const bulkEdit = new BulkEdit(codeEditor, options.progress, this._logService, this._textModelService, this._fileService, this._textFileService, this._labelService, this._configurationService);
		bulkEdit.add(edits);

		return bulkEdit.perform().then(() => {
			return { ariaSummary: bulkEdit.ariaMessage() };
		}).catch(err => {
			// console.log('apply FAILED');
			// console.log(err);
			this._logService.error(err);
			throw err;
		});
	}
}

registerSingleton(IBulkEditService, BulkEditService, true);
