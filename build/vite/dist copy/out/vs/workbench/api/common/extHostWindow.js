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
var ExtHostWindow_1;
import { Emitter } from '../../../base/common/event.js';
import { Schemas } from '../../../base/common/network.js';
import { isFalsyOrWhitespace } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { decodeBase64 } from '../../../base/common/buffer.js';
let ExtHostWindow = class ExtHostWindow {
    static { ExtHostWindow_1 = this; }
    static { this.InitialState = {
        focused: true,
        active: true,
    }; }
    getState() {
        // todo@connor4312: this can be changed to just return this._state after proposed api is finalized
        const state = this._state;
        return {
            get focused() {
                return state.focused;
            },
            get active() {
                return state.active;
            },
        };
    }
    constructor(initData, extHostRpc) {
        this._onDidChangeWindowState = new Emitter();
        this.onDidChangeWindowState = this._onDidChangeWindowState.event;
        this._state = ExtHostWindow_1.InitialState;
        if (initData.handle) {
            this._nativeHandle = decodeBase64(initData.handle).buffer;
        }
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadWindow);
        this._proxy.$getInitialState().then(({ isFocused, isActive }) => {
            this.onDidChangeWindowProperty('focused', isFocused);
            this.onDidChangeWindowProperty('active', isActive);
        });
    }
    get nativeHandle() {
        return this._nativeHandle;
    }
    $onDidChangeActiveNativeWindowHandle(handle) {
        this._nativeHandle = handle ? decodeBase64(handle).buffer : undefined;
    }
    $onDidChangeWindowFocus(value) {
        this.onDidChangeWindowProperty('focused', value);
    }
    $onDidChangeWindowActive(value) {
        this.onDidChangeWindowProperty('active', value);
    }
    onDidChangeWindowProperty(property, value) {
        if (value === this._state[property]) {
            return;
        }
        this._state = { ...this._state, [property]: value };
        this._onDidChangeWindowState.fire(this._state);
    }
    openUri(stringOrUri, options) {
        let uriAsString;
        if (typeof stringOrUri === 'string') {
            uriAsString = stringOrUri;
            try {
                stringOrUri = URI.parse(stringOrUri);
            }
            catch (e) {
                return Promise.reject(`Invalid uri - '${stringOrUri}'`);
            }
        }
        if (isFalsyOrWhitespace(stringOrUri.scheme)) {
            return Promise.reject('Invalid scheme - cannot be empty');
        }
        else if (stringOrUri.scheme === Schemas.command) {
            return Promise.reject(`Invalid scheme '${stringOrUri.scheme}'`);
        }
        return this._proxy.$openUri(stringOrUri, uriAsString, options);
    }
    async asExternalUri(uri, options) {
        if (isFalsyOrWhitespace(uri.scheme)) {
            return Promise.reject('Invalid scheme - cannot be empty');
        }
        const result = await this._proxy.$asExternalUri(uri, options);
        return URI.from(result);
    }
};
ExtHostWindow = ExtHostWindow_1 = __decorate([
    __param(0, IExtHostInitDataService),
    __param(1, IExtHostRpcService)
], ExtHostWindow);
export { ExtHostWindow };
export const IExtHostWindow = createDecorator('IExtHostWindow');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFdpbmRvdy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RXaW5kb3cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUU1RCxPQUFPLEVBQXVDLFdBQVcsRUFBeUIsTUFBTSx1QkFBdUIsQ0FBQztBQUNoSCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFdkQsSUFBTSxhQUFhLEdBQW5CLE1BQU0sYUFBYTs7YUFJVixpQkFBWSxHQUFnQjtRQUMxQyxPQUFPLEVBQUUsSUFBSTtRQUNiLE1BQU0sRUFBRSxJQUFJO0tBQ1osQUFIMEIsQ0FHekI7SUFVRixRQUFRO1FBQ1Asa0dBQWtHO1FBQ2xHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFFMUIsT0FBTztZQUNOLElBQUksT0FBTztnQkFDVixPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUM7WUFDdEIsQ0FBQztZQUNELElBQUksTUFBTTtnQkFDVCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDckIsQ0FBQztTQUNELENBQUM7SUFD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