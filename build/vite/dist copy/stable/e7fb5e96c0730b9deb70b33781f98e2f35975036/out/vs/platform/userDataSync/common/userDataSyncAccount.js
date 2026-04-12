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
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUserDataSyncLogService, IUserDataSyncStoreService } from './userDataSync.js';
export const IUserDataSyncAccountService = createDecorator('IUserDataSyncAccountService');
let UserDataSyncAccountService = class UserDataSyncAccountService extends Disposable {
    get account() { return this._account; }
    constructor(userDataSyncStoreService, logService) {
        super();
        this.userDataSyncStoreService = userDataSyncStoreService;
        this.logService = logService;
        this._onDidChangeAccount = this._register(new Emitter());
        this.onDidChangeAccount = this._onDidChangeAccount.event;
        this._onTokenFailed = this._register(new Emitter());
        this.onTokenFailed = this._onTokenFailed.event;
        this.wasTokenFailed = false;
        this._register(userDataSyncStoreService.onTokenFailed(code => {
            this.logService.info('Settings Sync auth token failed', this.account?.authenticationProviderId, this.wasTokenFailed, code);
            this.updateAccount(undefined);
            if (code === "Forbidden" /* UserDataSyncErrorCode.Forbidden */) {
                this._onTokenFailed.fire(true /*bail out immediately*/);
            }
            else {
                this._onTokenFailed.fire(this.wasTokenFailed /* bail out if token failed before */);
            }
            this.wasTokenFailed = true;
        }));
        this._register(userDataSyncStoreService.onTokenSucceed(() => this.wasTokenFailed = false));
    }
    async updateAccount(account) {
        if (account && this._account ? account.token !== this._account.token || account.authenticationProviderId !== this._account.authenticationProviderId : account !== this._account) {
            this._account = account;
            if (this._account) {
                this.userDataSyncStoreService.setAuthToken(this._account.token, this._account.authenticationProviderId);
            }
            this._onDidChangeAccount.fire(account);
        }
    }
};
UserDataSyncAccountService = __decorate([
    __param(0, IUserDataSyncStoreService),
    __param(1, IUserDataSyncLogService)
], UserDataSyncAccountService);
export { UserDataSyncAccountService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jQWNjb3VudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jQWNjb3VudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQXlCLE1BQU0sbUJBQW1CLENBQUM7QUFPOUcsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw2QkFBNkIsQ0FBQyxDQUFDO0FBV2hILElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTtJQUt6RCxJQUFJLE9BQU8sS0FBdUMsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQVN6RSxZQUM0Qix3QkFBb0UsRUFDdEUsVUFBb0Q7UUFFN0UsS0FBSyxFQUFFLENBQUM7UUFIb0MsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQUNyRCxlQUFVLEdBQVYsVUFBVSxDQUF5QjtRQVZ0RSx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvQyxDQUFDLENBQUM7UUFDckYsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQUVyRCxtQkFBYyxHQUFxQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFXLENBQUMsQ0FBQztRQUN6RSxrQkFBYSxHQUFtQixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztRQUUzRCxtQkFBYyxHQUFZLEtBQUssQ0FBQztRQU92QyxJQUFJLENBQUMsU0FBUyxDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM1RCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLHdCQUF3QixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDM0gsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM5QixJQUFJLElBQUksc0RBQW9DLEVBQUUsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDekQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMscUNBQXFDLENBQUMsQ0FBQztZQUNyRixDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM1RixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUF5QztRQUM1RCxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLE9BQU8sQ0FBQyx3QkFBd0IsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pMLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1lBQ3hCLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNuQixJQUFJLENBQUMsd0JBQXdCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUN6RyxDQUFDO1lBQ0QsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4QyxDQUFDO0lBQ0YsQ0FBQztDQUVELENBQUE7QUExQ1ksMEJBQTBCO0lBZXBDLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSx1QkFBdUIsQ0FBQTtHQWhCYiwwQkFBMEIsQ0EwQ3RDIn0=