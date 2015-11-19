/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import HtmlContent = require('vs/base/common/htmlContent');
import Strings = require('vs/base/common/strings');
import WinJS = require('vs/base/common/winjs.base');
import nls = require('vs/nls');
import JSONWorker = require('vs/languages/json/common/jsonWorker');
import {IRequestService} from 'vs/platform/request/common/request';

export class BowerJSONContribution implements JSONWorker.IJSONWorkerContribution {

	private requestService : IRequestService;

	private topRanked = ['twitter','bootstrap','angular-1.1.6','angular-latest','angulerjs','d3','myjquery','jq','abcdef1234567890','jQuery','jquery-1.11.1','jquery',
		'sushi-vanilla-x-data','font-awsome','Font-Awesome','font-awesome','fontawesome','html5-boilerplate','impress.js','homebrew',
		'backbone','moment1','momentjs','moment','linux','animate.css','animate-css','reveal.js','jquery-file-upload','blueimp-file-upload','threejs','express','chosen',
		'normalize-css','normalize.css','semantic','semantic-ui','Semantic-UI','modernizr','underscore','underscore1',
		'material-design-icons','ionic','chartjs','Chart.js','nnnick-chartjs','select2-ng','select2-dist','phantom','skrollr','scrollr','less.js','leancss','parser-lib',
		'hui','bootstrap-languages','async','gulp','jquery-pjax','coffeescript','hammer.js','ace','leaflet','jquery-mobile','sweetalert','typeahead.js','soup','typehead.js',
		'sails','codeigniter2'];

	public constructor(@IRequestService requestService: IRequestService) {
		this.requestService = requestService;
	}

	public collectDefaultSuggestions(contributionId: string, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		if (contributionId === 'http://json.schemastore.org/bower') {
			var defaultValue = {
				'name': '{{name}}',
				'description': '{{description}}',
				'author': '{{author}}',
				'version': '{{1.0.0}}',
				'main': '{{pathToMain}}',
				'dependencies': {}
			};
			result.add({ type: 'type', label: nls.localize('json.bower.default', 'Default bower.json'), codeSnippet: JSON.stringify(defaultValue, null, '\t'), documentationLabel: '' });
		}
		return WinJS.Promise.as(0);
	}

	public collectPropertySuggestions(contributionId: string, currentWord: string, addValue: boolean, isLast:boolean, result: JSONWorker.ISuggestionsCollector) : WinJS.Promise {
		if (contributionId === 'bower-packages') {
			if (currentWord.length > 0) {
				var queryUrl = 'https://bower.herokuapp.com/packages/search/' + encodeURIComponent(currentWord);

				return this.requestService.makeRequest({
					url : queryUrl
				}).then((success) => {
					if (success.status === 200) {
						try {
							var obj = JSON.parse(success.responseText);
							if (Array.isArray(obj)) {
								var results = <{name:string; description:string;}[]> obj;
								for (var i = 0; i < results.length; i++) {
									var name = results[i].name;
									var description = results[i].description || '';
									var codeSnippet = JSON.stringify(name);
									if (addValue) {
										codeSnippet += ': "{{*}}"';
										if (!isLast) {
											codeSnippet += ',';
										}
									}
									result.add({ type: 'property', label: name, codeSnippet: codeSnippet, documentationLabel: description });
								}
								result.setAsIncomplete();
							}
						} catch (e) {
							// ignore
						}
					} else {
						result.error(nls.localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', success.responseText));
						return 0;
					}
				}, (error) => {
					result.error(nls.localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.topRanked.forEach((name) => {
					var codeSnippet = JSON.stringify(name);
					if (addValue) {
						codeSnippet += ': "{{*}}"';
						if (!isLast) {
							codeSnippet += ',';
						}
					}
					result.add({ type: 'property', label: name, codeSnippet: codeSnippet, documentationLabel: '' });
				});
				result.setAsIncomplete();
			}
		}
		return WinJS.Promise.as(0);
	}

	public collectValueSuggestions(contributionId: string, currentKey: string, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		// not implemented. Could be do done calling the bower command. Waiting for web API: https://github.com/bower/registry/issues/26
		return WinJS.Promise.as(0);
	}

	public getInfoContribution(contributionId: string, pack: string): WinJS.TPromise<HtmlContent.IHTMLContentElement[]> {
		if (contributionId === 'bower-package') {
			var htmlContent : HtmlContent.IHTMLContentElement[] = [];
			htmlContent.push({className: 'type', text: nls.localize('json.bower.package.hover', '{0}', pack) });

			var queryUrl = 'https://bower.herokuapp.com/packages/' + encodeURIComponent(pack);

			return this.requestService.makeRequest({
				url : queryUrl
			}).then((success) => {
				try {
					var obj = JSON.parse(success.responseText);
					if (obj && obj.url) {
						var url = obj.url;
						if (Strings.startsWith(url, 'git://')) {
							url = url.substring(6);
						}
						if (Strings.endsWith(url, '.git')) {
							url = url.substring(0, url.length - 4);
						}
						htmlContent.push({className: 'documentation', text: url });
					}
				} catch (e) {
					// ignore
				}
				return htmlContent;
			}, (error) => {
				return htmlContent;
			});
		}
		return null;
	}
}