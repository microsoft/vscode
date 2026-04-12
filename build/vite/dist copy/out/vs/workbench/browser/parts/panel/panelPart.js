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
var PanelPart_1;
import './media/panelpart.css';
import { localize } from '../../../../nls.js';
import { Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { ActivePanelContext, PanelFocusContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TogglePanelAction } from './panelActions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BORDER, PANEL_TITLE_BADGE_BACKGROUND, PANEL_TITLE_BADGE_FOREGROUND } from '../../../common/theme.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions } from '../../panecomposite.js';
let PanelPart = class PanelPart extends AbstractPaneCompositePart {
    static { PanelPart_1 = this; }
    get preferredHeight() {
        // Don't worry about titlebar or statusbar visibility
        // The difference is minimal and keeps this function clean
        return this.layoutService.mainContainerDimension.height * 0.4;
    }
    get preferredWidth() {
        const activeComposite = this.getActivePaneComposite();
        if (!activeComposite) {
            return undefined;
        }
        const width = activeComposite.getOptimalWidth();
        if (typeof width !== 'number') {
            return undefined;
        }
        return Math.max(width, 300);
    }
    //#endregion
    static { this.activePanelSettingsKey = 'workbench.panelpart.activepanelid'; }
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, commandService, menuService, configurationService) {
        super("workbench.parts.panel" /* Parts.PANEL_PART */, { hasTitle: true, trailingSeparator: true }, PanelPart_1.activePanelSettingsKey, ActivePanelContext.bindTo(contextKeyService), PanelFocusContext.bindTo(contextKeyService), 'panel', 'panel', undefined, PANEL_TITLE_BORDER, 1 /* ViewContainerLocation.Panel */, Extensions.Panels, MenuId.PanelTitle, undefined, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService);
        this.commandService = commandService;
        this.configurationService = configurationService;
        //#region IView
        this.minimumWidth = 300;
        this.maximumWidth = Number.POSITIVE_INFINITY;
        this.minimumHeight = 77;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.panel.showLabels')) {
                this.updateCompositeBar(true);
            }
        }));
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        container.style.backgroundColor = this.getColor(PANEL_BACKGROUND) || '';
        const borderColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
        container.style.borderLeftColor = borderColor;
        container.style.borderRightColor = borderColor;
        container.style.borderBottomColor = borderColor;
        if (this.titleArea) {
            this.titleArea.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
        }
    }
    getCompositeBarOptions() {
        return {
            partContainerClass: 'panel',
            pinnedViewContainersKey: 'workbench.panel.pinnedPanels',
            placeholderViewContainersKey: 'workbench.panel.placeholderPanels',
            viewContainersWorkspaceStateKey: 'workbench.panel.viewContainersWorkspaceState',
            icon: this.configurationService.getValue('workbench.panel.showLabels') === false,
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            recomputeSizes: true,
            activityHoverOptions: {
                position: () => this.layoutService.getPanelPosition() === 2 /* Position.BOTTOM */ && !this.layoutService.isPanelMaximized() ? 3 /* HoverPosition.ABOVE */ : 2 /* HoverPosition.BELOW */,
            },
            fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
            compositeSize: 0,
            iconSize: 16,
            compact: true, // Only applies to icons, not labels
            overflowActionSize: 44,
            colors: theme => ({
                activeBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
                inactiveBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
                activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
                activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
                inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
                badgeBackground: theme.getColor(PANEL_TITLE_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(PANEL_TITLE_BADGE_FOREGROUND),
                dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
            })
        };
    }
    fillExtraContextMenuActions(actions) {
        if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
            const viewsSubmenuAction = this.getViewsSubmenuAction();
            if (viewsSubmenuAction) {
                actions.push(new Separator());
                actions.push(viewsSubmenuAction);
            }
        }
        const panelPositionMenu = this.menuService.getMenuActions(MenuId.PanelPositionMenu, this.contextKeyService, { shouldForwardArgs: true });
        const panelAlignMenu = this.menuService.getMenuActions(MenuId.PanelAlignmentMenu, this.contextKeyService, { shouldForwardArgs: true });
        const positionActions = getContextMenuActions(panelPositionMenu).secondary;
        const alignActions = getContextMenuActions(panelAlignMenu).secondary;
        const panelShowLabels = this.configurationService.getValue('workbench.panel.showLabels');
        const toggleShowLabelsAction = toAction({
            id: 'workbench.action.panel.toggleShowLabels',
            label: panelShowLabels ? localize('showIcons', "Show Icons") : localize('showLabels', "Show Labels"),
            run: () => this.configurationService.updateValue('workbench.panel.showLabels', !panelShowLabels)
        });
        actions.push(...[
            new Separator(),
            new SubmenuAction('workbench.action.panel.position', localize('panel position', "Panel Position"), positionActions),
            new SubmenuAction('workbench.action.panel.align', localize('align panel', "Align Panel"), alignActions),
            toggleShowLabelsAction,
            toAction({ id: TogglePanelAction.ID, label: localize('hidePanel', "Hide Panel"), run: () => this.commandService.executeCommand(TogglePanelAction.ID) }),
        ]);
    }
    layout(width, height, top, left) {
        let dimensions;
        switch (this.layoutService.getPanelPosition()) {
            case 1 /* Position.RIGHT */:
                dimensions = new Dimension(width - 1, height); // Take into account the 1px border when layouting
                break;
            case 3 /* Position.TOP */:
                dimensions = new Dimension(width, height - 1); // Take into account the 1px border when layouting
                break;
            default:
                dimensions = new Dimension(width, height);
                break;
        }
        // Layout contents
        super.layout(dimensions.width, dimensions.height, top, left);
    }
    shouldShowCompositeBar() {
        return true;
    }
    getCompositeBarPosition() {
        return CompositeBarPosition.TITLE;
    }
    toJSON() {
        return {
            type: "workbench.parts.panel" /* Parts.PANEL_PART */
        };
    }
};
PanelPart = PanelPart_1 = __decorate([
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
    __param(11, ICommandService),
    __param(12, IMenuService),
    __param(13, IConfigurationService)
], PanelPart);
export { PanelPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZWxQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvcGFuZWwvcGFuZWxQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVCQUF1QixDQUFDO0FBQy9CLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQVcsU0FBUyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsdUJBQXVCLEVBQW1CLE1BQU0sbURBQW1ELENBQUM7QUFDN0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLDZCQUE2QixFQUFFLCtCQUErQixFQUFFLHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLDRCQUE0QixFQUFFLDRCQUE0QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDalIsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxvQkFBb0Is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