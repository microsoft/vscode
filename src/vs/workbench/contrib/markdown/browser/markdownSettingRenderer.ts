/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import type { Tokens } from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IPreferencesService, ISetting } from '../../../services/preferences/common/preferences.js';
import { settingKeyToDisplayFormat } from '../../preferences/browser/settingsTreeModels.js';

export class SimpleSettingRenderer {
	private readonly codeSettingAnchorRegex: RegExp;
	private readonly codeSettingSimpleRegex: RegExp;

	private _updatedSettings = new Map<string, any>(); // setting ID to user's original setting value
	private _encounteredSettings = new Map<string, ISetting>(); // setting ID to setting
	private _featuredSettings = new Map<string, any>(); // setting ID to feature value

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
	) {
		this.codeSettingAnchorRegex = new RegExp(`^<a (href)=".*code.*://settings/([^\\s"]+)"(?:\\s*codesetting="([^"]+)")?>`);
		this.codeSettingSimpleRegex = new RegExp(`^setting\\(([^\\s:)]+)(?::([^)]+))?\\)$`);
	}

	get featuredSettingStates(): Map<string, boolean> {
		const result = new Map<string, boolean>();
		for (const [settingId, value] of this._featuredSettings) {
			result.set(settingId, this._configurationService.getValue(settingId) === value);
		}
		return result;
	}

	private replaceAnchor(raw: string): string | undefined {
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

	private replaceSimple(raw: string): string | undefined {
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

	getHtmlRenderer(): (token: Tokens.HTML | Tokens.Tag) => string {
		return ({ raw }: Tokens.HTML | Tokens.Tag): string => {
			const replacedAnchor = this.replaceAnchor(raw);
			if (replacedAnchor) {
				raw = replacedAnchor;
			}
			return raw;
		};
	}

	getCodeSpanRenderer(): (token: Tokens.Codespan) => string {
		return ({ text }: Tokens.Codespan): string => {
			const replacedSimple = this.replaceSimple(text);
			if (replacedSimple) {
				return replacedSimple;
			}
			return `<code>${text}</code>`;
		};
	}

	settingToUriString(settingId: string, value?: any): string {
		return `${Schemas.codeSetting}://${settingId}${value ? `/${value}` : ''}`;
	}

	private getSetting(settingId: string): ISetting | undefined {
		if (this._encounteredSettings.has(settingId)) {
			return this._encounteredSettings.get(settingId);
		}
		return this._preferencesService.getSetting(settingId);
	}

	parseValue(settingId: string, value: string) {
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

	private render(settingId: string, newValue: string): string | undefined {
		const setting = this.getSetting(settingId);
		if (!setting) {
			return `<code>${settingId}</code>`;
		}

		return this.renderSetting(setting, newValue);
	}

	private viewInSettingsMessage(settingId: string, alreadyDisplayed: boolean) {
		if (alreadyDisplayed) {
			return nls.localize('viewInSettings', "View in Settings");
		} else {
			const displayName = settingKeyToDisplayFormat(settingId);
			return nls.localize('viewInSettingsDetailed', "View \"{0}: {1}\" in Settings", displayName.category, displayName.label);
		}
	}

	private restorePreviousSettingMessage(settingId: string): string {
		const displayName = settingKeyToDisplayFormat(settingId);
		return nls.localize('restorePreviousValue', "Restore value of \"{0}: {1}\"", displayName.category, displayName.label);
	}

	private isAlreadySet(setting: ISetting, value: string | number | boolean): boolean {
		const currentValue = this._configurationService.getValue<boolean>(setting.key);
		return (currentValue === value || (currentValue === undefined && setting.value === value));
	}

	private booleanSettingMessage(setting: ISetting, booleanValue: boolean): string | undefined {
		const displayName = settingKeyToDisplayFormat(setting.key);
		if (this.isAlreadySet(setting, booleanValue)) {
			if (booleanValue) {
				return nls.localize('alreadysetBoolTrue', "\"{0}: {1}\" is already enabled", displayName.category, displayName.label);
			} else {
				return nls.localize('alreadysetBoolFalse', "\"{0}: {1}\" is already disabled", displayName.category, displayName.label);
			}
		}

		if (booleanValue) {
			return nls.localize('trueMessage', "Enable \"{0}: {1}\"", displayName.category, displayName.label);
		} else {
			return nls.localize('falseMessage', "Disable \"{0}: {1}\"", displayName.category, displayName.label);
		}
	}

	private stringSettingMessage(setting: ISetting, stringValue: string): string | undefined {
		const displayName = settingKeyToDisplayFormat(setting.key);
		if (this.isAlreadySet(setting, stringValue)) {
			return nls.localize('alreadysetString', "\"{0}: {1}\" is already set to \"{2}\"", displayName.category, displayName.label, stringValue);
		}

		return nls.localize('stringValue', "Set \"{0}: {1}\" to \"{2}\"", displayName.category, displayName.label, stringValue);
	}

	private numberSettingMessage(setting: ISetting, numberValue: number): string | undefined {
		const displayName = settingKeyToDisplayFormat(setting.key);
		if (this.isAlreadySet(setting, numberValue)) {
			return nls.localize('alreadysetNum', "\"{0}: {1}\" is already set to {2}", displayName.category, displayName.label, numberValue);
		}

		return nls.localize('numberValue', "Set \"{0}: {1}\" to {2}", displayName.category, displayName.label, numberValue);

	}

	private renderSetting(setting: ISetting, newValue: string | undefined): string | undefined {
		const href = this.settingToUriString(setting.key, newValue);
		const title = nls.localize('changeSettingTitle', "View or change setting");
		return `<code tabindex="0"><a href="${href}" class="codesetting" title="${title}" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">${setting.key}</span>
		</a></code>`;
	}

	private getSettingMessage(setting: ISetting, newValue: boolean | string | number): string | undefined {
		if (setting.type === 'boolean') {
			return this.booleanSettingMessage(setting, newValue as boolean);
		} else if (setting.type === 'string') {
			return this.stringSettingMessage(setting, newValue as string);
		} else if (setting.type === 'number') {
			return this.numberSettingMessage(setting, newValue as number);
		}
		return undefined;
	}

	async restoreSetting(settingId: string): Promise<void> {
		const userOriginalSettingValue = this._updatedSettings.get(settingId);
		this._updatedSettings.delete(settingId);
		return this._configurationService.updateValue(settingId, userOriginalSettingValue, ConfigurationTarget.USER);
	}

	async setSetting(settingId: string, currentSettingValue: any, newSettingValue: any): Promise<void> {
		this._updatedSettings.set(settingId, currentSettingValue);
		return this._configurationService.updateValue(settingId, newSettingValue, ConfigurationTarget.USER);
	}

	getActions(uri: URI) {
		if (uri.scheme !== Schemas.codeSetting) {
			return;
		}

		const actions: IAction[] = [];

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
		} else if (newSettingValue !== undefined) {
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

	private showContextMenu(uri: URI, x: number, y: number) {
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

	async updateSetting(uri: URI, x: number, y: number) {
		if (uri.scheme === Schemas.codeSetting) {
			type ReleaseNotesSettingUsedClassification = {
				owner: 'alexr00';
				comment: 'Used to understand if the action to update settings from the release notes is used.';
				settingId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the setting that was clicked on in the release notes' };
			};
			type ReleaseNotesSettingUsed = {
				settingId: string;
			};
			this._telemetryService.publicLog2<ReleaseNotesSettingUsed, ReleaseNotesSettingUsedClassification>('releaseNotesSettingAction', {
				settingId: uri.authority
			});
			return this.showContextMenu(uri, x, y);
		}
	}
}
