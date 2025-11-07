/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Throttler } from '../../../base/common/async.js';
import type { PolicyUpdate, Watcher } from '@vscode/policy-watcher';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';

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
			// eslint-disable-next-line local/code-no-any-casts
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
