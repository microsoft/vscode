/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IPolicyService, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { createWatcher } from 'vscode-policy-watcher';
import { IStringDictionary } from 'vs/base/common/collections';
import { Iterable } from 'vs/base/common/iterator';

export class WindowsPolicyService extends Disposable implements IPolicyService {

	readonly _serviceBrand: undefined;

	private readonly policies = new Map<PolicyName, PolicyValue>();
	private init: Promise<{ [name: PolicyName]: PolicyValue }> | undefined;

	private readonly _onDidChange = new Emitter<readonly PolicyName[]>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IProductService private readonly productService: IProductService
	) {
		super();
	}

	initialize(): Promise<{ [name: PolicyName]: PolicyValue }> {
		if (!this.init) {
			this.init = new Promise(c => {
				if (!this.productService.win32RegValueName) {
					return;
				}

				const policies: IStringDictionary<{ type: 'string' | 'number' }> = {};
				const configRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

				for (const configuration of configRegistry.getConfigurations()) {
					if (configuration.properties) {
						for (const key in configuration.properties) {
							const config = configuration.properties[key];
							const policy = config.policy;

							if (policy) {
								if (config.type !== 'string' && config.type !== 'number') {
									console.warn(`Policy ${policy.name} has unsupported type ${config.type}`);
									continue;
								}

								policies[policy.name] = { type: config.type };
							}
						}
					}
				}

				let first = true;

				this._register(createWatcher(this.productService.win32RegValueName, policies, update => {
					for (const key in update) {
						this.policies.set(key, update[key]!);
					}

					if (first) {
						first = false;
						c(Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {}));
					} else {
						this._onDidChange.fire(Object.keys(update));
					}
				}));
			});
		}

		return this.init;
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}
}
