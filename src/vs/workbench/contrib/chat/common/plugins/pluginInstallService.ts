/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarketplacePlugin } from './pluginMarketplaceService.js';

export const IPluginInstallService = createDecorator<IPluginInstallService>('pluginInstallService');

export interface IUpdateAllPluginsOptions {
	/**
	 * When `true`, also re-installs npm/pip packages that have no pinned
	 * version. Defaults to `false` to avoid interactive terminal prompts
	 * during background updates.
	 */
	readonly force?: boolean;

	/**
	 * When `true`, suppresses the progress notification. An info
	 * notification is still shown listing any plugins that were
	 * updated, and error notifications are shown on failure.
	 */
	readonly silent?: boolean;
}

export interface IUpdateAllPluginsResult {
	/** Names of plugins/marketplaces that were updated successfully. */
	readonly updatedNames: readonly string[];
	/** Names of plugins/marketplaces that failed to update. */
	readonly failedNames: readonly string[];
}

export interface IPluginInstallService {
	readonly _serviceBrand: undefined;

	/**
	 * Clones the marketplace repository (if not already cached) and registers
	 * the plugin in the marketplace service's installed plugins storage.
	 */
	installPlugin(plugin: IMarketplacePlugin): Promise<void>;

	/**
	 * Installs a plugin directly from a source location string. Accepts
	 * GitHub shorthand (`owner/repo`) or a full git clone URL. Clones the
	 * repository, reads marketplace metadata to discover plugins, and
	 * registers the selected plugin.
	 */
	installPluginFromSource(source: string): Promise<void>;

	/**
	 * Pulls the latest changes for an already-cloned marketplace repository.
	 */
	updatePlugin(plugin: IMarketplacePlugin): Promise<boolean>;

	/**
	 * Updates all installed plugins. First pulls each unique marketplace
	 * repository, then updates non-relative-path plugins individually
	 * (git pull, npm install, pip install, etc.).
	 */
	updateAllPlugins(options: IUpdateAllPluginsOptions, token: CancellationToken): Promise<IUpdateAllPluginsResult>;

	/**
	 * Returns the URI where a marketplace plugin would be installed on disk.
	 * Used to determine whether a marketplace plugin is already installed.
	 */
	getPluginInstallUri(plugin: IMarketplacePlugin): URI;
}
