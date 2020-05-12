/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { AsyncEmitter } from 'vs/base/common/event';
import { ITextFileService, ITextFileStreamContent, ITextFileContent, IResourceEncodings, IReadTextFileOptions, IWriteTextFileOptions, toBufferOrReadable, TextFileOperationError, TextFileOperationResult, ITextFileSaveOptions, ITextFileEditorModelManager, TextFileCreateEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IRevertOptions, IEncodingSupport } from 'vs/workbench/common/editor';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileService, FileOperationError, FileOperationResult, IFileStatWithMetadata, ICreateFileOptions, FileOperation } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUntitledTextEditorService, IUntitledTextEditorModelManager } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { UntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Schemas } from 'vs/base/common/network';
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { isEqual, joinPath, dirname, basename, toLocalResource } from 'vs/base/common/resources';
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
import { suggestFilename } from 'vs/base/common/mime';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { isValidBasename } from 'vs/base/common/extpath';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 */
export abstract class AbstractTextFileService extends Disposable implements ITextFileService {

	_serviceBrand: undefined;

	//#region events

	private _onDidCreateTextFile = this._register(new AsyncEmitter<TextFileCreateEvent>());
	readonly onDidCreateTextFile = this._onDidCreateTextFile.event;

	//#endregion

	readonly files: ITextFileEditorModelManager = this._register(this.instantiationService.createInstance(TextFileEditorModelManager));

	readonly untitled: IUntitledTextEditorModelManager = this.untitledTextEditorService;

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
		@IPathService private readonly pathService: IPathService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService
	) {
		super();

		this.registerListeners();
	}

	protected registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	//#region text file read / write / create

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

	async create(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {

		// file operation participation
		await this.workingCopyFileService.runFileOperationParticipants(resource, undefined, FileOperation.CREATE);

		// create file on disk
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
		await this._onDidCreateTextFile.fireAsync({ resource }, CancellationToken.None);

		return stat;
	}

	protected doCreate(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.createFile(resource, toBufferOrReadable(value), options);
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.writeFile(resource, toBufferOrReadable(value), options);
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
				return await model.save(options) ? resource : undefined;
			}
		}

		return undefined;
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
		return await targetModel.save(options);
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

				// Untitled without associated file path: use name
				// of untitled model if it is a valid path name
				let untitledName = model.name;
				if (!isValidBasename(untitledName)) {
					untitledName = basename(resource);
				}

				// Add mode file extension if specified
				const mode = model.getMode();
				if (mode !== PLAINTEXT_MODE_ID) {
					suggestedFilename = suggestFilename(mode, untitledName);
				} else {
					suggestedFilename = untitledName;
				}
			}
		}

		// Fallback to basename of resource
		if (!suggestedFilename) {
			suggestedFilename = basename(resource);
		}

		// Try to place where last active file was if any
		// Otherwise fallback to user home
		return joinPath(this.fileDialogService.defaultFilePath() || (await this.pathService.userHome), suggestedFilename);
	}

	//#endregion

	//#region revert

	async revert(resource: URI, options?: IRevertOptions): Promise<void> {

		// Untitled
		if (resource.scheme === Schemas.untitled) {
			const model = this.untitled.get(resource);
			if (model) {
				return model.revert(options);
			}
		}

		// File
		else {
			const model = this.files.get(resource);
			if (model && (model.isDirty() || options?.force)) {
				return model.revert(options);
			}
		}
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
