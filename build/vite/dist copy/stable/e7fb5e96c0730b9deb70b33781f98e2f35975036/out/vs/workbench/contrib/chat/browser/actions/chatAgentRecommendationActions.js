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
import { Codicon } from '../../../../../base/common/codicons.js';
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatService } from '../../common/chatService/chatService.js';
const INSTALL_CONTEXT_PREFIX = 'chat.installRecommendationAvailable';
let ChatAgentRecommendation = class ChatAgentRecommendation extends Disposable {
    static { this.ID = 'workbench.contrib.chatAgentRecommendation'; }
    constructor(productService, extensionGalleryService, extensionManagementService, contextKeyService) {
        super();
        this.productService = productService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionManagementService = extensionManagementService;
        this.contextKeyService = contextKeyService;
        this.availabilityContextKeys = new Map();
        this.refreshRequestId = 0;
        const recommendations = this.productService.chatSessionRecommendations;
        if (!recommendations?.length || !this.extensionGalleryService.isEnabled()) {
            return;
        }
        for (const recommendation of recommendations) {
            this.registerRecommendation(recommendation);
        }
        const refresh = () => this.refreshInstallAvailability();
        this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions(refresh));
        this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension(refresh));
        this._register(this.extensionManagementService.onDidChangeProfile(refresh));
        this.refreshInstallAvailability();
    }
    registerRecommendation(recommendation) {
        const extensionKey = ExtensionIdentifier.toKey(recommendation.extensionId);
        const commandId = `chat.installRecommendation.${extensionKey}.${recommendation.name}`;
        const availabilityContextId = `${INSTALL_CONTEXT_PREFIX}.${extensionKey}`;
        const availabilityContext = new RawContextKey(availabilityContextId, false).bindTo(this.contextKeyService);
        this.availabilityContextKeys.set(extensionKey, availabilityContext);
        const title = localize2('chat.installRecommendation', "New {0}", recommendation.displayName);
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: commandId,
                    title,
                    tooltip: recommendation.description,
                    f1: false,
                    category: CHAT_CATEGORY,
                    icon: Codicon.extensions,
                    menu: [
                        {
                            id: MenuId.ChatNewMenu,
                            group: '4_recommendations',
                            when: ContextKeyExpr.equals(availabilityContextId, true)
                        }
                    ]
                });
            }
            async run(accessor) {
                const commandService = accessor.get(ICommandService);
                const productService = accessor.get(IProductService);
                const chatService = accessor.get(IChatService);
                const installPreReleaseVersion = productService.quality !== 'stable';
                await commandService.executeCommand('workbench.extensions.installExtension', recommendation.extensionId, {
                    installPreReleaseVersion
                });
                await runPostInstallCommand(commandService, chatService, recommendation.postInstallCommand);
            }
        }));
    }
    refreshInstallAvailability() {
        if (!this.availabilityContextKeys.size) {
            return;
        }
        const currentRequest = ++this.refreshRequestId;
        this.extensionManagementService.getInstalled().then(installedExtensions => {
            if (currentRequest !== this.refreshRequestId) {
                return;
            }
            const installed = new Set(installedExtensions.map(ext => ExtensionIdentifier.toKey(ext.identifier.id)));
            for (const [extensionKey, context] of this.availabilityContextKeys) {
                context.set(!installed.has(extensionKey));
            }
        }, () => {
            if (currentRequest !== this.refreshRequestId) {
                return;
            }
            for (const [, context] of this.availabilityContextKeys) {
                context.set(false);
            }
        });
    }
};
ChatAgentRecommendation = __decorate([
    __param(0, IProductService),
    __param(1, IExtensionGalleryService),
    __param(2, IWorkbenchExtensionManagementService),
    __param(3, IContextKeyService)
], ChatAgentRecommendation);
export { ChatAgentRecommendation };
async function runPostInstallCommand(commandService, chatService, commandId) {
    if (!commandId) {
        return;
    }
    await waitForCommandRegistration(commandId);
    await chatService.activateDefaultAgent(ChatAgentLocation.Chat);
    try {
        await commandService.executeCommand(commandId);
    }
    catch {
        // Command failed or was cancelled; ignore.
    }
}
function waitForCommandRegistration(commandId) {
    if (CommandsRegistry.getCommands().has(commandId)) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        const timer = new TimeoutTimer();
        const listener = CommandsRegistry.onDidRegisterCommand((id) => {
            if (id === commandId) {
                listener.dispose();
                timer.dispose();
                resolve();
            }
        });
        timer.cancelAndSet(() => {
            listener.dispose();
            resolve();
        }, 10_000);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFnZW50UmVjb21tZW5kYXRpb25BY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFnZW50UmVjb21tZW5kYXRpb25BY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQ3JILE9BQU8sRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFHM0YsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDOUgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRWpELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5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