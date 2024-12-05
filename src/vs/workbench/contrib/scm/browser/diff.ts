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
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { DiffAlgorithmName } from '../../../../editor/common/services/editorWorker.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';

export const IDirtyDiffModelService = createDecorator<IDirtyDiffModelService>('IDirtyDiffModelService');

export interface IDirtyDiffModelService {
	_serviceBrand: undefined;

	/**
	 * Returns `undefined` if the editor model is not resolved
	 * @param uri
	 */
	getDirtyDiffModel(uri: URI): DirtyDiffModel | undefined;

	/**
	 * Returns `undefined` if the editor model is not resolved
	 * @param uri
	 * @param algorithm
	 */
	getDiffModel(uri: URI, algorithm: DiffAlgorithmName): DirtyDiffModel | undefined;
}

export class DirtyDiffModelService extends Disposable implements IDirtyDiffModelService {
	_serviceBrand: undefined;

	private readonly _dirtyDiffModels = new ResourceMap<DirtyDiffModel>();
	private readonly _diffModels = new ResourceMap<Map<DiffAlgorithmName, DirtyDiffModel>>();

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

			// Dispose dirty diff models for text editors that are not visible
			for (const [uri, dirtyDiffModel] of this._dirtyDiffModels) {
				const textEditorControl = visibleTextEditorControls
					.find(editor => isCodeEditor(editor) &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));

				if (textEditorControl) {
					continue;
				}

				dirtyDiffModel.dispose();
				this._dirtyDiffModels.delete(uri);
			}

			// Dispose diff models for diff editors that are not visible
			for (const [uri, dirtyDiffModel] of this._diffModels) {
				const diffEditorControl = visibleTextEditorControls
					.find(editor => isDiffEditor(editor) &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.modified.uri, uri));

				if (diffEditorControl) {
					continue;
				}

				for (const algorithm of dirtyDiffModel.keys()) {
					dirtyDiffModel.get(algorithm)?.dispose();
					dirtyDiffModel.delete(algorithm);
				}
				this._diffModels.delete(uri);
			}
		}));
	}

	getDirtyDiffModel(uri: URI): DirtyDiffModel | undefined {
		let model = this._dirtyDiffModels.get(uri);
		if (model) {
			return model;
		}

		const textFileModel = this.textFileService.files.get(uri);
		if (!textFileModel?.isResolved()) {
			return undefined;
		}

		model = this.instantiationService.createInstance(DirtyDiffModel, textFileModel, undefined);
		this._dirtyDiffModels.set(uri, model);

		return model;
	}

	getDiffModel(uri: URI, algorithm: DiffAlgorithmName): DirtyDiffModel | undefined {
		let model = this._diffModels.get(uri)?.get(algorithm);
		if (model) {
			return model;
		}

		const textFileModel = this.textFileService.files.get(uri);
		if (!textFileModel?.isResolved()) {
			return undefined;
		}

		model = this.instantiationService.createInstance(DirtyDiffModel, textFileModel, algorithm);
		if (!this._diffModels.has(uri)) {
			this._diffModels.set(uri, new Map());
		}
		this._diffModels.get(uri)!.set(algorithm, model);

		return model;
	}
}

registerSingleton(IDirtyDiffModelService, DirtyDiffModelService, InstantiationType.Delayed);
