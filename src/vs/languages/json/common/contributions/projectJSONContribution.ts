/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import HtmlContent = require('vs/base/common/htmlContent');
import WinJS = require('vs/base/common/winjs.base');
import nls = require('vs/nls');
import JSONWorker = require('vs/languages/json/common/jsonWorker');
import {IRequestService} from 'vs/platform/request/common/request';

var LIMIT = 40;

export class ProjectJSONContribution implements JSONWorker.IJSONWorkerContribution {

	private requestService : IRequestService;

	public constructor(@IRequestService requestService: IRequestService) {
		this.requestService = requestService;
	}

	public collectDefaultSuggestions(contributionId: string, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		if (contributionId === 'http://json.schemastore.org/project') {
			var defaultValue = {
				'version': '{{1.0.0-*}}',
				'dependencies': {},
				'frameworks': {
					'dnx451': {},
					'dnxcore50': {}
				}
			};
			result.add({ type: 'type', label: nls.localize('json.project.default', 'Default project.json'), codeSnippet: JSON.stringify(defaultValue, null, '\t'), documentationLabel: '' });
		}
		return WinJS.Promise.as(0);
	}

	public collectPropertySuggestions(contributionId: string, currentWord: string, addValue: boolean, isLast:boolean, result: JSONWorker.ISuggestionsCollector) : WinJS.Promise {
		if (contributionId === 'nugget-packages') {
			var queryUrl : string;
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

			return this.requestService.makeRequest({
				url : queryUrl
			}).then((success) => {
				if (success.status === 200) {
					try {
						var obj = JSON.parse(success.responseText);
						if (Array.isArray(obj.d)) {
							var results = <any[]> obj.d;
							for (var i = 0; i < results.length; i++) {
								var curr = results[i];
								var name = curr.Id;
								var version = curr.Version;
								if (name) {
									var documentation = curr.Description;
									var typeLabel = curr.Version;
									var codeSnippet = JSON.stringify(name);
									if (addValue) {
										codeSnippet += ': "{{' + version + '}}"';
										if (!isLast) {
											codeSnippet += ',';
										}
									}
									result.add({ type: 'property', label: name, codeSnippet: codeSnippet, typeLabel: typeLabel, documentationLabel: documentation });
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
		return WinJS.Promise.as(0);
	}

	public collectValueSuggestions(contributionId: string, currentKey: string, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		if (contributionId === 'nugget-packages') {
			var queryUrl = 'https://www.myget.org/F/aspnetrelease/api/v2/Packages?'
					+ '$filter=Id%20eq%20\''
					+ encodeURIComponent(currentKey)
					+ '\'&$select=Version,IsAbsoluteLatestVersion&$format=json&$top=' + LIMIT;

			return this.requestService.makeRequest({
				url : queryUrl
			}).then((success) => {
				try {
					var obj = JSON.parse(success.responseText);
					if (Array.isArray(obj.d)) {
						var results = <any[]> obj.d;
						for (var i = 0; i < results.length; i++) {
							var curr = results[i];
							var version = curr.Version;
							if (version) {
								var name = JSON.stringify(version);
								var isLatest = curr.IsAbsoluteLatestVersion === 'true';
								var label = name;
								var documentationLabel = '';
								if (isLatest) {
									documentationLabel = nls.localize('json.nugget.versiondescription.suggest', 'The currently latest version of the package');
								}
								result.add({ type: 'class', label: label, codeSnippet: name, documentationLabel: documentationLabel });
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
		return WinJS.Promise.as(0);
	}

	public getInfoContribution(contributionId: string, pack: string): WinJS.TPromise<HtmlContent.IHTMLContentElement[]> {

		if (contributionId === 'nugget-package') {

			var htmlContent : HtmlContent.IHTMLContentElement[] = [];
			htmlContent.push({className: 'type', text: nls.localize('json.nugget.package.hover', '{0}', pack) });

			var queryUrl = 'https://www.myget.org/F/aspnetrelease/api/v2/Packages?'
				+ '$filter=Id%20eq%20\''
				+ encodeURIComponent(pack)
				+ '\'%20and%20IsAbsoluteLatestVersion%20eq%20true'
				+ '&$select=Version,Description&$format=json&$top=5';

			return this.requestService.makeRequest({
				url : queryUrl
			}).then((success) => {
				var content = success.responseText;
				if (content) {
					try {
						var obj = JSON.parse(content);
						if (obj.d && obj.d[0]) {
							var res = obj.d[0];
							if (res.Description) {
								htmlContent.push({className: 'documentation', text: res.Description });
							}
							if (res.Version) {
								htmlContent.push({className: 'documentation', text: nls.localize('json.nugget.version.hover', 'Latest version: {0}', res.Version) });
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