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

let LIMIT = 40;

export class PackageJSONContribution implements IJSONContribution {

	private mostDependedOn = ['lodash', 'async', 'underscore', 'request', 'commander', 'express', 'debug', 'chalk', 'colors', 'q', 'coffee-script',
		'mkdirp', 'optimist', 'through2', 'yeoman-generator', 'moment', 'bluebird', 'glob', 'gulp-util', 'minimist', 'cheerio', 'pug', 'redis', 'node-uuid',
		'socket', 'io', 'uglify-js', 'winston', 'through', 'fs-extra', 'handlebars', 'body-parser', 'rimraf', 'mime', 'semver', 'mongodb', 'jquery',
		'grunt', 'connect', 'yosay', 'underscore', 'string', 'xml2js', 'ejs', 'mongoose', 'marked', 'extend', 'mocha', 'superagent', 'js-yaml', 'xtend',
		'shelljs', 'gulp', 'yargs', 'browserify', 'minimatch', 'react', 'less', 'prompt', 'inquirer', 'ws', 'event-stream', 'inherits', 'mysql', 'esprima',
		'jsdom', 'stylus', 'when', 'readable-stream', 'aws-sdk', 'concat-stream', 'chai', 'Thenable', 'wrench'];

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', pattern: '**/package.json' }];
	}

	public constructor(private xhr: XHRRequest) {
	}

	public collectDefaultSuggestions(fileName: string, result: ISuggestionsCollector): Thenable<any> {
		let defaultValue = {
			'name': '${1:name}',
			'description': '${2:description}',
			'authors': '${3:author}',
			'version': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		let proposal = new CompletionItem(localize('json.package.default', 'Default package.json'));
		proposal.kind = CompletionItemKind.Module;
		proposal.insertText = new SnippetString(JSON.stringify(defaultValue, null, '\t'));
		result.add(proposal);
		return Promise.resolve(null);
	}

	public collectPropertySuggestions(resource: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, collector: ISuggestionsCollector): Thenable<any> {
		if ((location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl: string;
			if (currentWord.length > 0) {
				queryUrl = 'https://skimdb.npmjs.com/registry/_design/app/_view/browseAll?group_level=1&limit=' + LIMIT + '&start_key=%5B%22' + encodeURIComponent(currentWord) + '%22%5D&end_key=%5B%22' + encodeURIComponent(currentWord + 'z') + '%22,%7B%7D%5D';

				return this.xhr({
					url: queryUrl
				}).then((success) => {
					if (success.status === 200) {
						try {
							let obj = JSON.parse(success.responseText);
							if (obj && Array.isArray(obj.rows)) {
								let results = <{ key: string[]; }[]>obj.rows;
								for (let i = 0; i < results.length; i++) {
									let keys = results[i].key;
									if (Array.isArray(keys) && keys.length > 0) {
										let name = keys[0];
										let insertText = new SnippetString().appendText(JSON.stringify(name));
										if (addValue) {
											insertText.appendText(': "').appendPlaceholder('').appendText('"');
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
									}
								}
								if (results.length === LIMIT) {
									collector.setAsIncomplete();
								}
							}
						} catch (e) {
							// ignore
						}
					} else {
						collector.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', success.responseText));
						return 0;
					}
				}, (error) => {
					collector.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.mostDependedOn.forEach((name) => {
					let insertText = new SnippetString().appendText(JSON.stringify(name));
					if (addValue) {
						insertText.appendText(': "').appendPlaceholder('').appendText('"');
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

	public collectValueSuggestions(fileName: string, location: Location, result: ISuggestionsCollector): Thenable<any> {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			let currentKey = location.path[location.path.length - 1];
			if (typeof currentKey === 'string') {
				let queryUrl = 'http://registry.npmjs.org/' + encodeURIComponent(currentKey).replace('%40', '@');
				return this.xhr({
					url: queryUrl
				}).then((success) => {
					try {
						let obj = JSON.parse(success.responseText);
						let latest = obj && obj['dist-tags'] && obj['dist-tags']['latest'];
						if (latest) {
							let name = JSON.stringify(latest);
							let proposal = new CompletionItem(name);
							proposal.kind = CompletionItemKind.Property;
							proposal.insertText = name;
							proposal.documentation = localize('json.npm.latestversion', 'The currently latest version of the package');
							result.add(proposal);

							name = JSON.stringify('^' + latest);
							proposal = new CompletionItem(name);
							proposal.kind = CompletionItemKind.Property;
							proposal.insertText = name;
							proposal.documentation = localize('json.npm.majorversion', 'Matches the most recent major version (1.x.x)');
							result.add(proposal);

							name = JSON.stringify('~' + latest);
							proposal = new CompletionItem(name);
							proposal.kind = CompletionItemKind.Property;
							proposal.insertText = name;
							proposal.documentation = localize('json.npm.minorversion', 'Matches the most recent minor version (1.2.x)');
							result.add(proposal);
						}
					} catch (e) {
						// ignore
					}
					return 0;
				}, (error) => {
					return 0;
				});
			}
		}
		return null;
	}

	public resolveSuggestion(item: CompletionItem): Thenable<CompletionItem> {
		if (item.kind === CompletionItemKind.Property && item.documentation === '') {
			return this.getInfo(item.label).then(infos => {
				if (infos.length > 0) {
					item.documentation = infos[0];
					if (infos.length > 1) {
						item.detail = infos[1];
					}
					return item;
				}
				return null;
			});
		};
		return null;
	}

	private getInfo(pack: string): Thenable<string[]> {

		let queryUrl = 'http://registry.npmjs.org/' + encodeURIComponent(pack).replace('%40', '@');
		return this.xhr({
			url: queryUrl
		}).then((success) => {
			try {
				let obj = JSON.parse(success.responseText);
				if (obj) {
					let result: string[] = [];
					if (obj.description) {
						result.push(obj.description);
					}
					let latest = obj && obj['dist-tags'] && obj['dist-tags']['latest'];
					if (latest) {
						result.push(localize('json.npm.version.hover', 'Latest version: {0}', latest));
					}
					return result;
				}
			} catch (e) {
				// ignore
			}
			return [];
		}, (error) => {
			return [];
		});
	}

	public getInfoContribution(fileName: string, location: Location): Thenable<MarkedString[]> {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			let pack = location.path[location.path.length - 1];
			if (typeof pack === 'string') {
				return this.getInfo(pack).then(infos => {
					if (infos.length) {
						return [infos.map(textToMarkedString).join('\n\n')];
					}
					return null;
				});
			}
		}
		return null;
	}
}
