/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ISettingsEditorModel, ISetting, ISettingsGroup, IWorkbenchSettingsConfiguration, IFilterMetadata, IPreferencesSearchService, ISearchResult, ISearchProvider, IGroupFilter, ISettingMatcher, IScoredResults } from 'vs/workbench/parts/preferences/common/preferences';
import { IRange } from 'vs/editor/common/core/range';
import { distinct, top } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IMatch, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from 'vs/platform/request/node/request';
import { asJson } from 'vs/base/node/request';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, LocalExtensionType, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export interface IEndpointDetails {
	urlBase: string;
	key?: string;
}

export class PreferencesSearchService extends Disposable implements IPreferencesSearchService {
	_serviceBrand: any;

	private _installedExtensions: TPromise<ILocalExtension[]>;

	constructor(
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		super();
		this._installedExtensions = this.extensionManagementService.getInstalled(LocalExtensionType.User);
	}

	private get remoteSearchAllowed(): boolean {
		if (this.environmentService.appQuality === 'stable') {
			return false;
		}

		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		if (!workbenchSettings.enableNaturalLanguageSearch) {
			return false;
		}

		return !!this._endpoint.urlBase;
	}

	private get _endpoint(): IEndpointDetails {
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		if (workbenchSettings.naturalLanguageSearchEndpoint) {
			return {
				urlBase: workbenchSettings.naturalLanguageSearchEndpoint,
				key: workbenchSettings.naturalLanguageSearchKey
			};
		} else {
			return {
				urlBase: this.environmentService.settingsSearchUrl
			};
		}
	}

	getRemoteSearchProvider(filter: string): RemoteSearchProvider {
		return this.remoteSearchAllowed && this.instantiationService.createInstance(RemoteSearchProvider, filter, this._endpoint, this._installedExtensions);
	}

	getLocalSearchProvider(filter: string): LocalSearchProvider {
		return this.instantiationService.createInstance(LocalSearchProvider, filter);
	}
}

export class LocalSearchProvider implements ISearchProvider {
	private _filter: string;

	constructor(filter: string) {
		this._filter = filter;
	}

	searchModel(preferencesModel: ISettingsEditorModel): TPromise<ISearchResult> {
		if (!this._filter) {
			return TPromise.wrap(null);
		}

		let score = 1000; // Sort is not stable
		const settingMatcher = (setting: ISetting) => {
			const matches = new SettingMatches(this._filter, setting, true, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
			return matches && matches.length ?
				{
					matches,
					score: score--
				} :
				null;
		};

		const filterMatches = preferencesModel.filterSettings(this._filter, this.getGroupFilter(this._filter), settingMatcher);
		return TPromise.wrap({
			filterMatches
		});
	}

	private getGroupFilter(filter: string): IGroupFilter {
		const regex = strings.createRegExp(this._filter, false, { global: true });
		return (group: ISettingsGroup) => {
			return regex.test(group.title);
		};
	}
}

export class RemoteSearchProvider implements ISearchProvider {
	private _filter: string;
	private _remoteSearchP: TPromise<IFilterMetadata>;

	constructor(filter: string, endpoint: IEndpointDetails, private installedExtensions: TPromise<ILocalExtension[]>,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IRequestService private requestService: IRequestService,
	) {
		this._filter = filter;

		// @queries are always handled by local filter
		this._remoteSearchP = filter && !strings.startsWith(filter, '@') ?
			this.getSettingsFromBing(filter, endpoint) :
			TPromise.wrap(null);
	}

	searchModel(preferencesModel: ISettingsEditorModel): TPromise<ISearchResult> {
		return this._remoteSearchP.then(remoteResult => {
			if (remoteResult) {
				const highScoreKey = top(Object.keys(remoteResult.scoredResults), (a, b) => remoteResult.scoredResults[b] - remoteResult.scoredResults[a], 1)[0];
				const highScore = highScoreKey ? remoteResult.scoredResults[highScoreKey] : 0;
				const minScore = highScore / 5;

				const settingMatcher = this.getRemoteSettingMatcher(remoteResult.scoredResults, minScore, preferencesModel);
				const filterMatches = preferencesModel.filterSettings(this._filter, group => null, settingMatcher);
				return <ISearchResult>{
					filterMatches,
					metadata: remoteResult
				};
			} else {
				return null;
			}
		});
	}

	private getSettingsFromBing(filter: string, endpoint: IEndpointDetails): TPromise<IFilterMetadata> {
		const start = Date.now();
		return this.prepareUrl(filter, endpoint, this.environmentService.settingsSearchBuildId).then(url => {
			return this.requestService.request({
				url,
				headers: {
					'User-Agent': 'request',
					'Content-Type': 'application/json; charset=utf-8',
					'api-key': endpoint.key
				},
				timeout: 5000
			}).then(context => {
				if (context.res.statusCode >= 300) {
					throw new Error(`${url} returned status code: ${context.res.statusCode}`);
				}

				return asJson(context);
			}).then((result: any) => {
				const timestamp = Date.now();
				const duration = timestamp - start;
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
					scoredResults,
					context: result['@odata.context']
				};
			});
		});
	}

	private getRemoteSettingMatcher(scoredResults: IScoredResults, minScore: number, preferencesModel: ISettingsEditorModel): ISettingMatcher {
		return (setting: ISetting) => {
			const score = scoredResults[setting.key];
			if (typeof score === 'number' && score >= minScore) {
				const settingMatches = new SettingMatches(this._filter, setting, false, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
				return { matches: settingMatches, score: scoredResults[setting.key] };
			}

			return null;
		};
	}

	private prepareUrl(query: string, endpoint: IEndpointDetails, buildNumber: number): TPromise<string> {
		query = escapeSpecialChars(query);
		const boost = 10;
		const userQuery = `(${query})^${boost}`;

		// Appending Fuzzy after each word.
		query = query.replace(/\ +/g, '~ ') + '~';

		const encodedQuery = encodeURIComponent(userQuery + ' || ' + query);
		let url = `${endpoint.urlBase}?`;

		return this.installedExtensions.then(exts => {
			if (endpoint.key) {
				url += `${API_VERSION}`;
				url += `&search=${encodedQuery}`;

				const filters = exts.map(ext => {
					const uuid = ext.identifier.uuid;
					const versionString = ext.manifest.version
						.split('.')
						.map(versionPart => strings.pad(<any>versionPart, 10))
						.join('');

					return `(packageid eq '${uuid}' and startbuildno le '${versionString}' and endbuildno ge '${versionString}')`;
				});

				if (buildNumber) {
					filters.push(`(packageid eq 'core' and startbuildno le '${buildNumber}' and endbuildno ge '${buildNumber}')`);
					url += `&$filter=${filters.join(' or ')}`;
				}
			} else {
				url += `query=${encodedQuery}`;

				if (buildNumber) {
					url += `&build=${buildNumber}`;
				}
			}

			return url;
		});
	}
}

const API_VERSION = 'api-version=2016-09-01-Preview';

function escapeSpecialChars(query: string): string {
	return query.replace(/\./g, ' ')
		.replace(/[\\/+\-&|!"~*?:(){}\[\]\^]/g, '\\$&')
		.replace(/  /g, ' ') // collapse spaces
		.trim();
}

class SettingMatches {

	private readonly descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();

	public readonly matches: IRange[];

	constructor(searchString: string, setting: ISetting, private requireFullQueryMatch: boolean, private valuesMatcher: (filter: string, setting: ISetting) => IRange[]) {
		this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
	}

	private _findMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const result = this._doFindMatchesInSetting(searchString, setting);
		if (setting.overrides && setting.overrides.length) {
			for (const subSetting of setting.overrides) {
				const subSettingMatches = new SettingMatches(searchString, subSetting, this.requireFullQueryMatch, this.valuesMatcher);
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
			} else if (this.requireFullQueryMatch && others.every(o => !o.has(word))) {
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