/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IMatch, matchesBaseContiguousSubString, matchesContiguousSubString, matchesSubString, matchesWords } from '../../../../base/common/filters.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { TfIdfCalculator, TfIdfDocument } from '../../../../base/common/tfIdf.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManagementService, ILocalExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAiSettingsSearchService } from '../../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IGroupFilter, ISearchResult, ISetting, ISettingMatch, ISettingMatcher, ISettingsEditorModel, ISettingsGroup, SettingKeyMatchTypes, SettingMatchType } from '../../../services/preferences/common/preferences.js';
import { nullRange } from '../../../services/preferences/common/preferencesModels.js';
import { EMBEDDINGS_ONLY_SEARCH_PROVIDER_NAME, EMBEDDINGS_SEARCH_PROVIDER_NAME, IAiSearchProvider, IPreferencesSearchService, IRemoteSearchProvider, ISearchProvider, IWorkbenchSettingsConfiguration, LLM_RANKED_SEARCH_PROVIDER_NAME, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME } from '../common/preferences.js';

export interface IEndpointDetails {
	urlBase?: string;
	key?: string;
}

export class PreferencesSearchService extends Disposable implements IPreferencesSearchService {
	declare readonly _serviceBrand: undefined;

	// @ts-expect-error disable remote search for now, ref https://github.com/microsoft/vscode/issues/172411
	private _installedExtensions: Promise<ILocalExtension[]>;
	private _remoteSearchProvider: IRemoteSearchProvider | undefined;
	private _aiSearchProvider: IAiSearchProvider | undefined;

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

	getLocalSearchProvider(filter: string): LocalSearchProvider {
		return this.instantiationService.createInstance(LocalSearchProvider, filter);
	}

	private get remoteSearchAllowed(): boolean {
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		return workbenchSettings.enableNaturalLanguageSearch;
	}

	getRemoteSearchProvider(filter: string): IRemoteSearchProvider | undefined {
		if (!this.remoteSearchAllowed) {
			return undefined;
		}

		this._remoteSearchProvider ??= this.instantiationService.createInstance(RemoteSearchProvider);
		this._remoteSearchProvider.setFilter(filter);
		return this._remoteSearchProvider;
	}

	getAiSearchProvider(filter: string): IAiSearchProvider | undefined {
		if (!this.remoteSearchAllowed) {
			return undefined;
		}

		this._aiSearchProvider ??= this.instantiationService.createInstance(AiSearchProvider);
		this._aiSearchProvider.setFilter(filter);
		return this._aiSearchProvider;
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
	constructor(
		private _filter: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this._filter = cleanFilter(this._filter);
	}

	searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter) {
			return Promise.resolve(null);
		}

		const settingMatcher: ISettingMatcher = (setting: ISetting) => {
			let { matches, matchType, keyMatchScore } = new SettingMatches(
				this._filter,
				setting,
				true,
				this.configurationService
			);
			if (matchType === SettingMatchType.None || matches.length === 0) {
				return null;
			}
			if (strings.equalsIgnoreCase(this._filter, setting.key)) {
				matchType = SettingMatchType.ExactMatch;
			}
			return {
				matches,
				matchType,
				keyMatchScore,
				score: 0 // only used for RemoteSearchProvider matches.
			};
		};

		const filterMatches = preferencesModel.filterSettings(this._filter, this.getGroupFilter(this._filter), settingMatcher);

		// Check the top key match type.
		const topKeyMatchType = Math.max(...filterMatches.map(m => (m.matchType & SettingKeyMatchTypes)));
		// Always allow description matches as part of https://github.com/microsoft/vscode/issues/239936.
		const alwaysAllowedMatchTypes = SettingMatchType.DescriptionOrValueMatch | SettingMatchType.LanguageTagSettingMatch;
		const filteredMatches = filterMatches
			.filter(m => (m.matchType & topKeyMatchType) || (m.matchType & alwaysAllowedMatchTypes) || m.matchType === SettingMatchType.ExactMatch)
			.map(m => ({ ...m, providerName: STRING_MATCH_SEARCH_PROVIDER_NAME }));
		return Promise.resolve({
			filterMatches: filteredMatches,
			exactMatch: filteredMatches.some(m => m.matchType === SettingMatchType.ExactMatch)
		});
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
	/**
	 * A match score for key matches to allow comparing key matches against each other.
	 * Otherwise, all key matches are treated the same, and sorting is done by ToC order.
	 */
	keyMatchScore: number = 0;

	constructor(
		searchString: string,
		setting: ISetting,
		private searchDescription: boolean,
		private readonly configurationService: IConfigurationService
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

	private _toAlphaNumeric(s: string): string {
		return s.replace(/[^\p{L}\p{N}]+/gu, '');
	}

	private _doFindMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		const keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
		const valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();

		// Key (ID) search
		// First, search by the setting's ID and label.
		const settingKeyAsWords: string = this._keyToLabel(setting.key);
		const queryWords = new Set<string>(searchString.split(' '));
		for (const word of queryWords) {
			// Check if the key contains the word. Use contiguous search.
			const keyMatches = matchesWords(word, settingKeyAsWords, true);
			if (keyMatches?.length) {
				keyMatchingWords.set(word, keyMatches.map(match => this.toKeyRange(setting, match)));
			}
		}
		if (keyMatchingWords.size === queryWords.size) {
			// All words in the query matched with something in the setting key.
			// Matches "edit format on paste" to "editor.formatOnPaste".
			this.matchType |= SettingMatchType.AllWordsInSettingsLabel;
		} else if (keyMatchingWords.size >= 2) {
			// Matches "edit paste" to "editor.formatOnPaste".
			// The if statement reduces noise by preventing "editor formatonpast" from matching all editor settings.
			this.matchType |= SettingMatchType.ContiguousWordsInSettingsLabel;
			this.keyMatchScore = keyMatchingWords.size;
		}
		const searchStringAlphaNumeric = this._toAlphaNumeric(searchString);
		const keyAlphaNumeric = this._toAlphaNumeric(setting.key);
		const keyIdMatches = matchesContiguousSubString(searchStringAlphaNumeric, keyAlphaNumeric);
		if (keyIdMatches?.length) {
			// Matches "editorformatonp" to "editor.formatonpaste".
			keyMatchingWords.set(setting.key, keyIdMatches.map(match => this.toKeyRange(setting, match)));
			this.matchType |= SettingMatchType.ContiguousQueryInSettingId;
		}

		// Fall back to non-contiguous key (ID) searches if nothing matched yet.
		if (this.matchType === SettingMatchType.None) {
			keyMatchingWords.clear();
			for (const word of queryWords) {
				const keyMatches = matchesWords(word, settingKeyAsWords, false);
				if (keyMatches?.length) {
					keyMatchingWords.set(word, keyMatches.map(match => this.toKeyRange(setting, match)));
				}
			}
			if (keyMatchingWords.size >= 2 || (keyMatchingWords.size === 1 && queryWords.size === 1)) {
				// Matches "edforonpas" to "editor.formatOnPaste".
				// The if statement reduces noise by preventing "editor fomonpast" from matching all editor settings.
				this.matchType |= SettingMatchType.NonContiguousWordsInSettingsLabel;
				this.keyMatchScore = keyMatchingWords.size;
			} else {
				const keyIdMatches = matchesSubString(searchStringAlphaNumeric, keyAlphaNumeric);
				if (keyIdMatches?.length) {
					// Matches "edfmonpas" to "editor.formatOnPaste".
					keyMatchingWords.set(setting.key, keyIdMatches.map(match => this.toKeyRange(setting, match)));
					this.matchType |= SettingMatchType.NonContiguousQueryInSettingId;
				}
			}
		}

		// Check if the match was for a language tag group setting such as [markdown].
		// In such a case, move that setting to be last.
		if (setting.overrides?.length && (this.matchType !== SettingMatchType.None)) {
			this.matchType = SettingMatchType.LanguageTagSettingMatch;
			const keyRanges = keyMatchingWords.size ?
				Array.from(keyMatchingWords.values()).flat() : [];
			return [...keyRanges];
		}

		// Description search
		// Search the description if we found non-contiguous key matches at best.
		const hasContiguousKeyMatchTypes = this.matchType >= SettingMatchType.ContiguousWordsInSettingsLabel;
		if (this.searchDescription && !hasContiguousKeyMatchTypes) {
			for (const word of queryWords) {
				// Search the description lines.
				for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
					const descriptionMatches = matchesBaseContiguousSubString(word, setting.description[lineIndex]);
					if (descriptionMatches?.length) {
						descriptionMatchingWords.set(word, descriptionMatches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
					}
				}
			}
			if (descriptionMatchingWords.size === queryWords.size) {
				this.matchType |= SettingMatchType.DescriptionOrValueMatch;
			} else {
				// Clear out the match for now. We want to require all words to match in the description.
				descriptionMatchingWords.clear();
			}
		}

		// Value search
		// Check if the value contains all the words.
		// Search the values if we found non-contiguous key matches at best.
		if (!hasContiguousKeyMatchTypes) {
			if (setting.enum?.length) {
				// Search all string values of enums.
				for (const option of setting.enum) {
					if (typeof option !== 'string') {
						continue;
					}
					valueMatchingWords.clear();
					for (const word of queryWords) {
						const valueMatches = matchesContiguousSubString(word, option);
						if (valueMatches?.length) {
							valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
						}
					}
					if (valueMatchingWords.size === queryWords.size) {
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
					for (const word of queryWords) {
						const valueMatches = matchesContiguousSubString(word, settingValue);
						if (valueMatches?.length) {
							valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
						}
					}
					if (valueMatchingWords.size === queryWords.size) {
						this.matchType |= SettingMatchType.DescriptionOrValueMatch;
					} else {
						// Clear out the match for now. We want to require all words to match in the value.
						valueMatchingWords.clear();
					}
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
		const descriptionRange = setting.descriptionRanges[lineIndex];
		if (!descriptionRange) {
			// This case occurs with added settings such as the
			// manage extension setting.
			return nullRange;
		}
		return {
			startLineNumber: descriptionRange.startLineNumber,
			startColumn: descriptionRange.startColumn + match.start,
			endLineNumber: descriptionRange.endLineNumber,
			endColumn: descriptionRange.startColumn + match.end
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

class SettingsRecordProvider {
	private _settingsRecord: IStringDictionary<ISetting> = {};
	private _currentPreferencesModel: ISettingsEditorModel | undefined;

	constructor() { }

	updateModel(preferencesModel: ISettingsEditorModel) {
		if (preferencesModel === this._currentPreferencesModel) {
			return;
		}

		this._currentPreferencesModel = preferencesModel;
		this.refresh();
	}

	private refresh() {
		this._settingsRecord = {};

		if (!this._currentPreferencesModel) {
			return;
		}

		for (const group of this._currentPreferencesModel.settingsGroups) {
			if (group.id === 'mostCommonlyUsed') {
				continue;
			}
			for (const section of group.sections) {
				for (const setting of section.settings) {
					this._settingsRecord[setting.key] = setting;
				}
			}
		}
	}

	getSettingsRecord(): IStringDictionary<ISetting> {
		return this._settingsRecord;
	}
}

class EmbeddingsSearchProvider implements IRemoteSearchProvider {
	private static readonly EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS = 10;

	private readonly _recordProvider: SettingsRecordProvider;
	private _filter: string = '';

	constructor(
		private readonly _aiSettingsSearchService: IAiSettingsSearchService,
		private readonly _excludeSelectionStep: boolean
	) {
		this._recordProvider = new SettingsRecordProvider();
	}

	setFilter(filter: string) {
		this._filter = cleanFilter(filter);
	}

	async searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter || !this._aiSettingsSearchService.isEnabled()) {
			return null;
		}

		this._recordProvider.updateModel(preferencesModel);
		this._aiSettingsSearchService.startSearch(this._filter, this._excludeSelectionStep, token);

		return {
			filterMatches: await this.getEmbeddingsItems(token),
			exactMatch: false
		};
	}

	private async getEmbeddingsItems(token: CancellationToken): Promise<ISettingMatch[]> {
		const settingsRecord = this._recordProvider.getSettingsRecord();
		const filterMatches: ISettingMatch[] = [];
		const settings = await this._aiSettingsSearchService.getEmbeddingsResults(this._filter, token);
		if (!settings) {
			return [];
		}

		const providerName = this._excludeSelectionStep ? EMBEDDINGS_ONLY_SEARCH_PROVIDER_NAME : EMBEDDINGS_SEARCH_PROVIDER_NAME;
		for (const settingKey of settings) {
			if (filterMatches.length === EmbeddingsSearchProvider.EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS) {
				break;
			}
			filterMatches.push({
				setting: settingsRecord[settingKey],
				matches: [settingsRecord[settingKey].range],
				matchType: SettingMatchType.RemoteMatch,
				keyMatchScore: 0,
				score: 0, // the results are sorted upstream.
				providerName
			});
		}

		return filterMatches;
	}
}

class TfIdfSearchProvider implements IRemoteSearchProvider {
	private static readonly TF_IDF_PRE_NORMALIZE_THRESHOLD = 50;
	private static readonly TF_IDF_POST_NORMALIZE_THRESHOLD = 0.7;
	private static readonly TF_IDF_MAX_PICKS = 5;

	private _currentPreferencesModel: ISettingsEditorModel | undefined;
	private _filter: string = '';
	private _documents: TfIdfDocument[] = [];
	private _settingsRecord: IStringDictionary<ISetting> = {};

	constructor() {
	}

	setFilter(filter: string) {
		this._filter = cleanFilter(filter);
	}

	keyToLabel(settingId: string): string {
		const label = settingId
			.replace(/[-._]/g, ' ')
			.replace(/([a-z]+)([A-Z])/g, '$1 $2')
			.replace(/([A-Za-z]+)(\d+)/g, '$1 $2')
			.replace(/(\d+)([A-Za-z]+)/g, '$1 $2')
			.toLowerCase();
		return label;
	}

	settingItemToEmbeddingString(item: ISetting): string {
		let result = `Setting Id: ${item.key}\n`;
		result += `Label: ${this.keyToLabel(item.key)}\n`;
		result += `Description: ${item.description}\n`;
		return result;
	}

	async searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter) {
			return null;
		}

		if (this._currentPreferencesModel !== preferencesModel) {
			// Refresh the documents and settings record
			this._currentPreferencesModel = preferencesModel;
			this._documents = [];
			this._settingsRecord = {};
			for (const group of preferencesModel.settingsGroups) {
				if (group.id === 'mostCommonlyUsed') {
					continue;
				}
				for (const section of group.sections) {
					for (const setting of section.settings) {
						this._documents.push({
							key: setting.key,
							textChunks: [this.settingItemToEmbeddingString(setting)]
						});
						this._settingsRecord[setting.key] = setting;
					}
				}
			}
		}

		return {
			filterMatches: await this.getTfIdfItems(token),
			exactMatch: false
		};
	}

	private async getTfIdfItems(token: CancellationToken): Promise<ISettingMatch[]> {
		const filterMatches: ISettingMatch[] = [];
		const tfIdfCalculator = new TfIdfCalculator();
		tfIdfCalculator.updateDocuments(this._documents);
		const tfIdfRankings = tfIdfCalculator.calculateScores(this._filter, token);
		tfIdfRankings.sort((a, b) => b.score - a.score);
		const maxScore = tfIdfRankings[0].score;

		if (maxScore < TfIdfSearchProvider.TF_IDF_PRE_NORMALIZE_THRESHOLD) {
			// Reject all the matches.
			return [];
		}

		for (const info of tfIdfRankings) {
			if (info.score / maxScore < TfIdfSearchProvider.TF_IDF_POST_NORMALIZE_THRESHOLD || filterMatches.length === TfIdfSearchProvider.TF_IDF_MAX_PICKS) {
				break;
			}
			const pick = info.key;
			filterMatches.push({
				setting: this._settingsRecord[pick],
				matches: [this._settingsRecord[pick].range],
				matchType: SettingMatchType.RemoteMatch,
				keyMatchScore: 0,
				score: info.score,
				providerName: TF_IDF_SEARCH_PROVIDER_NAME
			});
		}

		return filterMatches;
	}
}

class RemoteSearchProvider implements IRemoteSearchProvider {
	private _tfIdfSearchProvider: TfIdfSearchProvider;
	private _filter: string = '';

	constructor() {
		this._tfIdfSearchProvider = new TfIdfSearchProvider();
	}

	setFilter(filter: string): void {
		this._filter = filter;
		this._tfIdfSearchProvider.setFilter(filter);
	}

	async searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter) {
			return null;
		}

		const results = await this._tfIdfSearchProvider.searchModel(preferencesModel, token);
		return results;
	}
}

class AiSearchProvider implements IAiSearchProvider {
	private readonly _embeddingsSearchProvider: EmbeddingsSearchProvider;
	private readonly _recordProvider: SettingsRecordProvider;
	private _filter: string = '';

	constructor(
		@IAiSettingsSearchService private readonly aiSettingsSearchService: IAiSettingsSearchService
	) {
		this._embeddingsSearchProvider = new EmbeddingsSearchProvider(this.aiSettingsSearchService, false);
		this._recordProvider = new SettingsRecordProvider();
	}

	setFilter(filter: string): void {
		this._filter = filter;
		this._embeddingsSearchProvider.setFilter(filter);
	}

	async searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
			return null;
		}

		this._recordProvider.updateModel(preferencesModel);
		const results = await this._embeddingsSearchProvider.searchModel(preferencesModel, token);
		return results;
	}

	async getLLMRankedResults(token: CancellationToken): Promise<ISearchResult | null> {
		if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
			return null;
		}

		const items = await this.getLLMRankedItems(token);
		return {
			filterMatches: items,
			exactMatch: false
		};
	}

	private async getLLMRankedItems(token: CancellationToken): Promise<ISettingMatch[]> {
		const settingsRecord = this._recordProvider.getSettingsRecord();
		const filterMatches: ISettingMatch[] = [];
		const settings = await this.aiSettingsSearchService.getLLMRankedResults(this._filter, token);
		if (!settings) {
			return [];
		}

		for (const settingKey of settings) {
			if (!settingsRecord[settingKey]) {
				// Non-existent setting.
				continue;
			}
			filterMatches.push({
				setting: settingsRecord[settingKey],
				matches: [settingsRecord[settingKey].range],
				matchType: SettingMatchType.RemoteMatch,
				keyMatchScore: 0,
				score: 0, // the results are sorted upstream.
				providerName: LLM_RANKED_SEARCH_PROVIDER_NAME
			});
		}

		return filterMatches;
	}
}

registerSingleton(IPreferencesSearchService, PreferencesSearchService, InstantiationType.Delayed);
