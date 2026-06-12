/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../base/common/async.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IManagedSettingPolicyDefinition, ManagedSettingsData } from '../../../base/common/policy.js';
import { ILogService } from '../../log/common/log.js';
import { ICopilotManagedSettingsService } from '../common/copilotManagedSettings.js';
import { PolicyDefinition, PolicyValue } from '../common/policy.js';
import type { Watcher } from '@vscode/policy-watcher';

export interface ICopilotPolicyWatcherOptions {
	readonly registryPath?: string;
}

export type CopilotPolicyWatcherFactory = (
	productName: string,
	policies: Record<string, { type: 'string' | 'number' | 'boolean' }>,
	onDidChange: (update: Record<string, PolicyValue | undefined>) => void,
	options?: ICopilotPolicyWatcherOptions,
) => Watcher;

export class CopilotManagedSettingsService extends Disposable implements ICopilotManagedSettingsService {

	readonly _serviceBrand: undefined;

	private readonly throttler = this._register(new Throttler());
	private readonly watcher = this._register(new MutableDisposable<Watcher>());
	private readonly managedSettingsValues = new Map<string, PolicyValue>();
	private watchedSettings: Record<string, IManagedSettingPolicyDefinition> = {};

	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	readonly onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;

	get managedSettings(): ManagedSettingsData {
		return Object.fromEntries(this.managedSettingsValues);
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		private readonly productName: string,
		private readonly watcherOptions?: ICopilotPolicyWatcherOptions,
		private readonly watcherFactory?: CopilotPolicyWatcherFactory,
	) {
		super();
	}

	async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData> {
		const managedSettings: Record<string, IManagedSettingPolicyDefinition> = {};
		for (const policyName in policyDefinitions) {
			const policyManagedSettings = policyDefinitions[policyName].managedSettings;
			if (policyManagedSettings) {
				for (const key in policyManagedSettings) {
					managedSettings[key] = policyManagedSettings[key];
				}
			}
		}

		if (areManagedSettingDefinitionsEqual(this.watchedSettings, managedSettings)) {
			return this.managedSettings;
		}

		this.watchedSettings = managedSettings;
		const changed = this.pruneManagedSettingsValues();
		await this.updateWatcher();
		if (changed) {
			this._onDidChangeManagedSettings.fire(this.managedSettings);
		}
		return this.managedSettings;
	}

	private pruneManagedSettingsValues(): boolean {
		let changed = false;
		for (const key of this.managedSettingsValues.keys()) {
			if (!this.watchedSettings[key]) {
				this.managedSettingsValues.delete(key);
				changed = true;
			}
		}
		return changed;
	}

	private async updateWatcher(): Promise<void> {
		const managedSettingDefinitions = this.getManagedSettingDefinitions();
		this.logService.trace(`CopilotManagedSettingsService#updateWatcher - Found ${Object.keys(managedSettingDefinitions).length} managed-settings definitions`);
		if (Object.keys(managedSettingDefinitions).length === 0) {
			this.watcher.clear();
			const hadManagedSettings = this.managedSettingsValues.size > 0;
			this.managedSettingsValues.clear();
			if (hadManagedSettings) {
				this._onDidChangeManagedSettings.fire(this.managedSettings);
			}
			return;
		}

		const { createWatcher } = this.watcherFactory ? { createWatcher: this.watcherFactory } : (await import('@vscode/policy-watcher') as { createWatcher: CopilotPolicyWatcherFactory });
		await this.throttler.queue(() => new Promise<void>((c, e) => {
			try {
				this.logService.trace(`Creating Copilot managed-settings watcher for productName ${this.productName}`);
				this.watcher.value = createWatcher(this.productName, managedSettingDefinitions, update => {
					this._onDidManagedSettingsChange(update as Record<string, PolicyValue | undefined>);
					c();
				}, this.watcherOptions);
			} catch (err) {
				this.logService.error(`CopilotManagedSettingsService#updateWatcher - Error creating watcher:`, err);
				e(err);
			}
		}));
	}

	private getManagedSettingDefinitions(): Record<string, { type: 'string' | 'number' | 'boolean' }> {
		const definitions: Record<string, { type: 'string' | 'number' | 'boolean' }> = {};
		for (const key in this.watchedSettings) {
			definitions[key] = { type: this.watchedSettings[key].type };
		}
		return definitions;
	}

	private _onDidManagedSettingsChange(update: Record<string, PolicyValue | undefined>): void {
		this.logService.trace(`CopilotManagedSettingsService#_onDidManagedSettingsChange - Updated managed-settings values: ${JSON.stringify(update)}`);

		let changed = false;
		for (const [key, value] of Object.entries(update)) {
			if (value === undefined) {
				changed = this.managedSettingsValues.delete(key) || changed;
			} else {
				if (this.managedSettingsValues.get(key) !== value) {
					this.managedSettingsValues.set(key, value);
					changed = true;
				}
			}
		}
		if (changed) {
			this._onDidChangeManagedSettings.fire(this.managedSettings);
		}
	}
}

function areManagedSettingDefinitionsEqual(a: Record<string, IManagedSettingPolicyDefinition>, b: Record<string, IManagedSettingPolicyDefinition>): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) {
		return false;
	}

	return aKeys.every(key => a[key]?.type === b[key]?.type);
}
