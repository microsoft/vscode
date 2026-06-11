/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../base/common/async.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Iterable } from '../../../base/common/iterator.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { getPolicyValueFromManagedSettings } from '../../../base/common/policy.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from '../common/policy.js';
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

export class CopilotManagedSettingsPolicyService extends AbstractPolicyService implements IPolicyService {

	private readonly throttler = this._register(new Throttler());
	private readonly watcher = this._register(new MutableDisposable<Watcher>());
	private readonly managedSettingsValues = new Map<string, PolicyValue>();

	constructor(
		@ILogService private readonly logService: ILogService,
		private readonly productName: string,
		private readonly watcherOptions?: ICopilotPolicyWatcherOptions,
		private readonly watcherFactory?: CopilotPolicyWatcherFactory,
	) {
		super();
	}

	override async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		const managedPolicyDefinitions: IStringDictionary<PolicyDefinition> = {};
		for (const policyName in policyDefinitions) {
			if (policyDefinitions[policyName].managedSettings) {
				managedPolicyDefinitions[policyName] = policyDefinitions[policyName];
			}
		}

		this.policyDefinitions = managedPolicyDefinitions;
		await this._updatePolicyDefinitions(this.policyDefinitions);
		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		const managedSettingDefinitions = this.getManagedSettingDefinitions(policyDefinitions);
		this.logService.trace(`CopilotManagedSettingsPolicyService#_updatePolicyDefinitions - Found ${Object.keys(policyDefinitions).length} policy definitions and ${Object.keys(managedSettingDefinitions).length} managed-settings definitions`);
		if (Object.keys(managedSettingDefinitions).length === 0) {
			const removed = Array.from(this.policies.keys());
			this.watcher.clear();
			this.managedSettingsValues.clear();
			this.policies.clear();
			if (removed.length > 0) {
				this._onDidChange.fire(removed);
			}
			return;
		}

		for (const policyName in policyDefinitions) {
			if (policyDefinitions[policyName].managedSettings) {
				this.policyDefinitions[policyName] = policyDefinitions[policyName];
			}
		}
		const removed = this.clearRemovedPolicyValues(policyDefinitions);
		this.updatePolicyValues(removed);

		const { createWatcher } = this.watcherFactory ? { createWatcher: this.watcherFactory } : (await import('@vscode/policy-watcher') as { createWatcher: CopilotPolicyWatcherFactory });
		await this.throttler.queue(() => new Promise<void>((c, e) => {
			try {
				this.logService.trace(`Creating Copilot managed-settings watcher for productName ${this.productName}`);
				this.watcher.value = createWatcher(this.productName, managedSettingDefinitions, update => {
					this._onDidManagedSettingsChange(update as Record<string, PolicyValue | undefined>);
					c();
				}, this.watcherOptions);
			} catch (err) {
				this.logService.error(`CopilotManagedSettingsPolicyService#_updatePolicyDefinitions - Error creating watcher:`, err);
				e(err);
			}
		}));
	}

	private getManagedSettingDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Record<string, { type: 'string' | 'number' | 'boolean' }> {
		const definitions: Record<string, { type: 'string' | 'number' | 'boolean' }> = {};
		for (const policyName in policyDefinitions) {
			const managedSettings = policyDefinitions[policyName].managedSettings;
			if (!managedSettings) {
				continue;
			}
			for (const key in managedSettings) {
				definitions[key] = { type: managedSettings[key].type };
			}
		}
		return definitions;
	}

	private _onDidManagedSettingsChange(update: Record<string, PolicyValue | undefined>): void {
		this.logService.trace(`CopilotManagedSettingsPolicyService#_onDidManagedSettingsChange - Updated managed-settings values: ${JSON.stringify(update)}`);

		for (const [key, value] of Object.entries(update)) {
			if (value === undefined) {
				this.managedSettingsValues.delete(key);
			} else {
				this.managedSettingsValues.set(key, value);
			}
		}
		this.updatePolicyValues();
	}

	private clearRemovedPolicyValues(policyDefinitions: IStringDictionary<PolicyDefinition>): string[] {
		const removed: string[] = [];
		for (const policyName of this.policies.keys()) {
			if (!policyDefinitions[policyName]) {
				this.policies.delete(policyName);
				removed.push(policyName);
			}
		}
		return removed;
	}

	private updatePolicyValues(updated: string[] = []): void {
		for (const policyName in this.policyDefinitions) {
			const managedSettings = this.policyDefinitions[policyName].managedSettings;
			if (!managedSettings) {
				continue;
			}

			const policyValue = getPolicyValueFromManagedSettings(managedSettings, Object.fromEntries(this.managedSettingsValues));

			if (policyValue === undefined) {
				if (this.policies.delete(policyName)) {
					updated.push(policyName);
				}
				continue;
			}

			if (this.policies.get(policyName) !== policyValue) {
				this.policies.set(policyName, policyValue);
				updated.push(policyName);
			}
		}

		if (updated.length > 0) {
			this._onDidChange.fire(updated);
		}
	}
}
