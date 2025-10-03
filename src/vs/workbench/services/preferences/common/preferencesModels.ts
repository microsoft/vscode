/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { JSONVisitor, visit } from '../../../../base/common/json.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { ITextEditorModel } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationDefaultValueSource, ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry, IRegisteredConfigurationPropertySchema, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { IFilterMetadata, IFilterResult, IGroupFilter, IKeybindingsEditorModel, ISearchResultGroup, ISetting, ISettingMatch, ISettingMatcher, ISettingsEditorModel, ISettingsGroup, SettingMatchType } from './preferences.js';
import { FOLDER_SCOPES, WORKSPACE_SCOPES } from '../../configuration/common/configuration.js';
import { createValidator } from './preferencesValidation.js';

export const nullRange: IRange = { startLineNumber: -1, startColumn: -1, endLineNumber: -1, endColumn: -1 };
function isNullRange(range: IRange): boolean { return range.startLineNumber === -1 && range.startColumn === -1 && range.endLineNumber === -1 && range.endColumn === -1; }

abstract class AbstractSettingsModel extends EditorModel {

	protected _currentResultGroups = new Map<string, ISearchResultGroup>();

	updateResultGroup(id: string, resultGroup: ISearchResultGroup | undefined): IFilterResult | undefined {
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
		[...this._currentResultGroups.keys()]
			.sort((a, b) => this._currentResultGroups.get(a)!.order - this._currentResultGroups.get(b)!.order)
			.forEach(groupId => {
				const group = this._currentResultGroups.get(groupId)!;
				group.result.filterMatches = group.result.filterMatches.filter(s => !settingKeys.has(s.setting.key));
				group.result.filterMatches.forEach(s => settingKeys.add(s.setting.key));
			});
	}

	filterSettings(filter: string, groupFilter: IGroupFilter, settingMatcher: ISettingMatcher): ISettingMatch[] {
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
							matchType: settingMatchResult?.matchType ?? SettingMatchType.None,
							keyMatchScore: settingMatchResult?.keyMatchScore ?? 0,
							score: settingMatchResult?.score ?? 0
						});
					}
				}
			}
		}

		return filterMatches;
	}

	getPreference(key: string): ISetting | undefined {
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (key === setting.key) {
						return setting;
					}
				}
			}
		}

		return undefined;
	}

	protected collectMetadata(groups: ISearchResultGroup[]): IStringDictionary<IFilterMetadata> | null {
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

	abstract settingsGroups: ISettingsGroup[];

	protected abstract update(): IFilterResult | undefined;
}

export class SettingsEditorModel extends AbstractSettingsModel implements ISettingsEditorModel {

	private _settingsGroups: ISettingsGroup[] | undefined;
	protected settingsModel: ITextModel;

	private readonly _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeGroups: Event<void> = this._onDidChangeGroups.event;

	constructor(reference: IReference<ITextEditorModel>, private _configurationTarget: ConfigurationTarget) {
		super();
		this.settingsModel = reference.object.textEditorModel!;
		this._register(this.onWillDispose(() => reference.dispose()));
		this._register(this.settingsModel.onDidChangeContent(() => {
			this._settingsGroups = undefined;
			this._onDidChangeGroups.fire();
		}));
	}

	get uri(): URI {
		return this.settingsModel.uri;
	}

	get configurationTarget(): ConfigurationTarget {
		return this._configurationTarget;
	}

	get settingsGroups(): ISettingsGroup[] {
		if (!this._settingsGroups) {
			this.parse();
		}
		return this._settingsGroups!;
	}

	get content(): string {
		return this.settingsModel.getValue();
	}

	protected isSettingsProperty(property: string, previousParents: string[]): boolean {
		return previousParents.length === 0; // Settings is root
	}

	protected parse(): void {
		this._settingsGroups = parse(this.settingsModel, (property: string, previousParents: string[]): boolean => this.isSettingsProperty(property, previousParents));
	}

	protected update(): IFilterResult | undefined {
		const resultGroups = [...this._currentResultGroups.values()];
		if (!resultGroups.length) {
			return undefined;
		}

		// Transform resultGroups into IFilterResult - ISetting ranges are already correct here
		const filteredSettings: ISetting[] = [];
		const matches: IRange[] = [];
		resultGroups.forEach(group => {
			group.result.filterMatches.forEach(filterMatch => {
				filteredSettings.push(filterMatch.setting);
				if (filterMatch.matches) {
					matches.push(...filterMatch.matches);
				}
			});
		});

		let filteredGroup: ISettingsGroup | undefined;
		const modelGroup = this.settingsGroups[0]; // Editable model has one or zero groups
		if (modelGroup) {
			filteredGroup = {
				id: modelGroup.id,
				range: modelGroup.range,
				sections: [{
					settings: filteredSettings
				}],
				title: modelGroup.title,
				titleRange: modelGroup.titleRange,
				order: modelGroup.order,
				extensionInfo: modelGroup.extensionInfo
			};
		}

		const metadata = this.collectMetadata(resultGroups);
		return {
			allGroups: this.settingsGroups,
			filteredGroups: filteredGroup ? [filteredGroup] : [],
			matches,
			metadata: metadata ?? undefined
		};
	}
}

export class Settings2EditorModel extends AbstractSettingsModel implements ISettingsEditorModel {
	private readonly _onDidChangeGroups: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeGroups: Event<void> = this._onDidChangeGroups.event;

	private additionalGroups: ISettingsGroup[] = [];
	private dirty = false;

	constructor(
		private _defaultSettings: DefaultSettings,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.source === ConfigurationTarget.DEFAULT) {
				this.dirty = true;
				this._onDidChangeGroups.fire();
			}
		}));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidSchemaChange(e => {
			this.dirty = true;
			this._onDidChangeGroups.fire();
		}));
	}

	/** Doesn't include the "Commonly Used" group */
	protected override get filterGroups(): ISettingsGroup[] {
		return this.settingsGroups.slice(1);
	}

	get settingsGroups(): ISettingsGroup[] {
		const groups = this._defaultSettings.getSettingsGroups(this.dirty);
		this.dirty = false;
		return [...groups, ...this.additionalGroups];
	}

	/** For programmatically added groups outside of registered configurations */
	setAdditionalGroups(groups: ISettingsGroup[]) {
		this.additionalGroups = groups;
	}

	protected update(): IFilterResult {
		throw new Error('Not supported');
	}
}

function parse(model: ITextModel, isSettingsProperty: (currentProperty: string, previousParents: string[]) => boolean): ISettingsGroup[] {
	const settings: ISetting[] = [];
	let overrideSetting: ISetting | null = null;

	let currentProperty: string | null = null;
	let currentParent: any = [];
	const previousParents: any[] = [];
	let settingsPropertyIndex: number = -1;
	const range = {
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
			const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting!.overrides![overrideSetting!.overrides!.length - 1];
			if (setting) {
				const valueStartPosition = model.getPositionAt(offset);
				const valueEndPosition = model.getPositionAt(offset + length);
				setting.value = value;
				setting.valueRange = {
					startLineNumber: valueStartPosition.lineNumber,
					startColumn: valueStartPosition.column,
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				};
				setting.range = Object.assign(setting.range, {
					endLineNumber: valueEndPosition.lineNumber,
					endColumn: valueEndPosition.column
				});
			}
		}
	}
	const visitor: JSONVisitor = {
		onObjectBegin: (offset: number, length: number) => {
			if (isSettingsProperty(currentProperty!, previousParents)) {
				// Settings started
				settingsPropertyIndex = previousParents.length;
				const position = model.getPositionAt(offset);
				range.startLineNumber = position.lineNumber;
				range.startColumn = position.column;
			}
			const object = {};
			onValue(object, offset, length);
			currentParent = object;
			currentProperty = null;
			previousParents.push(currentParent);
		},
		onObjectProperty: (name: string, offset: number, length: number) => {
			currentProperty = name;
			if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
				// setting started
				const settingStartPosition = model.getPositionAt(offset);
				const setting: ISetting = {
					description: [],
					descriptionIsMarkdown: false,
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
					valueRange: nullRange,
					descriptionRanges: [],
					overrides: [],
					overrideOf: overrideSetting ?? undefined,
				};
				if (previousParents.length === settingsPropertyIndex + 1) {
					settings.push(setting);
					if (OVERRIDE_PROPERTY_REGEX.test(name)) {
						overrideSetting = setting;
					}
				} else {
					overrideSetting!.overrides!.push(setting);
				}
			}
		},
		onObjectEnd: (offset: number, length: number) => {
			currentParent = previousParents.pop();
			if (settingsPropertyIndex !== -1 && (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null))) {
				// setting ended
				const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting!.overrides![overrideSetting!.overrides!.length - 1];
				if (setting) {
					const valueEndPosition = model.getPositionAt(offset + length);
					setting.valueRange = Object.assign(setting.valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					setting.range = Object.assign(setting.range, {
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
				const position = model.getPositionAt(offset);
				range.endLineNumber = position.lineNumber;
				range.endColumn = position.column;
				settingsPropertyIndex = -1;
			}
		},
		onArrayBegin: (offset: number, length: number) => {
			const array: any[] = [];
			onValue(array, offset, length);
			previousParents.push(currentParent);
			currentParent = array;
			currentProperty = null;
		},
		onArrayEnd: (offset: number, length: number) => {
			currentParent = previousParents.pop();
			if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
				// setting value ended
				const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting!.overrides![overrideSetting!.overrides!.length - 1];
				if (setting) {
					const valueEndPosition = model.getPositionAt(offset + length);
					setting.valueRange = Object.assign(setting.valueRange, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
					setting.range = Object.assign(setting.range, {
						endLineNumber: valueEndPosition.lineNumber,
						endColumn: valueEndPosition.column
					});
				}
			}
		},
		onLiteralValue: onValue,
		onError: (error) => {
			const setting = settings[settings.length - 1];
			if (setting && (isNullRange(setting.range) || isNullRange(setting.keyRange) || isNullRange(setting.valueRange))) {
				settings.pop();
			}
		}
	};
	if (!model.isDisposed()) {
		visit(model.getValue(), visitor);
	}
	return settings.length > 0 ? [{
		id: model.isDisposed() ? '' : model.id,
		sections: [
			{
				settings
			}
		],
		title: '',
		titleRange: nullRange,
		range
	} satisfies ISettingsGroup] : [];
}

export class WorkspaceConfigurationEditorModel extends SettingsEditorModel {

	private _configurationGroups: ISettingsGroup[] = [];

	get configurationGroups(): ISettingsGroup[] {
		return this._configurationGroups;
	}

	protected override parse(): void {
		super.parse();
		this._configurationGroups = parse(this.settingsModel, (property: string, previousParents: string[]): boolean => previousParents.length === 0);
	}

	protected override isSettingsProperty(property: string, previousParents: string[]): boolean {
		return property === 'settings' && previousParents.length === 1;
	}

}

export class DefaultSettings extends Disposable {

	private _allSettingsGroups: ISettingsGroup[] | undefined;
	private _content: string | undefined;
	private _contentWithoutMostCommonlyUsed: string | undefined;
	private _settingsByName = new Map<string, ISetting>();

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private _mostCommonlyUsedSettingsKeys: string[],
		readonly target: ConfigurationTarget,
		readonly configurationService: IConfigurationService
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.source === ConfigurationTarget.DEFAULT) {
				this.reset();
				this._onDidChange.fire();
			}
		}));
	}

	getContent(forceUpdate = false): string {
		if (!this._content || forceUpdate) {
			this.initialize();
		}

		return this._content!;
	}

	getContentWithoutMostCommonlyUsed(forceUpdate = false): string {
		if (!this._contentWithoutMostCommonlyUsed || forceUpdate) {
			this.initialize();
		}

		return this._contentWithoutMostCommonlyUsed!;
	}

	getSettingsGroups(forceUpdate = false): ISettingsGroup[] {
		if (!this._allSettingsGroups || forceUpdate) {
			this.initialize();
		}

		return this._allSettingsGroups!;
	}

	private initialize(): void {
		this._allSettingsGroups = this.parse();
		this._content = this.toContent(this._allSettingsGroups, 0);
		this._contentWithoutMostCommonlyUsed = this.toContent(this._allSettingsGroups, 1);
	}

	private reset(): void {
		this._content = undefined;
		this._contentWithoutMostCommonlyUsed = undefined;
		this._allSettingsGroups = undefined;
	}

	private parse(): ISettingsGroup[] {
		const settingsGroups = this.getRegisteredGroups();
		this.initAllSettingsMap(settingsGroups);
		const mostCommonlyUsed = this.getMostCommonlyUsedSettings();
		return [mostCommonlyUsed, ...settingsGroups];
	}

	getRegisteredGroups(): ISettingsGroup[] {
		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations().slice();
		const groups = this.removeEmptySettingsGroups(configurations.sort(this.compareConfigurationNodes)
			.reduce<ISettingsGroup[]>((result, config, index, array) => this.parseConfig(config, result, array), []));

		return this.sortGroups(groups);
	}

	private sortGroups(groups: ISettingsGroup[]): ISettingsGroup[] {
		groups.forEach(group => {
			group.sections.forEach(section => {
				section.settings.sort((a, b) => a.key.localeCompare(b.key));
			});
		});

		return groups;
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

	private getMostCommonlyUsedSettings(): ISettingsGroup {
		const settings = coalesce(this._mostCommonlyUsedSettingsKeys.map(key => {
			const setting = this._settingsByName.get(key);
			if (setting) {
				return {
					description: setting.description,
					key: setting.key,
					value: setting.value,
					keyRange: nullRange,
					range: nullRange,
					valueRange: nullRange,
					overrides: [],
					scope: ConfigurationScope.RESOURCE,
					type: setting.type,
					enum: setting.enum,
					enumDescriptions: setting.enumDescriptions,
					descriptionRanges: []
				} satisfies ISetting;
			}
			return null;
		}));

		return {
			id: 'mostCommonlyUsed',
			range: nullRange,
			title: nls.localize('commonlyUsed', "Commonly Used"),
			titleRange: nullRange,
			sections: [
				{
					settings
				}
			]
		} satisfies ISettingsGroup;
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], configurations: IConfigurationNode[], settingsGroup?: ISettingsGroup, seenSettings?: { [key: string]: boolean }): ISettingsGroup[] {
		seenSettings = seenSettings ? seenSettings : {};
		let title = config.title;
		if (!title) {
			const configWithTitleAndSameId = configurations.find(c => (c.id === config.id) && c.title);
			if (configWithTitleAndSameId) {
				title = configWithTitleAndSameId.title;
			}
		}
		if (title) {
			if (!settingsGroup) {
				settingsGroup = result.find(g => g.title === title && g.extensionInfo?.id === config.extensionInfo?.id);
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], id: config.id || '', title: title || '', titleRange: nullRange, order: config.order, range: nullRange, extensionInfo: config.extensionInfo };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].title = title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], id: config.id || '', title: config.id || '', titleRange: nullRange, order: config.order, range: nullRange, extensionInfo: config.extensionInfo };
				result.push(settingsGroup);
			}
			const configurationSettings: ISetting[] = [];
			for (const setting of [...settingsGroup.sections[settingsGroup.sections.length - 1].settings, ...this.parseSettings(config)]) {
				if (!seenSettings[setting.key]) {
					configurationSettings.push(setting);
					seenSettings[setting.key] = true;
				}
			}
			if (configurationSettings.length) {
				settingsGroup.sections[settingsGroup.sections.length - 1].settings = configurationSettings;
			}
		}
		config.allOf?.forEach(c => this.parseConfig(c, result, configurations, settingsGroup, seenSettings));
		return result;
	}

	private removeEmptySettingsGroups(settingsGroups: ISettingsGroup[]): ISettingsGroup[] {
		const result: ISettingsGroup[] = [];
		for (const settingsGroup of settingsGroups) {
			settingsGroup.sections = settingsGroup.sections.filter(section => section.settings.length > 0);
			if (settingsGroup.sections.length) {
				result.push(settingsGroup);
			}
		}
		return result;
	}

	private parseSettings(config: IConfigurationNode): ISetting[] {
		const result: ISetting[] = [];

		const settingsObject = config.properties;
		const extensionInfo = config.extensionInfo;

		// Try using the title if the category id wasn't given
		// (in which case the category id is the same as the extension id)
		const categoryLabel = config.extensionInfo?.id === config.id ? config.title : config.id;

		for (const key in settingsObject) {
			const prop: IConfigurationPropertySchema = settingsObject[key];
			if (this.matchesScope(prop)) {
				const value = prop.default;
				let description = (prop.markdownDescription || prop.description || '');
				if (typeof description !== 'string') {
					description = '';
				}
				const descriptionLines = description.split('\n');
				const overrides = OVERRIDE_PROPERTY_REGEX.test(key) ? this.parseOverrideSettings(prop.default) : [];
				let listItemType: string | undefined;
				if (prop.type === 'array' && prop.items && !Array.isArray(prop.items) && prop.items.type) {
					if (prop.items.enum) {
						listItemType = 'enum';
					} else if (!Array.isArray(prop.items.type)) {
						listItemType = prop.items.type;
					}
				}

				const objectProperties = prop.type === 'object' ? prop.properties : undefined;
				const objectPatternProperties = prop.type === 'object' ? prop.patternProperties : undefined;
				const objectAdditionalProperties = prop.type === 'object' ? prop.additionalProperties : undefined;

				let enumToUse = prop.enum;
				let enumDescriptions = prop.markdownEnumDescriptions ?? prop.enumDescriptions;
				let enumDescriptionsAreMarkdown = !!prop.markdownEnumDescriptions;
				if (listItemType === 'enum' && !Array.isArray(prop.items)) {
					enumToUse = prop.items!.enum;
					enumDescriptions = prop.items!.markdownEnumDescriptions ?? prop.items!.enumDescriptions;
					enumDescriptionsAreMarkdown = !!prop.items!.markdownEnumDescriptions;
				}

				let allKeysAreBoolean = false;
				if (prop.type === 'object' && !prop.additionalProperties && prop.properties && Object.keys(prop.properties).length) {
					allKeysAreBoolean = Object.keys(prop.properties).every(key => {
						return prop.properties![key].type === 'boolean';
					});
				}

				let isLanguageTagSetting = false;
				if (OVERRIDE_PROPERTY_REGEX.test(key)) {
					isLanguageTagSetting = true;
				}

				let defaultValueSource: ConfigurationDefaultValueSource | undefined;
				if (!isLanguageTagSetting) {
					const registeredConfigurationProp = prop as IRegisteredConfigurationPropertySchema;
					if (registeredConfigurationProp && registeredConfigurationProp.defaultValueSource) {
						defaultValueSource = registeredConfigurationProp.defaultValueSource;
					}
				}

				if (!enumToUse && (prop.enumItemLabels || enumDescriptions || enumDescriptionsAreMarkdown)) {
					console.error(`The setting ${key} has enum-related fields, but doesn't have an enum field. This setting may render improperly in the Settings editor.`);
				}

				result.push({
					key,
					value,
					description: descriptionLines,
					descriptionIsMarkdown: !!prop.markdownDescription,
					range: nullRange,
					keyRange: nullRange,
					valueRange: nullRange,
					descriptionRanges: [],
					overrides,
					scope: prop.scope,
					type: prop.type,
					arrayItemType: listItemType,
					objectProperties,
					objectPatternProperties,
					objectAdditionalProperties,
					enum: enumToUse,
					enumDescriptions: enumDescriptions,
					enumDescriptionsAreMarkdown: enumDescriptionsAreMarkdown,
					enumItemLabels: prop.enumItemLabels,
					uniqueItems: prop.uniqueItems,
					tags: prop.tags,
					disallowSyncIgnore: prop.disallowSyncIgnore,
					restricted: prop.restricted,
					extensionInfo: extensionInfo,
					deprecationMessage: prop.markdownDeprecationMessage || prop.deprecationMessage,
					deprecationMessageIsMarkdown: !!prop.markdownDeprecationMessage,
					validator: createValidator(prop),
					allKeysAreBoolean,
					editPresentation: prop.editPresentation,
					order: prop.order,
					nonLanguageSpecificDefaultValueSource: defaultValueSource,
					isLanguageTagSetting,
					categoryLabel
				});
			}
		}
		return result;
	}

	private parseOverrideSettings(overrideSettings: any): ISetting[] {
		return Object.keys(overrideSettings).map((key) => ({
			key,
			value: overrideSettings[key],
			description: [],
			descriptionIsMarkdown: false,
			range: nullRange,
			keyRange: nullRange,
			valueRange: nullRange,
			descriptionRanges: [],
			overrides: []
		}));
	}

	private matchesScope(property: IConfigurationNode): boolean {
		if (!property.scope) {
			return true;
		}
		if (this.target === ConfigurationTarget.WORKSPACE_FOLDER) {
			return FOLDER_SCOPES.indexOf(property.scope) !== -1;
		}
		if (this.target === ConfigurationTarget.WORKSPACE) {
			return WORKSPACE_SCOPES.indexOf(property.scope) !== -1;
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

	private toContent(settingsGroups: ISettingsGroup[], startIndex: number): string {
		const builder = new SettingsContentBuilder();
		for (let i = startIndex; i < settingsGroups.length; i++) {
			builder.pushGroup(settingsGroups[i], i === startIndex, i === settingsGroups.length - 1);
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
		this._model = reference.object.textEditorModel!;
		this._register(this.onWillDispose(() => reference.dispose()));
	}

	get uri(): URI {
		return this._uri;
	}

	get target(): ConfigurationTarget {
		return this.defaultSettings.target;
	}

	get settingsGroups(): ISettingsGroup[] {
		return this.defaultSettings.getSettingsGroups();
	}

	protected override get filterGroups(): ISettingsGroup[] {
		// Don't look at "commonly used" for filter
		return this.settingsGroups.slice(1);
	}

	protected update(): IFilterResult | undefined {
		if (this._model.isDisposed()) {
			return undefined;
		}

		// Grab current result groups, only render non-empty groups
		const resultGroups = [...this._currentResultGroups.values()]
			.sort((a, b) => a.order - b.order);
		const nonEmptyResultGroups = resultGroups.filter(group => group.result.filterMatches.length);

		const startLine = this.settingsGroups.at(-1)!.range.endLineNumber + 2;
		const { settingsGroups: filteredGroups, matches } = this.writeResultGroups(nonEmptyResultGroups, startLine);

		const metadata = this.collectMetadata(resultGroups);
		return resultGroups.length ?
			{
				allGroups: this.settingsGroups,
				filteredGroups,
				matches,
				metadata: metadata ?? undefined
			} :
			undefined;
	}

	/**
	 * Translate the ISearchResultGroups to text, and write it to the editor model
	 */
	private writeResultGroups(groups: ISearchResultGroup[], startLine: number): { matches: IRange[]; settingsGroups: ISettingsGroup[] } {
		const contentBuilderOffset = startLine - 1;
		const builder = new SettingsContentBuilder(contentBuilderOffset);

		const settingsGroups: ISettingsGroup[] = [];
		const matches: IRange[] = [];
		if (groups.length) {
			builder.pushLine(',');
			groups.forEach(resultGroup => {
				const settingsGroup = this.getGroup(resultGroup);
				settingsGroups.push(settingsGroup);
				matches.push(...this.writeSettingsGroupToBuilder(builder, settingsGroup, resultGroup.result.filterMatches));
			});
		}

		// note: 1-indexed line numbers here
		const groupContent = builder.getContent() + '\n';
		const groupEndLine = this._model.getLineCount();
		const cursorPosition = new Selection(startLine, 1, startLine, 1);
		const edit: ISingleEditOperation = {
			text: groupContent,
			forceMoveMarkers: true,
			range: new Range(startLine, 1, groupEndLine, 1)
		};

		this._model.pushEditOperations([cursorPosition], [edit], () => [cursorPosition]);

		// Force tokenization now - otherwise it may be slightly delayed, causing a flash of white text
		const tokenizeTo = Math.min(startLine + 60, this._model.getLineCount());
		this._model.tokenization.forceTokenization(tokenizeTo);

		return { matches, settingsGroups };
	}

	private writeSettingsGroupToBuilder(builder: SettingsContentBuilder, settingsGroup: ISettingsGroup, filterMatches: ISettingMatch[]): IRange[] {
		filterMatches = filterMatches
			.map(filteredMatch => {
				// Fix match ranges to offset from setting start line
				return {
					setting: filteredMatch.setting,
					score: filteredMatch.score,
					matchType: filteredMatch.matchType,
					keyMatchScore: filteredMatch.keyMatchScore,
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

		// builder has rewritten settings ranges, fix match ranges
		const fixedMatches = filterMatches
			.map(m => m.matches || [])
			.flatMap((settingMatches, i) => {
				const setting = settingsGroup.sections[0].settings[i];
				return settingMatches.map(range => {
					return new Range(
						range.startLineNumber + setting.range.startLineNumber,
						range.startColumn,
						range.endLineNumber + setting.range.startLineNumber,
						range.endColumn);
				});
			});

		return fixedMatches;
	}

	private copySetting(setting: ISetting): ISetting {
		return {
			description: setting.description,
			scope: setting.scope,
			type: setting.type,
			enum: setting.enum,
			enumDescriptions: setting.enumDescriptions,
			key: setting.key,
			value: setting.value,
			range: setting.range,
			overrides: [],
			overrideOf: setting.overrideOf,
			tags: setting.tags,
			deprecationMessage: setting.deprecationMessage,
			keyRange: nullRange,
			valueRange: nullRange,
			descriptionIsMarkdown: undefined,
			descriptionRanges: []
		};
	}

	override getPreference(key: string): ISetting | undefined {
		for (const group of this.settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (setting.key === key) {
						return setting;
					}
				}
			}
		}
		return undefined;
	}

	private getGroup(resultGroup: ISearchResultGroup): ISettingsGroup {
		return {
			id: resultGroup.id,
			range: nullRange,
			title: resultGroup.label,
			titleRange: nullRange,
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

	pushLine(...lineText: string[]): void {
		this._contentByLines.push(...lineText);
	}

	pushGroup(settingsGroups: ISettingsGroup, isFirst?: boolean, isLast?: boolean): void {
		this._contentByLines.push(isFirst ? '[{' : '{');
		const lastSetting = this._pushGroup(settingsGroups, '  ');

		if (lastSetting) {
			// Strip the comma from the last setting
			const lineIdx = lastSetting.range.endLineNumber - this._rangeOffset;
			const content = this._contentByLines[lineIdx - 2];
			this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
		}

		this._contentByLines.push(isLast ? '}]' : '},');
	}

	protected _pushGroup(group: ISettingsGroup, indent: string): ISetting | null {
		let lastSetting: ISetting | null = null;
		const groupStart = this.lineCountWithOffset + 1;
		for (const section of group.sections) {
			if (section.title) {
				const sectionTitleStart = this.lineCountWithOffset + 1;
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

		this.pushSettingDescription(setting, indent);

		let preValueContent = indent;
		const keyString = JSON.stringify(setting.key);
		preValueContent += keyString;
		setting.keyRange = { startLineNumber: this.lineCountWithOffset + 1, startColumn: preValueContent.indexOf(setting.key) + 1, endLineNumber: this.lineCountWithOffset + 1, endColumn: setting.key.length };

		preValueContent += ': ';
		const valueStart = this.lineCountWithOffset + 1;
		this.pushValue(setting, preValueContent, indent);

		setting.valueRange = { startLineNumber: valueStart, startColumn: preValueContent.length + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length + 1 };
		this._contentByLines[this._contentByLines.length - 1] += ',';
		this._contentByLines.push('');
		setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
	}

	private pushSettingDescription(setting: ISetting, indent: string): void {
		const fixSettingLink = (line: string) => line.replace(/`#(.*)#`/g, (match, settingName) => `\`${settingName}\``);

		setting.descriptionRanges = [];
		const descriptionPreValue = indent + '// ';
		const deprecationMessageLines = setting.deprecationMessage?.split(/\n/g) ?? [];
		for (let line of [...deprecationMessageLines, ...setting.description]) {
			line = fixSettingLink(line);

			this._contentByLines.push(descriptionPreValue + line);
			setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
		}

		if (setting.enum && setting.enumDescriptions?.some(desc => !!desc)) {
			setting.enumDescriptions.forEach((desc, i) => {
				const displayEnum = escapeInvisibleChars(String(setting.enum![i]));
				const line = desc ?
					`${displayEnum}: ${fixSettingLink(desc)}` :
					displayEnum;

				const lines = line.split(/\n/g);
				lines[0] = ' - ' + lines[0];
				this._contentByLines.push(...lines.map(l => `${indent}// ${l}`));

				setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
			});
		}
	}

	private pushValue(setting: ISetting, preValueConent: string, indent: string): void {
		const valueString = JSON.stringify(setting.value, null, indent);
		if (valueString && (typeof setting.value === 'object')) {
			if (setting.overrides && setting.overrides.length) {
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

class RawSettingsContentBuilder extends SettingsContentBuilder {

	constructor(private indent: string = '\t') {
		super(0);
	}

	override pushGroup(settingsGroups: ISettingsGroup): void {
		this._pushGroup(settingsGroups, this.indent);
	}

}

export class DefaultRawSettingsEditorModel extends Disposable {

	private _content: string | null = null;

	private readonly _onDidContentChanged = this._register(new Emitter<void>());
	readonly onDidContentChanged = this._onDidContentChanged.event;

	constructor(private defaultSettings: DefaultSettings) {
		super();
		this._register(defaultSettings.onDidChange(() => {
			this._content = null;
			this._onDidContentChanged.fire();
		}));
	}

	get content(): string {
		if (this._content === null) {
			const builder = new RawSettingsContentBuilder();
			builder.pushLine('{');
			for (const settingsGroup of this.defaultSettings.getRegisteredGroups()) {
				builder.pushGroup(settingsGroup);
			}
			builder.pushLine('}');
			this._content = builder.getContent();
		}
		return this._content;
	}
}

function escapeInvisibleChars(enumValue: string): string {
	return enumValue && enumValue
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

export function defaultKeybindingsContents(keybindingService: IKeybindingService): string {
	const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Override key bindings by placing them into your key bindings file.");
	return defaultsHeader + '\n' + keybindingService.getDefaultKeybindingsContent();
}

export class DefaultKeybindingsEditorModel implements IKeybindingsEditorModel<any> {

	private _content: string | undefined;

	constructor(private _uri: URI,
		@IKeybindingService private readonly keybindingService: IKeybindingService) {
	}

	get uri(): URI {
		return this._uri;
	}

	get content(): string {
		if (!this._content) {
			this._content = defaultKeybindingsContents(this.keybindingService);
		}
		return this._content;
	}

	getPreference(): any {
		return null;
	}

	dispose(): void {
		// Not disposable
	}
}
