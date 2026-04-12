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
import { SequencerByKey } from '../../../../base/common/async.js';
import { IEncryptionService } from '../../../../platform/encryption/common/encryptionService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService, BaseSecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
let BrowserSecretStorageService = class BrowserSecretStorageService extends BaseSecretStorageService {
    constructor(storageService, encryptionService, environmentService, logService) {
        // We don't have encryption in the browser so instead we use the
        // in-memory base class implementation instead.
        super(true, storageService, encryptionService, logService);
        if (environmentService.options?.secretStorageProvider) {
            this._secretStorageProvider = environmentService.options.secretStorageProvider;
            this._embedderSequencer = new SequencerByKey();
        }
    }
    get(key) {
        if (this._secretStorageProvider) {
            return this._embedderSequencer.queue(key, () => this._secretStorageProvider.get(key));
        }
        return super.get(key);
    }
    set(key, value) {
        if (this._secretStorageProvider) {
            return this._embedderSequencer.queue(key, async () => {
                await this._secretStorageProvider.set(key, value);
                this.onDidChangeSecretEmitter.fire(key);
            });
        }
        return super.set(key, value);
    }
    delete(key) {
        if (this._secretStorageProvider) {
            return this._embedderSequencer.queue(key, async () => {
                await this._secretStorageProvider.delete(key);
                this.onDidChangeSecretEmitter.fire(key);
            });
        }
        return super.delete(key);
    }
    get type() {
        if (this._secretStorageProvider) {
            return this._secretStorageProvider.type;
        }
        return super.type;
    }
    keys() {
        if (this._secretStorageProvider) {
            if (!this._secretStorageProvider.keys) {
                throw new Error('Secret storage provider does not support keys() method');
            }
            return this._secretStorageProvider.keys();
        }
        return super.keys();
    }
};
BrowserSecretStorageService = __decorate([
    __param(0, IStorageService),
    __param(1, IEncryptionService),
    __param(2, IBrowserWorkbenchEnvironmentService),
    __param(3, ILogService)
], BrowserSecretStorageService);
export { BrowserSecretStorageService };
registerSingleton(ISecretStorageService, BrowserSecretStorageService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0U3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VjcmV0cy9icm93c2VyL3NlY3JldFN0b3JhZ2VTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNqRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBMEIscUJBQXFCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6SSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFL0YsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSx3QkFBd0I7SUFLeEUsWUFDa0IsY0FBK0IsRUFDNUIsaUJBQXFDLEVBQ3BCLGtCQUF1RCxFQUMvRSxVQUF1QjtRQUVwQyxnRUFBZ0U7UUFDaEUsK0NBQStDO1FBQy9DLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTNELElBQUksa0JBQWtCLENBQUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLENBQUM7WUFDdkQsSUFBSSxDQUFDLHNCQUFzQixHQUFHLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQztZQUMvRSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxjQUFjLEVBQVUsQ0FBQztR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