/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IRelativePattern } from 'vs/base/common/glob';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as files from 'vs/platform/files/common/files';
import { Cache } from 'vs/workbench/api/common/cache';
import { ExtHostNotebookShape, IMainContext, IModelAddedData, INotebookCellStatusBarListDto, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookPartialFileStatsWithMetadata, MainContext, MainThreadNotebookDocumentsShape, MainThreadNotebookEditorsShape, MainThreadNotebookShape, NotebookDataDto } from 'vs/workbench/api/common/extHost.protocol';
import { ApiCommand, ApiCommandArgument, ApiCommandResult, CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { INotebookExclusiveDocumentFilter, INotebookContributionData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import type * as vscode from 'vscode';
import { ExtHostCell, ExtHostNotebookDocument } from './extHostNotebookDocument';
import { ExtHostNotebookEditor } from './extHostNotebookEditor';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { filter } from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';



export class ExtHostNotebookController implements ExtHostNotebookShape {
	private static _notebookStatusBarItemProviderHandlePool: number = 0;

	private readonly _notebookProxy: MainThreadNotebookShape;
	private readonly _notebookDocumentsProxy: MainThreadNotebookDocumentsShape;
	private readonly _notebookEditorsProxy: MainThreadNotebookEditorsShape;

	private readonly _notebookStatusBarItemProviders = new Map<number, vscode.NotebookCellStatusBarItemProvider>();
	private readonly _documents = new ResourceMap<ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, ExtHostNotebookEditor>();
	private readonly _commandsConverter: CommandsConverter;

	private readonly _onDidChangeActiveNotebookEditor = new Emitter<vscode.NotebookEditor | undefined>({ onListenerError: onUnexpectedExternalError });
	readonly onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;

	private _activeNotebookEditor: ExtHostNotebookEditor | undefined;
	get activeNotebookEditor(): vscode.NotebookEditor | undefined {
		return this._activeNotebookEditor?.apiEditor;
	}
	private _visibleNotebookEditors: ExtHostNotebookEditor[] = [];
	get visibleNotebookEditors(): vscode.NotebookEditor[] {
		return this._visibleNotebookEditors.map(editor => editor.apiEditor);
	}

	private _onDidOpenNotebookDocument = new Emitter<vscode.NotebookDocument>({ onListenerError: onUnexpectedExternalError });
	onDidOpenNotebookDocument: Event<vscode.NotebookDocument> = this._onDidOpenNotebookDocument.event;
	private _onDidCloseNotebookDocument = new Emitter<vscode.NotebookDocument>({ onListenerError: onUnexpectedExternalError });
	onDidCloseNotebookDocument: Event<vscode.NotebookDocument> = this._onDidCloseNotebookDocument.event;

	private _onDidChangeVisibleNotebookEditors = new Emitter<vscode.NotebookEditor[]>({ onListenerError: onUnexpectedExternalError });
	onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;

	private _statusBarCache = new Cache<IDisposable>('NotebookCellStatusBarCache');

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _textDocuments: ExtHostDocuments,
		private _extHostFileSystem: IExtHostConsumerFileSystem
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
			exclusive: registration.exclusive || false
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
		return assertIsDefined(document?.apiNotebook);
	}


	async showNotebookDocument(notebookOrUri: vscode.NotebookDocument | URI, options?: vscode.NotebookDocumentShowOptions): Promise<vscode.NotebookEditor> {

		if (URI.isUri(notebookOrUri)) {
			notebookOrUri = await this.openNotebookDocument(notebookOrUri);
		}

		let resolvedOptions: INotebookDocumentShowOptions;
		if (typeof options === 'object') {
			resolvedOptions = {
				position: typeConverters.ViewColumn.from(options.viewColumn),
				preserveFocus: options.preserveFocus,
				selections: options.selections && options.selections.map(typeConverters.NotebookRange.from),
				pinned: typeof options.preview === 'boolean' ? !options.preview : undefined
			};
		} else {
			resolvedOptions = {
				preserveFocus: false
			};
		}

		const editorId = await this._notebookEditorsProxy.$tryShowNotebookDocument(notebookOrUri.uri, notebookOrUri.notebookType, resolvedOptions);
		const editor = editorId && this._editors.get(editorId)?.apiEditor;

		if (editor) {
			return editor;
		}

		if (editorId) {
			throw new Error(`Could NOT open editor for "${notebookOrUri.uri.toString()}" because another editor opened in the meantime.`);
		} else {
			throw new Error(`Could NOT open editor for "${notebookOrUri.uri.toString()}".`);
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

	async $saveNotebook(handle: number, uriComponents: UriComponents, versionId: number, options: files.IWriteFileOptions, token: CancellationToken): Promise<INotebookPartialFileStatsWithMetadata> {
		const uri = URI.revive(uriComponents);
		const serializer = this._notebookSerializer.get(handle);
		if (!serializer) {
			throw new Error('NO serializer found');
		}

		const document = this._documents.get(uri);
		if (!document) {
			throw new Error('Document NOT found');
		}

		if (document.versionId !== versionId) {
			throw new Error('Document version mismatch');
		}

		if (!this._extHostFileSystem.value.isWritableFileSystem(uri.scheme)) {
			throw new files.FileOperationError(localize('err.readonly', "Unable to modify read-only file '{0}'", this._resourceForError(uri)), files.FileOperationResult.FILE_PERMISSION_DENIED);
		}

		// validate write
		await this._validateWriteFile(uri, options);

		const data: vscode.NotebookData = {
			metadata: filter(document.apiNotebook.metadata, key => !(serializer.options?.transientDocumentMetadata ?? {})[key]),
			cells: [],
		};

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

		const bytes = await serializer.serializer.serializeNotebook(data, token);
		await this._extHostFileSystem.value.writeFile(uri, bytes);
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

		return fileStats;
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
			typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined
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
				addedCellDocuments.push(...modelData.cells.map(cell => ExtHostCell.asModelAddData(document.apiNotebook, cell)));

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
}
