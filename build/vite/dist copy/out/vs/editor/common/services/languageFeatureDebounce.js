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
import { doHash } from '../../../base/common/hash.js';
import { LRUCache } from '../../../base/common/map.js';
import { clamp, MovingAverage, SlidingWindowAverage } from '../../../base/common/numbers.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { matchesScheme } from '../../../base/common/network.js';
export const ILanguageFeatureDebounceService = createDecorator('ILanguageFeatureDebounceService');
var IdentityHash;
(function (IdentityHash) {
    const _hashes = new WeakMap();
    let pool = 0;
    function of(obj) {
        let value = _hashes.get(obj);
        if (value === undefined) {
            value = ++pool;
            _hashes.set(obj, value);
        }
        return value;
    }
    IdentityHash.of = of;
})(IdentityHash || (IdentityHash = {}));
class NullDebounceInformation {
    constructor(_default) {
        this._default = _default;
    }
    get(_model) {
        return this._default;
    }
    update(_model, _value) {
        return this._default;
    }
    default() {
        return this._default;
    }
}
class FeatureDebounceInformation {
    constructor(_logService, _name, _registry, _default, _min, _max) {
        this._logService = _logService;
        this._name = _name;
        this._registry = _registry;
        this._default = _default;
        this._min = _min;
        this._max = _max;
        this._cache = new LRUCache(50, 0.7);
    }
    _key(model) {
        return model.id + this._registry.all(model).reduce((hashVal, obj) => doHash(IdentityHash.of(obj), hashVal), 0);
    }
    get(model) {
        const key = this._key(model);
        const avg = this._cache.get(key);
        return avg
            ? clamp(avg.value, this._min, this._max)
            : this.default();
    }
    update(model, value) {
        const key = this._key(model);
        let avg = this._cache.get(key);
        if (!avg) {
            avg = new SlidingWindowAverage(6);
            this._cache.set(key, avg);
        }
        const newValue = clamp(avg.update(value), this._min, this._max);
        if (!matchesScheme(model.uri, 'output')) {
            this._logService.trace(`[DEBOUNCE: ${this._name}] for ${model.uri.toString()} is ${newValue}ms`);
        }
        return newValue;
    }
    _overall() {
        const result = new MovingAverage();
        for (const [, avg] of this._cache) {
            result.update(avg.value);
        }
        return result.value;
    }
    default() {
        const value = (this._overall() | 0) || this._default;
        return clamp(value, this._min, this._max);
    }
}
let LanguageFeatureDebounceService = class LanguageFeatureDebounceService {
    constructor(_logService, envService) {
        this._logService = _logService;
        this._data = new Map();
        this._isDev = envService.isExtensionDevelopment || !envService.isBuilt;
    }
    for(feature, name, config) {
        const min = config?.min ?? 50;
        const max = config?.max ?? min ** 2;
        const extra = config?.key ?? undefined;
        const key = `${IdentityHash.of(feature)},${min}${extra ? ',' + extra : ''}`;
        let info = this._data.get(key);
        if (!info) {
            if (this._isDev) {
                this._logService.debug(`[DEBOUNCE: ${name}] is disabled in developed mode`);
                info = new NullDebounceInformation(min * 1.5);
            }
            else {
                info = new FeatureDebounceInformation(this._logService, name, feature, (this._overallAverage() | 0) || (min * 1.5), // default is overall default or derived from min-value
                min, max);
            }
            this._data.set(key, info);
        }
        return info;
    }
    _overallAverage() {
        // Average of all language features. Not a great value but an approximation
        const result = new MovingAverage();
        for (const info of this._data.values()) {
            result.update(info.default());
        }
        return result.value;
    }
};
LanguageFeatureDebounceService = __decorate([
    __param(0, ILogService),
    __param(1, IEnvironmentService)
], LanguageFeatureDebounceService);
export { LanguageFeatureDebounceService };
registerSingleton(ILanguageFeatureDebounceService, LanguageFeatureDebounceService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUc3RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHaEUsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsZUFBZSxDQUFrQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBZW5JLElBQVUsWUFBWSxDQVdyQjtBQVhELFdBQVUsWUFBWTtJQUNyQixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBa0IsQ0FBQztJQUM5QyxJQUFJLElBQUksR0FBRyxDQUFDLENBQUM7SUFDYixTQUFnQixFQUFFLENBQUMsR0FBVztRQUM3QixJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdCLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLEtBQUssR0FBRyxFQUFFLElB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