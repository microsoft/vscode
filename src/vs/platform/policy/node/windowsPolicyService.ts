/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';
import { createWatcher, Watcher } from 'vscode-policy-watcher';
import { IStringDictionary } from 'vs/base/common/collections';
import { Iterable } from 'vs/base/common/iterator';

export class WindowsPolicyService extends Disposable implements IPolicyService {

	readonly _serviceBrand: undefined;

	private readonly policies = new Map<PolicyName, PolicyValue>();
	private init: Promise<Watcher> | undefined;

	private readonly _onDidChange = new Emitter<readonly PolicyName[]>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly productName: string) {
		super();
	}

	async registerPolicyDefinitions(policies: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		if (!this.init) {
			this.init = new Promise(c => {
				let first = true;

				const watcher = createWatcher(this.productName, policies, update => {
					for (const key in update) {
						const value = update[key] as any;

						if (value === undefined) {
							this.policies.delete(key);
						} else {
							this.policies.set(key, value);
						}
					}

					if (first) {
						first = false;
						c(watcher);
					} else {
						this._onDidChange.fire(Object.keys(update));
					}
				});

				this._register(watcher);
			});

			await this.init;
		} else {
			const watcher = await this.init;
			const promise = Event.toPromise(this.onDidChange);
			watcher.addPolicies(policies);
			await promise;
		}

		// TODO@joao: heavy cleanup

		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}
}
