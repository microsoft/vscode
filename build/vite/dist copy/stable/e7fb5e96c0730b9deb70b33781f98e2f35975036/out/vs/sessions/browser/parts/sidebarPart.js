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
var SidebarPart_1;
import '../../../workbench/browser/parts/sidebar/media/sidebarpart.css';
import './media/sidebarPart.css';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../workbench/common/contextkeys.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_FOREGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER } from '../../../workbench/common/theme.js';
import { sessionsSidebarBackground, sessionsSidebarHeaderBackground, sessionsSidebarHeaderForeground } from '../../common/theme.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { IViewDescriptorService } from '../../../workbench/common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { Separator } from '../../../base/common/actions.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
import { Menus } from '../menus.js';
import { $, append, getWindowId, prepend } from '../../../base/browser/dom.js';
import { MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { isFullscreen, onDidChangeFullscreen } from '../../../base/browser/browser.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { hasNativeTitlebar, getTitleBarStyle } from '../../../platform/window/common/window.js';
import { isMacintosh, isNative } from '../../../base/common/platform.js';
/**
 * Sidebar part specifically for agent sessions workbench.
 * This is a simplified version of the SidebarPart for agent session contexts.
 */
let SidebarPart = class SidebarPart extends AbstractPaneCompositePart {
    static { SidebarPart_1 = this; }
    static { this.activeViewletSettingsKey = 'workbench.agentsession.sidebar.activeviewletid'; }
    static { this.pinnedViewContainersKey = 'workbench.agentsession.pinnedViewlets2'; }
    static { this.placeholderViewContainersKey = 'workbench.agentsession.placeholderViewlets'; }
    static { this.viewContainersWorkspaceStateKey = 'workbench.agentsession.viewletsWorkspaceState'; }
    /** Visual margin values - sidebar is flush (no card appearance) */
    static { this.MARGIN_TOP = 0; }
    static { this.MARGIN_BOTTOM = 0; }
    static { this.MARGIN_LEFT = 0; }
    static { this.FOOTER_ITEM_HEIGHT = 26; }
    static { this.FOOTER_ITEM_GAP = 4; }
    static { this.FOOTER_VERTICAL_PADDING = 6; }
    static { this.FOOTER_BOTTOM_MARGIN = 2; }
    static { this.FOOTER_BORDER_TOP = 1; }
    get snap() { return true; }
    get preferredWidth() {
        const viewlet = this.getActivePaneComposite();
        if (!viewlet) {
            return undefined;
        }
        const width = viewlet.getOptimalWidth();
        if (typeof width !== 'number') {
            return undefined;
        }
        return Math.max(width, 300);
    }
    //#endregion
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService, configurationService) {
        super("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, { hasTitle: true, trailingSeparator: false, borderWidth: () => 0 }, SidebarPart_1.activeViewletSettingsKey, ActiveViewletContext.bindTo(contextKeyService), SidebarFocusContext.bindTo(contextKeyService), 'sideBar', 'viewlet', SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, 0 /* ViewContainerLocation.Sidebar */, Extensions.Viewlets, Menus.SidebarTitle, Menus.TitleBarLeftLayout, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService);
        this.configurationService = configurationService;
        //#region IView
        this.minimumWidth = 270;
        this.maximumWidth = Number.POSITIVE_INFINITY;
        this.minimumHeight = 0;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        this.priority = 1 /* LayoutPriority.Low */;
    }
    create(parent) {
        super.create(parent);
        this.createFooter(parent);
    }
    createTitleArea(parent) {
        const titleArea = super.createTitleArea(parent);
        this.sideBarTitleArea = titleArea;
        if (titleArea) {
            // Add a drag region so the sidebar title area can be used to move the window,
            // matching the titlebar's drag behavior.
            prepend(titleArea, $('div.titlebar-drag-region'));
        }
        // macOS native: the sidebar spans full height and the traffic lights
        // overlay the top-left corner. Add a fixed-width spacer inside the
        // title area to push content horizontally past the traffic lights.
        if (titleArea && isMacintosh && isNative && !hasNativeTitlebar(this.configurationService, getTitleBarStyle(this.configurationService))) {
            const spacer = $('div.window-controls-container');
            spacer.style.width = '70px';
            spacer.style.height = '100%';
            spacer.style.flexShrink = '0';
            spacer.style.order = '-1'; // match global-actions-left order so DOM order is respected
            prepend(titleArea, spacer);
            // Hide spacer in fullscreen (traffic lights are not shown)
            const updateSpacerVisibility = () => {
                spacer.style.display = isFullscreen(mainWindow) ? 'none' : '';
            };
            updateSpacerVisibility();
            this._register(onDidChangeFullscreen(windowId => {
                if (windowId === getWindowId(mainWindow)) {
                    updateSpacerVisibility();
                }
            }));
        }
        return titleArea;
    }
    createFooter(parent) {
        const footer = append(parent, $('.sidebar-footer.sidebar-action-list'));
        this.footerContainer = footer;
        this.footerToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, footer, Menus.SidebarFooter, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: { primaryGroup: () => true },
            telemetrySource: 'sidebarFooter',
        }));
        this._register(this.footerToolbar.onDidChangeMenuItems(() => {
            if (this.previousLayoutDimensions) {
                const { width, height, top, left } = this.previousLayoutDimensions;
                this.layout(width, height, top, left);
            }
        }));
    }
    getFooterHeight() {
        const actionCount = this.footerToolbar?.getItemsLength() ?? 0;
        if (actionCount === 0) {
            return 0;
        }
        return SidebarPart_1.FOOTER_VERTICAL_PADDING * 2
            + (actionCount * SidebarPart_1.FOOTER_ITEM_HEIGHT)
            + ((actionCount - 1) * SidebarPart_1.FOOTER_ITEM_GAP)
            + SidebarPart_1.FOOTER_BOTTOM_MARGIN
            + SidebarPart_1.FOOTER_BORDER_TOP;
    }
    updateFooterVisibility() {
        const footer = this.footerContainer;
        if (!footer) {
            return;
        }
        footer.style.display = this.getFooterHeight() > 0 ? '' : 'none';
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        container.style.backgroundColor = this.getColor(sessionsSidebarBackground) || '';
        container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';
        container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';
        // No right border in sessions sidebar
        container.style.borderRightWidth = '';
        container.style.borderRightStyle = '';
        container.style.borderRightColor = '';
        // Title area uses sessions-specific header colors
        if (this.sideBarTitleArea) {
            this.sideBarTitleArea.style.backgroundColor = this.getColor(sessionsSidebarHeaderBackground) || '';
            this.sideBarTitleArea.style.color = this.getColor(sessionsSidebarHeaderForeground) || '';
        }
    }
    layout(width, height, top, left) {
        this.previousLayoutDimensions = { width, height, top, left };
        if (!this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            return;
        }
        this.updateFooterVisibility();
        const footerHeight = Math.min(height, this.getFooterHeight());
        // Layout content with reduced height to account for footer
        super.layout(width, height - footerHeight, top, left);
        // Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
        Part.prototype.layout.call(this, width, height, top, left);
    }
    getTitleAreaDropDownAnchorAlignment() {
        return this.layoutService.getSideBarPosition() === 0 /* SideBarPosition.LEFT */ ? 0 /* AnchorAlignment.LEFT */ : 1 /* AnchorAlignment.RIGHT */;
    }
    createTitleLabel(_parent) {
        // No title label in agent sessions sidebar
        return {
            updateTitle: () => { },
            updateStyles: () => { }
        };
    }
    getCompositeBarOptions() {
        return {
            partContainerClass: 'sidebar',
            pinnedViewContainersKey: SidebarPart_1.pinnedViewContainersKey,
            placeholderViewContainersKey: SidebarPart_1.placeholderViewContainersKey,
            viewContainersWorkspaceStateKey: SidebarPart_1.viewContainersWorkspaceStateKey,
            icon: false,
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            recomputeSizes: true,
            activityHoverOptions: {
                position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? 3 /* HoverPosition.ABOVE */ : 2 /* HoverPosition.BELOW */,
            },
            fillExtraContextMenuActions: actions => {
                if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
                    const viewsSubmenuAction = this.getViewsSubmenuAction();
                    if (viewsSubmenuAction) {
                        actions.push(new Separator());
                        actions.push(viewsSubmenuAction);
                    }
                }
            },
            compositeSize: 0,
            iconSize: 16,
            overflowActionSize: 30,
            colors: theme => ({
                activeBackgroundColor: theme.getColor(sessionsSidebarBackground),
                inactiveBackgroundColor: theme.getColor(sessionsSidebarBackground),
                activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
                activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
                inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
                badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
                dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
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
    async focusActivityBar() {
        if (this.shouldShowCompositeBar()) {
            this.focusCompositeBar();
        }
    }
    toJSON() {
        return {
            type: "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */
        };
    }
};
SidebarPart = SidebarPart_1 = __decorate([
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
    __param(11, IMenuService),
    __param(12, IConfigurationService)
], SidebarPart);
export { SidebarPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lkZWJhclBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL3BhcnRzL3NpZGViYXJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLGdFQUFnRSxDQUFDO0FBQ3hFLE9BQU8seUJBQXlCLENBQUM7QUFDakMsT0FBTyxFQUFFLHVCQUF1QixFQUFzQyxNQUFNLDZEQUE2RCxDQUFDO0FBQzFJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLGlDQUFpQyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLDJCQUEyQixFQUFFLDhCQUE4QixFQUFFLG9DQUFvQyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdFcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLCtCQUErQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDcEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckUsT0FBTyxFQUFFLHNCQUFzQixFQUF5QixNQUFNLG9DQUFvQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRXhILE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUkxRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNwQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0UsT0FBTyxFQUFzQixvQkFBb0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxZQUFZLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RTs7O0dBR0c7QUFDSSxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFZLFNBQVEseUJBQXlCOzthQUV6Qyw2QkFBd0IsR0FBRyxnREFBZ0QsQUFBbkQsQ0FBb0Q7YUFDNUUsNEJBQXVCLEdBQUcsd0NBQXdDLEFBQTNDLENBQTRDO2FBQ25FLGlDQUE0QixHQUFHLDRDQUE0QyxBQUEvQyxDQUFnRDthQUM1RSxvQ0FBK0IsR0FBRywrQ0FBK0MsQUFBbEQsQ0FBbUQ7SUFFbEcsbUVBQW1FO2FBQ25ELGVBQVUsR0FBRyxDQUFDLEFBQUosQ0FBSzthQUNmLGtCQUFhLEdBQUcsQ0FBQyxBQUFKLENBQUs7YUFDbEIsZ0JBQVcsR0FBRyxDQUFDLEFBQUosQ0FBSzthQUNSLHVCQUFrQixHQUFHLEVBQUUsQUFBTCxDQUFNO2FBQ3hCLG9CQUFlLEdBQUcsQ0FBQyxBQUFKLENBQUs7YUFDcEIsNEJBQXVCLEdBQUcsQ0FBQyxBQUFKLENBQUs7YUFDNUIseUJBQW9CLEdBQUcsQ0FBQyxBQUFKLENBQUs7YUFDekIsc0JBQWlCLEdBQUcsQ0FBQyxBQUFKLENBQUs7SUFhOUMsSUFBYSxJQUFJLEtBQWMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBSTdDLElBQUksY0FBYztRQUNqQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUU5QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3hDLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0IsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELFlBQVk7SUFFWixZQUN1QixtQkFBeUMsRUFDOUMsY0FBK0IsRUFDM0Isa0JBQXVDLEVBQ25DLGFBQXNDLEVBQzNDLGlCQUFxQyxFQUMxQyxZQUEyQixFQUNuQixvQkFBMkMsRUFDbkQsWUFBMkIsRUFDbEIscUJBQTZDLEVBQ2pELGlCQUFxQyxFQUN0QyxnQkFBbUMsRUFDeEMsV0FBeUIsRUFDaEIsb0JBQTREO1FBRW5GLEtBQUsscURBRUosRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQ2xFLGFBQVcsQ0FBQyx3QkFBd0IsRUFDcEMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEVBQzlDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUM3QyxTQUFTLEVBQ1QsU0FBUyxFQUNULHlCQUF5QixFQUN6QixxQkFBcUIseUNBRXJCLFVBQVUsQ0FBQyxRQUFRLEVBQ25CLEtBQUssQ0FBQyxZQUFZLEVBQ2xCLEtBQUssQ0FBQyxrQkFBa0IsRUFDeEIsbUJBQW1CLEVBQ25CLGNBQWMsRUFDZCxrQkFBa0IsRUFDbEIsYUFBYSxFQUNiLGlCQUFpQixFQUNqQixZQUFZLEVBQ1osb0JBQW9CLEVBQ3BCLFlBQVksRUFDWixxQkFBcUIsRUFDckIsaUJBQWlCLEVBQ2pCLGdCQUFnQixFQUNoQixXQUFXLENBQ1gsQ0FBQztRQTVCc0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQXhDcEYsZUFBZTtRQUVOLGlCQUFZLEdBQVcsR0FBRyxDQUFDO1FBQzNCLGlCQUFZLEdBQVcsTUFBTSxDQUFDLGlCQUFpQixDQUFDO1FBQ2hELGtCQUFhLEdBQVcsQ0FBQyxDQUFDO1FBQzFCLGtCQUFhLEdBQVcsTUFBTSxDQUFDLGlCQUFpQixDQUFDO1FBR2pELGFBQVEsOEJBQXNDO0lBNkR2RCxDQUFDO0lBRVEsTUFBTSxDQUFDLE1BQW1CO1FBQ2xDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRWtCLGVBQWUsQ0FBQyxNQUFtQjtRQUNyRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7UUFFbEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLDhFQUE4RTtZQUM5RSx5Q0FBeUM7WUFDekMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFFRCxxRUFBcUU7UUFDckUsbUVBQW1FO1FBQ25FLG1FQUFtRTtRQUNuRSxJQUFJLFNBQVMsSUFBSSxXQUFXLElBQUksUUFBUSxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4SSxNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7WUFDNUIsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQztZQUM5QixNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyw0REFBNEQ7WUFDdkYsT0FBTyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUUzQiwyREFBMkQ7WUFDM0QsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLEVBQUU7Z0JBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDL0QsQ0FBQyxDQUFDO1lBQ0Ysc0JBQXNCLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUMvQyxJQUFJLFFBQVEsS0FBSyxXQUFXLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDMUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDMUIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLFlBQVksQ0FBQyxNQUFtQjtRQUN2QyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUM7UUFFOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUU7WUFDL0gsa0JBQWtCLG9DQUEyQjtZQUM3QyxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzVDLGVBQWUsRUFBRSxlQUFlO1NBQ2hDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRTtZQUMzRCxJQUFJLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDO2dCQUNuRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGVBQWU7UUFDdEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUQsSUFBSSxXQUFXLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkIsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBRUQsT0FBTyxhQUFXLENBQUMsdUJBQXVCLEdBQUcsQ0FBQztjQUMzQyxDQUFDLFdBQVcsR0FBRyxhQUFXLENBQUMsa0JBQWtCLENBQUM7Y0FDOUMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxhQUFXLENBQUMsZUFBZSxDQUFDO2NBQ2pELGFBQVcsQ0FBQyxvQkFBb0I7Y0FDaEMsYUFBVyxDQUFDLGlCQUFpQixDQUFDO0lBQ2xDLENBQUM7SUFFTyxzQkFBc0I7UUFDN0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQztRQUNwQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ2pFLENBQUM7SUFFUSxZQUFZO1FBQ3BCLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUVyQixNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUU1RCxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2pGLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakUsU0FBUyxDQUFDLEtBQUssQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUV0RixzQ0FBc0M7UUFDdEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7UUFDdEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7UUFDdEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7UUFFdEMsa0RBQWtEO1FBQ2xELElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLCtCQUErQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFGLENBQUM7SUFDRixDQUFDO0lBRVEsTUFBTSxDQUFDLEtBQWEsRUFBRSxNQUFjLEVBQUUsR0FBVyxFQUFFLElBQVk7UUFDdkUsSUFBSSxDQUFDLHdCQUF3QixHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFFN0QsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxvREFBb0IsRUFBRSxDQUFDO1lBQ3ZELE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFOUQsMkRBQTJEO1FBQzNELEtBQUssQ0FBQyxNQUFNLENBQ1gsS0FBSyxFQUNMLE1BQU0sR0FBRyxZQUFZLEVBQ3JCLEdBQUcsRUFBRSxJQUFJLENBQ1QsQ0FBQztRQUVGLHNGQUFzRjtRQUN0RixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFa0IsbUNBQW1DO1FBQ3JELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsRUFBRSxpQ0FBeUIsQ0FBQyxDQUFDLDhCQUFzQixDQUFDLDhCQUFzQixDQUFDO0lBQ3hILENBQUM7SUFFa0IsZ0JBQWdCLENBQUMsT0FBb0I7UUFDdkQsMkNBQTJDO1FBQzNDLE9BQU87WUFDTixXQUFXLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztZQUN0QixZQUFZLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUN2QixDQUFDO0lBQ0gsQ0FBQztJQUVTLHNCQUFzQjtRQUMvQixPQUFPO1lBQ04sa0JBQWtCLEVBQUUsU0FBUztZQUM3Qix1QkFBdUIsRUFBRSxhQUFXLENBQUMsdUJBQXVCO1lBQzVELDRCQUE0QixFQUFFLGFBQVcsQ0FBQyw0QkFBNEI7WUFDdEUsK0JBQStCLEVBQUUsYUFBVyxDQUFDLCtCQUErQjtZQUM1RSxJQUFJLEVBQUUsS0FBSztZQUNYLFdBQVcsdUNBQStCO1lBQzFDLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLG9CQUFvQixFQUFFO2dCQUNyQixRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUMsNkJBQXFCLENBQUMsNEJBQW9CO2FBQzFIO1lBQ0QsMkJBQTJCLEVBQUUsT0FBTyxDQUFDLEVBQUU7Z0JBQ3RDLElBQUksSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssb0JBQW9CLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQ25FLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7b0JBQ3hELElBQUksa0JBQWtCLEVBQUUsQ0FBQzt3QkFDeEIsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7d0JBQzlCLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztvQkFDbEMsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELGFBQWEsRUFBRSxDQUFDO1lBQ2hCLFFBQVEsRUFBRSxFQUFFO1lBQ1osa0JBQWtCLEVBQUUsRUFBRTtZQUN0QixNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQixxQkFBcUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDO2dCQUNoRSx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDO2dCQUNsRSx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLDhCQUE4QixDQUFDO2dCQUN2RSxxQkFBcUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDO2dCQUNsRSx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDO2dCQUM3RSxlQUFlLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQztnQkFDOUQsZUFBZSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUM7Z0JBQzlELGlCQUFpQixFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMscUNBQXFDLENBQUM7YUFDeEUsQ0FBQztZQUNGLE9BQU8sRUFBRSxJQUFJO1NBQ2IsQ0FBQztJQUNILENBQUM7SUFFUyxzQkFBc0I7UUFDL0IsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVMsdUJBQXVCO1FBQ2hDLE9BQU8sb0JBQW9CLENBQUMsS0FBSyxDQUFDO0lBQ25DLENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCO1FBQ3JCLElBQUksSUFBSSxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU07UUFDTCxPQUFPO1lBQ04sSUFBSSxvREFBb0I7U0FDeEIsQ0FBQztJQUNILENBQUM7O0FBNVJXLFdBQVc7SUFrRHJCLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsdUJBQXVCLENBQUE7SUFDdkIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEscUJBQXFCLENBQUE7R0E5RFgsV0FBVyxDQTZSdkIifQ==