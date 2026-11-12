/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../../services/namedLayouts/common/namedLayouts.js';
import { EditorGroupsLayoutParticipant, WorkbenchPartsLayoutParticipant } from './namedLayoutParticipants.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[NAMED_LAYOUTS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('namedLayouts.enabled', "Controls whether the current layout of a window can be saved as a named layout and whether a window can switch between named layouts. A named layout contains the arrangement of the side bars, the panel and the editor groups and the values of layout related settings such as {0}. Changes made while a named layout is active are saved into that layout.", '`#workbench.editor.showTabs#`')
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
		// changing them can unmaximize parts, the parts participant restores maximized parts last
		this._register(namedLayoutsService.registerParticipant(instantiationService.createInstance(EditorGroupsLayoutParticipant)));
		this._register(namedLayoutsService.registerParticipant(instantiationService.createInstance(WorkbenchPartsLayoutParticipant)));
	}
}

registerWorkbenchContribution2(NamedLayoutParticipantsContribution.ID, NamedLayoutParticipantsContribution, WorkbenchPhase.BlockRestore);

const NamedLayoutsEnabledContext = ContextKeyExpr.equals(`config.${NAMED_LAYOUTS_ENABLED_SETTING}`, true);

interface INamedLayoutQuickPickItem extends IQuickPickItem {
	readonly layout: INamedLayout;
}

function toQuickPickItems(layouts: readonly INamedLayout[], activeLayout: INamedLayout): INamedLayoutQuickPickItem[] {
	return layouts.map(layout => ({
		layout,
		label: layout.name,
		description: layout.id === activeLayout.id ? localize('activeLayout', "Active") : undefined
	}));
}

registerAction2(class SaveLayoutAsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.saveLayoutAs',
			title: localize2('saveLayoutAs', "Save Layout As..."),
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const name = await quickInputService.input({
			title: localize('saveLayoutAs.title', "Save Layout As"),
			placeHolder: localize('saveLayoutAs.placeholder', "Name of the Layout"),
			validateInput: async value => {
				const layoutName = value.trim();
				if (!layoutName) {
					return localize('saveLayoutAs.emptyName', "Please enter a name for the layout.");
				}
				if (namedLayoutsService.layouts.some(layout => layout.name.toLowerCase() === layoutName.toLowerCase())) {
					return localize('saveLayoutAs.duplicateName', "A layout with the name '{0}' already exists.", layoutName);
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
			id: 'workbench.action.switchLayout',
			title: localize2('switchLayout', "Switch Layout..."),
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const pick = await quickInputService.pick(toQuickPickItems(namedLayoutsService.layouts, namedLayoutsService.activeLayout), {
			placeHolder: localize('switchLayout.placeholder', "Select a layout to switch to")
		});
		if (!pick) {
			return;
		}

		await namedLayoutsService.switchLayout(pick.layout);
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

		const namedLayouts = namedLayoutsService.layouts.filter(layout => layout.id !== DEFAULT_NAMED_LAYOUT_ID);
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
