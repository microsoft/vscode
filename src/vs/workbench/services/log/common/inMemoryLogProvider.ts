/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyValueLogProvider } from 'vs/workbench/services/log/common/keyValueLogProvider';
import { keys } from 'vs/base/common/map';

export class InMemoryLogProvider extends KeyValueLogProvider {

	private readonly logs: Map<string, string> = new Map<string, string>();

	protected async getAllKeys(): Promise<string[]> {
		return keys(this.logs);
	}

	protected async hasKey(key: string): Promise<boolean> {
		return this.logs.has(key);
	}

	protected async getValue(key: string): Promise<string> {
		return this.logs.get(key) || '';
	}

	protected async setValue(key: string, value: string): Promise<void> {
		this.logs.set(key, value);
	}

	protected async deleteKey(key: string): Promise<void> {
		this.logs.delete(key);
	}

}
