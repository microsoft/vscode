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
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService } from '../../storage/common/storage.js';
import { AbstractUserDataSyncStoreManagementService } from './userDataSyncStoreService.js';
export class UserDataSyncAccountServiceChannel {
    constructor(service) {
        this.service = service;
    }
    listen(_, event) {
        switch (event) {
            case 'onDidChangeAccount': return this.service.onDidChangeAccount;
            case 'onTokenFailed': return this.service.onTokenFailed;
        }
        throw new Error(`[UserDataSyncAccountServiceChannel] Event not found: ${event}`);
    }
    call(context, command, args) {
        switch (command) {
            case '_getInitialData': return Promise.resolve(this.service.account);
            case 'updateAccount': return this.service.updateAccount(args);
        }
        throw new Error('Invalid call');
    }
}
export class UserDataSyncAccountServiceChannelClient extends Disposable {
    get account() { return this._account; }
    get onTokenFailed() { return this.channel.listen('onTokenFailed'); }
    constructor(channel) {
        super();
        this.channel = channel;
        this._onDidChangeAccount = this._register(new Emitter());
        this.onDidChangeAccount = this._onDidChangeAccount.event;
        this.channel.call('_getInitialData').then(account => {
            this._account = account;
            this._register(this.channel.listen('onDidChangeAccount')(account => {
                this._account = account;
                this._onDidChangeAccount.fire(account);
            }));
        });
    }
    updateAccount(account) {
        return this.channel.call('updateAccount', account);
    }
}
export class UserDataSyncStoreManagementServiceChannel {
    constructor(service) {
        this.service = service;
    }
    listen(_, event) {
        switch (event) {
            case 'onDidChangeUserDataSyncStore': return this.service.onDidChangeUserDataSyncStore;
        }
        throw new Error(`[UserDataSyncStoreManagementServiceChannel] Event not found: ${event}`);
    }
    call(context, command, args) {
        switch (command) {
            case 'switch': return this.service.switch(args[0]);
            case 'getPreviousUserDataSyncStore': return this.service.getPreviousUserDataSyncStore();
        }
        throw new Error('Invalid call');
    }
}
let UserDataSyncStoreManagementServiceChannelClient = class UserDataSyncStoreManagementServiceChannelClient extends AbstractUserDataSyncStoreManagementService {
    constructor(channel, productService, configurationService, storageService) {
        super(productService, configurationService, storageService);
        this.channel = channel;
        this._register(this.channel.listen('onDidChangeUserDataSyncStore')(() => this.updateUserDataSyncStore()));
    }
    async switch(type) {
        return this.channel.call('switch', [type]);
    }
    async getPreviousUserDataSyncStore() {
        const userDataSyncStore = await this.channel.call('getPreviousUserDataSyncStore');
        return this.revive(userDataSyncStore);
    }
    revive(userDataSyncStore) {
        return {
            url: URI.revive(userDataSyncStore.url),
            type: userDataSyncStore.type,
            defaultUrl: URI.revive(userDataSyncStore.defaultUrl),
            insidersUrl: URI.revive(userDataSyncStore.insidersUrl),
            stableUrl: URI.revive(userDataSyncStore.stableUrl),
            canSwitch: userDataSyncStore.canSwitch,
            authenticationProviders: userDataSyncStore.authenticationProviders,
        };
    }
};
UserDataSyncStoreManagementServiceChannelClient = __decorate([
    __param(1, IProductService),
    __param(2, IConfigurationService),
    __param(3, IStorageService)
], UserDataSyncStoreManagementServiceChannelClient);
export { UserDataSyncStoreManagementServiceChannelClient };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUdsRSxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUzRixNQUFNLE9BQU8saUNBQWlDO0lBQzdDLFlBQTZCLE9BQW9DO1FBQXBDLFlBQU8sR0FBUCxPQUFPLENBQTZCO0lBQUksQ0FBQztJQUV0RSxNQUFNLENBQUMsQ0FBVSxFQUFFLEtBQWE7UUFDL0IsUUFBUSxLQUFLLEVBQUUsQ0FBQztZQUNmLEtBQUssb0JBQW9CLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUM7WUFDbEUsS0FBSyxlQUFlLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDO1FBQ3pELENBQUM7UUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxJQUFJLENBQUMsT0FBWSxFQUFFLE9BQWUsRUFBRSxJQUFVO1FBQzdDLFFBQVEsT0FB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