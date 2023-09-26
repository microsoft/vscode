/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISettingsEditorModel, ISetting, ISettingsGroup, ISearchResult, IGroupFilter, SettingMatchType, ISettingMatch } from 'vs/workbench/services/preferences/common/preferences';
import { IRange } from 'vs/editor/common/core/range';
import { distinct } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { IMatch, matchesContiguousSubString, matchesWords } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IPreferencesSearchService, ISearchProvider, IWorkbenchSettingsConfiguration } from 'vs/workbench/contrib/preferences/common/preferences';
import { IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAiRelatedInformationService, RelatedInformationType, SettingInformationResult } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';

export interface IEndpointDetails {
	urlBase?: string;
	key?: string;
}

export class PreferencesSearchService extends Disposable implements IPreferencesSearchService {
	declare readonly _serviceBrand: undefined;

	// @ts-expect-error disable remote search for now, ref https://github.com/microsoft/vscode/issues/172411
	private _installedExtensions: Promise<ILocalExtension[]>;
	private _remoteSearchProvider: RemoteSearchProvider | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super();

		// This request goes to the shared process but results won't change during a window's lifetime, so cache the results.
		this._installedExtensions = this.extensionManagementService.getInstalled(ExtensionType.User).then(exts => {
			// Filter to enabled extensions that have settings
			return exts
				.filter(ext => this.extensionEnablementService.isEnabled(ext))
				.filter(ext => ext.manifest && ext.manifest.contributes && ext.manifest.contributes.configuration)
				.filter(ext => !!ext.identifier.uuid);
		});
	}

	private get remoteSearchAllowed(): boolean {
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		return workbenchSettings.enableNaturalLanguageSearch;
	}

	getRemoteSearchProvider(filter: string, newExtensionsOnly = false): RemoteSearchProvider | undefined {
		if (!this.remoteSearchAllowed) {
			return undefined;
		}

		if (!this._remoteSearchProvider) {
			this._remoteSearchProvider = this.instantiationService.createInstance(RemoteSearchProvider);
		}

		this._remoteSearchProvider.setFilter(filter);
		return this._remoteSearchProvider;
	}

	getLocalSearchProvider(filter: string): LocalSearchProvider {
		return this.instantiationService.createInstance(LocalSearchProvider, filter);
	}
}

function cleanFilter(filter: string): string {
	// Remove " and : which are likely to be copypasted as part of a setting name.
	// Leave other special characters which the user might want to search for.
	return filter
		.replace(/[":]/g, ' ')
		.replace(/  /g, ' ')
		.trim();
}

export class LocalSearchProvider implements ISearchProvider {
	static readonly EXACT_MATCH_SCORE = 10000;
	static readonly START_SCORE = 1000;

	constructor(
		private _filter: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this._filter = cleanFilter(this._filter);
	}

	searchModel(preferencesModel: ISettingsEditorModel, token?: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter) {
			return Promise.resolve(null);
		}

		let orderedScore = LocalSearchProvider.START_SCORE; // Sort is not stable
		const settingMatcher = (setting: ISetting) => {
			const { matches, matchType } = new SettingMatches(this._filter, setting, true, true, (filter, setting) => preferencesModel.findValueMatches(filter, setting), this.configurationService);
			const score = this._filter === setting.key ?
				LocalSearchProvider.EXACT_MATCH_SCORE :
				orderedScore--;

			return matches.length ?
				{
					matches,
					matchType,
					score
				} :
				null;
		};

		const filterMatches = preferencesModel.filterSettings(this._filter, this.getGroupFilter(this._filter), settingMatcher);
		if (filterMatches[0] && filterMatches[0].score === LocalSearchProvider.EXACT_MATCH_SCORE) {
			return Promise.resolve({
				filterMatches: filterMatches.slice(0, 1),
				exactMatch: true
			});
		} else {
			return Promise.resolve({
				filterMatches
			});
		}
	}

	private getGroupFilter(filter: string): IGroupFilter {
		const regex = strings.createRegExp(filter, false, { global: true });
		return (group: ISettingsGroup) => {
			return group.id !== 'defaultOverrides' && regex.test(group.title);
		};
	}
}

export class SettingMatches {
	readonly matches: IRange[];
	matchType: SettingMatchType = SettingMatchType.None;

	constructor(
		searchString: string,
		setting: ISetting,
		requireFullQueryMatch: boolean,
		private searchDescription: boolean,
		valuesMatcher: (filter: string, setting: ISetting) => IRange[],
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
	}

	private _findMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const result = this._doFindMatchesInSetting(searchString, setting);
		return result;
	}

	private _keyToLabel(settingId: string): string {
		const label = settingId
			.replace(/[-._]/g, ' ')
			.replace(/([a-z]+)([A-Z])/g, '$1 $2')
			.replace(/([A-Za-z]+)(\d+)/g, '$1 $2')
			.replace(/(\d+)([A-Za-z]+)/g, '$1 $2')
			.toLowerCase();
		return label;
	}

	private _doFindMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		const keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		const valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();

		const words = new Set<string>(searchString.split(' '));

		// Key search
		const settingKeyAsWords: string = this._keyToLabel(setting.key);
		for (const word of words) {
			// Check if the key contains the word.
			const keyMatches = matchesWords(word, settingKeyAsWords, true);
			if (keyMatches?.length) {
				keyMatchingWords.set(word, keyMatches.map(match => this.toKeyRange(setting, match)));
			}
		}
		// For now, only allow a match if all words match in the key.
		if (keyMatchingWords.size === words.size) {
			this.matchType |= SettingMatchType.KeyMatch;
		} else {
			keyMatchingWords.clear();
		}

		// Also check if the user tried searching by id.
		const keyIdMatches = matchesContiguousSubString(searchString, setting.key);
		if (keyIdMatches?.length) {
			keyMatchingWords.set(setting.key, keyIdMatches.map(match => this.toKeyRange(setting, match)));
			this.matchType |= SettingMatchType.KeyMatch;
		}

		// Check if the match was for a language tag group setting such as [markdown].
		// In such a case, move that setting to be last.
		if (setting.overrides?.length && (this.matchType & SettingMatchType.KeyMatch)) {
			this.matchType = SettingMatchType.LanguageTagSettingMatch;
			const keyRanges = keyMatchingWords.size ?
				Array.from(keyMatchingWords.values()).flat() : [];
			return [...keyRanges];
		}

		// Description search
		if (this.searchDescription) {
			for (const word of words) {
				// Search the description lines.
				for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
					const descriptionMatches = matchesWords(word, setting.description[lineIndex], true);
					if (descriptionMatches?.length) {
						descriptionMatchingWords.set(word, descriptionMatches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
					}
				}
			}
			if (descriptionMatchingWords.size === words.size) {
				this.matchType |= SettingMatchType.DescriptionOrValueMatch;
			} else {
				// Clear out the match for now. We want to require all words to match in the description.
				descriptionMatchingWords.clear();
			}
		}

		// Value search
		// Check if the value contains all the words.
		if (setting.enum?.length) {
			// Search all string values of enums.
			for (const option of setting.enum) {
				if (typeof option !== 'string') {
					continue;
				}
				valueMatchingWords.clear();
				for (const word of words) {
					const valueMatches = matchesContiguousSubString(word, option);
					if (valueMatches?.length) {
						valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
					}
				}
				if (valueMatchingWords.size === words.size) {
					this.matchType |= SettingMatchType.DescriptionOrValueMatch;
					break;
				} else {
					// Clear out the match for now. We want to require all words to match in the value.
					valueMatchingWords.clear();
				}
			}
		} else {
			// Search single string value.
			const settingValue = this.configurationService.getValue(setting.key);
			if (typeof settingValue === 'string') {
				for (const word of words) {
					const valueMatches = matchesContiguousSubString(word, settingValue);
					if (valueMatches?.length) {
						valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
					}
				}
				if (valueMatchingWords.size === words.size) {
					this.matchType |= SettingMatchType.DescriptionOrValueMatch;
				} else {
					// Clear out the match for now. We want to require all words to match in the value.
					valueMatchingWords.clear();
				}
			}
		}

		const descriptionRanges = descriptionMatchingWords.size ?
			Array.from(descriptionMatchingWords.values()).flat() : [];
		const keyRanges = keyMatchingWords.size ?
			Array.from(keyMatchingWords.values()).flat() : [];
		const valueRanges = valueMatchingWords.size ?
			Array.from(valueMatchingWords.values()).flat() : [];
		return [...descriptionRanges, ...keyRanges, ...valueRanges];
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
			startLineNumber: setting.descriptionRanges[lineIndex].startLineNumber,
			startColumn: setting.descriptionRanges[lineIndex].startColumn + match.start,
			endLineNumber: setting.descriptionRanges[lineIndex].endLineNumber,
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
}

class RemoteSearchKeysProvider {
	private settingKeys: string[] = [];
	private settingsRecord: Record<string, ISetting> = {};
	private currentPreferencesModel: ISettingsEditorModel | undefined;

	constructor(
		private readonly aiRelatedInformationService: IAiRelatedInformationService
	) { }

	updateModel(preferencesModel: ISettingsEditorModel) {
		if (preferencesModel === this.currentPreferencesModel) {
			return;
		}

		this.currentPreferencesModel = preferencesModel;
		this.refresh();
	}

	private refresh() {
		this.settingKeys = [];
		this.settingsRecord = {};

		if (
			!this.currentPreferencesModel ||
			!this.aiRelatedInformationService.isEnabled()
		) {
			return;
		}

		for (const group of this.currentPreferencesModel.settingsGroups) {
			if (group.id === 'mostCommonlyUsed') {
				continue;
			}
			for (const section of group.sections) {
				for (const setting of section.settings) {
					this.settingKeys.push(setting.key);
					this.settingsRecord[setting.key] = setting;
				}
			}
		}
	}

	getSettingKeys(): string[] {
		return this.settingKeys;
	}

	getSettingsRecord(): Record<string, ISetting> {
		return this.settingsRecord;
	}
}

export class RemoteSearchProvider implements ISearchProvider {
	private static readonly AI_RELATED_INFORMATION_THRESHOLD = 0.73;
	private static readonly AI_RELATED_INFORMATION_MAX_PICKS = 5;

	private readonly _keysProvider: RemoteSearchKeysProvider;
	private _filter: string = '';

	constructor(
		@IAiRelatedInformationService private readonly aiRelatedInformationService: IAiRelatedInformationService
	) {
		this._keysProvider = new RemoteSearchKeysProvider(aiRelatedInformationService);
	}

	setFilter(filter: string) {
		this._filter = cleanFilter(filter);
	}

	async searchModel(preferencesModel: ISettingsEditorModel, token?: CancellationToken | undefined): Promise<ISearchResult | null> {
		if (
			!this._filter ||
			!this.aiRelatedInformationService.isEnabled()
		) {
			return null;
		}

		this._keysProvider.updateModel(preferencesModel);

		return {
			filterMatches: await this.getAiRelatedInformationItems(token)
		};
	}

	private async getAiRelatedInformationItems(token?: CancellationToken | undefined) {
		const settingsRecord = this._keysProvider.getSettingsRecord();

		const filterMatches: ISettingMatch[] = [];
		const relatedInformation = await this.aiRelatedInformationService.getRelatedInformation(this._filter, [RelatedInformationType.SettingInformation], token ?? CancellationToken.None) as SettingInformationResult[];
		relatedInformation.sort((a, b) => b.weight - a.weight);

		for (const info of relatedInformation) {
			if (info.weight < RemoteSearchProvider.AI_RELATED_INFORMATION_THRESHOLD || filterMatches.length === RemoteSearchProvider.AI_RELATED_INFORMATION_MAX_PICKS) {
				break;
			}
			const pick = info.setting;
			filterMatches.push({
				setting: settingsRecord[pick],
				matches: [settingsRecord[pick].range],
				matchType: SettingMatchType.RemoteMatch,
				score: info.weight
			});
		}

		return filterMatches;
	}
}

registerSingleton(IPreferencesSearchService, PreferencesSearchService, InstantiationType.Delayed);
