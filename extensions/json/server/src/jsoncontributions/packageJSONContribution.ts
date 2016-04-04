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

let LIMIT = 40;

export class PackageJSONContribution implements IJSONWorkerContribution {

	private mostDependedOn = [ 'lodash', 'async', 'underscore', 'request', 'commander', 'express', 'debug', 'chalk', 'colors', 'q', 'coffee-script',
		'mkdirp', 'optimist', 'through2', 'yeoman-generator', 'moment', 'bluebird', 'glob', 'gulp-util', 'minimist', 'cheerio', 'jade', 'redis', 'node-uuid',
		'socket', 'io', 'uglify-js', 'winston', 'through', 'fs-extra', 'handlebars', 'body-parser', 'rimraf', 'mime', 'semver', 'mongodb', 'jquery',
		'grunt', 'connect', 'yosay', 'underscore', 'string', 'xml2js', 'ejs', 'mongoose', 'marked', 'extend', 'mocha', 'superagent', 'js-yaml', 'xtend',
		'shelljs', 'gulp', 'yargs', 'browserify', 'minimatch', 'react', 'less', 'prompt', 'inquirer', 'ws', 'event-stream', 'inherits', 'mysql', 'esprima',
		'jsdom', 'stylus', 'when', 'readable-stream', 'aws-sdk', 'concat-stream', 'chai', 'Thenable', 'wrench'];

	private requestService : IRequestService;

	private isPackageJSONFile(resource: string): boolean {
		return Strings.endsWith(resource, '/package.json');
	}

	public constructor(requestService: IRequestService) {
		this.requestService = requestService;
	}

	public collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isPackageJSONFile(resource)) {
			let defaultValue = {
				'name': '{{name}}',
				'description': '{{description}}',
				'author': '{{author}}',
				'version': '{{1.0.0}}',
				'main': '{{pathToMain}}',
				'dependencies': {}
			};
			result.add({ kind: CompletionItemKind.Module, label: localize('json.package.default', 'Default package.json'), insertText: JSON.stringify(defaultValue, null, '\t'), documentation: '' });
		}
		return null;
	}

	public collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : Thenable<any> {
		if (this.isPackageJSONFile(resource) && (location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl : string;
			if (currentWord.length > 0) {
				queryUrl = 'https://skimdb.npmjs.com/registry/_design/app/_view/browseAll?group_level=1&limit=' + LIMIT + '&start_key=%5B%22' + encodeURIComponent(currentWord) + '%22%5D&end_key=%5B%22'+ encodeURIComponent(currentWord + 'z') + '%22,%7B%7D%5D';

				return this.requestService({
					url : queryUrl
				}).then((success) => {
					if (success.status === 200) {
						try {
							let obj = JSON.parse(success.responseText);
							if (obj && Array.isArray(obj.rows)) {
								let results = <{ key: string[]; }[]> obj.rows;
								for (let i = 0; i < results.length; i++) {
									let keys = results[i].key;
									if (Array.isArray(keys) && keys.length > 0) {
										let name = keys[0];
										let insertText = JSON.stringify(name);
										if (addValue) {
											insertText += ': "{{*}}"';
											if (!isLast) {
												insertText += ',';
											}
										}
										result.add({ kind: CompletionItemKind.Property, label: name, insertText: insertText, documentation: '' });
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
						result.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', success.responseText));
						return 0;
					}
				}, (error) => {
					result.error(localize('json.npm.error.repoaccess', 'Request to the NPM repository failed: {0}', error.responseText));
					return 0;
				});
			} else {
				this.mostDependedOn.forEach((name) => {
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
		if (this.isPackageJSONFile(resource) && (location.matches(['dependencies']) || location.matches(['devDependencies']) || location.matches(['optionalDependencies']) || location.matches(['peerDependencies']))) {
			let queryUrl = 'http://registry.npmjs.org/' + encodeURIComponent(currentKey) + '/latest';

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				try {
					let obj = JSON.parse(success.responseText);
					if (obj && obj.version) {
						let version = obj.version;
						let name = JSON.stringify(version);
						result.add({ kind: CompletionItemKind.Class, label: name, insertText: name, documentation: localize('json.npm.latestversion', 'The currently latest version of the package') });
						name = JSON.stringify('^' + version);
						result.add({ kind: CompletionItemKind.Class, label: name, insertText: name, documentation: localize('json.npm.majorversion', 'Matches the most recent major version (1.x.x)') });
						name = JSON.stringify('~' + version);
						result.add({ kind: CompletionItemKind.Class, label: name, insertText: name, documentation: localize('json.npm.minorversion', 'Matches the most recent minor version (1.2.x)') });
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
		if (this.isPackageJSONFile(resource) && (location.matches(['dependencies', '*']) || location.matches(['devDependencies', '*']) || location.matches(['optionalDependencies', '*']) || location.matches(['peerDependencies', '*']))) {
			let pack = location.getSegments()[location.getSegments().length - 1];

			let htmlContent : MarkedString[] = [];
			htmlContent.push(localize('json.npm.package.hover', '{0}', pack));

			let queryUrl = 'http://registry.npmjs.org/' + encodeURIComponent(pack) + '/latest';

			return this.requestService({
				url : queryUrl
			}).then((success) => {
				try {
					let obj = JSON.parse(success.responseText);
					if (obj) {
						if (obj.description) {
							htmlContent.push(obj.description);
						}
						if (obj.version) {
							htmlContent.push(localize('json.npm.version.hover', 'Latest version: {0}', obj.version));
						}
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