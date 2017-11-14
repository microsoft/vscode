/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { ISettingsEditorModel, IFilterResult, ISetting, ISettingsGroup, IWorkbenchSettingsConfiguration, IFilterMetadata } from 'vs/workbench/parts/preferences/common/preferences';
import { IRange, Range } from 'vs/editor/common/core/range';
import { distinct } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IMatch, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export interface IEndpointDetails {
	urlBase: string;
	key: string;
	boost: number;
}

export class PreferencesSearchProvider {
	private _onRemoteSearchEnablementChanged = new Emitter<boolean>();
	public onRemoteSearchEnablementChanged: Event<boolean> = this._onRemoteSearchEnablementChanged.event;

	constructor(
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		configurationService.onDidChangeConfiguration(() => this._onRemoteSearchEnablementChanged.fire(this.remoteSearchEnabled));
	}

	get remoteSearchEnabled(): boolean {
		if (this.environmentService.appQuality === 'stable') {
			return false;
		}

		const endpoint = this.endpoint;
		return !!endpoint.urlBase && !!endpoint.key;
	}

	get endpoint(): IEndpointDetails {
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		return {
			urlBase: workbenchSettings.experimentalFuzzySearchEndpoint,
			key: workbenchSettings.experimentalFuzzySearchKey,
			boost: workbenchSettings.experimentalFuzzySearchBoost
		};
	}

	startSearch(filter: string, remote: boolean): PreferencesSearchModel {
		return new PreferencesSearchModel(this, filter, remote, this.environmentService);
	}
}

export class PreferencesSearchModel {
	private _localProvider: LocalSearchProvider;
	private _remoteProvider: RemoteSearchProvider;

	constructor(private provider: PreferencesSearchProvider, private filter: string, remote: boolean, environmentService: IEnvironmentService) {
		this._localProvider = new LocalSearchProvider(filter);

		if (remote && filter) {
			this._remoteProvider = new RemoteSearchProvider(filter, this.provider.endpoint, environmentService);
		}
	}

	filterPreferences(preferencesModel: ISettingsEditorModel): TPromise<IFilterResult> {
		if (!this.filter) {
			return TPromise.wrap(null);
		}

		if (this._remoteProvider) {
			return this._remoteProvider.filterPreferences(preferencesModel).then(null, err => {
				return this._localProvider.filterPreferences(preferencesModel);
			});
		} else {
			return this._localProvider.filterPreferences(preferencesModel);
		}
	}
}

class LocalSearchProvider {
	private _filter: string;

	constructor(filter: string) {
		this._filter = filter;
	}

	filterPreferences(preferencesModel: ISettingsEditorModel): TPromise<IFilterResult> {
		const regex = strings.createRegExp(this._filter, false, { global: true });

		const groupFilter = (group: ISettingsGroup) => {
			return regex.test(group.title);
		};

		const settingFilter = (setting: ISetting) => {
			return new SettingMatches(this._filter, setting, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
		};

		return TPromise.wrap(preferencesModel.filterSettings(this._filter, groupFilter, settingFilter));
	}
}

class RemoteSearchProvider {
	private _filter: string;
	private _remoteSearchP: TPromise<IFilterMetadata>;

	constructor(filter: string, endpoint: IEndpointDetails, private environmentService: IEnvironmentService) {
		this._filter = filter;
		this._remoteSearchP = filter ? this.getSettingsFromBing(filter, endpoint) : TPromise.wrap(null);
	}

	filterPreferences(preferencesModel: ISettingsEditorModel): TPromise<IFilterResult> {
		return this._remoteSearchP.then(remoteResult => {
			const settingFilter = (setting: ISetting) => {
				if (!!remoteResult.scoredResults[setting.key]) {
					const settingMatches = new SettingMatches(this._filter, setting, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
					if (settingMatches.length) {
						return settingMatches;
					} else {
						return [new Range(setting.keyRange.startLineNumber, setting.keyRange.startColumn, setting.keyRange.endLineNumber, setting.keyRange.startColumn)];
					}
				} else {
					return null;
				}
			};

			if (remoteResult) {
				let sortedNames = Object.keys(remoteResult.scoredResults).sort((a, b) => remoteResult.scoredResults[b] - remoteResult.scoredResults[a]);
				if (sortedNames.length) {
					const highScore = remoteResult.scoredResults[sortedNames[0]];
					sortedNames = sortedNames.filter(name => remoteResult.scoredResults[name] >= highScore / 2);
				}

				const result = preferencesModel.filterSettings(this._filter, group => null, settingFilter, sortedNames);
				result.metadata = remoteResult;
				return result;
			} else {
				return null;
			}
		});
	}

	private getSettingsFromBing(filter: string, endpoint: IEndpointDetails): TPromise<IFilterMetadata> {
		const url = prepareUrl(filter, endpoint, this.environmentService.settingsSearchBuildId);
		console.log('fetching: ' + url);
		const start = Date.now();
		const p = fetch(url, {
			headers: new Headers({
				'User-Agent': 'request',
				'Content-Type': 'application/json; charset=utf-8',
				'api-key': endpoint.key
			})
		})
			.then(r => r.json())
			.then(result => {
				const timestamp = Date.now();
				const duration = timestamp - start;
				console.log('time: ' + duration / 1000);
				const suggestions = (result.value || [])
					.map(r => ({
						name: r.setting || r.Setting,
						score: r['@search.score']
					}));

				const scoredResults = Object.create(null);
				suggestions.forEach(s => {
					const name = s.name
						.replace(/^"/, '')
						.replace(/"$/, '');
					scoredResults[name] = s.score;
				});

				return <IFilterMetadata>{
					remoteUrl: url,
					duration,
					timestamp,
					scoredResults
				};
			});

		return TPromise.as(p as any);
	}
}

const API_VERSION = 'api-version=2016-09-01-Preview';
const QUERY_TYPE = 'querytype=full';
const SCORING_PROFILE = 'scoringProfile=ranking';

function escapeSpecialChars(query: string): string {
	return query.replace(/\./g, ' ')
		.replace(/[\\/+\-&|!"~*?:(){}\[\]\^]/g, '\\$&')
		.replace(/  /g, ' ') // collapse spaces
		.trim();
}

function prepareUrl(query: string, endpoint: IEndpointDetails, buildNumber: number): string {
	query = escapeSpecialChars(query);
	const boost = endpoint.boost || 1;
	const userQuery = `(${query})^${boost}`;

	// Appending Fuzzy after each word.
	query = query.replace(/\ +/g, '~ ') + '~';

	let url = `${endpoint.urlBase}?${API_VERSION}&search=${encodeURIComponent(userQuery + ' || ' + query)}&${QUERY_TYPE}&${SCORING_PROFILE}`;
	if (buildNumber) {
		url += `&$filter startbuildno le ${buildNumber} and endbuildno ge ${buildNumber}`;
	}

	return url;
}

class SettingMatches {

	private readonly descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();

	public readonly matches: IRange[];

	constructor(searchString: string, setting: ISetting, private valuesMatcher: (filter: string, setting: ISetting) => IRange[]) {
		this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
	}

	private _findMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const result = this._doFindMatchesInSetting(searchString, setting);
		if (setting.overrides && setting.overrides.length) {
			for (const subSetting of setting.overrides) {
				const subSettingMatches = new SettingMatches(searchString, subSetting, this.valuesMatcher);
				let words = searchString.split(' ');
				const descriptionRanges: IRange[] = this.getRangesForWords(words, this.descriptionMatchingWords, [subSettingMatches.descriptionMatchingWords, subSettingMatches.keyMatchingWords, subSettingMatches.valueMatchingWords]);
				const keyRanges: IRange[] = this.getRangesForWords(words, this.keyMatchingWords, [subSettingMatches.descriptionMatchingWords, subSettingMatches.keyMatchingWords, subSettingMatches.valueMatchingWords]);
				const subSettingKeyRanges: IRange[] = this.getRangesForWords(words, subSettingMatches.keyMatchingWords, [this.descriptionMatchingWords, this.keyMatchingWords, subSettingMatches.valueMatchingWords]);
				const subSettinValueRanges: IRange[] = this.getRangesForWords(words, subSettingMatches.valueMatchingWords, [this.descriptionMatchingWords, this.keyMatchingWords, subSettingMatches.keyMatchingWords]);
				result.push(...descriptionRanges, ...keyRanges, ...subSettingKeyRanges, ...subSettinValueRanges);
				result.push(...subSettingMatches.matches);
			}
		}
		return result;
	}

	private _doFindMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const registry: { [qualifiedKey: string]: IJSONSchema } = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const schema: IJSONSchema = registry[setting.key];

		let words = searchString.split(' ');
		const settingKeyAsWords: string = setting.key.split('.').join(' ');

		for (const word of words) {
			for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
				const descriptionMatches = matchesWords(word, setting.description[lineIndex], true);
				if (descriptionMatches) {
					this.descriptionMatchingWords.set(word, descriptionMatches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
				}
			}

			const keyMatches = or(matchesWords, matchesCamelCase)(word, settingKeyAsWords);
			if (keyMatches) {
				this.keyMatchingWords.set(word, keyMatches.map(match => this.toKeyRange(setting, match)));
			}

			const valueMatches = typeof setting.value === 'string' ? matchesContiguousSubString(word, setting.value) : null;
			if (valueMatches) {
				this.valueMatchingWords.set(word, valueMatches.map(match => this.toValueRange(setting, match)));
			} else if (schema && schema.enum && schema.enum.some(enumValue => typeof enumValue === 'string' && !!matchesContiguousSubString(word, enumValue))) {
				this.valueMatchingWords.set(word, []);
			}
		}

		const descriptionRanges: IRange[] = [];
		for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
			const matches = or(matchesContiguousSubString)(searchString, setting.description[lineIndex] || '') || [];
			descriptionRanges.push(...matches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
		}
		if (descriptionRanges.length === 0) {
			descriptionRanges.push(...this.getRangesForWords(words, this.descriptionMatchingWords, [this.keyMatchingWords, this.valueMatchingWords]));
		}

		const keyMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.key);
		const keyRanges: IRange[] = keyMatches ? keyMatches.map(match => this.toKeyRange(setting, match)) : this.getRangesForWords(words, this.keyMatchingWords, [this.descriptionMatchingWords, this.valueMatchingWords]);

		let valueRanges: IRange[] = [];
		if (setting.value && typeof setting.value === 'string') {
			const valueMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.value);
			valueRanges = valueMatches ? valueMatches.map(match => this.toValueRange(setting, match)) : this.getRangesForWords(words, this.valueMatchingWords, [this.keyMatchingWords, this.descriptionMatchingWords]);
		} else {
			valueRanges = this.valuesMatcher(searchString, setting);
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