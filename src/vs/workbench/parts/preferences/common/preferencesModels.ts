/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { assign } from 'vs/base/common/objects';
import { LinkedMap as Map } from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { visit, JSONVisitor } from 'vs/base/common/json';
import { IModel, IRange } from 'vs/editor/common/editorCommon';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IConfigurationNode, IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';
import { ISettingsEditorModel, IKeybindingsEditorModel, ISettingsGroup, ISetting, IFilterResult, ISettingsSection } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IMatch, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';

export abstract class AbstractSettingsModel extends Disposable {

	public get groupsTerms(): string[] {
		return this.settingsGroups.map(group => '@' + group.id);
	}

	protected doFilterSettings(filter: string, allGroups: ISettingsGroup[]): IFilterResult {
		if (!filter) {
			return {
				filteredGroups: allGroups,
				allGroups,
				matches: new Map<string, IRange[]>()
			};
		}

		const group = this.filterByGroupTerm(filter);
		if (group) {
			return {
				filteredGroups: [group],
				allGroups,
				matches: new Map<string, IRange[]>()
			};
		}

		const matches: Map<string, IRange[]> = new Map<string, IRange[]>();
		const filteredGroups: ISettingsGroup[] = [];
		const regex = strings.createRegExp(filter, false, { global: true });
		for (const group of allGroups) {
			const groupMatched = regex.test(group.title);
			const sections: ISettingsSection[] = [];
			for (const section of group.sections) {
				const settings: ISetting[] = [];
				for (const setting of section.settings) {
					const settingMatches = this._findMatchesInSetting(filter, setting);
					if (groupMatched || settingMatches.length > 0) {
						settings.push(setting);
					}
					matches.set(group.title + setting.key, settingMatches);
				}
				if (settings.length) {
					sections.push({
						title: section.title,
						settings,
						titleRange: section.titleRange
					});
				}
			}
			if (sections.length) {
				filteredGroups.push({
					id: group.id,
					title: group.title,
					titleRange: group.titleRange,
					sections,
					range: group.range
				});
			}
		}
		return { filteredGroups, matches, allGroups };
	}

	private filterByGroupTerm(filter: string): ISettingsGroup {
		if (this.groupsTerms.indexOf(filter) !== -1) {
			const id = filter.substring(1);
			return this.settingsGroups.filter(group => group.id === id)[0];
		}
		return null;
	}

	public getPreference(key: string): ISetting {
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (key === setting.key) {
						return setting;
					}
				}
			}
		}
		return null;
	}

	private _findMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const registry: { [qualifiedKey: string]: IJSONSchema } = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const schema: IJSONSchema = registry[setting.key];

		let words = searchString.split(' ');
		let descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		let keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		let valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		const settingKeyAsWords: string = setting.key.split('.').join(' ');

		for (const word of words) {
			for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
				const descriptionMatches = matchesWords(word, setting.description[lineIndex], true);
				if (descriptionMatches) {
					descriptionMatchingWords.set(word, descriptionMatches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
				}
			}

			const keyMatches = or(matchesWords, matchesCamelCase)(word, settingKeyAsWords);
			if (keyMatches) {
				keyMatchingWords.set(word, keyMatches.map(match => this.toKeyRange(setting, match)));
			}

			const valueMatches = typeof setting.value === 'string' ? matchesContiguousSubString(word, setting.value) : null;
			if (valueMatches) {
				valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
			} else if (schema.enum && schema.enum.some(enumValue => typeof enumValue === 'string' && !!matchesContiguousSubString(word, enumValue))) {
				valueMatchingWords.set(word, []);
			}
		}

		const descriptionRanges: IRange[] = [];
		for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
			const matches = or(matchesContiguousSubString)(searchString, setting.description[lineIndex] || '') || [];
			descriptionRanges.push(...matches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
		}
		if (descriptionRanges.length === 0) {
			descriptionRanges.push(...this.getRangesForWords(words, descriptionMatchingWords, [keyMatchingWords, valueMatchingWords]));
		}

		const keyMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.key);
		const keyRanges: IRange[] = keyMatches ? keyMatches.map(match => this.toKeyRange(setting, match)) : this.getRangesForWords(words, keyMatchingWords, [descriptionMatchingWords, valueMatchingWords]);

		let valueRanges: IRange[] = [];
		if (setting.value && typeof setting.value === 'string') {
			const valueMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.value);
			valueRanges = valueMatches ? valueMatches.map(match => this.toValueRange(setting, match)) : this.getRangesForWords(words, valueMatchingWords, [keyMatchingWords, descriptionMatchingWords]);
		}

		return [...descriptionRanges, ...keyRanges, ...valueRanges];
	}

	private getRangesForWords(words: string[], from: Map<string, IRange[]>, others: Map<string, IRange[]>[]): IRange[] {
		const result: IRange[] = [];
		for (const word of words) {
			const ranges = from.get(word);
			if (ranges) {
				result.push(...ranges);
			} else if (others.every(o => !o.has(word))) {
				return [];
			}
		}
		return result;
	}

	private toKeyRange(setting: ISetting, match: IMatch): IRange {
		return {
			startLineNumber: setting.keyRange.startLineNumber,
			startColumn: setting.keyRange.startColumn + match.start,
			endLineNumber: setting.keyRange.startLineNumber,
			endColumn: setting.keyRange.startColumn + match.end
		};
	}

	private toDescriptionRange(setting: ISetting, match: IMatch, lineIndex: number): IRange {
		return {
			startLineNumber: setting.descriptionRanges[lineIndex].startLineNumber + lineIndex,
			startColumn: setting.descriptionRanges[lineIndex].startColumn + match.start,
			endLineNumber: setting.descriptionRanges[lineIndex].startLineNumber + lineIndex,
			endColumn: setting.descriptionRanges[lineIndex].startColumn + match.end
		};
	}

	private toValueRange(setting: ISetting, match: IMatch): IRange {
		return {
			startLineNumber: setting.valueRange.startLineNumber,
			startColumn: setting.valueRange.startColumn + match.start + 1,
			endLineNumber: setting.valueRange.startLineNumber,
			endColumn: setting.valueRange.startColumn + match.end + 1
		};
	}

	public abstract settingsGroups: ISettingsGroup[];
}

export class SettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

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

	public filterSettings(filter: string): IFilterResult {
		return this.doFilterSettings(filter, this.settingsGroups);
	}

	private parse() {
		const model = this.model;
		const settings: ISetting[] = [];
		let overrideSetting: ISetting = null;

		let currentProperty: string = null;
		let currentParent: any = [];
		let previousParents: any[] = [];
		let range = {
			startLineNumber: 0,
			startColumn: 0,
			endLineNumber: 0,
			endColumn: 0
		};

		function onValue(value: any, offset: number, length: number) {
			if (Array.isArray(currentParent)) {
				(<any[]>currentParent).push(value);
			} else if (currentProperty) {
				currentParent[currentProperty] = value;
			}
			if (previousParents.length === 1 || (previousParents.length === 2 && overrideSetting !== null)) {
				// settings value started
				const setting = previousParents.length === 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
				let valueStartPosition = model.getPositionAt(offset);
				let valueEndPosition = model.getPositionAt(offset + length);
				setting.value = value;
				setting.valueRange = {
					startLineNumber: valueStartPosition.lineNumber,
					startColumn: valueStartPosition.column,
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				};
				setting.range = assign(setting.range, {
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				});
			}
		}
		let visitor: JSONVisitor = {
			onObjectBegin: (offset: number, length: number) => {
				if (previousParents.length === 0) {
					// Settings started
					let position = model.getPositionAt(offset);
					range.startLineNumber = position.lineNumber;
					range.startColumn = position.column;
				}
				let object = {};
				onValue(object, offset, length);
				currentParent = object;
				currentProperty = null;
				previousParents.push(currentParent);
			},
			onObjectProperty: (name: string, offset: number, length: number) => {
				currentProperty = name;
				if (previousParents.length === 1 || (previousParents.length === 2 && overrideSetting !== null)) {
					// setting started
					let settingStartPosition = model.getPositionAt(offset);
					const setting: ISetting = {
						description: [],
						key: name,
						keyRange: {
							startLineNumber: settingStartPosition.lineNumber,
							startColumn: settingStartPosition.column,
							endLineNumber: settingStartPosition.lineNumber,
							endColumn: settingStartPosition.column + length
						},
						range: {
							startLineNumber: settingStartPosition.lineNumber,
							startColumn: settingStartPosition.column,
							endLineNumber: 0,
							endColumn: 0
						},
						value: null,
						valueRange: null,
						descriptionRanges: null,
						overrides: [],
						overrideOf: overrideSetting
					};
					if (previousParents.length === 1) {
						settings.push(setting);
						if (OVERRIDE_PROPERTY_PATTERN.test(name)) {
							overrideSetting = setting;
						}
					} else {
						overrideSetting.overrides.push(setting);
					}
				}
			},
			onObjectEnd: (offset: number, length: number) => {
				currentParent = previousParents.pop();
				if (previousParents.length === 1 || (previousParents.length === 2 && overrideSetting !== null)) {
					// setting ended
					const setting = previousParents.length === 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
					let valueEndPosition = model.getPositionAt(offset + length);
					setting.valueRange = assign(setting.valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					setting.range = assign(setting.range, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});

					if (previousParents.length === 1) {
						overrideSetting = null;
					}
				}
				if (previousParents.length === 0) {
					// settings ended
					let position = model.getPositionAt(offset);
					range.endLineNumber = position.lineNumber;
					range.endColumn = position.column;
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
				currentParent = previousParents.pop();
				if (previousParents.length === 1 || (previousParents.length === 2 && overrideSetting !== null)) {
					// setting value ended
					const setting = previousParents.length === 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
					let valueEndPosition = model.getPositionAt(offset + length);
					setting.valueRange = assign(setting.valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					setting.range = assign(setting.range, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
				}
			},
			onLiteralValue: onValue,
			onError: (error) => {
				const setting = settings[settings.length - 1];
				if (setting && (!setting.range || !setting.keyRange || !setting.valueRange)) {
					settings.pop();
				}
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
			range
		}] : [];
	}
}

export class DefaultSettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private indent: string;

	private _allSettingsGroups: ISettingsGroup[];
	private _content: string;
	private _contentByLines: string[];

	constructor(private _uri: URI, private _mostCommonlyUsedSettingsKeys: string[]) {
		super();
		this.indent = '  ';
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
		if (!this._allSettingsGroups) {
			this.parse();
		}
		return this._allSettingsGroups;
	}

	public get mostCommonlyUsedSettings(): ISettingsGroup {
		return this.settingsGroups[0];
	}

	public filterSettings(filter: string): IFilterResult {
		return this.doFilterSettings(filter, this.settingsGroups);
	}

	public getPreference(key: string): ISetting {
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (setting.key === key) {
						return setting;
					}
				}
			}
		}
		return null;
	}

	private parse() {
		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
		const settingsGroups = configurations.sort(this.compareConfigurationNodes).reduce((result, config) => this.parseConfig(config, result), []);
		const mostCommonlyUsed = this.getMostCommonlyUsedSettings(settingsGroups);
		this._allSettingsGroups = [mostCommonlyUsed, ...settingsGroups];
		this._content = this.toContent(mostCommonlyUsed, settingsGroups);
	}

	private getMostCommonlyUsedSettings(allSettingsGroups: ISettingsGroup[]): ISettingsGroup {
		const map: Map<string, ISetting> = new Map<string, ISetting>();
		for (const group of allSettingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					map.set(setting.key, setting);
				}
			}
		}
		const settings = this._mostCommonlyUsedSettingsKeys.map(key => {
			const setting = map.get(key);
			if (setting) {
				return <ISetting>{
					description: setting.description,
					key: setting.key,
					value: setting.value,
					range: null,
					valueRange: null,
					overrides: []
				};
			}
			return null;
		}).filter(setting => !!setting);

		return <ISettingsGroup>{
			id: 'mostCommonlyUsed',
			range: null,
			title: nls.localize('commonlyUsed', "Commonly Used"),
			titleRange: null,
			sections: [
				{
					settings
				}
			]
		};
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		if (config.title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === config.title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], id: config.id, title: config.title, titleRange: null, range: null };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].title = config.title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], id: config.id, title: config.id, titleRange: null, range: null };
				result.push(settingsGroup);
			}
			const configurationSettings: ISetting[] = Object.keys(config.properties).map((key) => {
				const prop = config.properties[key];
				const value = prop.default;
				const description = (prop.description || '').split('\n');
				return { key, value, description, range: null, keyRange: null, valueRange: null, descriptionRanges: [], overrides: [] };
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

	private toContent(mostCommonlyUsed: ISettingsGroup, settingsGroups: ISettingsGroup[]): string {
		this._contentByLines = [];
		this._contentByLines.push('[');
		this.pushGroups([mostCommonlyUsed]);
		this._contentByLines.push(',');
		this.pushGroups(settingsGroups);
		this._contentByLines.push(']');
		return this._contentByLines.join('\n');
	}

	private pushGroups(settingsGroups: ISettingsGroup[]): void {
		let lastSetting: ISetting = null;
		this._contentByLines.push('{');
		this._contentByLines.push('');
		for (const group of settingsGroups) {
			lastSetting = this.pushGroup(group);
		}
		if (lastSetting) {
			const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
			this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
		}
		this._contentByLines.push('}');
	}

	private pushGroup(group: ISettingsGroup): ISetting {
		let lastSetting: ISetting = null;
		this._contentByLines.push('');
		let groupStart = this._contentByLines.length + 1;
		for (const section of group.sections) {
			if (section.title) {
				let sectionTitleStart = this._contentByLines.length + 1;
				this.addDescription([section.title], this.indent, this._contentByLines);
				section.titleRange = { startLineNumber: sectionTitleStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
			}

			for (const setting of section.settings) {
				const settingStart = this._contentByLines.length + 1;
				setting.descriptionRanges = [];
				const descriptionPreValue = this.indent + '// ';
				for (const line of setting.description) {
					this._contentByLines.push(descriptionPreValue + line);
					setting.descriptionRanges.push({ startLineNumber: this._contentByLines.length, startColumn: this._contentByLines[this._contentByLines.length - 1].indexOf(line) + 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length });
				}

				let preValueConent = this.indent;
				const keyString = JSON.stringify(setting.key);
				preValueConent += keyString;
				setting.keyRange = { startLineNumber: this._contentByLines.length + 1, startColumn: preValueConent.indexOf(setting.key) + 1, endLineNumber: this._contentByLines.length + 1, endColumn: setting.key.length };

				preValueConent += ': ';
				const valueStart = this._contentByLines.length + 1;
				let valueString = JSON.stringify(setting.value, null, this.indent);
				if (valueString && (typeof setting.value === 'object')) {
					const mulitLineValue = valueString.split('\n');
					this._contentByLines.push(preValueConent + mulitLineValue[0]);
					for (let i = 1; i < mulitLineValue.length; i++) {
						this._contentByLines.push(this.indent + mulitLineValue[i]);
					}
				} else {
					this._contentByLines.push(preValueConent + valueString);
				}

				setting.valueRange = { startLineNumber: valueStart, startColumn: preValueConent.length + 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length + 1 };
				this._contentByLines[this._contentByLines.length - 1] += ',';
				lastSetting = setting;
				this._contentByLines.push('');
				setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
			}
		}
		group.range = { startLineNumber: groupStart, startColumn: 1, endLineNumber: this._contentByLines.length, endColumn: this._contentByLines[this._contentByLines.length - 1].length };
		return lastSetting;
	}

	private addDescription(description: string[], indent: string, result: string[]) {
		for (const line of description) {
			result.push(indent + '// ' + line);
		}
	}
}

export class DefaultKeybindingsEditorModel implements IKeybindingsEditorModel<any> {

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

	public getPreference(): any {
		return null;
	}
}