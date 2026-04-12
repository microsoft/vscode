/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { mainWindow } from '../../../../base/browser/window.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { AgentPluginEditorInput } from './agentPluginEditor/agentPluginEditorInput.js';
import { ChatConfiguration } from '../common/constants.js';
import { parseMarketplaceReference, parseMarketplaceReferences } from '../common/plugins/marketplaceReference.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
/**
 * Handles `vscode://chat-plugin/install?source=<base64>[&plugin=<base64>]` and
 * `vscode://chat-plugin/add-marketplace?ref=<base64>` URLs.
 *
 * The `source` / `ref` query parameter is a base64-encoded `owner/repo` or
 * git clone URL. When `plugin` is provided on the `/install` route, the handler
 * targets that specific plugin within the marketplace, installs it, and opens
 * its details in the editor. Otherwise, a confirmation dialog is shown before
 * any action.
 */
let PluginUrlHandler = class PluginUrlHandler extends Disposable {
    static { this.ID = 'workbench.contrib.pluginUrlHandler'; }
    constructor(urlService, _pluginInstallService, _dialogService, _configurationService, _extensionsWorkbenchService, _hostService, _logService, _editorService, _instantiationService) {
        super();
        this._pluginInstallService = _pluginInstallService;
        this._dialogService = _dialogService;
        this._configurationService = _configurationService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._hostService = _hostService;
        this._logService = _logService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._register(urlService.registerHandler(this));
    }
    async handleURL(uri) {
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
    async _handleInstall(uri) {
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
        if (ref.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
            this._logService.warn('[PluginUrlHandler] Local file URIs are not supported for install');
            return true;
        }
        await this._hostService.focus(mainWindow);
        const pluginName = this._decodeStringParam(uri, 'plugin');
        if (pluginName) {
            return this._handleInstallTargetedPlugin(source, ref.displayLabel, pluginName);
        }
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
        this._extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
        return true;
    }
    /**
     * Handles the case where a specific plugin is targeted within a
     * marketplace. Delegates trust and discovery to the install service,
     * then opens the plugin details in a modal editor.
     */
    async _handleInstallTargetedPlugin(source, displayLabel, pluginName) {
        const result = await this._pluginInstallService.installPluginFromValidatedSource(source, { plugin: pluginName });
        if (!result.success) {
            if (result.message) {
                this._logService.warn(`[PluginUrlHandler] ${result.message}`);
            }
            this._extensionsWorkbenchService.openSearch(`@agentPlugins ${displayLabel}`);
            return true;
        }
        if (!result.matchedPlugin) {
            this._extensionsWorkbenchService.openSearch(`@agentPlugins ${displayLabel}`);
            return true;
        }
        const plugin = result.matchedPlugin;
        const item = {
            kind: "marketplace" /* AgentPluginItemKind.Marketplace */,
            name: plugin.name,
            description: plugin.description,
            source: plugin.source,
            sourceDescriptor: plugin.sourceDescriptor,
            marketplace: plugin.marketplace,
            marketplaceReference: plugin.marketplaceReference,
            marketplaceType: plugin.marketplaceType,
            readmeUri: plugin.readmeUri,
        };
        const input = this._instantiationService.createInstance(AgentPluginEditorInput, item);
        await this._editorService.openEditor(input);
        return true;
    }
    // --- add a marketplace ---
    async _handleAddMarketplace(uri) {
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
        const existing = this._configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
        const existingRefs = parseMarketplaceReferences(existing);
        if (!existingRefs.some(e => e.canonicalId === ref.canonicalId)) {
            await this._configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...existing, refValue], 2 /* ConfigurationTarget.USER */);
        }
        this._extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
        return true;
    }
    // --- helpers ---
    /**
     * Reads a query parameter and attempts to parse it as a marketplace
     * reference. Tries base64-decoding first, then falls back to the raw
     * value so that plain-text `owner/repo` values also work in URLs.
     */
    _decodeQueryParam(uri, key) {
        const params = new URLSearchParams(uri.query);
        const raw = params.get(key);
        if (!raw) {
            return undefined;
        }
        const decoded = this._tryBase64Decode(raw);
        if (decoded && parseMarketplaceReference(decoded)) {
            return decoded;
        }
        return parseMarketplaceReference(raw) ? raw : undefined;
    }
    /**
     * Reads a query parameter and decodes it. Tries base64-decoding first,
     * then falls back to the raw value.
     */
    _decodeStringParam(uri, key) {
        const params = new URLSearchParams(uri.query);
        return params.get(key) ?? undefined;
    }
    _tryBase64Decode(raw) {
        try {
            const decoded = decodeBase64(raw).toString();
            return decoded || undefined;
        }
        catch {
            return undefined;
        }
    }
};
PluginUrlHandler = __decorate([
    __param(0, IURLService),
    __param(1, IPluginInstallService),
    __param(2, IDialogService),
    __param(3, IConfigurationService),
    __param(4, IExtensionsWorkbenchService),
    __param(5, IHostService),
    __param(6, ILogService),
    __param(7, IEditorService),
    __param(8, IInstantiationService)
], PluginUrlHandler);
export { PluginUrlHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luVXJsSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wbHVnaW5VcmxIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFlLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFdEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDM0QsT0FBTyxFQUE0Qix5QkFBeUIsRUFBRSwwQkFB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