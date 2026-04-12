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
var SearchHistoryService_1;
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const ISearchHistoryService = createDecorator('searchHistoryService');
let SearchHistoryService = class SearchHistoryService {
    static { SearchHistoryService_1 = this; }
    static { this.SEARCH_HISTORY_KEY = 'workbench.search.history'; }
    constructor(storageService) {
        this.storageService = storageService;
        this._onDidClearHistory = new Emitter();
        this.onDidClearHistory = this._onDidClearHistory.event;
    }
    clearHistory() {
        this.storageService.remove(SearchHistoryService_1.SEARCH_HISTORY_KEY, 1 /* StorageScope.WORKSPACE */);
        this._onDidClearHistory.fire();
    }
    load() {
        let result;
        const raw = this.storageService.get(SearchHistoryService_1.SEARCH_HISTORY_KEY, 1 /* StorageScope.WORKSPACE */);
        if (raw) {
            try {
                result = JSON.parse(raw);
            }
            catch (e) {
                // Invalid data
            }
        }
        return result || {};
    }
    save(history) {
        if (isEmptyObject(history)) {
            this.storageService.remove(SearchHistoryService_1.SEARCH_HISTORY_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        else {
            this.storageService.store(SearchHistoryService_1.SEARCH_HISTORY_KEY, JSON.stringify(history), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        }
    }
};
SearchHistoryService = SearchHistoryService_1 = __decorate([
    __param(0, IStorageService)
], SearchHistoryService);
export { SearchHistoryService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoSGlzdG9yeVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvY29tbW9uL3NlYXJjaEhpc3RvcnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBVTdGLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FBd0Isc0JBQXNCLENBQUMsQ0FBQztBQVM3RixJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFvQjs7YUFHVCx1QkFBa0IsR0FBRywwQkFBMEIsQUFBN0IsQ0FBOEI7SUFLdkUsWUFDa0IsY0FBZ0Q7UUFBL0IsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBSmpELHVCQUFrQixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDakQsc0JBQWlCLEdBQWdCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUM7SUFJcEUsQ0FBQztJQUVMLFlBQVk7UUFDWCxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxzQkFBb0IsQ0FBQyxrQkFBa0IsaUNBQXlCLENBQUM7UUFDNUYsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxJQUFJO1FBQ0gsSUFBSSxNQUF3QyxDQUFDO1FBQzdDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLHNCQUFvQixDQUFDLGtCQUFrQixpQ0FBeUIsQ0FBQztRQUVyRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ1QsSUFBSSxDQUFDO2dCQUNKLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNaLGVBQWU7WUFDaEIsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLE1BQU0sSUFBSSxFQUFFLENBQUM7SUFDckIsQ0FBQztJQUVELElBQUksQ0FBQyxPQUE2QjtRQUNqQyxJQUFJLGFBQWEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHNCQUFvQixDQUFDLGtCQUFrQixpQ0FBeUIsQ0FBQztRQUM3RixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLHNCQUFvQixDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLDZEQUE2QyxDQUFDO1FBQ3pJLENBQUM7SUFDRixDQUFDOztBQXRDVyxvQkFBb0I7SUFTOUIsV0FBQSxlQUFlLENBQUE7R0FUTCxvQkFBb0IsQ0F1Q2hDIn0=