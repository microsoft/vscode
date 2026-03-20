/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences } from '../common/plugins/marketplaceReference.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';

/**
 * Handles `vscode://chat-plugin/install?source=<base64>` and
 * `vscode://chat-plugin/add-marketplace?ref=<base64>` URLs.
 *
 * The `source` / `ref` query parameter is a base64-encoded `owner/repo` or
 * git clone URL. A confirmation dialog is always shown before any action.
 */
export class PluginUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.pluginUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHostService private readonly _hostService: IHostService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== 'chat-plugin') {
			return false;
		}

		switch (uri.path) {
			case '/install':
				return this._handleInstall(uri);
			case '/add-marketplace':
				return this._handleAddMarketplace(uri);
			default:
				return false;
		}
	}

	// --- install a plugin from source ---

	private async _handleInstall(uri: URI): Promise<boolean> {
		const source = this._decodeQueryParam(uri, 'source');
		if (!source) {
			this._logService.warn('[PluginUrlHandler] Missing or invalid "source" query parameter');
			return true;
		}

		const ref = parseMarketplaceReference(source);
		if (!ref) {
			this._logService.warn(`[PluginUrlHandler] Invalid plugin source: ${source}`);
			return true;
		}

		if (ref.kind === MarketplaceReferenceKind.LocalFileUri) {
			this._logService.warn('[PluginUrlHandler] Local file URIs are not supported for install');
			return true;
		}

		await this._hostService.focus(mainWindow);

		const { confirmed } = await this._dialogService.confirm({
			type: 'question',
			message: localize('confirmInstallPlugin', "Install Plugin from '{0}'?", ref.displayLabel),
			detail: localize('confirmInstallPluginDetail', "An external application wants to install a plugin from this source. Plugins can run code on your machine. Only install plugins from sources you trust.\n\nSource: {0}", ref.rawValue),
			primaryButton: localize({ key: 'installButton', comment: ['&& denotes a mnemonic'] }, "&&Install"),
			custom: { icon: Codicon.shield },
		});

		if (!confirmed) {
			return true;
		}

		await this._pluginInstallService.installPluginFromSource(source);
		return true;
	}

	// --- add a marketplace ---

	private async _handleAddMarketplace(uri: URI): Promise<boolean> {
		const refValue = this._decodeQueryParam(uri, 'ref');
		if (!refValue) {
			this._logService.warn('[PluginUrlHandler] Missing or invalid "ref" query parameter');
			return true;
		}

		const ref = parseMarketplaceReference(refValue);
		if (!ref) {
			this._logService.warn(`[PluginUrlHandler] Invalid marketplace reference: ${refValue}`);
			return true;
		}

		await this._hostService.focus(mainWindow);

		const { confirmed } = await this._dialogService.confirm({
			type: 'question',
			message: localize('confirmAddMarketplace', "Add Plugin Marketplace '{0}'?", ref.displayLabel),
			detail: localize('confirmAddMarketplaceDetail', "An external application wants to add a plugin marketplace. Plugins from this marketplace will appear in the plugin catalog and can be installed.\n\nSource: {0}", ref.rawValue),
			primaryButton: localize({ key: 'addMarketplaceButton', comment: ['&& denotes a mnemonic'] }, "&&Add Marketplace"),
			custom: { icon: Codicon.shield },
		});

		if (!confirmed) {
			return true;
		}

		const existing = this._configurationService.getValue<string[]>(ChatConfiguration.PluginMarketplaces) ?? [];
		const existingRefs = parseMarketplaceReferences(existing);
		if (!existingRefs.some(e => e.canonicalId === ref.canonicalId)) {
			await this._configurationService.updateValue(
				ChatConfiguration.PluginMarketplaces,
				[...existing, refValue],
				ConfigurationTarget.USER,
			);
		}

		return true;
	}

	// --- helpers ---

	/**
	 * Reads a query parameter and attempts to parse it as a marketplace
	 * reference. Tries base64-decoding first, then falls back to the raw
	 * value so that plain-text `owner/repo` values also work in URLs.
	 */
	private _decodeQueryParam(uri: URI, key: string): string | undefined {
		const params = new URLSearchParams(uri.query);
		const raw = params.get(key);
		if (!raw) {
			return undefined;
		}

		// Try base64 first; if the decoded string is a valid reference, use it.
		try {
			const decoded = decodeBase64(raw).toString();
			if (parseMarketplaceReference(decoded)) {
				return decoded;
			}
		} catch {
			// not valid base64
		}

		return raw;
	}
}
