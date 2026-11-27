/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ActiveNamedLayoutContext, DEFAULT_NAMED_LAYOUT_ID, HasNamedLayoutsContext, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING, NamedLayoutsEnabledContext } from './namedLayouts.js';
import { NamedLayoutsService } from './namedLayoutsService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[NAMED_LAYOUTS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('namedLayouts.enabled', "Controls whether the layout of a window can be saved as a named layout, and whether a window can switch between named layouts. A named layout contains the arrangement of the side bars, the panel and the editor groups. Changes made while a named layout is active are saved into that layout.")
		}
	}
});

registerSingleton(INamedLayoutsService, NamedLayoutsService, InstantiationType.Delayed);

/**
 * Creates the named layouts service as the window restored, so that the active named layout saves the changes of the window
 * as it closes, and keeps the context keys of the named layouts up to date.
 */
class NamedLayoutsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.namedLayouts';

	constructor(
		@INamedLayoutsService namedLayoutsService: INamedLayoutsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const activeNamedLayout = ActiveNamedLayoutContext.bindTo(contextKeyService);
		const hasNamedLayouts = HasNamedLayoutsContext.bindTo(contextKeyService);
		const update = () => {
			activeNamedLayout.set(namedLayoutsService.activeLayout.id);
			hasNamedLayouts.set(namedLayoutsService.layouts.length > 1);
		};
		update();
		this._register(Event.any(namedLayoutsService.onDidChangeLayouts, namedLayoutsService.onDidChangeActiveLayout)(update));
	}
}

registerWorkbenchContribution2(NamedLayoutsContribution.ID, NamedLayoutsContribution, WorkbenchPhase.AfterRestored);

const NamedLayoutActiveContext = ContextKeyExpr.and(NamedLayoutsEnabledContext, ActiveNamedLayoutContext.notEqualsTo(DEFAULT_NAMED_LAYOUT_ID));
const NamedLayoutsExistContext = ContextKeyExpr.and(NamedLayoutsEnabledContext, HasNamedLayoutsContext);

interface ILayoutPickItem extends IQuickPickItem {
	readonly layout: INamedLayout;
}

async function pickLayout(quickInputService: IQuickInputService, namedLayoutsService: INamedLayoutsService, layouts: readonly INamedLayout[], placeHolder: string): Promise<INamedLayout | undefined> {
	const activeLayout = namedLayoutsService.activeLayout;
	const items: ILayoutPickItem[] = layouts.map(layout => ({ label: layout.name, description: layout.id === activeLayout.id ? localize('activeLayout', "Active") : undefined, layout }));
	const pick = await quickInputService.pick(items, { placeHolder, activeItem: items.find(item => item.layout.id === activeLayout.id) });

	return pick?.layout;
}

async function inputLayoutName(quickInputService: IQuickInputService, namedLayoutsService: INamedLayoutsService, prompt: string, layout?: INamedLayout): Promise<string | undefined> {
	const validate = (value: string): string | undefined => {
		const name = value.trim();
		if (!name) {
			return localize('layoutNameEmpty', "Provide a name for the layout.");
		}
		if (namedLayoutsService.layouts.some(otherLayout => otherLayout.id !== layout?.id && otherLayout.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
			return localize('layoutNameExists', "A layout with the name {0} already exists.", name);
		}
		return undefined;
	};

	const disposables = new DisposableStore();
	const input = disposables.add(quickInputService.createInputBox());
	input.prompt = prompt;
	input.placeholder = localize('layoutName', "Layout name");
	input.value = layout?.name ?? '';
	input.severity = Severity.Error;
	try {
		return await new Promise<string | undefined>(resolve => {
			disposables.add(input.onDidChangeValue(value => {
				input.validationMessage = validate(value);
			}));
			disposables.add(input.onDidAccept(() => {
				// Another window can have created a layout with the name since it was typed
				input.validationMessage = validate(input.value);
				if (!input.validationMessage) {
					resolve(input.value.trim());
					input.hide();
				}
			}));
			disposables.add(input.onDidHide(() => resolve(undefined)));
			input.show();
		});
	} finally {
		disposables.dispose();
	}
}

/**
 * Announces that a layout that could not be switched to or renamed no longer exists. While named layouts are disabled, it still exists.
 */
function announceIfDeleted(namedLayoutsService: INamedLayoutsService, layout: INamedLayout): void {
	if (!namedLayoutsService.layouts.some(otherLayout => otherLayout.id === layout.id)) {
		status(localize('layoutNoLongerExists', "The layout {0} no longer exists.", layout.name));
	}
}

registerAction2(class extends Action2 {
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

		const layout = await pickLayout(quickInputService, namedLayoutsService, namedLayoutsService.layouts, localize('switchLayoutPlaceholder', "Select the layout to switch to"));
		if (layout && layout.id !== namedLayoutsService.activeLayout.id) {
			if (await namedLayoutsService.switchLayout(layout)) {
				status(localize('switchedLayout', "Switched to layout {0}.", layout.name));
			} else {
				announceIfDeleted(namedLayoutsService, layout);
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.switchToDefaultLayout',
			title: localize2('switchToDefaultLayout', "Switch to Default Layout"),
			category: Categories.View,
			precondition: NamedLayoutActiveContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const defaultLayout = namedLayoutsService.layouts[0];
		if (await namedLayoutsService.switchLayout(defaultLayout)) {
			status(localize('switchedToDefaultLayout', "Switched to layout {0}.", defaultLayout.name));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.newLayout',
			title: localize2('newLayout', "New Layout..."),
			metadata: { description: localize2('newLayout.description', "Creates a named layout from the current layout of the window and makes it the active layout.") },
			category: Categories.View,
			precondition: NamedLayoutsEnabledContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const name = await inputLayoutName(quickInputService, namedLayoutsService, localize('newLayoutPrompt', "Name of the new layout, created from the current layout of the window"));
		if (name) {
			const layout = await namedLayoutsService.createLayout(name);
			if (layout) {
				status(localize('createdLayout', "Created layout {0} and switched to it.", layout.name));
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.saveLayout',
			title: localize2('saveLayout', "Save Layout"),
			metadata: { description: localize2('saveLayout.description', "Saves the changes of the active layout. They are also saved when the window switches to another layout or closes.") },
			category: Categories.View,
			precondition: NamedLayoutActiveContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		if (await namedLayoutsService.saveLayout()) {
			status(localize('savedLayout', "Saved layout {0}.", namedLayoutsService.activeLayout.name));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.renameLayout',
			title: localize2('renameLayout', "Rename Layout..."),
			category: Categories.View,
			precondition: NamedLayoutsExistContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const layout = await pickLayout(quickInputService, namedLayoutsService, namedLayoutsService.layouts.slice(1), localize('renameLayoutPlaceholder', "Select the layout to rename"));
		if (!layout) {
			return;
		}

		const name = await inputLayoutName(quickInputService, namedLayoutsService, localize('renameLayoutPrompt', "New name of the layout {0}", layout.name), layout);
		if (name && name !== layout.name) {
			if (await namedLayoutsService.renameLayout(layout, name)) {
				status(localize('renamedLayout', "Renamed layout {0} to {1}.", layout.name, name));
			} else {
				announceIfDeleted(namedLayoutsService, layout);
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.deleteLayout',
			title: localize2('deleteLayout', "Delete Layout..."),
			category: Categories.View,
			precondition: NamedLayoutsExistContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const dialogService = accessor.get(IDialogService);
		const namedLayoutsService = accessor.get(INamedLayoutsService);

		const layout = await pickLayout(quickInputService, namedLayoutsService, namedLayoutsService.layouts.slice(1), localize('deleteLayoutPlaceholder', "Select the layout to delete"));
		if (!layout) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			message: localize('deleteLayoutConfirmation', "Do you want to delete the layout {0}?", layout.name),
			detail: layout.id === namedLayoutsService.activeLayout.id ? localize('deleteActiveLayoutDetail', "It is the active layout, so the window switches to the default layout.") : undefined,
			primaryButton: localize({ key: 'deleteLayoutButton', comment: ['&& denotes a mnemonic'] }, "&&Delete")
		});
		if (confirmed && await namedLayoutsService.deleteLayout(layout)) {
			status(localize('deletedLayout', "Deleted layout {0}.", layout.name));
		}
	}
});