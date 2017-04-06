/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import { through, readable } from 'event-stream';
import { ThroughStream } from 'through';
import File = require('vinyl');
import * as Is from 'is';
import * as xml2js from 'xml2js';
import * as glob from 'glob';
import * as http from 'http';

var util = require('gulp-util');
var iconv  = require('iconv-lite');

function log(message: any, ...rest: any[]): void {
	util.log(util.colors.green('[i18n]'), message, ...rest);
}

interface Map<V> {
	[key: string]: V;
}

interface Item {
	id: string;
	message: string;
	comment: string;
}

export interface Resource {
	name: string;
	project: string;
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

interface ValueFormat {
	message: string;
	comment: string[];
}

interface PackageJsonFormat {
	[key: string]: string | ValueFormat;
}

module PackageJsonFormat {
	export function is(value: any): value is PackageJsonFormat {
		if (Is.undef(value) || !Is.object(value)) {
			return false;
		}
		return Object.keys(value).every(key => {
			let element = value[key];
			return Is.string(element) || (Is.object(element) && Is.defined(element.message) && Is.defined(element.comment));
		});
	}
}

interface ModuleJsonFormat {
	messages: string[];
	keys: (string | LocalizeInfo)[];
}

module ModuleJsonFormat {
	export function is(value: any): value is ModuleJsonFormat {
		let candidate = value as ModuleJsonFormat;
		return Is.defined(candidate)
			&& Is.array(candidate.messages) && candidate.messages.every(message => Is.string(message))
			&& Is.array(candidate.keys) && candidate.keys.every(key => Is.string(key) || LocalizeInfo.is(key));
	}
}

export class Line {
	private buffer: string[] = [];

	constructor(private indent: number = 0) {
		if (indent > 0) {
			this.buffer.push(new Array(indent + 1).join(' '));
		}
	}

	public append(value: string): Line {
		this.buffer.push(value);
		return this;
	}

	public toString(): string {
		return this.buffer.join('');
	}
}

class TextModel {
	private _lines: string[];

	constructor(contents: string) {
		this._lines = contents.split(/\r\n|\r|\n/);
	}

	public get lines(): string[] {
		return this._lines;
	}
}

export class XLF {
    private buffer: string[];
	private files: Map<Item[]>;

    constructor(public project: string) {
        this.buffer = [];
		this.files = Object.create(null);
	}

    public toString(): string {
        this.appendHeader();

		for (let file in this.files) {
			this.appendNewLine(`<file original="${file}" source-language="en" datatype="plaintext"><body>`, 2);
			for (let item of this.files[file]) {
				this.addStringItem(item);
			}
       		this.appendNewLine('</body></file>', 2);
		}

		this.appendFooter();
		return this.buffer.join('\r\n');
	}

	public addFile(original: string, keys: any[], messages: string[]) {
		this.files[original] = [];
		let existingKeys = [];

		for (let key of keys) {
			// Ignore duplicate keys because Transifex does not populate those with translated values.
			if (existingKeys.indexOf(key) !== -1) {
				continue;
			}
			existingKeys.push(key);

			let message: string = encodeEntities(messages[keys.indexOf(key)]);
			let comment: string = undefined;

			// Check if the message contains description (if so, it becomes an object type in JSON)
			if (Is.string(key)) {
				this.files[original].push({ id: key, message: message, comment: comment });
			} else {
				if (key['comment'] && key['comment'].length > 0) {
					comment = key['comment'].map(comment => encodeEntities(comment)).join('\r\n');
				}

				this.files[original].push({ id: key['key'], message: message, comment: comment });
			}
		}
	}

    private addStringItem(item: Item): void {
        if (!item.id || !item.message) {
            throw new Error('No item ID or value specified.');
        }

        this.appendNewLine(`<trans-unit id="${item.id}">`, 4);
        this.appendNewLine(`<source xml:lang="en">${item.message}</source>`, 6);

        if (item.comment) {
            this.appendNewLine(`<note>${item.comment}</note>`, 6);
        }

        this.appendNewLine('</trans-unit>', 4);
	}

    private appendHeader(): void {
        this.appendNewLine('<?xml version="1.0" encoding="utf-8"?>', 0);
        this.appendNewLine('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">', 0);
	}

    private appendFooter(): void {
        this.appendNewLine('</xliff>', 0);
    }

    private appendNewLine(content: string, indent?: number): void {
        let line = new Line(indent);
        line.append(content);
        this.buffer.push(line.toString());
    }

	static parse = function(xlfString: string) : Promise<{ messages: Map<string>,  originalFilePath: string, language: string }[]> {
		return new Promise((resolve, reject) => {
			let parser = new xml2js.Parser();

			let files: { messages: Map<string>, originalFilePath: string, language: string }[] = [];

			parser.parseString(xlfString, function(err, result) {
				if (err) {
					reject(`Failed to parse XLIFF string. ${err}`);
				}

				const fileNodes: any[] = result['xliff']['file'];
				if (!fileNodes) {
					reject('XLIFF file does not contain "xliff" or "file" node(s) required for parsing.');
				}

				fileNodes.forEach((file) => {
					const originalFilePath = file.$.original;
					if (!originalFilePath) {
						reject('XLIFF file node does not contain original attribute to determine the original location of the resource file.');
					}
					const language = file.$['target-language'].toLowerCase();
					if (!language) {
						reject('XLIFF file node does not contain target-language attribute to determine translated language.');
					}

					let messages: Map<string> = {};
					const transUnits = file.body[0]['trans-unit'];

					transUnits.forEach(unit => {
						const key = unit.$.id;
						if (!unit.target) {
							return; // No translation available
						}

						const val = unit.target.toString();
						if (key && val) {
							messages[key] = decodeEntities(val);
						} else {
							reject('XLIFF file does not contain full localization data. ID or target translation for one of the trans-unit nodes is not present.');
						}
					});

					files.push({ messages: messages, originalFilePath: originalFilePath, language: language });
				});

				resolve(files);
			});
		});
	};
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

/**
 * Used to map Transifex to VS Code language code representation.
 */
const iso639_2_to_3: Map<string> = {
	'zh-hans': 'chs',
	'zh-hant': 'cht',
	'cs-cz': 'csy',
	'de': 'deu',
	'en': 'enu',
	'es': 'esn',
	'fr': 'fra',
	'hu': 'hun',
	'it': 'ita',
	'ja': 'jpn',
	'ko': 'kor',
	'nl': 'nld',
	'pl': 'plk',
	'pt-br': 'ptb',
	'pt': 'ptg',
	'ru': 'rus',
	'sv-se': 'sve',
	'tr': 'trk'
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
}

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

function processCoreBundleFormat(fileHeader:string, json: BundledFormat, emitter: any) {
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

		if (process.env['VSCODE_BUILD_VERBOSE']) {
			log(`Generating nls bundles for: ${language.iso639_2}`);
		}

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
				if (process.env['VSCODE_BUILD_VERBOSE']) {
					log(`No localized messages found for module ${module}. Using default messages.`);
				}
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
					if (process.env['VSCODE_BUILD_VERBOSE']) {
						log(`No localized message found for key ${key} in module ${module}. Using default message.`);
					}
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
				fileHeader,
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
	Object.keys(statistics).forEach(key => {
		let value = statistics[key];
		log(`${key} has ${value} untranslated strings.`);
	});
	vscodeLanguages.forEach(language => {
		let iso639_2 = iso639_3_to_2[language];
		if (!iso639_2) {
			log(`\tCouldn't find iso639 2 mapping for language ${language}. Using default language instead.`);
		} else {
			let stats = statistics[iso639_2];
			if (Is.undef(stats)) {
				log(`\tNo translations found for language ${language}. Using default language instead.`);
			}
		}
	});
}

export function processNlsFiles(opts:{fileHeader:string;}): ThroughStream {
	return through(function(file: File) {
		let fileName = path.basename(file.path);
		if (fileName === 'nls.metadata.json') {
			let json = null;
			if (file.isBuffer()) {
				json = JSON.parse((<Buffer>file.contents).toString('utf8'));
			} else {
				this.emit('error', `Failed to read component file: ${file.relative}`);
			}
			if (BundledFormat.is(json)) {
				processCoreBundleFormat(opts.fileHeader, json, this);
			}
		}
		this.emit('data', file);
	});
}

export function prepareXlfFiles(projectName?: string, extensionName?: string): ThroughStream {
	return through(
		function (file: File) {
			if (!file.isBuffer()) {
				throw new Error(`Failed to read component file: ${file.relative}`);
			}

			const extension = path.extname(file.path);
			if (extension === '.json') {
				const json = JSON.parse((<Buffer>file.contents).toString('utf8'));

				if (BundledFormat.is(json)) {
					importBundleJson(file, json, this);
				} else if (PackageJsonFormat.is(json) || ModuleJsonFormat.is(json)) {
					importModuleOrPackageJson(file, json, projectName, this, extensionName);
				} else {
					throw new Error(`JSON format cannot be deduced for ${file.relative}.`);
				}
			} else if (extension === '.isl') {
				importIsl(file, this);
			}
		}
	);
}

const editorProject: string = 'vscode-editor',
	workbenchProject: string = 'vscode-workbench',
	extensionsProject: string = 'vscode-extensions',
	setupProject: string = 'vscode-setup';

/**
 * Ensure to update those arrays when new resources are pushed to Transifex.
 * Used because Transifex does not have API method to pull all project resources.
 */
const editorResources: Resource[] = [
	{ name: 'vs/platform', project: editorProject },
	{ name: 'vs/editor/contrib', project: editorProject },
	{ name: 'vs/editor', project: editorProject },
	{ name: 'vs/base', project: editorProject },
	{ name: 'vs/code', project: workbenchProject }
];
const workbenchResources: Resource[] = [
	{ name: 'vs/workbench', project: workbenchProject },
	{ name: 'vs/workbench/parts/cli', project: workbenchProject },
	{ name: 'vs/workbench/parts/codeEditor', project: workbenchProject },
	{ name: 'vs/workbench/parts/debug', project: workbenchProject },
	{ name: 'vs/workbench/parts/emmet', project: workbenchProject },
	{ name: 'vs/workbench/parts/execution', project: workbenchProject },
	{ name: 'vs/workbench/parts/explorers', project: workbenchProject },
	{ name: 'vs/workbench/parts/extensions', project: workbenchProject },
	{ name: 'vs/workbench/parts/feedback', project: workbenchProject },
	{ name: 'vs/workbench/parts/files', project: workbenchProject },
	{ name: 'vs/workbench/parts/git', project: workbenchProject },
	{ name: 'vs/workbench/parts/html', project: workbenchProject },
	{ name: 'vs/workbench/parts/markers', project: workbenchProject },
	{ name: 'vs/workbench/parts/nps', project: workbenchProject },
	{ name: 'vs/workbench/parts/output', project: workbenchProject },
	{ name: 'vs/workbench/parts/performance', project: workbenchProject },
	{ name: 'vs/workbench/parts/preferences', project: workbenchProject },
	{ name: 'vs/workbench/parts/quickopen', project: workbenchProject },
	{ name: 'vs/workbench/parts/scm', project: workbenchProject },
	{ name: 'vs/workbench/parts/search', project: workbenchProject },
	{ name: 'vs/workbench/parts/snippets', project: workbenchProject },
	{ name: 'vs/workbench/parts/tasks', project: workbenchProject },
	{ name: 'vs/workbench/parts/terminal', project: workbenchProject },
	{ name: 'vs/workbench/parts/themes', project: workbenchProject },
	{ name: 'vs/workbench/parts/trust', project: workbenchProject },
	{ name: 'vs/workbench/parts/update', project: workbenchProject },
	{ name: 'vs/workbench/parts/watermark', project: workbenchProject },
	{ name: 'vs/workbench/parts/welcome', project: workbenchProject },
	{ name: 'vs/workbench/services/configuration', project: workbenchProject },
	{ name: 'vs/workbench/services/editor', project: workbenchProject },
	{ name: 'vs/workbench/services/files', project: workbenchProject },
	{ name: 'vs/workbench/services/keybinding', project: workbenchProject },
	{ name: 'vs/workbench/services/message', project: workbenchProject },
	{ name: 'vs/workbench/services/mode', project: workbenchProject },
	{ name: 'vs/workbench/services/textfile', project: workbenchProject },
	{ name: 'vs/workbench/services/themes', project: workbenchProject },
	{ name: 'setup_messages', project: workbenchProject }
];

export function getResource(sourceFile: string): Resource {
	let resource: string;

	if (sourceFile.startsWith('vs/platform')) {
		return { name: 'vs/platform', project: editorProject };
	} else if (sourceFile.startsWith('vs/editor/contrib')) {
		return { name: 'vs/editor/contrib', project: editorProject };
	} else if (sourceFile.startsWith('vs/editor')) {
		return { name: 'vs/editor', project: editorProject };
	} else if (sourceFile.startsWith('vs/base')) {
		return { name: 'vs/base', project: editorProject };
 	} else if (sourceFile.startsWith('vs/code')) {
		return { name: 'vs/code', project: workbenchProject };
	} else if (sourceFile.startsWith('vs/workbench/parts')) {
		resource = sourceFile.split('/', 4).join('/');
		return { name: resource, project: workbenchProject };
	} else if (sourceFile.startsWith('vs/workbench/services')) {
		resource = sourceFile.split('/', 4).join('/');
		return { name: resource, project: workbenchProject };
	} else if (sourceFile.startsWith('vs/workbench')) {
		return { name: 'vs/workbench', project: workbenchProject };
	}

	throw new Error (`Could not identify the XLF bundle for ${sourceFile}`);
}


function importBundleJson(file: File, json: BundledFormat, stream: ThroughStream): void {
	let bundleXlfs: Map<XLF> = Object.create(null);

	for (let source in json.keys) {
		const projectResource = getResource(source);
		const resource = projectResource.name;
		const project = projectResource.project;

		const keys = json.keys[source];
		const messages = json.messages[source];
		if (keys.length !== messages.length) {
			throw new Error(`There is a mismatch between keys and messages in ${file.relative}`);
		}

		let xlf = bundleXlfs[resource] ? bundleXlfs[resource] : bundleXlfs[resource] = new XLF(project);
		xlf.addFile('src/' + source, keys, messages);
	}

	for (let resource in bundleXlfs) {
		const newFilePath = `${bundleXlfs[resource].project}/${resource.replace(/\//g, '_')}.xlf`;
		const xlfFile = new File({ path: newFilePath, contents: new Buffer(bundleXlfs[resource].toString(), 'utf-8')});
		stream.emit('data', xlfFile);
	}
}

// Keeps existing XLF instances and a state of how many files were already processed for faster file emission
var extensions: Map<{ xlf: XLF, processed: number }> = Object.create(null);
function importModuleOrPackageJson(file: File, json: ModuleJsonFormat | PackageJsonFormat, projectName: string, stream: ThroughStream, extensionName?: string): void {
	if (ModuleJsonFormat.is(json) && json['keys'].length !== json['messages'].length) {
		throw new Error(`There is a mismatch between keys and messages in ${file.relative}`);
	}

	// Prepare the source path for <original/> attribute in XLF & extract messages from JSON
	const formattedSourcePath = file.relative.replace(/\\/g, '/');
	const messages = Object.keys(json).map((key) => json[key].toString());

	// Stores the amount of localization files to be transformed to XLF before the emission
	let localizationFilesCount,
		originalFilePath;
	// If preparing XLF for external extension, then use different glob pattern and source path
	if (extensionName) {
		localizationFilesCount = glob.sync('**/*.nls.json').length;
		originalFilePath = `${formattedSourcePath.substr(0, formattedSourcePath.length - '.nls.json'.length)}`;
	} else {
		// Used for vscode/extensions folder
		extensionName = formattedSourcePath.split('/')[0];
		localizationFilesCount = glob.sync(`./extensions/${extensionName}/**/*.nls.json`).length;
		originalFilePath = `extensions/${formattedSourcePath.substr(0, formattedSourcePath.length - '.nls.json'.length)}`;
	}

	let extension = extensions[extensionName] ?
		extensions[extensionName] : extensions[extensionName] = { xlf: new XLF(projectName), processed: 0 };

	if (ModuleJsonFormat.is(json)) {
		extension.xlf.addFile(originalFilePath, json['keys'], json['messages']);
	} else {
		extension.xlf.addFile(originalFilePath, Object.keys(json), messages);
	}

	// Check if XLF is populated with file nodes to emit it
	if (++extensions[extensionName].processed === localizationFilesCount) {
		const newFilePath = path.join(projectName, extensionName + '.xlf');
		const xlfFile = new File({ path: newFilePath, contents: new Buffer(extension.xlf.toString(), 'utf-8')});
		stream.emit('data', xlfFile);
	}
}

function importIsl(file: File, stream: ThroughStream) {
	let projectName: string,
		resourceFile: string;
	if (path.basename(file.path) === 'Default.isl') {
		projectName = setupProject;
		resourceFile = 'setup_default.xlf';
	} else {
		projectName = workbenchProject;
		resourceFile = 'setup_messages.xlf';
	}

	let xlf = new XLF(projectName),
		keys: string[] = [],
		messages: string[] = [];

	let model = new TextModel(file.contents.toString());
	let inMessageSection = false;
	model.lines.forEach(line => {
		if (line.length === 0) {
			return;
		}
		let firstChar = line.charAt(0);
		switch (firstChar) {
			case ';':
				// Comment line;
				return;
			case '[':
				inMessageSection = '[Messages]' === line || '[CustomMessages]' === line;
				return;
		}
		if (!inMessageSection) {
			return;
		}
		let sections: string[] = line.split('=');
		if (sections.length !== 2) {
			throw new Error(`Badly formatted message found: ${line}`);
		} else {
			let key = sections[0];
			let value = sections[1];
			if (key.length > 0 && value.length > 0) {
				keys.push(key);
				messages.push(value);
			}
		}
	});

	const originalPath = file.path.substring(file.cwd.length+1, file.path.split('.')[0].length).replace(/\\/g, '/');
	xlf.addFile(originalPath, keys, messages);

	// Emit only upon all ISL files combined into single XLF instance
	const newFilePath = path.join(projectName, resourceFile);
	const xlfFile = new File({ path: newFilePath, contents: new Buffer(xlf.toString(), 'utf-8')});
	stream.emit('data', xlfFile);
}

export function pushXlfFiles(apiHostname: string, username: string, password: string): ThroughStream {
	let tryGetPromises = [];
	let updateCreatePromises = [];

	return through(function(file: File) {
		const project = path.dirname(file.relative);
		const fileName = path.basename(file.path);
		const slug = fileName.substr(0, fileName.length - '.xlf'.length);
		const credentials = `${username}:${password}`;

		// Check if resource already exists, if not, then create it.
		let promise = tryGetResource(project, slug, apiHostname, credentials);
		tryGetPromises.push(promise);
		promise.then(exists => {
			if (exists) {
				promise = updateResource(project, slug, file, apiHostname, credentials);
			} else {
				promise = createResource(project, slug, file, apiHostname, credentials);
			}
			updateCreatePromises.push(promise);
		});

	}, function() {
		// End the pipe only after all the communication with Transifex API happened
		Promise.all(tryGetPromises).then(() => {
			Promise.all(updateCreatePromises).then(() => {
				this.emit('end');
			}).catch((reason) => { throw new Error(reason); });
		}).catch((reason) => { throw new Error(reason); });
	});
}

function tryGetResource(project: string, slug: string, apiHostname: string, credentials: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: apiHostname,
			path: `/api/2/project/${project}/resource/${slug}/?details`,
			auth: credentials,
			method: 'GET'
		};

		const request = http.request(options, (response) => {
			if (response.statusCode === 404) {
				resolve(false);
			} else if (response.statusCode === 200) {
				resolve(true);
			} else {
				reject(`Failed to query resource ${project}/${slug}. Response: ${response.statusCode} ${response.statusMessage}`);
			}
		});
		request.on('error', (err) => {
			reject(`Failed to get ${project}/${slug} on Transifex: ${err}`);
		});

		request.end();
	});
}

function createResource(project: string, slug: string, xlfFile: File, apiHostname: string, credentials: any): Promise<any> {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify({
			'content': xlfFile.contents.toString(),
			'name': slug,
			'slug': slug,
			'i18n_type': 'XLIFF'
		});
		const options = {
			hostname: apiHostname,
			path: `/api/2/project/${project}/resources`,
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(data)
			},
			auth: credentials,
			method: 'POST'
		};

		let request = http.request(options, (res) => {
			if (res.statusCode === 201) {
				log(`Resource ${project}/${slug} successfully created on Transifex.`);
			} else {
				reject(`Something went wrong in the request creating ${slug} in ${project}. ${res.statusCode}`);
			}
		});
		request.on('error', (err) => {
			reject(`Failed to create ${project}/${slug} on Transifex: ${err}`);
		});

		request.write(data);
		request.end();
	});
}

/**
 * The following link provides information about how Transifex handles updates of a resource file:
 * https://dev.befoolish.co/tx-docs/public/projects/updating-content#what-happens-when-you-update-files
 */
function updateResource(project: string, slug: string, xlfFile: File, apiHostname: string, credentials: string) : Promise<any> {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify({ content: xlfFile.contents.toString() });
		const options = {
			hostname: apiHostname,
			path: `/api/2/project/${project}/resource/${slug}/content`,
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(data)
			},
			auth: credentials,
			method: 'PUT'
		};

		let request = http.request(options, (res) => {
			if (res.statusCode === 200) {
				res.setEncoding('utf8');

				let responseBuffer: string = '';
				res.on('data', function (chunk) {
					responseBuffer += chunk;
				});
				res.on('end', () => {
					const response = JSON.parse(responseBuffer);
					log(`Resource ${project}/${slug} successfully updated on Transifex. Strings added: ${response.strings_added}, updated: ${response.strings_added}, deleted: ${response.strings_added}`);
					resolve();
				});
			} else {
				reject(`Something went wrong in the request updating ${slug} in ${project}. ${res.statusCode}`);
			}
		});
		request.on('error', (err) => {
			reject(`Failed to update ${project}/${slug} on Transifex: ${err}`);
		});

		request.write(data);
		request.end();
	});
}

function obtainProjectResources(projectName: string): Resource[] {
	let resources: Resource[] = [];

	if (projectName === editorProject) {
		resources = editorResources;
	} else if (projectName === workbenchProject) {
		resources = workbenchResources;
	} else if (projectName === extensionsProject) {
		let extensionsToLocalize: string[] = glob.sync('./extensions/**/*.nls.json').map(extension => extension.split('/')[2]);
		let resourcesToPull: string[] = [];

		extensionsToLocalize.forEach(extension => {
			if (resourcesToPull.indexOf(extension) === -1) { // remove duplicate elements returned by glob
				resourcesToPull.push(extension);
				resources.push({ name: extension, project: projectName });
			}
		});
	} else if (projectName === setupProject) {
		resources.push({ name: 'setup_default', project: setupProject });
	}

	return resources;
}

export function pullXlfFiles(projectName: string, apiHostname: string, username: string, password: string, languages: string[], resources?: Resource[]): NodeJS.ReadableStream {
	if (!resources) {
		resources = obtainProjectResources(projectName);
	}
	if (!resources) {
		throw new Error('Transifex projects and resources must be defined to be able to pull translations from Transifex.');
	}

	const credentials = `${username}:${password}`;
	let expectedTranslationsCount = languages.length * resources.length;
	let translationsRetrieved = 0, called = false;

	return readable(function(count, callback) {
		// Mark end of stream when all resources were retrieved
		if (translationsRetrieved === expectedTranslationsCount) {
			return this.emit('end');
		}

		if (!called) {
			called = true;
			const stream = this;

			// Retrieve XLF files from main projects
			languages.map(function(language) {
				resources.map(function(resource) {
					retrieveResource(language, resource, apiHostname, credentials).then((file: File) => {
						stream.emit('data', file);
						translationsRetrieved++;
					}).catch(error => { throw new Error(error); });
				});
			});
		}

		callback();
	});
}

function retrieveResource(language: string, resource: Resource, apiHostname, credentials): Promise<File> {
	return new Promise<File>((resolve, reject) => {
		const slug = resource.name.replace(/\//g, '_');
		const project = resource.project;
		const iso639 = language.toLowerCase();
		const options = {
			hostname: apiHostname,
			path: `/api/2/project/${project}/resource/${slug}/translation/${iso639}?file&mode=onlyreviewed`,
			auth: credentials,
			method: 'GET'
		};

		let request = http.request(options, (res) => {
				let xlfBuffer: string = '';
				res.on('data', (data) => xlfBuffer += data);
				res.on('end', () => {
					if (res.statusCode === 200) {
						resolve(new File({ contents: new Buffer(xlfBuffer), path: `${project}/${iso639_2_to_3[language]}/${slug}.xlf` }));
					}
					reject(`${slug} in ${project} returned no data. Response code: ${res.statusCode}.`);
				});
		});
		request.on('error', (err) => {
			reject(`Failed to query resource ${slug} with the following error: ${err}`);
		});
		request.end();
	});
}

export function prepareJsonFiles(): ThroughStream {
	return through(function(xlf: File) {
		let stream = this;

		XLF.parse(xlf.contents.toString()).then(
			function(resolvedFiles) {
				resolvedFiles.forEach(file => {
					let messages = file.messages, translatedFile;

					// ISL file path always starts with 'build/'
					if (file.originalFilePath.startsWith('build/')) {
						const defaultLanguages = { 'zh-hans': true, 'zh-hant': true, 'ko': true };
						if (path.basename(file.originalFilePath) === 'Default' && !defaultLanguages[file.language]) {
							return;
						}

						translatedFile = createIslFile('..', file.originalFilePath, messages, iso639_2_to_3[file.language]);
					} else {
						translatedFile = createI18nFile(iso639_2_to_3[file.language], file.originalFilePath, messages);
					}

					stream.emit('data', translatedFile);
				});
			},
			function(rejectReason) {
				throw new Error(`XLF parsing error: ${rejectReason}`);
			}
		);
	});
}

export function createI18nFile(base: string, originalFilePath: string, messages: Map<string>): File {
	let content = [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) Microsoft Corporation. All rights reserved.',
		' *  Licensed under the MIT License. See License.txt in the project root for license information.',
		' *--------------------------------------------------------------------------------------------*/',
		'// Do not edit this file. It is machine generated.'
	].join('\n') + '\n' + JSON.stringify(messages, null, '\t').replace(/\r\n/g, '\n');

	return new File({
		path: path.join(base, originalFilePath + '.i18n.json'),
		contents: new Buffer(content, 'utf8')
	});
}


const languageNames: Map<string> = {
	'chs': 'Simplified Chinese',
	'cht': 'Traditional Chinese',
	'kor': 'Korean'
};

const languageIds: Map<string> = {
	'chs': '$0804',
	'cht': '$0404',
	'kor': '$0412'
};

const encodings: Map<string> = {
	'chs': 'CP936',
	'cht': 'CP950',
	'jpn': 'CP932',
	'kor': 'CP949',
	'deu': 'CP1252',
	'fra': 'CP1252',
	'esn': 'CP1252',
	'rus': 'CP1251',
	'ita': 'CP1252'
};

export function createIslFile(base: string, originalFilePath: string, messages: Map<string>, language: string): File {
	let content: string[] = [];
	let originalContent: TextModel;
	if (path.basename(originalFilePath) === 'Default') {
		originalContent = new TextModel(fs.readFileSync(originalFilePath + '.isl', 'utf8'));
	} else {
		originalContent = new TextModel(fs.readFileSync(originalFilePath + '.en.isl', 'utf8'));
	}

	originalContent.lines.forEach(line => {
		if (line.length > 0) {
			let firstChar = line.charAt(0);
			if (firstChar === '[' || firstChar === ';') {
				if (line === '; *** Inno Setup version 5.5.3+ English messages ***') {
					content.push(`; *** Inno Setup version 5.5.3+ ${languageNames[language]} messages ***`);
				} else {
					content.push(line);
				}
			} else {
				let sections: string[] = line.split('=');
				let key = sections[0];
				let translated = line;
				if (key) {
					if (key === 'LanguageName') {
						translated = `${key}=${languageNames[language]}`;
					} else if (key === 'LanguageID') {
						translated = `${key}=${languageIds[language]}`;
					} else if (key === 'LanguageCodePage') {
						translated = `${key}=${encodings[language].substr(2)}`;
					} else {
						let translatedMessage = messages[key];
						if (translatedMessage) {
							translated = `${key}=${translatedMessage}`;
						}
					}
				}

				content.push(translated);
			}
		}
	});

	let tag = iso639_3_to_2[language];
	let basename = path.basename(originalFilePath);
	let filePath = `${path.join(base, path.dirname(originalFilePath), basename)}.${tag}.isl`;

	return new File({
		path: filePath,
		contents: iconv.encode(new Buffer(content.join('\r\n'), 'utf8'), encodings[language])
	});
}

function encodeEntities(value: string): string {
	var result: string[] = [];
	for (var i = 0; i < value.length; i++) {
		var ch = value[i];
		switch (ch) {
			case '<':
				result.push('&lt;');
				break;
			case '>':
				result.push('&gt;');
				break;
			case '&':
				result.push('&amp;');
				break;
			default:
				result.push(ch);
		}
	}
	return result.join('');
}

export function decodeEntities(value:string): string {
	return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}