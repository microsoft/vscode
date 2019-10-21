/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BreadcrumbsWidget } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { Emitter, Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationOverrides, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { GroupIdentifier } from 'vs/workbench/common/editor';

export const IBreadcrumbsService = createDecorator<IBreadcrumbsService>('IEditorBreadcrumbsService');

export interface IBreadcrumbsService {

	_serviceBrand: undefined;

	register(group: GroupIdentifier, widget: BreadcrumbsWidget): IDisposable;

	getWidget(group: GroupIdentifier): BreadcrumbsWidget | undefined;
}


export class BreadcrumbsService implements IBreadcrumbsService {

	_serviceBrand: undefined;

	private readonly _map = new Map<number, BreadcrumbsWidget>();

	register(group: number, widget: BreadcrumbsWidget): IDisposable {
		if (this._map.has(group)) {
			throw new Error(`group (${group}) has already a widget`);
		}
		this._map.set(group, widget);
		return {
			dispose: () => this._map.delete(group)
		};
	}

	getWidget(group: number): BreadcrumbsWidget | undefined {
		return this._map.get(group);
	}
}

registerSingleton(IBreadcrumbsService, BreadcrumbsService, true);


//#region config

export abstract class BreadcrumbsConfig<T> {

	abstract get name(): string;
	abstract get onDidChange(): Event<void>;

	abstract getValue(overrides?: IConfigurationOverrides): T;
	abstract updateValue(value: T, overrides?: IConfigurationOverrides): Promise<void>;
	abstract dispose(): void;

	private constructor() {
		// internal
	}

	static readonly IsEnabled = BreadcrumbsConfig._stub<boolean>('breadcrumbs.enabled');
	static readonly UseQuickPick = BreadcrumbsConfig._stub<boolean>('breadcrumbs.useQuickPick');
	static readonly FilePath = BreadcrumbsConfig._stub<'on' | 'off' | 'last'>('breadcrumbs.filePath');
	static readonly SymbolPath = BreadcrumbsConfig._stub<'on' | 'off' | 'last'>('breadcrumbs.symbolPath');
	static readonly SymbolSortOrder = BreadcrumbsConfig._stub<'position' | 'name' | 'type'>('breadcrumbs.symbolSortOrder');
	static readonly Icons = BreadcrumbsConfig._stub<boolean>('breadcrumbs.icons');

	static readonly FileExcludes = BreadcrumbsConfig._stub<glob.IExpression>('files.exclude');

	private static _stub<T>(name: string): { bindTo(service: IConfigurationService): BreadcrumbsConfig<T> } {
		return {
			bindTo(service) {
				let onDidChange = new Emitter<void>();

				let listener = service.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(name)) {
						onDidChange.fire(undefined);
					}
				});

				return new class implements BreadcrumbsConfig<T>{
					readonly name = name;
					readonly onDidChange = onDidChange.event;
					getValue(overrides?: IConfigurationOverrides): T {
						if (overrides) {
							return service.getValue(name, overrides);
						} else {
							return service.getValue(name);
						}
					}
					updateValue(newValue: T, overrides?: IConfigurationOverrides): Promise<void> {
						if (overrides) {
							return service.updateValue(name, newValue, overrides);
						} else {
							return service.updateValue(name, newValue);
						}
					}
					dispose(): void {
						listener.dispose();
						onDidChange.dispose();
					}
				};
			}
		};
	}
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'breadcrumbs',
	title: localize('title', "Breadcrumb Navigation"),
	order: 101,
	type: 'object',
	properties: {
		'breadcrumbs.enabled': {
			description: localize('enabled', "Enable/disable navigation breadcrumbs."),
			type: 'boolean',
			default: true
		},
		// 'breadcrumbs.useQuickPick': {
		// 	description: localize('useQuickPick', "Use quick pick instead of breadcrumb-pickers."),
		// 	type: 'boolean',
		// 	default: false
		// },
		'breadcrumbs.filePath': {
			description: localize('filepath', "Controls whether and how file paths are shown in the breadcrumbs view."),
			type: 'string',
			default: 'on',
			enum: ['on', 'off', 'last'],
			enumDescriptions: [
				localize('filepath.on', "Show the file path in the breadcrumbs view."),
				localize('filepath.off', "Do not show the file path in the breadcrumbs view."),
				localize('filepath.last', "Only show the last element of the file path in the breadcrumbs view."),
			]
		},
		'breadcrumbs.symbolPath': {
			description: localize('symbolpath', "Controls whether and how symbols are shown in the breadcrumbs view."),
			type: 'string',
			default: 'on',
			enum: ['on', 'off', 'last'],
			enumDescriptions: [
				localize('symbolpath.on', "Show all symbols in the breadcrumbs view."),
				localize('symbolpath.off', "Do not show symbols in the breadcrumbs view."),
				localize('symbolpath.last', "Only show the current symbol in the breadcrumbs view."),
			]
		},
		'breadcrumbs.symbolSortOrder': {
			description: localize('symbolSortOrder', "Controls how symbols are sorted in the breadcrumbs outline view."),
			type: 'string',
			default: 'position',
			enum: ['position', 'name', 'type'],
			enumDescriptions: [
				localize('symbolSortOrder.position', "Show symbol outline in file position order."),
				localize('symbolSortOrder.name', "Show symbol outline in alphabetical order."),
				localize('symbolSortOrder.type', "Show symbol outline in symbol type order."),
			]
		},
		'breadcrumbs.icons': {
			description: localize('icons', "Render breadcrumb items with icons."),
			type: 'boolean',
			default: true
		},
		'breadcrumbs.filteredTypes.file': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.file', "When set to `false` breadcrumbs never show `file`-symbols.")
		},
		'breadcrumbs.filteredTypes.module': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.module', "When set to `false` breadcrumbs never show `module`-symbols.")
		},
		'breadcrumbs.filteredTypes.namespace': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.namespace', "When set to `false` breadcrumbs never show `namespace`-symbols.")
		},
		'breadcrumbs.filteredTypes.package': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.package', "When set to `false` breadcrumbs never show `package`-symbols.")
		},
		'breadcrumbs.filteredTypes.class': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.class', "When set to `false` breadcrumbs never show `class`-symbols.")
		},
		'breadcrumbs.filteredTypes.method': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.method', "When set to `false` breadcrumbs never show `method`-symbols.")
		},
		'breadcrumbs.filteredTypes.property': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.property', "When set to `false` breadcrumbs never show `property`-symbols.")
		},
		'breadcrumbs.filteredTypes.field': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.field', "When set to `false` breadcrumbs never show `field`-symbols.")
		},
		'breadcrumbs.filteredTypes.constructor': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constructor', "When set to `false` breadcrumbs never show `constructor`-symbols.")
		},
		'breadcrumbs.filteredTypes.enum': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enum', "When set to `false` breadcrumbs never show `enum`-symbols.")
		},
		'breadcrumbs.filteredTypes.interface': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.interface', "When set to `false` breadcrumbs never show `interface`-symbols.")
		},
		'breadcrumbs.filteredTypes.function': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.function', "When set to `false` breadcrumbs never show `function`-symbols.")
		},
		'breadcrumbs.filteredTypes.variable': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.variable', "When set to `false` breadcrumbs never show `variable`-symbols.")
		},
		'breadcrumbs.filteredTypes.constant': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constant', "When set to `false` breadcrumbs never show `constant`-symbols.")
		},
		'breadcrumbs.filteredTypes.string': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.string', "When set to `false` breadcrumbs never show `string`-symbols.")
		},
		'breadcrumbs.filteredTypes.number': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.number', "When set to `false` breadcrumbs never show `number`-symbols.")
		},
		'breadcrumbs.filteredTypes.boolean': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.boolean', "When set to `false` breadcrumbs never show `boolean`-symbols.")
		},
		'breadcrumbs.filteredTypes.array': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.array', "When set to `false` breadcrumbs never show `array`-symbols.")
		},
		'breadcrumbs.filteredTypes.object': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.object', "When set to `false` breadcrumbs never show `object`-symbols.")
		},
		'breadcrumbs.filteredTypes.key': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.key', "When set to `false` breadcrumbs never show `key`-symbols.")
		},
		'breadcrumbs.filteredTypes.null': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.null', "When set to `false` breadcrumbs never show `null`-symbols.")
		},
		'breadcrumbs.filteredTypes.enumMember': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enumMember', "When set to `false` breadcrumbs never show `enumMember`-symbols.")
		},
		'breadcrumbs.filteredTypes.struct': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.struct', "When set to `false` breadcrumbs never show `struct`-symbols.")
		},
		'breadcrumbs.filteredTypes.event': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.event', "When set to `false` breadcrumbs never show `event`-symbols.")
		},
		'breadcrumbs.filteredTypes.operator': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.operator', "When set to `false` breadcrumbs never show `operator`-symbols.")
		},
		'breadcrumbs.filteredTypes.typeParameter': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.typeParameter', "When set to `false` breadcrumbs never show `typeParameter`-symbols.")
		}
	}
});

//#endregion
