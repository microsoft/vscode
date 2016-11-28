/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { assign } from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { visit, JSONVisitor } from 'vs/base/common/json';
import { IModel } from 'vs/editor/common/editorCommon';
import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ISettingsEditorModel, IKeybindingsEditorModel, ISettingsGroup, ISetting } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';

export class SettingsEditorModel extends Disposable implements ISettingsEditorModel {

	private _settingsGroups: ISettingsGroup[];

	constructor(private model: IModel, private _configurationTarget: ConfigurationTarget) {
		super();
		this._register(this.model.onDidChangeContent(() => {
			this._settingsGroups = null;
		}));
	}

	public get uri(): URI {
		return this.model.uri;
	}

	public get configurationTarget(): ConfigurationTarget {
		return this._configurationTarget;
	}

	public get settingsGroups(): ISettingsGroup[] {
		if (!this._settingsGroups) {
			this.parse();
		}
		return this._settingsGroups;
	}

	public get content(): string {
		return this.model.getValue();
	}

	private parse() {
		const model = this.model;
		const settings: ISetting[] = [];
		let parsingSettings = false;
		let parsingSettingValue = false;

		let currentProperty: string = null;
		let currentParent: any = [];
		let previousParents: any[] = [];

		function onValue(value: any, offset: number, length: number) {
			if (Array.isArray(currentParent)) {
				(<any[]>currentParent).push(value);
			} else if (currentProperty) {
				currentParent[currentProperty] = value;
			}
			if (previousParents.length === 1) {
				let valueStartPosition = model.getPositionAt(offset);
				let valueEndPosition = model.getPositionAt(offset + length);
				settings[settings.length - 1].value = value;
				settings[settings.length - 1].valueRange = {
					startLineNumber: valueStartPosition.lineNumber,
					startColumn: valueStartPosition.column,
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				};
				settings[settings.length - 1].range = assign(settings[settings.length - 1].range, {
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				});
			}
		}
		let visitor: JSONVisitor = {
			onObjectBegin: (offset: number, length: number) => {
				if (!parsingSettings) {
					parsingSettings = true;
				} else {
					parsingSettingValue = true;
				}
				let object = {};
				onValue(object, offset, length);
				currentParent = object;
				currentProperty = null;
				previousParents.push(currentParent);
			},
			onObjectProperty: (name: string, offset: number, length: number) => {
				currentProperty = name;
				if (parsingSettings && !parsingSettingValue) {
					let settingStartPosition = model.getPositionAt(offset);
					settings.push({
						key: name,
						description: '',
						range: {
							startLineNumber: settingStartPosition.lineNumber,
							startColumn: settingStartPosition.column,
							endLineNumber: 0,
							endColumn: 0
						},
						value: null,
						valueRange: null
					});
				}
			},
			onObjectEnd: (offset: number, length: number) => {
				currentParent = previousParents.pop();
				if (previousParents.length === 1) {
					let valueEndPosition = model.getPositionAt(offset + length);
					settings[settings.length - 1].valueRange = assign(settings[settings.length - 1].valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					settings[settings.length - 1].range = assign(settings[settings.length - 1].range, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
				}
				if (parsingSettingValue) {
					parsingSettingValue = false;
				} else if (parsingSettings) {
					parsingSettings = false;
				}
			},
			onArrayBegin: (offset: number, length: number) => {
				let array = [];
				onValue(array, offset, length);
				previousParents.push(currentParent);
				currentParent = array;
				currentProperty = null;
			},
			onArrayEnd: (offset: number, length: number) => {
				if (parsingSettings && !parsingSettingValue && settings.length > 0) {
					let valueEndPosition = model.getPositionAt(offset + length);
					settings[settings.length - 1].valueRange = assign(settings[settings.length - 1].valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					settings[settings.length - 1].range = assign(settings[settings.length - 1].range, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
				}
				currentParent = previousParents.pop();
			},
			onLiteralValue: onValue,
			onError: (error) => {
			}
		};
		visit(model.getValue(), visitor);
		this._settingsGroups = settings.length > 0 ? [<ISettingsGroup>{
			sections: [
				{
					settings
				}
			],
			title: null,
			titleRange: null,
			range: {
				startLineNumber: settings[0].range.startLineNumber,
				startColumn: settings[0].range.startColumn,
				endLineNumber: settings[settings.length - 1].range.endLineNumber,
				endColumn: settings[settings.length - 1].range.endColumn,
			}
		}] : [];
	}
}

export class DefaultSettingsEditorModel implements ISettingsEditorModel {

	private indent: string;

	private _settingsGroups: ISettingsGroup[];
	private _content: string;
	private _contentByLines: string[];

	constructor(private _uri: URI, @IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService) {
		const editorConfig = this.configurationService.getConfiguration<any>();
		this.indent = editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t';
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		if (!this._content) {
			this.parse();
		}
		return this._content;
	}

	public get settingsGroups(): ISettingsGroup[] {
		if (!this._settingsGroups) {
			this.parse();
		}
		return this._settingsGroups;
	}

	private parse() {
		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
		this._settingsGroups = configurations.sort(this.compareConfigurationNodes).reduce((result, config) => this.parseConfig(config, result), []);
		this._content = this.toContent(this.settingsGroups);
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		if (config.title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === config.title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], title: config.title, titleRange: null, range: null };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].description = config.title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], title: config.id, titleRange: null, range: null };
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
		this._contentByLines = [];

		this._contentByLines.push('// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file."));
		this._contentByLines.push('// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings."));
		this._contentByLines.push('{');

		for (const group of settingsGroups) {

			let groupTitleStart = this._contentByLines.length + 1;
			this.addTitleOrDescription(group.title, '', this._contentByLines);
			group.titleRange = { startLineNumber: groupTitleStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };

			for (const section of group.sections) {
				if (section.description) {
					let sectionTitleStart = this._contentByLines.length + 1;
					this.addTitleOrDescription(section.description, this.indent, this._contentByLines);
					section.descriptionRange = { startLineNumber: sectionTitleStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
				}

				for (const setting of section.settings) {
					const settingStart = this._contentByLines.length + 1;
					this.addTitleOrDescription(setting.description, this.indent, this._contentByLines);

					const valueStart = this._contentByLines.length + 1;
					let valueString = JSON.stringify(setting.value, null, this.indent);
					const preValueContent = this.indent + JSON.stringify(setting.key) + ': ';
					if (valueString && (typeof setting.value === 'object')) {
						const mulitLineValue = valueString.split('\n');
						this._contentByLines.push(preValueContent + mulitLineValue[0]);
						for (let i = 1; i < mulitLineValue.length; i++) {
							this._contentByLines.push(this.indent + mulitLineValue[i]);
						}
					} else {
						this._contentByLines.push(preValueContent + valueString);
					}

					setting.valueRange = { startLineNumber: valueStart, startColumn: preValueContent.length + 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length + 1 };
					this._contentByLines[this._contentByLines.length - 1] += ',';
					lastSetting = setting;
					this._contentByLines.push('');
					setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
				}
			}
			group.range = { startLineNumber: groupTitleStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
		}

		if (lastSetting) {
			const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
			this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
		}
		this._contentByLines.push('}');
		return this._contentByLines.join('\n');
	}

	private addTitleOrDescription(description: string, indent: string, result: string[]) {
		const multiLines = description.split('\n');
		for (const line of multiLines) {
			result.push(indent + '//' + line);
		}
	}
}

export class DefaultKeybindingsEditorModel implements IKeybindingsEditorModel {

	private _content: string;

	constructor(private _uri: URI, @IKeybindingService private keybindingService: IKeybindingService) {
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