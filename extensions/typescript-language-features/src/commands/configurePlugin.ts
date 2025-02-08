/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PluginManager } from '../tsServer/plugins';
import { Command } from './commandManager';

export class ConfigurePluginCommand implements Command {
	public readonly id = '_typescript.configurePlugin';

	public constructor(
		private readonly pluginManager: PluginManager,
	) { }

	public execute(pluginId: string, configuration: any) {
		this.pluginManager.setConfiguration(pluginId, configuration);
	}
}
