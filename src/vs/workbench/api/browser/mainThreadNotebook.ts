/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NotebookDto } from 'vs/workbench/api/browser/mainThreadNotebookDto';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItemProvider, INotebookContributionData, NotebookData as NotebookData, NotebookExtensionDescription, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookContentProvider, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { ExtHostContext, ExtHostNotebookShape, MainContext, MainThreadNotebookShape } from '../common/extHost.protocol';
import { ILogService } from 'vs/platform/log/common/log';
import { StopWatch } from 'vs/base/common/stopwatch';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { assertType } from 'vs/base/common/types';

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks implements MainThreadNotebookShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookShape;
	private readonly _notebookProviders = new Map<string, { controller: INotebookContentProvider; disposable: IDisposable }>();
	private readonly _notebookSerializer = new Map<number, IDisposable>();
	private readonly _notebookCellStatusBarRegistrations = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookCellStatusBarService private readonly _cellStatusBarService: INotebookCellStatusBarService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
	}

	dispose(): void {
		this._disposables.dispose();
		// remove all notebook providers
		for (const item of this._notebookProviders.values()) {
			item.disposable.dispose();
		}
		dispose(this._notebookSerializer.values());
	}

	async $registerNotebookProvider(extension: NotebookExtensionDescription, viewType: string, options: TransientOptions, data: INotebookContributionData | undefined): Promise<void> {
		const contentOptions = { ...options };

		const controller: INotebookContentProvider = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientCellMetadata = newOptions.transientCellMetadata;
				contentOptions.transientDocumentMetadata = newOptions.transientDocumentMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			open: async (uri: URI, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken) => {
				const data = await this._proxy.$openNotebook(viewType, uri, backupId, untitledDocumentData, token);
				return {
					data: NotebookDto.fromNotebookDataDto(data.value),
					transientOptions: contentOptions
				};
			},
			backup: async (uri: URI, token: CancellationToken) => ''
		};

		const disposable = new DisposableStore();
		disposable.add(this._notebookService.registerNotebookController(viewType, extension, controller));
		if (data) {
			disposable.add(this._notebookService.registerContributedNotebookType(viewType, data));
		}
		this._notebookProviders.set(viewType, { controller, disposable });
	}

	async $unregisterNotebookProvider(viewType: string): Promise<void> {
		const entry = this._notebookProviders.get(viewType);
		if (entry) {
			entry.disposable.dispose();
			this._notebookProviders.delete(viewType);
		}
	}

	$registerNotebookSerializer(handle: number, extension: NotebookExtensionDescription, viewType: string, options: TransientOptions, data: INotebookContributionData | undefined): void {
		const registration = this._notebookService.registerNotebookSerializer(viewType, extension, {
			options,
			dataToNotebook: async (data: VSBuffer): Promise<NotebookData> => {
				const sw = new StopWatch(true);
				const dto = await this._proxy.$dataToNotebook(handle, data, CancellationToken.None);
				const result = NotebookDto.fromNotebookDataDto(dto.value);
				this._logService.trace('[NotebookSerializer] dataToNotebook DONE', extension.id, sw.elapsed());
				return result;
			},
			notebookToData: (data: NotebookData): Promise<VSBuffer> => {
				const sw = new StopWatch(true);
				const result = this._proxy.$notebookToData(handle, new SerializableObjectWithBuffers(NotebookDto.toNotebookDataDto(data)), CancellationToken.None);
				this._logService.trace('[NotebookSerializer] notebookToData DONE', extension.id, sw.elapsed());
				return result;
			}
		});
		const disposables = new DisposableStore();
		disposables.add(registration);
		if (data) {
			disposables.add(this._notebookService.registerContributedNotebookType(viewType, data));
		}
		this._notebookSerializer.set(handle, disposables);
	}

	$unregisterNotebookSerializer(handle: number): void {
		this._notebookSerializer.get(handle)?.dispose();
		this._notebookSerializer.delete(handle);
	}

	$emitCellStatusBarEvent(eventHandle: number): void {
		const emitter = this._notebookCellStatusBarRegistrations.get(eventHandle);
		if (emitter instanceof Emitter) {
			emitter.fire(undefined);
		}
	}

	async $registerNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined, viewType: string): Promise<void> {
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
			viewType
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
}

CommandsRegistry.registerCommand('_executeDataToNotebook', async (accessor, ...args) => {

	const [notebookType, bytes] = args;
	assertType(typeof notebookType === 'string', 'string');
	assertType(bytes instanceof VSBuffer, 'VSBuffer');

	const notebookService = accessor.get(INotebookService);
	const info = await notebookService.withNotebookDataProvider(notebookType);
	if (!(info instanceof SimpleNotebookProviderInfo)) {
		return;
	}

	const dto = await info.serializer.dataToNotebook(bytes);
	return new SerializableObjectWithBuffers(NotebookDto.toNotebookDataDto(dto));
});

CommandsRegistry.registerCommand('_executeNotebookToData', async (accessor, ...args) => {

	const [notebookType, dto] = args;
	assertType(typeof notebookType === 'string', 'string');
	assertType(typeof dto === 'object');

	const notebookService = accessor.get(INotebookService);
	const info = await notebookService.withNotebookDataProvider(notebookType);
	if (!(info instanceof SimpleNotebookProviderInfo)) {
		return;
	}

	const data = NotebookDto.fromNotebookDataDto(dto.value);
	const bytes = await info.serializer.notebookToData(data);
	return bytes;
});
