/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { IConfigurationOverrides, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

export abstract class StickyScrollConfig<T> {

	abstract get name(): string;
	abstract get onDidChange(): Event<void>;

	abstract getValue(overrides?: IConfigurationOverrides): T;
	abstract updateValue(value: T, overrides?: IConfigurationOverrides): Promise<void>;
	abstract dispose(): void;

	private constructor() { }

	static readonly IsEnabled = StickyScrollConfig._stub<boolean>('editor.experimental.stickyScroll.enabled');

	private static _stub<T>(name: string): { bindTo(service: IConfigurationService): StickyScrollConfig<T> } {
		return {
			bindTo(service) {
				const onDidChange = new Emitter<void>();

				const listener = service.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(name)) {
						onDidChange.fire(undefined);
					}
				});

				return new class implements StickyScrollConfig<T>{
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
	id: 'stickyScroll',
	title: localize('title', "Sticky Scroll"),
	order: 101,
	type: 'object',
	properties: {
		'editor.experimental.stickyScroll.enabled': {
			description: localize('editor.experimental.stickyScroll', "Shows the nested current scopes during the scroll at the top of the editor."),
			type: 'boolean',
			default: false
		},
		'editor.experimental.stickyScroll.maxLineCount': {
			description: localize('editor.experimental.stickyScroll.maxLineCount', "Defines the maximum number of sticky lines to show."),
			type: 'number',
			default: 5,
			minimum: 1,
			maximum: 10
		}
	}
});
