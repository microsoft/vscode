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
import { bufferToStream, newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { StoredValue } from './storedValue.js';
import { HydratedTestResult } from './testResult.js';
export const RETAIN_MAX_RESULTS = 128;
const RETAIN_MIN_RESULTS = 16;
const RETAIN_MAX_BYTES = 1024 * 128;
const CLEANUP_PROBABILITY = 0.2;
export const ITestResultStorage = createDecorator('ITestResultStorage');
/**
 * Data revision this version of VS Code deals with. Should be bumped whenever
 * a breaking change is made to the stored results, which will cause previous
 * revisions to be discarded.
 */
const currentRevision = 1;
let BaseTestResultStorage = class BaseTestResultStorage extends Disposable {
    constructor(uriIdentityService, storageService, logService) {
        super();
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.stored = this._register(new StoredValue({
            key: 'storedTestResults',
            scope: 1 /* StorageScope.WORKSPACE */,
            target: 1 /* StorageTarget.MACHINE */
        }, storageService));
    }
    /**
     * @override
     */
    async read() {
        const results = await Promise.all(this.stored.get([]).map(async (rec) => {
            if (rec.rev !== currentRevision) {
                return undefined;
            }
            try {
                const contents = await this.readForResultId(rec.id);
                if (!contents) {
                    return undefined;
                }
                return { rec, result: new HydratedTestResult(this.uriIdentityService, contents) };
            }
            catch (e) {
                this.logService.warn(`Error deserializing stored test result ${rec.id}`, e);
                return undefined;
            }
        }));
        const defined = results.filter(isDefined);
        if (defined.length !== results.length) {
            this.stored.store(defined.map(({ rec }) => rec));
        }
        return defined.map(({ result }) => result);
    }
    /**
     * @override
     */
    getResultOutputWriter(resultId) {
        const stream = newWriteableBufferStream();
        this.storeOutputForResultId(resultId, stream);
        return stream;
    }
    /**
     * @override
     */
    async persist(results) {
        const toDelete = new Map(this.stored.get([]).map(({ id, bytes }) => [id, bytes]));
        const toStore = [];
        const todo = [];
        let budget = RETAIN_MAX_BYTES;
        // Run until either:
        // 1. We store all results
        // 2. We store the max results
        // 3. We store the min results, and have no more byte budget
        for (let i = 0; i < results.length && i < RETAIN_MAX_RESULTS && (budget > 0 || toStore.length < RETAIN_MIN_RESULTS); i++) {
            const result = results[i];
            const existingBytes = toDelete.get(result.id);
            if (existingBytes !== undefined) {
                toDelete.delete(result.id);
                toStore.push({ id: result.id, rev: currentRevision, bytes: existingBytes });
                budget -= existingBytes;
                continue;
            }
            const obj = result.toJSON();
            if (!obj) {
                continue;
            }
            const contents = VSBuffer.fromString(JSON.stringify(obj));
            todo.push(this.storeForResultId(result.id, obj));
            toStore.push({ id: result.id, rev: currentRevision, bytes: contents.byteLength });
            budget -= contents.byteLength;
        }
        for (const id of toDelete.keys()) {
            todo.push(this.deleteForResultId(id).catch(() => undefined));
        }
        this.stored.store(toStore);
        await Promise.all(todo);
    }
};
BaseTestResultStorage = __decorate([
    __param(0, IUriIdentityService),
    __param(1, IStorageService),
    __param(2, ILogService)
], BaseTestResultStorage);
export { BaseTestResultStorage };
export class InMemoryResultStorage extends BaseTestResultStorage {
    constructor() {
        super(...arguments);
        this.cache = new Map();
    }
    async readForResultId(id) {
        return Promise.resolve(this.cache.get(id));
    }
    storeForResultId(id, contents) {
        this.cache.set(id, contents);
        return Promise.resolve();
    }
    deleteForResultId(id) {
        this.cache.delete(id);
        return Promise.resolve();
    }
    readOutputForResultId(id) {
        throw new Error('Method not implemented.');
    }
    storeOutputForResultId(id, input) {
        throw new Error('Method not implemented.');
    }
    readOutputRangeForResultId(id, offset, length) {
        throw new Error('Method not implemented.');
    }
}
let TestResultStorage = class TestResultStorage extends BaseTestResultStorage {
    constructor(uriIdentityService, storageService, logService, workspaceContext, fileService, environmentService) {
        super(uriIdentityService, storageService, logService);
        this.fileService = fileService;
        this.directory = URI.joinPath(environmentService.workspaceStorageHome, workspaceContext.getWorkspace().id, 'testResults');
    }
    async readForResultId(id) {
        const contents = await this.fileService.readFile(this.getResultJsonPath(id));
        return JSON.parse(contents.value.toString());
    }
    storeForResultId(id, contents) {
        return this.fileService.writeFile(this.getResultJsonPath(id), VSBuffer.fromString(JSON.stringify(contents)));
    }
    deleteForResultId(id) {
        return this.fileService.del(this.getResultJsonPath(id)).catch(() => undefined);
    }
    async readOutputRangeForResultId(id, offset, length) {
        try {
            const { value } = await this.fileService.readFile(this.getResultOutputPath(id), { position: offset, length });
            return value;
        }
        catch {
            return VSBuffer.alloc(0);
        }
    }
    async readOutputForResultId(id) {
        try {
            const { value } = await this.fileService.readFileStream(this.getResultOutputPath(id));
            return value;
        }
        catch {
            return bufferToStream(VSBuffer.alloc(0));
        }
    }
    async storeOutputForResultId(id, input) {
        await this.fileService.createFile(this.getResultOutputPath(id), input);
    }
    /**
     * @inheritdoc
     */
    async persist(results) {
        await super.persist(results);
        if (Math.random() < CLEANUP_PROBABILITY) {
            await this.cleanupDereferenced();
        }
    }
    /**
     * Cleans up orphaned files. For instance, output can get orphaned if it's
     * written but the editor is closed before the test run is complete.
     */
    async cleanupDereferenced() {
        const { children } = await this.fileService.resolve(this.directory);
        if (!children) {
            return;
        }
        const stored = new Set(this.stored.get([]).filter(s => s.rev === currentRevision).map(s => s.id));
        await Promise.all(children
            .filter(child => !stored.has(child.name.replace(/\.[a-z]+$/, '')))
            .map(child => this.fileService.del(child.resource).catch(() => undefined)));
    }
    getResultJsonPath(id) {
        return URI.joinPath(this.directory, `${id}.json`);
    }
    getResultOutputPath(id) {
        return URI.joinPath(this.directory, `${id}.output`);
    }
};
TestResultStorage = __decorate([
    __param(0, IUriIdentityService),
    __param(1, IStorageService),
    __param(2, ILogService),
    __param(3, IWorkspaceContextService),
    __param(4, IFileService),
    __param(5, IEnvironmentService)
], TestResultStorage);
export { TestResultStorage };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdFN0b3JhZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0UmVzdWx0U3RvcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLHdCQUF3QixFQUFFLFFBQVEsRUFBbUQsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4SixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvQyxPQUFPLEVBQUUsa0JBQWtCLEVBQWUsTUFBTSxpQkFBaUIsQ0FBQztBQUdsRSxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLENBQUM7QUFDdEMsTUFBTSxrQkFBa0IsR0FBRyxFQUFFLENBQUM7QUFDOUIsTUFBTSxnQkFBZ0Is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