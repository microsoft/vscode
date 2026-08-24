/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, dispose, IDisposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { assertType } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { INotebookCellStatusBarService } from '../../contrib/notebook/common/notebookCellStatusBarService.js';
import { INotebookCellStatusBarItemProvider, INotebookContributionData, INotebookExclusiveDocumentFilter, NotebookData, NotebookExtensionDescription, TransientOptions } from '../../contrib/notebook/common/notebookCommon.js';
import { INotebookService, SimpleNotebookProviderInfo } from '../../contrib/notebook/common/notebookService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostNotebookShape, MainContext, MainThreadNotebookShape, NotebookDataDto } from '../common/extHost.protocol.js';
import { IRelativePattern } from '../../../base/common/glob.js';
import { revive } from '../../../base/common/marshalling.js';
import { INotebookFileMatchNoModel } from '../../contrib/search/common/searchNotebookHelpers.js';
import { NotebookPriorityInfo } from '../../contrib/search/common/search.js';
import { coalesce } from '../../../base/common/arrays.js';
import { FileOperationError } from '../../../platform/files/common/files.js';

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
				if (isFileOperationError(stat)) {
					throw new FileOperationError(stat.message, stat.fileOperationResult, stat.options);
				}
				return {
					...stat,
					children: undefined,
					resource: uri
				};
			},
			searchInNotebooks: async (textQuery, token, allPriorityInfo): Promise<{ results: INotebookFileMatchNoModel<URI>[]; limitHit: boolean }> => {
				const contributedType = this._notebookService.getContributedNotebookType(viewType);
				if (!contributedType) {
					return { results: [], limitHit: false };
				}
				const fileNames = contributedType.selectors;

				const includes = fileNames.map((selector) => {
					const globPattern = (selector as INotebookExclusiveDocumentFilter).include || selector as IRelativePattern | string;
					return globPattern.toString();
				});

				if (!includes.length) {
					return {
						results: [], limitHit: false
					};
				}

				const thisPriorityInfo = coalesce<NotebookPriorityInfo>([{ isFromSettings: false, filenamePatterns: includes }, ...allPriorityInfo.get(viewType) ?? []]);
				const otherEditorsPriorityInfo = Array.from(allPriorityInfo.keys())
					.flatMap(key => {
						if (key !== viewType) {
							return allPriorityInfo.get(key) ?? [];
						}
						return [];
					});

				const searchComplete = await this._proxy.$searchInNotebooks(handle, textQuery, thisPriorityInfo, otherEditorsPriorityInfo, token);
				const revivedResults: INotebookFileMatchNoModel<URI>[] = searchComplete.results.map(result => {
					const resource = URI.revive(result.resource);
					return {
						resource,
						cellResults: result.cellResults.map(e => revive(e))
					};
				});
				return { results: revivedResults, limitHit: searchComplete.limitHit };
			}
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

CommandsRegistry.registerCommand('_executeNotebookToData', async (accessor, notebookType: string, dto: SerializableObjectWithBuffers<NotebookDataDto>) => {
	assertType(typeof notebookType === 'string', 'string');

	const notebookService = accessor.get(INotebookService);
	const info = await notebookService.withNotebookDataProvider(notebookType);
	if (!(info instanceof SimpleNotebookProviderInfo)) {
		return;
	}

	const data = NotebookDto.fromNotebookDataDto(dto.value);
	const bytes = await info.serializer.notebookToData(data);
	return bytes;
});

function isFileOperationError(error: unknown): error is FileOperationError {
	const candidate = error as FileOperationError | undefined;
	return typeof candidate?.fileOperationResult === 'number' && typeof candidate?.message === 'string';
}
