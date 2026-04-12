/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { isFalsyOrWhitespace } from '../../../base/common/strings.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { CancellationError } from '../../../base/common/errors.js';
import * as files from '../../../platform/files/common/files.js';
import { Cache } from './cache.js';
import { MainContext } from './extHost.protocol.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from './extHostCommands.js';
import * as typeConverters from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostCell, ExtHostNotebookDocument } from './extHostNotebookDocument.js';
import { ExtHostNotebookEditor } from './extHostNotebookEditor.js';
import { filter } from '../../../base/common/objects.js';
import { Schemas } from '../../../base/common/network.js';
import { CellSearchModel } from '../../contrib/search/common/cellSearchModel.js';
import { genericCellMatchesToTextSearchMatches } from '../../contrib/search/common/searchNotebookHelpers.js';
import { globMatchesResource, RegisteredEditorPriority } from '../../services/editor/common/editorResolverService.js';
export class ExtHostNotebookController {
    static { this._notebookStatusBarItemProviderHandlePool = 0; }
    get activeNotebookEditor() {
        return this._activeNotebookEditor?.apiEditor;
    }
    get visibleNotebookEditors() {
        return this._visibleNotebookEditors.map(editor => editor.apiEditor);
    }
    constructor(mainContext, commands, _textDocumentsAndEditors, _textDocuments, _extHostFileSystem, _extHostSearch, _logService) {
        this._textDocumentsAndEditors = _textDocumentsAndEditors;
        this._textDocuments = _textDocuments;
        this._extHostFileSystem = _extHostFileSystem;
        this._extHostSearch = _extHostSearch;
        this._logService = _logService;
        this._notebookStatusBarItemProviders = new Map();
        this._documents = new ResourceMap();
        this._editors = new Map();
        this._onDidChangeActiveNotebookEditor = new Emitter();
        this.onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;
        this._visibleNotebookEditors = [];
        this._onDidOpenNotebookDocument = new Emitter();
        this.onDidOpenNotebookDocument = this._onDidOpenNotebookDocument.event;
        this._onDidCloseNotebookDocument = new Emitter();
        this.onDidCloseNotebookDocument = this._onDidCloseNotebookDocument.event;
        this._onDidChangeVisibleNotebookEditors = new Emitter();
        this.onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;
        this._statusBarCache = new Cache('NotebookCellStatusBarCache');
        // --- serialize/deserialize
        this._handlePool = 0;
        this._notebookSerializer = new Map();
        this._notebookProxy = mainContext.getProxy(MainContext.MainThreadNotebook);
        this._notebookDocumentsProxy = mainContext.getProxy(MainContext.MainThreadNotebookDocuments);
        this._notebookEditorsProxy = mainContext.getProxy(MainContext.MainThreadNotebookEditors);
        this._commandsConverter = commands.converter;
        commands.registerArgumentProcessor({
            // Serialized INotebookCellActionContext
            processArgument: (arg) => {
                if (arg && arg.$mid === 13 /* MarshalledId.NotebookCellActionContext */) {
                    const notebookUri = arg.notebookEditor?.notebookUri;
                    const cellHandle = arg.cell.handle;
                    const data = this._documents.get(notebookUri);
                    const cell = data?.getCell(cellHandle);
                    if (cell) {
                        return cell.apiCell;
                    }
                }
                if (arg && arg.$mid === 14 /* MarshalledId.NotebookActionContext */) {
                    const notebookUri = arg.uri;
                    const data = this._documents.get(notebookUri);
                    if (data) {
                        return data.apiNotebook;
                    }
                }
                return arg;
            }
        });
        ExtHostNotebookController._registerApiCommands(commands);
    }
    getEditorById(editorId) {
        const editor = this._editors.get(editorId);
        if (!editor) {
            throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this._editors.keys()]} `);
        }
        return editor;
    }
    getIdByEditor(editor) {
        for (const [id, candidate] of this._editors) {
            if (candidate.apiEditor === editor) {
                return id;
            }
        }
        return undefined;
    }
    get notebookDocuments() {
        return [...this._documents.values()];
    }
    getNotebookDocument(uri, relaxed) {
        const result = this._documents.get(uri);
        if (!result && !relaxed) {
            throw new Error(`NO notebook document for '${uri}'`);
        }
        return result;
    }
    static _convertNotebookRegistrationData(extension, registration) {
        if (!registration) {
            return;
        }
        const viewOptionsFilenamePattern = registration.filenamePattern
            .map(pattern => typeConverters.NotebookExclusiveDocumentPattern.from(pattern))
            .filter(pattern => pattern !== undefined);
        if (registration.filenamePattern && !viewOptionsFilenamePattern) {
            console.warn(`Notebook content provider view options file name pattern is invalid ${registration.filenamePattern}`);
            return undefined;
        }
        return {
            extension: extension.identifier,
            providerDisplayName: extension.displayName || extension.name,
            displayName: registration.displayName,
            filenamePattern: viewOptionsFilenamePattern,
            priority: registration.exclusive ? RegisteredEditorPriority.exclusive : undefined
        };
    }
    registerNotebookCellStatusBarItemProvider(extension, notebookType, provider) {
        const handle = ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++;
        const eventHandle = typeof provider.onDidChangeCellStatusBarItems === 'function' ? ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++ : undefined;
        this._notebookStatusBarItemProviders.set(handle, provider);
        this._notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, notebookType);
        let subscription;
        if (eventHandle !== undefined) {
            subscription = provider.onDidChangeCellStatusBarItems(_ => this._notebookProxy.$emitCellStatusBarEvent(eventHandle));
        }
        return new extHostTypes.Disposable(() => {
            this._notebookStatusBarItemProviders.delete(handle);
            this._notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
            subscription?.dispose();
        });
    }
    async createNotebookDocument(options) {
        const canonicalUri = await this._notebookDocumentsProxy.$tryCreateNotebook({
            viewType: options.viewType,
            content: options.content && typeConverters.NotebookData.from(options.content)
        });
        return URI.revive(canonicalUri);
    }
    async openNotebookDocument(uri) {
        const cached = this._documents.get(uri);
        if (cached) {
            return cached.apiNotebook;
        }
        const canonicalUri = await this._notebookDocumentsProxy.$tryOpenNotebook(uri);
        const document = this._documents.get(URI.revive(canonicalUri));
        return assertReturnsDefined(document?.apiNotebook);
    }
    async showNotebookDocument(notebook, options) {
        let resolvedOptions;
        if (typeof options === 'object') {
            resolvedOptions = {
                position: typeConverters.ViewColumn.from(options.viewColumn),
                preserveFocus: options.preserveFocus,
                selections: options.selections && options.selections.map(typeConverters.NotebookRange.from),
                pinned: typeof options.preview === 'boolean' ? !options.preview : undefined,
                label: typeof options.asRepl === 'string' ?
                    options.asRepl :
                    typeof options.asRepl === 'object' ?
                        options.asRepl.label :
                        undefined,
            };
        }
        else {
            resolvedOptions = {
                preserveFocus: false,
                pinned: true
            };
        }
        const viewType = !!options?.asRepl ? 'repl' : notebook.notebookType;
        const editorId = await this._notebookEditorsProxy.$tryShowNotebookDocument(notebook.uri, viewType, resolvedOptions);
        const editor = editorId && this._editors.get(editorId)?.apiEditor;
        if (editor) {
            return editor;
        }
        if (editorId) {
            throw new Error(`Could NOT open editor for "${notebook.uri.toString()}" because another editor opened in the meantime.`);
        }
        else {
            throw new Error(`Could NOT open editor for "${notebook.uri.toString()}".`);
        }
    }
    async $provideNotebookCellStatusBarItems(handle, uri, index, token) {
        const provider = this._notebookStatusBarItemProviders.get(handle);
        const revivedUri = URI.revive(uri);
        const document = this._documents.get(revivedUri);
        if (!document || !provider) {
            return;
        }
        const cell = document.getCellFromIndex(index);
        if (!cell) {
            return;
        }
        const result = await provider.provideCellStatusBarItems(cell.apiCell, token);
        if (!result) {
            return undefined;
        }
        const disposables = new DisposableStore();
        const cacheId = this._statusBarCache.add([disposables]);
        const resultArr = Array.isArray(result) ? result : [result];
        const items = resultArr.map(item => typeConverters.NotebookStatusBarItem.from(item, this._commandsConverter, disposables));
        return {
            cacheId,
            items
        };
    }
    $releaseNotebookCellStatusBarItems(cacheId) {
        this._statusBarCache.delete(cacheId);
    }
    registerNotebookSerializer(extension, viewType, serializer, options, registration) {
        if (isFalsyOrWhitespace(viewType)) {
            throw new Error(`viewType cannot be empty or just whitespace`);
        }
        const handle = this._handlePool++;
        this._notebookSerializer.set(handle, { viewType, serializer, options });
        this._notebookProxy.$registerNotebookSerializer(handle, { id: extension.identifier, location: extension.extensionLocation }, viewType, typeConverters.NotebookDocumentContentOptions.from(options), ExtHostNotebookController._convertNotebookRegistrationData(extension, registration));
        return toDisposable(() => {
            this._notebookProxy.$unregisterNotebookSerializer(handle);
        });
    }
    async $dataToNotebook(handle, bytes, token) {
        const serializer = this._notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('NO serializer found');
        }
        const data = await serializer.serializer.deserializeNotebook(bytes.buffer, token);
        return new SerializableObjectWithBuffers(typeConverters.NotebookData.from(data));
    }
    async $notebookToData(handle, data, token) {
        const serializer = this._notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('NO serializer found');
        }
        const bytes = await serializer.serializer.serializeNotebook(typeConverters.NotebookData.to(data.value), token);
        return VSBuffer.wrap(bytes);
    }
    async $saveNotebook(handle, uriComponents, versionId, options, token) {
        const uri = URI.revive(uriComponents);
        const serializer = this._notebookSerializer.get(handle);
        this.trace(`enter saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
        try {
            if (!serializer) {
                throw new NotebookSaveError('NO serializer found');
            }
            const document = this._documents.get(uri);
            if (!document) {
                throw new NotebookSaveError('Document NOT found');
            }
            if (document.versionId !== versionId) {
                throw new NotebookSaveError('Document version mismatch, expected: ' + versionId + ', actual: ' + document.versionId);
            }
            if (!this._extHostFileSystem.value.isWritableFileSystem(uri.scheme)) {
                throw new files.FileOperationError(localize('err.readonly', "Unable to modify read-only file '{0}'", this._resourceForError(uri)), 6 /* files.FileOperationResult.FILE_PERMISSION_DENIED */);
            }
            const data = {
                metadata: filter(document.apiNotebook.metadata, key => !(serializer.options?.transientDocumentMetadata ?? {})[key]),
                cells: [],
            };
            // this data must be retrieved before any async calls to ensure the data is for the correct version
            for (const cell of document.apiNotebook.getCells()) {
                const cellData = new extHostTypes.NotebookCellData(cell.kind, cell.document.getText(), cell.document.languageId, cell.mime, !(serializer.options?.transientOutputs) ? [...cell.outputs] : [], cell.metadata, cell.executionSummary);
                cellData.metadata = filter(cell.metadata, key => !(serializer.options?.transientCellMetadata ?? {})[key]);
                data.cells.push(cellData);
            }
            // validate write
            await this._validateWriteFile(uri, options);
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const bytes = await serializer.serializer.serializeNotebook(data, token);
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            // Don't accept any cancellation beyond this point, we need to report the result of the file write
            this.trace(`serialized versionId: ${versionId} ${uri.toString()}`);
            await this._extHostFileSystem.value.writeFile(uri, bytes);
            this.trace(`Finished write versionId: ${versionId} ${uri.toString()}`);
            const providerExtUri = this._extHostFileSystem.getFileSystemProviderExtUri(uri.scheme);
            const stat = await this._extHostFileSystem.value.stat(uri);
            const fileStats = {
                name: providerExtUri.basename(uri),
                isFile: (stat.type & files.FileType.File) !== 0,
                isDirectory: (stat.type & files.FileType.Directory) !== 0,
                isSymbolicLink: (stat.type & files.FileType.SymbolicLink) !== 0,
                mtime: stat.mtime,
                ctime: stat.ctime,
                size: stat.size,
                readonly: Boolean((stat.permissions ?? 0) & files.FilePermission.Readonly) || !this._extHostFileSystem.value.isWritableFileSystem(uri.scheme),
                locked: Boolean((stat.permissions ?? 0) & files.FilePermission.Locked),
                executable: Boolean((stat.permissions ?? 0) & files.FilePermission.Executable),
                etag: files.etag({ mtime: stat.mtime, size: stat.size })
            };
            this.trace(`exit saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
            return fileStats;
        }
        catch (error) {
            // return fileOperationsErrors to keep the whole object across serialization, these errors are handled specially by the WCS
            if (error instanceof files.FileOperationError) {
                return { ...error, message: error.message };
            }
            throw error;
        }
    }
    /**
     * Search for query in all notebooks that can be deserialized by the serializer fetched by `handle`.
     *
     * @param handle used to get notebook serializer
     * @param textQuery the text query to search using
     * @param viewTypeFileTargets the globs (and associated ranks) that are targetting for opening this type of notebook
     * @param otherViewTypeFileTargets ranked globs for other editors that we should consider when deciding whether it will open as this notebook
     * @param token cancellation token
     * @returns `IRawClosedNotebookFileMatch` for every file. Files without matches will just have a `IRawClosedNotebookFileMatch`
     * 	with no `cellResults`. This allows the caller to know what was searched in already, even if it did not yield results.
     */
    async $searchInNotebooks(handle, textQuery, viewTypeFileTargets, otherViewTypeFileTargets, token) {
        const serializer = this._notebookSerializer.get(handle)?.serializer;
        if (!serializer) {
            return {
                limitHit: false,
                results: []
            };
        }
        const finalMatchedTargets = new ResourceSet();
        const runFileQueries = async (includes, token, textQuery) => {
            await Promise.all(includes.map(async (include) => await Promise.all(include.filenamePatterns.map(filePattern => {
                const query = {
                    _reason: textQuery._reason,
                    folderQueries: textQuery.folderQueries,
                    includePattern: textQuery.includePattern,
                    excludePattern: textQuery.excludePattern,
                    maxResults: textQuery.maxResults,
                    type: 1 /* QueryType.File */,
                    filePattern
                };
                // use priority info to exclude info from other globs
                return this._extHostSearch.doInternalFileSearchWithCustomCallback(query, token, (data) => {
                    data.forEach(uri => {
                        if (finalMatchedTargets.has(uri)) {
                            return;
                        }
                        const hasOtherMatches = otherViewTypeFileTargets.some(target => {
                            // use the same strategy that the editor service uses to open editors
                            // https://github.com/microsoft/vscode/blob/ac1631528e67637da65ec994c6dc35d73f6e33cc/src/vs/workbench/services/editor/browser/editorResolverService.ts#L359-L366
                            if (include.isFromSettings && !target.isFromSettings) {
                                // if the include is from the settings and target isn't, even if it matches, it's still overridden.
                                return false;
                            }
                            else {
                                // longer filePatterns are considered more specifc, so they always have precedence the shorter patterns
                                return target.filenamePatterns.some(targetFilePattern => globMatchesResource(targetFilePattern, uri));
                            }
                        });
                        if (hasOtherMatches) {
                            return;
                        }
                        finalMatchedTargets.add(uri);
                    });
                }).catch(err => {
                    // temporary fix for https://github.com/microsoft/vscode/issues/205044: don't show notebook results for remotehub repos.
                    if (err.code === 'ENOENT') {
                        console.warn(`Could not find notebook search results, ignoring notebook results.`);
                        return {
                            limitHit: false,
                            messages: [],
                        };
                    }
                    else {
                        throw err;
                    }
                });
            }))));
            return;
        };
        await runFileQueries(viewTypeFileTargets, token, textQuery);
        const results = new ResourceMap();
        let limitHit = false;
        const promises = Array.from(finalMatchedTargets).map(async (uri) => {
            const cellMatches = [];
            try {
                if (token.isCancellationRequested) {
                    return;
                }
                if (textQuery.maxResults && [...results.values()].reduce((acc, value) => acc + value.cellResults.length, 0) > textQuery.maxResults) {
                    limitHit = true;
                    return;
                }
                const simpleCells = [];
                const notebook = this._documents.get(uri);
                if (notebook) {
                    const cells = notebook.apiNotebook.getCells();
                    cells.forEach(e => simpleCells.push({
                        input: e.document.getText(),
                        outputs: e.outputs.flatMap(value => value.items.map(output => output.data.toString()))
                    }));
                }
                else {
                    const fileContent = await this._extHostFileSystem.value.readFile(uri);
                    const bytes = VSBuffer.fromString(fileContent.toString());
                    const notebook = await serializer.deserializeNotebook(bytes.buffer, token);
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const data = typeConverters.NotebookData.from(notebook);
                    data.cells.forEach(cell => simpleCells.push({
                        input: cell.source,
                        outputs: cell.outputs.flatMap(value => value.items.map(output => output.valueBytes.toString()))
                    }));
                }
                if (token.isCancellationRequested) {
                    return;
                }
                simpleCells.forEach((cell, index) => {
                    const target = textQuery.contentPattern.pattern;
                    const cellModel = new CellSearchModel(cell.input, undefined, cell.outputs);
                    const inputMatches = cellModel.findInInputs(target);
                    const outputMatches = cellModel.findInOutputs(target);
                    const webviewResults = outputMatches
                        .flatMap(outputMatch => genericCellMatchesToTextSearchMatches(outputMatch.matches, outputMatch.textBuffer))
                        .map((textMatch, index) => {
                        textMatch.webviewIndex = index;
                        return textMatch;
                    });
                    if (inputMatches.length > 0 || outputMatches.length > 0) {
                        const cellMatch = {
                            index: index,
                            contentResults: genericCellMatchesToTextSearchMatches(inputMatches, cellModel.inputTextBuffer),
                            webviewResults
                        };
                        cellMatches.push(cellMatch);
                    }
                });
                const fileMatch = {
                    resource: uri, cellResults: cellMatches
                };
                results.set(uri, fileMatch);
                return;
            }
            catch (e) {
                return;
            }
        });
        await Promise.all(promises);
        return {
            limitHit,
            results: [...results.values()]
        };
    }
    async _validateWriteFile(uri, options) {
        const stat = await this._extHostFileSystem.value.stat(uri);
        // Dirty write prevention
        if (typeof options?.mtime === 'number' && typeof options.etag === 'string' && options.etag !== files.ETAG_DISABLED &&
            typeof stat.mtime === 'number' && typeof stat.size === 'number' &&
            options.mtime < stat.mtime && options.etag !== files.etag({ mtime: options.mtime /* not using stat.mtime for a reason, see above */, size: stat.size })) {
            throw new files.FileOperationError(localize('fileModifiedError', "File Modified Since"), 3 /* files.FileOperationResult.FILE_MODIFIED_SINCE */, options);
        }
        return;
    }
    _resourceForError(uri) {
        return uri.scheme === Schemas.file ? uri.fsPath : uri.toString();
    }
    // --- open, save, saveAs, backup
    _createExtHostEditor(document, editorId, data) {
        if (this._editors.has(editorId)) {
            throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
        }
        const editor = new ExtHostNotebookEditor(editorId, this._notebookEditorsProxy, document, data.visibleRanges.map(typeConverters.NotebookRange.to), data.selections.map(typeConverters.NotebookRange.to), typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined, data.viewType);
        this._editors.set(editorId, editor);
    }
    $acceptDocumentAndEditorsDelta(delta) {
        if (delta.value.removedDocuments) {
            for (const uri of delta.value.removedDocuments) {
                const revivedUri = URI.revive(uri);
                const document = this._documents.get(revivedUri);
                if (document) {
                    document.dispose();
                    this._documents.delete(revivedUri);
                    this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: document.apiNotebook.getCells().map(cell => cell.document.uri) });
                    this._onDidCloseNotebookDocument.fire(document.apiNotebook);
                }
                for (const editor of this._editors.values()) {
                    if (editor.notebookData.uri.toString() === revivedUri.toString()) {
                        this._editors.delete(editor.id);
                    }
                }
            }
        }
        if (delta.value.addedDocuments) {
            const addedCellDocuments = [];
            for (const modelData of delta.value.addedDocuments) {
                const uri = URI.revive(modelData.uri);
                if (this._documents.has(uri)) {
                    throw new Error(`adding EXISTING notebook ${uri} `);
                }
                const document = new ExtHostNotebookDocument(this._notebookDocumentsProxy, this._textDocumentsAndEditors, this._textDocuments, uri, modelData);
                // add cell document as vscode.TextDocument
                addedCellDocuments.push(...modelData.cells.map(cell => ExtHostCell.asModelAddData(cell)));
                this._documents.get(uri)?.dispose();
                this._documents.set(uri, document);
                this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addedCellDocuments });
                this._onDidOpenNotebookDocument.fire(document.apiNotebook);
            }
        }
        if (delta.value.addedEditors) {
            for (const editorModelData of delta.value.addedEditors) {
                if (this._editors.has(editorModelData.id)) {
                    return;
                }
                const revivedUri = URI.revive(editorModelData.documentUri);
                const document = this._documents.get(revivedUri);
                if (document) {
                    this._createExtHostEditor(document, editorModelData.id, editorModelData);
                }
            }
        }
        const removedEditors = [];
        if (delta.value.removedEditors) {
            for (const editorid of delta.value.removedEditors) {
                const editor = this._editors.get(editorid);
                if (editor) {
                    this._editors.delete(editorid);
                    if (this._activeNotebookEditor?.id === editor.id) {
                        this._activeNotebookEditor = undefined;
                    }
                    removedEditors.push(editor);
                }
            }
        }
        if (delta.value.visibleEditors) {
            this._visibleNotebookEditors = delta.value.visibleEditors.map(id => this._editors.get(id)).filter(editor => !!editor);
            const visibleEditorsSet = new Set();
            this._visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));
            for (const editor of this._editors.values()) {
                const newValue = visibleEditorsSet.has(editor.id);
                editor._acceptVisibility(newValue);
            }
            this._visibleNotebookEditors = [...this._editors.values()].map(e => e).filter(e => e.visible);
            this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
        }
        if (delta.value.newActiveEditor === null) {
            // clear active notebook as current active editor is non-notebook editor
            this._activeNotebookEditor = undefined;
        }
        else if (delta.value.newActiveEditor) {
            const activeEditor = this._editors.get(delta.value.newActiveEditor);
            if (!activeEditor) {
                console.error(`FAILED to find active notebook editor ${delta.value.newActiveEditor}`);
            }
            this._activeNotebookEditor = this._editors.get(delta.value.newActiveEditor);
        }
        if (delta.value.newActiveEditor !== undefined) {
            this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor?.apiEditor);
        }
    }
    static _registerApiCommands(extHostCommands) {
        const notebookTypeArg = ApiCommandArgument.String.with('notebookType', 'A notebook type');
        const commandDataToNotebook = new ApiCommand('vscode.executeDataToNotebook', '_executeDataToNotebook', 'Invoke notebook serializer', [notebookTypeArg, new ApiCommandArgument('data', 'Bytes to convert to data', v => v instanceof Uint8Array, v => VSBuffer.wrap(v))], new ApiCommandResult('Notebook Data', data => typeConverters.NotebookData.to(data.value)));
        const commandNotebookToData = new ApiCommand('vscode.executeNotebookToData', '_executeNotebookToData', 'Invoke notebook serializer', [notebookTypeArg, new ApiCommandArgument('NotebookData', 'Notebook data to convert to bytes', v => true, v => new SerializableObjectWithBuffers(typeConverters.NotebookData.from(v)))], new ApiCommandResult('Bytes', dto => dto.buffer));
        extHostCommands.registerApiCommand(commandDataToNotebook);
        extHostCommands.registerApiCommand(commandNotebookToData);
    }
    trace(msg) {
        this._logService.trace(`[Extension Host Notebook] ${msg}`);
    }
}
export class NotebookSaveError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotebookSaveError';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE5vdGVib29rLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV2RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRW5FLE9BQU8sS0FBSyxLQUFLLE1BQU0seUNBQXlDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNuQyxPQUFPLEVBQXNOLFdBQVcsRUFBOEcsTUFBTSx1QkFBdUIsQ0FBQztBQUNwWCxPQUFPLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFzQyxNQUFNLHNCQUFzQixDQUFDO0FBRzVILE9BQU8sS0FBSyxjQUFjLE1BQU0sNEJBQTRCLENBQUM7QUFDN0QsT0FBTyxLQUFLLFlBQVksTUFBTSxtQkFBbUIsQ0FBQztBQUVsRCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUs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