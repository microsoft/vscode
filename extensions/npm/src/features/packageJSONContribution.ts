/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItemKind, CompletionItem, DocumentSelector, MarkdownString, SnippetString, Uri, l10n } from 'vscode';
import { IJSONContribution, ISuggestionsCollector } from './jsonContributions';
import { XHRRequest } from 'request-light';
import { Location } from 'jsonc-parser';
import { NpmPackageInfoProvider } from './packageInfo';

const LIMIT = 40;

export class PackageJSONContribution implements IJSONContribution {

	private mostDependedOn = ['lodash', 'async', 'underscore', 'request', 'commander', 'express', 'debug', 'chalk', 'colors', 'q', 'coffee-script',
		'mkdirp', 'optimist', 'through2', 'yeoman-generator', 'moment', 'bluebird', 'glob', 'gulp-util', 'minimist', 'cheerio', 'pug', 'redis', 'node-uuid',
		'socket', 'io', 'uglify-js', 'winston', 'through', 'fs-extra', 'handlebars', 'body-parser', 'rimraf', 'mime', 'semver', 'mongodb', 'jquery',
		'grunt', 'connect', 'yosay', 'underscore', 'string', 'xml2js', 'ejs', 'mongoose', 'marked', 'extend', 'mocha', 'superagent', 'js-yaml', 'xtend',
		'shelljs', 'gulp', 'yargs', 'browserify', 'minimatch', 'react', 'less', 'prompt', 'inquirer', 'ws', 'event-stream', 'inherits', 'mysql', 'esprima',
		'jsdom', 'stylus', 'when', 'readable-stream', 'aws-sdk', 'concat-stream', 'chai', 'Thenable', 'wrench'];

	private knownScopes = ['@types', '@angular', '@babel', '@nuxtjs', '@vue', '@bazel'];
	private readonly packageInfoProvider: NpmPackageInfoProvider;

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', scheme: '*', pattern: '**/package.json' }];
	}

	public constructor(private xhr: XHRRequest, npmCommandPath: string | undefined) {
		this.packageInfoProvider = new NpmPackageInfoProvider(xhr, npmCommandPath);
	}

	public collectDefaultSuggestions(_resource: Uri, result: ISuggestionsCollector): Thenable<any> {
		const defaultValue = {
			'name': '${1:name}',
			'description': '${2:description}',
			'authors': '${3:author}',
			'version': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		const proposal = new CompletionItem(l10n.t("Default package.json"));
		proposal.kind = CompletionItemKind.Module;
		proposal.insertText = new SnippetString(JSON.stringify(defaultValue, null, '\t'));
		result.add(proposal);
		return Promise.resolve(null);
	}

	public collectPropertySuggestions(
		_resource: Uri,
		location: Location,
		currentWord: string,
		addValue: boolean,
		isLast: boolean,
		collector: ISuggestionsCollector
	): Thenable<any> | null {
		if (!this.packageInfoProvider.isEnabled()) {
			return null;
		}

		if ((location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl: string;
			if (currentWord.length > 0) {
				if (currentWord[0] === '@') {
					if (currentWord.indexOf('/') !== -1) {
						return this.collectScopedPackages(currentWord, addValue, isLast, collector);
					}
					for (const scope of this.knownScopes) {
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

				queryUrl = `https://registry.npmjs.org/-/v1/search?size=${LIMIT}&text=${encodeURIComponent(currentWord)}`;
				return this.xhr({
					url: queryUrl,
					headers: { agent: 'Visual Studio Code' }
				}).then((success) => {
					if (success.status === 200) {
						try {
							const obj = JSON.parse(success.responseText);
							if (obj && obj.objects && Array.isArray(obj.objects)) {
								const results = <{ package: SearchPackageInfo }[]>obj.objects;
								for (const result of results) {
									this.processPackage(result.package, addValue, isLast, collector);
								}

							}
						} catch (e) {
							// ignore
						}
						collector.setAsIncomplete();
					} else {
						collector.error(l10n.t("Request to the NPM repository failed: {0}", success.responseText));
						return 0;
					}
					return undefined;
				}, (error) => {
					collector.error(l10n.t("Request to the NPM repository failed: {0}", error.responseText));
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
		const segments = currentWord.split('/');
		if (segments.length === 2 && segments[0].length > 1) {
			const scope = segments[0].substr(1);
			let name = segments[1];
			if (name.length < 4) {
				name = '';
			}
			const queryUrl = `https://registry.npmjs.com/-/v1/search?text=scope:${scope}%20${name}&size=250`;
			return this.xhr({
				url: queryUrl,
				headers: { agent: 'Visual Studio Code' }
			}).then((success) => {
				if (success.status === 200) {
					try {
						const obj = JSON.parse(success.responseText);
						if (obj && Array.isArray(obj.objects)) {
							const objects = <{ package: SearchPackageInfo }[]>obj.objects;
							for (const object of objects) {
								this.processPackage(object.package, addValue, isLast, collector);
							}
						}
					} catch (e) {
						// ignore
					}
					collector.setAsIncomplete();
				} else {
					collector.error(l10n.t("Request to the NPM repository failed: {0}", success.responseText));
				}
				return null;
			});
		}
		return Promise.resolve(null);
	}

	public async collectValueSuggestions(resource: Uri, location: Location, result: ISuggestionsCollector): Promise<any> {
		if (!this.packageInfoProvider.isEnabled()) {
			return null;
		}

		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const currentKey = location.path[location.path.length - 1];
			if (typeof currentKey === 'string') {
				const info = await this.packageInfoProvider.fetchPackageInfo(currentKey, resource);
				if (info && info.version) {

					let name = JSON.stringify(info.version);
					let proposal = new CompletionItem(name);
					proposal.kind = CompletionItemKind.Property;
					proposal.insertText = name;
					proposal.documentation = l10n.t("The currently latest version of the package");
					result.add(proposal);

					name = JSON.stringify('^' + info.version);
					proposal = new CompletionItem(name);
					proposal.kind = CompletionItemKind.Property;
					proposal.insertText = name;
					proposal.documentation = l10n.t("Matches the most recent major version (1.x.x)");
					result.add(proposal);

					name = JSON.stringify('~' + info.version);
					proposal = new CompletionItem(name);
					proposal.kind = CompletionItemKind.Property;
					proposal.insertText = name;
					proposal.documentation = l10n.t("Matches the most recent minor version (1.2.x)");
					result.add(proposal);
				}
			}
		}
		return null;
	}

	public resolveSuggestion(resource: Uri | undefined, item: CompletionItem): Thenable<CompletionItem | null> | null {
		if (item.kind === CompletionItemKind.Property && !item.documentation) {

			let name = item.label;
			if (typeof name !== 'string') {
				name = name.label;
			}

			return this.packageInfoProvider.fetchPackageInfo(name, resource).then(info => {
				if (info) {
					item.documentation = this.packageInfoProvider.getDocumentation(info.description, info.version, info.time, info.homepage);
					return item;
				}
				return null;
			});
		}
		return null;
	}

	public getInfoContribution(resource: Uri, location: Location): Thenable<MarkdownString[] | null> | null {
		if (!this.packageInfoProvider.isEnabled()) {
			return null;
		}
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const pack = location.path[location.path.length - 1];
			if (typeof pack === 'string') {
				return this.packageInfoProvider.fetchPackageInfo(pack, resource).then(info => {
					if (info) {
						return [this.packageInfoProvider.getDocumentation(info.description, info.version, info.time, info.homepage)];
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
			proposal.documentation = this.packageInfoProvider.getDocumentation(pack.description, pack.version, undefined, pack?.links?.homepage);
			collector.add(proposal);
		}
	}
}

interface SearchPackageInfo {
	name: string;
	description?: string;
	version?: string;
	links?: { homepage?: string };
}
