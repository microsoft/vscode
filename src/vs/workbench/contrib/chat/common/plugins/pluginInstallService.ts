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

export interface IInstallPluginFromSourceOptions {
	/**
	 * When set, targets a specific plugin by name within the marketplace
	 * instead of installing all or prompting the user. The matched plugin
	 * is installed and returned in the result.
	 */
	readonly plugin?: string;
}

export interface IInstallPluginFromSourceResult {
	readonly success: boolean;
	readonly message?: string;
	/**
	 * When {@link IInstallPluginFromSourceOptions.plugin} is set and the
	 * plugin was found, this contains the discovered marketplace plugin.
	 */
	readonly matchedPlugin?: IMarketplacePlugin;
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
	 *
	 * When {@link IInstallPluginFromSourceOptions.plugin} is set, targets
	 * a specific plugin, installs it, and returns it.
	 */
	installPluginFromSource(source: string, options?: IInstallPluginFromSourceOptions): Promise<void>;

	/**
	 * Synchronously validates the format of a plugin source string.
	 * Returns an error message if the format is invalid, or undefined if valid.
	 */
	validatePluginSource(source: string): string | undefined;

	/**
	 * Installs a plugin from an already-validated source string.
	 * Handles trust, cloning, scanning, and registration. Returns a result
	 * with an optional error message (e.g. no plugins found).
	 *
	 * When {@link IInstallPluginFromSourceOptions.plugin} is set, targets
	 * a specific plugin, installs it, and returns it in
	 * {@link IInstallPluginFromSourceResult.matchedPlugin}.
	 */
	installPluginFromValidatedSource(source: string, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult>;

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
