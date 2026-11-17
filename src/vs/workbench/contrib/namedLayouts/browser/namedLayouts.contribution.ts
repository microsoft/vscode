/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING, NamedLayoutsEnabledContext } from '../../../services/namedLayouts/common/namedLayouts.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ToggleSidebarVisibilityAction } from '../../../browser/actions/layoutActions.js';
import { LayoutDensityMenu } from '../../../browser/actions/layoutDensityActions.js';
import { LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { ToggleAuxiliaryBarAction } from '../../../browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { TogglePanelAction } from '../../../browser/parts/panel/panelActions.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, LayoutModeContext, PanelVisibleContext, SideBarVisibleContext } from '../../../common/contextkeys.js';
import { SIDE_BAR_LOCATION_SETTING } from '../common/namedLayoutDefinition.js';
import { EditorGroupsLayoutParticipant, SharedLayoutStateParticipant, WorkbenchPartsLayoutParticipant } from './namedLayoutParticipants.js';
import { NamedLayoutsExtensionPointContribution } from './namedLayoutsExtensionPoint.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[NAMED_LAYOUTS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('namedLayouts.enabled', "Controls whether the current layout of a window can be saved as a named layout and whether a window can switch between named layouts. A named layout contains the arrangement of the side bars, the panel and the editor groups, the location, visibility and order of view containers and views, and the values of layout related settings such as {0}. Changes made while a named layout is active are saved into that layout, unless the layout is locked.", '`#workbench.editor.showTabs#`')
		}
	}
});

class NamedLayoutParticipantsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.namedLayoutParticipants';

	constructor(
		@INamedLayoutsService namedLayoutsService: INamedLayoutsService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		// Participants are applied in registration order. Editor groups go first because
		// changing them can unmaximize parts, the parts participant restores maximized parts last.
		// The shared layout state goes before the parts participant, so that the active view
		// containers it opens are in their locations
		this._register(namedLayoutsService.registerParticipant(instantiationService.createInstance(EditorGroupsLayoutParticipant)));
		this._register(namedLayoutsService.registerParticipant(instantiationService.createInstance(SharedLayoutStateParticipant)));
		this._register(namedLayoutsService.registerParticipant(instantiationService.createInstance(WorkbenchPartsLayoutParticipant)));
	}
}

registerWorkbenchContribution2(NamedLayoutParticipantsContribution.ID, NamedLayoutParticipantsContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NamedLayoutsExtensionPointContribution.ID, NamedLayoutsExtensionPointContribution, WorkbenchPhase.BlockRestore);

const ActiveNamedLayoutContext = new RawContextKey<string>('activeNamedLayout', DEFAULT_NAMED_LAYOUT_ID, localize('activeNamedLayout', "The identifier of the active layout."));
const ActiveNamedLayoutLockedContext = new RawContextKey<boolean>('activeNamedLayoutLocked', false, localize('activeNamedLayoutLocked', "Whether the active layout is locked."));
const ActiveNamedLayoutLockableContext = new RawContextKey<boolean>('activeNamedLayoutLockable', false, localize('activeNamedLayoutLockable', "Whether the active layout can be locked and unlocked."));
const ActiveNamedLayoutResettableContext = new RawContextKey<boolean>('activeNamedLayoutResettable', false, localize('activeNamedLayoutResettable', "Whether the active layout is contributed by an extension and has changes that can be reset."));
const ActiveNamedLayoutDeletableContext = new RawContextKey<boolean>('activeNamedLayoutDeletable', false, localize('activeNamedLayoutDeletable', "Whether the active layout can be deleted."));
const ActiveNamedLayoutModifiedContext = new RawContextKey<boolean>('activeNamedLayoutModified', false, localize('activeNamedLayoutModified', "Whether the active layout is locked and has changes that can be reverted."));

const NEW_LAYOUT_COMMAND_ID = 'workbench.action.newLayout';
const SWITCH_LAYOUT_COMMAND_ID = 'workbench.action.switchLayout';

const namedLayoutsIcon = registerIcon('named-layouts-icon', Codicon.layout, localize('namedLayoutsIcon', "Icon of the layout control in the title bar while named layouts are enabled."));

/**
 * Groups of the layouts menu. The layouts of each extension follow the other layouts in
 * a group titled with the name of the extension.
 */
const enum NamedLayoutsMenuGroup {
	Layouts = '0_layouts',
	ExtensionLayoutsPrefix = '0_layouts_extension_',
	/** The visibility of the side bars and the panel. */
	Parts = '1_parts',
	State = '1_state',
	Manage = '4_manage'
}

MenuRegistry.appendMenuItems([
	{
		id: MenuId.NamedLayoutsSubmenu,
		item: {
			command: {
				id: ToggleSidebarVisibilityAction.ID,
				title: localize('primarySideBar', "Primary Side Bar"),
				toggled: SideBarVisibleContext,
				precondition: LayoutModeContext.negate()
			},
			group: NamedLayoutsMenuGroup.Parts,
			order: 1,
			when: NamedLayoutsEnabledContext
		}
	}, {
		id: MenuId.NamedLayoutsSubmenu,
		item: {
			command: {
				id: TogglePanelAction.ID,
				title: localize('panel', "Panel"),
				toggled: PanelVisibleContext
			},
			group: NamedLayoutsMenuGroup.Parts,
			order: 2,
			when: NamedLayoutsEnabledContext
		}
	}, {
		id: MenuId.NamedLayoutsSubmenu,
		item: {
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize('secondarySideBar', "Secondary Side Bar"),
				toggled: AuxiliaryBarVisibleContext
			},
			group: NamedLayoutsMenuGroup.Parts,
			order: 3,
			when: NamedLayoutsEnabledContext
		}
	}, {
		id: MenuId.NamedLayoutsSubmenu,
		item: {
			command: {
				id: 'workbench.action.customizeLayout',
				title: localize('customizeLayout', "Customize Layout...")
			},
			group: NamedLayoutsMenuGroup.Manage,
			order: 1,
			when: NamedLayoutsEnabledContext
		}
	}, {
		// Moved here from the Manage menu while named layouts are enabled
		id: MenuId.NamedLayoutsSubmenu,
		item: {
			title: localize('layoutDensity', "Layout Density"),
			submenu: LayoutDensityMenu,
			group: NamedLayoutsMenuGroup.Manage,
			order: 2,
			when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ContextKeyExpr.equals(`config.${LayoutSettings.MODERN_UI}`, true))
		}
	}
]);

/**
 * Whether users can lock and unlock the given layout. The default layout and layouts
 * that their extension locked cannot be locked or unlocked.
 */
function isLockable(layout: INamedLayout): boolean {
	return layout.id !== DEFAULT_NAMED_LAYOUT_ID && !layout.contribution?.locked;
}

/**
 * Whether users can delete the given layout. The default layout and layouts that
 * extensions contribute cannot be deleted.
 */
function isDeletable(layout: INamedLayout): boolean {
	return layout.id !== DEFAULT_NAMED_LAYOUT_ID && !layout.contribution;
}

async function setLayoutLocked(namedLayoutsService: INamedLayoutsService, layout: INamedLayout, locked: boolean): Promise<void> {
	await namedLayoutsService.setLayoutLocked(layout, locked);
	status(locked ? localize('layoutLocked', "Locked layout {0}", layout.name) : localize('layoutUnlocked', "Unlocked layout {0}", layout.name));
}

async function revertLayout(namedLayoutsService: INamedLayoutsService): Promise<void> {
	const layout = namedLayoutsService.activeLayout;
	await namedLayoutsService.revertLayout();
	status(localize('layoutReverted', "Reverted the changes to layout {0}", layout.name));
}

async function confirmAndDeleteLayout(namedLayoutsService: INamedLayoutsService, dialogService: IDialogService, layout: INamedLayout): Promise<void> {
	const { confirmed } = await dialogService.confirm({
		message: localize('deleteLayout.confirm', "Are you sure you want to delete the layout '{0}'?", layout.name),
		detail: layout.id === namedLayoutsService.activeLayout.id ? localize('deleteLayout.confirmActive', "The layout is active in this window. The default layout will be restored.") : undefined,
		primaryButton: localize({ key: 'deleteLayout.delete', comment: ['&& denotes a mnemonic'] }, "&&Delete")
	});
	if (confirmed) {
		await namedLayoutsService.deleteLayout(layout);
	}
}

function getLayoutMenuLabel(layout: INamedLayout): string {
	return layout.locked ? localize('lockedLayoutLabel', "{0} (Locked)", layout.name) : layout.name;
}

/**
 * Contributes the layouts menu: a button in the layout control of the title bar, whose title
 * names the active layout, and an entry per layout in its menu. The entry of the active layout
 * is checked. Also tracks the state of the active layout in context keys, which enable the
 * actions of the active layout in the menu and the Command Palette.
 */
class NamedLayoutsMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.namedLayoutsMenu';

	private readonly layoutControlEntry = this._register(new MutableDisposable());
	private layoutControlTitle: string | undefined;
	private readonly layoutEntries = this._register(new MutableDisposable<DisposableStore>());

	private readonly activeLayout: IContextKey<string>;
	private readonly activeLayoutLocked: IContextKey<boolean>;
	private readonly activeLayoutLockable: IContextKey<boolean>;
	private readonly activeLayoutResettable: IContextKey<boolean>;
	private readonly activeLayoutDeletable: IContextKey<boolean>;
	private readonly activeLayoutModified: IContextKey<boolean>;

	constructor(
		@INamedLayoutsService private readonly namedLayoutsService: INamedLayoutsService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this.activeLayout = ActiveNamedLayoutContext.bindTo(contextKeyService);
		this.activeLayoutLocked = ActiveNamedLayoutLockedContext.bindTo(contextKeyService);
		this.activeLayoutLockable = ActiveNamedLayoutLockableContext.bindTo(contextKeyService);
		this.activeLayoutResettable = ActiveNamedLayoutResettableContext.bindTo(contextKeyService);
		this.activeLayoutDeletable = ActiveNamedLayoutDeletableContext.bindTo(contextKeyService);
		this.activeLayoutModified = ActiveNamedLayoutModifiedContext.bindTo(contextKeyService);

		this.updateActiveLayout();
		this.registerLayoutEntries();
		this._register(namedLayoutsService.onDidChangeActiveLayout(() => this.updateActiveLayout()));
		this._register(namedLayoutsService.onDidChangeActiveLayoutModified(() => this.activeLayoutModified.set(namedLayoutsService.isActiveLayoutModified)));
		this._register(namedLayoutsService.onDidChangeLayouts(() => {
			this.updateActiveLayout();
			this.registerLayoutEntries();
		}));
	}

	private updateActiveLayout(): void {
		const activeLayout = this.namedLayoutsService.activeLayout;
		this.activeLayout.set(activeLayout.id);
		this.activeLayoutLocked.set(!!activeLayout.locked);
		this.activeLayoutLockable.set(isLockable(activeLayout));
		this.activeLayoutResettable.set(!!activeLayout.contribution?.canReset);
		this.activeLayoutDeletable.set(isDeletable(activeLayout));
		this.activeLayoutModified.set(this.namedLayoutsService.isActiveLayoutModified);

		// The title of the button is its hover and accessible name
		const title = activeLayout.locked ? localize('activeLockedLayoutTitle', "Layout: {0} (Locked)", activeLayout.name) : localize('activeLayoutTitle', "Layout: {0}", activeLayout.name);
		if (title !== this.layoutControlTitle) {
			this.layoutControlTitle = title;
			this.layoutControlEntry.value = MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
				submenu: MenuId.NamedLayoutsSubmenu,
				title,
				icon: namedLayoutsIcon,
				group: 'navigation',
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), NamedLayoutsEnabledContext)
			});
		}
	}

	private registerLayoutEntries(): void {
		// The commands of the previous entries must be unregistered before they are registered again
		this.layoutEntries.clear();
		const store = new DisposableStore();
		const extensionGroups = new Map<string, string>();
		this.namedLayoutsService.layouts.forEach((layout, index) => {
			let group: string = NamedLayoutsMenuGroup.Layouts;
			const contribution = layout.contribution;
			if (contribution) {
				let extensionGroup = extensionGroups.get(contribution.extensionId);
				if (!extensionGroup) {
					// Pad the index, groups are sorted by their identifier
					extensionGroup = `${NamedLayoutsMenuGroup.ExtensionLayoutsPrefix}${String(extensionGroups.size).padStart(4, '0')}`;
					extensionGroups.set(contribution.extensionId, extensionGroup);
					store.add(MenuRegistry.appendMenuGroup(MenuId.NamedLayoutsSubmenu, { group: extensionGroup, title: contribution.extensionName }));
				}
				group = extensionGroup;
			}
			store.add(this.registerLayoutEntry(layout, group, index));
		});
		this.layoutEntries.value = store;
	}

	private registerLayoutEntry(layout: INamedLayout, group: string, order: number): IDisposable {
		const namedLayoutsService = this.namedLayoutsService;
		return registerAction2(class SwitchToLayoutAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.switchToLayout.${layout.id}`,
					title: getLayoutMenuLabel(layout),
					metadata: {
						description: localize2('switchToLayout.description', "Switch to the layout {0}", layout.name),
					},
					toggled: ActiveNamedLayoutContext.isEqualTo(layout.id),
					menu: {
						id: MenuId.NamedLayoutsSubmenu,
						group,
						order,
						when: NamedLayoutsEnabledContext
					}
				});
			}

			async run(): Promise<void> {
				await namedLayoutsService.switchLayout(layout);
			}
		});
	}
}

registerWorkbenchContribution2(NamedLayoutsMenuContribution.ID, NamedLayoutsMenuContribution, WorkbenchPhase.BlockRestore);

interface INamedLayoutQuickPickItem extends IQuickPickItem {
	readonly layout: INamedLayout;
}

interface ILayoutSwitcherQuickPickItem extends IQuickPickItem {
	readonly layout?: INamedLayout;
}

function getLayoutAriaLabel(layout: INamedLayout, active: boolean): string | undefined {
	if (active) {
		return layout.locked ? localize('activeLockedLayoutAriaLabel', "{0} (Active, Locked)", layout.name) : localize('activeLayoutAriaLabel', "{0} (Active)", layout.name);
	}
	return layout.locked ? localize('lockedLayoutAriaLabel', "{0} (Locked)", layout.name) : undefined;
}

function toQuickPickItems(layouts: readonly INamedLayout[], activeLayout: INamedLayout): INamedLayoutQuickPickItem[] {
	return layouts.map(layout => {
		const active = layout.id === activeLayout.id;
		return {
			layout,
			label: layout.name,
			// A check mark marks the active layout, the other layouts keep its space so that the labels align
			iconClass: ThemeIcon.asClassName(active ? Codicon.check : Codicon.blank),
			description: layout.locked ? `$(${Codicon.lock.id})` : undefined,
			ariaLabel: getLayoutAriaLabel(layout, active)
		};
	});
}

registerAction2(class NewLayoutAction extends Action2 {
	constructor() {
		super({
			id: NEW_LAYOUT_COMMAND_ID,
			title: localize2('newLayout', "New Layout..."),
			metadata: {
				description: localize2('newLayout.description', "Creates a named layout from the current layout of the window and makes it the active layout."),
			},
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true,
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.Manage,
				order: 3,
				when: NamedLayoutsEnabledContext
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const name = await quickInputService.input({
			title: localize('newLayout.title', "New Layout"),
			placeHolder: localize('newLayout.placeholder', "Name of the Layout"),
			prompt: localize('newLayout.prompt', "The new layout starts as a copy of the current layout. Changes are saved into the active layout."),
			validateInput: async value => {
				const layoutName = value.trim();
				if (!layoutName) {
					return localize('newLayout.emptyName', "Please enter a name for the layout.");
				}
				if (namedLayoutsService.layouts.some(layout => layout.name.toLowerCase() === layoutName.toLowerCase())) {
					return localize('newLayout.duplicateName', "A layout with the name '{0}' already exists.", layoutName);
				}
				return undefined;
			}
		});
		if (name === undefined) {
			return;
		}

		await namedLayoutsService.createLayout(name);
	}
});

registerAction2(class SwitchLayoutAction extends Action2 {
	constructor() {
		super({
			id: SWITCH_LAYOUT_COMMAND_ID,
			title: localize2('switchLayout', "Switch Layout..."),
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		const commandService = accessor.get(ICommandService);

		const disposables = new DisposableStore();
		const picker = disposables.add(quickInputService.createQuickPick<ILayoutSwitcherQuickPickItem>({ useSeparators: true }));
		// There are only a few layouts, so they are not filtered
		picker.hideInput = true;
		picker.ariaLabel = localize('switchLayout.ariaLabel', "Select a layout to switch to");

		const deleteButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.trash), tooltip: localize('deleteLayoutButton', "Delete Layout") };
		const resetButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.history), tooltip: localize('resetLayoutButton', "Reset Layout") };
		// The lock buttons show the current state of the layout, their tooltips name the action
		const lockButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.unlock), tooltip: localize('lockLayoutButton', "Lock Layout") };
		const unlockButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.lock), tooltip: localize('unlockLayoutButton', "Unlock Layout") };
		const revertButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.discard), tooltip: localize('revertLayoutButton', "Revert Layout Changes") };
		const newLayoutItem: ILayoutSwitcherQuickPickItem = { label: localize('newLayoutItem', "New Layout..."), iconClass: ThemeIcon.asClassName(Codicon.blank) };
		const getButtons = (layout: INamedLayout): IQuickInputButton[] => {
			const buttons: IQuickInputButton[] = [];
			if (layout.locked && layout.id === namedLayoutsService.activeLayout.id && namedLayoutsService.isActiveLayoutModified) {
				buttons.push(revertButton);
			}
			if (isLockable(layout)) {
				buttons.push(layout.locked ? unlockButton : lockButton);
			}
			if (layout.contribution?.canReset) {
				buttons.push(resetButton);
			} else if (layout.id !== DEFAULT_NAMED_LAYOUT_ID && !layout.contribution) {
				buttons.push(deleteButton);
			}
			return buttons;
		};
		const updateItems = () => {
			const layoutItems = toQuickPickItems(namedLayoutsService.layouts, namedLayoutsService.activeLayout)
				.map(item => ({ ...item, buttons: getButtons(item.layout) }));

			// Layouts contributed by extensions are grouped by extension
			const items: (ILayoutSwitcherQuickPickItem | IQuickPickSeparator)[] = [];
			let extensionId: string | undefined;
			for (const item of layoutItems) {
				const contribution = item.layout.contribution;
				if (contribution && contribution.extensionId !== extensionId) {
					extensionId = contribution.extensionId;
					items.push({ type: 'separator', label: contribution.extensionName });
				}
				items.push(item);
			}

			picker.items = [...items, { type: 'separator' }, newLayoutItem];
			picker.activeItems = layoutItems.filter(item => item.layout.id === namedLayoutsService.activeLayout.id);
		};
		updateItems();
		disposables.add(namedLayoutsService.onDidChangeLayouts(() => updateItems()));
		disposables.add(namedLayoutsService.onDidChangeActiveLayout(() => updateItems()));
		disposables.add(namedLayoutsService.onDidChangeActiveLayoutModified(() => updateItems()));
		disposables.add(picker.onDidTriggerItemButton(({ item, button }) => {
			if (!item.layout) {
				return;
			}
			let result: Promise<void>;
			if (button === revertButton) {
				result = revertLayout(namedLayoutsService);
			} else if (button === lockButton || button === unlockButton) {
				result = setLayoutLocked(namedLayoutsService, item.layout, button === lockButton);
			} else if (button === resetButton) {
				result = namedLayoutsService.resetLayout(item.layout);
			} else {
				result = namedLayoutsService.deleteLayout(item.layout);
			}
			result.catch(onUnexpectedError);
		}));

		const pick = await new Promise<ILayoutSwitcherQuickPickItem | undefined>(resolve => {
			disposables.add(picker.onDidAccept(() => {
				resolve(picker.selectedItems[0]);
				picker.hide();
			}));
			disposables.add(picker.onDidHide(() => resolve(undefined)));
			picker.show();
		});
		disposables.dispose();

		if (pick === newLayoutItem) {
			await commandService.executeCommand(NEW_LAYOUT_COMMAND_ID);
		} else if (pick?.layout) {
			await namedLayoutsService.switchLayout(pick.layout);
		}
	}
});

registerAction2(class DeleteLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.deleteLayout',
			title: localize2('deleteLayout', "Delete Layout..."),
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		const dialogService = accessor.get(IDialogService);
		const notificationService = accessor.get(INotificationService);

		const namedLayouts = namedLayoutsService.layouts.filter(layout => layout.id !== DEFAULT_NAMED_LAYOUT_ID && !layout.contribution);
		if (!namedLayouts.length) {
			notificationService.info(localize('deleteLayout.noLayouts', "There are no named layouts to delete."));
			return;
		}

		const pick = await quickInputService.pick(toQuickPickItems(namedLayouts, namedLayoutsService.activeLayout), {
			placeHolder: localize('deleteLayout.placeholder', "Select a layout to delete")
		});
		if (pick) {
			await confirmAndDeleteLayout(namedLayoutsService, dialogService, pick.layout);
		}
	}
});

registerAction2(class ResetLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetLayout',
			title: localize2('resetLayout', "Reset Layout..."),
			metadata: {
				description: localize2('resetLayout.description', "Discards the changes made to a layout contributed by an extension."),
			},
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		const notificationService = accessor.get(INotificationService);

		const resettableLayouts = namedLayoutsService.layouts.filter(layout => layout.contribution?.canReset);
		if (!resettableLayouts.length) {
			notificationService.info(localize('resetLayout.noLayouts', "There are no changed layouts of extensions to reset."));
			return;
		}

		const pick = await quickInputService.pick(toQuickPickItems(resettableLayouts, namedLayoutsService.activeLayout).map(item => ({ ...item, description: item.layout.contribution?.extensionName })), {
			placeHolder: localize('resetLayout.placeholder', "Select a layout to reset")
		});
		if (pick) {
			await namedLayoutsService.resetLayout(pick.layout);
		}
	}
});

registerAction2(class LockLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.lockLayout',
			title: localize2('lockLayout', "Lock Layout"),
			metadata: {
				description: localize2('lockLayout.description', "Locks the active layout. Changes made to a locked layout are not saved and can be reverted."),
			},
			category: Categories.View,
			precondition: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockableContext, ActiveNamedLayoutLockedContext.negate()),
			f1: true,
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.State,
				order: 1,
				when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockableContext, ActiveNamedLayoutLockedContext.negate())
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		await setLayoutLocked(namedLayoutsService, namedLayoutsService.activeLayout, true);
	}
});

registerAction2(class UnlockLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.unlockLayout',
			title: localize2('unlockLayout', "Unlock Layout"),
			metadata: {
				description: localize2('unlockLayout.description', "Unlocks the active layout. The changes made while it was locked are saved into the layout."),
			},
			category: Categories.View,
			precondition: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockableContext, ActiveNamedLayoutLockedContext),
			f1: true,
			// Hidden for a layout that its extension locked, its label already says it is locked
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.State,
				order: 1,
				when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockableContext, ActiveNamedLayoutLockedContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		await setLayoutLocked(namedLayoutsService, namedLayoutsService.activeLayout, false);
	}
});

registerAction2(class ResetActiveLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetActiveLayout',
			title: localize2('resetActiveLayout', "Reset Layout"),
			metadata: {
				description: localize2('resetActiveLayout.description', "Discards the changes made to the active layout contributed by an extension."),
			},
			precondition: ActiveNamedLayoutResettableContext,
			// Discards saved changes, so it comes last
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.Manage,
				order: 4,
				when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutResettableContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		const activeLayout = namedLayoutsService.activeLayout;
		await namedLayoutsService.resetLayout(activeLayout);
		status(localize('layoutReset', "Reset layout {0}", activeLayout.name));
	}
});

registerAction2(class DeleteActiveLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.deleteActiveLayout',
			title: localize2('deleteActiveLayout', "Delete Layout..."),
			metadata: {
				description: localize2('deleteActiveLayout.description', "Deletes the active layout after confirmation and restores the default layout."),
			},
			precondition: ActiveNamedLayoutDeletableContext,
			// Destructive, so it comes last
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.Manage,
				order: 5,
				when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutDeletableContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		await confirmAndDeleteLayout(namedLayoutsService, accessor.get(IDialogService), namedLayoutsService.activeLayout);
	}
});

registerAction2(class RevertLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.revertLayout',
			title: localize2('revertLayout', "Revert Layout Changes"),
			metadata: {
				description: localize2('revertLayout.description', "Discards the changes made to the active locked layout."),
			},
			category: Categories.View,
			precondition: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockedContext, ActiveNamedLayoutModifiedContext),
			f1: true,
			menu: {
				id: MenuId.NamedLayoutsSubmenu,
				group: NamedLayoutsMenuGroup.State,
				order: 2,
				when: ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutLockedContext, ActiveNamedLayoutModifiedContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await revertLayout(accessor.get(INamedLayoutsService));
	}
});

function toLayoutContributionId(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
}

registerAction2(class ExportLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.exportLayoutAsContribution',
			title: localize2('exportLayout', "Export Layout as Contribution"),
			metadata: {
				description: localize2('exportLayout.description', "Opens the current layout of the window in the format that extensions use to contribute layouts."),
			},
			category: Categories.Developer,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);
		const editorService = accessor.get(IEditorService);

		const { settings, sideBar, ...definition } = namedLayoutsService.captureDefinition();

		// The side bar position is a setting, contributions describe it as part of the side bar
		const { [SIDE_BAR_LOCATION_SETTING]: sideBarLocation, ...otherSettings } = settings ?? {};
		const sideBarPosition = sideBarLocation === 'left' || sideBarLocation === 'right' ? sideBarLocation : undefined;

		const activeLayout = namedLayoutsService.activeLayout;
		const layout = {
			id: toLayoutContributionId(activeLayout.name),
			label: activeLayout.name,
			...(Object.keys(otherSettings).length ? { settings: otherSettings } : {}),
			...(sideBar || sideBarPosition ? { sideBar: { ...(sideBarPosition ? { position: sideBarPosition } : {}), ...sideBar } } : {}),
			...definition
		};

		const contents = [
			`// ${localize('exportLayout.usage', "Add the following to the package.json of an extension to contribute the layout.")}`,
			`// ${localize('exportLayout.limitations', "Views moved into other view containers, the sizes of views and whether views are collapsed cannot be contributed.")}`,
			JSON.stringify({ enabledApiProposals: ['windowLayouts'], contributes: { layouts: [layout] } }, undefined, '\t')
		].join('\n');

		await editorService.openEditor({ resource: undefined, contents, languageId: 'jsonc', options: { pinned: true } });
	}
});
