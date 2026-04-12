/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../../workbench/common/views.js';
const COPILOT_CHAT_VIEW_CONTAINER_ID = 'workbench.view.extension.copilot-chat';
const COPILOT_CHAT_VIEW_ID = 'copilot-chat';
const SESSIONS_CHAT_DEBUG_CONTAINER_ID = 'workbench.sessions.panel.chatDebugContainer';
const chatDebugViewIcon = registerIcon('sessions-chat-debug-view-icon', Codicon.debug, localize('sessionsChatDebugViewIcon', 'View icon of the chat debug view in the sessions window.'));
class RegisterChatDebugViewContribution extends Disposable {
    static { this.ID = 'sessions.registerChatDebugView'; }
    constructor() {
        super();
        const viewContainerRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
        const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
        // The copilot-chat view is contributed by the Copilot Chat extension,
        // which may register after this contribution runs. Handle both cases.
        if (!this.tryMoveView(viewContainerRegistry, viewsRegistry)) {
            const listener = viewsRegistry.onViewsRegistered(e => {
                for (const { views } of e) {
                    if (views.some(v => v.id === COPILOT_CHAT_VIEW_ID)) {
                        if (this.tryMoveView(viewContainerRegistry, viewsRegistry)) {
                            listener.dispose();
                        }
                        break;
                    }
                }
            });
            this._register(listener);
        }
    }
    tryMoveView(viewContainerRegistry, viewsRegistry) {
        const viewContainer = viewContainerRegistry.get(COPILOT_CHAT_VIEW_CONTAINER_ID);
        if (!viewContainer) {
            return false;
        }
        const view = viewsRegistry.getView(COPILOT_CHAT_VIEW_ID);
        if (!view) {
            return false;
        }
        // Deregister the view from its original extension container
        viewsRegistry.deregisterViews([view], viewContainer);
        viewContainerRegistry.deregisterViewContainer(viewContainer);
        // Register a new chat debug view container in the Panel for the sessions window
        const chatDebugViewContainer = viewContainerRegistry.registerViewContainer({
            id: SESSIONS_CHAT_DEBUG_CONTAINER_ID,
            title: localize2('chatDebug', "Chat Debug"),
            icon: chatDebugViewIcon,
            order: 3,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_CHAT_DEBUG_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            storageId: SESSIONS_CHAT_DEBUG_CONTAINER_ID,
            hideIfEmpty: true,
            windowVisibility: 2 /* WindowVisibility.Sessions */,
        }, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
        // Re-register the view inside the new sessions container
        const sessionsView = {
            ...view,
            canMoveView: false,
            windowVisibility: 2 /* WindowVisibility.Sessions */,
        };
        viewsRegistry.registerViews([sessionsView], chatDebugViewContainer);
        return true;
    }
}
registerWorkbenchContribution2(RegisterChatDebugViewContribution.ID, RegisterChatDebugViewContribution, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdERlYnVnL2Jyb3dzZXIvY2hhdERlYnVnLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDbkcsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQW1GLFVBQVUsSUFBSSx1QkFBdUIsRUFBb0IsTUFBTSx1Q0FBdUMsQ0FBQztBQUVqTSxNQUFNLDhCQUE4QixHQUFHLHVDQUF1QyxDQUFDO0FBQy9FLE1BQU0sb0JBQW9CLEdBQUcsY0FBYyxDQUFDO0FBQzVDLE1BQU0sZ0NBQWdDLEdBQUcsNkNBQTZDLENBQUM7QUFFdkYsTUFBTSxpQkFBaUIsR0FBRyxZQUFZLENBQUMsK0JBQStCLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUsMERBQTBELENBQUMsQ0FBQyxDQUFDO0FBRTFMLE1BQU0saUNBQWtDLFNBQVEsVUFBVTthQUV6QyxPQUFFLEdBQUcsZ0NBQWdDLENB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