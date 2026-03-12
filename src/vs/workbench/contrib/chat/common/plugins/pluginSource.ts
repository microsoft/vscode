/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IEnsureRepositoryOptions, IPullRepositoryOptions } from './agentPluginRepositoryService.js';
import { IMarketplacePlugin, IPluginSourceDescriptor, PluginSourceKind } from './pluginMarketplaceService.js';

/**
 * Per-kind strategy that centralizes install-path computation, source
 * provisioning, update, label formatting, and uninstall cleanup for a
 * single {@link PluginSourceKind}.
 *
 * Implementations are created via {@link IInstantiationService} so they
 * can dependency-inject any services they need (git commands, file service,
 * terminal service, etc.).
 */
export interface IPluginSource {
	readonly kind: PluginSourceKind;

	/**
	 * Compute the local cache URI where this source's plugin files live.
	 * @param cacheRoot The root cache directory for all agent plugins.
	 */
	getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI;

	/**
	 * Ensure the plugin source is available locally (clone, npm install, etc.).
	 * Returns the install directory URI.
	 */
	ensure(cacheRoot: URI, plugin: IMarketplacePlugin, options?: IEnsureRepositoryOptions): Promise<URI>;

	/**
	 * Update an already-installed plugin source (git pull, npm update, etc.).
	 * Returns `true` if the update brought in new changes.
	 */
	update(cacheRoot: URI, plugin: IMarketplacePlugin, options?: IPullRepositoryOptions): Promise<boolean>;

	/**
	 * Returns the on-disk directory to delete when this plugin is
	 * uninstalled, or `undefined` if no cleanup is needed.
	 *
	 * Marketplace-relative sources return `undefined` because they share
	 * a marketplace repository cache. Direct sources (github, url, npm,
	 * pip) return the directory they own.
	 */
	getCleanupTarget(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI | undefined;

	/**
	 * Returns a human-readable label for a source descriptor of this kind,
	 * suitable for error messages and UI display.
	 */
	getLabel(descriptor: IPluginSourceDescriptor): string;

	/**
	 * For package-manager sources (npm, pip): run the terminal install
	 * command and return the resulting plugin directory, or `undefined`
	 * if the user cancelled or the command failed.
	 *
	 * Not implemented by non-package-manager sources.
	 */
	runInstall?(installDir: URI, pluginDir: URI, plugin: IMarketplacePlugin, options?: { silent?: boolean }): Promise<{ pluginDir: URI } | undefined>;
}
