/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { WorkspaceEdit, TextEdit, WorkspaceTextEdit, WorkspaceFileEdit } from 'vs/editor/common/modes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mergeSort, coalesceInPlace } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { Emitter, Event } from 'vs/base/common/event';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { ConflictDetector } from 'vs/workbench/services/bulkEdit/browser/conflicts';

class CheckedObject {

	private _checked: boolean = true;

	constructor(protected _emitter: Emitter<any>) { }

	updateChecked(checked: boolean) {
		if (this._checked !== checked) {
			this._checked = checked;
			this._emitter.fire(this);
		}
	}

	isChecked(): boolean {
		return this._checked;
	}
}

export class BulkTextEdit extends CheckedObject {

	constructor(
		readonly parent: BulkFileOperation,
		readonly edit: TextEdit,
		emitter: Emitter<BulkFileOperation | BulkTextEdit>
	) {
		super(emitter);
	}
}

export const enum BulkFileOperationType {
	TextEdit = 1,
	Create = 2,
	Delete = 4,
	Rename = 8,
}

export class BulkFileOperation extends CheckedObject {

	type: BulkFileOperationType = 0;
	textEdits: BulkTextEdit[] = [];
	originalEdits = new Map<number, WorkspaceTextEdit | WorkspaceFileEdit>();
	newUri?: URI;

	constructor(
		readonly uri: URI,
		readonly parent: BulkFileOperations
	) {
		super(parent._onDidChangeCheckedState);
	}

	addEdit(index: number, type: BulkFileOperationType, edit: WorkspaceTextEdit | WorkspaceFileEdit, ) {
		this.type += type;
		this.originalEdits.set(index, edit);
		if (WorkspaceTextEdit.is(edit)) {
			this.textEdits = this.textEdits.concat(edit.edits.map(edit => new BulkTextEdit(this, edit, this._emitter)));

		} else if (type === BulkFileOperationType.Rename) {
			this.newUri = edit.newUri;
		}
	}
}

export class BulkFileOperations {

	static async create(accessor: ServicesAccessor, bulkEdit: WorkspaceEdit): Promise<BulkFileOperations> {
		const result = accessor.get(IInstantiationService).createInstance(BulkFileOperations, bulkEdit);
		return await result._init();
	}

	readonly _onDidChangeCheckedState = new Emitter<BulkFileOperation | BulkTextEdit>();
	readonly onDidChangeCheckedState: Event<BulkFileOperation | BulkTextEdit> = this._onDidChangeCheckedState.event;

	readonly fileOperations: BulkFileOperation[] = [];

	readonly conflicts: ConflictDetector;

	constructor(
		private readonly _bulkEdit: WorkspaceEdit,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this.conflicts = instaService.createInstance(ConflictDetector, _bulkEdit);
	}

	dispose(): void {
		this.conflicts.dispose();
	}

	async _init() {
		const operationByResource = new Map<string, BulkFileOperation>();
		const newToOldUri = new Map<string, string>();

		for (let idx = 0; idx < this._bulkEdit.edits.length; idx++) {
			const edit = this._bulkEdit.edits[idx];

			let uri: URI;
			let type: BulkFileOperationType;

			if (WorkspaceTextEdit.is(edit)) {
				type = BulkFileOperationType.TextEdit;
				uri = edit.resource;

			} else if (edit.newUri && edit.oldUri) {
				type = BulkFileOperationType.Rename;
				uri = edit.oldUri;
				if (edit.options?.overwrite === undefined && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
					// noop -> "soft" rename to something that already exists
					continue;
				}
				// map newUri onto oldUri so that text-edit appear for
				// the same file element
				newToOldUri.set(edit.newUri.toString(), uri.toString());

			} else if (edit.oldUri) {
				type = BulkFileOperationType.Delete;
				uri = edit.oldUri;
				if (edit.options?.ignoreIfNotExists && !await this._fileService.exists(uri)) {
					// noop -> "soft" delete something that doesn't exist
					continue;
				}

			} else if (edit.newUri) {
				type = BulkFileOperationType.Create;
				uri = edit.newUri;
				if (edit.options?.overwrite === undefined && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
					// noop -> "soft" create something that already exists
					continue;
				}

			} else {
				// invalid edit -> skip
				continue;
			}

			let key = uri.toString();
			let operation = operationByResource.get(key);

			// rename
			if (!operation && newToOldUri.has(key)) {
				key = newToOldUri.get(key)!;
				operation = operationByResource.get(key);
			}

			if (!operation) {
				operation = new BulkFileOperation(uri, this);
				operationByResource.set(key, operation);
			}
			operation.addEdit(idx, type, edit);
		}

		operationByResource.forEach(value => this.fileOperations.push(value));
		return this;
	}

	asWorkspaceEdit(): WorkspaceEdit {
		const result: WorkspaceEdit = { edits: [] };
		let allAccepted = true;
		for (let file of this.fileOperations) {

			if (!file.isChecked()) {
				allAccepted = false;
				continue;
			}

			const keyOfEdit = (edit: TextEdit) => JSON.stringify(edit);
			const checkedEdits = new Set<string>();

			for (let edit of file.textEdits) {
				if (edit.isChecked()) {
					checkedEdits.add(keyOfEdit(edit.edit));
				}
			}

			file.originalEdits.forEach((value, idx) => {

				if (WorkspaceTextEdit.is(value)) {
					let newValue: WorkspaceTextEdit = { ...value, edits: [] };
					let allEditsAccepted = true;
					for (let edit of value.edits) {
						if (!checkedEdits.has(keyOfEdit(edit))) {
							allEditsAccepted = false;
						} else {
							newValue.edits.push(edit);
						}
					}
					if (!allEditsAccepted) {
						value = newValue;
						allAccepted = false;
					}
				}

				result.edits[idx] = value;
			});
		}
		if (!allAccepted) {
			// only return a new edit when something has changed
			coalesceInPlace(result.edits);
			return result;
		}
		return this._bulkEdit;

	}
}

export class BulkEditPreviewProvider implements ITextModelContentProvider {

	static readonly Schema = 'vscode-bulkeditpreview';

	static emptyPreview = URI.from({ scheme: BulkEditPreviewProvider.Schema, fragment: 'empty' });

	static asPreviewUri(uri: URI): URI {
		return URI.from({ scheme: BulkEditPreviewProvider.Schema, path: uri.path, query: uri.toString() });
	}

	static fromPreviewUri(uri: URI): URI {
		return URI.parse(uri.query);
	}

	private readonly _disposables = new DisposableStore();
	private readonly _ready: Promise<any>;
	private readonly _modelPreviewEdits = new Map<string, IIdentifiedSingleEditOperation[]>();

	constructor(
		private readonly _operations: BulkFileOperations,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService
	) {
		this._disposables.add(this._textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this));
		this._ready = this._init();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private async _init() {
		for (let operation of this._operations.fileOperations) {
			await this._applyTextEditsToPreviewModel(operation);
		}
		this._disposables.add(this._operations.onDidChangeCheckedState(element => {
			let operation = element instanceof BulkFileOperation ? element : element.parent;
			this._applyTextEditsToPreviewModel(operation);
		}));
	}

	private async _applyTextEditsToPreviewModel(operation: BulkFileOperation) {
		const model = await this._getOrCreatePreviewModel(operation.uri);

		// undo edits that have been done before
		let undoEdits = this._modelPreviewEdits.get(model.id);
		if (undoEdits) {
			model.applyEdits(undoEdits);
		}
		// compute new edits
		const newEdits = mergeSort(
			operation.textEdits.filter(edit => edit.isChecked() && edit.parent.isChecked()).map(edit => EditOperation.replaceMove(Range.lift(edit.edit.range), edit.edit.text)),
			(a, b) => Range.compareRangesUsingStarts(a.range, b.range)
		);
		// apply edits and keep undo edits
		undoEdits = model.applyEdits(newEdits);
		this._modelPreviewEdits.set(model.id, undoEdits);
	}

	private async _getOrCreatePreviewModel(uri: URI) {
		const previewUri = BulkEditPreviewProvider.asPreviewUri(uri);
		let model = this._modelService.getModel(previewUri);
		if (!model) {
			try {
				// try: copy existing
				const ref = await this._textModelResolverService.createModelReference(uri);
				const sourceModel = ref.object.textEditorModel;
				model = this._modelService.createModel(
					createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
					this._modeService.create(sourceModel.getLanguageIdentifier().language),
					previewUri
				);
				ref.dispose();

			} catch {
				// create NEW model
				model = this._modelService.createModel(
					'',
					this._modeService.createByFilepathOrFirstLine(previewUri),
					previewUri
				);
			}
			// this is a little weird but otherwise editors and other cusomers
			// will dispose my models before they should be disposed...
			// And all of this is off the eventloop to prevent endless recursion
			new Promise(async () => this._disposables.add(await this._textModelResolverService.createModelReference(model!.uri)));
		}
		return model;
	}

	async provideTextContent(previewUri: URI) {
		if (previewUri.toString() === BulkEditPreviewProvider.emptyPreview.toString()) {
			return this._modelService.createModel('', null, previewUri);
		}
		await this._ready;
		return this._modelService.getModel(previewUri);
	}
}
