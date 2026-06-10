/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MANAGED_SETTINGS_RAW_POLICY_NAME, MANAGED_SETTINGS_SCHEMA_KEYS, unflattenManagedSettings } from '../../../base/common/copilotPolicy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Throttler } from '../../../base/common/async.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from '../common/policy.js';
import type { Watcher, WatcherOptions } from '@vscode/policy-watcher';

/**
 * Watches MDM plist/registry for the GitHubCopilot managed-settings schema
 * keys (dot-separated, e.g. `permissions.disableBypassPermissionsMode`) and
 * stores the raw {@link IManagedSettingsData} as a JSON-encoded policy value
 * under {@link MANAGED_SETTINGS_RAW_POLICY_NAME}.
 *
 * The raw data is forwarded to the renderer via the existing policy IPC
 * channel, where `AccountPolicyService` reads it and passes it to each
 * policy definition's `value({ managedSettings })` callback.
 *
 * This is the MDM counterpart of {@link ManagedSettingsFilePolicyService}:
 * - File-based: reads nested JSON → stores as raw data policy
 * - Native MDM: watches flat plist/registry keys → unflattens → stores as raw data policy
 */
export class ManagedSettingsNativePolicyService extends AbstractPolicyService implements IPolicyService {

	private readonly throttler = this._register(new Throttler());
	private readonly watcher = this._register(new MutableDisposable<Watcher>());
	private readonly nativeState = new Map<string, PolicyValue>();

	constructor(
		@ILogService private readonly logService: ILogService,
		private readonly productName: string,
		private readonly watcherOptions?: WatcherOptions,
	) {
		super();
	}

	protected async _updatePolicyDefinitions(_policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		// Register the raw data carrier as a definition so it flows through
		// serialize() → PolicyChannelClient → AccountPolicyService.
		this.policyDefinitions[MANAGED_SETTINGS_RAW_POLICY_NAME] = { type: 'string' };

		this.logService.trace(`ManagedSettingsNativePolicyService#_updatePolicyDefinitions - Registering ${Object.keys(MANAGED_SETTINGS_SCHEMA_KEYS).length} schema keys for ${this.productName}`);

		const { createWatcher } = await import('@vscode/policy-watcher');

		await this.throttler.queue(() => new Promise<void>((c, e) => {
			try {
				this.watcher.value = createWatcher(this.productName, MANAGED_SETTINGS_SCHEMA_KEYS, update => {
					this._onNativeUpdate(update as Record<string, PolicyValue | undefined>);
					c();
				}, this.watcherOptions);
			} catch (err) {
				this.logService.error(`ManagedSettingsNativePolicyService#_updatePolicyDefinitions - Error creating watcher:`, err);
				e(err);
			}
		}));
	}

	private _onNativeUpdate(update: Record<string, PolicyValue | undefined>): void {
		this.logService.trace(`ManagedSettingsNativePolicyService#_onNativeUpdate - update: ${JSON.stringify(update)}`);

		for (const [key, value] of Object.entries(update)) {
			if (value === undefined) {
				this.nativeState.delete(key);
			} else {
				this.nativeState.set(key, value);
			}
		}

		if (this.nativeState.size === 0) {
			if (this.policies.delete(MANAGED_SETTINGS_RAW_POLICY_NAME)) {
				this._onDidChange.fire([MANAGED_SETTINGS_RAW_POLICY_NAME]);
			}
			return;
		}

		const data = unflattenManagedSettings(this.nativeState);
		const json = JSON.stringify(data);

		if (this.policies.get(MANAGED_SETTINGS_RAW_POLICY_NAME) !== json) {
			this.policies.set(MANAGED_SETTINGS_RAW_POLICY_NAME, json);
			this.logService.trace(`ManagedSettingsNativePolicyService#_onNativeUpdate - stored raw data: ${json}`);
			this._onDidChange.fire([MANAGED_SETTINGS_RAW_POLICY_NAME]);
		}
	}
}
