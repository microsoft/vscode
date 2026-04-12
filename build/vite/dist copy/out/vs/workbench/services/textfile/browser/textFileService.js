/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AbstractTextFileService_1;
import { localize } from '../../../../nls.js';
import { toBufferOrReadable, TextFileOperationError, stringToSnapshot } from '../common/textfiles.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extname as pathExtname } from '../../../../base/common/path.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IUntitledTextEditorService } from '../../untitled/common/untitledTextEditorService.js';
import { UntitledTextEditorModel } from '../../untitled/common/untitledTextEditorModel.js';
import { TextFileEditorModelManager } from '../common/textFileEditorModelManager.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../base/common/network.js';
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from '../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { joinPath, dirname, basename, toLocalResource, extname, isEqual } from '../../../../base/common/resources.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { bufferToStream } from '../../../../base/common/buffer.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IPathService } from '../../path/common/pathService.js';
import { IWorkingCopyFileService } from '../../workingCopy/common/workingCopyFileService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, WORKSPACE_EXTENSION } from '../../../../platform/workspace/common/workspace.js';
import { UTF8, UTF8_with_bom, UTF16be, UTF16le, encodingExists, toEncodeReadable, toDecodeStream } from '../common/encoding.js';
import { consumeStream } from '../../../../base/common/stream.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IElevatedFileService } from '../../files/common/elevatedFileService.js';
import { IDecorationsService } from '../../decorations/common/decorations.js';
import { Emitter } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { listErrorForeground } from '../../../../platform/theme/common/colorRegistry.js';
let AbstractTextFileService = class AbstractTextFileService extends Disposable {
    static { AbstractTextFileService_1 = this; }
    static { this.TEXTFILE_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource('textFileCreate.source', localize('textFileCreate.source', "File Created")); }
    static { this.TEXTFILE_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource('textFileOverwrite.source', localize('textFileOverwrite.source', "File Replaced")); }
    constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
        super();
        this.fileService = fileService;
        this.lifecycleService = lifecycleService;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.environmentService = environmentService;
        this.dialogService = dialogService;
        this.fileDialogService = fileDialogService;
        this.textResourceConfigurationService = textResourceConfigurationService;
        this.filesConfigurationService = filesConfigurationService;
        this.codeEditorService = codeEditorService;
        this.pathService = pathService;
        this.workingCopyFileService = workingCopyFileService;
        this.uriIdentityService = uriIdentityService;
        this.languageService = languageService;
        this.logService = logService;
        this.elevatedFileService = elevatedFileService;
        this.decorationsService = decorationsService;
        this.files = this._register(this.instantiationService.createInstance(TextFileEditorModelManager));
        this.untitled = untitledTextEditorService;
        this.provideDecorations();
    }
    //#region decorations
    provideDecorations() {
        // Text file model decorations
        const provider = this._register(new class extends Disposable {
            constructor(files) {
                super();
                this.files = files;
                this.label = localize('textFileModelDecorations', "Text File Model Decorations");
                this._onDidChange = this._register(new Emitter());
                this.onDidChange = this._onDidChange.event;
                this.registerListeners();
            }
            registerListeners() {
                // Creates
                this._register(this.files.onDidResolve(({ model }) => {
                    if (model.isReadonly() || model.hasState(4 /* TextFileEditorModelState.ORPHAN */)) {
                        this._onDidChange.fire([model.resource]);
                    }
                }));
                // Removals: once a text file model is no longer
                // under our control, make sure to signal this as
                // decoration change because from this point on we
                // have no way of updating the decoration anymore.
                this._register(this.files.onDidRemove(modelUri => this._onDidChange.fire([modelUri])));
                // Changes
                this._register(this.files.onDidChangeReadonly(model => this._onDidChange.fire([model.resource])));
                this._register(this.files.onDidChangeOrphaned(model => this._onDidChange.fire([model.resource])));
            }
            provideDecorations(uri) {
                const model = this.files.get(uri);
                if (!model || model.isDisposed()) {
                    return undefined;
                }
                const isReadonly = model.isReadonly();
                const isOrphaned = model.hasState(4 /* TextFileEditorModelState.ORPHAN */);
                // Readonly + Orphaned
                if (isReadonly && isOrphaned) {
                    return {
                        color: listErrorForeground,
                        letter: Codicon.lockSmall,
                        strikethrough: true,
                        tooltip: localize('readonlyAndDeleted', "Deleted, Read-only"),
                    };
                }
                // Readonly
                else if (isReadonly) {
                    return {
                        letter: Codicon.lockSmall,
                        tooltip: localize('readonly', "Read-only"),
                    };
                }
                // Orphaned
                else if (isOrphaned) {
                    return {
                        color: listErrorForeground,
                        strikethrough: true,
                        tooltip: localize('deleted', "Deleted"),
                    };
                }
                return undefined;
            }
        }(this.files));
        this._register(this.decorationsService.registerDecorationsProvider(provider));
    }
    get encoding() {
        if (!this._encoding) {
            this._encoding = this._register(this.instantiationService.createInstance(EncodingOracle));
        }
        return this._encoding;
    }
    async read(resource, options) {
        const [bufferStream, decoder] = await this.doRead(resource, {
            ...options,
            // optimization: since we know that the caller does not
            // care about buffering, we indicate this to the reader.
            // this reduces all the overhead the buffered reading
            // has (open, read, close) if the provider supports
            // unbuffered reading.
            preferUnbuffered: true
        });
        return {
            ...bufferStream,
            encoding: decoder.detected.encoding || UTF8,
            value: await consumeStream(decoder.stream, strings => strings.join(''))
        };
    }
    async readStream(resource, options) {
        const [bufferStream, decoder] = await this.doRead(resource, options);
        return {
            ...bufferStream,
            encoding: decoder.detected.encoding || UTF8,
            value: await createTextBufferFactoryFromStream(decoder.stream)
        };
    }
    async doRead(resource, options) {
        const cts = new CancellationTokenSource();
        // read stream raw (either buffered or unbuffered)
        let bufferStream;
        if (options?.preferUnbuffered) {
            const content = await this.fileService.readFile(resource, options, cts.token);
            bufferStream = {
                ...content,
                value: bufferToStream(content.value)
            };
        }
        else {
            bufferStream = await this.fileService.readFileStream(resource, options, cts.token);
        }
        // read through encoding library
        try {
            const decoder = await this.doGetDecodedStream(resource, bufferStream.value, options);
            return [bufferStream, decoder];
        }
        catch (error) {
            // Make sure to cancel reading on error to
            // stop file service activity as soon as
            // possible. When for example a large binary
            // file is read we want to cancel the read
            // instantly.
            // Refs:
            // - https://github.com/microsoft/vscode/issues/138805
            // - https://github.com/microsoft/vscode/issues/132771
            cts.dispose(true);
            // special treatment for streams that are binary
            if (error.decodeStreamErrorKind === 1 /* DecodeStreamErrorKind.STREAM_IS_BINARY */) {
                throw new TextFileOperationError(localize('fileBinaryError', "File seems to be binary and cannot be opened as text"), 0 /* TextFileOperationResult.FILE_IS_BINARY */, options);
            }
            // re-throw any other error as it is
            else {
                throw error;
            }
        }
    }
    async create(operations, undoInfo) {
        const operationsWithContents = await Promise.all(operations.map(async (operation) => {
            const contents = await this.getEncodedReadable(operation.resource, operation.value);
            return {
                resource: operation.resource,
                contents,
                overwrite: operation.options?.overwrite
            };
        }));
        return this.workingCopyFileService.create(operationsWithContents, CancellationToken.None, undoInfo);
    }
    async write(resource, value, options) {
        const readable = await this.getEncodedReadable(resource, value, options);
        if (options?.writeElevated && this.elevatedFileService.isSupported(resource)) {
            return this.elevatedFileService.writeFileElevated(resource, readable, options);
        }
        return this.fileService.writeFile(resource, readable, options);
    }
    async getEncodedReadable(resource, value, options) {
        // check for encoding
        const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);
        // when encoding is standard skip encoding step
        if (encoding === UTF8 && !addBOM) {
            return typeof value === 'undefined'
                ? undefined
                : toBufferOrReadable(value);
        }
        // otherwise create encoded readable
        value = value || '';
        const snapshot = typeof value === 'string' ? stringToSnapshot(value) : value;
        return toEncodeReadable(snapshot, encoding, { addBOM });
    }
    async getDecodedStream(resource, value, options) {
        return (await this.doGetDecodedStream(resource, value, options)).stream;
    }
    doGetDecodedStream(resource, stream, options) {
        // read through encoding library
        return toDecodeStream(stream, {
            acceptTextOnly: options?.acceptTextOnly ?? false,
            guessEncoding: options?.autoGuessEncoding ||
                this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding'),
            candidateGuessEncodings: options?.candidateGuessEncodings ||
                this.textResourceConfigurationService.getValue(resource, 'files.candidateGuessEncodings'),
            overwriteEncoding: async (detectedEncoding) => this.validateDetectedEncoding(resource, detectedEncoding ?? undefined, options)
        });
    }
    getEncoding(resource) {
        const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
        return model?.getEncoding() ?? this.encoding.getUnvalidatedEncodingForResource(resource);
    }
    async resolveDecoding(resource, options) {
        return {
            preferredEncoding: (await this.encoding.getPreferredReadEncoding(resource, options, undefined)).encoding,
            guessEncoding: options?.autoGuessEncoding ||
                this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding'),
            candidateGuessEncodings: options?.candidateGuessEncodings ||
                this.textResourceConfigurationService.getValue(resource, 'files.candidateGuessEncodings'),
        };
    }
    async validateDetectedEncoding(resource, detectedEncoding, options) {
        const { encoding } = await this.encoding.getPreferredReadEncoding(resource, options, detectedEncoding);
        return encoding;
    }
    resolveEncoding(resource, options) {
        return this.encoding.getWriteEncoding(resource, options);
    }
    //#endregion
    //#region save
    async save(resource, options) {
        // Untitled
        if (resource.scheme === Schemas.untitled) {
            const model = this.untitled.get(resource);
            if (model) {
                let targetUri;
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
    async saveAs(source, target, options) {
        // Get to target resource
        if (!target) {
            target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
        }
        if (!target) {
            return; // user canceled
        }
        // Ensure target is not marked as readonly and prompt otherwise
        if (this.filesConfigurationService.isReadonly(target)) {
            const confirmed = await this.confirmMakeWriteable(target);
            if (!confirmed) {
                return;
            }
            else {
                this.filesConfigurationService.updateReadonly(target, false);
            }
        }
        // Just save if target is same as models own resource
        if (isEqual(source, target)) {
            return this.save(source, { ...options, force: true /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });
        }
        // If the target is different but of same identity, we
        // move the source to the target, knowing that the
        // underlying file system cannot have both and then save.
        // However, this will only work if the source exists
        // and is not orphaned, so we need to check that too.
        if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && (await this.fileService.exists(source))) {
            await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
            // At this point we don't know whether we have a
            // model for the source or the target URI so we
            // simply try to save with both resources.
            const success = await this.save(source, options);
            if (!success) {
                await this.save(target, options);
            }
            return target;
        }
        // Do it
        return this.doSaveAs(source, target, options);
    }
    async doSaveAs(source, target, options) {
        let success = false;
        let resolvedTextModel;
        if (source.scheme !== Schemas.untitled) {
            const textFileModel = this.files.get(source);
            if (textFileModel?.isResolved()) {
                resolvedTextModel = textFileModel;
            }
        }
        else {
            const untitledTextModel = this.untitled.get(source);
            if (untitledTextModel?.isResolved()) {
                resolvedTextModel = untitledTextModel;
            }
        }
        // If the source is an existing resolved file or untitled text model, we can
        // directly use that model to copy the contents to the target destination
        if (resolvedTextModel) {
            success = await this.doSaveAsTextFile(resolvedTextModel, source, target, options);
        }
        // Otherwise if the source can be handled by the file service
        // we can simply invoke the copy() function to save as
        else if (this.fileService.hasProvider(source)) {
            await this.fileService.copy(source, target, true);
            success = true;
        }
        // Finally we simply check if we can find a editor model that
        // would give us access to the contents.
        else {
            const textModel = this.modelService.getModel(source);
            if (textModel) {
                success = await this.doSaveAsTextFile(textModel, source, target, options);
            }
        }
        if (!success) {
            return undefined;
        }
        // Revert the source
        try {
            await this.revert(source);
        }
        catch (error) {
            // It is possible that reverting the source fails, for example
            // when a remote is disconnected and we cannot read it anymore.
            // However, this should not interrupt the "Save As" flow, so
            // we gracefully catch the error and just log it.
            this.logService.error(error);
        }
        // Events
        if (source.scheme === Schemas.untitled) {
            this.untitled.notifyDidSave(source, target);
        }
        return target;
    }
    async doSaveAsTextFile(sourceModel, source, target, options) {
        // Find source encoding if any
        let sourceModelEncoding = undefined;
        const sourceModelWithEncodingSupport = sourceModel;
        if (typeof sourceModelWithEncodingSupport.getEncoding === 'function') {
            sourceModelEncoding = sourceModelWithEncodingSupport.getEncoding();
        }
        // Prefer an existing model if it is already resolved for the given target resource
        let targetExists = false;
        let targetModel = this.files.get(target);
        if (targetModel?.isResolved()) {
            targetExists = true;
        }
        // Otherwise create the target file empty if it does not exist already and resolve it from there
        else {
            targetExists = await this.fileService.exists(target);
            // create target file adhoc if it does not exist yet
            if (!targetExists) {
                await this.create([{ resource: target, value: '' }]);
            }
            try {
                targetModel = await this.files.resolve(target, { encoding: sourceModelEncoding });
            }
            catch (error) {
                // if the target already exists and was not created by us, it is possible
                // that we cannot resolve the target as text model if it is binary or too
                // large. in that case we have to delete the target file first and then
                // re-run the operation.
                if (targetExists) {
                    if (error.textFileOperationResult === 0 /* TextFileOperationResult.FILE_IS_BINARY */ ||
                        error.fileOperationResult === 7 /* FileOperationResult.FILE_TOO_LARGE */) {
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
        // See https://github.com/microsoft/vscode/issues/67946
        let write;
        if (sourceModel instanceof UntitledTextEditorModel && sourceModel.hasAssociatedFilePath && targetExists && this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceModel.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))) {
            write = await this.confirmOverwrite(target);
        }
        else {
            write = true;
        }
        if (!write) {
            return false;
        }
        let sourceTextModel = undefined;
        if (sourceModel instanceof BaseTextEditorModel) {
            if (sourceModel.isResolved()) {
                sourceTextModel = sourceModel.textEditorModel ?? undefined;
            }
        }
        else {
            sourceTextModel = sourceModel;
        }
        let targetTextModel = undefined;
        if (targetModel.isResolved()) {
            targetTextModel = targetModel.textEditorModel;
        }
        // take over model value, encoding and language (only if more specific) from source model
        if (sourceTextModel && targetTextModel) {
            // encoding
            targetModel.updatePreferredEncoding(sourceModelEncoding);
            // content
            this.modelService.updateModel(targetTextModel, createTextBufferFactoryFromSnapshot(sourceTextModel.createSnapshot()));
            // language
            const sourceLanguageId = sourceTextModel.getLanguageId();
            const targetLanguageId = targetTextModel.getLanguageId();
            if (sourceLanguageId !== PLAINTEXT_LANGUAGE_ID && targetLanguageId === PLAINTEXT_LANGUAGE_ID) {
                targetTextModel.setLanguage(sourceLanguageId); // only use if more specific than plain/text
            }
            // indentation options (preserve tabs vs spaces, tab size, indent size)
            const sourceOptions = sourceTextModel.getOptions();
            targetTextModel.updateOptions({
                tabSize: sourceOptions.tabSize,
                indentSize: sourceOptions.indentSize,
                insertSpaces: sourceOptions.insertSpaces
            });
            // end of line sequence (preserve LF vs CRLF)
            const sourceEOL = sourceTextModel.getEndOfLineSequence();
            targetTextModel.setEOL(sourceEOL);
            // transient properties
            const sourceTransientProperties = this.codeEditorService.getTransientModelProperties(sourceTextModel);
            if (sourceTransientProperties) {
                for (const [key, value] of sourceTransientProperties) {
                    this.codeEditorService.setTransientModelProperty(targetTextModel, key, value);
                }
            }
        }
        // set source options depending on target exists or not
        if (!options?.source) {
            options = {
                ...options,
                source: targetExists ? AbstractTextFileService_1.TEXTFILE_SAVE_REPLACE_SOURCE : AbstractTextFileService_1.TEXTFILE_SAVE_CREATE_SOURCE
            };
        }
        // save model
        return targetModel.save({
            ...options,
            from: source
        });
    }
    async confirmOverwrite(resource) {
        const { confirmed } = await this.dialogService.confirm({
            type: 'warning',
            message: localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
            detail: localize('overwriteIrreversible', "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
            primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
        });
        return confirmed;
    }
    async confirmMakeWriteable(resource) {
        const { confirmed } = await this.dialogService.confirm({
            type: 'warning',
            message: localize('confirmMakeWriteable', "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
            detail: localize('confirmMakeWriteableDetail', "Paths can be configured as read-only via settings."),
            primaryButton: localize({ key: 'makeWriteableButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Save Anyway")
        });
        return confirmed;
    }
    async suggestSavePath(resource) {
        // Just take the resource as is if the file service can handle it
        if (this.fileService.hasProvider(resource)) {
            return resource;
        }
        const remoteAuthority = this.environmentService.remoteAuthority;
        const defaultFilePath = await this.fileDialogService.defaultFilePath();
        // Otherwise try to suggest a path that can be saved
        let suggestedFilename = undefined;
        if (resource.scheme === Schemas.untitled) {
            const model = this.untitled.get(resource);
            if (model) {
                // Untitled with associated file path
                if (model.hasAssociatedFilePath) {
                    return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
                }
                // Untitled without associated file path: use name
                // of untitled model if it is a valid path name and
                // figure out the file extension from the mode if any.
                let nameCandidate;
                if (await this.pathService.hasValidBasename(joinPath(defaultFilePath, model.name), model.name)) {
                    nameCandidate = model.name;
                }
                else {
                    nameCandidate = basename(resource);
                }
                const languageId = model.getLanguageId();
                if (languageId && languageId !== PLAINTEXT_LANGUAGE_ID) {
                    suggestedFilename = this.suggestFilename(languageId, nameCandidate);
                }
                else {
                    suggestedFilename = nameCandidate;
                }
            }
        }
        // Fallback to basename of resource
        if (!suggestedFilename) {
            suggestedFilename = basename(resource);
        }
        // Try to place where last active file was if any
        // Otherwise fallback to user home
        return joinPath(defaultFilePath, suggestedFilename);
    }
    suggestFilename(languageId, untitledName) {
        const languageName = this.languageService.getLanguageName(languageId);
        if (!languageName) {
            return untitledName; // unknown language, so we cannot suggest a better name
        }
        const untitledExtension = pathExtname(untitledName);
        const extensions = this.languageService.getExtensions(languageId);
        if (extensions.includes(untitledExtension)) {
            return untitledName; // preserve extension if it is compatible with the mode
        }
        const primaryExtension = extensions.at(0);
        if (primaryExtension) {
            if (untitledExtension) {
                return `${untitledName.substring(0, untitledName.indexOf(untitledExtension))}${primaryExtension}`;
            }
            return `${untitledName}${primaryExtension}`;
        }
        const filenames = this.languageService.getFilenames(languageId);
        if (filenames.includes(untitledName)) {
            return untitledName; // preserve name if it is compatible with the mode
        }
        return filenames.at(0) ?? untitledName;
    }
    //#endregion
    //#region revert
    async revert(resource, options) {
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
    isDirty(resource) {
        const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
        if (model) {
            return model.isDirty();
        }
        return false;
    }
};
AbstractTextFileService = AbstractTextFileService_1 = __decorate([
    __param(0, IFileService),
    __param(1, IUntitledTextEditorService),
    __param(2, ILifecycleService),
    __param(3, IInstantiationService),
    __param(4, IModelService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IDialogService),
    __param(7, IFileDialogService),
    __param(8, ITextResourceConfigurationService),
    __param(9, IFilesConfigurationService),
    __param(10, ICodeEditorService),
    __param(11, IPathService),
    __param(12, IWorkingCopyFileService),
    __param(13, IUriIdentityService),
    __param(14, ILanguageService),
    __param(15, ILogService),
    __param(16, IElevatedFileService),
    __param(17, IDecorationsService)
], AbstractTextFileService);
export { AbstractTextFileService };
let EncodingOracle = class EncodingOracle extends Disposable {
    get encodingOverrides() { return this._encodingOverrides; }
    set encodingOverrides(value) { this._encodingOverrides = value; }
    constructor(textResourceConfigurationService, environmentService, contextService, uriIdentityService) {
        super();
        this.textResourceConfigurationService = textResourceConfigurationService;
        this.environmentService = environmentService;
        this.contextService = contextService;
        this.uriIdentityService = uriIdentityService;
        this._encodingOverrides = this.getDefaultEncodingOverrides();
        this.registerListeners();
    }
    registerListeners() {
        // Workspace Folder Change
        this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.encodingOverrides = this.getDefaultEncodingOverrides()));
    }
    getDefaultEncodingOverrides() {
        const defaultEncodingOverrides = [];
        // Global settings
        defaultEncodingOverrides.push({ parent: this.environmentService.userRoamingDataHome, encoding: UTF8 });
        // Workspace files (via extension and via untitled workspaces location)
        defaultEncodingOverrides.push({ extension: WORKSPACE_EXTENSION, encoding: UTF8 });
        defaultEncodingOverrides.push({ parent: this.environmentService.untitledWorkspacesHome, encoding: UTF8 });
        // Folder Settings
        this.contextService.getWorkspace().folders.forEach(folder => {
            defaultEncodingOverrides.push({ parent: joinPath(folder.uri, '.vscode'), encoding: UTF8 });
        });
        return defaultEncodingOverrides;
    }
    async getWriteEncoding(resource, options) {
        const { encoding, hasBOM } = await this.getPreferredWriteEncoding(resource, options ? options.encoding : undefined);
        return { encoding, addBOM: hasBOM };
    }
    async getPreferredWriteEncoding(resource, preferredEncoding) {
        const resourceEncoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
        return {
            encoding: resourceEncoding,
            hasBOM: resourceEncoding === UTF16be || resourceEncoding === UTF16le || resourceEncoding === UTF8_with_bom // enforce BOM for certain encodings
        };
    }
    async getPreferredReadEncoding(resource, options, detectedEncoding) {
        let preferredEncoding;
        // Encoding passed in as option
        if (options?.encoding) {
            if (detectedEncoding === UTF8_with_bom && options.encoding === UTF8) {
                preferredEncoding = UTF8_with_bom; // indicate the file has BOM if we are to resolve with UTF 8
            }
            else {
                preferredEncoding = options.encoding; // give passed in encoding highest priority
            }
        }
        // Encoding detected
        else if (typeof detectedEncoding === 'string') {
            preferredEncoding = detectedEncoding;
        }
        // Encoding configured
        else if (this.textResourceConfigurationService.getValue(resource, 'files.encoding') === UTF8_with_bom) {
            preferredEncoding = UTF8; // if we did not detect UTF 8 BOM before, this can only be UTF 8 then
        }
        const encoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
        return {
            encoding,
            hasBOM: encoding === UTF16be || encoding === UTF16le || encoding === UTF8_with_bom // enforce BOM for certain encodings
        };
    }
    getUnvalidatedEncodingForResource(resource, preferredEncoding) {
        let fileEncoding;
        const override = this.getEncodingOverride(resource);
        if (override) {
            fileEncoding = override; // encoding override always wins
        }
        else if (preferredEncoding) {
            fileEncoding = preferredEncoding; // preferred encoding comes second
        }
        else {
            fileEncoding = this.textResourceConfigurationService.getValue(resource, 'files.encoding'); // and last we check for settings
        }
        return fileEncoding || UTF8;
    }
    async getValidatedEncodingForResource(resource, preferredEncoding) {
        let fileEncoding = this.getUnvalidatedEncodingForResource(resource, preferredEncoding);
        if (fileEncoding !== UTF8 && !(await encodingExists(fileEncoding))) {
            fileEncoding = UTF8;
        }
        return fileEncoding;
    }
    getEncodingOverride(resource) {
        if (resource && this.encodingOverrides?.length) {
            for (const override of this.encodingOverrides) {
                // check if the resource is child of encoding override path
                if (override.parent && this.uriIdentityService.extUri.isEqualOrParent(resource, override.parent)) {
                    return override.encoding;
                }
                // check if the resource extension is equal to encoding override
                if (override.extension && extname(resource) === `.${override.extension}`) {
                    return override.encoding;
                }
            }
        }
        return undefined;
    }
};
EncodingOracle = __decorate([
    __param(0, ITextResourceConfigurationService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IWorkspaceContextService),
    __param(3, IUriIdentityService)
], EncodingOracle);
export { EncodingOracle };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEZpbGVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL2Jyb3dzZXIvdGV4dEZpbGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFpSixrQkFBa0IsRUFBRSxzQkFBc0IsRUFBaUcsZ0JBQWdCLEVBQWdILE1BQU0sd0JBQXdCLENBQUM7QUFDbGMsT0FBTyxFQUFrQixrQkFBa0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQy9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQTBHLE1BQU0sNENBQTRDLENBQUM7QUFDbEwsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLElBQUksV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUYsT0FBTyxFQUFFLDBCQUEwQixFQUFtQyxNQUFNLG9EQUFvRCxDQUFDO0FBQ2pJLE9BQU8sRUFBb0MsdUJBQXVCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM3SCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdEksT0FBTyxF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