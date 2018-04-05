/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ISettingsEditorModel, ISetting, ISettingsGroup, IFilterMetadata, ISearchResult, IGroupFilter, ISettingMatcher, IScoredResults, ISettingMatch, IRemoteSetting, IExtensionSetting } from 'vs/workbench/services/preferences/common/preferences';
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
import { IExtensionManagementService, LocalExtensionType, ILocalExtension, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { IPreferencesSearchService, ISearchProvider, IWorkbenchSettingsConfiguration } from 'vs/workbench/parts/preferences/common/preferences';

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
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super();

		// This request goes to the shared process but results won't change during a window's lifetime, so cache the results.
		this._installedExtensions = this.extensionManagementService.getInstalled(LocalExtensionType.User).then(exts => {
			// Filter to enabled extensions that have settings
			return exts
				.filter(ext => this.extensionEnablementService.isEnabled(ext))
				.filter(ext => ext.manifest.contributes && ext.manifest.contributes.configuration)
				.filter(ext => !!ext.identifier.uuid);
		});
	}

	private get remoteSearchAllowed(): boolean {
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

	getRemoteSearchProvider(filter: string, newExtensionsOnly = false): ISearchProvider {
		const opts: IRemoteSearchProviderOptions = {
			filter,
			newExtensionsOnly,
			endpoint: this._endpoint
		};

		return this.remoteSearchAllowed && this.instantiationService.createInstance(RemoteSearchProvider, opts, this._installedExtensions);
	}

	getLocalSearchProvider(filter: string): LocalSearchProvider {
		return this.instantiationService.createInstance(LocalSearchProvider, filter);
	}
}

export class LocalSearchProvider implements ISearchProvider {
	constructor(private _filter: string) {
		// Remove " and : which are likely to be copypasted as part of a setting name.
		// Leave other special characters which the user might want to search for.
		this._filter = this._filter
			.replace(/[":]/g, ' ')
			.replace(/  /g, ' ')
			.trim();
	}

	searchModel(preferencesModel: ISettingsEditorModel): TPromise<ISearchResult> {
		if (!this._filter) {
			return TPromise.wrap(null);
		}

		let score = 1000; // Sort is not stable
		const settingMatcher = (setting: ISetting) => {
			const matches = new SettingMatches(this._filter, setting, true, true, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
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

interface IRemoteSearchProviderOptions {
	filter: string;
	endpoint: IEndpointDetails;
	newExtensionsOnly: boolean;
}

interface IBingRequestDetails {
	url: string;
	body?: string;
	hasMoreFilters?: boolean;
	extensions?: ILocalExtension[];
}

class RemoteSearchProvider implements ISearchProvider {
	// Must keep extension filter size under 8kb. 42 filters puts us there.
	private static MAX_REQUEST_FILTERS = 42;
	private static MAX_REQUESTS = 10;

	private _remoteSearchP: TPromise<IFilterMetadata>;

	constructor(private options: IRemoteSearchProviderOptions, private installedExtensions: TPromise<ILocalExtension[]>,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IRequestService private requestService: IRequestService,
		@ILogService private logService: ILogService
	) {
		this._remoteSearchP = this.options.filter ?
			this.getSettingsForFilter(this.options.filter) :
			TPromise.wrap(null);
	}

	searchModel(preferencesModel: ISettingsEditorModel): TPromise<ISearchResult> {
		return this._remoteSearchP.then(remoteResult => {
			if (!remoteResult) {
				return null;
			}

			const resultKeys = Object.keys(remoteResult.scoredResults);
			const highScoreKey = top(resultKeys, (a, b) => remoteResult.scoredResults[b].score - remoteResult.scoredResults[a].score, 1)[0];
			const highScore = highScoreKey ? remoteResult.scoredResults[highScoreKey].score : 0;
			const minScore = highScore / 5;
			if (this.options.newExtensionsOnly) {
				const passingScoreKeys = resultKeys.filter(k => remoteResult.scoredResults[k].score >= minScore);
				const filterMatches: ISettingMatch[] = passingScoreKeys.map(k => {
					const remoteSetting = remoteResult.scoredResults[k];
					const setting = remoteSettingToISetting(remoteSetting);
					return <ISettingMatch>{
						setting,
						score: remoteSetting.score,
						matches: [] // TODO
					};
				});

				return <ISearchResult>{
					filterMatches,
					metadata: remoteResult
				};
			} else {
				const settingMatcher = this.getRemoteSettingMatcher(remoteResult.scoredResults, minScore, preferencesModel);
				const filterMatches = preferencesModel.filterSettings(this.options.filter, group => null, settingMatcher);
				return <ISearchResult>{
					filterMatches,
					metadata: remoteResult
				};
			}
		});
	}

	private async getSettingsForFilter(filter: string): TPromise<IFilterMetadata> {
		const allRequestDetails: IBingRequestDetails[] = [];

		// Only send MAX_REQUESTS requests in total just to keep it sane
		for (let i = 0; i < RemoteSearchProvider.MAX_REQUESTS; i++) {
			const details = await this.prepareRequest(filter, i);
			allRequestDetails.push(details);
			if (!details.hasMoreFilters) {
				break;
			}
		}

		return TPromise.join(allRequestDetails.map(details => this.getSettingsFromBing(details))).then(allResponses => {
			// Merge all IFilterMetadata
			const metadata = allResponses[0];
			metadata.requestCount = 1;

			for (let response of allResponses.slice(1)) {
				metadata.requestCount++;
				metadata.scoredResults = { ...metadata.scoredResults, ...response.scoredResults };
			}

			return metadata;
		});
	}

	private getSettingsFromBing(details: IBingRequestDetails): TPromise<IFilterMetadata> {
		this.logService.debug(`Searching settings via ${details.url}`);
		if (details.body) {
			this.logService.debug(`Body: ${details.body}`);
		}

		const requestType = details.body ? 'post' : 'get';
		const start = Date.now();
		return this.requestService.request({
			type: requestType,
			url: details.url,
			data: details.body,
			headers: {
				'User-Agent': 'request',
				'Content-Type': 'application/json; charset=utf-8',
				'api-key': this.options.endpoint.key
			},
			timeout: 5000
		}).then(context => {
			if (context.res.statusCode >= 300) {
				throw new Error(`${details} returned status code: ${context.res.statusCode}`);
			}

			return asJson(context);
		}).then((result: any) => {
			const timestamp = Date.now();
			const duration = timestamp - start;
			const remoteSettings: IRemoteSetting[] = (result.value || [])
				.map(r => {
					const key = JSON.parse(r.setting || r.Setting);
					const packageId = r['packageid'];
					const id = getSettingKey(key, packageId);

					const value = r['value'];
					const defaultValue = value ? JSON.parse(value) : value;

					const packageName = r['packagename'];
					let extensionName: string;
					let extensionPublisher: string;
					if (packageName && packageName.indexOf('##') >= 0) {
						[extensionPublisher, extensionName] = packageName.split('##');
					}

					return <IRemoteSetting>{
						key,
						id,
						defaultValue,
						score: r['@search.score'],
						description: JSON.parse(r['details']),
						packageId,
						extensionName,
						extensionPublisher
					};
				});

			const scoredResults = Object.create(null);
			remoteSettings.forEach(s => {
				scoredResults[s.id] = s;
			});

			return <IFilterMetadata>{
				requestUrl: details.url,
				requestBody: details.body,
				duration,
				timestamp,
				scoredResults,
				context: result['@odata.context'],
				extensions: details.extensions
			};
		});
	}

	private getRemoteSettingMatcher(scoredResults: IScoredResults, minScore: number, preferencesModel: ISettingsEditorModel): ISettingMatcher {
		return (setting: ISetting, group: ISettingsGroup) => {
			const remoteSetting = scoredResults[getSettingKey(setting.key, group.id)] || // extension setting
				scoredResults[getSettingKey(setting.key, 'core')] || // core setting
				scoredResults[getSettingKey(setting.key)]; // core setting from original prod endpoint
			if (remoteSetting && remoteSetting.score >= minScore) {
				const settingMatches = new SettingMatches(this.options.filter, setting, false, true, (filter, setting) => preferencesModel.findValueMatches(filter, setting)).matches;
				return { matches: settingMatches, score: remoteSetting.score };
			}

			return null;
		};
	}

	private async prepareRequest(query: string, filterPage = 0): TPromise<IBingRequestDetails> {
		const verbatimQuery = query;
		query = escapeSpecialChars(query);
		const boost = 10;
		const boostedQuery = `(${query})^${boost}`;

		// Appending Fuzzy after each word.
		query = query.replace(/\ +/g, '~ ') + '~';

		const encodedQuery = encodeURIComponent(boostedQuery + ' || ' + query);
		let url = `${this.options.endpoint.urlBase}`;

		if (this.options.endpoint.key) {
			url += `${API_VERSION}&${QUERY_TYPE}`;
		}

		const extensions = await this.installedExtensions;
		const filters = this.options.newExtensionsOnly ?
			[`diminish eq 'latest'`] :
			this.getVersionFilters(extensions, this.environmentService.settingsSearchBuildId);

		const filterStr = filters
			.slice(filterPage * RemoteSearchProvider.MAX_REQUEST_FILTERS, (filterPage + 1) * RemoteSearchProvider.MAX_REQUEST_FILTERS)
			.join(' or ');
		const hasMoreFilters = filters.length > (filterPage + 1) * RemoteSearchProvider.MAX_REQUEST_FILTERS;

		const body = JSON.stringify({
			query: encodedQuery,
			filters: encodeURIComponent(filterStr),
			rawQuery: encodeURIComponent(verbatimQuery)
		});

		return {
			url,
			body,
			hasMoreFilters,
			extensions
		};
	}

	private getVersionFilters(exts: ILocalExtension[], buildNumber?: number): string[] {
		// Only search extensions that contribute settings
		const filters = exts
			.filter(ext => ext.manifest.contributes && ext.manifest.contributes.configuration)
			.map(ext => this.getExtensionFilter(ext));

		if (buildNumber) {
			filters.push(`(packageid eq 'core' and startbuildno le '${buildNumber}' and endbuildno ge '${buildNumber}')`);
		}

		return filters;
	}

	private getExtensionFilter(ext: ILocalExtension): string {
		const uuid = ext.identifier.uuid;
		const versionString = ext.manifest.version
			.split('.')
			.map(versionPart => strings.pad(<any>versionPart, 10))
			.join('');

		return `(packageid eq '${uuid}' and startbuildno le '${versionString}' and endbuildno ge '${versionString}')`;
	}
}

function getSettingKey(name: string, packageId?: string): string {
	return packageId ?
		packageId + '##' + name :
		name;
}

const API_VERSION = 'api-version=2016-09-01-Preview';
const QUERY_TYPE = 'querytype=full';

function escapeSpecialChars(query: string): string {
	return query.replace(/\./g, ' ')
		.replace(/[\\/+\-&|!"~*?:(){}\[\]\^]/g, '\\$&')
		.replace(/  /g, ' ') // collapse spaces
		.trim();
}

function remoteSettingToISetting(remoteSetting: IRemoteSetting): IExtensionSetting {
	return {
		description: remoteSetting.description.split('\n'),
		descriptionRanges: null,
		key: remoteSetting.key,
		keyRange: null,
		value: remoteSetting.defaultValue,
		range: null,
		valueRange: null,
		overrides: [],
		extensionName: remoteSetting.extensionName,
		extensionPublisher: remoteSetting.extensionPublisher
	};
}

class SettingMatches {

	private readonly descriptionMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly keyMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();
	private readonly valueMatchingWords: Map<string, IRange[]> = new Map<string, IRange[]>();

	public readonly matches: IRange[];

	constructor(searchString: string, setting: ISetting, private requireFullQueryMatch: boolean, private searchDescription, private valuesMatcher: (filter: string, setting: ISetting) => IRange[]) {
		this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
	}

	private _findMatchesInSetting(searchString: string, setting: ISetting): IRange[] {
		const result = this._doFindMatchesInSetting(searchString, setting);
		if (setting.overrides && setting.overrides.length) {
			for (const subSetting of setting.overrides) {
				const subSettingMatches = new SettingMatches(searchString, subSetting, this.requireFullQueryMatch, this.searchDescription, this.valuesMatcher);
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
			if (this.searchDescription) {
				for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
					const descriptionMatches = matchesWords(word, setting.description[lineIndex], true);
					if (descriptionMatches) {
						this.descriptionMatchingWords.set(word, descriptionMatches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
					}
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
		if (this.searchDescription) {
			for (let lineIndex = 0; lineIndex < setting.description.length; lineIndex++) {
				const matches = or(matchesContiguousSubString)(searchString, setting.description[lineIndex] || '') || [];
				descriptionRanges.push(...matches.map(match => this.toDescriptionRange(setting, match, lineIndex)));
			}
			if (descriptionRanges.length === 0) {
				descriptionRanges.push(...this.getRangesForWords(words, this.descriptionMatchingWords, [this.keyMatchingWords, this.valueMatchingWords]));
			}
		}

		const keyMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.key);
		const keyRanges: IRange[] = keyMatches ? keyMatches.map(match => this.toKeyRange(setting, match)) : this.getRangesForWords(words, this.keyMatchingWords, [this.descriptionMatchingWords, this.valueMatchingWords]);

		let valueRanges: IRange[] = [];
		if (setting.value && typeof setting.value === 'string') {
			const valueMatches = or(matchesPrefix, matchesContiguousSubString)(searchString, setting.value);
			valueRanges = valueMatches ? valueMatches.map(match => this.toValueRange(setting, match)) : this.getRangesForWords(words, this.valueMatchingWords, [this.keyMatchingWords, this.descriptionMatchingWords]);
		} else {
			valueRanges = this.valuesMatcher ? this.valuesMatcher(searchString, setting) : [];
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