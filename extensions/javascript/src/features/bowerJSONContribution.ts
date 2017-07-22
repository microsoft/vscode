/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MarkedString, CompletionItemKind, CompletionItem, DocumentSelector, SnippetString } from 'vscode';
import { IJSONContribution, ISuggestionsCollector } from './jsonContributions';
import { XHRRequest } from 'request-light';
import { Location } from 'jsonc-parser';
import { textToMarkedString } from './markedTextUtil';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class BowerJSONContribution implements IJSONContribution {

	private topRanked = ['twitter', 'bootstrap', 'angular-1.1.6', 'angular-latest', 'angulerjs', 'd3', 'myjquery', 'jq', 'abcdef1234567890', 'jQuery', 'jquery-1.11.1', 'jquery',
		'sushi-vanilla-x-data', 'font-awsome', 'Font-Awesome', 'font-awesome', 'fontawesome', 'html5-boilerplate', 'impress.js', 'homebrew',
		'backbone', 'moment1', 'momentjs', 'moment', 'linux', 'animate.css', 'animate-css', 'reveal.js', 'jquery-file-upload', 'blueimp-file-upload', 'threejs', 'express', 'chosen',
		'normalize-css', 'normalize.css', 'semantic', 'semantic-ui', 'Semantic-UI', 'modernizr', 'underscore', 'underscore1',
		'material-design-icons', 'ionic', 'chartjs', 'Chart.js', 'nnnick-chartjs', 'select2-ng', 'select2-dist', 'phantom', 'skrollr', 'scrollr', 'less.js', 'leancss', 'parser-lib',
		'hui', 'bootstrap-languages', 'async', 'gulp', 'jquery-pjax', 'coffeescript', 'hammer.js', 'ace', 'leaflet', 'jquery-mobile', 'sweetalert', 'typeahead.js', 'soup', 'typehead.js',
		'sails', 'codeigniter2'];

	public constructor(private xhr: XHRRequest) {
	}

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', pattern: '**/bower.json' }, { language: 'json', pattern: '**/.bower.json' }];
	}

	public collectDefaultSuggestions(resource: string, collector: ISuggestionsCollector): Thenable<any> {
		let defaultValue = {
			'name': '${1:name}',
			'description': '${2:description}',
			'authors': ['${3:author}'],
			'version': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		let proposal = new CompletionItem(localize('json.bower.default', 'Default bower.json'));
		proposal.kind = CompletionItemKind.Class;
		proposal.insertText = new SnippetString(JSON.stringify(defaultValue, null, '\t'));
		collector.add(proposal);
		return Promise.resolve(null);
	}

	public collectPropertySuggestions(resource: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, collector: ISuggestionsCollector): Thenable<any> {
		if ((location.matches(['dependencies']) || location.matches(['devDependencies']))) {
			if (currentWord.length > 0) {
				let queryUrl = 'https://bower.herokuapp.com/packages/search/' + encodeURIComponent(currentWord);

				return this.xhr({
					url: queryUrl
				}).then((success) => {
					if (success.status === 200) {
						try {
							let obj = JSON.parse(success.responseText);
							if (Array.isArray(obj)) {
								let results = <{ name: string; description: string; }[]>obj;
								for (let i = 0; i < results.length; i++) {
									let name = results[i].name;
									let description = results[i].description || '';
									let insertText = new SnippetString().appendText(JSON.stringify(name));
									if (addValue) {
										insertText.appendText(': ').appendPlaceholder('latest');
										if (!isLast) {
											insertText.appendText(',');
										}
									}
									let proposal = new CompletionItem(name);
									proposal.kind = CompletionItemKind.Property;
									proposal.insertText = insertText;
									proposal.filterText = JSON.stringify(name);
									proposal.documentation = description;
									collector.add(proposal);
								}
								collector.setAsIncomplete();
							}
						} catch (e) {
							// ignore
						}
					} else {
						collector.error(localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', success.responseText));
						return 0;
					}
				}, (error) => {
					collector.error(localize('json.bower.error.repoaccess', 'Request to the bower repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.topRanked.forEach((name) => {
					let insertText = new SnippetString().appendText(JSON.stringify(name));
					if (addValue) {
						insertText.appendText(': ').appendPlaceholder('latest');
						if (!isLast) {
							insertText.appendText(',');
						}
					}

					let proposal = new CompletionItem(name);
					proposal.kind = CompletionItemKind.Property;
					proposal.insertText = insertText;
					proposal.filterText = JSON.stringify(name);
					proposal.documentation = '';
					collector.add(proposal);
				});
				collector.setAsIncomplete();
				return Promise.resolve(null);
			}
		}
		return null;
	}

	public collectValueSuggestions(resource: string, location: Location, collector: ISuggestionsCollector): Thenable<any> {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']))) {
			// not implemented. Could be do done calling the bower command. Waiting for web API: https://github.com/bower/registry/issues/26
			let proposal = new CompletionItem(localize('json.bower.latest.version', 'latest'));
			proposal.insertText = new SnippetString('"${1:latest}"');
			proposal.filterText = '""';
			proposal.kind = CompletionItemKind.Value;
			proposal.documentation = 'The latest version of the package';
			collector.add(proposal);
		}
		return Promise.resolve(null);
	}

	public resolveSuggestion(item: CompletionItem): Thenable<CompletionItem> {
		if (item.kind === CompletionItemKind.Property && item.documentation === '') {
			return this.getInfo(item.label).then(documentation => {
				if (documentation) {
					item.documentation = documentation;
					return item;
				}
				return null;
			});
		};
		return null;
	}

	private getInfo(pack: string): Thenable<string> {
		let queryUrl = 'https://bower.herokuapp.com/packages/' + encodeURIComponent(pack);

		return this.xhr({
			url: queryUrl
		}).then((success) => {
			try {
				let obj = JSON.parse(success.responseText);
				if (obj && obj.url) {
					let url: string = obj.url;
					if (url.indexOf('git://') === 0) {
						url = url.substring(6);
					}
					if (url.lastIndexOf('.git') === url.length - 4) {
						url = url.substring(0, url.length - 4);
					}
					return url;
				}
			} catch (e) {
				// ignore
			}
			return void 0;
		}, (error) => {
			return void 0;
		});
	}

	public getInfoContribution(resource: string, location: Location): Thenable<MarkedString[]> {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']))) {
			let pack = location.path[location.path.length - 1];
			if (typeof pack === 'string') {
				return this.getInfo(pack).then(documentation => {
					if (documentation) {
						return [textToMarkedString(documentation)];
					}
					return null;
				});
			}
		}
		return null;
	}
}
