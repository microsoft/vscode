/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostNotebookShape, ICommandDto, IMainContext, IModelAddedData, INotebookDocumentPropertiesChangeData, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookEditorPropertiesChangeData, INotebookKernelInfoDto2, MainContext, MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import { ILogService } from 'vs/platform/log/common/log';
import { CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';
import { CellEditType, CellStatusbarAlignment, CellUri, ICellEditOperation, ICellRange, INotebookCellStatusBarEntry, INotebookExclusiveDocumentFilter, NotebookCellMetadata, NotebookCellExecutionState, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookDataDto, TransientOptions, NullablePartialNotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as vscode from 'vscode';
import { ResourceMap } from 'vs/base/common/map';
import { ExtHostCell, ExtHostNotebookDocument } from './extHostNotebookDocument';
import { ExtHostNotebookEditor } from './extHostNotebookEditor';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { IRelativePattern } from 'vs/base/common/glob';
import { assertIsDefined } from 'vs/base/common/types';
import { VSBuffer } from 'vs/base/common/buffer';
import { hash } from 'vs/base/common/hash';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';

class ExtHostWebviewCommWrapper extends Disposable {
	private readonly _onDidReceiveDocumentMessage = new Emitter<any>();
	private readonly _rendererIdToEmitters = new Map<string, Emitter<any>>();

	constructor(
		private _editorId: string,
		public uri: URI,
		private _proxy: MainThreadNotebookShape,
		private _webviewInitData: WebviewInitData,
		public document: ExtHostNotebookDocument,
	) {
		super();
	}

	public onDidReceiveMessage(forRendererId: string | undefined, message: any) {
		this._onDidReceiveDocumentMessage.fire(message);
		if (forRendererId !== undefined) {
			this._rendererIdToEmitters.get(forRendererId)?.fire(message);
		}
	}

	public readonly contentProviderComm: vscode.NotebookCommunication = {
		editorId: this._editorId,
		onDidReceiveMessage: this._onDidReceiveDocumentMessage.event,
		postMessage: (message: any) => this._proxy.$postMessage(this._editorId, undefined, message),
		asWebviewUri: (uri: vscode.Uri) => this._asWebviewUri(uri),
	};

	public getRendererComm(rendererId: string): vscode.NotebookCommunication {
		const emitter = new Emitter<any>();
		this._rendererIdToEmitters.set(rendererId, emitter);
		return {
			editorId: this._editorId,
			onDidReceiveMessage: emitter.event,
			postMessage: (message: any) => this._proxy.$postMessage(this._editorId, rendererId, message),
			asWebviewUri: (uri: vscode.Uri) => this._asWebviewUri(uri),
		};
	}


	private _asWebviewUri(localResource: vscode.Uri): vscode.Uri {
		return asWebviewUri(this._webviewInitData, this._editorId, localResource);
	}
}

export class ExtHostNotebookKernelProviderAdapter extends Disposable {
	private _kernelToFriendlyId = new ResourceMap<Map<vscode.NotebookKernel, string>>();
	private _friendlyIdToKernel = new ResourceMap<Map<string, vscode.NotebookKernel>>();
	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		private readonly _handle: number,
		private readonly _extension: IExtensionDescription,
		private readonly _provider: vscode.NotebookKernelProvider
	) {
		super();

		if (this._provider.onDidChangeKernels) {
			this._register(this._provider.onDidChangeKernels((e: vscode.NotebookDocument | undefined) => {
				const uri = e?.uri;
				this._proxy.$onNotebookKernelChange(this._handle, uri);
			}));
		}
	}

	async provideKernels(document: ExtHostNotebookDocument, token: vscode.CancellationToken): Promise<INotebookKernelInfoDto2[]> {
		const data = await this._provider.provideKernels(document.notebookDocument, token) || [];

		const newMap = new Map<vscode.NotebookKernel, string>();
		let kernel_unique_pool = 0;
		const kernelFriendlyIdCache = new Set<string>();

		const kernelToFriendlyId = this._kernelToFriendlyId.get(document.uri);

		const transformedData: INotebookKernelInfoDto2[] = data.map(kernel => {
			let friendlyId = kernelToFriendlyId?.get(kernel);
			if (friendlyId === undefined) {
				if (kernel.id && kernelFriendlyIdCache.has(kernel.id)) {
					friendlyId = `${this._extension.identifier.value}_${kernel.id}_${kernel_unique_pool++}`;
				} else {
					friendlyId = `${this._extension.identifier.value}_${kernel.id || UUID.generateUuid()}`;
				}
			}

			newMap.set(kernel, friendlyId);

			return {
				id: kernel.id,
				friendlyId: friendlyId,
				label: kernel.label,
				extension: this._extension.identifier,
				extensionLocation: this._extension.extensionLocation,
				providerHandle: this._handle,
				description: kernel.description,
				detail: kernel.detail,
				isPreferred: kernel.isPreferred,
				preloads: kernel.preloads,
				supportedLanguages: kernel.supportedLanguages
			};
		});

		this._kernelToFriendlyId.set(document.uri, newMap);
		const friendlyIdToKernel = new Map<string, vscode.NotebookKernel>();
		newMap.forEach((value, key) => {
			friendlyIdToKernel.set(value, key);
		});

		this._friendlyIdToKernel.set(document.uri, friendlyIdToKernel);
		return transformedData;
	}

	getKernelByFriendlyId(uri: URI, kernelId: string) {
		return this._friendlyIdToKernel.get(uri)?.get(kernelId);
	}

	async resolveNotebook(kernelId: string, document: ExtHostNotebookDocument, webview: vscode.NotebookCommunication, token: CancellationToken) {
		const kernel = this._friendlyIdToKernel.get(document.uri)?.get(kernelId);

		if (kernel && this._provider.resolveKernel) {
			return this._provider.resolveKernel(kernel, document.notebookDocument, webview, token);
		}
	}

	async executeNotebook(kernelId: string, document: ExtHostNotebookDocument, cellRange: ICellRange[]): Promise<void> {
		const kernel = this._friendlyIdToKernel.get(document.uri)?.get(kernelId);

		if (!kernel) {
			return;
		}

		const extCellRange = cellRange.map(c => typeConverters.NotebookCellRange.to(c));
		return kernel.executeCellsRequest(document.notebookDocument, extCellRange);
	}

	async interruptNotebookExecution(kernelId: string, document: ExtHostNotebookDocument, cellRange: ICellRange[]): Promise<void> {
		const kernel = this._friendlyIdToKernel.get(document.uri)?.get(kernelId);

		if (!kernel || !kernel.interrupt) {
			return;
		}

		const extCellRange = cellRange.map(c => typeConverters.NotebookCellRange.to(c));
		return kernel.interrupt(document.notebookDocument, extCellRange);
	}
}

export class NotebookEditorDecorationType {

	private static readonly _Keys = new IdGenerator('NotebookEditorDecorationType');

	readonly value: vscode.NotebookEditorDecorationType;

	constructor(proxy: MainThreadNotebookShape, options: vscode.NotebookDecorationRenderOptions) {
		const key = NotebookEditorDecorationType._Keys.nextId();
		proxy.$registerNotebookEditorDecorationType(key, typeConverters.NotebookDecorationRenderOptions.from(options));

		this.value = {
			key,
			dispose() {
				proxy.$removeNotebookEditorDecorationType(key);
			}
		};
	}
}


type NotebookContentProviderData = {
	readonly provider: vscode.NotebookContentProvider;
	readonly extension: IExtensionDescription;
};

export class ExtHostNotebookController implements ExtHostNotebookShape {
	private static _notebookKernelProviderHandlePool: number = 0;

	private readonly _proxy: MainThreadNotebookShape;
	private readonly _notebookContentProviders = new Map<string, NotebookContentProviderData>();
	private readonly _notebookKernelProviders = new Map<number, ExtHostNotebookKernelProviderAdapter>();
	private readonly _documents = new ResourceMap<ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, { editor: ExtHostNotebookEditor; }>();
	private readonly _webviewComm = new Map<string, ExtHostWebviewCommWrapper>();
	private readonly _commandsConverter: CommandsConverter;
	private readonly _onDidChangeNotebookEditorSelection = new Emitter<vscode.NotebookEditorSelectionChangeEvent>();
	readonly onDidChangeNotebookEditorSelection = this._onDidChangeNotebookEditorSelection.event;
	private readonly _onDidChangeNotebookEditorVisibleRanges = new Emitter<vscode.NotebookEditorVisibleRangesChangeEvent>();
	readonly onDidChangeNotebookEditorVisibleRanges = this._onDidChangeNotebookEditorVisibleRanges.event;
	private readonly _onDidChangeNotebookDocumentMetadata = new Emitter<vscode.NotebookDocumentMetadataChangeEvent>();
	readonly onDidChangeNotebookDocumentMetadata = this._onDidChangeNotebookDocumentMetadata.event;
	private readonly _onDidChangeNotebookCells = new Emitter<vscode.NotebookCellsChangeEvent>();
	readonly onDidChangeNotebookCells = this._onDidChangeNotebookCells.event;
	private readonly _onDidChangeCellOutputs = new Emitter<vscode.NotebookCellOutputsChangeEvent>();
	readonly onDidChangeCellOutputs = this._onDidChangeCellOutputs.event;
	private readonly _onDidChangeCellMetadata = new Emitter<vscode.NotebookCellMetadataChangeEvent>();
	readonly onDidChangeCellMetadata = this._onDidChangeCellMetadata.event;
	private readonly _onDidChangeActiveNotebookEditor = new Emitter<vscode.NotebookEditor | undefined>();
	readonly onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;
	private readonly _onDidChangeCellExecutionState = new Emitter<vscode.NotebookCellExecutionStateChangeEvent>();
	readonly onDidChangeNotebookCellExecutionState = this._onDidChangeCellExecutionState.event;

	private _activeNotebookEditor: ExtHostNotebookEditor | undefined;
	get activeNotebookEditor(): vscode.NotebookEditor | undefined {
		return this._activeNotebookEditor?.editor;
	}
	private _visibleNotebookEditors: ExtHostNotebookEditor[] = [];
	get visibleNotebookEditors(): vscode.NotebookEditor[] {
		return this._visibleNotebookEditors.map(editor => editor.editor);
	}

	private _onDidOpenNotebookDocument = new Emitter<vscode.NotebookDocument>();
	onDidOpenNotebookDocument: Event<vscode.NotebookDocument> = this._onDidOpenNotebookDocument.event;
	private _onDidCloseNotebookDocument = new Emitter<vscode.NotebookDocument>();
	onDidCloseNotebookDocument: Event<vscode.NotebookDocument> = this._onDidCloseNotebookDocument.event;
	private _onDidSaveNotebookDocument = new Emitter<vscode.NotebookDocument>();
	onDidSaveNotebookDocument: Event<vscode.NotebookDocument> = this._onDidSaveNotebookDocument.event;
	private _onDidChangeActiveNotebookKernel = new Emitter<{ document: vscode.NotebookDocument, kernel: vscode.NotebookKernel | undefined; }>();
	onDidChangeActiveNotebookKernel = this._onDidChangeActiveNotebookKernel.event;
	private _onDidChangeVisibleNotebookEditors = new Emitter<vscode.NotebookEditor[]>();
	onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;

	private _activeExecutions = new ResourceMap<NotebookCellExecutionTask>();

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _textDocuments: ExtHostDocuments,
		private readonly _webviewInitData: WebviewInitData,
		private readonly logService: ILogService,
		private readonly _extensionStoragePaths: IExtensionStoragePaths,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebook);
		this._commandsConverter = commands.converter;

		commands.registerArgumentProcessor({
			// Serialized INotebookCellActionContext
			processArgument: (arg) => {
				if (arg && arg.$mid === 12) {
					const notebookUri = arg.notebookEditor?.notebookUri;
					const cellHandle = arg.cell.handle;

					const data = this._documents.get(notebookUri);
					const cell = data?.getCell(cellHandle);
					if (cell) {
						return cell.cell;
					}
				}
				return arg;
			}
		});
	}

	get notebookDocuments() {
		return [...this._documents.values()];
	}

	lookupNotebookDocument(uri: URI): ExtHostNotebookDocument | undefined {
		return this._documents.get(uri);
	}

	private _getNotebookDocument(uri: URI): ExtHostNotebookDocument {
		const result = this._documents.get(uri);
		if (!result) {
			throw new Error(`NO notebook document for '${uri}'`);
		}
		return result;
	}

	private _getProviderData(viewType: string): NotebookContentProviderData {
		const result = this._notebookContentProviders.get(viewType);
		if (!result) {
			throw new Error(`NO provider for '${viewType}'`);
		}
		return result;
	}

	registerNotebookContentProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.NotebookContentProvider,
		options?: {
			transientOutputs: boolean;
			transientMetadata: { [K in keyof NotebookCellMetadata]?: boolean };
			viewOptions?: {
				displayName: string;
				filenamePattern: (vscode.GlobPattern | { include: vscode.GlobPattern; exclude: vscode.GlobPattern })[];
				exclusive?: boolean;
			};
		}
	): vscode.Disposable {

		if (this._notebookContentProviders.has(viewType)) {
			throw new Error(`Notebook provider for '${viewType}' already registered`);
		}

		this._notebookContentProviders.set(viewType, { extension, provider });


		let listener: IDisposable | undefined;
		if (provider.onDidChangeNotebookContentOptions) {
			listener = provider.onDidChangeNotebookContentOptions(() => {
				this._proxy.$updateNotebookProviderOptions(viewType, provider.options);
			});
		}

		const viewOptionsFilenamePattern = options?.viewOptions?.filenamePattern
			.map(pattern => typeConverters.NotebookExclusiveDocumentPattern.from(pattern))
			.filter(pattern => pattern !== undefined) as (string | IRelativePattern | INotebookExclusiveDocumentFilter)[];

		if (options?.viewOptions?.filenamePattern && !viewOptionsFilenamePattern) {
			console.warn(`Notebook content provider view options file name pattern is invalid ${options?.viewOptions?.filenamePattern}`);
		}

		this._proxy.$registerNotebookProvider({ id: extension.identifier, location: extension.extensionLocation, description: extension.description }, viewType, {
			transientOutputs: options?.transientOutputs || false,
			transientMetadata: options?.transientMetadata || {},
			viewOptions: options?.viewOptions && viewOptionsFilenamePattern ? { displayName: options.viewOptions.displayName, filenamePattern: viewOptionsFilenamePattern, exclusive: options.viewOptions.exclusive || false } : undefined
		});

		return new extHostTypes.Disposable(() => {
			listener?.dispose();
			this._notebookContentProviders.delete(viewType);
			this._proxy.$unregisterNotebookProvider(viewType);
		});
	}

	registerNotebookKernelProvider(extension: IExtensionDescription, selector: vscode.NotebookDocumentFilter, provider: vscode.NotebookKernelProvider) {
		const handle = ExtHostNotebookController._notebookKernelProviderHandlePool++;
		const adapter = new ExtHostNotebookKernelProviderAdapter(this._proxy, handle, extension, provider);
		this._notebookKernelProviders.set(handle, adapter);
		this._proxy.$registerNotebookKernelProvider({ id: extension.identifier, location: extension.extensionLocation, description: extension.description }, handle, {
			viewType: selector.viewType,
			filenamePattern: selector.filenamePattern ? typeConverters.NotebookExclusiveDocumentPattern.from(selector.filenamePattern) : undefined
		});

		return new extHostTypes.Disposable(() => {
			adapter.dispose();
			this._notebookKernelProviders.delete(handle);
			this._proxy.$unregisterNotebookKernelProvider(handle);
		});
	}

	createNotebookEditorDecorationType(options: vscode.NotebookDecorationRenderOptions): vscode.NotebookEditorDecorationType {
		return new NotebookEditorDecorationType(this._proxy, options).value;
	}

	async openNotebookDocument(uri: URI): Promise<vscode.NotebookDocument> {
		const cached = this._documents.get(uri);
		if (cached) {
			return cached.notebookDocument;
		}
		const canonicalUri = await this._proxy.$tryOpenDocument(uri);
		const document = this._documents.get(URI.revive(canonicalUri));
		return assertIsDefined(document?.notebookDocument);
	}

	private _withAdapter<T>(handle: number, uri: UriComponents, callback: (adapter: ExtHostNotebookKernelProviderAdapter, document: ExtHostNotebookDocument) => Promise<T>) {
		const document = this._documents.get(URI.revive(uri));

		if (!document) {
			return [];
		}

		const provider = this._notebookKernelProviders.get(handle);

		if (!provider) {
			return [];
		}

		return callback(provider, document);
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
				selection: options.selection && typeConverters.NotebookCellRange.from(options.selection),
				pinned: typeof options.preview === 'boolean' ? !options.preview : undefined
			};
		} else {
			resolvedOptions = {
				preserveFocus: false
			};
		}

		const editorId = await this._proxy.$tryShowNotebookDocument(notebookOrUri.uri, notebookOrUri.viewType, resolvedOptions);
		const editor = editorId && this._editors.get(editorId)?.editor;

		if (editor) {
			return editor.editor;
		}

		if (editorId) {
			throw new Error(`Could NOT open editor for "${notebookOrUri.toString()}" because another editor opened in the meantime.`);
		} else {
			throw new Error(`Could NOT open editor for "${notebookOrUri.toString()}".`);
		}
	}

	async $provideNotebookKernels(handle: number, uri: UriComponents, token: CancellationToken): Promise<INotebookKernelInfoDto2[]> {
		return this._withAdapter<INotebookKernelInfoDto2[]>(handle, uri, (adapter, document) => {
			return adapter.provideKernels(document, token);
		});
	}

	async $resolveNotebookKernel(handle: number, editorId: string, uri: UriComponents, kernelId: string, token: CancellationToken): Promise<void> {
		await this._withAdapter<void>(handle, uri, async (adapter, document) => {
			const webComm = this._webviewComm.get(editorId);

			if (webComm) {
				await adapter.resolveNotebook(kernelId, document, webComm.contentProviderComm, token);
			}
		});
	}

	async $resolveNotebookEditor(viewType: string, uri: UriComponents, editorId: string): Promise<void> {
		const provider = this._notebookContentProviders.get(viewType);
		const revivedUri = URI.revive(uri);
		const document = this._documents.get(revivedUri);
		if (!document || !provider) {
			return;
		}

		let webComm = this._webviewComm.get(editorId);
		if (!webComm) {
			webComm = new ExtHostWebviewCommWrapper(editorId, revivedUri, this._proxy, this._webviewInitData, document);
			this._webviewComm.set(editorId, webComm);
		}

		if (!provider.provider.resolveNotebook) {
			return;
		}

		await provider.provider.resolveNotebook(document.notebookDocument, webComm.contentProviderComm);
	}

	async $executeNotebookKernelFromProvider(handle: number, uri: UriComponents, kernelId: string, cellRange: ICellRange[]): Promise<void> {
		await this._withAdapter(handle, uri, async (adapter, document) => {
			return adapter.executeNotebook(kernelId, document, cellRange);
		});
	}

	// --- serialize/deserialize

	private _handlePool = 0;
	private readonly _notebookSerializer = new Map<number, vscode.NotebookSerializer>();

	registerNotebookSerializer(extension: IExtensionDescription, viewType: string, serializer: vscode.NotebookSerializer, options?: TransientOptions): vscode.Disposable {
		const handle = this._handlePool++;
		this._notebookSerializer.set(handle, serializer);
		this._proxy.$registerNotebookSerializer(
			handle,
			{ id: extension.identifier, location: extension.extensionLocation, description: extension.description },
			viewType,
			options ?? { transientOutputs: false, transientMetadata: {} }
		);
		return toDisposable(() => {
			this._proxy.$unregisterNotebookSerializer(handle);
		});
	}

	async $dataToNotebook(handle: number, bytes: VSBuffer): Promise<NotebookDataDto> {
		const serializer = this._notebookSerializer.get(handle);
		if (!serializer) {
			throw new Error('NO serializer found');
		}
		const data = await serializer.dataToNotebook(bytes.buffer);
		return {
			metadata: typeConverters.NotebookDocumentMetadata.from(data.metadata),
			cells: data.cells.map(typeConverters.NotebookCellData.from),
		};
	}

	async $notebookToData(handle: number, data: NotebookDataDto): Promise<VSBuffer> {
		const serializer = this._notebookSerializer.get(handle);
		if (!serializer) {
			throw new Error('NO serializer found');
		}
		const bytes = await serializer.notebookToData({
			metadata: typeConverters.NotebookDocumentMetadata.to(data.metadata),
			cells: data.cells.map(typeConverters.NotebookCellData.to)
		});
		return VSBuffer.wrap(bytes);
	}

	async $cancelNotebookCellExecution(handle: number, uri: UriComponents, kernelId: string, cellRange: ICellRange[]): Promise<void> {
		await this._withAdapter(handle, uri, async (adapter, document) => {
			return adapter.interruptNotebookExecution(kernelId, document, cellRange);
		});

		const document = this._documents.get(URI.revive(uri));
		if (!document) {
			return;
		}

		for (let range of cellRange) {
			for (let i = range.start; i < range.end; i++) {
				const cell = document.getCellFromIndex(i);
				if (cell) {
					this.cancelOneNotebookCellExecution(cell);
				}
			}
		}
	}

	private cancelOneNotebookCellExecution(cell: ExtHostCell): void {
		const execution = this._activeExecutions.get(cell.uri);
		execution?.cancel();
	}

	// --- open, save, saveAs, backup

	async $openNotebook(viewType: string, uri: UriComponents, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken): Promise<NotebookDataDto> {
		const { provider } = this._getProviderData(viewType);
		const data = await provider.openNotebook(URI.revive(uri), { backupId, untitledDocumentData: untitledDocumentData?.buffer }, token);
		return {
			metadata: typeConverters.NotebookDocumentMetadata.from(data.metadata),
			cells: data.cells.map(typeConverters.NotebookCellData.from),
		};
	}

	async $saveNotebook(viewType: string, uri: UriComponents, token: CancellationToken): Promise<boolean> {
		const document = this._getNotebookDocument(URI.revive(uri));
		const { provider } = this._getProviderData(viewType);
		await provider.saveNotebook(document.notebookDocument, token);
		return true;
	}

	async $saveNotebookAs(viewType: string, uri: UriComponents, target: UriComponents, token: CancellationToken): Promise<boolean> {
		const document = this._getNotebookDocument(URI.revive(uri));
		const { provider } = this._getProviderData(viewType);
		await provider.saveNotebookAs(URI.revive(target), document.notebookDocument, token);
		return true;
	}

	private _backupIdPool: number = 0;

	async $backupNotebook(viewType: string, uri: UriComponents, cancellation: CancellationToken): Promise<string> {
		const document = this._getNotebookDocument(URI.revive(uri));
		const provider = this._getProviderData(viewType);

		const storagePath = this._extensionStoragePaths.workspaceValue(provider.extension) ?? this._extensionStoragePaths.globalValue(provider.extension);
		const fileName = String(hash([document.uri.toString(), this._backupIdPool++]));
		const backupUri = URI.joinPath(storagePath, fileName);

		const backup = await provider.provider.backupNotebook(document.notebookDocument, { destination: backupUri }, cancellation);
		document.updateBackup(backup);
		return backup.id;
	}

	$acceptNotebookActiveKernelChange(event: { uri: UriComponents, providerHandle: number | undefined, kernelFriendlyId: string | undefined; }) {
		if (event.providerHandle !== undefined) {
			this._withAdapter(event.providerHandle, event.uri, async (adapter, document) => {
				const kernel = event.kernelFriendlyId ? adapter.getKernelByFriendlyId(URI.revive(event.uri), event.kernelFriendlyId) : undefined;
				this._editors.forEach(editor => {
					if (editor.editor.notebookData === document) {
						editor.editor._acceptKernel(kernel);
					}
				});
				this._onDidChangeActiveNotebookKernel.fire({ document: document.notebookDocument, kernel });
			});
		}
	}

	$onDidReceiveMessage(editorId: string, forRendererType: string | undefined, message: any): void {
		this._webviewComm.get(editorId)?.onDidReceiveMessage(forRendererType, message);
	}

	$acceptModelChanged(uri: UriComponents, event: NotebookCellsChangedEventDto, isDirty: boolean): void {
		const document = this._getNotebookDocument(URI.revive(uri));
		document.acceptModelChanged(event, isDirty);
	}

	$acceptDirtyStateChanged(uri: UriComponents, isDirty: boolean): void {
		const document = this._getNotebookDocument(URI.revive(uri));
		document.acceptModelChanged({ rawEvents: [], versionId: document.notebookDocument.version }, isDirty);
	}

	$acceptModelSaved(uri: UriComponents): void {
		const document = this._getNotebookDocument(URI.revive(uri));
		this._onDidSaveNotebookDocument.fire(document.notebookDocument);
	}

	$acceptEditorPropertiesChanged(id: string, data: INotebookEditorPropertiesChangeData): void {
		this.logService.debug('ExtHostNotebook#$acceptEditorPropertiesChanged', id, data);

		const editor = this._editors.get(id);
		if (!editor) {
			throw new Error(`unknown text editor: ${id}`);
		}

		// ONE: make all state updates
		if (data.visibleRanges) {
			editor.editor._acceptVisibleRanges(data.visibleRanges.ranges.map(typeConverters.NotebookCellRange.to));
		}
		if (data.selections) {
			editor.editor._acceptSelections(data.selections.selections.map(typeConverters.NotebookCellRange.to));
		}

		// TWO: send all events after states have been updated
		if (data.visibleRanges) {
			this._onDidChangeNotebookEditorVisibleRanges.fire({
				notebookEditor: editor.editor.editor,
				visibleRanges: editor.editor.editor.visibleRanges
			});
		}
		if (data.selections) {
			this._onDidChangeNotebookEditorSelection.fire(Object.freeze({
				notebookEditor: editor.editor.editor,
				selections: editor.editor.editor.selections
			}));
		}
	}

	$acceptDocumentPropertiesChanged(uri: UriComponents, data: INotebookDocumentPropertiesChangeData): void {
		this.logService.debug('ExtHostNotebook#$acceptDocumentPropertiesChanged', uri.path, data);
		const document = this._getNotebookDocument(URI.revive(uri));
		document.acceptDocumentPropertiesChanged(data);
		if (data.metadata) {
			this._onDidChangeNotebookDocumentMetadata.fire({ document: document.notebookDocument });
		}
	}

	private _createExtHostEditor(document: ExtHostNotebookDocument, editorId: string, data: INotebookEditorAddData) {
		const revivedUri = document.uri;
		let webComm = this._webviewComm.get(editorId);

		if (!webComm) {
			webComm = new ExtHostWebviewCommWrapper(editorId, revivedUri, this._proxy, this._webviewInitData, document);
			this._webviewComm.set(editorId, webComm);
		}

		const editor = new ExtHostNotebookEditor(
			editorId,
			this._proxy,
			document,
			data.visibleRanges.map(typeConverters.NotebookCellRange.to),
			data.selections.map(typeConverters.NotebookCellRange.to),
			typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined
		);


		this._editors.get(editorId)?.editor.dispose();
		this._editors.set(editorId, { editor });
	}

	$acceptDocumentAndEditorsDelta(delta: INotebookDocumentsAndEditorsDelta): void {
		let editorChanged = false;

		if (delta.removedDocuments) {
			for (const uri of delta.removedDocuments) {
				const revivedUri = URI.revive(uri);
				const document = this._documents.get(revivedUri);

				if (document) {
					document.dispose();
					this._documents.delete(revivedUri);
					this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: document.notebookDocument.cells.map(cell => cell.document.uri) });
					this._onDidCloseNotebookDocument.fire(document.notebookDocument);
				}

				for (const e of this._editors.values()) {
					if (e.editor.notebookData.uri.toString() === revivedUri.toString()) {
						e.editor.dispose();
						this._editors.delete(e.editor.id);
						editorChanged = true;
					}
				}
			}
		}

		if (delta.addedDocuments) {

			const addedCellDocuments: IModelAddedData[] = [];

			for (const modelData of delta.addedDocuments) {
				const uri = URI.revive(modelData.uri);
				const viewType = modelData.viewType;

				if (this._documents.has(uri)) {
					throw new Error(`adding EXISTING notebook ${uri}`);
				}
				const that = this;

				const document = new ExtHostNotebookDocument(
					this._proxy,
					this._textDocumentsAndEditors,
					this._textDocuments,
					{
						emitModelChange(event: vscode.NotebookCellsChangeEvent): void {
							that._onDidChangeNotebookCells.fire(event);
						},
						emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void {
							that._onDidChangeCellOutputs.fire(event);
						},
						emitCellMetadataChange(event: vscode.NotebookCellMetadataChangeEvent): void {
							that._onDidChangeCellMetadata.fire(event);
						},
						emitCellExecutionStateChange(event: vscode.NotebookCellExecutionStateChangeEvent): void {
							that._onDidChangeCellExecutionState.fire(event);
						}
					},
					viewType,
					modelData.metadata ? typeConverters.NotebookDocumentMetadata.to(modelData.metadata) : new extHostTypes.NotebookDocumentMetadata(),
					uri,
				);

				document.acceptModelChanged({
					versionId: modelData.versionId,
					rawEvents: [{
						kind: NotebookCellsChangeType.Initialize,
						changes: [[0, 0, modelData.cells]]
					}]
				}, false);

				// add cell document as vscode.TextDocument
				addedCellDocuments.push(...modelData.cells.map(cell => ExtHostCell.asModelAddData(document.notebookDocument, cell)));

				this._documents.get(uri)?.dispose();
				this._documents.set(uri, document);
				this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addedCellDocuments });

				this._onDidOpenNotebookDocument.fire(document.notebookDocument);
			}
		}

		if (delta.addedEditors) {
			for (const editorModelData of delta.addedEditors) {
				if (this._editors.has(editorModelData.id)) {
					return;
				}

				const revivedUri = URI.revive(editorModelData.documentUri);
				const document = this._documents.get(revivedUri);

				if (document) {
					this._createExtHostEditor(document, editorModelData.id, editorModelData);
					editorChanged = true;
				}
			}
		}

		const removedEditors: { editor: ExtHostNotebookEditor; }[] = [];

		if (delta.removedEditors) {
			for (const editorid of delta.removedEditors) {
				const editor = this._editors.get(editorid);

				if (editor) {
					editorChanged = true;
					this._editors.delete(editorid);

					if (this._activeNotebookEditor?.id === editor.editor.id) {
						this._activeNotebookEditor = undefined;
					}

					removedEditors.push(editor);
				}
			}
		}

		if (editorChanged) {
			removedEditors.forEach(e => {
				e.editor.dispose();
			});
		}

		if (delta.visibleEditors) {
			this._visibleNotebookEditors = delta.visibleEditors.map(id => this._editors.get(id)!.editor).filter(editor => !!editor) as ExtHostNotebookEditor[];
			const visibleEditorsSet = new Set<string>();
			this._visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));

			for (const e of this._editors.values()) {
				const newValue = visibleEditorsSet.has(e.editor.id);
				e.editor._acceptVisibility(newValue);
			}

			this._visibleNotebookEditors = [...this._editors.values()].map(e => e.editor).filter(e => e.visible);
			this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
		}

		if (delta.newActiveEditor === null) {
			// clear active notebook as current active editor is non-notebook editor
			this._activeNotebookEditor = undefined;
		} else if (delta.newActiveEditor) {
			this._activeNotebookEditor = this._editors.get(delta.newActiveEditor)?.editor;
		}
		if (delta.newActiveEditor !== undefined) {
			this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor?.editor);
		}
	}

	createNotebookCellStatusBarItemInternal(cell: vscode.NotebookCell, alignment: extHostTypes.NotebookCellStatusBarAlignment | undefined, priority: number | undefined) {
		const statusBarItem = new NotebookCellStatusBarItemInternal(this._proxy, this._commandsConverter, cell, alignment, priority);

		// Look up the ExtHostCell for this NotebookCell URI, bind to its disposable lifecycle
		const parsedUri = CellUri.parse(cell.document.uri);
		if (parsedUri) {
			const document = this._documents.get(parsedUri.notebook);
			if (document) {
				const cell = document.getCell(parsedUri.handle);
				if (cell) {
					Event.once(cell.onDidDispose)(() => statusBarItem.dispose());
				}
			}
		}

		return statusBarItem;
	}

	createNotebookCellExecution(docUri: vscode.Uri, index: number, kernelId: string): vscode.NotebookCellExecutionTask | undefined {
		const document = this.lookupNotebookDocument(docUri);
		if (!document) {
			throw new Error(`Invalid cell uri/index: ${docUri}, ${index}`);
		}

		const cell = document.getCellFromIndex(index);
		if (!cell) {
			throw new Error(`Invalid cell uri/index: ${docUri}, ${index}`);
		}

		// TODO@roblou more to do here?
		// TODO@roblou also validate kernelId, once kernel has moved from editor to document
		if (this._activeExecutions.has(cell.uri)) {
			return;
		}

		const execution = new NotebookCellExecutionTask(docUri, index, document, cell, this._proxy);
		this._activeExecutions.set(cell.uri, execution);
		const listener = execution.onDidChangeState(() => {
			if (execution.state === NotebookCellExecutionTaskState.Resolved) {
				execution.dispose();
				listener.dispose();
				this._activeExecutions.delete(cell.uri);
			}
		});

		return execution.asApiObject();
	}
}

export class NotebookCellStatusBarItemInternal extends Disposable {
	private static NEXT_ID = 0;

	private readonly _id = NotebookCellStatusBarItemInternal.NEXT_ID++;
	private readonly _internalCommandRegistration: DisposableStore;

	private _isDisposed = false;
	private _alignment: extHostTypes.NotebookCellStatusBarAlignment;

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		private readonly _commands: CommandsConverter,
		private readonly _cell: vscode.NotebookCell,
		alignment: extHostTypes.NotebookCellStatusBarAlignment | undefined,
		private _priority: number | undefined) {
		super();
		this._internalCommandRegistration = this._register(new DisposableStore());
		this._alignment = alignment ?? extHostTypes.NotebookCellStatusBarAlignment.Left;
	}

	private _apiItem: vscode.NotebookCellStatusBarItem | undefined;
	get apiItem(): vscode.NotebookCellStatusBarItem {
		if (!this._apiItem) {
			this._apiItem = createNotebookCellStatusBarApiItem(this);
		}

		return this._apiItem;
	}

	get cell(): vscode.NotebookCell {
		return this._cell;
	}

	get alignment(): extHostTypes.NotebookCellStatusBarAlignment {
		return this._alignment;
	}

	set alignment(v: extHostTypes.NotebookCellStatusBarAlignment) {
		this._alignment = v;
		this.update();
	}

	get priority(): number | undefined {
		return this._priority;
	}

	set priority(v: number | undefined) {
		this._priority = v;
		this.update();
	}

	private _text: string = '';
	get text(): string {
		return this._text;
	}

	set text(v: string) {
		this._text = v;
		this.update();
	}

	private _tooltip: string | undefined;
	get tooltip(): string | undefined {
		return this._tooltip;
	}

	set tooltip(v: string | undefined) {
		this._tooltip = v;
		this.update();
	}

	private _command?: {
		readonly fromApi: string | vscode.Command,
		readonly internal: ICommandDto,
	};
	get command(): string | vscode.Command | undefined {
		return this._command?.fromApi;
	}

	set command(command: string | vscode.Command | undefined) {
		if (this._command?.fromApi === command) {
			return;
		}

		this._internalCommandRegistration.clear();
		if (typeof command === 'string') {
			this._command = {
				fromApi: command,
				internal: this._commands.toInternal({ title: '', command }, this._internalCommandRegistration),
			};
		} else if (command) {
			this._command = {
				fromApi: command,
				internal: this._commands.toInternal(command, this._internalCommandRegistration),
			};
		} else {
			this._command = undefined;
		}
		this.update();
	}

	private _accessibilityInformation: vscode.AccessibilityInformation | undefined;
	get accessibilityInformation(): vscode.AccessibilityInformation | undefined {
		return this._accessibilityInformation;
	}

	set accessibilityInformation(v: vscode.AccessibilityInformation | undefined) {
		this._accessibilityInformation = v;
		this.update();
	}

	private _visible: boolean = false;
	show(): void {
		this._visible = true;
		this.update();
	}

	hide(): void {
		this._visible = false;
		this.update();
	}

	dispose(): void {
		this.hide();
		this._isDisposed = true;
		this._internalCommandRegistration.dispose();
	}

	private update(): void {
		if (this._isDisposed) {
			return;
		}

		const entry: INotebookCellStatusBarEntry = {
			alignment: this.alignment === extHostTypes.NotebookCellStatusBarAlignment.Left ? CellStatusbarAlignment.LEFT : CellStatusbarAlignment.RIGHT,
			cellResource: this.cell.document.uri,
			command: this._command?.internal,
			text: this.text,
			tooltip: this.tooltip,
			accessibilityInformation: this.accessibilityInformation,
			priority: this.priority,
			visible: this._visible
		};

		this._proxy.$setStatusBarEntry(this._id, entry);
	}
}

function createNotebookCellStatusBarApiItem(internalItem: NotebookCellStatusBarItemInternal): vscode.NotebookCellStatusBarItem {
	return Object.freeze({
		cell: internalItem.cell,
		get alignment() { return internalItem.alignment; },
		set alignment(v: NotebookCellStatusBarItemInternal['alignment']) { internalItem.alignment = v; },

		get priority() { return internalItem.priority; },
		set priority(v: NotebookCellStatusBarItemInternal['priority']) { internalItem.priority = v; },

		get text() { return internalItem.text; },
		set text(v: NotebookCellStatusBarItemInternal['text']) { internalItem.text = v; },

		get tooltip() { return internalItem.tooltip; },
		set tooltip(v: NotebookCellStatusBarItemInternal['tooltip']) { internalItem.tooltip = v; },

		get command() { return internalItem.command; },
		set command(v: NotebookCellStatusBarItemInternal['command']) { internalItem.command = v; },

		get accessibilityInformation() { return internalItem.accessibilityInformation; },
		set accessibilityInformation(v: NotebookCellStatusBarItemInternal['accessibilityInformation']) { internalItem.accessibilityInformation = v; },

		show() { internalItem.show(); },
		hide() { internalItem.hide(); },
		dispose() { internalItem.dispose(); }
	});
}

enum NotebookCellExecutionTaskState {
	Init,
	Started,
	Resolved
}

class NotebookCellExecutionTask extends Disposable {
	private _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState = this._onDidChangeState.event;

	private _state = NotebookCellExecutionTaskState.Init;
	get state(): NotebookCellExecutionTaskState { return this._state; }

	private readonly _tokenSource: CancellationTokenSource;

	constructor(
		private readonly _uri: vscode.Uri,
		private readonly _index: number,
		private readonly _document: ExtHostNotebookDocument,
		private readonly _cell: ExtHostCell,
		private readonly _proxy: MainThreadNotebookShape) {
		super();
		this._tokenSource = this._register(new CancellationTokenSource());

		this.mixinMetadata({
			runState: NotebookCellExecutionState.Pending,
			lastRunDuration: null
		});
	}

	cancel(): void {
		this._tokenSource.cancel();
	}

	private async applyEdits(getEdits: () => ICellEditOperation[]): Promise<void> {
		return this._proxy.$applyEdits(this._uri, getEdits());
	}

	private verifyStateForOutput() {
		if (this._state === NotebookCellExecutionTaskState.Init) {
			throw new Error('Must call start before modifying cell output');
		}

		if (this._state === NotebookCellExecutionTaskState.Resolved) {
			throw new Error('Cannot modify cell output after calling resolve');
		}
	}

	private mixinMetadata(mixinMetadata: NullablePartialNotebookCellMetadata) {
		this.applyEdits(() => {
			const edits: ICellEditOperation[] = [
				{ editType: CellEditType.PartialMetadata, index: this._index, metadata: mixinMetadata }
			];
			return edits;
		});
	}

	asApiObject(): vscode.NotebookCellExecutionTask {
		const that = this;
		return Object.freeze(<vscode.NotebookCellExecutionTask>{
			get document() { return that._document.notebookDocument; },
			get cell() { return that._cell.cell; },

			start(context?: vscode.NotebookCellExecuteStartContext): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved || that._state === NotebookCellExecutionTaskState.Started) {
					throw new Error('Cannot call start again');
				}

				that._state = NotebookCellExecutionTaskState.Started;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: NotebookCellExecutionState.Executing,
					runStartTime: context?.startTime
				});
			},

			setExecutionOrder(order: number): void {
				that.mixinMetadata({
					executionOrder: order
				});
			},

			end(result: vscode.NotebookCellPreviousExecutionResult): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved) {
					throw new Error('Cannot call resolve twice');
				}

				that._state = NotebookCellExecutionTaskState.Resolved;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: NotebookCellExecutionState.Idle,
					lastRunSuccess: result.success ?? null,
					lastRunDuration: result.duration ?? null,
				});
			},

			clearOutput(): Thenable<void> {
				that.verifyStateForOutput();
				return this.replaceOutput([]);
			},

			appendOutput(outputs: vscode.NotebookCellOutput[]): Thenable<void> {
				that.verifyStateForOutput();
				return that.applyEdits(() => [{ editType: CellEditType.Output, index: that._index, append: true, outputs: outputs.map(typeConverters.NotebookCellOutput.from) }]);
			},

			replaceOutput(outputs: vscode.NotebookCellOutput[]): Thenable<void> {
				that.verifyStateForOutput();
				return that.applyEdits(() => [{ editType: CellEditType.Output, index: that._index, outputs: outputs.map(typeConverters.NotebookCellOutput.from) }]);
			},

			appendOutputItems(outputId: string, items: vscode.NotebookCellOutputItem[]): Thenable<void> {
				that.verifyStateForOutput();
				return that.applyEdits(() => [{ editType: CellEditType.OutputItems, index: that._index, append: true, items: items.map(typeConverters.NotebookCellOutputItem.from), outputId }]);
			},

			replaceOutputItems(outputId: string, items: vscode.NotebookCellOutputItem[]): Thenable<void> {
				that.verifyStateForOutput();
				return that.applyEdits(() => [{ editType: CellEditType.OutputItems, index: that._index, items: items.map(typeConverters.NotebookCellOutputItem.from), outputId }]);
			},

			token: that._tokenSource.token
		});
	}
}
