/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IRelativePattern } from '../../../base/common/glob.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { isFalsyOrWhitespace } from '../../../base/common/strings.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import * as files from '../../../platform/files/common/files.js';
import { Cache } from './cache.js';
import { ExtHostNotebookShape, IMainContext, IModelAddedData, INotebookCellStatusBarListDto, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookPartialFileStatsWithMetadata, MainContext, MainThreadNotebookDocumentsShape, MainThreadNotebookEditorsShape, MainThreadNotebookShape, NotebookDataDto } from './extHost.protocol.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult, CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import * as typeConverters from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { INotebookExclusiveDocumentFilter, INotebookContributionData } from '../../contrib/notebook/common/notebookCommon.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import type * as vscode from 'vscode';
import { ExtHostCell, ExtHostNotebookDocument } from './extHostNotebookDocument.js';
import { ExtHostNotebookEditor } from './extHostNotebookEditor.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { filter } from '../../../base/common/objects.js';
import { Schemas } from '../../../base/common/network.js';
import { IFileQuery, ITextQuery, QueryType } from '../../services/search/common/search.js';
import { IExtHostSearch } from './extHostSearch.js';
import { CellSearchModel } from '../../contrib/search/common/cellSearchModel.js';
import { INotebookCellMatchNoModel, INotebookFileMatchNoModel, IRawClosedNotebookFileMatch, genericCellMatchesToTextSearchMatches } from '../../contrib/search/common/searchNotebookHelpers.js';
import { NotebookPriorityInfo } from '../../contrib/search/common/search.js';
import { globMatchesResource, RegisteredEditorPriority } from '../../services/editor/common/editorResolverService.js';
import { ILogService } from '../../../platform/log/common/log.js';

export class ExtHostNotebookController implements ExtHostNotebookShape {
	private static _notebookStatusBarItemProviderHandlePool: number = 0;

	private readonly _notebookProxy: MainThreadNotebookShape;
	private readonly _notebookDocumentsProxy: MainThreadNotebookDocumentsShape;
	private readonly _notebookEditorsProxy: MainThreadNotebookEditorsShape;

	private readonly _notebookStatusBarItemProviders = new Map<number, vscode.NotebookCellStatusBarItemProvider>();
	private readonly _documents = new ResourceMap<ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, ExtHostNotebookEditor>();
	private readonly _commandsConverter: CommandsConverter;

	private readonly _onDidChangeActiveNotebookEditor = new Emitter<vscode.NotebookEditor | undefined>();
	readonly onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;

	private _activeNotebookEditor: ExtHostNotebookEditor | undefined;
	get activeNotebookEditor(): vscode.NotebookEditor | undefined {
		return this._activeNotebookEditor?.apiEditor;
	}
	private _visibleNotebookEditors: ExtHostNotebookEditor[] = [];
	get visibleNotebookEditors(): vscode.NotebookEditor[] {
		return this._visibleNotebookEditors.map(editor => editor.apiEditor);
	}

	private _onDidOpenNotebookDocument = new Emitter<vscode.NotebookDocument>();
	readonly onDidOpenNotebookDocument: Event<vscode.NotebookDocument> = this._onDidOpenNotebookDocument.event;
	private _onDidCloseNotebookDocument = new Emitter<vscode.NotebookDocument>();
	readonly onDidCloseNotebookDocument: Event<vscode.NotebookDocument> = this._onDidCloseNotebookDocument.event;

	private _onDidChangeVisibleNotebookEditors = new Emitter<vscode.NotebookEditor[]>();
	onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;

	private _statusBarCache = new Cache<IDisposable>('NotebookCellStatusBarCache');

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _textDocuments: ExtHostDocuments,
		private _extHostFileSystem: IExtHostConsumerFileSystem,
		private _extHostSearch: IExtHostSearch,
		private _logService: ILogService
	) {
		this._notebookProxy = mainContext.getProxy(MainContext.MainThreadNotebook);
		this._notebookDocumentsProxy = mainContext.getProxy(MainContext.MainThreadNotebookDocuments);
		this._notebookEditorsProxy = mainContext.getProxy(MainContext.MainThreadNotebookEditors);
		this._commandsConverter = commands.converter;

		commands.registerArgumentProcessor({
			// Serialized INotebookCellActionContext
			processArgument: (arg) => {
				if (arg && arg.$mid === MarshalledId.NotebookCellActionContext) {
					const notebookUri = arg.notebookEditor?.notebookUri;
					const cellHandle = arg.cell.handle;

					const data = this._documents.get(notebookUri);
					const cell = data?.getCell(cellHandle);
					if (cell) {
						return cell.apiCell;
					}
				}
				if (arg && arg.$mid === MarshalledId.NotebookActionContext) {
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

	getEditorById(editorId: string): ExtHostNotebookEditor {
		const editor = this._editors.get(editorId);
		if (!editor) {
			throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this._editors.keys()]} `);
		}
		return editor;
	}

	getIdByEditor(editor: vscode.NotebookEditor): string | undefined {
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

	getNotebookDocument(uri: URI, relaxed: true): ExtHostNotebookDocument | undefined;
	getNotebookDocument(uri: URI): ExtHostNotebookDocument;
	getNotebookDocument(uri: URI, relaxed?: true): ExtHostNotebookDocument | undefined {
		const result = this._documents.get(uri);
		if (!result && !relaxed) {
			throw new Error(`NO notebook document for '${uri}'`);
		}
		return result;
	}

	private static _convertNotebookRegistrationData(extension: IExtensionDescription, registration: vscode.NotebookRegistrationData | undefined): INotebookContributionData | undefined {
		if (!registration) {
			return;
		}
		const viewOptionsFilenamePattern = registration.filenamePattern
			.map(pattern => typeConverters.NotebookExclusiveDocumentPattern.from(pattern))
			.filter(pattern => pattern !== undefined) as (string | IRelativePattern | INotebookExclusiveDocumentFilter)[];
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

	registerNotebookCellStatusBarItemProvider(extension: IExtensionDescription, notebookType: string, provider: vscode.NotebookCellStatusBarItemProvider) {

		const handle = ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++;
		const eventHandle = typeof provider.onDidChangeCellStatusBarItems === 'function' ? ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++ : undefined;

		this._notebookStatusBarItemProviders.set(handle, provider);
		this._notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, notebookType);

		let subscription: vscode.Disposable | undefined;
		if (eventHandle !== undefined) {
			subscription = provider.onDidChangeCellStatusBarItems!(_ => this._notebookProxy.$emitCellStatusBarEvent(eventHandle));
		}

		return new extHostTypes.Disposable(() => {
			this._notebookStatusBarItemProviders.delete(handle);
			this._notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
			subscription?.dispose();
		});
	}

	async createNotebookDocument(options: { viewType: string; content?: vscode.NotebookData }): Promise<URI> {
		const canonicalUri = await this._notebookDocumentsProxy.$tryCreateNotebook({
			viewType: options.viewType,
			content: options.content && typeConverters.NotebookData.from(options.content)
		});
		return URI.revive(canonicalUri);
	}

	async openNotebookDocument(uri: URI): Promise<vscode.NotebookDocument> {
		const cached = this._documents.get(uri);
		if (cached) {
			return cached.apiNotebook;
		}
		const canonicalUri = await this._notebookDocumentsProxy.$tryOpenNotebook(uri);
		const document = this._documents.get(URI.revive(canonicalUri));
		return assertReturnsDefined(document?.apiNotebook);
	}

	async showNotebookDocument(notebook: vscode.NotebookDocument, options?: vscode.NotebookDocumentShowOptions): Promise<vscode.NotebookEditor> {
		let resolvedOptions: INotebookDocumentShowOptions;
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
		} else {
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
		} else {
			throw new Error(`Could NOT open editor for "${notebook.uri.toString()}".`);
		}
	}

	async $provideNotebookCellStatusBarItems(handle: number, uri: UriComponents, index: number, token: CancellationToken): Promise<INotebookCellStatusBarListDto | undefined> {
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

	$releaseNotebookCellStatusBarItems(cacheId: number): void {
		this._statusBarCache.delete(cacheId);
	}

	// --- serialize/deserialize

	private _handlePool = 0;
	private readonly _notebookSerializer = new Map<number, { viewType: string; serializer: vscode.NotebookSerializer; options: vscode.NotebookDocumentContentOptions | undefined }>();

	registerNotebookSerializer(extension: IExtensionDescription, viewType: string, serializer: vscode.NotebookSerializer, options?: vscode.NotebookDocumentContentOptions, registration?: vscode.NotebookRegistrationData): vscode.Disposable {
		if (isFalsyOrWhitespace(viewType)) {
			throw new Error(`viewType cannot be empty or just whitespace`);
		}
		const handle = this._handlePool++;
		this._notebookSerializer.set(handle, { viewType, serializer, options });
		this._notebookProxy.$registerNotebookSerializer(
			handle,
			{ id: extension.identifier, location: extension.extensionLocation },
			viewType,
			typeConverters.NotebookDocumentContentOptions.from(options),
			ExtHostNotebookController._convertNotebookRegistrationData(extension, registration)
		);
		return toDisposable(() => {
			this._notebookProxy.$unregisterNotebookSerializer(handle);
		});
	}

	async $dataToNotebook(handle: number, bytes: VSBuffer, token: CancellationToken): Promise<SerializableObjectWithBuffers<NotebookDataDto>> {
		const serializer = this._notebookSerializer.get(handle);
		if (!serializer) {
			throw new Error('NO serializer found');
		}
		const data = await serializer.serializer.deserializeNotebook(bytes.buffer, token);
		return new SerializableObjectWithBuffers(typeConverters.NotebookData.from(data));
	}

	async $notebookToData(handle: number, data: SerializableObjectWithBuffers<NotebookDataDto>, token: CancellationToken): Promise<VSBuffer> {
		const serializer = this._notebookSerializer.get(handle);
		if (!serializer) {
			throw new Error('NO serializer found');
		}
		const bytes = await serializer.serializer.serializeNotebook(typeConverters.NotebookData.to(data.value), token);
		return VSBuffer.wrap(bytes);
	}

	async $saveNotebook(handle: number, uriComponents: UriComponents, versionId: number, options: files.IWriteFileOptions, token: CancellationToken): Promise<INotebookPartialFileStatsWithMetadata | files.FileOperationError> {
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
				throw new files.FileOperationError(localize('err.readonly', "Unable to modify read-only file '{0}'", this._resourceForError(uri)), files.FileOperationResult.FILE_PERMISSION_DENIED);
			}

			const data: vscode.NotebookData = {
				metadata: filter(document.apiNotebook.metadata, key => !(serializer.options?.transientDocumentMetadata ?? {})[key]),
				cells: [],
			};

			// this data must be retrieved before any async calls to ensure the data is for the correct version
			for (const cell of document.apiNotebook.getCells()) {
				const cellData = new extHostTypes.NotebookCellData(
					cell.kind,
					cell.document.getText(),
					cell.document.languageId,
					cell.mime,
					!(serializer.options?.transientOutputs) ? [...cell.outputs] : [],
					cell.metadata,
					cell.executionSummary
				);

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
				etag: files.etag({ mtime: stat.mtime, size: stat.size }),
				children: undefined
			};

			this.trace(`exit saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
			return fileStats;
		} catch (error) {
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
	async $searchInNotebooks(handle: number, textQuery: ITextQuery, viewTypeFileTargets: NotebookPriorityInfo[], otherViewTypeFileTargets: NotebookPriorityInfo[], token: CancellationToken): Promise<{ results: IRawClosedNotebookFileMatch[]; limitHit: boolean }> {
		const serializer = this._notebookSerializer.get(handle)?.serializer;
		if (!serializer) {
			return {
				limitHit: false,
				results: []
			};
		}

		const finalMatchedTargets = new ResourceSet();

		const runFileQueries = async (includes: NotebookPriorityInfo[], token: CancellationToken, textQuery: ITextQuery): Promise<void> => {
			await Promise.all(includes.map(async include =>
				await Promise.all(include.filenamePatterns.map(filePattern => {
					const query: IFileQuery = {
						_reason: textQuery._reason,
						folderQueries: textQuery.folderQueries,
						includePattern: textQuery.includePattern,
						excludePattern: textQuery.excludePattern,
						maxResults: textQuery.maxResults,
						type: QueryType.File,
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
								} else {
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
						} else {
							throw err;
						}
					});
				}))
			));
			return;
		};

		await runFileQueries(viewTypeFileTargets, token, textQuery);

		const results = new ResourceMap<INotebookFileMatchNoModel>();
		let limitHit = false;
		const promises = Array.from(finalMatchedTargets).map(async (uri) => {
			const cellMatches: INotebookCellMatchNoModel[] = [];

			try {
				if (token.isCancellationRequested) {
					return;
				}
				if (textQuery.maxResults && [...results.values()].reduce((acc, value) => acc + value.cellResults.length, 0) > textQuery.maxResults) {
					limitHit = true;
					return;
				}

				const simpleCells: Array<{ input: string; outputs: string[] }> = [];
				const notebook = this._documents.get(uri);
				if (notebook) {
					const cells = notebook.apiNotebook.getCells();
					cells.forEach(e => simpleCells.push(
						{
							input: e.document.getText(),
							outputs: e.outputs.flatMap(value => value.items.map(output => output.data.toString()))
						}
					));
				} else {
					const fileContent = await this._extHostFileSystem.value.readFile(uri);
					const bytes = VSBuffer.fromString(fileContent.toString());
					const notebook = await serializer.deserializeNotebook(bytes.buffer, token);
					if (token.isCancellationRequested) {
						return;
					}
					const data = typeConverters.NotebookData.from(notebook);

					data.cells.forEach(cell => simpleCells.push(
						{
							input: cell.source,
							outputs: cell.outputs.flatMap(value => value.items.map(output => output.valueBytes.toString()))
						}
					));
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
						.flatMap(outputMatch =>
							genericCellMatchesToTextSearchMatches(outputMatch.matches, outputMatch.textBuffer))
						.map((textMatch, index) => {
							textMatch.webviewIndex = index;
							return textMatch;
						});

					if (inputMatches.length > 0 || outputMatches.length > 0) {
						const cellMatch: INotebookCellMatchNoModel = {
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

			} catch (e) {
				return;
			}

		});

		await Promise.all(promises);
		return {
			limitHit,
			results: [...results.values()]
		};
	}



	private async _validateWriteFile(uri: URI, options: files.IWriteFileOptions) {
		const stat = await this._extHostFileSystem.value.stat(uri);
		// Dirty write prevention
		if (
			typeof options?.mtime === 'number' && typeof options.etag === 'string' && options.etag !== files.ETAG_DISABLED &&
			typeof stat.mtime === 'number' && typeof stat.size === 'number' &&
			options.mtime < stat.mtime && options.etag !== files.etag({ mtime: options.mtime /* not using stat.mtime for a reason, see above */, size: stat.size })
		) {
			throw new files.FileOperationError(localize('fileModifiedError', "File Modified Since"), files.FileOperationResult.FILE_MODIFIED_SINCE, options);
		}

		return;
	}

	private _resourceForError(uri: URI): string {
		return uri.scheme === Schemas.file ? uri.fsPath : uri.toString();
	}

	// --- open, save, saveAs, backup


	private _createExtHostEditor(document: ExtHostNotebookDocument, editorId: string, data: INotebookEditorAddData) {

		if (this._editors.has(editorId)) {
			throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
		}

		const editor = new ExtHostNotebookEditor(
			editorId,
			this._notebookEditorsProxy,
			document,
			data.visibleRanges.map(typeConverters.NotebookRange.to),
			data.selections.map(typeConverters.NotebookRange.to),
			typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined,
			data.viewType
		);

		this._editors.set(editorId, editor);
	}

	$acceptDocumentAndEditorsDelta(delta: SerializableObjectWithBuffers<INotebookDocumentsAndEditorsDelta>): void {

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

			const addedCellDocuments: IModelAddedData[] = [];

			for (const modelData of delta.value.addedDocuments) {
				const uri = URI.revive(modelData.uri);

				if (this._documents.has(uri)) {
					throw new Error(`adding EXISTING notebook ${uri} `);
				}

				const document = new ExtHostNotebookDocument(
					this._notebookDocumentsProxy,
					this._textDocumentsAndEditors,
					this._textDocuments,
					uri,
					modelData
				);

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

		const removedEditors: ExtHostNotebookEditor[] = [];

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
			this._visibleNotebookEditors = delta.value.visibleEditors.map(id => this._editors.get(id)!).filter(editor => !!editor) as ExtHostNotebookEditor[];
			const visibleEditorsSet = new Set<string>();
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
		} else if (delta.value.newActiveEditor) {
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

	private static _registerApiCommands(extHostCommands: ExtHostCommands) {

		const notebookTypeArg = ApiCommandArgument.String.with('notebookType', 'A notebook type');

		const commandDataToNotebook = new ApiCommand(
			'vscode.executeDataToNotebook', '_executeDataToNotebook', 'Invoke notebook serializer',
			[notebookTypeArg, new ApiCommandArgument<Uint8Array, VSBuffer>('data', 'Bytes to convert to data', v => v instanceof Uint8Array, v => VSBuffer.wrap(v))],
			new ApiCommandResult<SerializableObjectWithBuffers<NotebookDataDto>, vscode.NotebookData>('Notebook Data', data => typeConverters.NotebookData.to(data.value))
		);

		const commandNotebookToData = new ApiCommand(
			'vscode.executeNotebookToData', '_executeNotebookToData', 'Invoke notebook serializer',
			[notebookTypeArg, new ApiCommandArgument<vscode.NotebookData, SerializableObjectWithBuffers<NotebookDataDto>>('NotebookData', 'Notebook data to convert to bytes', v => true, v => new SerializableObjectWithBuffers(typeConverters.NotebookData.from(v)))],
			new ApiCommandResult<VSBuffer, Uint8Array>('Bytes', dto => dto.buffer)
		);

		extHostCommands.registerApiCommand(commandDataToNotebook);
		extHostCommands.registerApiCommand(commandNotebookToData);
	}

	private trace(msg: string): void {
		this._logService.trace(`[Extension Host Notebook] ${msg}`);
	}
}

export class NotebookSaveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotebookSaveError';
	}
}
