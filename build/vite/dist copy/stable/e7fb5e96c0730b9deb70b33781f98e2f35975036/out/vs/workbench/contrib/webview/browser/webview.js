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
import { equals } from '../../../../base/common/arrays.js';
import { isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
/**
 * Set when the find widget in a webview in a webview is visible.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE = new RawContextKey('webviewFindWidgetVisible', false);
/**
 * Set when the find widget in a webview is focused.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED = new RawContextKey('webviewFindWidgetFocused', false);
/**
 * Set when the find widget in a webview is enabled in a webview
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED = new RawContextKey('webviewFindWidgetEnabled', false);
export const IWebviewService = createDecorator('webviewService');
export var WebviewContentPurpose;
(function (WebviewContentPurpose) {
    WebviewContentPurpose["NotebookRenderer"] = "notebookRenderer";
    WebviewContentPurpose["CustomEditor"] = "customEditor";
    WebviewContentPurpose["WebviewView"] = "webviewView";
    WebviewContentPurpose["ChatOutputItem"] = "chatOutputItem";
})(WebviewContentPurpose || (WebviewContentPurpose = {}));
/**
 * Check if two {@link WebviewContentOptions} are equal.
 */
export function areWebviewContentOptionsEqual(a, b) {
    return (a.allowMultipleAPIAcquire === b.allowMultipleAPIAcquire
        && a.allowScripts === b.allowScripts
        && a.allowForms === b.allowForms
        && equals(a.localResourceRoots, b.localResourceRoots, isEqual)
        && equals(a.portMapping, b.portMapping, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort)
        && areEnableCommandUrisEqual(a, b));
}
function areEnableCommandUrisEqual(a, b) {
    if (a.enableCommandUris === b.enableCommandUris) {
        return true;
    }
    if (Array.isArray(a.enableCommandUris) && Array.isArray(b.enableCommandUris)) {
        return equals(a.enableCommandUris, b.enableCommandUris);
    }
    return false;
}
/**
 * Stores the unique origins for a webview.
 *
 * These are randomly generated
 */
let WebviewOriginStore = class WebviewOriginStore {
    constructor(rootStorageKey, storageService) {
        this._memento = new Memento(rootStorageKey, storageService);
        this._state = this._memento.getMemento(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getOrigin(viewType, additionalKey) {
        const key = this._getKey(viewType, additionalKey);
        const existing = this._state[key];
        if (existing && typeof existing === 'string') {
            return existing;
        }
        const newOrigin = generateUuid();
        this._state[key] = newOrigin;
        this._memento.saveMemento();
        return newOrigin;
    }
    _getKey(viewType, additionalKey) {
        return JSON.stringify({ viewType, key: additionalKey });
    }
};
WebviewOriginStore = __decorate([
    __param(1, IStorageService)
], WebviewOriginStore);
export { WebviewOriginStore };
/**
 * Stores the unique origins for a webview.
 *
 * These are randomly generated, but keyed on extension and webview viewType.
 */
let ExtensionKeyedWebviewOriginStore = class ExtensionKeyedWebviewOriginStore {
    constructor(rootStorageKey, storageService) {
        this._store = new WebviewOriginStore(rootStorageKey, storageService);
    }
    getOrigin(viewType, extId) {
        return this._store.getOrigin(viewType, extId.value);
    }
};
ExtensionKeyedWebviewOriginStore = __decorate([
    __param(1, IStorageService)
], ExtensionKeyedWebviewOriginStore);
export { ExtensionKeyedWebviewOriginStore };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBS2hHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUkzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBc0IsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFFOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXJEOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sOENBQThDLEdBQUcsSUFBSSxhQUFhLENBQVUsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFNUg7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSw4Q0FBOEMsR0FBRyxJQUFJLGFBQWEsQ0FBVSwwQkFBMEIsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUU1SDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDhDQUE4QyxHQUFHLElBQUksYUFBYSxDQUFVLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRTVILE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxlQUFlLENBQWtCLGdCQUFnQixDQUFDLENBQUM7QUE4Q2xGLE1BQU0sQ0FBTixJQUFrQixxQkFLakI7QUFMRCxXQUFrQixxQkFBcUI7SUFDdEMsOERBQXFDLENBQUE7SUFDckMsc0RBQTZCLENBQUE7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