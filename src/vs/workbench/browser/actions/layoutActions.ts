/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IPartService, Parts, Position } from 'vs/workbench/services/part/common/partService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEditorGroupsService, GroupOrientation } from 'vs/workbench/services/group/common/editorGroupsService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { MenuBarVisibility } from 'vs/platform/windows/common/windows';
import { isWindows, isLinux } from 'vs/base/common/platform';
import { IsMacContext } from 'vs/platform/workbench/common/contextkeys';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { InEditorZenModeContext } from 'vs/workbench/common/editor';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const viewCategory = nls.localize('view', "View");

// --- Toggle Activity Bar

export class ToggleActivityBarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleActivityBarVisibility';
	static readonly LABEL = nls.localize('toggleActivityBar', "Toggle Activity Bar Visibility");

	private static readonly activityBarVisibleKey = 'workbench.activityBar.visible';

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		const visibility = this.partService.isVisible(Parts.ACTIVITYBAR_PART);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleActivityBarVisibilityAction.activityBarVisibleKey, newVisibilityValue, ConfigurationTarget.USER);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleActivityBarVisibilityAction, ToggleActivityBarVisibilityAction.ID, ToggleActivityBarVisibilityAction.LABEL), 'View: Toggle Activity Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleActivityBarVisibilityAction.ID,
		title: nls.localize({ key: 'miToggleActivityBar', comment: ['&& denotes a mnemonic'] }, "Toggle &&Activity Bar")
	},
	order: 4
});

// --- Toggle Centered Layout

class ToggleCenteredLayout extends Action {

	static readonly ID = 'workbench.action.toggleCenteredLayout';
	static readonly LABEL = nls.localize('toggleCenteredLayout', "Toggle Centered Layout");

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService
	) {
		super(id, label);
		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		this.partService.centerEditorLayout(!this.partService.isEditorLayoutCentered());

		return Promise.resolve(null);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleCenteredLayout, ToggleCenteredLayout.ID, ToggleCenteredLayout.LABEL), 'View: Toggle Centered Layout', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleCenteredLayout.ID,
		title: nls.localize('miToggleCenteredLayout', "Toggle Centered Layout")
	},
	order: 3
});

// --- Toggle Editor Layout

export class ToggleEditorLayoutAction extends Action {

	static readonly ID = 'workbench.action.toggleEditorGroupLayout';
	static readonly LABEL = nls.localize('flipLayout', "Toggle Vertical/Horizontal Editor Layout");

	private toDispose: IDisposable[];

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);

		this.toDispose = [];

		this.class = 'flip-editor-layout';
		this.updateEnablement();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.editorGroupService.onDidAddGroup(() => this.updateEnablement()));
		this.toDispose.push(this.editorGroupService.onDidRemoveGroup(() => this.updateEnablement()));
	}

	private updateEnablement(): void {
		this.enabled = this.editorGroupService.count > 1;
	}

	run(): Promise<any> {
		const newOrientation = (this.editorGroupService.orientation === GroupOrientation.VERTICAL) ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
		this.editorGroupService.setGroupOrientation(newOrientation);

		return Promise.resolve(null);
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
	}
}

CommandsRegistry.registerCommand('_workbench.editor.setGroupOrientation', function (accessor: ServicesAccessor, args: [GroupOrientation]) {
	const editorGroupService = accessor.get(IEditorGroupsService);
	const [orientation] = args;

	editorGroupService.setGroupOrientation(orientation);

	return Promise.resolve(null);
});

const group = viewCategory;
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_0 } }), 'View: Flip Editor Group Layout', group);

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: 'z_flip',
	command: {
		id: ToggleEditorLayoutAction.ID,
		title: nls.localize({ key: 'miToggleEditorLayout', comment: ['&& denotes a mnemonic'] }, "Flip &&Layout")
	},
	order: 1
});

// --- Toggle Sidebar Position

export class ToggleSidebarPositionAction extends Action {

	static readonly ID = 'workbench.action.toggleSidebarPosition';
	static readonly LABEL = nls.localize('toggleSidebarPosition', "Toggle Side Bar Position");

	private static readonly sidebarPositionConfigurationKey = 'workbench.sideBar.location';

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.partService && !!this.configurationService;
	}

	run(): Promise<any> {
		const position = this.partService.getSideBarPosition();
		const newPositionValue = (position === Position.LEFT) ? 'right' : 'left';

		return this.configurationService.updateValue(ToggleSidebarPositionAction.sidebarPositionConfigurationKey, newPositionValue, ConfigurationTarget.USER);
	}

	static getLabel(partService: IPartService): string {
		return partService.getSideBarPosition() === Position.LEFT ? nls.localize('moveSidebarRight', "Move Side Bar Right") : nls.localize('moveSidebarLeft', "Move Side Bar Left");
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarPositionAction, ToggleSidebarPositionAction.ID, ToggleSidebarPositionAction.LABEL), 'View: Toggle Side Bar Position', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleSidebarPositionAction.ID,
		title: nls.localize({ key: 'miMoveSidebarLeftRight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Left/Right")
	},
	order: 2
});

// --- Toggle Sidebar Visibility

export class ToggleEditorVisibilityAction extends Action {
	static readonly ID = 'workbench.action.toggleEditorVisibility';
	static readonly LABEL = nls.localize('toggleEditor', "Toggle Editor Area");

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		const hideEditor = this.partService.isVisible(Parts.EDITOR_PART);
		this.partService.setEditorHidden(hideEditor);

		return Promise.resolve(null);
	}

}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorVisibilityAction, ToggleEditorVisibilityAction.ID, ToggleEditorVisibilityAction.LABEL), 'View: Toggle Editor Area Visibility', viewCategory, ContextKeyExpr.equals('config.workbench.useExperimentalGridLayout', true));


export class ToggleSidebarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleSidebarVisibility';
	static readonly LABEL = nls.localize('toggleSidebar', "Toggle Side Bar Visibility");

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		const hideSidebar = this.partService.isVisible(Parts.SIDEBAR_PART);
		this.partService.setSideBarHidden(hideSidebar);

		return Promise.resolve(null);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarVisibilityAction, ToggleSidebarVisibilityAction.ID, ToggleSidebarVisibilityAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_B }), 'View: Toggle Side Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleSidebarVisibilityAction.ID,
		title: nls.localize({ key: 'miToggleSidebar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Side Bar")
	},
	order: 1
});

// --- Toggle Statusbar Visibility

class ToggleStatusbarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleStatusbarVisibility';
	static readonly LABEL = nls.localize('toggleStatusbar', "Toggle Status Bar Visibility");

	private static readonly statusbarVisibleKey = 'workbench.statusBar.visible';

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		const visibility = this.partService.isVisible(Parts.STATUSBAR_PART);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleStatusbarVisibilityAction.statusbarVisibleKey, newVisibilityValue, ConfigurationTarget.USER);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleStatusbarVisibilityAction, ToggleStatusbarVisibilityAction.ID, ToggleStatusbarVisibilityAction.LABEL), 'View: Toggle Status Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleStatusbarVisibilityAction.ID,
		title: nls.localize({ key: 'miToggleStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Status Bar")
	},
	order: 3
});

// --- Toggle Tabs Visibility

class ToggleTabsVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleTabsVisibility';
	static readonly LABEL = nls.localize('toggleTabs', "Toggle Tab Visibility");

	private static readonly tabsVisibleKey = 'workbench.editor.showTabs';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const visibility = this.configurationService.getValue<string>(ToggleTabsVisibilityAction.tabsVisibleKey);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleTabsVisibilityAction.tabsVisibleKey, newVisibilityValue);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTabsVisibilityAction, ToggleTabsVisibilityAction.ID, ToggleTabsVisibilityAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_W }), 'View: Toggle Tab Visibility', viewCategory);

// --- Toggle Zen Mode

class ToggleZenMode extends Action {

	static readonly ID = 'workbench.action.toggleZenMode';
	static readonly LABEL = nls.localize('toggleZenMode', "Toggle Zen Mode");

	constructor(
		id: string,
		label: string,
		@IPartService private readonly partService: IPartService
	) {
		super(id, label);
		this.enabled = !!this.partService;
	}

	run(): Promise<any> {
		this.partService.toggleZenMode();

		return Promise.resolve(null);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleZenMode, ToggleZenMode.ID, ToggleZenMode.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_Z) }), 'View: Toggle Zen Mode', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleZenMode.ID,
		title: nls.localize('miToggleZenMode', "Toggle Zen Mode")
	},
	order: 2
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.exitZenMode',
	weight: KeybindingWeight.EditorContrib - 1000,
	handler(accessor: ServicesAccessor) {
		const partService = accessor.get(IPartService);
		partService.toggleZenMode();
	},
	when: InEditorZenModeContext,
	primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
});

// --- Toggle Menu Bar

export class ToggleMenuBarAction extends Action {

	static readonly ID = 'workbench.action.toggleMenuBar';
	static LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	private static readonly menuBarVisibilityKey = 'window.menuBarVisibility';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		let currentVisibilityValue = this.configurationService.getValue<MenuBarVisibility>(ToggleMenuBarAction.menuBarVisibilityKey);
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'default';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'default') {
			newVisibilityValue = 'toggle';
		} else {
			newVisibilityValue = 'default';
		}

		this.configurationService.updateValue(ToggleMenuBarAction.menuBarVisibilityKey, newVisibilityValue, ConfigurationTarget.USER);

		return Promise.resolve();
	}
}

if (isWindows || isLinux) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), 'View: Toggle Menu Bar', viewCategory);
}

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleMenuBarAction.ID,
		title: nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar")
	},
	when: IsMacContext.toNegated(),
	order: 4
});

// --- Resize View

export abstract class BaseResizeViewAction extends Action {

	protected static RESIZE_INCREMENT = 6.5; // This is a media-size percentage

	constructor(
		id: string,
		label: string,
		@IPartService protected partService: IPartService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		let part: Parts | undefined;
		if (isSidebarFocus) {
			part = Parts.SIDEBAR_PART;
		} else if (isPanelFocus) {
			part = Parts.PANEL_PART;
		} else if (isEditorFocus) {
			part = Parts.EDITOR_PART;
		}

		if (part) {
			this.partService.resizePart(part, sizeChange);
		}
	}
}

export class IncreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.increaseViewSize';
	static readonly LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService
	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.decreaseViewSize';
	static readonly LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

registry.registerWorkbenchAction(new SyncActionDescriptor(IncreaseViewSizeAction, IncreaseViewSizeAction.ID, IncreaseViewSizeAction.LABEL, undefined), 'View: Increase Current View Size', viewCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DecreaseViewSizeAction, DecreaseViewSizeAction.ID, DecreaseViewSizeAction.LABEL, undefined), 'View: Decrease Current View Size', viewCategory);
