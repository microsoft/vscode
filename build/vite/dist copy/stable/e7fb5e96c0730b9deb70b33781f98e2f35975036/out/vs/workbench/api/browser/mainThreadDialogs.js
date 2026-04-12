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
var MainThreadDialogs_1;
import { URI } from '../../../base/common/uri.js';
import { MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
let MainThreadDialogs = MainThreadDialogs_1 = class MainThreadDialogs {
    constructor(context, _fileDialogService) {
        this._fileDialogService = _fileDialogService;
        //
    }
    dispose() {
        //
    }
    async $showOpenDialog(options) {
        const convertedOptions = MainThreadDialogs_1._convertOpenOptions(options);
        if (!convertedOptions.defaultUri) {
            convertedOptions.defaultUri = await this._fileDialogService.defaultFilePath();
        }
        return Promise.resolve(this._fileDialogService.showOpenDialog(convertedOptions));
    }
    async $showSaveDialog(options) {
        const convertedOptions = MainThreadDialogs_1._convertSaveOptions(options);
        if (!convertedOptions.defaultUri) {
            convertedOptions.defaultUri = await this._fileDialogService.defaultFilePath();
        }
        return Promise.resolve(this._fileDialogService.showSaveDialog(convertedOptions));
    }
    static _convertOpenOptions(options) {
        const result = {
            openLabel: options?.openLabel || undefined,
            canSelectFiles: options?.canSelectFiles || (!options?.canSelectFiles && !options?.canSelectFolders),
            canSelectFolders: options?.canSelectFolders,
            canSelectMany: options?.canSelectMany,
            defaultUri: options?.defaultUri ? URI.revive(options.defaultUri) : undefined,
            title: options?.title || undefined,
            availableFileSystems: []
        };
        if (options?.filters) {
            result.filters = [];
            for (const [key, value] of Object.entries(options.filters)) {
                result.filters.push({ name: key, extensions: value });
            }
        }
        return result;
    }
    static _convertSaveOptions(options) {
        const result = {
            defaultUri: options?.defaultUri ? URI.revive(options.defaultUri) : undefined,
            saveLabel: options?.saveLabel || undefined,
            title: options?.title || undefined
        };
        if (options?.filters) {
            result.filters = [];
            for (const [key, value] of Object.entries(options.filters)) {
                result.filters.push({ name: key, extensions: value });
            }
        }
        return result;
    }
};
MainThreadDialogs = MainThreadDialogs_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadDialogs),
    __param(1, IFileDialogService)
], MainThreadDialogs);
export { MainThreadDialogs };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERpYWxvZ3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZERpYWxvZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQTJCLFdBQVcsRUFBNEQsTUFBTSwrQkFBK0IsQ0FBQztBQUMvSSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLGtCQUFrQixFQUEwQyxNQUFNLDZDQUE2QyxDQUFDO0FBR2xILElBQU0saUJBQWlCLHlCQUF2QixNQUFNLGlCQUFpQjtJQUU3QixZQUNDLE9BQXdCLEVBQ2Esa0JBQXNDO1FBQXRDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFFM0UsRUFBRTtJQUNILENBQUM7SUFFRCxPQUFPO1FBQ04sRUFBRTtJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQXFDO1FBQzFELE1BQU0sZ0JBQWdCLEdBQUcsbUJBQWlCLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xDLGdCQUFnQixDQUFDLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMvRSxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQXFDO1FBQzFELE1BQU0sZ0JBQWdCLEdBQUcs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