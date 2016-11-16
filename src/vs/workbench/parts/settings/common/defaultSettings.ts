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
import { IDefaultSettings, IDefaultKeybindings, ISettingsGroup } from 'vs/workbench/parts/settings/common/openSettings';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class DefaultSettings implements IDefaultSettings {

	private _uri: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' });
	private _content: string;
	private _settingsGroups: ISettingsGroup[];
	private indent: string;

	constructor( @IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService) {
		const editorConfig = this.configurationService.getConfiguration<any>();
		this.indent = editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t';

		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
		this._settingsGroups = configurations.sort(this.compareConfigurationNodes).reduce((result, config) => this.parseConfig(config, result), []);
		this._content = this.toContent();
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		return this._content;
	}

	public getSettingsGroups(): ISettingsGroup[] {
		return this._settingsGroups;
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		if (config.title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === config.title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], title: config.title };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].description = config.title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], title: config.id };
				result.push(settingsGroup);
			}
			const configurationSettings = Object.keys(config.properties).map((key) => {
				const prop = config.properties[key];
				const value = prop.default;
				const description = prop.description || '';
				return { key, value, description };
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

	private toContent(): string {
		let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.\n");
		defaultsHeader += '// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings.\n\n");

		let lastEntry = -1;
		const result: string[] = [];
		result.push('{');
		let lineNumber = 4; // Beginning of settings
		for (const group of this._settingsGroups) {
			result.push('// ' + group.title);
			lineNumber++;
			group.range = { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 };
			for (const section of group.sections) {
				if (section.description) {
					result.push(this.indent + '// ' + section.description);
					lineNumber++;
					section.range = { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 };
				}
				for (const setting of section.settings) {
					result.push(this.indent + '// ' + setting.description);
					lineNumber++;
					const settingStart = lineNumber;
					let valueString = JSON.stringify(setting.value, null, this.indent);
					let valueLines = 1;
					if (valueString && (typeof setting.value === 'object')) {
						const mulitLineValue = valueString.split('\n');
						valueString = mulitLineValue.join('\n' + this.indent);
						valueLines = mulitLineValue.length;
					}
					if (lastEntry !== -1) {
						result[lastEntry] += ',';
					}
					lastEntry = result.length;
					result.push(this.indent + JSON.stringify(setting.key) + ': ' + valueString);
					lineNumber += valueLines;
					setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 };
					result.push('');
					lineNumber++;
				}
			}
		}
		result.push('}');

		return defaultsHeader + result.join('\n');
	}
}

export class DefaultKeybindings implements IDefaultKeybindings {

	private _uri: URI;
	private _content: string;

	constructor( @IKeybindingService keybindingService: IKeybindingService) {
		this._uri = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });

		const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
		this._content = defaultsHeader + '\n' + keybindingService.getDefaultKeybindings();
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		return this._content;
	}
}