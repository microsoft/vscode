/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MarkedString, CompletionItemKind} from 'vscode-languageserver';
import Strings = require('../utils/strings');
import nls = require('../utils/nls');
import {IJSONWorkerContribution, ISuggestionsCollector} from '../jsonContributions';
import {IRequestService} from '../jsonSchemaService';
import {JSONLocation} from '../jsonLocation';

let LIMIT = 40;

export class ProjectJSONContribution implements IJSONWorkerContribution {

	private requestService : IRequestService;

	public constructor(requestService: IRequestService) {
		this.requestService = requestService;
	}

	private isProjectJSONFile(resource: string): boolean {
		return Strings.endsWith(resource, '/project.json');
	}

	public collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isProjectJSONFile(resource)) {
			let defaultValue = {
				'version': '{{1.0.0-*}}',
				'dependencies': {},
				'frameworks': {
					'dnx451': {},
					'dnxcore50': {}
				}
			};
			result.add({ kind: CompletionItemKind.Class, label: nls.localize('json.project.default', 'Default project.json'), insertText: JSON.stringify(defaultValue, null, '\t'), documentation: '' });
		}
		return null;
	}

	public collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : Thenable<any> {
		if (this.isProjectJSONFile(resource) && (location.matches(['dependencies']) || location.matches(['frameworks', '*', 'dependencies']) || location.matches(['frameworks', '*', 'frameworkAssemblies']))) {
			let queryUrl : string;
			if (currentWord.length > 0) {
				queryUrl = 'https://www.nuget.org/api/v2/Packages?'
					+ '$filter=Id%20ge%20\''
					+ encodeURIComponent(currentWord)
					+ '\'%20and%20Id%20lt%20\''
					+ encodeURIComponent(currentWord + 'z')
					+ '\'%20and%20IsAbsoluteLatestVersion%20eq%20true'
					+ '&$select=Id,Version,Description&$format=json&$top=' + LIMIT;
			} else {
				queryUrl = 'https://www.nuget.org/api/v2/Packages?'
					+ '$filter=IsAbsoluteLatestVersion%20eq%20true'
					+ '&$orderby=DownloadCount%20desc&$top=' + LIMIT
					+ '&$select=Id,Version,DownloadCount,Description&$format=json';
			}

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				if (success.status === 200) {
					try {
						let obj = JSON.parse(success.responseText);
						if (Array.isArray(obj.d)) {
							let results = <any[]> obj.d;
							for (let i = 0; i < results.length; i++) {
								let curr = results[i];
								let name = curr.Id;
								let version = curr.Version;
								if (name) {
									let documentation = curr.Description;
									let typeLabel = curr.Version;
									let insertText = JSON.stringify(name);
									if (addValue) {
										insertText += ': "{{' + version + '}}"';
										if (!isLast) {
											insertText += ',';
										}
									}
									result.add({ kind: CompletionItemKind.Property, label: name, insertText: insertText, detail: typeLabel, documentation: documentation });
								}
							}
							if (results.length === LIMIT) {
								result.setAsIncomplete();
							}
						}
					} catch (e) {
						// ignore
					}
				} else {
					result.error(nls.localize('json.nugget.error.repoaccess', 'Request to the nuget repository failed: {0}', success.responseText));
					return 0;
				}
			}, (error) => {
				result.error(nls.localize('json.nugget.error.repoaccess', 'Request to the nuget repository failed: {0}', error.responseText));
				return 0;
			});
		}
		return null;
	}

	public collectValueSuggestions(resource: string, location: JSONLocation, currentKey: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isProjectJSONFile(resource) && (location.matches(['dependencies']) || location.matches(['frameworks', '*', 'dependencies']) || location.matches(['frameworks', '*', 'frameworkAssemblies']))) {
			let queryUrl = 'https://www.myget.org/F/aspnetrelease/api/v2/Packages?'
					+ '$filter=Id%20eq%20\''
					+ encodeURIComponent(currentKey)
					+ '\'&$select=Version,IsAbsoluteLatestVersion&$format=json&$top=' + LIMIT;

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				try {
					let obj = JSON.parse(success.responseText);
					if (Array.isArray(obj.d)) {
						let results = <any[]> obj.d;
						for (let i = 0; i < results.length; i++) {
							let curr = results[i];
							let version = curr.Version;
							if (version) {
								let name = JSON.stringify(version);
								let isLatest = curr.IsAbsoluteLatestVersion === 'true';
								let label = name;
								let documentation = '';
								if (isLatest) {
									documentation = nls.localize('json.nugget.versiondescription.suggest', 'The currently latest version of the package');
								}
								result.add({ kind: CompletionItemKind.Class, label: label, insertText: name, documentation: documentation });
							}
						}
						if (results.length === LIMIT) {
							result.setAsIncomplete();
						}
					}
				} catch (e) {
					// ignore
				}
				return 0;
			}, (error) => {
				return 0;
			});
		}
		return null;
	}

	public getInfoContribution(resource: string, location: JSONLocation): Thenable<MarkedString[]> {
		if (this.isProjectJSONFile(resource) && (location.matches(['dependencies', '*']) || location.matches(['frameworks', '*', 'dependencies', '*']) || location.matches(['frameworks', '*', 'frameworkAssemblies', '*']))) {
			let pack = location.getSegments()[location.getSegments().length - 1];

			let htmlContent : MarkedString[] = [];
			htmlContent.push(nls.localize('json.nugget.package.hover', '{0}', pack));

			let queryUrl = 'https://www.myget.org/F/aspnetrelease/api/v2/Packages?'
				+ '$filter=Id%20eq%20\''
				+ encodeURIComponent(pack)
				+ '\'%20and%20IsAbsoluteLatestVersion%20eq%20true'
				+ '&$select=Version,Description&$format=json&$top=5';

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				let content = success.responseText;
				if (content) {
					try {
						let obj = JSON.parse(content);
						if (obj.d && obj.d[0]) {
							let res = obj.d[0];
							if (res.Description) {
								htmlContent.push(res.Description);
							}
							if (res.Version) {
								htmlContent.push(nls.localize('json.nugget.version.hover', 'Latest version: {0}', res.Version));
							}
						}
					} catch (e) {
						// ignore
					}
				}
				return htmlContent;
			}, (error) => {
				return htmlContent;
			});
		}
		return null;
	}
}