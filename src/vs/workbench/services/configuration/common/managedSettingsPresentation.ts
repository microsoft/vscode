/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { Extensions, IConfigurationRegistry, ManagedSettingsPresentationValue } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IManagedSettingsService } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const IManagedSettingsPresentationService = createDecorator<IManagedSettingsPresentationService>('managedSettingsPresentationService');

/** Presentation-only restrictions; does not replace runtime policy enforcement. */
export interface IManagedSettingsPresentationService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<ReadonlySet<string>>;
	getValue(setting: string): ManagedSettingsPresentationValue | undefined;
}

export class ManagedSettingsPresentationService extends Disposable implements IManagedSettingsPresentationService {
	declare readonly _serviceBrand: undefined;

	private readonly registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	private values = new Map<string, ManagedSettingsPresentationValue>();
	private readonly _onDidChange = this._register(new Emitter<ReadonlySet<string>>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IManagedSettingsService private readonly managedSettingsService: IManagedSettingsService,
	) {
		super();
		this.update();
		this._register(managedSettingsService.onDidChangeManagedSettings(() => this.update()));
		this._register(this.registry.onDidUpdateConfiguration(() => this.update()));
	}

	getValue(setting: string): ManagedSettingsPresentationValue | undefined {
		return this.registry.getConfigurationProperties()[setting]?.managedSettingsPresentation?.(key => this.managedSettingsService.getManagedSettingValue(key));
	}

	private update(): void {
		const values = new Map<string, ManagedSettingsPresentationValue>();
		const changed = new Set<string>();
		for (const [key, property] of Object.entries(this.registry.getConfigurationProperties())) {
			if (!property.managedSettingsPresentation) {
				continue;
			}
			const value = this.getValue(key);
			if (value !== undefined) {
				values.set(key, value);
			}
			if (!equals(value, this.values.get(key))) {
				changed.add(key);
			}
		}
		for (const key of this.values.keys()) {
			if (!values.has(key)) {
				changed.add(key);
			}
		}
		this.values = values;
		if (changed.size) {
			this._onDidChange.fire(changed);
		}
	}
}

registerSingleton(IManagedSettingsPresentationService, ManagedSettingsPresentationService, InstantiationType.Delayed);
