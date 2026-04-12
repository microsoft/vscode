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
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { basenameOrAuthority, dirname, hasTrailingPathSeparator } from '../../../base/common/resources.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../base/common/uri.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { FileKind } from '../../../platform/files/common/files.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadQuickOpen = class MainThreadQuickOpen {
    constructor(extHostContext, quickInputService, labelService, customEditorLabelService, modelService, languageService) {
        this.labelService = labelService;
        this.customEditorLabelService = customEditorLabelService;
        this.modelService = modelService;
        this.languageService = languageService;
        this._items = {};
        // ---- QuickInput
        this.sessions = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
        this._quickInputService = quickInputService;
    }
    dispose() {
        for (const [_id, session] of this.sessions) {
            session.store.dispose();
        }
    }
    $show(instance, options, token) {
        const contents = new Promise((resolve, reject) => {
            this._items[instance] = { resolve, reject };
        });
        options = {
            ...options,
            onDidFocus: el => {
                if (el) {
                    this._proxy.$onItemSelected(el.handle);
                }
            }
        };
        if (options.canPickMany) {
            return this._quickInputService.pick(contents, options, token).then(items => {
                if (items) {
                    return items.map(item => item.handle);
                }
                return undefined;
            });
        }
        else {
            return this._quickInputService.pick(contents, options, token).then(item => {
                if (item) {
                    return item.handle;
                }
                return undefined;
            });
        }
    }
    $setItems(instance, items) {
        if (this._items[instance]) {
            items.forEach(item => this.expandItemProps(item));
            this._items[instance].resolve(items);
            delete this._items[instance];
        }
        return Promise.resolve();
    }
    $setError(instance, error) {
        if (this._items[instance]) {
            this._items[instance].reject(error);
            delete this._items[instance];
        }
        return Promise.resolve();
    }
    // ---- input
    $input(options, validateInput, token) {
        const inputOptions = Object.create(null);
        if (options) {
            inputOptions.title = options.title;
            inputOptions.password = options.password;
            inputOptions.placeHolder = options.placeHolder;
            inputOptions.valueSelection = options.valueSelection;
            inputOptions.prompt = options.prompt;
            inputOptions.value = options.value;
            inputOptions.ignoreFocusLost = options.ignoreFocusOut;
        }
        if (validateInput) {
            inputOptions.validateInput = (value) => {
                return this._proxy.$validateInput(value);
            };
        }
        return this._quickInputService.input(inputOptions, token);
    }
    $createOrUpdate(params) {
        const sessionId = params.id;
        let session = this.sessions.get(sessionId);
        if (!session) {
            const store = new DisposableStore();
            const input = params.type === 'quickPick' ? this._quickInputService.createQuickPick() : this._quickInputService.createInputBox();
            store.add(input);
            store.add(input.onDidAccept(() => {
                this._proxy.$onDidAccept(sessionId);
            }));
            store.add(input.onDidTriggerButton(button => {
                this._proxy.$onDidTriggerButton(sessionId, button.handle, button.toggle?.checked);
            }));
            store.add(input.onDidChangeValue(value => {
                this._proxy.$onDidChangeValue(sessionId, value);
            }));
            store.add(input.onDidHide(() => {
                this._proxy.$onDidHide(sessionId);
            }));
            if (params.type === 'quickPick') {
                // Add extra events specific for quick pick
                const quickPick = input;
                store.add(quickPick.onDidChangeActive(items => {
                    this._proxy.$onDidChangeActive(sessionId, items.map(item => item.handle));
                }));
                store.add(quickPick.onDidChangeSelection(items => {
                    this._proxy.$onDidChangeSelection(sessionId, items.map(item => item.handle));
                }));
                store.add(quickPick.onDidTriggerItemButton((e) => {
                    const transferButton = e.button;
                    this._proxy.$onDidTriggerItemButton(sessionId, e.item.handle, transferButton.handle, transferButton.toggle?.checked);
                }));
            }
            session = {
                input,
                handlesToItems: new Map(),
                store
            };
            this.sessions.set(sessionId, session);
        }
        const { input, handlesToItems } = session;
        const quickPick = input;
        for (const param in params) {
            switch (param) {
                case 'id':
                case 'type':
                    continue;
                case 'visible':
                    if (params.visible) {
                        input.show();
                    }
                    else {
                        input.hide();
                    }
                    break;
                case 'items': {
                    handlesToItems.clear();
                    params.items?.forEach((item) => {
                        this.expandItemProps(item);
                        if (item.type !== 'separator') {
                            item.buttons?.forEach(button => this.expandIconPath(button));
                            handlesToItems.set(item.handle, item);
                        }
                    });
                    quickPick.items = params.items;
                    break;
                }
                case 'activeItems':
                    quickPick.activeItems = params.activeItems
                        ?.map((handle) => handlesToItems.get(handle))
                        .filter(Boolean);
                    break;
                case 'selectedItems':
                    quickPick.selectedItems = params.selectedItems
                        ?.map((handle) => handlesToItems.get(handle))
                        .filter(Boolean);
                    break;
                case 'buttons': {
                    const buttons = [];
                    for (const button of params.buttons) {
                        if (button.handle === -1) {
                            buttons.push(this._quickInputService.backButton);
                        }
                        else {
                            this.expandIconPath(button);
                            buttons.push(button);
                        }
                    }
                    input.buttons = buttons;
                    break;
                }
                default:
                    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                    input[param] = params[param];
                    break;
            }
        }
        return Promise.resolve(undefined);
    }
    $dispose(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.store.dispose();
            this.sessions.delete(sessionId);
        }
        return Promise.resolve(undefined);
    }
    /**
    * Derives icon, label and description for Quick Pick items that represent a resource URI.
    */
    expandItemProps(item) {
        if (item.type === 'separator') {
            return;
        }
        if (!item.resourceUri) {
            this.expandIconPath(item);
            return;
        }
        // Derive missing label and description from resourceUri.
        const resourceUri = URI.from(item.resourceUri);
        item.label ??= this.customEditorLabelService.getName(resourceUri) || '';
        if (item.label) {
            item.description ??= this.labelService.getUriLabel(resourceUri, { relative: true });
        }
        else {
            item.label = basenameOrAuthority(resourceUri);
            item.description ??= this.labelService.getUriLabel(dirname(resourceUri), { relative: true });
        }
        // Derive icon props from resourceUri if icon is set to ThemeIcon.File or ThemeIcon.Folder.
        const icon = item.iconPathDto;
        if (ThemeIcon.isThemeIcon(icon) && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon))) {
            const fileKind = ThemeIcon.isFolder(icon) || hasTrailingPathSeparator(resourceUri) ? FileKind.FOLDER : FileKind.FILE;
            const iconClasses = new Lazy(() => getIconClasses(this.modelService, this.languageService, resourceUri, fileKind));
            Object.defineProperty(item, 'iconClasses', { get: () => iconClasses.value });
        }
        else {
            this.expandIconPath(item);
        }
    }
    /**
    * Converts IconPath DTO into iconPath/iconClass properties.
    */
    expandIconPath(target) {
        const icon = target.iconPathDto;
        if (!icon) {
            return;
        }
        else if (ThemeIcon.isThemeIcon(icon)) {
            // TODO: Since IQuickPickItem and IQuickInputButton do not support ThemeIcon directly, the color ID is lost here.
            // We should consider changing changing iconPath/iconClass to IconPath in both interfaces.
            // Request for color support: https://github.com/microsoft/vscode/issues/185356..
            target.iconClass = ThemeIcon.asClassName(icon);
        }
        else if (isUriComponents(icon)) {
            const uri = URI.from(icon);
            target.iconPath = { dark: uri, light: uri };
        }
        else {
            const { dark, light } = icon;
            target.iconPath = { dark: URI.from(dark), light: URI.from(light) };
        }
    }
};
MainThreadQuickOpen = __decorate([
    extHostNamedCustomer(MainContext.MainThreadQuickOpen),
    __param(1, IQuickInputService),
    __param(2, ILabelService),
    __param(3, ICustomEditorLabelService),
    __param(4, IModelService),
    __param(5, ILanguageService)
], MainThreadQuickOpen);
export { MainThreadQuickOpen };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFF1aWNrT3Blbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkUXVpY2tPcGVuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEVBQTRDLGtCQUFrQixFQUE4QixNQUFNLG1EQUFtRCxDQUFDO0FBQzdKLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsY0FBYyxFQUEyQyxXQUFXLEVBQW1JLE1BQU0sK0JBQStCLENBQUM7QUFTL08sSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFB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