/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationCache, ConfigurationKey } from 'vs/workbench/services/configuration/common/configuration';

export class ConfigurationCache implements IConfigurationCache {

	constructor() {
	}

	async read(key: ConfigurationKey): Promise<string> {
		return '';
	}

	async write(key: ConfigurationKey, content: string): Promise<void> {
	}

	async remove(key: ConfigurationKey): Promise<void> {
	}
}