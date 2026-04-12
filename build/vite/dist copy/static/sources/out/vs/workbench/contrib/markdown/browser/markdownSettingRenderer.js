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
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Schemas } from '../../../../base/common/network.js';
import * as nls from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { settingKeyToDisplayFormat } from '../../preferences/browser/settingsTreeModels.js';
let SimpleSettingRenderer = class SimpleSettingRenderer {
    constructor(_configurationService, _contextMenuService, _preferencesService, _telemetryService, _clipboardService) {
        this._configurationService = _configurationService;
        this._contextMenuService = _contextMenuService;
        this._preferencesService = _preferencesService;
        this._telemetryService = _telemetryService;
        this._clipboardService = _clipboardService;
        this._updatedSettings = new Map(); // setting ID to user's original setting value
        this._encounteredSettings = new Map(); // setting ID to setting
        this._featuredSettings = new Map(); // setting ID to feature value
        this.codeSettingAnchorRegex = new RegExp(`^<a (href)=".*code.*://settings/([^\\s"]+)"(?:\\s*codesetting="([^"]+)")?>`);
        this.codeSettingSimpleRegex = new RegExp(`^setting\\(([^\\s:)]+)(?::([^)]+))?\\)$`);
    }
    get featuredSettingStates() {
        const result = new Map();
        for (const [settingId, value] of this._featuredSettings) {
            result.set(settingId, this._configurationService.getValue(settingId) === value);
        }
        return result;
    }
    replaceAnchor(raw) {
        const match = this.codeSettingAnchorRegex.exec(raw);
        if (match && match.length === 4) {
            const settingId = match[2];
            const rendered = this.render(settingId, match[3]);
            if (rendered) {
                return raw.replace(this.codeSettingAnchorRegex, rendered);
            }
        }
        return undefined;
    }
    replaceSimple(raw) {
        const match = this.codeSettingSimpleRegex.exec(raw);
        if (match && match.length === 3) {
            const settingId = match[1];
            const rendered = this.render(settingId, match[2]);
            if (rendered) {
                return raw.replace(this.codeSettingSimpleRegex, rendered);
            }
        }
        return undefined;
    }
    getHtmlRenderer() {
        return ({ raw }) => {
            const replacedAnchor = this.replaceAnchor(raw);
            if (replacedAnchor) {
                raw = replacedAnchor;
            }
            return raw;
        };
    }
    getCodeSpanRenderer() {
        return ({ text }) => {
            const replacedSimple = this.replaceSimple(text);
            if (replacedSimple) {
                return replacedSimple;
            }
            return `<code>${text}</code>`;
        };
    }
    settingToUriString(settingId, value) {
        return `${Schemas.codeSetting}://${settingId}${value ? `/${value}` : ''}`;
    }
    getSetting(settingId) {
        if (this._encounteredSettings.has(settingId)) {
            return this._encounteredSettings.get(settingId);
        }
        return this._preferencesService.getSetting(settingId);
    }
    parseValue(settingId, value) {
        if (value === 'undefined' || value === '') {
            return undefined;
        }
        const setting = this.getSetting(settingId);
        if (!setting) {
            return value;
        }
        switch (setting.type) {
            case 'boolean':
                return value === 'true';
            case 'number':
                return parseInt(value, 10);
            case 'string':
            default:
                return value;
        }
    }
    render(settingId, newValue) {
        const setting = this.getSetting(settingId);
        if (!setting) {
            return `<code>${settingId}</code>`;
        }
        return this.renderSetting(setting, newValue);
    }
    viewInSettingsMessage(settingId, alreadyDisplayed) {
        if (alreadyDisplayed) {
            return nls.localize('viewInSettings', "View in Settings");
        }
        else {
            const displayName = settingKeyToDisplayFormat(settingId);
            return nls.localize('viewInSettingsDetailed', "View \"{0}: {1}\" in Settings", displayName.category, displayName.label);
        }
    }
    restorePreviousSettingMessage(settingId) {
        const displayName = settingKeyToDisplayFormat(settingId);
        return nls.localize('restorePreviousValue', "Restore value of \"{0}: {1}\"", displayName.category, displayName.label);
    }
    isAlreadySet(setting, value) {
        const currentValue = this._configurationService.getValue(setting.key);
        return (currentValue === value || (currentValue === undefined && setting.value === value));
    }
    booleanSettingMessage(setting, booleanValue) {
        const displayName = settingKeyToDisplayFormat(setting.key);
        if (this.isAlreadySet(setting, booleanValue)) {
            if (booleanValue) {
                return nls.localize('alreadysetBoolTrue', "\"{0}: {1}\" is already enabled", displayName.category, displayName.label);
            }
            else {
                return nls.localize('alreadysetBoolFalse', "\"{0}: {1}\" is already disabled", displayName.category, displayName.label);
            }
        }
        if (booleanValue) {
            return nls.localize('trueMessage', "Enable \"{0}: {1}\"", displayName.category, displayName.label);
        }
        else {
            return nls.localize('falseMessage', "Disable \"{0}: {1}\"", displayName.category, displayName.label);
        }
    }
    stringSettingMessage(setting, stringValue) {
        const displayName = settingKeyToDisplayFormat(setting.key);
        if (this.isAlreadySet(setting, stringValue)) {
            return nls.localize('alreadysetString', "\"{0}: {1}\" is already set to \"{2}\"", displayName.category, displayName.label, stringValue);
        }
        return nls.localize('stringValue', "Set \"{0}: {1}\" to \"{2}\"", displayName.category, displayName.label, stringValue);
    }
    numberSettingMessage(setting, numberValue) {
        const displayName = settingKeyToDisplayFormat(setting.key);
        if (this.isAlreadySet(setting, numberValue)) {
            return nls.localize('alreadysetNum', "\"{0}: {1}\" is already set to {2}", displayName.category, displayName.label, numberValue);
        }
        return nls.localize('numberValue', "Set \"{0}: {1}\" to {2}", displayName.category, displayName.label, numberValue);
    }
    renderSetting(setting, newValue) {
        const href = this.settingToUriString(setting.key, newValue);
        const title = nls.localize('changeSettingTitle', "View or change setting");
        return `<code tabindex="0"><a href="${href}" class="codesetting" title="${title}" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">${setting.key}</span>
		</a></code>`;
    }
    getSettingMessage(setting, newValue) {
        if (setting.type === 'boolean') {
            return this.booleanSettingMessage(setting, newValue);
        }
        else if (setting.type === 'string') {
            return this.stringSettingMessage(setting, newValue);
        }
        else if (setting.type === 'number') {
            return this.numberSettingMessage(setting, newValue);
        }
        return undefined;
    }
    async restoreSetting(settingId) {
        const userOriginalSettingValue = this._updatedSettings.get(settingId);
        this._updatedSettings.delete(settingId);
        return this._configurationService.updateValue(settingId, userOriginalSettingValue, 2 /* ConfigurationTarget.USER */);
    }
    async setSetting(settingId, currentSettingValue, newSettingValue) {
        this._updatedSettings.set(settingId, currentSettingValue);
        return this._configurationService.updateValue(settingId, newSettingValue, 2 /* ConfigurationTarget.USER */);
    }
    getActions(uri) {
        if (uri.scheme !== Schemas.codeSetting) {
            return;
        }
        const actions = [];
        const settingId = uri.authority;
        const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
        const currentSettingValue = this._configurationService.inspect(settingId).userValue;
        if ((newSettingValue !== undefined) && newSettingValue === currentSettingValue && this._updatedSettings.has(settingId)) {
            const restoreMessage = this.restorePreviousSettingMessage(settingId);
            actions.push({
                class: undefined,
                id: 'restoreSetting',
                enabled: true,
                tooltip: restoreMessage,
                label: restoreMessage,
                run: () => {
                    return this.restoreSetting(settingId);
                }
            });
        }
        else if (newSettingValue !== undefined) {
            const setting = this.getSetting(settingId);
            const trySettingMessage = setting ? this.getSettingMessage(setting, newSettingValue) : undefined;
            if (setting && trySettingMessage) {
                actions.push({
                    class: undefined,
                    id: 'trySetting',
                    enabled: !this.isAlreadySet(setting, newSettingValue),
                    tooltip: trySettingMessage,
                    label: trySettingMessage,
                    run: () => {
                        this.setSetting(settingId, currentSettingValue, newSettingValue);
                    }
                });
            }
        }
        const viewInSettingsMessage = this.viewInSettingsMessage(settingId, actions.length > 0);
        actions.push({
            class: undefined,
            enabled: true,
            id: 'viewInSettings',
            tooltip: viewInSettingsMessage,
            label: viewInSettingsMessage,
            run: () => {
                return this._preferencesService.openApplicationSettings({ query: `@id:${settingId}` });
            }
        });
        actions.push({
            class: undefined,
            enabled: true,
            id: 'copySettingId',
            tooltip: nls.localize('copySettingId', "Copy Setting ID"),
            label: nls.localize('copySettingId', "Copy Setting ID"),
            run: () => {
                this._clipboardService.writeText(settingId);
            }
        });
        return actions;
    }
    showContextMenu(uri, x, y) {
        const actions = this.getActions(uri);
        if (!actions) {
            return;
        }
        this._contextMenuService.showContextMenu({
            getAnchor: () => ({ x, y }),
            getActions: () => actions,
            getActionViewItem: (action) => {
                return new ActionViewItem(action, action, { label: true });
            },
        });
    }
    async updateSetting(uri, x, y) {
        if (uri.scheme === Schemas.codeSetting) {
            this._telemetryService.publicLog2('releaseNotesSettingAction', {
                settingId: uri.authority
            });
            return this.showContextMenu(uri, x, y);
        }
    }
};
SimpleSettingRenderer = __decorate([
    __param(0, IConfigurationService),
    __param(1, IContextMenuService),
    __param(2, IPreferencesService),
    __param(3, ITelemetryService),
    __param(4, IClipboardService)
], SimpleSettingRenderer);
export { SimpleSettingRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25TZXR0aW5nUmVuZGVyZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tYXJrZG93bi9icm93c2VyL21hcmtkb3duU2V0dGluZ1JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUcxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLG1CQUFtQixFQUFZLE1BQU0scURBQXFELENBQUM7QUFDcEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFckYsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFRakMsWUFDd0IscUJBQTZELEVBQy9ELG1CQUF5RCxFQUN6RCxtQkFBeUQsRUFDM0QsaUJBQXFELEVBQ3JELGlCQUFxRDtRQUpoQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzlDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDeEMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUMxQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBQ3BDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFUakUscUJB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