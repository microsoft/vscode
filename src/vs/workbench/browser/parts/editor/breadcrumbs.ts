/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { BreadcrumbsWidget } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Emitter, Event } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';

export const IBreadcrumbsService = createDecorator<IBreadcrumbsService>('IEditorBreadcrumbsService');

export interface IBreadcrumbsService {

	_serviceBrand: any;

	register(group: GroupIdentifier, widget: BreadcrumbsWidget): IDisposable;

	getWidget(group: GroupIdentifier): BreadcrumbsWidget;
}


export class BreadcrumbsService implements IBreadcrumbsService {

	_serviceBrand: any;

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

	getWidget(group: number): BreadcrumbsWidget {
		return this._map.get(group);
	}
}

registerSingleton(IBreadcrumbsService, BreadcrumbsService);


//#region config

export abstract class BreadcrumbsConfig<T> {

	name: string;
	value: T;
	onDidChange: Event<T>;
	abstract dispose(): void;

	private constructor() {
		// internal
	}

	static IsEnabled = BreadcrumbsConfig._stub<boolean>('breadcrumbs.enabled');
	static UseQuickPick = BreadcrumbsConfig._stub<boolean>('breadcrumbs.useQuickPick');
	static FilePath = BreadcrumbsConfig._stub<'on' | 'off' | 'last'>('breadcrumbs.filePath');
	static SymbolPath = BreadcrumbsConfig._stub<'on' | 'off' | 'last'>('breadcrumbs.symbolPath');

	private static _stub<T>(name: string): { bindTo(service: IConfigurationService): BreadcrumbsConfig<T> } {
		return {
			bindTo(service) {
				let value: T = service.getValue(name);
				let onDidChange = new Emitter<T>();

				let listener = service.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(name)) {
						value = service.getValue(name);
						onDidChange.fire(value);
					}
				});

				return {
					name,
					get value() {
						return value;
					},
					set value(newValue: T) {
						service.updateValue(name, newValue);
						value = newValue;
					},
					onDidChange: onDidChange.event,
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
			description: localize('enabled', "Enable/disable navigation breadcrumbs"),
			type: 'boolean',
			default: false
		},
		// 'breadcrumbs.useQuickPick': {
		// 	description: localize('useQuickPick', "Use quick pick instead of breadcrumb-pickers."),
		// 	type: 'boolean',
		// 	default: false
		// },
		'breadcrumbs.filePath': {
			description: localize('filepath', "Controls if and how file paths are shown in the breadcrumbs view."),
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
			description: localize('symbolpath', "Controls if and how symbols are shown in the breadcrumbs view."),
			type: 'string',
			default: 'on',
			enum: ['on', 'off', 'last'],
			enumDescriptions: [
				localize('symbolpath.on', "Show all symbols in the breadcrumbs view."),
				localize('symbolpath.off', "Do not show symbols in the breadcrumbs view."),
				localize('symbolpath.last', "Only show the current symbol in the breadcrumbs view."),
			]
		},
	}
});

//#endregion
