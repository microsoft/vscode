/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../../services/namedLayouts/common/namedLayouts.js';
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
			markdownDescription: localize('namedLayouts.enabled', "Controls whether the current layout of a window can be saved as a named layout and whether a window can switch between named layouts. A named layout contains the arrangement of the side bars, the panel and the editor groups, the location, visibility and order of view containers and views, and the values of layout related settings such as {0}. Changes made while a named layout is active are saved into that layout.", '`#workbench.editor.showTabs#`')
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

const NamedLayoutsEnabledContext = ContextKeyExpr.equals(`config.${NAMED_LAYOUTS_ENABLED_SETTING}`, true);

const NEW_LAYOUT_COMMAND_ID = 'workbench.action.newLayout';
const SWITCH_LAYOUT_COMMAND_ID = 'workbench.action.switchLayout';

/**
 * Contributes the layout switcher of the activity bar. Its title names the active layout,
 * and selecting it opens the picker of {@link SWITCH_LAYOUT_COMMAND_ID}.
 */
class NamedLayoutsSwitcherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.namedLayoutsSwitcher';

	private readonly switcherEntry = this._register(new MutableDisposable());
	private activeLayoutName: string | undefined;

	constructor(
		@INamedLayoutsService private readonly namedLayoutsService: INamedLayoutsService
	) {
		super();

		this.registerSwitcherEntry();
		this._register(namedLayoutsService.onDidChangeActiveLayout(() => this.registerSwitcherEntry()));

		// The name of the active layout changes when the extension that contributes it is updated
		this._register(namedLayoutsService.onDidChangeLayouts(() => {
			if (this.activeLayoutName !== namedLayoutsService.activeLayout.name) {
				this.registerSwitcherEntry();
			}
		}));
	}

	private registerSwitcherEntry(): void {
		this.activeLayoutName = this.namedLayoutsService.activeLayout.name;
		this.switcherEntry.value = MenuRegistry.appendMenuItem(MenuId.NamedLayoutsActivity, {
			command: {
				id: SWITCH_LAYOUT_COMMAND_ID,
				title: localize('activeLayoutTitle', "Layout: {0}", this.activeLayoutName)
			},
			when: NamedLayoutsEnabledContext
		});
	}
}

registerWorkbenchContribution2(NamedLayoutsSwitcherContribution.ID, NamedLayoutsSwitcherContribution, WorkbenchPhase.BlockRestore);

interface INamedLayoutQuickPickItem extends IQuickPickItem {
	readonly layout: INamedLayout;
}

interface ILayoutSwitcherQuickPickItem extends IQuickPickItem {
	readonly layout?: INamedLayout;
}

function toQuickPickItems(layouts: readonly INamedLayout[], activeLayout: INamedLayout): INamedLayoutQuickPickItem[] {
	return layouts.map(layout => {
		const active = layout.id === activeLayout.id;
		return {
			layout,
			label: layout.name,
			// A check mark marks the active layout, the other layouts keep its space so that the labels align
			iconClass: ThemeIcon.asClassName(active ? Codicon.check : Codicon.blank),
			ariaLabel: active ? localize('activeLayoutAriaLabel', "{0} (Active)", layout.name) : undefined
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
			f1: true
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
		const resetButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.discard), tooltip: localize('resetLayoutButton', "Reset Layout") };
		const newLayoutItem: ILayoutSwitcherQuickPickItem = { label: localize('newLayoutItem', "New Layout..."), iconClass: ThemeIcon.asClassName(Codicon.blank) };
		const updateItems = () => {
			const layoutItems = toQuickPickItems(namedLayoutsService.layouts, namedLayoutsService.activeLayout)
				.map(item => {
					if (item.layout.id === DEFAULT_NAMED_LAYOUT_ID) {
						return item;
					}
					if (item.layout.contribution) {
						return item.layout.contribution.canReset ? { ...item, buttons: [resetButton] } : item;
					}
					return { ...item, buttons: [deleteButton] };
				});

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
		disposables.add(picker.onDidTriggerItemButton(({ item, button }) => {
			if (!item.layout) {
				return;
			}
			if (button === resetButton) {
				namedLayoutsService.resetLayout(item.layout).catch(onUnexpectedError);
			} else {
				namedLayoutsService.deleteLayout(item.layout).catch(onUnexpectedError);
			}
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
		if (!pick) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			message: localize('deleteLayout.confirm', "Are you sure you want to delete the layout '{0}'?", pick.layout.name),
			detail: pick.layout.id === namedLayoutsService.activeLayout.id ? localize('deleteLayout.confirmActive', "The layout is active in this window. The default layout will be restored.") : undefined,
			primaryButton: localize({ key: 'deleteLayout.delete', comment: ['&& denotes a mnemonic'] }, "&&Delete")
		});
		if (!confirmed) {
			return;
		}

		await namedLayoutsService.deleteLayout(pick.layout);
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
