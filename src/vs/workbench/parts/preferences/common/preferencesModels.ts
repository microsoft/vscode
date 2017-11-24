/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { assign } from 'vs/base/common/objects';
import { tail } from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import { IReference, Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { visit, JSONVisitor } from 'vs/base/common/json';
import { IModel } from 'vs/editor/common/editorCommon';
import { EditorModel } from 'vs/workbench/common/editor';
import { IConfigurationNode, IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN, IConfigurationPropertySchema, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ISettingsEditorModel, IKeybindingsEditorModel, ISettingsGroup, ISetting, IFilterResult, ISettingsSection, IGroupFilter, ISettingFilter } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';

export abstract class AbstractSettingsModel extends EditorModel {

	public get groupsTerms(): string[] {
		return this.settingsGroups.map(group => '@' + group.id);
	}

	protected doFilterSettings(filter: string, groupFilter: IGroupFilter, settingFilter: ISettingFilter): IFilterResult {
		const allGroups = this.settingsGroups;

		if (!filter) {
			return {
				filteredGroups: allGroups,
				allGroups,
				matches: [],
				query: filter
			};
		}

		const group = this.filterByGroupTerm(filter);
		if (group) {
			return {
				filteredGroups: [group],
				allGroups,
				matches: [],
				query: filter
			};
		}

		const matches: IRange[] = [];
		const filteredGroups: ISettingsGroup[] = [];
		for (const group of allGroups) {
			const groupMatched = groupFilter(group);
			const sections: ISettingsSection[] = [];
			for (const section of group.sections) {
				const settings: ISetting[] = [];
				for (const setting of section.settings) {
					const settingMatches = settingFilter(setting);
					if (groupMatched || settingMatches && settingMatches.length) {
						settings.push(setting);
					}

					if (settingMatches) {
						matches.push(...settingMatches);
					}
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
		return { filteredGroups, matches, allGroups, query: filter };
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

	public abstract settingsGroups: ISettingsGroup[];
}

export class SettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private _settingsGroups: ISettingsGroup[];
	protected settingsModel: IModel;

	private _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeGroups: Event<void> = this._onDidChangeGroups.event;

	constructor(reference: IReference<ITextEditorModel>, private _configurationTarget: ConfigurationTarget) {
		super();
		this.settingsModel = reference.object.textEditorModel;
		this._register(this.onDispose(() => reference.dispose()));
		this._register(this.settingsModel.onDidChangeContent(() => {
			this._settingsGroups = null;
			this._onDidChangeGroups.fire();
		}));
	}

	public get uri(): URI {
		return this.settingsModel.uri;
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
		return this.settingsModel.getValue();
	}

	public filterSettings(filter: string, groupFilter: IGroupFilter, settingFilter: ISettingFilter): IFilterResult {
		return this.doFilterSettings(filter, groupFilter, settingFilter);
	}

	public findValueMatches(filter: string, setting: ISetting): IRange[] {
		return this.settingsModel.findMatches(filter, setting.valueRange, false, false, null, false).map(match => match.range);
	}

	protected isSettingsProperty(property: string, previousParents: string[]): boolean {
		return previousParents.length === 0; // Settings is root
	}

	protected parse(): void {
		this._settingsGroups = parse(this.settingsModel, (property: string, previousParents: string[]): boolean => this.isSettingsProperty(property, previousParents));
	}
}

function parse(model: IModel, isSettingsProperty: (currentProperty: string, previousParents: string[]) => boolean): ISettingsGroup[] {
	const settings: ISetting[] = [];
	let overrideSetting: ISetting = null;

	let currentProperty: string = null;
	let currentParent: any = [];
	let previousParents: any[] = [];
	let settingsPropertyIndex: number = -1;
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
		if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
			// settings value started
			const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
			if (setting) {
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
	}
	let visitor: JSONVisitor = {
		onObjectBegin: (offset: number, length: number) => {
			if (isSettingsProperty(currentProperty, previousParents)) {
				// Settings started
				settingsPropertyIndex = previousParents.length;
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
			if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
				// setting started
				let settingStartPosition = model.getPositionAt(offset);
				const setting: ISetting = {
					description: [],
					key: name,
					keyRange: {
						startLineNumber: settingStartPosition.lineNumber,
						startColumn: settingStartPosition.column + 1,
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
				if (previousParents.length === settingsPropertyIndex + 1) {
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
			if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
				// setting ended
				const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
				if (setting) {
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

				if (previousParents.length === settingsPropertyIndex + 1) {
					overrideSetting = null;
				}
			}
			if (previousParents.length === settingsPropertyIndex) {
				// settings ended
				let position = model.getPositionAt(offset);
				range.endLineNumber = position.lineNumber;
				range.endColumn = position.column;
			}
		},
		onArrayBegin: (offset: number, length: number) => {
			let array: any[] = [];
			onValue(array, offset, length);
			previousParents.push(currentParent);
			currentParent = array;
			currentProperty = null;
		},
		onArrayEnd: (offset: number, length: number) => {
			currentParent = previousParents.pop();
			if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
				// setting value ended
				const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
				if (setting) {
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
	if (!model.isDisposed()) {
		visit(model.getValue(), visitor);
	}
	return settings.length > 0 ? [<ISettingsGroup>{
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

export class WorkspaceConfigurationEditorModel extends SettingsEditorModel {

	private _configurationGroups: ISettingsGroup[];

	get configurationGroups(): ISettingsGroup[] {
		return this._configurationGroups;
	}

	protected parse(): void {
		super.parse();
		this._configurationGroups = parse(this.settingsModel, (property: string, previousParents: string[]): boolean => previousParents.length === 0);
	}

	protected isSettingsProperty(property: string, previousParents: string[]): boolean {
		return property === 'settings' && previousParents.length === 1;
	}

}

export class DefaultSettings extends Disposable {

	private static _RAW: string;

	private _allSettingsGroups: ISettingsGroup[];
	private _content: string;
	private _settingsByName: Map<string, ISetting>;

	readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private _mostCommonlyUsedSettingsKeys: string[],
		readonly configurationScope: ConfigurationScope,
	) {
		super();
	}

	get content(): string {
		if (!this._content) {
			this.parse();
		}
		return this._content;
	}

	get settingsGroups(): ISettingsGroup[] {
		if (!this._allSettingsGroups) {
			this.parse();
		}
		return this._allSettingsGroups;
	}

	parse(): string {
		const settingsGroups = this.getRegisteredGroups();
		this.initAllSettingsMap(settingsGroups);
		const mostCommonlyUsed = this.getMostCommonlyUsedSettings(settingsGroups);
		this._allSettingsGroups = [mostCommonlyUsed, ...settingsGroups];

		const builder = new SettingsContentBuilder();
		builder.pushLine('[');
		builder.pushGroups([mostCommonlyUsed]);
		builder.pushLine(',');
		builder.pushGroups(settingsGroups);
		builder.pushLine(']');
		this._content = builder.getContent();

		return this._content;
	}

	get raw(): string {
		if (!DefaultSettings._RAW) {
			const settingsGroups = this.getRegisteredGroups();
			const builder = new SettingsContentBuilder();
			builder.pushGroups(settingsGroups);
			DefaultSettings._RAW = builder.getContent();
		}
		return DefaultSettings._RAW;
	}

	private getRegisteredGroups(): ISettingsGroup[] {
		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations().slice();
		return this.removeEmptySettingsGroups(configurations.sort(this.compareConfigurationNodes)
			.reduce((result, config, index, array) => this.parseConfig(config, result, array), []));
	}

	private initAllSettingsMap(allSettingsGroups: ISettingsGroup[]): void {
		this._settingsByName = new Map<string, ISetting>();
		for (const group of allSettingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					this._settingsByName.set(setting.key, setting);
				}
			}
		}
	}

	private getMostCommonlyUsedSettings(allSettingsGroups: ISettingsGroup[]): ISettingsGroup {
		const settings = this._mostCommonlyUsedSettingsKeys.map(key => {
			const setting = this._settingsByName.get(key);
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

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], configurations: IConfigurationNode[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		let title = config.title;
		if (!title) {
			const configWithTitleAndSameId = configurations.filter(c => c.id === config.id && c.title)[0];
			if (configWithTitleAndSameId) {
				title = configWithTitleAndSameId.title;
			}
		}
		if (title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], id: config.id, title: title, titleRange: null, range: null };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].title = title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], id: config.id, title: config.id, titleRange: null, range: null };
				result.push(settingsGroup);
			}
			const configurationSettings: ISetting[] = [...settingsGroup.sections[settingsGroup.sections.length - 1].settings, ...this.parseSettings(config.properties)];
			if (configurationSettings.length) {
				configurationSettings.sort((a, b) => a.key.localeCompare(b.key));
				settingsGroup.sections[settingsGroup.sections.length - 1].settings = configurationSettings;
			}
		}
		if (config.allOf) {
			config.allOf.forEach(c => this.parseConfig(c, result, configurations, settingsGroup));
		}
		return result;
	}

	private removeEmptySettingsGroups(settingsGroups: ISettingsGroup[]): ISettingsGroup[] {
		const result = [];
		for (const settingsGroup of settingsGroups) {
			settingsGroup.sections = settingsGroup.sections.filter(section => section.settings.length > 0);
			if (settingsGroup.sections.length) {
				result.push(settingsGroup);
			}
		}
		return result;
	}

	private parseSettings(settingsObject: { [path: string]: IConfigurationPropertySchema; }): ISetting[] {
		let result = [];
		for (let key in settingsObject) {
			const prop = settingsObject[key];
			if (!prop.deprecationMessage && this.matchesScope(prop)) {
				const value = prop.default;
				const description = (prop.description || '').split('\n');
				const overrides = OVERRIDE_PROPERTY_PATTERN.test(key) ? this.parseOverrideSettings(prop.default) : [];
				result.push({ key, value, description, range: null, keyRange: null, valueRange: null, descriptionRanges: [], overrides });
			}
		}
		return result;
	}

	private parseOverrideSettings(overrideSettings: any): ISetting[] {
		return Object.keys(overrideSettings).map((key) => ({ key, value: overrideSettings[key], description: [], range: null, keyRange: null, valueRange: null, descriptionRanges: [], overrides: [] }));
	}

	private matchesScope(property: IConfigurationNode): boolean {
		if (this.configurationScope === ConfigurationScope.WINDOW) {
			return true;
		}
		return property.scope === this.configurationScope;
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

}

export class DefaultSettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private _model: IModel;
	private _settingsByName: Map<string, ISetting>;

	private _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeGroups: Event<void> = this._onDidChangeGroups.event;

	constructor(
		private _uri: URI,
		reference: IReference<ITextEditorModel>,
		readonly configurationScope: ConfigurationScope,
		private readonly defaultSettings: DefaultSettings
	) {
		super();

		this._register(defaultSettings.onDidChange(() => this._onDidChangeGroups.fire()));
		this._model = reference.object.textEditorModel;
		this._register(this.onDispose(() => reference.dispose()));

		this.initAllSettingsMap();
	}

	public get uri(): URI {
		return this._uri;
	}

	public get settingsGroups(): ISettingsGroup[] {
		return this.defaultSettings.settingsGroups;
	}

	public filterSettings(filter: string, groupFilter: IGroupFilter, settingFilter: ISettingFilter, mostRelevantSettings?: string[]): IFilterResult {
		if (mostRelevantSettings) {
			const mostRelevantGroup = this.renderMostRelevantSettings(mostRelevantSettings);

			return {
				allGroups: [...this.settingsGroups, mostRelevantGroup],
				filteredGroups: mostRelevantGroup.sections[0].settings.length ? [mostRelevantGroup] : [],
				matches: [],
				query: filter
			};
		} else {
			// Do local search and add empty 'most relevant' group
			const mostRelevantGroup = this.renderMostRelevantSettings([]);
			const result = this.doFilterSettings(filter, groupFilter, settingFilter);
			result.allGroups = [...result.allGroups, mostRelevantGroup];
			return result;
		}
	}

	private renderMostRelevantSettings(mostRelevantSettings: string[]): ISettingsGroup {
		const mostRelevantLineOffset = tail(this.settingsGroups).range.endLineNumber + 2;
		const builder = new SettingsContentBuilder(mostRelevantLineOffset - 1);
		builder.pushLine(',');
		const mostRelevantGroup = this.getMostRelevantSettings(mostRelevantSettings);
		builder.pushGroups([mostRelevantGroup]);
		builder.pushLine('');

		// note: 1-indexed line numbers here
		const mostRelevantContent = builder.getContent();
		const mostRelevantEndLine = this._model.getLineCount();
		this._model.applyEdits([
			{
				text: mostRelevantContent,
				forceMoveMarkers: false,
				range: new Range(mostRelevantLineOffset, 1, mostRelevantEndLine, 1),
				identifier: { major: 1, minor: 0 }
			}
		]);

		return mostRelevantGroup;
	}

	public findValueMatches(filter: string, setting: ISetting): IRange[] {
		return [];
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

	private initAllSettingsMap(): void {
		this._settingsByName = new Map<string, ISetting>();
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					this._settingsByName.set(setting.key, setting);
				}
			}
		}
	}

	private getMostRelevantSettings(rankedSettingNames: string[]): ISettingsGroup {
		const settings = rankedSettingNames.map(key => {
			const setting = this._settingsByName.get(key);
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
			id: 'mostRelevant',
			range: null,
			title: nls.localize('mostRelevant', "Most Relevant"),
			titleRange: null,
			sections: [
				{
					settings
				}
			]
		};
	}
}

class SettingsContentBuilder {
	private _contentByLines: string[];

	get lines(): string[] {
		return this._contentByLines;
	}

	private get lineCountWithOffset(): number {
		return this._contentByLines.length + this._rangeOffset;
	}

	private get lastLine(): string {
		return this._contentByLines[this._contentByLines.length - 1] || '';
	}

	constructor(private _rangeOffset = 0) {
		this._contentByLines = [];
	}

	private offsetIndexToIndex(offsetIdx: number): number {
		return offsetIdx - this._rangeOffset;
	}

	pushLine(...lineText: string[]): void {
		this._contentByLines.push(...lineText);
	}

	pushGroups(settingsGroups: ISettingsGroup[]): void {
		let lastSetting: ISetting = null;
		this._contentByLines.push('{');
		this._contentByLines.push('');
		for (const group of settingsGroups) {
			this._contentByLines.push('');
			lastSetting = this.pushGroup(group);
		}
		if (lastSetting) {
			// Strip the comma from the last setting
			const lineIdx = this.offsetIndexToIndex(lastSetting.range.endLineNumber);
			const content = this._contentByLines[lineIdx - 2];
			this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
		}
		this._contentByLines.push('}');
	}

	private pushGroup(group: ISettingsGroup): ISetting {
		const indent = '  ';
		let lastSetting: ISetting = null;
		let groupStart = this.lineCountWithOffset + 1;
		for (const section of group.sections) {
			if (section.title) {
				let sectionTitleStart = this.lineCountWithOffset + 1;
				this.addDescription([section.title], indent, this._contentByLines);
				section.titleRange = { startLineNumber: sectionTitleStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
			}

			if (section.settings.length) {
				for (const setting of section.settings) {
					this.pushSetting(setting, indent);
					lastSetting = setting;
				}
			}

		}
		group.range = { startLineNumber: groupStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
		return lastSetting;
	}

	getContent(): string {
		return this._contentByLines.join('\n');
	}

	private pushSetting(setting: ISetting, indent: string): void {
		const settingStart = this.lineCountWithOffset + 1;
		setting.descriptionRanges = [];
		const descriptionPreValue = indent + '// ';
		for (const line of setting.description) {
			this._contentByLines.push(descriptionPreValue + line);
			setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
		}

		let preValueConent = indent;
		const keyString = JSON.stringify(setting.key);
		preValueConent += keyString;
		setting.keyRange = { startLineNumber: this.lineCountWithOffset + 1, startColumn: preValueConent.indexOf(setting.key) + 1, endLineNumber: this.lineCountWithOffset + 1, endColumn: setting.key.length };

		preValueConent += ': ';
		const valueStart = this.lineCountWithOffset + 1;
		this.pushValue(setting, preValueConent, indent);

		setting.valueRange = { startLineNumber: valueStart, startColumn: preValueConent.length + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length + 1 };
		this._contentByLines[this._contentByLines.length - 1] += ',';
		this._contentByLines.push('');
		setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
	}

	private pushValue(setting: ISetting, preValueConent: string, indent: string): void {
		let valueString = JSON.stringify(setting.value, null, indent);
		if (valueString && (typeof setting.value === 'object')) {
			if (setting.overrides.length) {
				this._contentByLines.push(preValueConent + ' {');
				for (const subSetting of setting.overrides) {
					this.pushSetting(subSetting, indent + indent);
					this._contentByLines.pop();
				}
				const lastSetting = setting.overrides[setting.overrides.length - 1];
				const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
				this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
				this._contentByLines.push(indent + '}');
			} else {
				const mulitLineValue = valueString.split('\n');
				this._contentByLines.push(preValueConent + mulitLineValue[0]);
				for (let i = 1; i < mulitLineValue.length; i++) {
					this._contentByLines.push(indent + mulitLineValue[i]);
				}
			}
		} else {
			this._contentByLines.push(preValueConent + valueString);
		}
	}

	private addDescription(description: string[], indent: string, result: string[]) {
		for (const line of description) {
			result.push(indent + '// ' + line);
		}
	}
}

export function defaultKeybindingsContents(keybindingService: IKeybindingService): string {
	const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
	return defaultsHeader + '\n' + keybindingService.getDefaultKeybindingsContent();
}

export class DefaultKeybindingsEditorModel implements IKeybindingsEditorModel<any> {

	private _content: string;

	constructor(private _uri: URI,
		@IKeybindingService private keybindingService: IKeybindingService) {
	}

	public get uri(): URI {
		return this._uri;
	}

	public get content(): string {
		if (!this._content) {
			this._content = defaultKeybindingsContents(this.keybindingService);
		}
		return this._content;
	}

	public getPreference(): any {
		return null;
	}

	public dispose(): void {
		// Not disposable
	}
}