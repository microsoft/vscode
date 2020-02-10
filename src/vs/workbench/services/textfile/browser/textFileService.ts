/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { Emitter, AsyncEmitter } from 'vs/base/common/event';
import { IResult, ITextFileOperationResult, ITextFileService, ITextFileStreamContent, ITextFileEditorModel, ITextFileContent, IResourceEncodings, IReadTextFileOptions, IWriteTextFileOptions, toBufferOrReadable, TextFileOperationError, TextFileOperationResult, FileOperationWillRunEvent, FileOperationDidRunEvent, ITextFileSaveOptions, ITextFileEditorModelManager, ISaveParticipant } from 'vs/workbench/services/textfile/common/textfiles';
import { IRevertOptions, IEncodingSupport } from 'vs/workbench/common/editor';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileService, FileOperationError, FileOperationResult, IFileStatWithMetadata, ICreateFileOptions, FileOperation } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUntitledTextEditorService, IUntitledTextEditorModelManager } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { UntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { isEqualOrParent, isEqual, joinPath, dirname, basename, toLocalResource } from 'vs/base/common/resources';
import { IDialogService, IFileDialogService, IConfirmation } from 'vs/platform/dialogs/common/dialogs';
import { VSBuffer } from 'vs/base/common/buffer';
import { ITextSnapshot, ITextModel } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModelService, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { coalesce } from 'vs/base/common/arrays';
import { suggestFilename } from 'vs/base/common/mime';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 */
export abstract class AbstractTextFileService extends Disposable implements ITextFileService {

	_serviceBrand: undefined;

	//#region events

	private _onWillRunOperation = this._register(new AsyncEmitter<FileOperationWillRunEvent>());
	readonly onWillRunOperation = this._onWillRunOperation.event;

	private _onDidRunOperation = this._register(new Emitter<FileOperationDidRunEvent>());
	readonly onDidRunOperation = this._onDidRunOperation.event;

	//#endregion

	readonly files: ITextFileEditorModelManager = this._register(this.instantiationService.createInstance(TextFileEditorModelManager));

	readonly untitled: IUntitledTextEditorModelManager = this.untitledTextEditorService;

	saveErrorHandler = (() => {
		const notificationService = this.notificationService;

		return {
			onSaveError(error: Error, model: ITextFileEditorModel): void {
				notificationService.error(nls.localize('genericSaveError', "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
			}
		};
	})();

	saveParticipant: ISaveParticipant | undefined = undefined;

	abstract get encoding(): IResourceEncodings;

	constructor(
		@IFileService protected readonly fileService: IFileService,
		@IUntitledTextEditorService private untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService protected readonly lifecycleService: ILifecycleService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService protected readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IFilesConfigurationService protected readonly filesConfigurationService: IFilesConfigurationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@INotificationService private readonly notificationService: INotificationService,
		@IRemotePathService private readonly remotePathService: IRemotePathService
	) {
		super();

		this.registerListeners();
	}

	protected registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	//#region text file read / write

	async read(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileContent> {
		const content = await this.fileService.readFile(resource, options);

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		this.validateBinary(content.value, options);

		return {
			...content,
			encoding: 'utf8',
			value: content.value.toString()
		};
	}

	async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		const stream = await this.fileService.readFileStream(resource, options);

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		let checkedForBinary = false;
		const throwOnBinary = (data: VSBuffer): Error | undefined => {
			if (!checkedForBinary) {
				checkedForBinary = true;

				this.validateBinary(data, options);
			}

			return undefined;
		};

		return {
			...stream,
			encoding: 'utf8',
			value: await createTextBufferFactoryFromStream(stream.value, undefined, options?.acceptTextOnly ? throwOnBinary : undefined)
		};
	}

	private validateBinary(buffer: VSBuffer, options?: IReadTextFileOptions): void {
		if (!options || !options.acceptTextOnly) {
			return; // no validation needed
		}

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		for (let i = 0; i < buffer.byteLength && i < 512; i++) {
			if (buffer.readUInt8(i) === 0) {
				throw new TextFileOperationError(nls.localize('fileBinaryError', "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY, options);
			}
		}
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.writeFile(resource, toBufferOrReadable(value), options);
	}

	//#endregion

	//#region text file IO primitives (create, move, copy, delete)

	async create(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: FileOperation.CREATE, target: resource }, CancellationToken.None);

		const stat = await this.doCreate(resource, value, options);

		// If we had an existing model for the given resource, load
		// it again to make sure it is up to date with the contents
		// we just wrote into the underlying resource by calling
		// revert()
		const existingModel = this.files.get(resource);
		if (existingModel && !existingModel.isDisposed()) {
			await existingModel.revert();
		}

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(FileOperation.CREATE, resource));

		return stat;
	}

	protected doCreate(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.createFile(resource, toBufferOrReadable(value), options);
	}

	async move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, true, overwrite);
	}

	async copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, false, overwrite);
	}

	private async moveOrCopy(source: URI, target: URI, move: boolean, overwrite?: boolean): Promise<IFileStatWithMetadata> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: move ? FileOperation.MOVE : FileOperation.COPY, target, source }, CancellationToken.None);

		// find all models that related to either source or target (can be many if resource is a folder)
		const sourceModels: ITextFileEditorModel[] = [];
		const targetModels: ITextFileEditorModel[] = [];
		for (const model of this.getFileModels()) {
			const resource = model.resource;

			if (isEqualOrParent(resource, target, false /* do not ignorecase, see https://github.com/Microsoft/vscode/issues/56384 */)) {
				targetModels.push(model);
			}

			if (isEqualOrParent(resource, source)) {
				sourceModels.push(model);
			}
		}

		// remember each source model to load again after move is done
		// with optional content to restore if it was dirty
		type ModelToRestore = { resource: URI; snapshot?: ITextSnapshot; encoding?: string; mode?: string };
		const modelsToRestore: ModelToRestore[] = [];
		for (const sourceModel of sourceModels) {
			const sourceModelResource = sourceModel.resource;

			// If the source is the actual model, just use target as new resource
			let modelToRestoreResource: URI;
			if (isEqual(sourceModelResource, source)) {
				modelToRestoreResource = target;
			}

			// Otherwise a parent folder of the source is being moved, so we need
			// to compute the target resource based on that
			else {
				modelToRestoreResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
			}

			const modelToRestore: ModelToRestore = { resource: modelToRestoreResource, encoding: sourceModel.getEncoding() };
			if (sourceModel.isDirty()) {
				modelToRestore.snapshot = sourceModel.createSnapshot();
			}

			modelsToRestore.push(modelToRestore);
		}

		// handle dirty models depending on the operation:
		// - move: revert both source and target (if any)
		// - copy: revert target (if any)
		const dirtyModelsToRevert = (move ? [...sourceModels, ...targetModels] : [...targetModels]).filter(model => model.isDirty());
		await this.doRevertFiles(dirtyModelsToRevert.map(dirtyModel => dirtyModel.resource), { soft: true });

		// now we can rename the source to target via file operation
		let stat: IFileStatWithMetadata;
		try {
			if (move) {
				stat = await this.fileService.move(source, target, overwrite);
			} else {
				stat = await this.fileService.copy(source, target, overwrite);
			}
		} catch (error) {

			// in case of any error, ensure to set dirty flag back
			dirtyModelsToRevert.forEach(dirtyModel => dirtyModel.setDirty(true));

			throw error;
		}

		// finally, restore models that we had loaded previously
		await Promise.all(modelsToRestore.map(async modelToRestore => {

			// restore the model, forcing a reload. this is important because
			// we know the file has changed on disk after the move and the
			// model might have still existed with the previous state. this
			// ensures we are not tracking a stale state.
			const restoredModel = await this.files.resolve(modelToRestore.resource, { reload: { async: false }, encoding: modelToRestore.encoding, mode: modelToRestore.mode });

			// restore previous dirty content if any and ensure to mark
			// the model as dirty
			if (modelToRestore.snapshot && restoredModel.isResolved()) {
				this.modelService.updateModel(restoredModel.textEditorModel, createTextBufferFactoryFromSnapshot(modelToRestore.snapshot));

				restoredModel.setDirty(true);
			}
		}));

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(move ? FileOperation.MOVE : FileOperation.COPY, target, source));

		return stat;
	}

	async delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: FileOperation.DELETE, target: resource }, CancellationToken.None);

		// Check for any existing dirty file model for the resource
		// and do a soft revert before deleting to be able to close
		// any opened editor with these files
		const dirtyFiles = this.getDirtyFileModels().map(dirtyFileModel => dirtyFileModel.resource).filter(dirty => isEqualOrParent(dirty, resource));
		await this.doRevertFiles(dirtyFiles, { soft: true });

		// Now actually delete from disk
		await this.fileService.del(resource, options);

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(FileOperation.DELETE, resource));
	}

	//#endregion

	//#region save

	async save(resource: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {

		// Untitled
		if (resource.scheme === Schemas.untitled) {
			const model = this.untitled.get(resource);
			if (model) {
				let targetUri: URI | undefined;

				// Untitled with associated file path don't need to prompt
				if (model.hasAssociatedFilePath) {
					targetUri = await this.suggestSavePath(resource);
				}

				// Otherwise ask user
				else {
					targetUri = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(resource), options?.availableFileSystems);
				}

				// Save as if target provided
				if (targetUri) {
					return this.saveAs(resource, targetUri, options);
				}
			}
		}

		// File
		else {
			const model = this.files.get(resource);
			if (model) {

				// Save with options
				await model.save(options);

				return !model.isDirty() ? resource : undefined;
			}
		}

		return undefined;
	}

	private getFileModels(resources?: URI[]): ITextFileEditorModel[] {
		if (Array.isArray(resources)) {
			return coalesce(resources.map(resource => this.files.get(resource)));
		}

		return this.files.getAll();
	}

	private getDirtyFileModels(resources?: URI[]): ITextFileEditorModel[] {
		return this.getFileModels(resources).filter(model => model.isDirty());
	}

	async saveAs(source: URI, target?: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {

		// Get to target resource
		if (!target) {
			target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(source), options?.availableFileSystems);
		}

		if (!target) {
			return; // user canceled
		}

		// Just save if target is same as models own resource
		if (source.toString() === target.toString()) {
			return this.save(source, options);
		}

		// Do it
		return this.doSaveAs(source, target, options);
	}

	private async doSaveAs(source: URI, target: URI, options?: ITextFileSaveOptions): Promise<URI> {
		let success = false;

		// If the source is an existing text file model, we can directly
		// use that model to copy the contents to the target destination
		const textFileModel = this.files.get(source);
		if (textFileModel && textFileModel.isResolved()) {
			success = await this.doSaveAsTextFile(textFileModel, source, target, options);
		}

		// Otherwise if the source can be handled by the file service
		// we can simply invoke the copy() function to save as
		else if (this.fileService.canHandleResource(source)) {
			await this.fileService.copy(source, target);

			success = true;
		}

		// Next, if the source does not seem to be a file, we try to
		// resolve a text model from the resource to get at the
		// contents and additional meta data (e.g. encoding).
		else if (this.textModelService.hasTextModelContentProvider(source.scheme)) {
			const modelReference = await this.textModelService.createModelReference(source);
			success = await this.doSaveAsTextFile(modelReference.object, source, target, options);

			modelReference.dispose(); // free up our use of the reference
		}

		// Finally we simply check if we can find a editor model that
		// would give us access to the contents.
		else {
			const textModel = this.modelService.getModel(source);
			if (textModel) {
				success = await this.doSaveAsTextFile(textModel, source, target, options);
			}
		}

		// Revert the source if result is success
		if (success) {
			await this.revert(source);
		}

		return target;
	}

	private async doSaveAsTextFile(sourceModel: IResolvedTextEditorModel | ITextModel, source: URI, target: URI, options?: ITextFileSaveOptions): Promise<boolean> {

		// Find source encoding if any
		let sourceModelEncoding: string | undefined = undefined;
		const sourceModelWithEncodingSupport = (sourceModel as unknown as IEncodingSupport);
		if (typeof sourceModelWithEncodingSupport.getEncoding === 'function') {
			sourceModelEncoding = sourceModelWithEncodingSupport.getEncoding();
		}

		// Prefer an existing model if it is already loaded for the given target resource
		let targetExists: boolean = false;
		let targetModel = this.files.get(target);
		if (targetModel?.isResolved()) {
			targetExists = true;
		}

		// Otherwise create the target file empty if it does not exist already and resolve it from there
		else {
			targetExists = await this.fileService.exists(target);

			// create target file adhoc if it does not exist yet
			if (!targetExists) {
				await this.create(target, '');
			}

			try {
				targetModel = await this.files.resolve(target, { encoding: sourceModelEncoding });
			} catch (error) {
				// if the target already exists and was not created by us, it is possible
				// that we cannot load the target as text model if it is binary or too
				// large. in that case we have to delete the target file first and then
				// re-run the operation.
				if (targetExists) {
					if (
						(<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY ||
						(<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE
					) {
						await this.fileService.del(target);

						return this.doSaveAsTextFile(sourceModel, source, target, options);
					}
				}

				throw error;
			}
		}

		// Confirm to overwrite if we have an untitled file with associated file where
		// the file actually exists on disk and we are instructed to save to that file
		// path. This can happen if the file was created after the untitled file was opened.
		// See https://github.com/Microsoft/vscode/issues/67946
		let write: boolean;
		if (sourceModel instanceof UntitledTextEditorModel && sourceModel.hasAssociatedFilePath && targetExists && isEqual(target, toLocalResource(sourceModel.resource, this.environmentService.configuration.remoteAuthority))) {
			write = await this.confirmOverwrite(target);
		} else {
			write = true;
		}

		if (!write) {
			return false;
		}

		let sourceTextModel: ITextModel | undefined = undefined;
		if (sourceModel instanceof BaseTextEditorModel) {
			if (sourceModel.isResolved()) {
				sourceTextModel = sourceModel.textEditorModel;
			}
		} else {
			sourceTextModel = sourceModel as ITextModel;
		}

		let targetTextModel: ITextModel | undefined = undefined;
		if (targetModel.isResolved()) {
			targetTextModel = targetModel.textEditorModel;
		}

		// take over model value, encoding and mode (only if more specific) from source model
		if (sourceTextModel && targetTextModel) {

			// encoding
			targetModel.updatePreferredEncoding(sourceModelEncoding);

			// content
			this.modelService.updateModel(targetTextModel, createTextBufferFactoryFromSnapshot(sourceTextModel.createSnapshot()));

			// mode
			const sourceMode = sourceTextModel.getLanguageIdentifier();
			const targetMode = targetTextModel.getLanguageIdentifier();
			if (sourceMode.language !== PLAINTEXT_MODE_ID && targetMode.language === PLAINTEXT_MODE_ID) {
				targetTextModel.setMode(sourceMode); // only use if more specific than plain/text
			}

			// transient properties
			const sourceTransientProperties = this.codeEditorService.getTransientModelProperties(sourceTextModel);
			if (sourceTransientProperties) {
				for (const [key, value] of sourceTransientProperties) {
					this.codeEditorService.setTransientModelProperty(targetTextModel, key, value);
				}
			}
		}

		// save model
		await targetModel.save(options);

		return true;
	}

	private async confirmOverwrite(resource: URI): Promise<boolean> {
		const confirm: IConfirmation = {
			message: nls.localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
			detail: nls.localize('irreversible', "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
			primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
			type: 'warning'
		};

		return (await this.dialogService.confirm(confirm)).confirmed;
	}

	private async suggestSavePath(resource: URI): Promise<URI> {

		// Just take the resource as is if the file service can handle it
		if (this.fileService.canHandleResource(resource)) {
			return resource;
		}

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;

		// Otherwise try to suggest a path that can be saved
		let suggestedFilename: string | undefined = undefined;
		if (resource.scheme === Schemas.untitled) {
			const model = this.untitledTextEditorService.get(resource);
			if (model) {

				// Untitled with associated file path
				if (model.hasAssociatedFilePath) {
					return toLocalResource(resource, remoteAuthority);
				}

				// Untitled without associated file path
				const mode = model.getMode();
				if (mode !== PLAINTEXT_MODE_ID) { // do not suggest when the mode ID is simple plain text
					suggestedFilename = suggestFilename(mode, model.name);
				} else {
					suggestedFilename = model.name;
				}
			}
		}

		// Fallback to basename of resource
		if (!suggestedFilename) {
			suggestedFilename = basename(resource);
		}

		// Try to place where last active file was if any
		// Otherwise fallback to user home
		return joinPath(this.fileDialogService.defaultFilePath() || (await this.remotePathService.userHome), suggestedFilename);
	}

	//#endregion

	//#region revert

	async revert(resource: URI, options?: IRevertOptions): Promise<boolean> {

		// Untitled
		if (resource.scheme === Schemas.untitled) {
			const model = this.untitled.get(resource);
			if (model) {
				return model.revert(options);
			}

			return false;
		}

		// File
		return !(await this.doRevertFiles([resource], options)).results.some(result => result.error);
	}

	private async doRevertFiles(resources: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult> {
		const fileModels = options?.force ? this.getFileModels(resources) : this.getDirtyFileModels(resources);

		const mapResourceToResult = new ResourceMap<IResult>();
		fileModels.forEach(fileModel => {
			mapResourceToResult.set(fileModel.resource, {
				source: fileModel.resource
			});
		});

		await Promise.all(fileModels.map(async model => {

			// Revert through model
			await model.revert(options);

			// If model is still dirty, mark the resulting operation as error
			if (model.isDirty()) {
				const result = mapResourceToResult.get(model.resource);
				if (result) {
					result.error = true;
				}
			}
		}));

		return { results: mapResourceToResult.values() };
	}

	//#endregion

	//#region dirty

	isDirty(resource: URI): boolean {
		const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
		if (model) {
			return model.isDirty();
		}

		return false;
	}

	//#endregion
}
