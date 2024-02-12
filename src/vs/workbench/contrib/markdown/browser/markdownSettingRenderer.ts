/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';
import { settingKeyToDisplayFormat } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DefaultSettings } from 'vs/workbench/services/preferences/common/preferencesModels';

const codeSettingRegex = /^<span codesetting="([^\s"\:]+)(?::([^\s"]+))?">/;

export class SimpleSettingRenderer {
	private defaultSettings: DefaultSettings;
	private updatedSettings = new Map<string, any>(); // setting ID to user's original setting value
	private encounteredSettings = new Map<string, ISetting>(); // setting ID to setting

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.defaultSettings = new DefaultSettings([], ConfigurationTarget.USER);
	}

	getHtmlRenderer(): (html: string) => string {
		return (html): string => {
			const match = codeSettingRegex.exec(html);
			if (match && match.length === 3) {
				const settingId = match[1];
				const rendered = this.render(settingId, match[2]);
				if (rendered) {
					html = html.replace(codeSettingRegex, rendered);
				}
			}
			return html;
		};
	}

	private settingsGroups: ISettingsGroup[] | undefined = undefined;
	private getSetting(settingId: string): ISetting | undefined {
		if (!this.settingsGroups) {
			this.settingsGroups = this.defaultSettings.getSettingsGroups();
		}
		if (this.encounteredSettings.has(settingId)) {
			return this.encounteredSettings.get(settingId);
		}
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (setting.key === settingId) {
						this.encounteredSettings.set(settingId, setting);
						return setting;
					}
				}
			}
		}
		return undefined;
	}

	parseValue(settingId: string, value: string): any {
		if (value === 'undefined') {
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
			return '';
		}

		return this.renderSetting(setting, newValue);
	}

	private viewInSettings(settingId: string, alreadySet: boolean): string {
		let message: string;
		if (alreadySet) {
			const displayName = settingKeyToDisplayFormat(settingId);
			message = nls.localize('viewInSettingsDetailed', "View \"{0}: {1}\" in Settings", displayName.category, displayName.label);
		} else {
			message = nls.localize('viewInSettings', "View in Settings");
		}
		return `<a href="${URI.parse(`command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify([`@id:${settingId}`]))}`)}">${message}</a>`;
	}

	private renderRestorePreviousSetting(settingId: string): string {
		const displayName = settingKeyToDisplayFormat(settingId);
		const value = this.updatedSettings.get(settingId);
		const message = nls.localize('restorePreviousValue', "Restore value of \"{0}: {1}\"", displayName.category, displayName.label);
		return `<a href="${Schemas.codeSetting}://${settingId}/${value}">${message}</a>`;
	}

	private renderBooleanSetting(setting: ISetting, value: string): string | undefined {
		const booleanValue: boolean = value === 'true' ? true : false;
		const currentValue = this.configurationService.getValue<boolean>(setting.key);
		if (currentValue === booleanValue || (currentValue === undefined && setting.value === booleanValue)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		let message: string;
		if (booleanValue) {
			message = nls.localize('trueMessage', "Enable \"{0}: {1}\" now", displayName.category, displayName.label);
		} else {
			message = nls.localize('falseMessage', "Disable \"{0}: {1}\" now", displayName.category, displayName.label);
		}
		return `<a href="${Schemas.codeSetting}://${setting.key}/${value}">${message}</a>`;
	}

	private renderStringSetting(setting: ISetting, value: string): string | undefined {
		const currentValue = this.configurationService.getValue<string>(setting.key);
		if (currentValue === value || (currentValue === undefined && setting.value === value)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		const message = nls.localize('stringValue', "Set \"{0}: {1}\" to \"{2}\" now", displayName.category, displayName.label, value);
		return `<a href="${Schemas.codeSetting}://${setting.key}/${value}">${message}</a>`;
	}

	private renderNumberSetting(setting: ISetting, value: string): string | undefined {
		const numberValue: number = parseInt(value, 10);
		const currentValue = this.configurationService.getValue<number>(setting.key);
		if (currentValue === numberValue || (currentValue === undefined && setting.value === numberValue)) {
			return undefined;
		}

		const displayName = settingKeyToDisplayFormat(setting.key);
		const message = nls.localize('numberValue', "Set \"{0}: {1}\" to {2} now", displayName.category, displayName.label, numberValue);
		return `<a href="${Schemas.codeSetting}://${setting.key}/${value}">${message}</a>`;

	}

	private renderSetting(setting: ISetting, newValue: string | undefined): string | undefined {
		let renderedSetting: string | undefined;

		if (newValue !== undefined) {
			if (this.updatedSettings.has(setting.key)) {
				renderedSetting = this.renderRestorePreviousSetting(setting.key);
			} else if (setting.type === 'boolean') {
				renderedSetting = this.renderBooleanSetting(setting, newValue);
			} else if (setting.type === 'string') {
				renderedSetting = this.renderStringSetting(setting, newValue);
			} else if (setting.type === 'number') {
				renderedSetting = this.renderNumberSetting(setting, newValue);
			}
		}

		if (!renderedSetting) {
			return `(${this.viewInSettings(setting.key, true)})`;
		}

		return nls.localize({ key: 'fullRenderedSetting', comment: ['A pair of already localized links. The first argument is a link to change a setting, the second is a link to view the setting.'] },
			"({0} | {1})", renderedSetting, this.viewInSettings(setting.key, false),);
	}

	async updateSettingValue(uri: URI) {
		if (uri.scheme !== Schemas.codeSetting) {
			return;
		}
		const settingId = uri.authority;
		const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
		const oldSettingValue = this.configurationService.inspect(settingId).userValue;
		if (newSettingValue === this.updatedSettings.get(settingId)) {
			this.updatedSettings.delete(settingId);
		} else {
			this.updatedSettings.set(settingId, oldSettingValue);
		}
		await this.configurationService.updateValue(settingId, newSettingValue, ConfigurationTarget.USER);
	}
}
