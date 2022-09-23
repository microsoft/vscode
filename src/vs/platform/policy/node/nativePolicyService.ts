/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPolicyService, IPolicyService, PolicyDefinition } from 'vs/platform/policy/common/policy';
import { IStringDictionary } from 'vs/base/common/collections';
import { Throttler } from 'vs/base/common/async';
import { createWatcher, Watcher } from 'vscode-policy-watcher';
import { MutableDisposable } from 'vs/base/common/lifecycle';

export class NativePolicyService extends AbstractPolicyService implements IPolicyService {

	private throttler = new Throttler();
	private watcher = this._register(new MutableDisposable<Watcher>());

	constructor(private readonly productName: string) {
		super();
	}

	protected async initializePolicies(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		await this.throttler.queue(() => new Promise<void>((c, e) => {
			try {
				this.watcher.value = createWatcher(this.productName, policyDefinitions, update => {
					for (const key in update) {
						const value = update[key] as any;

						if (value === undefined) {
							this.policies.delete(key);
						} else {
							this.policies.set(key, value);
						}
					}

					this._onDidChange.fire(Object.keys(update));
					c();
				});
			} catch (err) {
				e(err);
			}
		}));
	}

}
