/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { ICustomEditorModel } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { ITextFileEditorModel, ITextFileService, TextFileEditorModelState } from 'vs/workbench/services/textfile/common/textfiles';

export class CustomTextEditorModel extends Disposable implements ICustomEditorModel {

	public static async create(
		instantiationService: IInstantiationService,
		viewType: string,
		resource: URI
	): Promise<CustomTextEditorModel> {
		return instantiationService.invokeFunction(async accessor => {
			const textModelResolverService = accessor.get(ITextModelService);
			const model = await textModelResolverService.createModelReference(resource);
			return instantiationService.createInstance(CustomTextEditorModel, viewType, resource, model);
		});
	}

	private readonly _textFileModel: ITextFileEditorModel | undefined;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	public readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	constructor(
		public readonly viewType: string,
		private readonly _resource: URI,
		private readonly _model: IReference<IResolvedTextEditorModel>,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();

		this._register(_model);

		this._textFileModel = this.textFileService.files.get(_resource);
		if (this._textFileModel) {
			this._register(this._textFileModel.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
		}

		this._register(this.textFileService.files.onDidChangeDirty(e => {
			if (isEqual(this.resource, e.resource)) {
				this._onDidChangeDirty.fire();
				this._onDidChangeContent.fire();
			}
		}));
	}

	public get resource() {
		return this._resource;
	}

	public isEditable(): boolean {
		return !this._model.object.isReadonly();
	}

	public isOnReadonlyFileSystem(): boolean {
		return this._fileService.hasCapability(this._resource, FileSystemProviderCapabilities.Readonly);
	}

	public get backupId() {
		return undefined;
	}

	public isDirty(): boolean {
		return this.textFileService.isDirty(this.resource);
	}

	public isOrphaned(): boolean {
		return !!this._textFileModel?.hasState(TextFileEditorModelState.ORPHAN);
	}

	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	public async revert(options?: IRevertOptions) {
		return this.textFileService.revert(this.resource, options);
	}

	public saveCustomEditor(options?: ISaveOptions): Promise<URI | undefined> {
		return this.textFileService.save(this.resource, options);
	}

	public async saveCustomEditorAs(resource: URI, targetResource: URI, options?: ISaveOptions): Promise<boolean> {
		return !!await this.textFileService.saveAs(resource, targetResource, options);
	}
}
