/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MarkedString, CompletionItemKind, CompletionItem, InsertTextFormat } from 'vscode-languageserver';
import Strings = require('../utils/strings');
import { XHRResponse, getErrorStatusDescription, xhr } from 'request-light';
import { JSONWorkerContribution, JSONPath, CompletionsCollector } from 'vscode-json-languageservice';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();


const FEED_INDEX_URL = 'https://api.nuget.org/v3/index.json';
const LIMIT = 30;
const RESOLVE_ID = 'ProjectJSONContribution-';

const CACHE_EXPIRY = 1000 * 60 * 5; // 5 minutes

interface NugetServices {
	'SearchQueryService'?: string;
	'SearchAutocompleteService'?: string;
	'PackageBaseAddress/3.0.0'?: string;
	[key: string]: string;
}

export class ProjectJSONContribution implements JSONWorkerContribution {

	private cachedProjects: { [id: string]: { version: string, description: string, time: number } } = {};
	private cacheSize: number = 0;
	private nugetIndexPromise: Thenable<NugetServices>;

	public constructor() {
	}

	private isProjectJSONFile(resource: string): boolean {
		return Strings.endsWith(resource, '/project.json');
	}

	private completeWithCache(id: string, item: CompletionItem): boolean {
		let entry = this.cachedProjects[id];
		if (entry) {
			if (new Date().getTime() - entry.time > CACHE_EXPIRY) {
				delete this.cachedProjects[id];
				this.cacheSize--;
				return false;
			}
			let insertTextValue = item.insertText;
			item.detail = entry.version;
			item.documentation = entry.description;
			item.insertText = insertTextValue.replace(/\$1/, '${1:' + entry.version + '}');
			return true;
		}
		return false;
	}

	private addCached(id: string, version: string, description: string) {
		this.cachedProjects[id] = { version, description, time: new Date().getTime() };
		this.cacheSize++;
		if (this.cacheSize > 50) {
			let currentTime = new Date().getTime();
			for (let id in this.cachedProjects) {
				let entry = this.cachedProjects[id];
				if (currentTime - entry.time > CACHE_EXPIRY) {
					delete this.cachedProjects[id];
					this.cacheSize--;
				}
			}
		}
	}

	private getNugetIndex(): Thenable<NugetServices> {
		if (!this.nugetIndexPromise) {
			this.nugetIndexPromise = this.makeJSONRequest<any>(FEED_INDEX_URL).then(indexContent => {
				let services: NugetServices = {};
				if (indexContent && Array.isArray(indexContent.resources)) {
					let resources = <any[]>indexContent.resources;
					for (let i = resources.length - 1; i >= 0; i--) {
						let type = resources[i]['@type'];
						let id = resources[i]['@id'];
						if (type && id) {
							services[type] = id;
						}
					}
				}
				return services;
			});
		}
		return this.nugetIndexPromise;
	}

	private getNugetService(serviceType: string): Thenable<string> {
		return this.getNugetIndex().then(services => {
			let serviceURL = services[serviceType];
			if (!serviceURL) {
				return Promise.reject<string>(localize('json.nugget.error.missingservice', 'NuGet index document is missing service {0}', serviceType));
			}
			return serviceURL;
		});
	}

	public collectDefaultCompletions(resource: string, result: CompletionsCollector): Thenable<any> {
		if (this.isProjectJSONFile(resource)) {
			let insertText = JSON.stringify({
				'version': '${1:1.0.0-*}',
				'dependencies': {},
				'frameworks': {
					'net461': {},
					'netcoreapp1.0': {}
				}
			}, null, '\t');
			result.add({ kind: CompletionItemKind.Class, label: localize('json.project.default', 'Default project.json'), insertText, insertTextFormat: InsertTextFormat.Snippet, documentation: '' });
		}
		return null;
	}

	private makeJSONRequest<T>(url: string): Thenable<T> {
		return xhr({
			url: url
		}).then(success => {
			if (success.status === 200) {
				try {
					return <T>JSON.parse(success.responseText);
				} catch (e) {
					return Promise.reject<T>(localize('json.nugget.error.invalidformat', '{0} is not a valid JSON document', url));
				}
			}
			return Promise.reject<T>(localize('json.nugget.error.indexaccess', 'Request to {0} failed: {1}', url, success.responseText));
		}, (error: XHRResponse) => {
			return Promise.reject<T>(localize('json.nugget.error.access', 'Request to {0} failed: {1}', url, getErrorStatusDescription(error.status)));
		});
	}

	public collectPropertyCompletions(resource: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): Thenable<any> {
		if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies']) || matches(location, ['frameworks', '*', 'dependencies']) || matches(location, ['frameworks', '*', 'frameworkAssemblies']))) {

			return this.getNugetService('SearchAutocompleteService').then(service => {
				let queryUrl: string;
				if (currentWord.length > 0) {
					queryUrl = service + '?q=' + encodeURIComponent(currentWord) + '&take=' + LIMIT;
				} else {
					queryUrl = service + '?take=' + LIMIT;
				}
				return this.makeJSONRequest<any>(queryUrl).then(resultObj => {
					if (Array.isArray(resultObj.data)) {
						let results = <any[]>resultObj.data;
						for (let i = 0; i < results.length; i++) {
							let name = results[i];
							let insertText = JSON.stringify(name);
							if (addValue) {
								insertText += ': "$1"';
								if (!isLast) {
									insertText += ',';
								}
							}
							let item: CompletionItem = { kind: CompletionItemKind.Property, label: name, insertText: insertText, insertTextFormat: InsertTextFormat.Snippet, filterText: JSON.stringify(name) };
							if (!this.completeWithCache(name, item)) {
								item.data = RESOLVE_ID + name;
							}
							result.add(item);
						}
						if (results.length === LIMIT) {
							result.setAsIncomplete();
						}
					}
				}, error => {
					result.error(error);
				});
			}, error => {
				result.error(error);
			});
		};
		return null;
	}

	public collectValueCompletions(resource: string, location: JSONPath, currentKey: string, result: CompletionsCollector): Thenable<any> {
		if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies']) || matches(location, ['frameworks', '*', 'dependencies']) || matches(location, ['frameworks', '*', 'frameworkAssemblies']))) {
			return this.getNugetService('PackageBaseAddress/3.0.0').then(service => {
				let queryUrl = service + currentKey + '/index.json';
				return this.makeJSONRequest<any>(queryUrl).then(obj => {
					if (Array.isArray(obj.versions)) {
						let results = <any[]>obj.versions;
						for (let i = 0; i < results.length; i++) {
							let curr = results[i];
							let name = JSON.stringify(curr);
							let label = name;
							let documentation = '';
							result.add({ kind: CompletionItemKind.Class, label: label, insertText: name, documentation: documentation });
						}
						if (results.length === LIMIT) {
							result.setAsIncomplete();
						}
					}
				}, error => {
					result.error(error);
				});
			}, error => {
				result.error(error);
			});
		}
		return null;
	}

	public getInfoContribution(resource: string, location: JSONPath): Thenable<MarkedString[]> {
		if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies', '*']) || matches(location, ['frameworks', '*', 'dependencies', '*']) || matches(location, ['frameworks', '*', 'frameworkAssemblies', '*']))) {
			let pack = <string>location[location.length - 1];

			return this.getNugetService('SearchQueryService').then(service => {
				let queryUrl = service + '?q=' + encodeURIComponent(pack) + '&take=' + 5;
				return this.makeJSONRequest<any>(queryUrl).then(resultObj => {
					let htmlContent: MarkedString[] = [];
					htmlContent.push(localize('json.nugget.package.hover', '{0}', pack));
					if (Array.isArray(resultObj.data)) {
						let results = <any[]>resultObj.data;
						for (let i = 0; i < results.length; i++) {
							let res = results[i];
							this.addCached(res.id, res.version, res.description);
							if (res.id === pack) {
								if (res.description) {
									htmlContent.push(MarkedString.fromPlainText(res.description));
								}
								if (res.version) {
									htmlContent.push(MarkedString.fromPlainText(localize('json.nugget.version.hover', 'Latest version: {0}', res.version)));
								}
								break;
							}
						}
					}
					return htmlContent;
				}, (error) => {
					return null;
				});
			}, (error) => {
				return null;
			});
		}
		return null;
	}

	public resolveSuggestion(item: CompletionItem): Thenable<CompletionItem> {
		if (item.data && Strings.startsWith(item.data, RESOLVE_ID)) {
			let pack = item.data.substring(RESOLVE_ID.length);
			if (this.completeWithCache(pack, item)) {
				return Promise.resolve(item);
			}
			return this.getNugetService('SearchQueryService').then(service => {
				let queryUrl = service + '?q=' + encodeURIComponent(pack) + '&take=' + 10;
				return this.makeJSONRequest<CompletionItem>(queryUrl).then(resultObj => {
					let itemResolved = false;
					if (Array.isArray(resultObj.data)) {
						let results = <any[]>resultObj.data;
						for (let i = 0; i < results.length; i++) {
							let curr = results[i];
							this.addCached(curr.id, curr.version, curr.description);
							if (curr.id === pack) {
								this.completeWithCache(pack, item);
								itemResolved = true;
							}
						}
					}
					return itemResolved ? item : null;
				});
			});
		};
		return null;
	}
}

function matches(segments: JSONPath, pattern: string[]) {
	let k = 0;
	for (let i = 0; k < pattern.length && i < segments.length; i++) {
		if (pattern[k] === segments[i] || pattern[k] === '*') {
			k++;
		} else if (pattern[k] !== '**') {
			return false;
		}
	}
	return k === pattern.length;
}