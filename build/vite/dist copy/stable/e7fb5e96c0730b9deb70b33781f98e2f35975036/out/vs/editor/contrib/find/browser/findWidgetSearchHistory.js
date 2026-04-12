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
var FindWidgetSearchHistory_1;
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
let FindWidgetSearchHistory = class FindWidgetSearchHistory {
    static { FindWidgetSearchHistory_1 = this; }
    static { this.FIND_HISTORY_KEY = 'workbench.find.history'; }
    static { this._instance = null; }
    static getOrCreate(storageService) {
        if (!FindWidgetSearchHistory_1._instance) {
            FindWidgetSearchHistory_1._instance = new FindWidgetSearchHistory_1(storageService);
        }
        return FindWidgetSearchHistory_1._instance;
    }
    constructor(storageService) {
        this.storageService = storageService;
        this.inMemoryValues = new Set();
        this._onDidChangeEmitter = new Emitter();
        this.onDidChange = this._onDidChangeEmitter.event;
        this.load();
    }
    delete(t) {
        const result = this.inMemoryValues.delete(t);
        this.save();
        return result;
    }
    add(t) {
        this.inMemoryValues.add(t);
        this.save();
        return this;
    }
    has(t) {
        return this.inMemoryValues.has(t);
    }
    clear() {
        this.inMemoryValues.clear();
        this.save();
    }
    forEach(callbackfn, thisArg) {
        // fetch latest from storage
        this.load();
        return this.inMemoryValues.forEach(callbackfn);
    }
    replace(t) {
        this.inMemoryValues = new Set(t);
        this.save();
    }
    load() {
        let result;
        const raw = this.storageService.get(FindWidgetSearchHistory_1.FIND_HISTORY_KEY, 1 /* StorageScope.WORKSPACE */);
        if (raw) {
            try {
                result = JSON.parse(raw);
            }
            catch (e) {
                // Invalid data
            }
        }
        this.inMemoryValues = new Set(result || []);
    }
    // Run saves async
    save() {
        const elements = [];
        this.inMemoryValues.forEach(e => elements.push(e));
        return new Promise(resolve => {
            this.storageService.store(FindWidgetSearchHistory_1.FIND_HISTORY_KEY, JSON.stringify(elements), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
            this._onDidChangeEmitter.fire(elements);
            resolve();
        });
    }
};
FindWidgetSearchHistory = FindWidgetSearchHistory_1 = __decorate([
    __param(0, IStorageService)
], FindWidgetSearchHistory);
export { FindWidgetSearchHistory };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZFdpZGdldFNlYXJjaEhpc3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFdpZGdldFNlYXJjaEhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBRXZHLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCOzthQUNaLHFCQUFnQixHQUFHLHdCQUF3QixBQUEzQixDQUE0QjthQUtwRCxjQUFTLEdBQW1DLElBQUksQUFBdkMsQ0FBd0M7SUFFaEUsTUFBTSxDQUFDLFdBQVcsQ0FDakIsY0FBK0I7UUFFL0IsSUFBSSxDQUFDLHlCQUF1QixDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hDLHlCQUF1QixDQUFDLFNBQVMsR0FBRyxJQUFJLHlCQUF1QixDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFDRCxPQUFPLHlCQUF1QixDQUFDLFNBQVMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsWUFDa0IsY0FBZ0Q7UUFBL0IsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBaEIxRCxtQkFBYyxHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBa0IvQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxPQUFPLEVBQVksQ0FBQztRQUNuRCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFDbEQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sQ0FBQyxDQUFTO1FBQ2YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsR0FBRyxDQUFDLENBQVM7UUFDWixJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxHQUFHLENBQUMsQ0FBUztRQUNaLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNiLENBQUM7SUFFRCxPQUFPLENBQUMsVUFBcUUsRUFBRSxPQUFpQjtRQUMvRiw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBQ0QsT0FBTyxDQUFFLENBQVc7UUFDbkIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDYixDQUFDO0lBRUQsSUFBSTtRQUNILElBQUksTUFBc0IsQ0FBQztRQUMzQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FDbEMseUJBQXVCLENBQUMsZ0JBQWdCLGlDQUV4QyxDQUFDO1FBRUYsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNULElBQUksQ0FBQztnQkFDSixNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxQixDQUFDO1lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDWixlQUFlO1lBQ2hCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELGtCQUFrQjtJQUNsQixJQUFJO1FBQ0gsTUFBTSxRQUFRLEdBQWEsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ELE9BQU8sSUFBSSxPQUFPLENBQU8sT0FBTyxDQUFDLEVBQUU7WUFDbEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQ3hCLHlCQUF1QixDQUFDLGdCQUFnQixFQUN4QyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyw2REFHeEIsQ0FBQztZQUNGLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7O0FBeEZXLHVCQUF1QjtJQWtCakMsV0FBQSxlQUFlLENBQUE7R0FsQkwsdUJBQXVCLENBeUZuQyJ9