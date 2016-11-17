/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as network from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/platform';
import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDefaultSettings, IDefaultKeybindings, ISettingsGroup, ISetting } from 'vs/workbench/parts/settings/common/openSettings';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class DefaultSettings implements IDefaultSettings {

	private _uri: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' });
	private indent: string;

	private _settingsGroups: ISettingsGroup[];
	private _content: string;

	constructor( @IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService) {
		const editorConfig = this.configurationService.getConfiguration<any>();
		this.indent = editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t';
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		if (!this._content) {
			this._content = this.toContent(this.settingsGroups);
		}
		return this._content;
	}

	public get settingsGroups(): ISettingsGroup[] {
		if (!this._settingsGroups) {
			const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
			this._settingsGroups = configurations.sort(this.compareConfigurationNodes).reduce((result, config) => this.parseConfig(config, result), []);
		}
		return this._settingsGroups;
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		if (config.title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === config.title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], title: config.title, titleRange: null };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].title = config.title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], title: config.id, titleRange: null };
				result.push(settingsGroup);
			}
			const configurationSettings: ISetting[] = Object.keys(config.properties).map((key) => {
				const prop = config.properties[key];
				const value = prop.default;
				const description = prop.description || '';
				return { key, value, description, range: null, valueRange: null };
			});
			settingsGroup.sections[settingsGroup.sections.length - 1].settings.push(...configurationSettings);
		}
		if (config.allOf) {
			config.allOf.forEach(c => this.parseConfig(c, result, settingsGroup));
		}
		return result;
	}

	private compareConfigurationNodes(c1: IConfigurationNode, c2: IConfigurationNode): number {
		if (typeof c1.order !== 'number') {
			return 1;
		}
		if (typeof c2.order !== 'number') {
			return -1;
		}
		if (c1.order === c2.order) {
			const title1 = c1.title || '';
			const title2 = c2.title || '';
			return title1.localeCompare(title2);
		}
		return c1.order - c2.order;
	}

	private toContent(settingsGroups: ISettingsGroup[]): string {
		let lastSetting: ISetting = null;
		const result: string[] = [];

		result.push('// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file."));
		result.push('// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings."));
		result.push('{');

		for (const group of settingsGroups) {
			this.addTitleOrDescription(group.title, '', result);
			let groupTitleStart = result.length + 1;
			group.titleRange = { startLineNumber: groupTitleStart, startColumn: 1, endLineNumber: result.length, endColumn: result[result.length - 1].length };
			for (const section of group.sections) {
				if (section.title) {
					let sectionTitleStart = result.length + 1;
					this.addTitleOrDescription(section.title, this.indent, result);
					section.titleRange = { startLineNumber: sectionTitleStart, startColumn: 1, endLineNumber: result.length, endColumn: result[result.length - 1].length };
				}
				for (const setting of section.settings) {
					const settingStart = result.length + 1;
					this.addTitleOrDescription(setting.description, this.indent, result);
					const valueStart = result.length + 1;
					let valueString = JSON.stringify(setting.value, null, this.indent);
					if (valueString && (typeof setting.value === 'object')) {
						const mulitLineValue = valueString.split('\n');
						result.push(this.indent + JSON.stringify(setting.key) + ': ' + mulitLineValue[0]);
						for (let i = 1; i < mulitLineValue.length; i++) {
							result.push(this.indent + mulitLineValue[i]);
						}
					} else {
						result.push(this.indent + JSON.stringify(setting.key) + ': ' + valueString);
					}
					result[result.length - 1] += ',';
					lastSetting = setting;
					result.push('');
					setting.valueRange = { startLineNumber: valueStart, startColumn: 1, endLineNumber: result.length, endColumn: result[result.length - 1].length };
					setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: result.length, endColumn: result[result.length - 1].length };
				}
			}
		}

		if (lastSetting) {
			const content = result[lastSetting.range.endLineNumber - 2];
			result[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
		}
		result.push('}');
		return result.join('\n');
	}

	private addTitleOrDescription(description: string, indent: string, result: string[]) {
		const multiLines = description.split('\n');
		for (const line of multiLines) {
			result.push(indent + '//' + line);
		}
	}
}

export class DefaultKeybindings implements IDefaultKeybindings {

	private _uri: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });
	private _content: string;

	constructor( @IKeybindingService private keybindingService: IKeybindingService) {
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		if (!this._content) {
			const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
			this._content = defaultsHeader + '\n' + this.keybindingService.getDefaultKeybindings();
		}
		return this._content;
	}
}