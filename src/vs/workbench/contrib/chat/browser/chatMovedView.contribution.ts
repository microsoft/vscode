/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { CONTEXT_CHAT_EXTENSION_INVALID, CONTEXT_CHAT_PANEL_PARTICIPANT_REGISTERED, CONTEXT_CHAT_SHOULD_SHOW_MOVED_VIEW_WELCOME } from '../common/chatContextKeys.js';
import { CHAT_SIDEBAR_OLD_VIEW_PANEL_ID, CHAT_SIDEBAR_PANEL_ID } from './chatViewPane.js';

export class MovedChatViewPane extends ViewPane {
	override shouldShowWelcome(): boolean {
		return true;
	}
}

const hideMovedChatWelcomeViewStorageKey = 'workbench.chat.hideMovedChatWelcomeView';
const dismissAndHideMovedChatWelcomeView = 'workbench.chat.dismissAndHideMovedChatWelcomeView';
const moveChatBackToOldLocation = 'workbench.chat.moveChatBackToOldLocation';

export class MoveChatViewContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatMovedViewWelcomeView';

	private showWelcomeViewCtx: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewsService private readonly viewsService: IViewsService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService,
		@IStorageService private readonly storageService: IStorageService,
	) {

		this.showWelcomeViewCtx = CONTEXT_CHAT_SHOULD_SHOW_MOVED_VIEW_WELCOME.bindTo(contextKeyService);
		this.initialize();
	}

	private async initialize(): Promise<void> {
		await this.hideViewIfCopilotIsNotInstalled();
		this.updateContextKey();
		this.registerCommands();
		this.registerMovedChatWelcomeView();

		// Testing only
		this.clearHiddenViewMark();
	}


	private clearHiddenViewMark(): void {
		this.storageService.remove(hideMovedChatWelcomeViewStorageKey, StorageScope.PROFILE);
		this.updateContextKey();
	}

	private markViewToHide(): void {
		this.storageService.store(hideMovedChatWelcomeViewStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
		this.updateContextKey();
	}

	private async hideViewIfCopilotIsNotInstalled(): Promise<void> {
		if (await this.extensionService.getExtension('github.copilot-chat') === undefined) {
			this.markViewToHide();
		}
	}

	private updateContextKey(): void {
		const hidden = this.storageService.getBoolean(hideMovedChatWelcomeViewStorageKey, StorageScope.PROFILE, false);
		this.showWelcomeViewCtx.set(!hidden);
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand(dismissAndHideMovedChatWelcomeView, () => {
			this.markViewToHide();
		});

		CommandsRegistry.registerCommand(moveChatBackToOldLocation, () => {
			const oldViewContainer = this.viewDescriptorService.getViewContainerById(CHAT_SIDEBAR_OLD_VIEW_PANEL_ID);
			const newViewContainer = this.viewDescriptorService.getViewContainerById(CHAT_SIDEBAR_PANEL_ID);
			if (!oldViewContainer || !newViewContainer) {
				return;
			}

			const oldLocation = this.viewDescriptorService.getViewContainerLocation(oldViewContainer);
			const newLocation = this.viewDescriptorService.getViewContainerLocation(newViewContainer);

			if (oldLocation === newLocation || oldLocation === null || newLocation === null) {
				return;
			}

			const viewContainerIds = this.paneCompositePartService.getPaneCompositeIds(oldLocation);
			const targetIndex = viewContainerIds.indexOf(oldViewContainer.id);

			this.viewDescriptorService.moveViewContainerToLocation(newViewContainer, oldLocation, targetIndex);
			this.viewsService.openViewContainer(newViewContainer.id, true);

			this.markViewToHide();
		});
	}

	private registerMovedChatWelcomeView(): IDisposable {
		// This is a welcome view container intended to show up where the old chat view was positioned to inform
		// the user that we have changed the default location and how they can move it back or use the new location.
		const title = localize2('chat.viewContainer.movedChat.label', "Chat (Old Location)");
		const icon = Codicon.commentDiscussion;
		const viewContainerId = CHAT_SIDEBAR_OLD_VIEW_PANEL_ID;
		const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: viewContainerId,
			title,
			icon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [viewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: viewContainerId,
			hideIfEmpty: true,
			order: 100,
		}, ViewContainerLocation.Sidebar);

		const viewId = 'workbench.chat.movedView.welcomeView';
		const viewDescriptor: IViewDescriptor = {
			id: viewId,
			name: title,
			order: 1,
			canToggleVisibility: false,
			canMoveView: false,
			when: ContextKeyExpr.and(CONTEXT_CHAT_SHOULD_SHOW_MOVED_VIEW_WELCOME, ContextKeyExpr.or(CONTEXT_CHAT_PANEL_PARTICIPANT_REGISTERED, CONTEXT_CHAT_EXTENSION_INVALID)),
			ctorDescriptor: new SyncDescriptor(MovedChatViewPane, [{ id: viewId }]),
		};

		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
		const welcomeViewMainMessage = localize('chatMovedMainMessage', "Chat has been moved to the Secondary Side Bar. You can quickly access Copilot Chat from the Copilot icon in the title bar.");

		const showChatLabel = localize('showNewChatView', "Show Chat");
		const showViewCommandButton = `[${showChatLabel}](command:${CHAT_SIDEBAR_PANEL_ID})`;

		const moveBackLabel = localize('moveBack', "Move Chat Back");
		const moveBackCommandButton = `[${moveBackLabel}](command:${moveChatBackToOldLocation})`;

		const dismissLabel = localize('dismiss', "Dismiss");
		const dismissCommandButton = `[${dismissLabel}](command:${dismissAndHideMovedChatWelcomeView})`;

		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		return viewsRegistry.registerViewWelcomeContent(viewId, {
			content: [welcomeViewMainMessage, showViewCommandButton, moveBackCommandButton, dismissCommandButton].join('\n\n'),
			when: ContextKeyExpr.and(CONTEXT_CHAT_SHOULD_SHOW_MOVED_VIEW_WELCOME, ContextKeyExpr.or(CONTEXT_CHAT_PANEL_PARTICIPANT_REGISTERED, CONTEXT_CHAT_EXTENSION_INVALID))
		});
	}
}

registerWorkbenchContribution2(MoveChatViewContribution.ID, MoveChatViewContribution, WorkbenchPhase.BlockStartup);


