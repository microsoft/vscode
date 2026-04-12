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
import { ThrottledDelayer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isUndefined, isUndefinedOrNull } from '../../../base/common/types.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
export var SaveStrategy;
(function (SaveStrategy) {
    SaveStrategy[SaveStrategy["IMMEDIATE"] = 0] = "IMMEDIATE";
    SaveStrategy[SaveStrategy["DELAYED"] = 1] = "DELAYED";
})(SaveStrategy || (SaveStrategy = {}));
export class FileStorage extends Disposable {
    constructor(storagePath, saveStrategy, logService, fileService) {
        super();
        this.storagePath = storagePath;
        this.logService = logService;
        this.fileService = fileService;
        this.storage = Object.create(null);
        this.lastSavedStorageContents = '';
        this.initializing = undefined;
        this.closing = undefined;
        this.flushDelayer = this._register(new ThrottledDelayer(saveStrategy === 0 /* SaveStrategy.IMMEDIATE */ ? 0 : 100 /* buffer saves over a short time */));
    }
    init() {
        if (!this.initializing) {
            this.initializing = this.doInit();
        }
        return this.initializing;
    }
    async doInit() {
        try {
            this.lastSavedStorageContents = (await this.fileService.readFile(this.storagePath)).value.toString();
            this.storage = JSON.parse(this.lastSavedStorageContents);
        }
        catch (error) {
            if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.error(error);
            }
        }
    }
    getItem(key, defaultValue) {
        const res = this.storage[key];
        if (isUndefinedOrNull(res)) {
            return defaultValue;
        }
        return res;
    }
    setItem(key, data) {
        this.setItems([{ key, data }]);
    }
    setItems(items) {
        let save = false;
        for (const { key, data } of items) {
            // Shortcut for data that did not change
            if (this.storage[key] === data) {
                continue;
            }
            // Remove items when they are undefined or null
            if (isUndefinedOrNull(data)) {
                if (!isUndefined(this.storage[key])) {
                    this.storage[key] = undefined;
                    save = true;
                }
            }
            // Otherwise add an item
            else {
                this.storage[key] = data;
                save = true;
            }
        }
        if (save) {
            this.save();
        }
    }
    removeItem(key) {
        // Only update if the key is actually present (not undefined)
        if (!isUndefined(this.storage[key])) {
            this.storage[key] = undefined;
            this.save();
        }
    }
    async save() {
        if (this.closing) {
            return; // already about to close
        }
        return this.flushDelayer.trigger(() => this.doSave());
    }
    async doSave() {
        if (!this.initializing) {
            return; // if we never initialized, we should not save our state
        }
        // Make sure to wait for init to finish first
        await this.initializing;
        // Return early if the database has not changed
        const serializedDatabase = JSON.stringify(this.storage, null, 4);
        if (serializedDatabase === this.lastSavedStorageContents) {
            return;
        }
        // Write to disk
        try {
            await this.fileService.writeFile(this.storagePath, VSBuffer.fromString(serializedDatabase), { atomic: { postfix: '.vsctmp' } });
            this.lastSavedStorageContents = serializedDatabase;
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    async close() {
        if (!this.closing) {
            this.closing = this.flushDelayer.trigger(() => this.doSave(), 0 /* as soon as possible */);
        }
        return this.closing;
    }
}
let StateReadonlyService = class StateReadonlyService extends Disposable {
    constructor(saveStrategy, environmentService, logService, fileService) {
        super();
        this.fileStorage = this._register(new FileStorage(environmentService.stateResource, saveStrategy, logService, fileService));
    }
    async init() {
        await this.fileStorage.init();
    }
    getItem(key, defaultValue) {
        return this.fileStorage.getItem(key, defaultValue);
    }
};
StateReadonlyService = __decorate([
    __param(1, IEnvironmentService),
    __param(2, ILogService),
    __param(3, IFileService)
], StateReadonlyService);
export { StateReadonlyService };
export class StateService extends StateReadonlyService {
    setItem(key, data) {
        this.fileStorage.setItem(key, data);
    }
    setItems(items) {
        this.fileStorage.setItems(items);
    }
    removeItem(key) {
        this.fileStorage.removeItem(key);
    }
    close() {
        return this.fileStorage.close();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vc3RhdGUvbm9kZS9zdGF0ZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFL0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUEyQyxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNwRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFLdEQsTUFBTSxDQUFOLElBQWtCLFlBR2pCO0FBSEQsV0FBa0IsWUFBWTtJQUM3Qix5REFBUyxDQUFBO0lBQ1QscURBQU8sQ0FBQTtBQUNSLENBQUMsRUFIaUIsWUFBWSxLQUFaLFlBQVksUUFHN0I7QUFFRCxNQUFNLE9BQU8sV0FBWSxTQUFRLFVBQVU7SUFVMUMsWUFDa0IsV0FBZ0IsRUFDakMsWUFBMEIsRUFDVCxVQUF1QixFQUN2QixXQUF5QjtRQUUxQyxLQUFLLEVBQUUsQ0FBQztRQUxTLGdCQUFXLEdBQVgsV0FBVyxDQUFLO1FBRWhCLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDdkIsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFabkMsWUFBTyxHQUFvQixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9DLDZCQUF3QixHQUFHLEVBQUUsQ0FBQztRQUk5QixpQkFBWSxH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