/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPolicyService, IPolicyService, PolicyDefinition } from 'vs/platform/policy/common/policy';
import { IStringDictionary } from 'vs/base/common/collections';
import { Throttler } from 'vs/base/common/async';
import type { PolicyUpdate, Watcher } from '@vscode/policy-watcher';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';

export class NativePolicyService extends AbstractPolicyService implements IPolicyService {

	private throttler = new Throttler();
	private readonly watcher = this._register(new MutableDisposable<Watcher>());

	constructor(
		@ILogService private readonly logService: ILogService,
		private readonly productName: string
	) {
		super();
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`NativePolicyService#_updatePolicyDefinitions - Found ${Object.keys(policyDefinitions).length} policy definitions`);

		const { createWatcher } = await import('@vscode/policy-watcher');

		await this.throttler.queue(() => new Promise<void>((c, e) => {
			try {
				this.watcher.value = createWatcher(this.productName, policyDefinitions, update => {
					this._onDidPolicyChange(update);
					c();
				});
			} catch (err) {
				this.logService.error(`NativePolicyService#_updatePolicyDefinitions - Error creating watcher:`, err);
				e(err);
			}
		}));
	}

	private _onDidPolicyChange(update: PolicyUpdate<IStringDictionary<PolicyDefinition>>): void {
		this.logService.trace(`NativePolicyService#_onDidPolicyChange - Updated policy values: ${JSON.stringify(update)}`);

		for (const key in update) {
			const value = update[key] as any;

			if (value === undefined) {
				this.policies.delete(key);
			} else {
				this.policies.set(key, value);
			}
		}

		this._onDidChange.fire(Object.keys(update));
	}
}
