/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MarkedString, CompletionItemKind} from 'vscode-languageserver';
import Strings = require('../utils/strings');
import {IJSONWorkerContribution, ISuggestionsCollector} from '../jsonContributions';
import {IRequestService} from '../jsonSchemaService';
import {JSONLocation} from '../jsonLocation';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class BowerJSONContribution implements IJSONWorkerContribution {

	private requestService : IRequestService;

	private topRanked = ['twitter','bootstrap','angular-1.1.6','angular-latest','angulerjs','d3','myjquery','jq','abcdef1234567890','jQuery','jquery-1.11.1','jquery',
		'sushi-vanilla-x-data','font-awsome','Font-Awesome','font-awesome','fontawesome','html5-boilerplate','impress.js','homebrew',
		'backbone','moment1','momentjs','moment','linux','animate.css','animate-css','reveal.js','jquery-file-upload','blueimp-file-upload','threejs','express','chosen',
		'normalize-css','normalize.css','semantic','semantic-ui','Semantic-UI','modernizr','underscore','underscore1',
		'material-design-icons','ionic','chartjs','Chart.js','nnnick-chartjs','select2-ng','select2-dist','phantom','skrollr','scrollr','less.js','leancss','parser-lib',
		'hui','bootstrap-languages','async','gulp','jquery-pjax','coffeescript','hammer.js','ace','leaflet','jquery-mobile','sweetalert','typeahead.js','soup','typehead.js',
		'sails','codeigniter2'];

	public constructor(requestService: IRequestService) {
		this.requestService = requestService;
	}

	private isBowerFile(resource: string): boolean {
		return Strings.endsWith(resource, '/bower.json') || Strings.endsWith(resource, '/.bower.json');
	}

	public collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isBowerFile(resource)) {
			let defaultValue = {
				'name': '{{name}}',
				'description': '{{description}}',
				'authors': [ '{{author}}' ],
				'version': '{{1.0.0}}',
				'main': '{{pathToMain}}',
				'dependencies': {}
			};
			result.add({ kind: CompletionItemKind.Class, label: localize('json.bower.default', 'Default bower.json'), insertText: JSON.stringify(defaultValue, null, '\t'), documentation: '' });
		}
		return null;
	}

	public collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : Thenable<any> {
		if (this.isBowerFile(resource) && (location.matches(['dependencies']) || location.matches(['devDependencies']))) {
			if (currentWord.length > 0) {
				let queryUrl = 'https://bower.herokuapp.com/packages/search/' + encodeURIComponent(currentWord);

				return this.requestService({
					url : queryUrl
				}).then((success) => {
					if (success.status === 200) {
						try {
							let obj = JSON.parse(success.responseText);
							if (Array.isArray(obj)) {
								let results = <{name:string; description:string;}[]> obj;
								for (let i = 0; i < results.length; i++) {
									let name = results[i].name;
									let description = results[i].description || '';
									let insertText = JSON.stringify(name);
									if (addValue) {
										insertText += ': "{{*}}"';
										if (!isLast) {
											insertText += ',';
										}
									}
									result.add({ kind: CompletionItemKind.Property, label: name, insertText: insertText, documentation: description });
								}
								result.setAsIncomplete();
							}
						} catch (e) {
							// ignore
						}
					} else {
						result.error(localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', success.responseText));
						return 0;
					}
				}, (error) => {
					result.error(localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.topRanked.forEach((name) => {
					let insertText = JSON.stringify(name);
					if (addValue) {
						insertText += ': "{{*}}"';
						if (!isLast) {
							insertText += ',';
						}
					}
					result.add({ kind: CompletionItemKind.Property, label: name, insertText: insertText, documentation: '' });
				});
				result.setAsIncomplete();
			}
		}
		return null;
	}

	public collectValueSuggestions(resource: string, location: JSONLocation, currentKey: string, result: ISuggestionsCollector): Thenable<any> {
		// not implemented. Could be do done calling the bower command. Waiting for web API: https://github.com/bower/registry/issues/26
		return null;
	}

	public getInfoContribution(resource: string, location: JSONLocation): Thenable<MarkedString[]> {
		if (this.isBowerFile(resource) && (location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']))) {
			let pack = location.getSegments()[location.getSegments().length - 1];
			let htmlContent : MarkedString[] = [];
			htmlContent.push(localize('json.bower.package.hover', '{0}', pack));

			let queryUrl = 'https://bower.herokuapp.com/packages/' + encodeURIComponent(pack);

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				try {
					let obj = JSON.parse(success.responseText);
					if (obj && obj.url) {
						let url = obj.url;
						if (Strings.startsWith(url, 'git://')) {
							url = url.substring(6);
						}
						if (Strings.endsWith(url, '.git')) {
							url = url.substring(0, url.length - 4);
						}
						htmlContent.push(url);
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