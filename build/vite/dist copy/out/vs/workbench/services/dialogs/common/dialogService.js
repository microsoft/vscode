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
import Severity from '../../../../base/common/severity.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { DialogsModel } from '../../../common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
let DialogService = class DialogService extends Disposable {
    constructor(environmentService, logService) {
        super();
        this.environmentService = environmentService;
        this.logService = logService;
        this.model = this._register(new DialogsModel());
        this.onWillShowDialog = this.model.onWillShowDialog;
        this.onDidShowDialog = this.model.onDidShowDialog;
    }
    skipDialogs() {
        if (this.environmentService.enableSmokeTestDriver) {
            this.logService.warn('DialogService: Dialog requested during smoke test.');
        }
        // integration tests
        return this.environmentService.isExtensionDevelopment && !!this.environmentService.extensionTestsLocationURI;
    }
    async confirm(confirmation) {
        if (this.skipDialogs()) {
            this.logService.trace('DialogService: refused to show confirmation dialog in tests.');
            return { confirmed: true };
        }
        const handle = this.model.show({ confirmArgs: { confirmation } });
        return await handle.result;
    }
    async prompt(prompt) {
        if (this.skipDialogs()) {
            throw new Error(`DialogService: refused to show dialog in tests. Contents: ${prompt.message}`);
        }
        const handle = this.model.show({ promptArgs: { prompt } });
        const dialogResult = await handle.result;
        return {
            result: await dialogResult.result,
            checkboxChecked: dialogResult.checkboxChecked
        };
    }
    async input(input) {
        if (this.skipDialogs()) {
            throw new Error('DialogService: refused to show input dialog in tests.');
        }
        const handle = this.model.show({ inputArgs: { input } });
        return await handle.result;
    }
    async info(message, detail) {
        await this.prompt({ type: Severity.Info, message, detail });
    }
    async warn(message, detail) {
        await this.prompt({ type: Severity.Warning, message, detail });
    }
    async error(message, detail) {
        await this.prompt({ type: Severity.Error, message, detail });
    }
    async about() {
        if (this.skipDialogs()) {
            throw new Error('DialogService: refused to show about dialog in tests.');
        }
        const handle = this.model.show({});
        await handle.result;
    }
};
DialogService = __decorate([
    __param(0, IWorkbenchEnvironmentService),
    __param(1, ILogService)
], DialogService);
export { DialogService };
registerSingleton(IDialogService, DialogService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kaWFsb2dzL2NvbW1vbi9kaWFsb2dTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQXdGLGNBQWMsRUFBNEgsTUFBTSxnREFBZ0QsQ0FBQztBQUNoUyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU5RCxJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFjLFNBQVEsVUFBVTtJQVU1QyxZQUMrQixrQkFBaUUsRUFDbEYsVUFBd0M7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFIdUMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE4QjtRQUNqRSxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBUjdDLFVBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksWUFBWSxFQUFFLENBQUMsQ0FBQztRQUUzQyxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDO1FBRS9DLG9CQUFlLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUM7SUFPdEQsQ0FBQztJQUVPLFdBQVc7UUFDbEIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNuRCxJQUFJLENB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