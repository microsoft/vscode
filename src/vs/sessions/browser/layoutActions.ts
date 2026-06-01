/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../base/common/keyCodes.js';
import { localize, localize2 } from '../../nls.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { Menus } from './menus.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, IsWindowAlwaysOnTopContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { SessionsWelcomeVisibleContext, IsChangesPanelCollapsedContext } from '../common/contextkeys.js';
import { mainWindow } from '../../base/browser/window.js';

// Register Icons
const panelCloseIcon = registerIcon('agent-panel-close', Codicon.close, localize('agentPanelCloseIcon', "Icon to close the panel."));
const sidebarToggleClosedIcon = registerIcon('agent-sidebar-toggle-closed', Codicon.layoutSidebarLeftOff, localize('agentSidebarToggleClosedIcon', "Icon for the sessions sidebar when closed."));
const sidebarToggleOpenIcon = registerIcon('agent-sidebar-toggle-open', Codicon.layoutSidebarLeft, localize('agentSidebarToggleOpenIcon', "Icon for the sessions sidebar when open."));
const auxiliaryBarToggleClosedIcon = registerIcon('agent-auxiliarybar-toggle-closed', Codicon.layoutSidebarRightOff, localize('agentAuxiliaryBarToggleClosedIcon', "Icon for the changes panel when closed."));
const auxiliaryBarToggleOpenIcon = registerIcon('agent-auxiliarybar-toggle-open', Codicon.layoutSidebarRight, localize('agentAuxiliaryBarToggleOpenIcon', "Icon for the changes panel when open."));

class ToggleSidebarVisibilityAction extends Action2 {

	static readonly ID = 'workbench.action.agentToggleSidebarVisibility';

	constructor() {
		super({
			id: ToggleSidebarVisibilityAction.ID,
			title: localize2('toggleSidebar', 'Toggle Primary Side Bar Visibility'),
			icon: sidebarToggleClosedIcon,
			toggled: {
				condition: SideBarVisibleContext,
				icon: sidebarToggleOpenIcon,
			},
			metadata: {
				description: localize('openAndCloseSidebar', 'Open/Show and Close/Hide Sidebar'),
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyB
			},
			menu: [
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
				},
				{
					id: Menus.TitleBarContext,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const isCurrentlyVisible = layoutService.isVisible(Parts.SIDEBAR_PART);

		layoutService.setPartHidden(isCurrentlyVisible, Parts.SIDEBAR_PART);

		// Announce visibility change to screen readers
		const alertMessage = isCurrentlyVisible
			? localize('sidebarHidden', "Primary Side Bar hidden")
			: localize('sidebarVisible', "Primary Side Bar shown");
		alert(alertMessage);
	}
}

class ToggleSecondarySidebarVisibilityAction extends Action2 {

	static readonly ID = 'workbench.action.agentToggleSecondarySidebarVisibility';

	constructor() {
		super({
			id: ToggleSecondarySidebarVisibilityAction.ID,
			title: localize2('toggleSecondarySidebar', 'Toggle Secondary Side Bar Visibility'),
			icon: panelCloseIcon,
			metadata: {
				description: localize('openAndCloseSecondarySidebar', 'Open/Show and Close/Hide Secondary Side Bar'),
			},
			category: Categories.View,
			f1: true,
			menu: [
				{
					id: Menus.TitleBarContext,
					order: 1,
					when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const isCurrentlyVisible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);

		// When hiding and unhidning editor part and auxiliary bar, hiding must be done
		// in the opposite order than showing for sizing to restore correct dimensions.
		if (isCurrentlyVisible && layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			layoutService.setPartHidden(true, Parts.EDITOR_PART);
		}

		layoutService.setPartHidden(isCurrentlyVisible, Parts.AUXILIARYBAR_PART);

		// Announce visibility change to screen readers
		const alertMessage = isCurrentlyVisible
			? localize('secondarySidebarHidden', "Secondary Side Bar hidden")
			: localize('secondarySidebarVisible', "Secondary Side Bar shown");
		alert(alertMessage);
	}
}

class TogglePanelVisibilityAction extends Action2 {

	static readonly ID = 'workbench.action.agentTogglePanelVisibility';

	constructor() {
		super({
			id: TogglePanelVisibilityAction.ID,
			title: localize2('togglePanel', 'Toggle Panel Visibility'),
			category: Categories.View,
			f1: true,
			icon: panelCloseIcon,
			menu: [
				{
					id: Menus.PanelTitle,
					group: 'navigation',
					order: 2,
					when: IsAuxiliaryWindowContext.toNegated()
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(layoutService.isVisible(Parts.PANEL_PART), Parts.PANEL_PART);
	}
}

/**
 * Independent toggle for the auxiliary bar (Changes + Files) from the editor area's
 * title-bar layout actions — placed next to the Close Editor Area button so the
 * user can collapse the changes/files panel without closing the editor (e.g. when
 * the integrated browser is open). Does NOT hide the editor part.
 *
 * This is intentionally distinct from {@link ToggleSecondarySidebarVisibilityAction}:
 * collapsing here records intent in {@link IsChangesPanelCollapsedContext} so the
 * secondary side bar toggle's icon does not flip to its "closed" state — the
 * secondary side bar is conceptually still open, just collapsed.
 *
 * Implemented as two separate actions whose visibility is gated by the collapsed
 * intent so the icon swaps with state without the toolbar applying the "checked"
 * highlight that `toggled` would.
 */
function collapseChangesPanelFromEditor(accessor: ServicesAccessor): void {
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const contextKeyService = accessor.get(IContextKeyService);
	IsChangesPanelCollapsedContext.bindTo(contextKeyService).set(true);
	layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
	alert(localize('changesPanelHidden', "Changes panel hidden"));
}

function expandChangesPanelFromEditor(accessor: ServicesAccessor): void {
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const contextKeyService = accessor.get(IContextKeyService);
	IsChangesPanelCollapsedContext.bindTo(contextKeyService).set(false);
	layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
	alert(localize('changesPanelVisible', "Changes panel shown"));
}

class CollapseChangesPanelFromEditorAction extends Action2 {

	static readonly ID = 'workbench.action.agentCollapseChangesPanelFromEditor';

	constructor() {
		super({
			id: CollapseChangesPanelFromEditorAction.ID,
			title: localize2('collapseChangesPanelFromEditor', 'Collapse Changes Panel'),
			icon: auxiliaryBarToggleOpenIcon,
			category: Categories.View,
			f1: false,
			menu: [
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: 98,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						IsAuxiliaryWindowContext.toNegated(),
						IsTopRightEditorGroupContext,
						AuxiliaryBarVisibleContext
					)
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		collapseChangesPanelFromEditor(accessor);
	}
}

class ExpandChangesPanelFromEditorAction extends Action2 {

	static readonly ID = 'workbench.action.agentExpandChangesPanelFromEditor';

	constructor() {
		super({
			id: ExpandChangesPanelFromEditorAction.ID,
			title: localize2('expandChangesPanelFromEditor', 'Show Changes Panel'),
			icon: auxiliaryBarToggleClosedIcon,
			category: Categories.View,
			f1: false,
			menu: [
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: 98,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						IsAuxiliaryWindowContext.toNegated(),
						IsTopRightEditorGroupContext,
						AuxiliaryBarVisibleContext.toNegated(),
						IsChangesPanelCollapsedContext
					)
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		expandChangesPanelFromEditor(accessor);
	}
}

registerAction2(ToggleSidebarVisibilityAction);
registerAction2(ToggleSecondarySidebarVisibilityAction);
registerAction2(TogglePanelVisibilityAction);
registerAction2(CollapseChangesPanelFromEditorAction);
registerAction2(ExpandChangesPanelFromEditorAction);

// Floating window controls: always-on-top
MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
	command: {
		id: 'workbench.action.toggleWindowAlwaysOnTop',
		title: localize('toggleWindowAlwaysOnTop', "Toggle Always on Top"),
		icon: Codicon.pin,
		toggled: {
			condition: IsWindowAlwaysOnTopContext,
			icon: Codicon.pinned,
		},
	},
	when: IsAuxiliaryWindowContext,
	group: 'navigation',
	order: 0
});
