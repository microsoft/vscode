/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';
import { IStringDictionary } from 'vs/base/common/collections';
import { Iterable } from 'vs/base/common/iterator';
import { Throttler } from 'vs/base/common/async';
import type { Watcher } from 'vscode-policy-watcher';

export class NativePolicyService implements IPolicyService {

	readonly _serviceBrand: undefined;

	private policyDefinitions: IStringDictionary<PolicyDefinition> = {};
	private readonly policies = new Map<PolicyName, PolicyValue>();

	private readonly _onDidChange = new Emitter<readonly PolicyName[]>();
	readonly onDidChange = this._onDidChange.event;

	private throttler = new Throttler();
	private watcher: Watcher | undefined;

	constructor(private readonly productName: string) { }

	async registerPolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		const size = Object.keys(this.policyDefinitions).length;
		this.policyDefinitions = { ...policyDefinitions, ...this.policyDefinitions };

		if (size !== Object.keys(this.policyDefinitions).length) {
			await this.throttler.queue(async () => {
				this.watcher?.dispose();

				const { createWatcher } = await import('vscode-policy-watcher');

				await new Promise<void>(c => {
					this.watcher = createWatcher(this.productName, policyDefinitions, update => {
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
				});
			});
		}

		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}

	dispose(): void {
		this._onDidChange.dispose();
		this.watcher?.dispose();
	}
}
