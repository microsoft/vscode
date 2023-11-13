/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { IUndoRedoDelegate, MultiModelEditStackElement } from 'vs/editor/common/model/editStack';

export class ModelUndoRedoParticipant extends Disposable implements IUndoRedoDelegate {
	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
	) {
		super();
		this._register(this._modelService.onModelRemoved((model) => {
			// a model will get disposed, so let's check if the undo redo stack is maintained
			const elements = this._undoRedoService.getElements(model.uri);
			if (elements.past.length === 0 && elements.future.length === 0) {
				return;
			}
			for (const element of elements.past) {
				if (element instanceof MultiModelEditStackElement) {
					element.setDelegate(this);
				}
			}
			for (const element of elements.future) {
				if (element instanceof MultiModelEditStackElement) {
					element.setDelegate(this);
				}
			}
		}));
	}

	public prepareUndoRedo(element: MultiModelEditStackElement): IDisposable | Promise<IDisposable> {
		// Load all the needed text models
		const missingModels = element.getMissingModels();
		if (missingModels.length === 0) {
			// All models are available!
			return Disposable.None;
		}

		const disposablesPromises = missingModels.map(async (uri) => {
			try {
				const reference = await this._textModelService.createModelReference(uri);
				return <IDisposable>reference;
			} catch (err) {
				// This model could not be loaded, maybe it was deleted in the meantime?
				return Disposable.None;
			}
		});

		return Promise.all(disposablesPromises).then(disposables => {
			return {
				dispose: () => dispose(disposables)
			};
		});
	}
}
