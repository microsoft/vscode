/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../base/common/uri.js';
import { getConfigurationValue, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationValue, isConfigurationOverrides } from '../../common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';

export class TestConfigurationService implements IConfigurationService {
	public _serviceBrand: undefined;

	private configuration: Record<string, unknown>;
	readonly onDidChangeConfigurationEmitter = new Emitter<IConfigurationChangeEvent>();
	readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;

	constructor(configuration?: Record<string, unknown>) {
		this.configuration = configuration || Object.create(null);
	}

	private configurationByRoot: TernarySearchTree<string, Record<string, unknown>> = TernarySearchTree.forPaths<Record<string, unknown>>();

	public reloadConfiguration<T>(): Promise<T> {
		return Promise.resolve(this.getValue() as T);
	}

	public getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
		let configuration;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
		if (overrides) {
			if (overrides.resource) {
				configuration = this.configurationByRoot.findSubstr(overrides.resource.fsPath);
			}
		}
		configuration = configuration ? configuration : this.configuration;
		if (arg1 && typeof arg1 === 'string') {
			return (configuration[arg1] ?? getConfigurationValue(configuration, arg1)) as T;
		}
		return configuration as T;
	}

	public updateValue(key: string, value: unknown): Promise<void> {
		return Promise.resolve(undefined);
	}

	public setUserConfiguration(key: string, value: unknown, root?: URI): Promise<void> {
		if (root) {
			const configForRoot = this.configurationByRoot.get(root.fsPath) || Object.create(null);
			configForRoot[key] = value;
			this.configurationByRoot.set(root.fsPath, configForRoot);
		} else {
			this.configuration[key] = value;
		}

		return Promise.resolve(undefined);
	}

	private overrideIdentifiers: Map<string, string[]> = new Map();
	public setOverrideIdentifiers(key: string, identifiers: string[]): void {
		this.overrideIdentifiers.set(key, identifiers);
	}

	public inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const value = this.getValue(key, overrides) as T;

		return {
			value,
			defaultValue: undefined,
			userValue: value,
			userLocalValue: value,
			overrideIdentifiers: this.overrideIdentifiers.get(key)
		};
	}

	public keys() {
		return {
			default: Object.keys(Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()),
			policy: [],
			user: Object.keys(this.configuration),
			workspace: [],
			workspaceFolder: []
		};
	}

	public getConfigurationData() {
		return null;
	}
}
