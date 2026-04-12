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
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { assertType } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { INotebookCellStatusBarService } from '../../contrib/notebook/common/notebookCellStatusBarService.js';
import { INotebookService, SimpleNotebookProviderInfo } from '../../contrib/notebook/common/notebookService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { revive } from '../../../base/common/marshalling.js';
import { coalesce } from '../../../base/common/arrays.js';
import { FileOperationError } from '../../../platform/files/common/files.js';
let MainThreadNotebooks = class MainThreadNotebooks {
    constructor(extHostContext, _notebookService, _cellStatusBarService, _logService) {
        this._notebookService = _notebookService;
        this._cellStatusBarService = _cellStatusBarService;
        this._logService = _logService;
        this._disposables = new DisposableStore();
        this._notebookSerializer = new Map();
        this._notebookCellStatusBarRegistrations = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
    }
    dispose() {
        this._disposables.dispose();
        dispose(this._notebookSerializer.values());
    }
    $registerNotebookSerializer(handle, extension, viewType, options, data) {
        const disposables = new DisposableStore();
        disposables.add(this._notebookService.registerNotebookSerializer(viewType, extension, {
            options,
            dataToNotebook: async (data) => {
                const sw = new StopWatch();
                let result;
                if (data.byteLength === 0 && viewType === 'interactive') {
                    // we don't want any starting cells for an empty interactive window.
                    result = NotebookDto.fromNotebookDataDto({ cells: [], metadata: {} });
                }
                else {
                    const dto = await this._proxy.$dataToNotebook(handle, data, CancellationToken.None);
                    result = NotebookDto.fromNotebookDataDto(dto.value);
                }
                this._logService.trace(`[NotebookSerializer] dataToNotebook DONE after ${sw.elapsed()}ms`, {
                    viewType,
                    extensionId: extension.id.value,
                });
                return result;
            },
            notebookToData: (data) => {
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
            searchInNotebooks: async (textQuery, token, allPriorityInfo) => {
                const contributedType = this._notebookService.getContributedNotebookType(viewType);
                if (!contributedType) {
                    return { results: [], limitHit: false };
                }
                const fileNames = contributedType.selectors;
                const includes = fileNames.map((selector) => {
                    const globPattern = selector.include || selector;
                    return globPattern.toString();
                });
                if (!includes.length) {
                    return {
                        results: [], limitHit: false
                    };
                }
                const thisPriorityInfo = coalesce([{ isFromSettings: false, filenamePatterns: includes }, ...allPriorityInfo.get(viewType) ?? []]);
                const otherEditorsPriorityInfo = Array.from(allPriorityInfo.keys())
                    .flatMap(key => {
                    if (key !== viewType) {
                        return allPriorityInfo.get(key) ?? [];
                    }
                    return [];
                });
                const searchComplete = await this._proxy.$searchInNotebooks(handle, textQuery, thisPriorityInfo, otherEditorsPriorityInfo, token);
                const revivedResults = searchComplete.results.map(result => {
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
    $unregisterNotebookSerializer(handle) {
        this._notebookSerializer.get(handle)?.dispose();
        this._notebookSerializer.delete(handle);
    }
    $emitCellStatusBarEvent(eventHandle) {
        const emitter = this._notebookCellStatusBarRegistrations.get(eventHandle);
        if (emitter instanceof Emitter) {
            emitter.fire(undefined);
        }
    }
    async $registerNotebookCellStatusBarItemProvider(handle, eventHandle, viewType) {
        const that = this;
        const provider = {
            async provideCellStatusBarItems(uri, index, token) {
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
            const emitter = new Emitter();
            this._notebookCellStatusBarRegistrations.set(eventHandle, emitter);
            provider.onDidChangeStatusBarItems = emitter.event;
        }
        const disposable = this._cellStatusBarService.registerCellStatusBarItemProvider(provider);
        this._notebookCellStatusBarRegistrations.set(handle, disposable);
    }
    async $unregisterNotebookCellStatusBarItemProvider(handle, eventHandle) {
        const unregisterThing = (handle) => {
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
};
MainThreadNotebooks = __decorate([
    extHostNamedCustomer(MainContext.MainThreadNotebook),
    __param(1, INotebookService),
    __param(2, INotebookCellStatusBarService),
    __param(3, ILogService)
], MainThreadNotebooks);
export { MainThreadNotebooks };
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
CommandsRegistry.registerCommand('_executeNotebookToData', async (accessor, notebookType, dto) => {
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
function isFileOperationError(error) {
    const candidate = error;
    return typeof candidate?.fileOperationResult === 'number' && typeof candidate?.message === 'string';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE5vdGVib29rLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWROb3RlYm9vay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDMUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMzRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDcEcsT0FBTyxFQUFFLGNBQWMsRUFBd0IsV0FBVyxFQUE0QyxNQUFNLCtCQUErQixDQUFDO0FB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