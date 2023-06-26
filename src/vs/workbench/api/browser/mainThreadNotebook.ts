/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { NotebookDto } from 'vs/workbench/api/browser/mainThreadNotebookDto';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItemProvider, INotebookContributionData, NotebookData, NotebookExtensionDescription, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { ExtHostContext, ExtHostNotebookShape, MainContext, MainThreadNotebookShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks implements MainThreadNotebookShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookShape;
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
		dispose(this._notebookSerializer.values());
	}

	$registerNotebookSerializer(handle: number, extension: NotebookExtensionDescription, viewType: string, options: TransientOptions, data: INotebookContributionData | undefined): void {
		const disposables = new DisposableStore();

		disposables.add(this._notebookService.registerNotebookSerializer(viewType, extension, {
			options,
			dataToNotebook: async (data: VSBuffer): Promise<NotebookData> => {
				const sw = new StopWatch();
				let result: NotebookData;
				if (data.byteLength === 0 && viewType === 'interactive') {
					// we don't want any starting cells for an empty interactive window.
					result = NotebookDto.fromNotebookDataDto({ cells: [], metadata: {} });
				} else {
					const dto = await this._proxy.$dataToNotebook(handle, data, CancellationToken.None);
					result = NotebookDto.fromNotebookDataDto(dto.value);
				}
				this._logService.trace(`[NotebookSerializer] dataToNotebook DONE after ${sw.elapsed()}ms`, {
					viewType,
					extensionId: extension.id.value,
				});
				return result;
			},
			notebookToData: (data: NotebookData): Promise<VSBuffer> => {
				const sw = new StopWatch();
				const result = this._proxy.$notebookToData(handle, new SerializableObjectWithBuffers(NotebookDto.toNotebookDataDto(data)), CancellationToken.None);
				this._logService.trace(`[NotebookSerializer] notebookToData DONE after ${sw.elapsed()}`, {
					viewType,
					extensionId: extension.id.value,
				});
				return result;
			},
			save: async (uri, versionId, options, token) => {
				const stat = await this._proxy.$saveNotebook(handle, uri, versionId, options, token);
				return {
					...stat,
					children: undefined,
					resource: uri
				};
			},
		}));

		if (data) {
			disposables.add(this._notebookService.registerContributedNotebookType(viewType, data));
		}
		this._notebookSerializer.set(handle, disposables);

		this._logService.trace('[NotebookSerializer] registered notebook serializer', {
			viewType,
			extensionId: extension.id.value,
		});
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
