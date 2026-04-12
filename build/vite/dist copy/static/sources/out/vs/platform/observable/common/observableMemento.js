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
import { strictEquals } from '../../../base/common/equals.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { DebugLocation } from '../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { DebugNameData } from '../../../base/common/observableInternal/debugName.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { ObservableValue } from '../../../base/common/observableInternal/observables/observableValue.js';
import { IStorageService } from '../../storage/common/storage.js';
/**
 * Defines an observable memento. Returns a function that can be called with
 * the specific storage scope, target, and service to use in a class.
 *
 * Note that the returned Observable is a disposable, because it interacts
 * with storage service events, and must be tracked appropriately.
 */
export function observableMemento(opts) {
    return (scope, target, storageService) => {
        return new ObservableMemento(opts, scope, target, storageService);
    };
}
/**
 * A value that is stored, and is also observable. Note: T should be readonly.
 */
let ObservableMemento = class ObservableMemento extends ObservableValue {
    constructor(opts, storageScope, storageTarget, storageService) {
        const getStorageValue = () => {
            const fromStorage = storageService.get(opts.key, storageScope);
            if (fromStorage !== undefined) {
                try {
                    return opts.fromStorage(fromStorage);
                }
                catch {
                    return opts.defaultValue;
                }
            }
            return opts.defaultValue;
        };
        const initialValue = getStorageValue();
        super(new DebugNameData(undefined, `storage/${opts.key}`, undefined), initialValue, strictEquals, DebugLocation.ofCaller());
        this.opts = opts;
        this.storageScope = storageScope;
        this.storageTarget = storageTarget;
        this.storageService = storageService;
        this._store = new DisposableStore();
        this._noStorageUpdateNeeded = false;
        const didChange = storageService.onDidChangeValue(storageScope, opts.key, this._store);
        this._store.add(didChange((e) => {
            if (e.external && e.key === opts.key) {
                this._noStorageUpdateNeeded = true;
                try {
                    this.set(getStorageValue(), undefined);
                }
                finally {
                    this._noStorageUpdateNeeded = false;
                }
            }
        }));
    }
    _setValue(newValue) {
        super._setValue(newValue);
        if (this._noStorageUpdateNeeded) {
            return;
        }
        const valueToStore = this.opts.toStorage(this.get());
        this.storageService.store(this.opts.key, valueToStore, this.storageScope, this.storageTarget);
    }
    dispose() {
        this._store.dispose();
    }
};
ObservableMemento = __decorate([
    __param(3, IStorageService)
], ObservableMemento);
export { ObservableMemento };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZU1lbWVudG8uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9vYnNlcnZhYmxlTWVtZW50by50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuRSxpRUFBaUU7QUFDakUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLGlFQUFpRTtBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDekcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxpQ0FBaUMsQ0FBQztBQVMvRjs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsaUJBQWlCLENBQUksSUFBK0I7SUFDbkUsT0FBTyxDQUFDLEtBQW1CLEVBQUUsTUFBcUIsRUFBRSxjQUErQixFQUF3QixFQUFFO1FBQzVHLE9BQU8sSUFBSSxpQkFBaUIsQ0FBSSxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUM7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSSxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFxQixTQUFRLGVBQWtCO0lBSTNELFlBQ2tCLElBQStCLEVBQy9CLFlBQTBCLEVBQzFCLGFBQTRCLEVBQzVCLGNBQWdEO1FBRWpFLE1BQU0sZUFBZSxHQUFHLEdBQU0sRUFBRTtZQUMvQixNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUs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