/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import { through } from 'event-stream';
import { ThroughStream } from 'through';
import File = require('vinyl');
import * as Is from 'is';

const quiet = !!process.env['VSCODE_BUILD_QUIET'] && false;

var util = require('gulp-util');
function log(message: any, ...rest: any[]): void {
	if (quiet) {
		return;
	}
	util.log(util.colors.cyan('[i18n]'), message, ...rest);
}

interface Map<V> {
	[key: string]: V;
}

interface LocalizeInfo {
	key: string;
	comment: string[];
}

module LocalizeInfo {
	export function is(value: any): value is LocalizeInfo {
		let candidate = value as LocalizeInfo;
		return Is.defined(candidate) && Is.string(candidate.key) && (Is.undef(candidate.comment) || (Is.array(candidate.comment) && candidate.comment.every(element => Is.string(element))));
	}
}

interface BundledFormat {
	keys: Map<(string | LocalizeInfo)[]>;
	messages: Map<string[]>;
	bundles: Map<string[]>;
}

module BundledFormat {
	export function is(value: any): value is BundledFormat {
		if (Is.undef(value)) {
			return false;
		}

		let candidate = value as BundledFormat;
		let length = Object.keys(value).length;

		return length === 3 && Is.defined(candidate.keys) && Is.defined(candidate.messages) && Is.defined(candidate.bundles);
	}
}

const vscodeLanguages: string[] = [
	'chs',
	'cht',
	'jpn',
	'kor',
	'deu',
	'fra',
	'esn',
	'rus',
	'ita'
];

const iso639_3_to_2: Map<string> = {
	'chs': 'zh-cn',
	'cht': 'zh-tw',
	'csy': 'cs-cz',
	'deu': 'de',
	'enu': 'en',
	'esn': 'es',
	'fra': 'fr',
	'hun': 'hu',
	'ita': 'it',
	'jpn': 'ja',
	'kor': 'ko',
	'nld': 'nl',
	'plk': 'pl',
	'ptb': 'pt-br',
	'ptg': 'pt',
	'rus': 'ru',
	'sve': 'sv-se',
	'trk': 'tr'
};

interface IDirectoryInfo {
	name: string;
	iso639_2: string;
}

function sortLanguages(directoryNames: string[]): IDirectoryInfo[] {
	return directoryNames.map((dirName) => {
		var lower = dirName.toLowerCase();
		return {
			name: lower,
			iso639_2: iso639_3_to_2[lower]
		};
	}).sort((a: IDirectoryInfo, b: IDirectoryInfo): number => {
		if (!a.iso639_2 && !b.iso639_2) {
			return 0;
		}
		if (!a.iso639_2) {
			return -1;
		}
		if (!b.iso639_2) {
			return 1;
		}
		return a.iso639_2 < b.iso639_2 ? -1 : (a.iso639_2 > b.iso639_2 ? 1 : 0);
	});
}

const headerComment: string =
	[
		'/*---------------------------------------------------------------------------------------------',
		' * Copyright (c) Microsoft Corporation. All rights reserved.',
		' * Licensed under the MIT License. See License.txt in the project root for license information.',
		' *---------------------------------------------------------------------------------------------*/'
	].join('\n');


function stripComments(content: string): string {
	/**
	* First capturing group matches double quoted string
	* Second matches single quotes string
	* Third matches block comments
	* Fourth matches line comments
	*/
	var regexp: RegExp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
	let result = content.replace(regexp, (match, m1, m2, m3, m4) => {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			let length = m4.length;
			if (length > 2 && m4[length - 1] === '\n') {
				return m4[length - 2] === '\r' ? '\r\n': '\n';
			} else {
				return '';
			}
		} else {
			// We match a string
			return match;
		}
	});
	return result;
};

function escapeCharacters(value:string):string {
	var result:string[] = [];
	for (var i = 0; i < value.length; i++) {
		var ch = value.charAt(i);
		switch(ch) {
			case '\'':
				result.push('\\\'');
				break;
			case '"':
				result.push('\\"');
				break;
			case '\\':
				result.push('\\\\');
				break;
			case '\n':
				result.push('\\n');
				break;
			case '\r':
				result.push('\\r');
				break;
			case '\t':
				result.push('\\t');
				break;
			case '\b':
				result.push('\\b');
				break;
			case '\f':
				result.push('\\f');
				break;
			default:
				result.push(ch);
		}
	}
	return result.join('');
}

function processCoreBundleFormat(json: BundledFormat, emitter: any) {
	let keysSection = json.keys;
	let messageSection = json.messages;
	let bundleSection = json.bundles;

	let statistics: Map<number> = Object.create(null);

	let total: number = 0;
	let defaultMessages: Map<Map<string>> = Object.create(null);
	let modules = Object.keys(keysSection);
	modules.forEach((module) => {
		let keys = keysSection[module];
		let messages = messageSection[module];
		if (!messages || keys.length !== messages.length) {
			emitter.emit('error', `Message for module ${module} corrupted. Mismatch in number of keys and messages.`);
			return;
		}
		let messageMap: Map<string> = Object.create(null);
		defaultMessages[module] = messageMap;
		keys.map((key, i) => {
			total++;
			if (Is.string(key)) {
				messageMap[key] = messages[i];
			} else {
				messageMap[key.key] = messages[i];
			}
		});
	});

	let languageDirectory = path.join(__dirname, '..', '..', 'i18n');
	let languages = sortLanguages(fs.readdirSync(languageDirectory).filter((item) => fs.statSync(path.join(languageDirectory, item)).isDirectory()));
	languages.forEach((language) => {
		if (!language.iso639_2) {
			return;
		}

		log(`Generating nls bundles for: ${language.iso639_2}`);
		statistics[language.iso639_2] = 0;
		let localizedModules: Map<string[]> = Object.create(null);
		let cwd = path.join(languageDirectory, language.name, 'src');
		modules.forEach((module) => {
			let order = keysSection[module];
			let i18nFile = path.join(cwd, module) + '.i18n.json';
			let messages: Map<string> = null;
			if (fs.existsSync(i18nFile)) {
				let content = stripComments(fs.readFileSync(i18nFile, 'utf8'));
				messages = JSON.parse(content);
			} else {
				// log(`No localized messages found for module ${module}. Using default messages.`);
				messages = defaultMessages[module];
				statistics[language.iso639_2] = statistics[language.iso639_2] + Object.keys(messages).length;
			}
			let localizedMessages: string[] = [];
			order.forEach((keyInfo) => {
				let key: string = null;
				if (Is.string(keyInfo)) {
					key = keyInfo;
				} else {
					key = keyInfo.key;
				}
				let message: string = messages[key];
				if (!message) {
					log(`No localized message found for key ${key} in module ${module}. Using default message.`);
					message = defaultMessages[module][key];
					statistics[language.iso639_2] = statistics[language.iso639_2] + 1;
				}
				localizedMessages.push(message);
			});
			localizedModules[module] = localizedMessages;
		});
		Object.keys(bundleSection).forEach((bundle) => {
			let modules = bundleSection[bundle];
			let contents: string[] = [
				headerComment,
				`define("${bundle}.nls.${language.iso639_2}", {`
			];
			modules.forEach((module, index) => {
				contents.push(`\t"${module}": [`);
				let messages = localizedModules[module];
				if (!messages) {
					emitter.emit('error', `Didn't find messages for module ${module}.`);
					return;
				}
				messages.forEach((message, index) => {
					contents.push(`\t\t"${escapeCharacters(message)}${index < messages.length ? '",': '"'}`);
				});
				contents.push(index < modules.length - 1 ? '\t],' : '\t]');
			});
			contents.push('});');
			emitter.emit('data', new File( { path: bundle + '.nls.' + language.iso639_2 + '.js', contents: new Buffer(contents.join('\n'), 'utf-8') }));
		});
	});
	log(`Statistics (total ${total}):`);
	Object.keys(statistics).forEach(key => {
		let value = statistics[key];
		log(`\t${value} untranslated strings for locale ${key} found.`);
	});
	vscodeLanguages.forEach(language => {
		let iso639_2 = iso639_3_to_2[language];
		if (!iso639_2) {
			log(`\tCouldn't find iso639 2 mapping for language ${language}. Using default language instead.`);
		} else {
			let stats = statistics[iso639_2];
			if (Is.undef(stats)) {
				log(`\tNo translations found for language ${language}. Using default language instead.`)
			}
		}
	});
}

export function processNlsFiles(): ThroughStream {
	return through(function(file: File) {
		let fileName = path.basename(file.path);
		if (fileName === 'nls.metadata.json') {
			let json = null;
			if (file.isBuffer()) {
				json = JSON.parse(file.contents.toString('utf8'));
			} else {
				this.emit('error', `Failed to read component file: ${file.relative}`)
			}
			if (BundledFormat.is(json)) {
				processCoreBundleFormat(json, this);
			}
		}
		this.emit('data', file);
	});
}