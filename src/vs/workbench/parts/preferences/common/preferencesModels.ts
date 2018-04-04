/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { assign } from 'vs/base/common/objects';
import * as map from 'vs/base/common/map';
import { tail, flatten } from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import { IReference, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { visit, JSONVisitor } from 'vs/base/common/json';
import { ITextModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { EditorModel } from 'vs/workbench/common/editor';
import { IConfigurationNode, IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN, IConfigurationPropertySchema, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ISettingsEditorModel, IKeybindingsEditorModel, ISettingsGroup, ISetting, IFilterResult, IGroupFilter, ISettingMatcher, ISettingMatch, ISearchResultGroup, IFilterMetadata } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Selection } from 'vs/editor/common/core/selection';
import { IStringDictionary } from 'vs/base/common/collections';

export abstract class AbstractSettingsModel extends EditorModel {

	protected _currentResultGroups = new Map<string, ISearchResultGroup>();

	public updateResultGroup(id: string, resultGroup: ISearchResultGroup): IFilterResult {
		if (resultGroup) {
			this._currentResultGroups.set(id, resultGroup);
		} else {
			this._currentResultGroups.delete(id);
		}

		this.removeDuplicateResults();
		return this.update();
	}

	/**
	 * Remove duplicates between result groups, preferring results in earlier groups
	 */
	private removeDuplicateResults(): void {
		const settingKeys = new Set<string>();
		map.keys(this._currentResultGroups)
			.sort((a, b) => this._currentResultGroups.get(a).order - this._currentResultGroups.get(b).order)
			.forEach(groupId => {
				const group = this._currentResultGroups.get(groupId);
				group.result.filterMatches = group.result.filterMatches.filter(s => !settingKeys.has(s.setting.key));
				group.result.filterMatches.forEach(s => settingKeys.add(s.setting.key));
			});
	}

	public filterSettings(filter: string, groupFilter: IGroupFilter, settingMatcher: ISettingMatcher): ISettingMatch[] {
		const allGroups = this.filterGroups;

		const filterMatches: ISettingMatch[] = [];
		for (const group of allGroups) {
			const groupMatched = groupFilter(group);
			for (const section of group.sections) {
				for (const setting of section.settings) {
					const settingMatchResult = settingMatcher(setting, group);

					if (groupMatched || settingMatchResult) {
						filterMatches.push({
							setting,
							matches: settingMatchResult && settingMatchResult.matches,
							score: settingMatchResult ? settingMatchResult.score : 0
						});
					}
				}
			}
		}

		return filterMatches.sort((a, b) => b.score - a.score);
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

	protected collectMetadata(groups: ISearchResultGroup[]): IStringDictionary<IFilterMetadata> {
		const metadata = Object.create(null);
		let hasMetadata = false;
		groups.forEach(g => {
			if (g.result.metadata) {
				metadata[g.id] = g.result.metadata;
				hasMetadata = true;
			}
		});

		return hasMetadata ? metadata : null;
	}


	protected get filterGroups(): ISettingsGroup[] {
		return this.settingsGroups;
	}

	public abstract settingsGroups: ISettingsGroup[];

	public abstract findValueMatches(filter: string, setting: ISetting): IRange[];

	protected abstract update(): IFilterResult;
}

export class SettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private _settingsGroups: ISettingsGroup[];
	protected settingsModel: ITextModel;

	private readonly _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
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

	public findValueMatches(filter: string, setting: ISetting): IRange[] {
		return this.settingsModel.findMatches(filter, setting.valueRange, false, false, null, false).map(match => match.range);
	}

	protected isSettingsProperty(property: string, previousParents: string[]): boolean {
		return previousParents.length === 0; // Settings is root
	}

	protected parse(): void {
		this._settingsGroups = parse(this.settingsModel, (property: string, previousParents: string[]): boolean => this.isSettingsProperty(property, previousParents));
	}

	protected update(): IFilterResult {
		const resultGroups = map.values(this._currentResultGroups);
		if (!resultGroups.length) {
			return null;
		}

		// Transform resultGroups into IFilterResult - ISetting ranges are already correct here
		const filteredSettings: ISetting[] = [];
		const matches: IRange[] = [];
		resultGroups.forEach(group => {
			group.result.filterMatches.forEach(filterMatch => {
				filteredSettings.push(filterMatch.setting);
				matches.push(...filterMatch.matches);
			});
		});

		let filteredGroup: ISettingsGroup;
		const modelGroup = this.settingsGroups[0]; // Editable model has one or zero groups
		if (modelGroup) {
			filteredGroup = {
				id: modelGroup.id,
				range: modelGroup.range,
				sections: [{
					settings: filteredSettings
				}],
				title: modelGroup.title,
				titleRange: modelGroup.titleRange
			};
		}

		const metadata = this.collectMetadata(resultGroups);
		return <IFilterResult>{
			allGroups: this.settingsGroups,
			filteredGroups: filteredGroup ? [filteredGroup] : [],
			matches,
			metadata
		};
	}
}

function parse(model: ITextModel, isSettingsProperty: (currentProperty: string, previousParents: string[]) => boolean): ISettingsGroup[] {
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
		readonly target: ConfigurationTarget,
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
		this._content = this.toContent(true, this._allSettingsGroups);
		return this._content;
	}

	get raw(): string {
		if (!DefaultSettings._RAW) {
			DefaultSettings._RAW = this.toContent(false, this.getRegisteredGroups());
		}
		return DefaultSettings._RAW;
	}

	getSettingByName(name: string): ISetting {
		return this._settingsByName && this._settingsByName.get(name);
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
		if (this.target === ConfigurationTarget.WORKSPACE_FOLDER) {
			return property.scope === ConfigurationScope.RESOURCE;
		}
		if (this.target === ConfigurationTarget.WORKSPACE) {
			return property.scope === ConfigurationScope.WINDOW || property.scope === ConfigurationScope.RESOURCE;
		}
		return true;
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

	private toContent(asArray: boolean, settingsGroups: ISettingsGroup[]): string {
		const builder = new SettingsContentBuilder();
		if (asArray) {
			builder.pushLine('[');
		}
		settingsGroups.forEach((settingsGroup, i) => {
			builder.pushGroup(settingsGroup);
			builder.pushLine(',');
		});
		if (asArray) {
			builder.pushLine(']');
		}
		return builder.getContent();
	}

}

export class DefaultSettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private _model: ITextModel;

	private readonly _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeGroups: Event<void> = this._onDidChangeGroups.event;

	constructor(
		private _uri: URI,
		reference: IReference<ITextEditorModel>,
		private readonly defaultSettings: DefaultSettings
	) {
		super();

		this._register(defaultSettings.onDidChange(() => this._onDidChangeGroups.fire()));
		this._model = reference.object.textEditorModel;
		this._register(this.onDispose(() => reference.dispose()));
	}

	public get uri(): URI {
		return this._uri;
	}

	public get target(): ConfigurationTarget {
		return this.defaultSettings.target;
	}

	public get settingsGroups(): ISettingsGroup[] {
		return this.defaultSettings.settingsGroups;
	}

	protected get filterGroups(): ISettingsGroup[] {
		// Don't look at "commonly used" for filter
		return this.settingsGroups.slice(1);
	}

	protected update(): IFilterResult {
		// Grab current result groups, only render non-empty groups
		const resultGroups = map
			.values(this._currentResultGroups)
			.sort((a, b) => a.order - b.order);
		const nonEmptyResultGroups = resultGroups.filter(group => group.result.filterMatches.length);

		const startLine = tail(this.settingsGroups).range.endLineNumber + 2;
		const { settingsGroups: filteredGroups, matches } = this.writeResultGroups(nonEmptyResultGroups, startLine);

		const metadata = this.collectMetadata(resultGroups);
		return resultGroups.length ?
			<IFilterResult>{
				allGroups: this.settingsGroups,
				filteredGroups,
				matches,
				metadata
			} :
			null;
	}

	/**
	 * Translate the ISearchResultGroups to text, and write it to the editor model
	 */
	private writeResultGroups(groups: ISearchResultGroup[], startLine: number): { matches: IRange[], settingsGroups: ISettingsGroup[] } {
		const contentBuilderOffset = startLine - 1;
		const builder = new SettingsContentBuilder(contentBuilderOffset);

		const settingsGroups: ISettingsGroup[] = [];
		const matches: IRange[] = [];
		builder.pushLine(',');
		groups.forEach(resultGroup => {
			const settingsGroup = this.getGroup(resultGroup);
			settingsGroups.push(settingsGroup);
			matches.push(...this.writeSettingsGroupToBuilder(builder, settingsGroup, resultGroup.result.filterMatches));
		});

		// note: 1-indexed line numbers here
		const groupContent = builder.getContent() + '\n';
		const groupEndLine = this._model.getLineCount();
		const cursorPosition = new Selection(startLine, 1, startLine, 1);
		const edit: IIdentifiedSingleEditOperation = {
			text: groupContent,
			forceMoveMarkers: true,
			range: new Range(startLine, 1, groupEndLine, 1),
			identifier: { major: 1, minor: 0 }
		};

		this._model.pushEditOperations([cursorPosition], [edit], () => [cursorPosition]);

		// Force tokenization now - otherwise it may be slightly delayed, causing a flash of white text
		const tokenizeTo = Math.min(startLine + 60, this._model.getLineCount());
		this._model.forceTokenization(tokenizeTo);

		return { matches, settingsGroups };
	}

	private writeSettingsGroupToBuilder(builder: SettingsContentBuilder, settingsGroup: ISettingsGroup, filterMatches: ISettingMatch[]): IRange[] {
		filterMatches = filterMatches
			.map(filteredMatch => {
				// Fix match ranges to offset from setting start line
				return <ISettingMatch>{
					setting: filteredMatch.setting,
					score: filteredMatch.score,
					matches: filteredMatch.matches && filteredMatch.matches.map(match => {
						return new Range(
							match.startLineNumber - filteredMatch.setting.range.startLineNumber,
							match.startColumn,
							match.endLineNumber - filteredMatch.setting.range.startLineNumber,
							match.endColumn);
					})
				};
			});

		builder.pushGroup(settingsGroup);
		builder.pushLine(',');

		// builder has rewritten settings ranges, fix match ranges
		const fixedMatches = flatten(
			filterMatches
				.map(m => m.matches || [])
				.map((settingMatches, i) => {
					const setting = settingsGroup.sections[0].settings[i];
					return settingMatches.map(range => {
						return new Range(
							range.startLineNumber + setting.range.startLineNumber,
							range.startColumn,
							range.endLineNumber + setting.range.startLineNumber,
							range.endColumn);
					});
				}));

		return fixedMatches;
	}

	private copySetting(setting: ISetting): ISetting {
		return <ISetting>{
			description: setting.description,
			key: setting.key,
			value: setting.value,
			range: setting.range,
			overrides: [],
			overrideOf: setting.overrideOf
		};
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

	private getGroup(resultGroup: ISearchResultGroup): ISettingsGroup {
		return <ISettingsGroup>{
			id: resultGroup.id,
			range: null,
			title: resultGroup.label,
			titleRange: null,
			sections: [
				{
					settings: resultGroup.result.filterMatches.map(m => this.copySetting(m.setting))
				}
			]
		};
	}
}

class SettingsContentBuilder {
	private _contentByLines: string[];

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

	pushGroup(settingsGroups: ISettingsGroup): void {
		this._contentByLines.push('{');
		this._contentByLines.push('');
		this._contentByLines.push('');
		const lastSetting = this._pushGroup(settingsGroups);

		if (lastSetting) {
			// Strip the comma from the last setting
			const lineIdx = this.offsetIndexToIndex(lastSetting.range.endLineNumber);
			const content = this._contentByLines[lineIdx - 2];
			this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
		}

		this._contentByLines.push('}');
	}

	private _pushGroup(group: ISettingsGroup): ISetting {
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
