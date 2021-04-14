/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { IRelativePattern } from 'vs/base/common/glob';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { ICellRange, INotebookCellStatusBarItemProvider, INotebookDocumentFilter, INotebookExclusiveDocumentFilter, INotebookKernel, NotebookDataDto, TransientMetadata, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IMainNotebookController, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ExtHostContext, ExtHostNotebookShape, IExtHostContext, MainContext, MainThreadNotebookShape, NotebookExtensionDescription } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks implements MainThreadNotebookShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookShape;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, disposable: IDisposable }>();
	private readonly _notebookSerializer = new Map<number, IDisposable>();
	private readonly _notebookKernelProviders = new Map<number, { extension: NotebookExtensionDescription, emitter: Emitter<URI | undefined>, provider: IDisposable }>();
	private readonly _notebookCellStatusBarRegistrations = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@ILogService private readonly _logService: ILogService,
		@INotebookCellStatusBarService private readonly _cellStatusBarService: INotebookCellStatusBarService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
		this._registerListeners();
	}

	dispose(): void {
		this._disposables.dispose();

		// remove all notebook providers
		for (const item of this._notebookProviders.values()) {
			item.disposable.dispose();
		}

		// remove all kernel providers
		for (const item of this._notebookKernelProviders.values()) {
			item.emitter.dispose();
			item.provider.dispose();
		}
		dispose(this._notebookSerializer.values());
	}


	private _registerListeners(): void {
		this._disposables.add(this._notebookService.onDidChangeNotebookActiveKernel(e => {
			this._proxy.$acceptNotebookActiveKernelChange(e);
		}));
	}

	async $registerNotebookProvider(extension: NotebookExtensionDescription, viewType: string, options: {
		transientOutputs: boolean;
		transientMetadata: TransientMetadata;
		viewOptions?: { displayName: string; filenamePattern: (string | IRelativePattern | INotebookExclusiveDocumentFilter)[]; exclusive: boolean; };
	}): Promise<void> {
		let contentOptions = { transientOutputs: options.transientOutputs, transientMetadata: options.transientMetadata };

		const controller: IMainNotebookController = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientMetadata = newOptions.transientMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			viewOptions: options.viewOptions,
			open: async (uri: URI, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken) => {
				const data = await this._proxy.$openNotebook(viewType, uri, backupId, untitledDocumentData, token);
				return {
					data,
					transientOptions: contentOptions
				};
			},
			resolveNotebookEditor: async (viewType: string, uri: URI, editorId: string) => {
				await this._proxy.$resolveNotebookEditor(viewType, uri, editorId);
			},
			onDidReceiveMessage: (editorId: string, rendererType: string | undefined, message: unknown) => {
				this._proxy.$onDidReceiveMessage(editorId, rendererType, message);
			},
			save: async (uri: URI, token: CancellationToken) => {
				return this._proxy.$saveNotebook(viewType, uri, token);
			},
			saveAs: async (uri: URI, target: URI, token: CancellationToken) => {
				return this._proxy.$saveNotebookAs(viewType, uri, target, token);
			},
			backup: async (uri: URI, token: CancellationToken) => {
				return this._proxy.$backupNotebook(viewType, uri, token);
			}
		};

		const disposable = this._notebookService.registerNotebookController(viewType, extension, controller);
		this._notebookProviders.set(viewType, { controller, disposable });
	}

	async $updateNotebookProviderOptions(viewType: string, options?: { transientOutputs: boolean; transientMetadata: TransientMetadata; }): Promise<void> {
		const provider = this._notebookProviders.get(viewType);

		if (provider && options) {
			provider.controller.options = options;
			this._notebookService.listNotebookDocuments().forEach(document => {
				if (document.viewType === viewType) {
					document.transientOptions = provider.controller.options;
				}
			});
		}
	}

	async $unregisterNotebookProvider(viewType: string): Promise<void> {
		const entry = this._notebookProviders.get(viewType);
		if (entry) {
			entry.disposable.dispose();
			this._notebookProviders.delete(viewType);
		}
	}

	$registerNotebookSerializer(handle: number, extension: NotebookExtensionDescription, viewType: string, options: TransientOptions): void {
		const registration = this._notebookService.registerNotebookSerializer(viewType, extension, {
			options,
			dataToNotebook: (data: VSBuffer): Promise<NotebookDataDto> => {
				return this._proxy.$dataToNotebook(handle, data);
			},
			notebookToData: (data: NotebookDataDto): Promise<VSBuffer> => {
				return this._proxy.$notebookToData(handle, data);
			}
		});
		this._notebookSerializer.set(handle, registration);
	}

	$unregisterNotebookSerializer(handle: number): void {
		this._notebookSerializer.get(handle)?.dispose();
		this._notebookSerializer.delete(handle);
	}

	async $registerNotebookKernelProvider(extension: NotebookExtensionDescription, handle: number, documentFilter: INotebookDocumentFilter): Promise<void> {
		const emitter = new Emitter<URI | undefined>();
		const that = this;

		const provider = this._notebookService.registerNotebookKernelProvider({
			providerExtensionId: extension.id.value,
			providerDescription: extension.description,
			onDidChangeKernels: emitter.event,
			selector: documentFilter,
			provideKernels: async (uri: URI, token: CancellationToken): Promise<INotebookKernel[]> => {
				const result: INotebookKernel[] = [];
				const kernelsDto = await that._proxy.$provideNotebookKernels(handle, uri, token);
				for (const dto of kernelsDto) {
					result.push({
						id: dto.id,
						friendlyId: dto.friendlyId,
						label: dto.label,
						extension: dto.extension,
						localResourceRoot: URI.revive(dto.extensionLocation),
						providerHandle: dto.providerHandle,
						description: dto.description,
						detail: dto.detail,
						isPreferred: dto.isPreferred,
						preloadProvides: flatten(dto.preloads?.map(p => p.provides) ?? []),
						preloadUris: dto.preloads?.map(u => URI.revive(u.uri)) ?? [],
						supportedLanguages: dto.supportedLanguages,
						implementsInterrupt: dto.implementsInterrupt,
						implementsExecutionOrder: true, // todo@jrieken this is temporary and for the OLD API only
						resolve: (uri: URI, editorId: string, token: CancellationToken): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.resolveNotebookKernel', uri.path, dto.friendlyId);
							return this._proxy.$resolveNotebookKernel(handle, editorId, uri, dto.friendlyId, token);
						},
						executeNotebookCellsRequest: (uri: URI, cellRanges: ICellRange[]): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.executeNotebookCell', uri.path, dto.friendlyId, cellRanges);
							return this._proxy.$executeNotebookKernelFromProvider(handle, uri, dto.friendlyId, cellRanges);
						},
						cancelNotebookCellExecution: (uri: URI, cellRanges: ICellRange[]): Promise<void> => {
							this._logService.debug('MainthreadNotebooks.cancelNotebookCellExecution', uri.path, dto.friendlyId, cellRanges);
							return this._proxy.$cancelNotebookCellExecution(handle, uri, dto.friendlyId, cellRanges);
						}
					});
				}
				return result;
			}
		});
		this._notebookKernelProviders.set(handle, { extension, emitter, provider });
		return;
	}

	$emitCellStatusBarEvent(eventHandle: number): void {
		const emitter = this._notebookCellStatusBarRegistrations.get(eventHandle);
		if (emitter instanceof Emitter) {
			emitter.fire(undefined);
		}
	}

	async $registerNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined, documentFilter: INotebookDocumentFilter): Promise<void> {
		const that = this;
		const provider: INotebookCellStatusBarItemProvider = {
			async provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken) {
				const result = await that._proxy.$provideNotebookCellStatusBarItems(handle, uri, index, token);
				return {
					items: result?.items ?? [],
					dispose() {
						if (result) {
							that._proxy.$releaseNotebookCellStatusBarItems(result.cacheId);
						}
					}
				};
			},
			selector: documentFilter
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<void>();
			this._notebookCellStatusBarRegistrations.set(eventHandle, emitter);
			provider.onDidChangeStatusBarItems = emitter.event;
		}

		const disposable = this._cellStatusBarService.registerCellStatusBarItemProvider(provider);
		this._notebookCellStatusBarRegistrations.set(handle, disposable);
	}

	async $unregisterNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined): Promise<void> {
		const unregisterThing = (handle: number) => {
			const entry = this._notebookCellStatusBarRegistrations.get(handle);
			if (entry) {
				this._notebookCellStatusBarRegistrations.get(handle)?.dispose();
				this._notebookCellStatusBarRegistrations.delete(handle);
			}
		};
		unregisterThing(handle);
		if (typeof eventHandle === 'number') {
			unregisterThing(eventHandle);
		}
	}

	async $unregisterNotebookKernelProvider(handle: number): Promise<void> {
		const entry = this._notebookKernelProviders.get(handle);

		if (entry) {
			entry.emitter.dispose();
			entry.provider.dispose();
			this._notebookKernelProviders.delete(handle);
		}
	}

	$onNotebookKernelChange(handle: number, uriComponents: UriComponents): void {
		const entry = this._notebookKernelProviders.get(handle);

		entry?.emitter.fire(uriComponents ? URI.revive(uriComponents) : undefined);
	}

	async $postMessage(id: string, forRendererId: string | undefined, value: any): Promise<boolean> {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (!editor) {
			return false;
		}
		editor.postMessage(forRendererId, value);
		return true;
	}
}
