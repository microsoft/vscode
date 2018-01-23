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

const LIMIT = 40;
const SCOPED_LIMIT = 250;

const USER_AGENT = 'Visual Studio Code';

export class PackageJSONContribution implements IJSONContribution {

	private mostDependedOn = ['lodash', 'async', 'underscore', 'request', 'commander', 'express', 'debug', 'chalk', 'colors', 'q', 'coffee-script',
		'mkdirp', 'optimist', 'through2', 'yeoman-generator', 'moment', 'bluebird', 'glob', 'gulp-util', 'minimist', 'cheerio', 'pug', 'redis', 'node-uuid',
		'socket', 'io', 'uglify-js', 'winston', 'through', 'fs-extra', 'handlebars', 'body-parser', 'rimraf', 'mime', 'semver', 'mongodb', 'jquery',
		'grunt', 'connect', 'yosay', 'underscore', 'string', 'xml2js', 'ejs', 'mongoose', 'marked', 'extend', 'mocha', 'superagent', 'js-yaml', 'xtend',
		'shelljs', 'gulp', 'yargs', 'browserify', 'minimatch', 'react', 'less', 'prompt', 'inquirer', 'ws', 'event-stream', 'inherits', 'mysql', 'esprima',
		'jsdom', 'stylus', 'when', 'readable-stream', 'aws-sdk', 'concat-stream', 'chai', 'Thenable', 'wrench'];

	private knownScopes = ['@types', '@angular'];

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', pattern: '**/package.json' }];
	}

	public constructor(private xhr: XHRRequest) {
	}

	public collectDefaultSuggestions(_fileName: string, result: ISuggestionsCollector): Thenable<any> {
		const defaultValue = {
			'name': '${1:name}',
			'description': '${2:description}',
			'authors': '${3:author}',
			'version': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		const proposal = new CompletionItem(localize('json.package.default', 'Default package.json'));
		proposal.kind = CompletionItemKind.Module;
		proposal.insertText = new SnippetString(JSON.stringify(defaultValue, null, '\t'));
		result.add(proposal);
		return Promise.resolve(null);
	}

	public collectPropertySuggestions(
		_resource: string,
		location: Location,
		currentWord: string,
		addValue: boolean,
		isLast: boolean,
		collector: ISuggestionsCollector
	): Thenable<any> | null {
		if ((location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl: string;
			if (currentWord.length > 0) {
				if (currentWord[0] === '@') {
					return this.collectScopedPackages(currentWord, addValue, isLast, collector);
				}

				queryUrl = 'https://skimdb.npmjs.com/registry/_design/app/_view/browseAll?group_level=2&limit=' + LIMIT + '&start_key=%5B%22' + encodeURIComponent(currentWord) + '%22%5D&end_key=%5B%22' + encodeURIComponent(currentWord + 'z') + '%22,%7B%7D%5D';

				return this.xhr({
					url: queryUrl,
					agent: USER_AGENT
				}).then((success) => {
					if (success.status === 200) {
						try {
							const obj = JSON.parse(success.responseText);
							if (obj && Array.isArray(obj.rows)) {
								const results = <{ key: string[]; }[]>obj.rows;
								for (let i = 0; i < results.length; i++) {
									const keys = results[i].key;
									if (Array.isArray(keys) && keys.length > 0) {
										const name = keys[0];
										const insertText = new SnippetString().appendText(JSON.stringify(name));
										if (addValue) {
											insertText.appendText(': "').appendTabstop().appendText('"');
											if (!isLast) {
												insertText.appendText(',');
											}
										}
										const proposal = new CompletionItem(name);
										proposal.kind = CompletionItemKind.Property;
										proposal.insertText = insertText;
										proposal.filterText = JSON.stringify(name);
										proposal.documentation = keys[1];
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
					return undefined;
				}, (error) => {
					collector.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.mostDependedOn.forEach((name) => {
					const insertText = new SnippetString().appendText(JSON.stringify(name));
					if (addValue) {
						insertText.appendText(': "').appendTabstop().appendText('"');
						if (!isLast) {
							insertText.appendText(',');
						}
					}
					const proposal = new CompletionItem(name);
					proposal.kind = CompletionItemKind.Property;
					proposal.insertText = insertText;
					proposal.filterText = JSON.stringify(name);
					proposal.documentation = '';
					collector.add(proposal);
				});
				this.collectScopedPackages(currentWord, addValue, isLast, collector);
				collector.setAsIncomplete();
				return Promise.resolve(null);
			}
		}
		return null;
	}

	private collectScopedPackages(currentWord: string, addValue: boolean, isLast: boolean, collector: ISuggestionsCollector): Thenable<any> {
		let segments = currentWord.split('/');
		if (segments.length === 1) {
			for (let scope of this.knownScopes) {
				const proposal = new CompletionItem(scope);
				proposal.kind = CompletionItemKind.Property;
				proposal.insertText = new SnippetString().appendText(`"${scope}/`).appendTabstop().appendText('"');
				proposal.filterText = JSON.stringify(scope);
				proposal.documentation = '';
				proposal.command = {
					title: '',
					command: 'editor.action.triggerSuggest'
				};
				collector.add(proposal);
			}
		} else if (segments.length === 2 && segments[0].length > 1) {
			let scope = segments[0].substr(1);
			let queryUrl = `https://registry.npmjs.org/-/v1/search?text=scope:${scope}%20${segments[1]}&size=${SCOPED_LIMIT}&popularity=1.0`;
			return this.xhr({
				url: queryUrl,
				agent: USER_AGENT
			}).then((success) => {
				if (success.status === 200) {
					try {
						const obj = JSON.parse(success.responseText);
						if (obj && Array.isArray(obj.objects)) {
							const objects = <{ package: { name: string; version: string, description: string; } }[]>obj.objects;
							for (let object of objects) {
								if (object.package && object.package.name) {
									const name = object.package.name;
									const insertText = new SnippetString().appendText(JSON.stringify(name));
									if (addValue) {
										insertText.appendText(': "');
										if (object.package.version) {
											insertText.appendVariable('version', object.package.version);
										} else {
											insertText.appendTabstop();
										}
										insertText.appendText('"');
										if (!isLast) {
											insertText.appendText(',');
										}
									}
									const proposal = new CompletionItem(name);
									proposal.kind = CompletionItemKind.Property;
									proposal.insertText = insertText;
									proposal.filterText = JSON.stringify(name);
									proposal.documentation = object.package.description || '';
									collector.add(proposal);
								}
							}
							if (objects.length === SCOPED_LIMIT) {
								collector.setAsIncomplete();
							}
						}
					} catch (e) {
						// ignore
					}
				} else {
					collector.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', success.responseText));
				}
				return null;
			});
		}
		return Promise.resolve(null);
	}

	public collectValueSuggestions(
		_fileName: string,
		location: Location,
		result: ISuggestionsCollector
	): Thenable<any> | null {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const currentKey = location.path[location.path.length - 1];
			if (typeof currentKey === 'string') {
				const queryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(currentKey).replace('%40', '@');
				return this.xhr({
					url: queryUrl,
					agent: USER_AGENT
				}).then((success) => {
					try {
						const obj = JSON.parse(success.responseText);
						const latest = obj && obj['dist-tags'] && obj['dist-tags']['latest'];
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
				}, () => {
					return 0;
				});
			}
		}
		return null;
	}

	public resolveSuggestion(item: CompletionItem): Thenable<CompletionItem | null> | null {
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
		}
		return null;
	}

	private getInfo(pack: string): Thenable<string[]> {

		const queryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(pack).replace('%40', '@');
		return this.xhr({
			url: queryUrl,
			agent: USER_AGENT
		}).then((success) => {
			try {
				const obj = JSON.parse(success.responseText);
				if (obj) {
					const result: string[] = [];
					if (obj.description) {
						result.push(obj.description);
					}
					const latest = obj && obj['dist-tags'] && obj['dist-tags']['latest'];
					if (latest) {
						result.push(localize('json.npm.version.hover', 'Latest version: {0}', latest));
					}
					return result;
				}
			} catch (e) {
				// ignore
			}
			return [];
		}, () => {
			return [];
		});
	}

	public getInfoContribution(_fileName: string, location: Location): Thenable<MarkedString[] | null> | null {
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const pack = location.path[location.path.length - 1];
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
