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
var ChatGettingStartedContribution_1;
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../chat.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
let ChatGettingStartedContribution = class ChatGettingStartedContribution extends Disposable {
    static { ChatGettingStartedContribution_1 = this; }
    static { this.ID = 'workbench.contrib.chatGettingStarted'; }
    static { this.hideWelcomeView = 'workbench.chat.hideWelcomeView'; }
    constructor(productService, extensionService, extensionManagementService, storageService, chatWidgetService, configurationService) {
        super();
        this.productService = productService;
        this.extensionService = extensionService;
        this.extensionManagementService = extensionManagementService;
        this.storageService = storageService;
        this.chatWidgetService = chatWidgetService;
        this.configurationService = configurationService;
        this.recentlyInstalled = false;
        const defaultChatAgent = this.productService.defaultChatAgent;
        const hideWelcomeView = this.storageService.getBoolean(ChatGettingStartedContribution_1.hideWelcomeView, -1 /* StorageScope.APPLICATION */, false);
        if (!defaultChatAgent || hideWelcomeView) {
            return;
        }
        this.registerListeners(defaultChatAgent);
    }
    registerListeners(defaultChatAgent) {
        this._register(this.extensionManagementService.onDidInstallExtensions(async (result) => {
            for (const e of result) {
                if (ExtensionIdentifier.equals(defaultChatAgent.extensionId, e.identifier.id) && e.operation === 2 /* InstallOperation.Install */) {
                    this.recentlyInstalled = true;
                    return;
                }
            }
        }));
        this._register(this.extensionService.onDidChangeExtensionsStatus(async (event) => {
            for (const ext of event) {
                if (ExtensionIdentifier.equals(defaultChatAgent.extensionId, ext.value)) {
                    const extensionStatus = this.extensionService.getExtensionsStatus();
                    if (extensionStatus[ext.value].activationTimes && this.recentlyInstalled) {
                        this.onDidInstallChat();
                        return;
                    }
                }
            }
        }));
    }
    async onDidInstallChat() {
        // Don't reveal if user prefers the agent sessions welcome page
        const startupEditor = this.configurationService.getValue('workbench.startupEditor');
        if (startupEditor !== 'agentSessionsWelcomePage') {
            // Open Chat view
            this.chatWidgetService.revealWidget();
        }
        // Only do this once
        this.storageService.store(ChatGettingStartedContribution_1.hideWelcomeView, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        this.recentlyInstalled = false;
    }
};
ChatGettingStartedContribution = ChatGettingStartedContribution_1 = __decorate([
    __param(0, IProductService),
    __param(1, IExtensionService),
    __param(2, IExtensionManagementService),
    __param(3, IStorageService),
    __param(4, IChatWidgetService),
    __param(5, IConfigurationService)
], ChatGettingStartedContribution);
export { ChatGettingStartedContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEdldHRpbmdTdGFydGVkLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEdldHRpbmdTdGFydGVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSwyQkFBMkIsRUFBb0IsTUFBTSwyRUFBMkUsQ0FBQztBQUMxSSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBRWpILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNoRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUUvRixJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7O2FBQzdDLE9BQUUsR0FBRyxzQ0FBc0MsQUFBekMsQ0FBMEM7YUFHcEMsb0JBQWUsR0FBRyxnQ0FBZ0MsQUFBbkMsQ0FBb0M7SUFFM0UsWUFDa0IsY0FBZ0QsRUFDOUMsZ0JBQW9ELEVBQzFDLDBCQUF3RSxFQUNwRixjQUFnRCxFQUM3QyxpQkFBc0QsRUFDbkQsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBUDBCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUM3QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ3pCLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBNkI7UUFDbkUsbUJB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