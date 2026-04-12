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
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { BrowserDialogHandler } from '../../../browser/parts/dialogs/dialogHandler.js';
import { NativeDialogHandler } from './dialogHandler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { createNativeAboutDialogDetails } from '../../../../platform/dialogs/electron-browser/dialog.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
let DialogHandlerContribution = class DialogHandlerContribution extends Disposable {
    static { this.ID = 'workbench.contrib.dialogHandler'; }
    constructor(configurationService, dialogService, logService, instantiationService, productService, clipboardService, nativeHostService, environmentService) {
        super();
        this.configurationService = configurationService;
        this.dialogService = dialogService;
        this.productService = productService;
        this.nativeHostService = nativeHostService;
        this.environmentService = environmentService;
        this.browserImpl = new Lazy(() => instantiationService.createInstance(BrowserDialogHandler));
        this.nativeImpl = new Lazy(() => new NativeDialogHandler(logService, nativeHostService, clipboardService));
        this.model = this.dialogService.model;
        this._register(this.model.onWillShowDialog(() => {
            if (!this.currentDialog) {
                this.processDialogs();
            }
        }));
        this.processDialogs();
    }
    async processDialogs() {
        while (this.model.dialogs.length) {
            this.currentDialog = this.model.dialogs[0];
            let result = undefined;
            try {
                // Confirm
                if (this.currentDialog.args.confirmArgs) {
                    const args = this.currentDialog.args.confirmArgs;
                    result = (this.useCustomDialog || args?.confirmation.custom) ?
                        await this.browserImpl.value.confirm(args.confirmation) :
                        await this.nativeImpl.value.confirm(args.confirmation);
                }
                // Input (custom only)
                else if (this.currentDialog.args.inputArgs) {
                    const args = this.currentDialog.args.inputArgs;
                    result = await this.browserImpl.value.input(args.input);
                }
                // Prompt
                else if (this.currentDialog.args.promptArgs) {
                    const args = this.currentDialog.args.promptArgs;
                    result = (this.useCustomDialog || args?.prompt.custom) ?
                        await this.browserImpl.value.prompt(args.prompt) :
                        await this.nativeImpl.value.prompt(args.prompt);
                }
                // About
                else {
                    const aboutDialogDetails = createNativeAboutDialogDetails(this.productService, await this.nativeHostService.getOSProperties());
                    if (this.useCustomDialog) {
                        await this.browserImpl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
                    }
                    else {
                        await this.nativeImpl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
                    }
                }
            }
            catch (error) {
                result = error;
            }
            this.currentDialog.close(result);
            this.currentDialog = undefined;
        }
    }
    get useCustomDialog() {
        return this.configurationService.getValue('window.dialogStyle') === 'custom' ||
            // Use the custom dialog while driven so that the driver can interact with it
            !!this.environmentService.enableSmokeTestDriver;
    }
};
DialogHandlerContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IDialogService),
    __param(2, ILogService),
    __param(3, IInstantiationService),
    __param(4, IProductService),
    __param(5, IClipboardService),
    __param(6, INativeHostService),
    __param(7, IWorkbenchEnvironmentService)
], DialogHandlerContribution);
export { DialogHandlerContribution };
registerWorkbenchContribution2(DialogHandlerContribution.ID, DialogHandlerContribution, 1 /* WorkbenchPhase.BlockStartup */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWlDLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTFILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXpELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO2FBRXhDLE9BQUUsR0FBRyxpQ0FBaUMsQUFBcEMsQ0FBcUM7SUFRdkQsWUFDZ0Msb0JBQTJDLEVBQ2xELGFBQTZCLEVBQ3hDLFVBQXVCLEVBQ2Isb0JBQTJDLEVBQ3pDLGNBQStCLEVBQ3JDLGdCQUFtQyxFQUMxQixpQkFBcUMsRUFDM0Isa0JBQWdEO1FBRXRGLEtBQUssRUFBRSxDQUFDO1FBVHVCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDbEQsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBRzVCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUU1QixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQzNCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBOEI7UUFJdEYsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzdGLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBRTNHLElBQUksQ0FBQyxLQUFLLEdBQUksSUFBSSxDQUFDLGFBQStCLENBQUMsS0FBSyxDQUFDO1FBRXpELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUU7WUFDL0MsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDekIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYztRQUMzQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFM0MsSUFBSSxNQUFNLEdBQXNDLFNBQVMsQ0FBQztZQUMxRCxJQUFJLENBQUM7Z0JBRUosVUFBVTtnQkFDVixJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7b0JBQ2pELE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksSUFBSSxFQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUM3RCxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQzt3QkFDekQsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO2dCQUVELHNCQUFzQjtxQkFDakIsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDNUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUMvQyxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO2dCQUVELFNBQVM7cUJBQ0osSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDN0MsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO29CQUNoRCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxJQUFJLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDdkQsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ2xELE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztnQkFFRCxRQUFRO3FCQUNILENBQUM7b0JBQ0wsTUFBTSxrQkFBa0IsR0FBRyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7b0JBRS9ILElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO3dCQUMxQixNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO29CQUM1SCxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDM0gsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDaEIsQ0FBQztZQUVELElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBWSxlQUFlO1FBQzFCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLFFBQVE7WUFDM0UsNkVBQTZFO1lBQzdFLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMscUJBQXFCLENBQUM7SUFDbEQsQ0FBQzs7QUF4RlcseUJBQXlCO0lBV25DLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSw0QkFBNEIsQ0FBQTtHQWxCbEIseUJBQXlCLENBeUZyQzs7QUFFRCw4QkFBOEIsQ0FDN0IseUJBQXlCLENBQUMsRUFBRSxFQUM1Qix5QkFBeUIsc0NBRXpCLENBQUMifQ==