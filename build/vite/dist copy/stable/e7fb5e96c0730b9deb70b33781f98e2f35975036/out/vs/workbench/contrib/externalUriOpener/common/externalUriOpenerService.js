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
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import * as languages from '../../../../editor/common/languages.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultExternalUriOpenerId, externalUriOpenersSettingId } from './configuration.js';
import { testUrlMatchesGlob } from '../../../../platform/url/common/urlGlob.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
export const IExternalUriOpenerService = createDecorator('externalUriOpenerService');
let ExternalUriOpenerService = class ExternalUriOpenerService extends Disposable {
    constructor(openerService, configurationService, logService, preferencesService, quickInputService) {
        super();
        this.configurationService = configurationService;
        this.logService = logService;
        this.preferencesService = preferencesService;
        this.quickInputService = quickInputService;
        this._providers = new LinkedList();
        this._register(openerService.registerExternalOpener(this));
    }
    registerExternalOpenerProvider(provider) {
        const remove = this._providers.push(provider);
        return { dispose: remove };
    }
    async getOpeners(targetUri, allowOptional, ctx, token) {
        const allOpeners = await this.getAllOpenersForUri(targetUri);
        if (allOpeners.size === 0) {
            return [];
        }
        // First see if we have a preferredOpener
        if (ctx.preferredOpenerId) {
            if (ctx.preferredOpenerId === defaultExternalUriOpenerId) {
                return [];
            }
            const preferredOpener = allOpeners.get(ctx.preferredOpenerId);
            if (preferredOpener) {
                // Skip the `canOpen` check here since the opener was specifically requested.
                return [preferredOpener];
            }
        }
        // Check to see if we have a configured opener
        const configuredOpener = this.getConfiguredOpenerForUri(allOpeners, targetUri);
        if (configuredOpener) {
            // Skip the `canOpen` check here since the opener was specifically requested.
            return configuredOpener === defaultExternalUriOpenerId ? [] : [configuredOpener];
        }
        // Then check to see if there is a valid opener
        const validOpeners = [];
        await Promise.all(Array.from(allOpeners.values()).map(async (opener) => {
            let priority;
            try {
                priority = await opener.canOpen(ctx.sourceUri, token);
            }
            catch (e) {
                this.logService.error(e);
                return;
            }
            switch (priority) {
                case languages.ExternalUriOpenerPriority.Option:
                case languages.ExternalUriOpenerPriority.Default:
                case languages.ExternalUriOpenerPriority.Preferred:
                    validOpeners.push({ opener, priority });
                    break;
            }
        }));
        if (validOpeners.length === 0) {
            return [];
        }
        // See if we have a preferred opener first
        const preferred = validOpeners.filter(x => x.priority === languages.ExternalUriOpenerPriority.Preferred).at(0);
        if (preferred) {
            return [preferred.opener];
        }
        // See if we only have optional openers, use the default opener
        if (!allowOptional && validOpeners.every(x => x.priority === languages.ExternalUriOpenerPriority.Option)) {
            return [];
        }
        return validOpeners.map(value => value.opener);
    }
    async openExternal(href, ctx, token) {
        const targetUri = typeof href === 'string' ? URI.parse(href) : href;
        const allOpeners = await this.getOpeners(targetUri, false, ctx, token);
        if (allOpeners.length === 0) {
            return false;
        }
        else if (allOpeners.length === 1) {
            return allOpeners[0].openExternalUri(targetUri, ctx, token);
        }
        // Otherwise prompt
        return this.showOpenerPrompt(allOpeners, targetUri, ctx, token);
    }
    async getOpener(targetUri, ctx, token) {
        const allOpeners = await this.getOpeners(targetUri, true, ctx, token);
        if (allOpeners.length >= 1) {
            return allOpeners[0];
        }
        return undefined;
    }
    async getAllOpenersForUri(targetUri) {
        const allOpeners = new Map();
        await Promise.all(Iterable.map(this._providers, async (provider) => {
            for await (const opener of provider.getOpeners(targetUri)) {
                allOpeners.set(opener.id, opener);
            }
        }));
        return allOpeners;
    }
    getConfiguredOpenerForUri(openers, targetUri) {
        const config = this.configurationService.getValue(externalUriOpenersSettingId) || {};
        for (const [uriGlob, id] of Object.entries(config)) {
            if (testUrlMatchesGlob(targetUri, uriGlob)) {
                if (id === defaultExternalUriOpenerId) {
                    return 'default';
                }
                const entry = openers.get(id);
                if (entry) {
                    return entry;
                }
            }
        }
        return undefined;
    }
    async showOpenerPrompt(openers, targetUri, ctx, token) {
        const items = openers.map((opener) => {
            return {
                label: opener.label,
                opener: opener
            };
        });
        items.push({
            label: isWeb
                ? nls.localize('selectOpenerDefaultLabel.web', 'Open in new browser window')
                : nls.localize('selectOpenerDefaultLabel', 'Open in default browser'),
            opener: undefined
        }, { type: 'separator' }, {
            label: nls.localize('selectOpenerConfigureTitle', "Configure default opener..."),
            opener: 'configureDefault'
        });
        const picked = await this.quickInputService.pick(items, {
            placeHolder: nls.localize('selectOpenerPlaceHolder', "How would you like to open: {0}", targetUri.toString())
        });
        if (!picked) {
            // Still cancel the default opener here since we prompted the user
            return true;
        }
        if (typeof picked.opener === 'undefined') {
            return false; // Fallback to default opener
        }
        else if (picked.opener === 'configureDefault') {
            await this.preferencesService.openUserSettings({
                jsonEditor: true,
                revealSetting: { key: externalUriOpenersSettingId, edit: true }
            });
            return true;
        }
        else {
            return picked.opener.openExternalUri(targetUri, ctx, token);
        }
    }
};
ExternalUriOpenerService = __decorate([
    __param(0, IOpenerService),
    __param(1, IConfigurationService),
    __param(2, ILogService),
    __param(3, IPreferencesService),
    __param(4, IQuickInputService)
], ExternalUriOpenerService);
export { ExternalUriOpenerService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZXJuYWxVcmlPcGVuZXIvY29tbW9uL2V4dGVybmFsVXJpT3BlbmVyU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sS0FBSyxTQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0YsT0FBTyxFQUFFLGtCQUFrQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSwwQkFBMEIsRUFBbUMsMkJBQTJCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztB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