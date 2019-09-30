/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkedString, CompletionItemKind, CompletionItem, DocumentSelector, SnippetString, workspace } from 'vscode';
import { IJSONContribution, ISuggestionsCollector } from './jsonContributions';
import { XHRRequest } from 'request-light';
import { Location } from 'jsonc-parser';
import { textToMarkedString } from './markedTextUtil';

import * as cp from 'child_process';
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

	private knownScopes = ['@types', '@angular', '@babel', '@nuxtjs', '@vue', '@bazel'];
	private xhr: XHRRequest;

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', scheme: '*', pattern: '**/package.json' }];
	}

	public constructor(xhr: XHRRequest) {
		this.xhr = xhr;
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

	private onlineEnabled() {
		return !!workspace.getConfiguration('npm').get('fetchOnlinePackageInfo');
	}

	public collectPropertySuggestions(
		_resource: string,
		location: Location,
		currentWord: string,
		addValue: boolean,
		isLast: boolean,
		collector: ISuggestionsCollector
	): Thenable<any> | null {
		if (!this.onlineEnabled()) {
			return null;
		}

		if ((location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl: string;
			if (currentWord.length > 0) {
				if (currentWord[0] === '@') {
					if (currentWord.indexOf('/') !== -1) {
						return this.collectScopedPackages(currentWord, addValue, isLast, collector);
					}
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
					collector.setAsIncomplete();
				}

				queryUrl = `https://api.npms.io/v2/search/suggestions?size=${LIMIT}&q=${encodeURIComponent(currentWord)}`;
				return this.xhr({
					url: queryUrl,
					agent: USER_AGENT
				}).then((success) => {
					if (success.status === 200) {
						try {
							const obj = JSON.parse(success.responseText);
							if (obj && Array.isArray(obj)) {
								const results = <{ package: SearchPackageInfo; }[]>obj;
								for (const result of results) {
									this.processPackage(result.package, addValue, isLast, collector);
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
		if (segments.length === 2 && segments[0].length > 1) {
			let scope = segments[0].substr(1);
			let name = segments[1];
			if (name.length < 4) {
				name = '';
			}
			let queryUrl = `https://api.npms.io/v2/search?q=scope:${scope}%20${name}&size=250`;
			return this.xhr({
				url: queryUrl,
				agent: USER_AGENT
			}).then((success) => {
				if (success.status === 200) {
					try {
						const obj = JSON.parse(success.responseText);
						if (obj && Array.isArray(obj.results)) {
							const objects = <{ package: SearchPackageInfo }[]>obj.results;
							for (let object of objects) {
								this.processPackage(object.package, addValue, isLast, collector);
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
		if (!this.onlineEnabled()) {
			return null;
		}

		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const currentKey = location.path[location.path.length - 1];
			if (typeof currentKey === 'string') {
				return this.npmView(currentKey).then(info => {
					const latest = info.distTagsLatest;
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
		return this.npmView(pack).then(info => {
			const result: string[] = [];
			result.push(info.description || '');
			result.push(info.distTagsLatest ? localize('json.npm.version.hover', 'Latest version: {0}', info.distTagsLatest) : '');
			result.push(info.homepage || '');
			return result;
		}, () => {
			return [];
		});
	}

	private npmView(pack: string): Promise<ViewPackageInfo> {
		return new Promise((resolve, reject) => {
			const command = 'npm view --json ' + pack + ' description dist-tags.latest homepage';
			cp.exec(command, (error, stdout) => {
				if (error) {
					return reject();
				}
				try {
					const content = JSON.parse(stdout);
					resolve({
						description: content['description'],
						distTagsLatest: content['dist-tags.latest'],
						homepage: content['homepage']
					});
				} catch (e) {
					reject();
				}
			});
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

	private processPackage(pack: SearchPackageInfo, addValue: boolean, isLast: boolean, collector: ISuggestionsCollector) {
		if (pack && pack.name) {
			const name = pack.name;
			const insertText = new SnippetString().appendText(JSON.stringify(name));
			if (addValue) {
				insertText.appendText(': "');
				if (pack.version) {
					insertText.appendVariable('version', pack.version);
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
			proposal.documentation = pack.description || '';
			collector.add(proposal);
		}
	}
}

interface SearchPackageInfo {
	name: string;
	description?: string;
	version?: string;
}

interface ViewPackageInfo {
	description: string;
	distTagsLatest?: string;
	homepage?: string;
}