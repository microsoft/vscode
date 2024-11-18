/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DirtyDiffModel } from './dirtydiffDecorator.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';

export const IDirtyDiffModelService = createDecorator<IDirtyDiffModelService>('IDirtyDiffModelService');

export interface IDirtyDiffModelService {
	_serviceBrand: undefined;
	getOrCreateModel(uri: URI): DirtyDiffModel | undefined;
}

export class DirtyDiffModelService extends Disposable implements IDirtyDiffModelService {
	_serviceBrand: undefined;

	private _models = new ResourceMap<DirtyDiffModel>();

	private _visibleTextEditorControls = observableFromEvent(
		this.editorService.onDidVisibleEditorsChange,
		() => this.editorService.visibleTextEditorControls);

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this._register(autorun(reader => {
			const visibleTextEditorControls = this._visibleTextEditorControls.read(reader);

			// Dispose models for editors that are not visible
			for (const [uri, dirtyDiffModel] of this._models) {
				const textEditorControl = visibleTextEditorControls
					.find(editor => isCodeEditor(editor) &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));

				if (textEditorControl) {
					continue;
				}

				dirtyDiffModel.dispose();
				this._models.delete(uri);
			}
		}));
	}

	getOrCreateModel(uri: URI): DirtyDiffModel | undefined {
		let model = this._models.get(uri);
		if (!model) {
			const textFileModel = this.textFileService.files.get(uri);
			if (!textFileModel?.isResolved()) {
				return undefined;
			}

			model = this.instantiationService.createInstance(DirtyDiffModel, textFileModel);
			this._models.set(uri, model);
		}

		return model;
	}
}

registerSingleton(IDirtyDiffModelService, DirtyDiffModelService, InstantiationType.Delayed);
