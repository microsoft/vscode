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
var ChatBarPart_1;
import './media/chatBarPart.css';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_BORDER, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_FOREGROUND } from '../../../workbench/common/theme.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { sessionsChatBarBackground } from '../../common/theme.js';
import { IViewDescriptorService } from '../../../workbench/common/views.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
import { Menus } from '../menus.js';
import { ActiveChatBarContext, ChatBarFocusContext } from '../../common/contextkeys.js';
import { SessionCompositeBar } from './sessionCompositeBar.js';
import { prepend } from '../../../base/browser/dom.js';
let ChatBarPart = class ChatBarPart extends AbstractPaneCompositePart {
    static { ChatBarPart_1 = this; }
    static { this.activeViewSettingsKey = 'workbench.chatbar.activepanelid'; }
    static { this.pinnedViewsKey = 'workbench.chatbar.pinnedPanels'; }
    static { this.placeholderViewContainersKey = 'workbench.chatbar.placeholderPanels'; }
    static { this.viewContainersWorkspaceStateKey = 'workbench.chatbar.viewContainersWorkspaceState'; }
    /** Visual margin values for the card-like appearance */
    static { this.MARGIN_TOP = 10; }
    static { this.MARGIN_LEFT = 10; }
    static { this.MARGIN_RIGHT = 10; }
    static { this.MARGIN_BOTTOM = 0; }
    /** Border width on the card (1px each side) */
    static { this.BORDER_WIDTH = 1; }
    /** Height of the session composite bar when visible */
    static { this.SESSION_BAR_HEIGHT = 35; }
    get preferredHeight() {
        return this.layoutService.mainContainerDimension.height * 0.4;
    }
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService) {
        super("workbench.parts.chatbar" /* Parts.CHATBAR_PART */, {
            hasTitle: false,
            trailingSeparator: true,
            borderWidth: () => 0,
        }, ChatBarPart_1.activeViewSettingsKey, ActiveChatBarContext.bindTo(contextKeyService), ChatBarFocusContext.bindTo(contextKeyService), 'chatbar', 'chatbar', undefined, SIDE_BAR_TITLE_BORDER, 3 /* ViewContainerLocation.ChatBar */, Extensions.ChatBar, Menus.ChatBarTitle, undefined, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService);
        this.minimumWidth = 300;
        this.maximumWidth = Number.POSITIVE_INFINITY;
        this.minimumHeight = 0;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        this.priority = 2 /* LayoutPriority.High */;
    }
    create(parent) {
        super.create(parent);
        // Create the session composite bar and prepend it before the content area
        this._sessionCompositeBar = this._register(this.instantiationService.createInstance(SessionCompositeBar));
        prepend(parent, this._sessionCompositeBar.element);
        // Relayout when session bar visibility changes
        this._register(this._sessionCompositeBar.onDidChangeVisibility(() => {
            if (this._lastLayout) {
                this.layout(this._lastLayout.width, this._lastLayout.height, this._lastLayout.top, this._lastLayout.left);
            }
        }));
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        // Store background and border as CSS variables for the card styling on .part
        container.style.setProperty('--part-background', this.getColor(sessionsChatBarBackground) || '');
        container.style.setProperty('--part-border-color', this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || 'transparent');
        container.style.backgroundColor = this.getColor(sessionsChatBarBackground) || '';
        container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';
    }
    layout(width, height, top, left) {
        if (!this.layoutService.isVisible("workbench.parts.chatbar" /* Parts.CHATBAR_PART */)) {
            return;
        }
        this._lastLayout = { width, height, top, left };
        // Account for the session composite bar height when visible
        const sessionBarHeight = this._sessionCompositeBar?.visible ? ChatBarPart_1.SESSION_BAR_HEIGHT : 0;
        // Layout content with reduced dimensions to account for visual margins and border
        const borderTotal = ChatBarPart_1.BORDER_WIDTH * 2;
        const marginLeft = this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? 0 : ChatBarPart_1.MARGIN_LEFT;
        super.layout(width - marginLeft - ChatBarPart_1.MARGIN_RIGHT - borderTotal, height - ChatBarPart_1.MARGIN_TOP - ChatBarPart_1.MARGIN_BOTTOM - borderTotal - sessionBarHeight, top, left);
        // Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
        Part.prototype.layout.call(this, width, height, top, left);
    }
    getCompositeBarOptions() {
        return {
            partContainerClass: 'chatbar',
            pinnedViewContainersKey: ChatBarPart_1.pinnedViewsKey,
            placeholderViewContainersKey: ChatBarPart_1.placeholderViewContainersKey,
            viewContainersWorkspaceStateKey: ChatBarPart_1.viewContainersWorkspaceStateKey,
            icon: false,
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            recomputeSizes: true,
            activityHoverOptions: {
                position: () => 2 /* HoverPosition.BELOW */,
            },
            fillExtraContextMenuActions: () => { },
            compositeSize: 0,
            iconSize: 16,
            overflowActionSize: 30,
            colors: theme => ({
                activeBackgroundColor: theme.getColor(sessionsChatBarBackground),
                inactiveBackgroundColor: theme.getColor(sessionsChatBarBackground),
                activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
                activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
                inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
                badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
                dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
            }),
            compact: true
        };
    }
    shouldShowCompositeBar() {
        return false;
    }
    getCompositeBarPosition() {
        return CompositeBarPosition.TITLE;
    }
    toJSON() {
        return {
            type: "workbench.parts.chatbar" /* Parts.CHATBAR_PART */
        };
    }
};
ChatBarPart = ChatBarPart_1 = __decorate([
    __param(0, INotificationService),
    __param(1, IStorageService),
    __param(2, IContextMenuService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IKeybindingService),
    __param(5, IHoverService),
    __param(6, IInstantiationService),
    __param(7, IThemeService),
    __param(8, IViewDescriptorService),
    __param(9, IContextKeyService),
    __param(10, IExtensionService),
    __param(11, IMenuService)
], ChatBarPart);
export { ChatBarPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEJhclBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL3BhcnRzL2NoYXRCYXJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHlCQUF5QixDQUFDO0FBQ2pDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLHlCQUF5QixFQUFFLDZCQUE2QixFQUFFLFlBQVksRUFBRSwwQkFBMEIsRUFBRSwrQkFBK0IsRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25TLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsc0JBQXNCLEVBQXlCLE1BQU0sb0NBQW9DLENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sNkRBQTZELENBQUM7QUFFN0csT0FB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