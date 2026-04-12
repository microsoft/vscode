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
import '../../../workbench/browser/parts/panel/media/panelpart.css';
import './media/panelPart.css';
import { ActivePanelContext, PanelFocusContext } from '../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { PANEL_BORDER, PANEL_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BORDER, PANEL_TITLE_BADGE_BACKGROUND, PANEL_TITLE_BADGE_FOREGROUND } from '../../../workbench/common/theme.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { sessionsPanelBackground } from '../../common/theme.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { IViewDescriptorService } from '../../../workbench/common/views.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { Menus } from '../menus.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
/**
 * Panel part specifically for agent sessions workbench.
 * This is a simplified version of the PanelPart for agent session contexts.
 */
let PanelPart = class PanelPart extends AbstractPaneCompositePart {
    static { PanelPart_1 = this; }
    get preferredHeight() {
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
    static { this.activePanelSettingsKey = 'workbench.agentsession.panelpart.activepanelid'; }
    /** Visual margin values for the card-like appearance */
    static { this.MARGIN_BOTTOM = 10; }
    static { this.MARGIN_LEFT = 10; }
    static { this.MARGIN_RIGHT = 10; }
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService, configurationService) {
        super("workbench.parts.panel" /* Parts.PANEL_PART */, { hasTitle: true, trailingSeparator: true }, PanelPart_1.activePanelSettingsKey, ActivePanelContext.bindTo(contextKeyService), PanelFocusContext.bindTo(contextKeyService), 'panel', 'panel', undefined, PANEL_TITLE_BORDER, 1 /* ViewContainerLocation.Panel */, Extensions.Panels, Menus.PanelTitle, undefined, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService);
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
        // Store background and border as CSS variables for the card styling on .part
        container.style.setProperty('--part-background', this.getColor(sessionsPanelBackground) || '');
        container.style.setProperty('--part-border-color', this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || 'transparent');
        container.style.backgroundColor = this.getColor(sessionsPanelBackground) || '';
        // Clear inline borders - the card appearance uses CSS border-radius instead
        container.style.borderTopColor = '';
        container.style.borderTopStyle = '';
        container.style.borderTopWidth = '';
    }
    getCompositeBarOptions() {
        return {
            partContainerClass: 'panel',
            pinnedViewContainersKey: 'workbench.agentsession.panel.pinnedPanels',
            placeholderViewContainersKey: 'workbench.agentsession.panel.placeholderPanels',
            viewContainersWorkspaceStateKey: 'workbench.agentsession.panel.viewContainersWorkspaceState',
            icon: this.configurationService.getValue('workbench.panel.showLabels') === false,
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            recomputeSizes: true,
            activityHoverOptions: {
                position: () => this.layoutService.getPanelPosition() === 2 /* Position.BOTTOM */ && !this.layoutService.isPanelMaximized() ? 3 /* HoverPosition.ABOVE */ : 2 /* HoverPosition.BELOW */,
            },
            fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
            compositeSize: 0,
            iconSize: 16,
            compact: true,
            overflowActionSize: 44,
            colors: theme => ({
                activeBackgroundColor: theme.getColor(sessionsPanelBackground),
                inactiveBackgroundColor: theme.getColor(sessionsPanelBackground),
                activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
                activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
                inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
                badgeBackground: theme.getColor(PANEL_TITLE_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(PANEL_TITLE_BADGE_FOREGROUND),
                dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
            })
        };
    }
    fillExtraContextMenuActions(_actions) { }
    layout(width, height, top, left) {
        if (!this.layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            return;
        }
        // Layout content with reduced dimensions to account for visual margins and border
        const borderTotal = 2; // 1px border on each side
        const marginLeft = this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? 0 : PanelPart_1.MARGIN_LEFT;
        super.layout(width - marginLeft - PanelPart_1.MARGIN_RIGHT - borderTotal, height - PanelPart_1.MARGIN_BOTTOM - borderTotal, top, left);
        // Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
        Part.prototype.layout.call(this, width, height, top, left);
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
    __param(11, IMenuService),
    __param(12, IConfigurationService)
], PanelPart);
export { PanelPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZWxQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvYnJvd3Nlci9wYXJ0cy9wYW5lbFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sNERBQTRELENBQUM7QUFDcEUsT0FBTyx1QkFBdUIsQ0FBQztBQUcvQixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsdUJBQXVCLEVBQW1CLE1BQU0sNkRBQTZELENBQUM7QUFDdkgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLDZCQUE2QixFQUFFLCtCQUErQixFQUFFLHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLDRCQUE0QixFQUFFLDRCQUE0QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDelEsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBeUIsTUFBTSxvQ0FBb0MsQ0FBQztBQUVuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNwQyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFMUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV6RTs7O0dBR0c7QUFDSSxJQUFNLFNBQVMsR0FBZixNQUFNLFNBQVUsU0FBUSx5QkFBeUI7O0lBU3ZELElBQUksZUFBZTtRQUNsQixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUMvRCxDQUFDO0lBRUQsSUFBSSxjQUFjO1FBQ2pCLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBRXRELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN0QixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ2hELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0IsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELFlBQVk7YUFFSSwyQkFBc0IsR0FBRyxnREFBZ0QsQUFBbkQsQ0FBb0Q7SUFFMUYsd0RBQXdEO2FBQ3hDLGtCQUFhLEdBQUcsRUFBRSxBQUFMLENBQU07YUFDbkIsZ0JBQVcsR0FBRyxFQUFFLEFBQUwsQ0FBTTthQUNqQixpQkFBWSxHQUFHLEVBQUUsQUFBTCxDQUFNO0lBRWxDLFlBQ3VCLG1CQUF5QyxFQUM5QyxjQUErQixFQUMzQixrQkFBdUMsRUFDbkMsYUFBc0MsRUFDM0MsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ25CLG9CQUEyQyxFQUNuRCxZQUEyQixFQUNsQixxQkFBNkMsRUFDakQsaUJBQXFDLEVBQ3RDLGdCQUFtQyxFQUN4QyxXQUF5QixFQUNoQixvQkFBNEQ7UUFFbkYsS0FBSyxpREFFSixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQzNDLFdBQVMsQ0FBQyxzQkFBc0IsRUFDaEMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEVBQzVDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUMzQyxPQUFPLEVBQ1AsT0FBTyxFQUNQLFNBQVMsRUFDVCxrQkFBa0IsdUNBRWxCLFVBQVUsQ0FBQyxNQUFNLEVBQ2pCLEtBQUssQ0FBQyxVQUFVLEVBQ2hCLFNBQVMsRUFDVCxtQkFBbUIsRUFDbkIsY0FBYyxFQUNkLGtCQUFrQixFQUNsQixhQUFhLEVBQ2IsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixvQkFBb0IsRUFDcEIsWUFBWSxFQUNaLHFCQUFxQixFQUNyQixpQkFBaUIsRUFDakIsZ0JBQWdCLEVBQ2hCLFdBQVcsQ0FDWCxDQUFDO1FBNUJzQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBaERwRixlQUFlO1FBRU4saUJBQVksR0FBVyxHQUFHLENBQUM7UUFDM0IsaUJBQVksR0FBVyxNQUFNLENBQUMsaUJBQWlCLENBQUM7UUFDaEQsa0JBQWEsR0FBVyxFQUFFLENBQUM7UUFDM0Isa0JBQWEsR0FBVyxNQUFNLENBQUMsaUJBQWlCLENBQUM7UUF5RXpELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3JFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLDRCQUE0QixDQUFDLEVBQUUsQ0FBQztnQkFDMUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVRLFlBQVk7UUFDcEIsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBRXJCLE1BQU0sU0FBUyxHQUFHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBRTVELDZFQUE2RTtRQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDL0YsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxDQUFDO1FBQ2xJLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFL0UsNEVBQTRFO1FBQzVFLFNBQVMsQ0FBQyxLQUFLLENBQUMsY0FBYyxHQUFHLEVBQUUsQ0FBQztRQUNwQyxTQUFTLENBQUMsS0FBSyxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7UUFDcEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFUyxzQkFBc0I7UUFDL0IsT0FBTztZQUNOLGtCQUFrQixFQUFFLE9BQU87WUFDM0IsdUJBQXVCLEVBQUUsMkNBQTJDO1lBQ3BFLDRCQUE0QixFQUFFLGdEQUFnRDtZQUM5RSwrQkFBK0IsRUFBRSwyREFBMkQ7WUFDNUYsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLENBQUMsS0FBSyxLQUFLO1lBQ2hGLFdBQVcsdUNBQStCO1lBQzFDLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLG9CQUFvQixFQUFFO2dCQUNyQixRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSw0QkFBb0IsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLDZCQUFxQixDQUFDLDRCQUFvQjthQUMvSjtZQUNELDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLE9BQU8sQ0FBQztZQUNqRixhQUFhLEVBQUUsQ0FBQztZQUNoQixRQUFRLEVBQUUsRUFBRTtZQUNaLE9BQU8sRUFBRSxJQUFJO1lBQ2Isa0JBQWtCLEVBQUUsRUFBRTtZQUN0QixNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQixxQkFBcUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDO2dCQUM5RCx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDO2dCQUNoRSx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDO2dCQUNsRSxxQkFBcUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDO2dCQUNwRSx1QkFBdUIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixDQUFDO2dCQUN4RSxlQUFlLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQztnQkFDN0QsZUFBZSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsNEJBQTRCLENBQUM7Z0JBQzdELGlCQUFpQixFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUM7YUFDN0QsQ0FBQztTQUNGLENBQUM7SUFDSCxDQUFDO0lBRU8sMkJBQTJCLENBQUMsUUFBbUIsSUFBVSxDQUFDO0lBRXpELE1BQU0sQ0FBQyxLQUFhLEVBQUUsTUFBYyxFQUFFLEdBQVcsRUFBRSxJQUFZO1FBQ3ZFLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsZ0RBQWtCLEVBQUUsQ0FBQztZQUNyRCxPQUFPO1FBQ1IsQ0FBQztRQUVELGtGQUFrRjtRQUNsRixNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQywwQkFBMEI7UUFDakQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLG9EQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVMsQ0FBQyxXQUFXLENBQUM7UUFDaEcsS0FBSyxDQUFDLE1BQU0sQ0FDWCxLQUFLLEdBQUcsVUFBVSxHQUFHLFdBQVMsQ0FBQyxZQUFZLEdBQUcsV0FBVyxFQUN6RCxNQUFNLEdBQUcsV0FBUyxDQUFDLGFBQWEsR0FBRyxXQUFXLEVBQzlDLEdBQUcsRUFBRSxJQUFJLENBQ1QsQ0FBQztRQUVGLHNGQUFzRjtRQUN0RixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFa0Isc0JBQXNCO1FBQ3hDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVTLHVCQUF1QjtRQUNoQyxPQUFPLG9CQUFvQixDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU87WUFDTixJQUFJLGdEQUFrQjtTQUN0QixDQUFDO0lBQ0gsQ0FBQzs7QUFyS1csU0FBUztJQXNDbkIsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixZQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFlBQUEsWUFBWSxDQUFBO0lBQ1osWUFBQSxxQkFBcUIsQ0FBQTtHQWxEWCxTQUFTLENBc0tyQiJ9