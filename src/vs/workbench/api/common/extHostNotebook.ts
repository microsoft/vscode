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
import { ExtHostNotebookShape, IMainContext, IModelAddedData, INotebookCellStatusBarListDto, INotebookDocumentPropertiesChangeData, INotebookDocumentsAndEditorsDelta, INotebookDocumentShowOptions, INotebookEditorAddData, INotebookEditorPropertiesChangeData, INotebookEditorViewColumnInfo, INotebookKernelInfoDto2, MainContext, MainThreadNotebookDocumentsShape, MainThreadNotebookEditorsShape, MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import { ILogService } from 'vs/platform/log/common/log';
import { CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';
import { CellEditType, ICellRange, INotebookExclusiveDocumentFilter, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookDataDto, NullablePartialNotebookCellMetadata, IImmediateCellEditOperation } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import type * as vscode from 'vscode';
import { ResourceMap } from 'vs/base/common/map';
import { ExtHostCell, ExtHostNotebookDocument } from './extHostNotebookDocument';
import { ExtHostNotebookEditor } from './extHostNotebookEditor';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { IRelativePattern } from 'vs/base/common/glob';
import { assertIsDefined } from 'vs/base/common/types';
import { VSBuffer } from 'vs/base/common/buffer';
import { hash } from 'vs/base/common/hash';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { Cache } from 'vs/workbench/api/common/cache';

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
				preloads: kernel.preloads?.map(preload => {
					// todo@connor4312: back compat on 2020-04-12, remove after transition
					if (URI.isUri(preload)) {
						preload = { uri: preload, provides: [] };
					}

					return {
						uri: preload.uri, provides: typeof preload.provides === 'string'
							? [preload.provides]
							: preload.provides === undefined
								? []
								: preload.provides
					};
				}),
				supportedLanguages: kernel.supportedLanguages,
				implementsInterrupt: !!kernel.interrupt
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

	async interruptNotebookExecution(kernelId: string, document: ExtHostNotebookDocument): Promise<void> {
		const kernel = this._friendlyIdToKernel.get(document.uri)?.get(kernelId);

		if (!kernel || !kernel.interrupt) {
			return;
		}

		return kernel.interrupt(document.notebookDocument);
	}
}

export class NotebookEditorDecorationType {

	private static readonly _Keys = new IdGenerator('NotebookEditorDecorationType');

	readonly value: vscode.NotebookEditorDecorationType;

	constructor(proxy: MainThreadNotebookEditorsShape, options: vscode.NotebookDecorationRenderOptions) {
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
	private static _notebookStatusBarItemProviderHandlePool: number = 0;

	private readonly _notebookProxy: MainThreadNotebookShape;
	private readonly _notebookDocumentsProxy: MainThreadNotebookDocumentsShape;
	private readonly _notebookEditorsProxy: MainThreadNotebookEditorsShape;

	private readonly _notebookContentProviders = new Map<string, NotebookContentProviderData>();
	private readonly _notebookKernelProviders = new Map<number, ExtHostNotebookKernelProviderAdapter>();
	private readonly _notebookStatusBarItemProviders = new Map<number, vscode.NotebookCellStatusBarItemProvider>();
	private readonly _documents = new ResourceMap<ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, ExtHostNotebookEditor>();
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
		return this._activeNotebookEditor?.apiEditor;
	}
	private _visibleNotebookEditors: ExtHostNotebookEditor[] = [];
	get visibleNotebookEditors(): vscode.NotebookEditor[] {
		return this._visibleNotebookEditors.map(editor => editor.apiEditor);
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

	private _statusBarCache = new Cache<IDisposable>('NotebookCellStatusBarCache');

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _textDocuments: ExtHostDocuments,
		private readonly _webviewInitData: WebviewInitData,
		private readonly logService: ILogService,
		private readonly _extensionStoragePaths: IExtensionStoragePaths,
	) {
		this._notebookProxy = mainContext.getProxy(MainContext.MainThreadNotebook);
		this._notebookDocumentsProxy = mainContext.getProxy(MainContext.MainThreadNotebookDocuments);
		this._notebookEditorsProxy = mainContext.getProxy(MainContext.MainThreadNotebookEditors);
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
		options?: vscode.NotebookDocumentContentOptions & {
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
				const internalOptions = typeConverters.NotebookDocumentContentOptions.from(provider.options);
				this._notebookProxy.$updateNotebookProviderOptions(viewType, internalOptions);
			});
		}

		const viewOptionsFilenamePattern = options?.viewOptions?.filenamePattern
			.map(pattern => typeConverters.NotebookExclusiveDocumentPattern.from(pattern))
			.filter(pattern => pattern !== undefined) as (string | IRelativePattern | INotebookExclusiveDocumentFilter)[];

		if (options?.viewOptions?.filenamePattern && !viewOptionsFilenamePattern) {
			console.warn(`Notebook content provider view options file name pattern is invalid ${options?.viewOptions?.filenamePattern}`);
		}

		const internalOptions = typeConverters.NotebookDocumentContentOptions.from(options);
		this._notebookProxy.$registerNotebookProvider({ id: extension.identifier, location: extension.extensionLocation, description: extension.description }, viewType, {
			transientOutputs: internalOptions.transientOutputs,
			transientMetadata: internalOptions.transientMetadata,
			viewOptions: options?.viewOptions && viewOptionsFilenamePattern ? { displayName: options.viewOptions.displayName, filenamePattern: viewOptionsFilenamePattern, exclusive: options.viewOptions.exclusive || false } : undefined
		});

		return new extHostTypes.Disposable(() => {
			listener?.dispose();
			this._notebookContentProviders.delete(viewType);
			this._notebookProxy.$unregisterNotebookProvider(viewType);
		});
	}

	registerNotebookKernelProvider(extension: IExtensionDescription, selector: vscode.NotebookDocumentFilter, provider: vscode.NotebookKernelProvider) {
		const handle = ExtHostNotebookController._notebookKernelProviderHandlePool++;
		const adapter = new ExtHostNotebookKernelProviderAdapter(this._notebookProxy, handle, extension, provider);
		this._notebookKernelProviders.set(handle, adapter);
		this._notebookProxy.$registerNotebookKernelProvider({ id: extension.identifier, location: extension.extensionLocation, description: extension.description }, handle, {
			viewType: selector.viewType,
			filenamePattern: selector.filenamePattern ? typeConverters.NotebookExclusiveDocumentPattern.from(selector.filenamePattern) : undefined
		});

		return new extHostTypes.Disposable(() => {
			adapter.dispose();
			this._notebookKernelProviders.delete(handle);
			this._notebookProxy.$unregisterNotebookKernelProvider(handle);
		});
	}

	registerNotebookCellStatusBarItemProvider(extension: IExtensionDescription, selector: vscode.NotebookDocumentFilter, provider: vscode.NotebookCellStatusBarItemProvider) {
		const handle = ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++;
		const eventHandle = typeof provider.onDidChangeCellStatusBarItems === 'function' ? ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++ : undefined;

		this._notebookStatusBarItemProviders.set(handle, provider);
		this._notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, {
			viewType: selector.viewType,
			filenamePattern: selector.filenamePattern ? typeConverters.NotebookExclusiveDocumentPattern.from(selector.filenamePattern) : undefined
		});

		let subscription: vscode.Disposable | undefined;
		if (eventHandle !== undefined) {
			subscription = provider.onDidChangeCellStatusBarItems!(_ => this._notebookProxy.$emitCellStatusBarEvent(eventHandle));
		}

		return new extHostTypes.Disposable(() => {
			this._notebookStatusBarItemProviders.delete(handle);
			this._notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
			if (subscription) {
				subscription.dispose();
			}
		});
	}

	createNotebookEditorDecorationType(options: vscode.NotebookDecorationRenderOptions): vscode.NotebookEditorDecorationType {
		return new NotebookEditorDecorationType(this._notebookEditorsProxy, options).value;
	}

	async openNotebookDocument(uri: URI): Promise<vscode.NotebookDocument> {
		const cached = this._documents.get(uri);
		if (cached) {
			return cached.notebookDocument;
		}
		const canonicalUri = await this._notebookDocumentsProxy.$tryOpenDocument(uri);
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
				selections: options.selections && options.selections.map(typeConverters.NotebookCellRange.from),
				pinned: typeof options.preview === 'boolean' ? !options.preview : undefined
			};
		} else {
			resolvedOptions = {
				preserveFocus: false
			};
		}

		const editorId = await this._notebookEditorsProxy.$tryShowNotebookDocument(notebookOrUri.uri, notebookOrUri.viewType, resolvedOptions);
		const editor = editorId && this._editors.get(editorId)?.apiEditor;

		if (editor) {
			return editor;
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

		const result = await provider.provideCellStatusBarItems(cell.cell, token);
		if (!result) {
			return undefined;
		}

		const disposables = new DisposableStore();
		const cacheId = this._statusBarCache.add([disposables]);
		const items = (result && result.map(item => typeConverters.NotebookStatusBarItem.from(item, this._commandsConverter, disposables))) ?? undefined;
		return {
			cacheId,
			items
		};
	}

	$releaseNotebookCellStatusBarItems(cacheId: number): void {
		this._statusBarCache.delete(cacheId);
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
			webComm = new ExtHostWebviewCommWrapper(editorId, revivedUri, this._notebookProxy, this._webviewInitData, document);
			this._webviewComm.set(editorId, webComm);
		}
	}

	async $executeNotebookKernelFromProvider(handle: number, uri: UriComponents, kernelId: string, cellRange: ICellRange[]): Promise<void> {
		await this._withAdapter(handle, uri, async (adapter, document) => {
			return adapter.executeNotebook(kernelId, document, cellRange);
		});
	}

	// --- serialize/deserialize

	private _handlePool = 0;
	private readonly _notebookSerializer = new Map<number, vscode.NotebookSerializer>();

	registerNotebookSerializer(extension: IExtensionDescription, viewType: string, serializer: vscode.NotebookSerializer, options?: vscode.NotebookDocumentContentOptions): vscode.Disposable {
		const handle = this._handlePool++;
		this._notebookSerializer.set(handle, serializer);
		const internalOptions = typeConverters.NotebookDocumentContentOptions.from(options);
		this._notebookProxy.$registerNotebookSerializer(
			handle,
			{ id: extension.identifier, location: extension.extensionLocation, description: extension.description },
			viewType,
			internalOptions
		);
		return toDisposable(() => {
			this._notebookProxy.$unregisterNotebookSerializer(handle);
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
			return adapter.interruptNotebookExecution(kernelId, document);
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
					if (editor.notebookData === document) {
						editor._acceptKernel(kernel);
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
			throw new Error(`unknown text editor: ${id}. known editors: ${[...this._editors.keys()]} `);
		}

		// ONE: make all state updates
		if (data.visibleRanges) {
			editor._acceptVisibleRanges(data.visibleRanges.ranges.map(typeConverters.NotebookCellRange.to));
		}
		if (data.selections) {
			editor._acceptSelections(data.selections.selections.map(typeConverters.NotebookCellRange.to));
		}

		// TWO: send all events after states have been updated
		if (data.visibleRanges) {
			this._onDidChangeNotebookEditorVisibleRanges.fire({
				notebookEditor: editor.apiEditor,
				visibleRanges: editor.apiEditor.visibleRanges
			});
		}
		if (data.selections) {
			this._onDidChangeNotebookEditorSelection.fire(Object.freeze({
				notebookEditor: editor.apiEditor,
				selections: editor.apiEditor.selections
			}));
		}
	}

	private _editorIdFromApiEditor(editor: vscode.NotebookEditor): string | undefined {
		for (const [id, candidate] of this._editors) {
			if (candidate.apiEditor === editor) {
				return id;
			}
		}
		return undefined;
	}

	//#region --- renderer IPC ---

	private readonly _rendererIpcEmitters = new Map<number, { emitter: Emitter<{ editor: vscode.NotebookEditor, message: any }> }>();

	createNotebookCommunication(rendererId: string): vscode.NotebookRendererCommunication {

		const that = this;
		const handle = this._handlePool++;

		const emitter = new Emitter<{ editor: vscode.NotebookEditor, message: any }>();

		const registration = this._notebookEditorsProxy.$addRendererIpc(rendererId, handle);

		const result: vscode.NotebookRendererCommunication = {

			rendererId,
			onDidReceiveMessage: emitter.event,
			dispose(): void {
				emitter.dispose();
				that._rendererIpcEmitters.delete(handle);
				that._notebookEditorsProxy.$removeRendererIpc(rendererId, handle);
			},
			async postMessage(message, editor) {
				let editorId: string | undefined;
				if (editor) {
					editorId = that._editorIdFromApiEditor(editor);
					if (!editorId) {
						// wanted an editor but that wasn't found
						return false;
					}
				}
				await registration;
				return that._notebookEditorsProxy.$postRendererIpcMessage(rendererId, handle, editorId, message);
			},
			asWebviewUri(localResource, editor) {
				const editorId = that._editorIdFromApiEditor(editor);
				if (!editorId) {
					throw new Error('invalid editor');
				}
				return asWebviewUri(that._webviewInitData, editorId, localResource);
			}
		};

		this._rendererIpcEmitters.set(handle, { emitter });
		return result;
	}

	$acceptEditorIpcMessage(editorId: string, rendererId: string, handles: number[], message: unknown): void {

		const editor = this._editors.get(editorId);
		if (!editor) {
			throw new Error('sending ipc message for UNKNOWN editor');
		}

		for (const handle of handles) {
			this._rendererIpcEmitters.get(handle)?.emitter.fire({ editor: editor.apiEditor, message });
		}
	}

	//#endregion

	$acceptEditorViewColumns(data: INotebookEditorViewColumnInfo): void {
		for (const id in data) {
			const editor = this._editors.get(id);
			if (!editor) {
				throw new Error(`unknown text editor: ${id}. known editors: ${[...this._editors.keys()]} `);
			}
			editor._acceptViewColumn(typeConverters.ViewColumn.to(data[id]));
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

		if (this._editors.has(editorId)) {
			throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
		}

		const revivedUri = document.uri;
		let webComm = this._webviewComm.get(editorId);

		if (!webComm) {
			webComm = new ExtHostWebviewCommWrapper(editorId, revivedUri, this._notebookProxy, this._webviewInitData, document);
			this._webviewComm.set(editorId, webComm);
		}

		const editor = new ExtHostNotebookEditor(
			editorId,
			this._notebookEditorsProxy,
			document,
			data.visibleRanges.map(typeConverters.NotebookCellRange.to),
			data.selections.map(typeConverters.NotebookCellRange.to),
			typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined
		);

		this._editors.set(editorId, editor);
	}

	$acceptDocumentAndEditorsDelta(delta: INotebookDocumentsAndEditorsDelta): void {

		if (delta.removedDocuments) {
			for (const uri of delta.removedDocuments) {
				const revivedUri = URI.revive(uri);
				const document = this._documents.get(revivedUri);

				if (document) {
					document.dispose();
					this._documents.delete(revivedUri);
					this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: document.notebookDocument.getCells().map(cell => cell.document.uri) });
					this._onDidCloseNotebookDocument.fire(document.notebookDocument);
				}

				for (const editor of this._editors.values()) {
					if (editor.notebookData.uri.toString() === revivedUri.toString()) {
						this._editors.delete(editor.id);
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
					throw new Error(`adding EXISTING notebook ${uri} `);
				}
				const that = this;

				const document = new ExtHostNotebookDocument(
					this._notebookDocumentsProxy,
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
				}
			}
		}

		const removedEditors: ExtHostNotebookEditor[] = [];

		if (delta.removedEditors) {
			for (const editorid of delta.removedEditors) {
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

		if (delta.visibleEditors) {
			this._visibleNotebookEditors = delta.visibleEditors.map(id => this._editors.get(id)!).filter(editor => !!editor) as ExtHostNotebookEditor[];
			const visibleEditorsSet = new Set<string>();
			this._visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));

			for (const editor of this._editors.values()) {
				const newValue = visibleEditorsSet.has(editor.id);
				editor._acceptVisibility(newValue);
			}

			this._visibleNotebookEditors = [...this._editors.values()].map(e => e).filter(e => e.visible);
			this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
		}

		if (delta.newActiveEditor === null) {
			// clear active notebook as current active editor is non-notebook editor
			this._activeNotebookEditor = undefined;
		} else if (delta.newActiveEditor) {
			this._activeNotebookEditor = this._editors.get(delta.newActiveEditor);
		}
		if (delta.newActiveEditor !== undefined) {
			this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor?.apiEditor);
		}
	}
	createNotebookCellExecution(docUri: vscode.Uri, index: number, kernelId: string): vscode.NotebookCellExecutionTask | undefined {
		const document = this.lookupNotebookDocument(docUri);
		if (!document) {
			throw new Error(`Invalid cell uri / index: ${docUri}, ${index} `);
		}

		const cell = document.getCellFromIndex(index);
		if (!cell) {
			throw new Error(`Invalid cell uri / index: ${docUri}, ${index} `);
		}

		// TODO@roblou also validate kernelId, once kernel has moved from editor to document
		if (this._activeExecutions.has(cell.uri)) {
			return;
		}

		const execution = new NotebookCellExecutionTask(docUri, document, cell, this._notebookDocumentsProxy);
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

	private _executionOrder: number | undefined;

	constructor(
		private readonly _uri: vscode.Uri,
		private readonly _document: ExtHostNotebookDocument,
		private readonly _cell: ExtHostCell,
		private readonly _proxy: MainThreadNotebookDocumentsShape) {
		super();
		this._tokenSource = this._register(new CancellationTokenSource());

		this._executionOrder = _cell.internalMetadata.executionOrder;
		this.mixinMetadata({
			runState: extHostTypes.NotebookCellExecutionState.Pending,
			lastRunDuration: null,
			executionOrder: null
		});
	}

	cancel(): void {
		this._tokenSource.cancel();
	}

	private async applyEdits(edits: IImmediateCellEditOperation[]): Promise<void> {
		return this._proxy.$applyEdits(this._uri, edits, false);
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
		const edits: IImmediateCellEditOperation[] = [
			{ editType: CellEditType.PartialMetadata, handle: this._cell.handle, metadata: mixinMetadata }
		];
		this.applyEdits(edits);
	}

	private cellIndexToHandle(cellIndex: number | undefined): number | undefined {
		const cell = typeof cellIndex === 'number' ? this._document.getCellFromIndex(cellIndex) : this._cell;
		if (!cell) {
			return;
		}

		return cell.handle;
	}

	asApiObject(): vscode.NotebookCellExecutionTask {
		const that = this;
		return Object.freeze(<vscode.NotebookCellExecutionTask>{
			get document() { return that._document.notebookDocument; },
			get cell() { return that._cell.cell; },

			get executionOrder() { return that._executionOrder; },
			set executionOrder(v: number | undefined) {
				that._executionOrder = v;
				that.mixinMetadata({
					executionOrder: v
				});
			},

			start(context?: vscode.NotebookCellExecuteStartContext): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved || that._state === NotebookCellExecutionTaskState.Started) {
					throw new Error('Cannot call start again');
				}

				that._state = NotebookCellExecutionTaskState.Started;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: extHostTypes.NotebookCellExecutionState.Executing,
					runStartTime: context?.startTime
				});
			},

			end(result?: vscode.NotebookCellExecuteEndContext): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved) {
					throw new Error('Cannot call resolve twice');
				}

				that._state = NotebookCellExecutionTaskState.Resolved;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: extHostTypes.NotebookCellExecutionState.Idle,
					lastRunSuccess: result?.success ?? null,
					lastRunDuration: result?.duration ?? null,
				});
			},

			clearOutput(cellIndex?: number): Thenable<void> {
				that.verifyStateForOutput();
				return this.replaceOutput([], cellIndex);
			},

			async appendOutput(outputs: vscode.NotebookCellOutput | vscode.NotebookCellOutput[], cellIndex?: number): Promise<void> {
				that.verifyStateForOutput();
				const handle = that.cellIndexToHandle(cellIndex);
				if (typeof handle !== 'number') {
					return;
				}

				outputs = Array.isArray(outputs) ? outputs : [outputs];
				return that.applyEdits([{ editType: CellEditType.Output, handle, append: true, outputs: outputs.map(typeConverters.NotebookCellOutput.from) }]);
			},

			async replaceOutput(outputs: vscode.NotebookCellOutput | vscode.NotebookCellOutput[], cellIndex?: number): Promise<void> {
				that.verifyStateForOutput();
				const handle = that.cellIndexToHandle(cellIndex);
				if (typeof handle !== 'number') {
					return;
				}

				outputs = Array.isArray(outputs) ? outputs : [outputs];
				return that.applyEdits([{ editType: CellEditType.Output, handle, outputs: outputs.map(typeConverters.NotebookCellOutput.from) }]);
			},

			async appendOutputItems(items: vscode.NotebookCellOutputItem | vscode.NotebookCellOutputItem[], outputId: string): Promise<void> {
				that.verifyStateForOutput();
				items = Array.isArray(items) ? items : [items];
				return that.applyEdits([{ editType: CellEditType.OutputItems, append: true, items: items.map(typeConverters.NotebookCellOutputItem.from), outputId }]);
			},

			async replaceOutputItems(items: vscode.NotebookCellOutputItem | vscode.NotebookCellOutputItem[], outputId: string): Promise<void> {
				that.verifyStateForOutput();
				items = Array.isArray(items) ? items : [items];
				return that.applyEdits([{ editType: CellEditType.OutputItems, items: items.map(typeConverters.NotebookCellOutputItem.from), outputId }]);
			},

			token: that._tokenSource.token
		});
	}
}
