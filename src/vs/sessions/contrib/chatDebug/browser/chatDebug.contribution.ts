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
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';

const COPILOT_CHAT_VIEW_CONTAINER_ID = 'workbench.view.extension.copilot-chat';
const COPILOT_CHAT_VIEW_ID = 'copilot-chat';
const SESSIONS_CHAT_DEBUG_CONTAINER_ID = 'workbench.sessions.panel.chatDebugContainer';

const chatDebugViewIcon = registerIcon('sessions-chat-debug-view-icon', Codicon.debug, localize('sessionsChatDebugViewIcon', 'View icon of the chat debug view in the sessions window.'));

class RegisterChatDebugViewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.registerChatDebugView';

	constructor() {
		super();

		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

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

	private tryMoveView(viewContainerRegistry: IViewContainersRegistry, viewsRegistry: IViewsRegistry): boolean {
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
			windowEnablement: WindowEnablement.Sessions,
		}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

		// Re-register the view inside the new sessions container
		const sessionsView: IViewDescriptor = {
			...view,
			canMoveView: false,
			windowEnablement: WindowEnablement.Sessions,
		};
		viewsRegistry.registerViews([sessionsView], chatDebugViewContainer);

		return true;
	}
}

registerWorkbenchContribution2(RegisterChatDebugViewContribution.ID, RegisterChatDebugViewContribution, WorkbenchPhase.BlockRestore);
