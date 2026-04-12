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
import { Disposable } from '../../../base/common/lifecycle.js';
import { MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IDownloadService } from '../../../platform/download/common/download.js';
import { URI } from '../../../base/common/uri.js';
let MainThreadDownloadService = class MainThreadDownloadService extends Disposable {
    constructor(extHostContext, downloadService) {
        super();
        this.downloadService = downloadService;
    }
    $download(uri, to) {
        return this.downloadService.download(URI.revive(uri), URI.revive(to), 'mainThreadDownloadService.download');
    }
};
MainThreadDownloadService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadDownloadService),
    __param(1, IDownloadService)
], MainThreadDownloadService);
export { MainThreadDownloadService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERvd25sb2FkU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFrQyxNQUFNLCtCQUErQixDQUFDO0FBQzVGLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRixPQUFPLEVBQWlCLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRzFELElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsVUFBVTtJQUV4RCxZQUNDLGNBQStCLEVBQ0ksZUFBaUM7UUFFcEUsS0FBSyxFQUFFLENBQUM7UUFGMkIsb0JBQWUsR0FBZixlQUFlLENBQWtCO0lBR3JFLENBQUM7SUFFRCxTQUFTLENBQUMsR0FBa0IsRUFBRSxFQUFpQjtRQUM5QyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO0lBQzdHLENBQUM7Q0FFRCxDQUFBO0FBYlkseUJBQXlCO0lBRHJDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsQ0FBQztJQUt6RCxXQUFBLGdCQUFnQixDQUFBO0dBSk4seUJBQXlCLENBYXJDIn0=