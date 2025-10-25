/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItemKind, CompletionItem, DocumentSelector, SnippetString, workspace, MarkdownString, Uri, l10n } from 'vscode';
import { IJSONContribution, ISuggestionsCollector } from './jsonContributions';
import { XHRRequest } from 'request-light';
import { Location } from 'jsonc-parser';

import * as cp from 'child_process';
import { dirname } from 'path';
import { fromNow } from './date';

const LIMIT = 40;

const USER_AGENT = 'Visual Studio Code';

export class PackageJSONContribution implements IJSONContribution {

	private mostDependedOn = ['lodash', 'async', 'underscore', 'request', 'commander', 'express', 'debug', 'chalk', 'colors', 'q', 'coffee-script',
		'mkdirp', 'optimist', 'through2', 'yeoman-generator', 'moment', 'bluebird', 'glob', 'gulp-util', 'minimist', 'cheerio', 'pug', 'redis', 'node-uuid',
		'socket', 'io', 'uglify-js', 'winston', 'through', 'fs-extra', 'handlebars', 'body-parser', 'rimraf', 'mime', 'semver', 'mongodb', 'jquery',
		'grunt', 'connect', 'yosay', 'underscore', 'string', 'xml2js', 'ejs', 'mongoose', 'marked', 'extend', 'mocha', 'superagent', 'js-yaml', 'xtend',
		'shelljs', 'gulp', 'yargs', 'browserify', 'minimatch', 'react', 'less', 'prompt', 'inquirer', 'ws', 'event-stream', 'inherits', 'mysql', 'esprima',
		'jsdom', 'stylus', 'when', 'readable-stream', 'aws-sdk', 'concat-stream', 'chai', 'Thenable', 'wrench'];

	private knownScopes = ['@types', '@angular', '@babel', '@nuxtjs', '@vue', '@bazel'];

	public getDocumentSelector(): DocumentSelector {
		return [{ language: 'json', scheme: '*', pattern: '**/package.json' }];
	}

	public constructor(private xhr: XHRRequest, private npmCommandPath: string | undefined) {
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

	private isEnabled() {
		return this.npmCommandPath || this.onlineEnabled();
	}

	private onlineEnabled() {
		return !!workspace.getConfiguration('npm').get('fetchOnlinePackageInfo');
	}

	public collectPropertySuggestions(
		_resource: Uri,
		location: Location,
		currentWord: string,
		addValue: boolean,
		isLast: boolean,
		collector: ISuggestionsCollector
	): Thenable<any> | null {
		if (!this.isEnabled()) {
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
					headers: { agent: USER_AGENT }
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
				headers: { agent: USER_AGENT }
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
		if (!this.isEnabled()) {
			return null;
		}

		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const currentKey = location.path[location.path.length - 1];
			if (typeof currentKey === 'string') {
				const info = await this.fetchPackageInfo(currentKey, resource);
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

	private getDocumentation(description: string | undefined, version: string | undefined, time: string | undefined, homepage: string | undefined): MarkdownString {
		const str = new MarkdownString();
		if (description) {
			str.appendText(description);
		}
		if (version) {
			str.appendText('\n\n');
			str.appendText(time ? l10n.t("Latest version: {0} published {1}", version, fromNow(Date.parse(time), true, true)) : l10n.t("Latest version: {0}", version));
		}
		if (homepage) {
			str.appendText('\n\n');
			str.appendText(homepage);
		}
		return str;
	}

	public resolveSuggestion(resource: Uri | undefined, item: CompletionItem): Thenable<CompletionItem | null> | null {
		if (item.kind === CompletionItemKind.Property && !item.documentation) {

			let name = item.label;
			if (typeof name !== 'string') {
				name = name.label;
			}

			return this.fetchPackageInfo(name, resource).then(info => {
				if (info) {
					item.documentation = this.getDocumentation(info.description, info.version, info.time, info.homepage);
					return item;
				}
				return null;
			});
		}
		return null;
	}

	private isValidNPMName(name: string): boolean {
		// following rules from https://github.com/npm/validate-npm-package-name,
		// leading slash added as additional security measure
		if (!name || name.length > 214 || name.match(/^[-_.\s]/)) {
			return false;
		}
		const match = name.match(/^(?:@([^/~\s)('!*]+?)[/])?([^/~)('!*\s]+?)$/);
		if (match) {
			const scope = match[1];
			if (scope && encodeURIComponent(scope) !== scope) {
				return false;
			}
			const name = match[2];
			return encodeURIComponent(name) === name;
		}
		return false;
	}

	private async fetchPackageInfo(pack: string, resource: Uri | undefined): Promise<ViewPackageInfo | undefined> {
		if (!this.isValidNPMName(pack)) {
			return undefined; // avoid unnecessary lookups
		}
		let info: ViewPackageInfo | undefined;
		if (this.npmCommandPath) {
			info = await this.npmView(this.npmCommandPath, pack, resource);
		}
		if (!info && this.onlineEnabled()) {
			info = await this.npmjsView(pack);
		}
		return info;
	}

	private npmView(npmCommandPath: string, pack: string, resource: Uri | undefined): Promise<ViewPackageInfo | undefined> {
		return new Promise((resolve, _reject) => {
			const args = ['view', '--json', '--', pack, 'description', 'dist-tags.latest', 'homepage', 'version', 'time'];
			const cwd = resource && resource.scheme === 'file' ? dirname(resource.fsPath) : undefined;

			// corepack npm wrapper would automatically update package.json. disable that behavior.
			// COREPACK_ENABLE_AUTO_PIN disables the package.json overwrite, and
			// COREPACK_ENABLE_PROJECT_SPEC makes the npm view command succeed
			//   even if packageManager specified a package manager other than npm.
			const env = { ...process.env, COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENABLE_PROJECT_SPEC: '0' };
			let options: cp.ExecFileOptions = { cwd, env };
			let commandPath: string = npmCommandPath;
			if (process.platform === 'win32') {
				options = { cwd, env, shell: true };
				commandPath = `"${npmCommandPath}"`;
			}
			cp.execFile(commandPath, args, options, (error, stdout) => {
				if (!error) {
					try {
						const content = JSON.parse(stdout);
						const version = content['dist-tags.latest'] || content['version'];
						resolve({
							description: content['description'],
							version,
							time: content.time?.[version],
							homepage: content['homepage']
						});
						return;
					} catch (e) {
						// ignore
					}
				}
				resolve(undefined);
			});
		});
	}

	private async npmjsView(pack: string): Promise<ViewPackageInfo | undefined> {
		const queryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(pack);
		try {
			const success = await this.xhr({
				url: queryUrl,
				headers: { agent: USER_AGENT }
			});
			const obj = JSON.parse(success.responseText);
			const version = obj['dist-tags']?.latest || Object.keys(obj.versions).pop() || '';
			return {
				description: obj.description || '',
				version,
				time: obj.time?.[version],
				homepage: obj.homepage || ''
			};
		}
		catch (e) {
			//ignore
		}
		return undefined;
	}

	public getInfoContribution(resource: Uri, location: Location): Thenable<MarkdownString[] | null> | null {
		if (!this.isEnabled()) {
			return null;
		}
		if ((location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			const pack = location.path[location.path.length - 1];
			if (typeof pack === 'string') {
				return this.fetchPackageInfo(pack, resource).then(info => {
					if (info) {
						return [this.getDocumentation(info.description, info.version, info.time, info.homepage)];
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
			proposal.documentation = this.getDocumentation(pack.description, pack.version, undefined, pack?.links?.homepage);
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

interface ViewPackageInfo {
	description: string;
	version?: string;
	time?: string;
	homepage?: string;
}
