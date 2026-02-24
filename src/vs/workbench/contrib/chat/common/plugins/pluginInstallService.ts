/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarketplacePlugin } from './pluginMarketplaceService.js';

export const IPluginInstallService = createDecorator<IPluginInstallService>('pluginInstallService');

export interface IPluginInstallService {
	readonly _serviceBrand: undefined;

	/**
	 * Clones the marketplace repository (if not already cached) and registers
	 * the plugin's source directory in the user's `chat.plugins.paths` config.
	 */
	installPlugin(plugin: IMarketplacePlugin): Promise<void>;

	/**
	 * Removes the plugin from `chat.plugins.paths` config.
	 */
	uninstallPlugin(pluginUri: URI): Promise<void>;

	/**
	 * Pulls the latest changes for an already-cloned marketplace repository.
	 */
	updatePlugin(plugin: IMarketplacePlugin): Promise<void>;

	/**
	 * Returns the URI where a marketplace plugin would be installed on disk.
	 * Used to determine whether a marketplace plugin is already installed.
	 */
	getPluginInstallUri(plugin: IMarketplacePlugin): URI;
}
