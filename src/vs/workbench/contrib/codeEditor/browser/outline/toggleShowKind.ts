/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { OutlinePane } from 'vs/workbench/contrib/outline/browser/outlinePane';
import { OutlineConfigKeys } from 'vs/workbench/services/outline/browser/outline';

const OutlineShowKindMenu = new MenuId('OutlineShowKind');

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	title: localize('show', "Show"),
	submenu: OutlineShowKindMenu,
	group: 'config',
	order: 3,
	when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
});

class ToggleShowFiles extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showFiles,
			title: localize('files', "Files"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showFiles', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 1,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showFiles);
		return configurationService.updateValue(OutlineConfigKeys.showFiles, !show);
	}
}

class ToggleShowModules extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showModules,
			title: localize('modules', "Modules"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showModules', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 2,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showModules);
		return configurationService.updateValue(OutlineConfigKeys.showModules, !show);
	}
}

class ToggleShowNamespaces extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showNamespaces,
			title: localize('namespaces', "Namespaces"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showNamespaces', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 3,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showNamespaces);
		return configurationService.updateValue(OutlineConfigKeys.showNamespaces, !show);
	}
}

class ToggleShowPackages extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showPackages,
			title: localize('packages', "Packages"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showPackages', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 4,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showPackages);
		return configurationService.updateValue(OutlineConfigKeys.showPackages, !show);
	}
}

class ToggleShowClasses extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showClasses,
			title: localize('classes', "Classes"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showClasses', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 5,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showClasses);
		return configurationService.updateValue(OutlineConfigKeys.showClasses, !show);
	}
}

class ToggleShowMethods extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showMethods,
			title: localize('methods', "Methods"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showMethods', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 6,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showMethods);
		return configurationService.updateValue(OutlineConfigKeys.showMethods, !show);
	}
}

class ToggleShowProperties extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showProperties,
			title: localize('properties', "Properties"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showProperties', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 7,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showProperties);
		return configurationService.updateValue(OutlineConfigKeys.showProperties, !show);
	}
}

class ToggleShowFields extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showFields,
			title: localize('fields', "Fields"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showFields', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 8,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showFields);
		return configurationService.updateValue(OutlineConfigKeys.showFields, !show);
	}
}

class ToggleShowConstructors extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showConstructors,
			title: localize('constructors', "Constructors"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showConstructors', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 9,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showConstructors);
		return configurationService.updateValue(OutlineConfigKeys.showConstructors, !show);
	}
}

class ToggleShowEnums extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showEnums,
			title: localize('enums', "Enums"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showEnums', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 10,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showEnums);
		return configurationService.updateValue(OutlineConfigKeys.showEnums, !show);
	}
}

class ToggleShowInterfaces extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showInterfaces,
			title: localize('interfaces', "Interfaces"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showInterfaces', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 11,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showInterfaces);
		return configurationService.updateValue(OutlineConfigKeys.showInterfaces, !show);
	}
}

class ToggleShowFunctions extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showFunctions,
			title: localize('functions', "Functions"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showFunctions', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 12,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showFunctions);
		return configurationService.updateValue(OutlineConfigKeys.showFunctions, !show);
	}
}

class ToggleShowVariables extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showVariables,
			title: localize('variables', "Variables"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showVariables', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 13,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showVariables);
		return configurationService.updateValue(OutlineConfigKeys.showVariables, !show);
	}
}

class ToggleShowConstants extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showConstants,
			title: localize('constants', "Constants"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showConstants', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 14,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showConstants);
		return configurationService.updateValue(OutlineConfigKeys.showConstants, !show);
	}
}

class ToggleShowStrings extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showStrings,
			title: localize('strings', "Strings"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showStrings', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 15,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showStrings);
		return configurationService.updateValue(OutlineConfigKeys.showStrings, !show);
	}
}

class ToggleShowNumbers extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showNumbers,
			title: localize('numbers', "Numbers"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showNumbers', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 16,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showNumbers);
		return configurationService.updateValue(OutlineConfigKeys.showNumbers, !show);
	}
}

class ToggleShowBooleans extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showBooleans,
			title: localize('booleans', "Booleans"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showBooleans', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 17,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showBooleans);
		return configurationService.updateValue(OutlineConfigKeys.showBooleans, !show);
	}
}

class ToggleShowArrays extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showArrays,
			title: localize('arrays', "Arrays"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showArrays', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 18,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showArrays);
		return configurationService.updateValue(OutlineConfigKeys.showArrays, !show);
	}
}

class ToggleShowObjects extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showObjects,
			title: localize('objects', "Objects"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showObjects', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 19,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showObjects);
		return configurationService.updateValue(OutlineConfigKeys.showObjects, !show);
	}
}

class ToggleShowKeys extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showKeys,
			title: localize('keys', "Keys"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showKeys', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 20,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showKeys);
		return configurationService.updateValue(OutlineConfigKeys.showKeys, !show);
	}
}

class ToggleShowNull extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showNull,
			title: localize('null', "Null"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showNull', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 21,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showNull);
		return configurationService.updateValue(OutlineConfigKeys.showNull, !show);
	}
}

class ToggleShowEnumMembers extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showEnumMembers,
			title: localize('enumMembers', "Enum Members"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showEnumMembers', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 22,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showEnumMembers);
		return configurationService.updateValue(OutlineConfigKeys.showEnumMembers, !show);
	}
}

class ToggleShowStructs extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showStructs,
			title: localize('structs', "Structs"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showStructs', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 23,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showStructs);
		return configurationService.updateValue(OutlineConfigKeys.showStructs, !show);
	}
}

class ToggleShowEvents extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showEvents,
			title: localize('events', "Events"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showEvents', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 24,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showEvents);
		return configurationService.updateValue(OutlineConfigKeys.showEvents, !show);
	}
}

class ToggleShowOperators extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showOperators,
			title: localize('operators', "Operators"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showOperators', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 25,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showOperators);
		return configurationService.updateValue(OutlineConfigKeys.showOperators, !show);
	}
}

class ToggleShowTypeParameters extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: OutlineConfigKeys.showTypeParameters,
			title: localize('typeParameters', "Type Parameters"),
			f1: false,
			toggled: ContextKeyExpr.equals('config.outline.showTypeParameters', true),
			menu: {
				id: OutlineShowKindMenu,
				group: 'filter',
				order: 26,
				when: ContextKeyEqualsExpr.create('view', OutlinePane.Id)
			}
		});
	}

	runInView(accessor: ServicesAccessor, _view: OutlinePane) {
		const configurationService = accessor.get(IConfigurationService);

		const show = configurationService.getValue<boolean>(OutlineConfigKeys.showTypeParameters);
		return configurationService.updateValue(OutlineConfigKeys.showTypeParameters, !show);
	}
}

// --- Actions Registration

registerAction2(ToggleShowFiles);
registerAction2(ToggleShowModules);
registerAction2(ToggleShowNamespaces);
registerAction2(ToggleShowPackages);
registerAction2(ToggleShowClasses);
registerAction2(ToggleShowMethods);
registerAction2(ToggleShowProperties);
registerAction2(ToggleShowFields);
registerAction2(ToggleShowConstructors);
registerAction2(ToggleShowEnums);
registerAction2(ToggleShowInterfaces);
registerAction2(ToggleShowFunctions);
registerAction2(ToggleShowVariables);
registerAction2(ToggleShowConstants);
registerAction2(ToggleShowStrings);
registerAction2(ToggleShowNumbers);
registerAction2(ToggleShowBooleans);
registerAction2(ToggleShowArrays);
registerAction2(ToggleShowObjects);
registerAction2(ToggleShowKeys);
registerAction2(ToggleShowNull);
registerAction2(ToggleShowEnumMembers);
registerAction2(ToggleShowStructs);
registerAction2(ToggleShowEvents);
registerAction2(ToggleShowOperators);
registerAction2(ToggleShowTypeParameters);
