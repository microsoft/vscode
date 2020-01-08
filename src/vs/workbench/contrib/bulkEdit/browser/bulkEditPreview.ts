/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { WorkspaceEdit, isResourceTextEdit, TextEdit } from 'vs/editor/common/modes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mergeSort } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { values } from 'vs/base/common/map';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export const enum BulkFileOperationType {
	None = 0,
	Create = 0b0001,
	Delete = 0b0010,
	Rename = 0b0100,
}

export class BulkFileOperation {

	type = BulkFileOperationType.None;
	textEdits: TextEdit[] = [];

	constructor(readonly uri: URI) { }

	addType(type: BulkFileOperationType) {
		this.type += type;
	}

	addEdits(edits: TextEdit[]) {
		this.textEdits = this.textEdits.concat(edits);
	}
}

export class BulkFileOperations {

	static async create(_accessor: ServicesAccessor, bulkEdit: WorkspaceEdit): Promise<BulkFileOperations> {

		const operationByResource = new Map<string, BulkFileOperation>();

		for (const edit of bulkEdit.edits) {

			let uri: URI;
			let type: BulkFileOperationType;
			let textEdits: TextEdit[] | undefined;

			if (isResourceTextEdit(edit)) {
				type = BulkFileOperationType.None;
				uri = edit.resource;
				textEdits = edit.edits;

			} else if (edit.newUri && edit.oldUri) {
				type = BulkFileOperationType.Rename;
				uri = edit.oldUri;

			} else if (edit.oldUri) {
				type = BulkFileOperationType.Delete;
				uri = edit.oldUri;

			} else if (edit.newUri) {
				type = BulkFileOperationType.Create;
				uri = edit.newUri;

			} else {
				// invalid edit -> skip
				continue;
			}


			const key = uri.toString();
			let operation = operationByResource.get(key);
			if (!operation) {
				operation = new BulkFileOperation(uri);
				operationByResource.set(key, operation);
			}

			operation.addType(type);
			if (textEdits) {
				operation.addEdits(textEdits);
			}
		}

		//todo@joh filter noops

		return new BulkFileOperations(values(operationByResource));
	}

	constructor(readonly fileOperations: BulkFileOperation[]) { }
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

	constructor(
		private readonly _operations: BulkFileOperations,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService
	) {
		this._disposables.add(this._textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this));
		this._ready = this._prepareModels();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private async _prepareModels() {

		const getOrCreatePreviewModel = async (uri: URI) => {
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
			}
			// this is a little weird but otherwise editors and other cusomers
			// will dispose my models before they should be disposed...
			// And all of this is off the eventloop to prevent endless recursion
			new Promise(async () => this._disposables.add(await this._textModelResolverService.createModelReference(model!.uri)));
			return model;
		};

		for (let operation of this._operations.fileOperations) {
			const model = await getOrCreatePreviewModel(operation.uri);
			const editOperations = mergeSort(
				operation.textEdits.map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text)),
				(a, b) => Range.compareRangesUsingStarts(a.range, b.range)
			);
			model.applyEdits(editOperations);
		}
	}

	async provideTextContent(previewUri: URI) {
		if (previewUri.toString() === BulkEditPreviewProvider.emptyPreview.toString()) {
			return this._modelService.createModel('', null, previewUri);
		}
		await this._ready;
		return this._modelService.getModel(previewUri);
	}
}
