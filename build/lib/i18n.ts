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
import * as https from 'https';

var util = require('gulp-util');
var iconv = require('iconv-lite');

const NUMBER_OF_CONCURRENT_DOWNLOADS = 1;

function log(message: any, ...rest: any[]): void {
	util.log(util.colors.green('[i18n]'), message, ...rest);
}

export interface Language {
	id: string; // laguage id, e.g. zh-tw, de
	transifexId?: string; // language id used in transifex, e.g zh-hant, de (optional, if not set, the id is used)
	folderName?: string; // language specific folder name, e.g. cht, deu  (optional, if not set, the id is used)
}

export interface InnoSetup {
	codePage: string; //code page for encoding (http://www.jrsoftware.org/ishelp/index.php?topic=langoptionssection)
	defaultInfo?: {
		name: string; // inno setup language name
		id: string; // locale identifier (https://msdn.microsoft.com/en-us/library/dd318693.aspx)
	};
}

export const defaultLanguages : Language[] = [
	{ id: 'zh-tw', folderName: 'cht', transifexId: 'zh-hant' },
	{ id: 'zh-cn', folderName: 'chs', transifexId: 'zh-hans' },
	{ id: 'ja', folderName: 'jpn' },
	{ id: 'ko', folderName: 'kor' },
	{ id: 'de', folderName: 'deu' },
	{ id: 'fr', folderName: 'fra' },
	{ id: 'es', folderName: 'esn' },
	{ id: 'ru', folderName: 'rus' },
	{ id: 'it', folderName: 'ita' }
];

// languages requested by the community to non-stable builds
export const extraLanguages : Language[] = [
	{ id: 'pt-br', folderName: 'ptb' },
	{ id: 'hu', folderName: 'hun' },
	{ id: 'tr', folderName: 'trk' }
];

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

interface ParsedXLF {
	messages: Map<string>;
	originalFilePath: string;
	language: string;
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
	keys: Map<(string | LocalizeInfo) []>;
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
	keys: (string | LocalizeInfo) [];
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
			throw new Error(`No item ID or value specified: ${JSON.stringify(item)}`);
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

	static parse = function (xlfString: string): Promise<ParsedXLF[]> {
		return new Promise((resolve, reject) => {
			let parser = new xml2js.Parser();

			let files: { messages: Map<string>, originalFilePath: string, language: string }[] = [];

			parser.parseString(xlfString, function (err, result) {
				if (err) {
					reject(new Error(`XLF parsing error: Failed to parse XLIFF string. ${err}`));
				}

				const fileNodes: any[] = result['xliff']['file'];
				if (!fileNodes) {
					reject(new Error(`XLF parsing error: XLIFF file does not contain "xliff" or "file" node(s) required for parsing.`));
				}

				fileNodes.forEach((file) => {
					const originalFilePath = file.$.original;
					if (!originalFilePath) {
						reject(new Error(`XLF parsing error: XLIFF file node does not contain original attribute to determine the original location of the resource file.`));
					}
					const language = file.$['target-language'].toLowerCase();
					if (!language) {
						reject(new Error(`XLF parsing error: XLIFF file node does not contain target-language attribute to determine translated language.`));
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
							reject(new Error(`XLF parsing error: XLIFF file does not contain full localization data. ID or target translation for one of the trans-unit nodes is not present.`));
						}
					});

					files.push({ messages: messages, originalFilePath: originalFilePath, language: language });
				});

				resolve(files);
			});
		});
	};
}

export interface ITask<T> {
	(): T;
}

interface ILimitedTaskFactory<T> {
	factory: ITask<Promise<T>>;
	c: (value?: T | Thenable<T>) => void;
	e: (error?: any) => void;
}

export class Limiter<T> {
	private runningPromises: number;
	private outstandingPromises: ILimitedTaskFactory<any>[];

	constructor(private maxDegreeOfParalellism: number) {
		this.outstandingPromises = [];
		this.runningPromises = 0;
	}

	queue(factory: ITask<Promise<T>>): Promise<T> {
		return new Promise<T>((c, e) => {
			this.outstandingPromises.push({ factory, c, e });
			this.consume();
		});
	}

	private consume(): void {
		while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
			const iLimitedTask = this.outstandingPromises.shift();
			this.runningPromises++;

			const promise = iLimitedTask.factory();
			promise.then(iLimitedTask.c).catch(iLimitedTask.e);
			promise.then(() => this.consumed()).catch(() => this.consumed());
		}
	}

	private consumed(): void {
		this.runningPromises--;
		this.consume();
	}
}

function sortLanguages(languages: Language[]): Language[] {
	return languages.sort((a: Language, b: Language): number => {
		return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
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
				return m4[length - 2] === '\r' ? '\r\n' : '\n';
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

function escapeCharacters(value: string): string {
	var result: string[] = [];
	for (var i = 0; i < value.length; i++) {
		var ch = value.charAt(i);
		switch (ch) {
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

function processCoreBundleFormat(fileHeader: string, languages: Language[], json: BundledFormat, emitter: any) {
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
			if (typeof key === 'string') {
				messageMap[key] = messages[i];
			} else {
				messageMap[key.key] = messages[i];
			}
		});
	});

	let languageDirectory = path.join(__dirname, '..', '..', 'i18n');
	let sortedLanguages = sortLanguages(languages);
	sortedLanguages.forEach((language) => {
		if (process.env['VSCODE_BUILD_VERBOSE']) {
			log(`Generating nls bundles for: ${language.id}`);
		}

		statistics[language.id] = 0;
		let localizedModules: Map<string[]> = Object.create(null);
		let languageFolderName = language.folderName || language.id;
		let cwd = path.join(languageDirectory, languageFolderName, 'src');
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
				statistics[language.id] = statistics[language.id] + Object.keys(messages).length;
			}
			let localizedMessages: string[] = [];
			order.forEach((keyInfo) => {
				let key: string = null;
				if (typeof keyInfo === 'string') {
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
					statistics[language.id] = statistics[language.id] + 1;
				}
				localizedMessages.push(message);
			});
			localizedModules[module] = localizedMessages;
		});
		Object.keys(bundleSection).forEach((bundle) => {
			let modules = bundleSection[bundle];
			let contents: string[] = [
				fileHeader,
				`define("${bundle}.nls.${language.id}", {`
			];
			modules.forEach((module, index) => {
				contents.push(`\t"${module}": [`);
				let messages = localizedModules[module];
				if (!messages) {
					emitter.emit('error', `Didn't find messages for module ${module}.`);
					return;
				}
				messages.forEach((message, index) => {
					contents.push(`\t\t"${escapeCharacters(message)}${index < messages.length ? '",' : '"'}`);
				});
				contents.push(index < modules.length - 1 ? '\t],' : '\t]');
			});
			contents.push('});');
			emitter.emit('data', new File({ path: bundle + '.nls.' + language.id + '.js', contents: new Buffer(contents.join('\n'), 'utf-8') }));
		});
	});
	Object.keys(statistics).forEach(key => {
		let value = statistics[key];
		log(`${key} has ${value} untranslated strings.`);
	});
	sortedLanguages.forEach(language => {
		let stats = statistics[language.id];
		if (Is.undef(stats)) {
			log(`\tNo translations found for language ${language.id}. Using default language instead.`);
		}
	});
}

export function processNlsFiles(opts: { fileHeader: string; languages: Language[] }): ThroughStream {
	return through(function (file: File) {
		let fileName = path.basename(file.path);
		if (fileName === 'nls.metadata.json') {
			let json = null;
			if (file.isBuffer()) {
				json = JSON.parse((<Buffer>file.contents).toString('utf8'));
			} else {
				this.emit('error', `Failed to read component file: ${file.relative}`);
			}
			if (BundledFormat.is(json)) {
				processCoreBundleFormat(opts.fileHeader, opts.languages, json, this);
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

export function getResource(sourceFile: string): Resource {
	let resource: string;

	if (/^vs\/platform/.test(sourceFile)) {
		return { name: 'vs/platform', project: editorProject };
	} else if (/^vs\/editor\/contrib/.test(sourceFile)) {
		return { name: 'vs/editor/contrib', project: editorProject };
	} else if (/^vs\/editor/.test(sourceFile)) {
		return { name: 'vs/editor', project: editorProject };
	} else if (/^vs\/base/.test(sourceFile)) {
		return { name: 'vs/base', project: editorProject };
	} else if (/^vs\/code/.test(sourceFile)) {
		return { name: 'vs/code', project: workbenchProject };
	} else if (/^vs\/workbench\/parts/.test(sourceFile)) {
		resource = sourceFile.split('/', 4).join('/');
		return { name: resource, project: workbenchProject };
	} else if (/^vs\/workbench\/services/.test(sourceFile)) {
		resource = sourceFile.split('/', 4).join('/');
		return { name: resource, project: workbenchProject };
	} else if (/^vs\/workbench/.test(sourceFile)) {
		return { name: 'vs/workbench', project: workbenchProject };
	}

	throw new Error(`Could not identify the XLF bundle for ${sourceFile}`);
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
		const xlfFile = new File({ path: newFilePath, contents: new Buffer(bundleXlfs[resource].toString(), 'utf-8') });
		stream.emit('data', xlfFile);
	}
}

//function importBundledExtensionJson(file: File, json: BundledExtensionFormat, stream: ThroughStream): void {

//}

// Keeps existing XLF instances and a state of how many files were already processed for faster file emission
var extensions: Map<{ xlf: XLF, processed: number }> = Object.create(null);
function importModuleOrPackageJson(file: File, json: ModuleJsonFormat | PackageJsonFormat, projectName: string, stream: ThroughStream, extensionName?: string): void {
	if (ModuleJsonFormat.is(json) && json.keys.length !== json.messages.length) {
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
		extensionName = formattedSourcePath.split('/') [0];
		localizationFilesCount = glob.sync(`./extensions/${extensionName}/**/*.nls.json`).length;
		originalFilePath = `extensions/${formattedSourcePath.substr(0, formattedSourcePath.length - '.nls.json'.length)}`;
	}

	let extension = extensions[extensionName] ?
		extensions[extensionName] : extensions[extensionName] = { xlf: new XLF(projectName), processed: 0 };

	// .nls.json can come with empty array of keys and messages, check for it
	if (ModuleJsonFormat.is(json) && json.keys.length !== 0) {
		extension.xlf.addFile(originalFilePath, json.keys, json.messages);
	} else if (PackageJsonFormat.is(json) && Object.keys(json).length !== 0) {
		extension.xlf.addFile(originalFilePath, Object.keys(json), messages);
	}

	// Check if XLF is populated with file nodes to emit it
	if (++extensions[extensionName].processed === localizationFilesCount) {
		const newFilePath = path.join(projectName, extensionName + '.xlf');
		const xlfFile = new File({ path: newFilePath, contents: new Buffer(extension.xlf.toString(), 'utf-8') });
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

	const originalPath = file.path.substring(file.cwd.length + 1, file.path.split('.') [0].length).replace(/\\/g, '/');
	xlf.addFile(originalPath, keys, messages);

	// Emit only upon all ISL files combined into single XLF instance
	const newFilePath = path.join(projectName, resourceFile);
	const xlfFile = new File({ path: newFilePath, contents: new Buffer(xlf.toString(), 'utf-8') });
	stream.emit('data', xlfFile);
}

export function pushXlfFiles(apiHostname: string, username: string, password: string): ThroughStream {
	let tryGetPromises = [];
	let updateCreatePromises = [];

	return through(function (file: File) {
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

	}, function () {
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

		const request = https.request(options, (response) => {
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

		let request = https.request(options, (res) => {
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
function updateResource(project: string, slug: string, xlfFile: File, apiHostname: string, credentials: string): Promise<any> {
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

		let request = https.request(options, (res) => {
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

// cache resources
let _buildResources: Resource[];

export function pullBuildXlfFiles(apiHostname: string, username: string, password: string, language: Language): NodeJS.ReadableStream {
	if (!_buildResources) {
		_buildResources = [];
		// editor and workbench
		const json = JSON.parse(fs.readFileSync('./build/lib/i18n.resources.json', 'utf8'));
		_buildResources.push(...json.editor);
		_buildResources.push(...json.workbench);

		// extensions
		let extensionsToLocalize: string[] = glob.sync('./extensions/**/*.nls.json').map(extension => extension.split('/') [2]);
		let resourcesToPull: string[] = [];

		extensionsToLocalize.forEach(extension => {
			if (resourcesToPull.indexOf(extension) === -1) { // remove duplicate elements returned by glob
				resourcesToPull.push(extension);
				_buildResources.push({ name: extension, project: 'vscode-extensions' });
			}
		});
	}
	return pullXlfFiles(apiHostname, username, password, language, _buildResources);
}

export function pullSetupXlfFiles(apiHostname: string, username: string, password: string, language: Language, includeDefault: boolean): NodeJS.ReadableStream {
	let setupResources = [{ name: 'setup_messages', project: 'vscode-workbench' }];
	if (includeDefault) {
		setupResources.push({ name: 'setup_default', project: 'vscode-setup' });
	}
	return pullXlfFiles(apiHostname, username, password, language, setupResources);
}

function pullXlfFiles(apiHostname: string, username: string, password: string, language: Language, resources: Resource[]): NodeJS.ReadableStream {
	const credentials = `${username}:${password}`;
	let expectedTranslationsCount = resources.length;
	let translationsRetrieved = 0, called = false;

	return readable(function (count, callback) {
		// Mark end of stream when all resources were retrieved
		if (translationsRetrieved === expectedTranslationsCount) {
			return this.emit('end');
		}

		if (!called) {
			called = true;
			const stream = this;
			resources.map(function (resource) {
				retrieveResource(language, resource, apiHostname, credentials).then((file: File) => {
					stream.emit('data', file);
					translationsRetrieved++;
				}).catch(error => { throw new Error(error); });
			});
		}

		callback();
	});
}
const limiter = new Limiter<File>(NUMBER_OF_CONCURRENT_DOWNLOADS);

function retrieveResource(language: Language, resource: Resource, apiHostname, credentials): Promise<File> {
	return limiter.queue(() => new Promise<File>((resolve, reject) => {
		const slug = resource.name.replace(/\//g, '_');
		const project = resource.project;
		const transifexLanguageId = language.transifexId || language.id;
		const options = {
			hostname: apiHostname,
			path: `/api/2/project/${project}/resource/${slug}/translation/${transifexLanguageId}?file&mode=onlyreviewed`,
			auth: credentials,
			port: 443,
			method: 'GET'
		};

		let request = https.request(options, (res) => {
			let xlfBuffer: Buffer[] = [];
			res.on('data', (chunk: Buffer) => xlfBuffer.push(chunk));
			res.on('end', () => {
				if (res.statusCode === 200) {
					console.log('success: ' + options.path);
					resolve(new File({ contents: Buffer.concat(xlfBuffer), path: `${project}/${slug}.xlf` }));
				}
				reject(`${slug} in ${project} returned no data. Response code: ${res.statusCode}.`);
			});
		});
		request.on('error', (err) => {
			reject(`Failed to query resource ${slug} with the following error: ${err}. ${options.path}`);
		});
		request.end();
		console.log('started: ' + options.path);
	}));
}

export function prepareI18nFiles(): ThroughStream {
	let parsePromises: Promise<ParsedXLF[]>[] = [];

	return through(function (xlf: File) {
		let stream = this;
		let parsePromise = XLF.parse(xlf.contents.toString());
		parsePromises.push(parsePromise);
		parsePromise.then(
			resolvedFiles => {
				resolvedFiles.forEach(file => {
					let translatedFile = createI18nFile(file.originalFilePath, file.messages);
					stream.emit('data', translatedFile);
				});
			}
		);
	}, function () {
		Promise.all(parsePromises)
			.then(() => { this.emit('end'); })
			.catch(reason => { throw new Error(reason); });
	});
}

function createI18nFile(originalFilePath: string, messages: any): File {
	let content = [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) Microsoft Corporation. All rights reserved.',
		' *  Licensed under the MIT License. See License.txt in the project root for license information.',
		' *--------------------------------------------------------------------------------------------*/',
		'// Do not edit this file. It is machine generated.'
	].join('\n') + '\n' + JSON.stringify(messages, null, '\t').replace(/\r\n/g, '\n');

	return new File({
		path: path.join(originalFilePath + '.i18n.json'),
		contents: new Buffer(content, 'utf8')
	});
}

interface I18nPack {
	[path: string]: Map<string>;
}

export function prepareI18nPackFiles() {
	let parsePromises: Promise<ParsedXLF[]>[] = [];
	let mainPack : I18nPack = {};
	let extensionsPacks : Map<I18nPack> = {};
	return through(function (xlf: File) {
		let stream = this;
		let parsePromise = XLF.parse(xlf.contents.toString());
		parsePromises.push(parsePromise);
		parsePromise.then(
			resolvedFiles => {
				resolvedFiles.forEach(file => {
					const path = file.originalFilePath;
					console.log(path);
					const firstSlash = path.indexOf('/');
					const firstSegment = path.substr(0, firstSlash);
					if (firstSegment === 'src') {
						mainPack[path.substr(firstSlash + 1)] = file.messages;
					} else if (firstSegment === 'extensions') {
						const secondSlash = path.indexOf('/', firstSlash + 1);
						const secondSegment = path.substring(firstSlash + 1, secondSlash);
						if (secondSegment) {
							let extPack = extensionsPacks[secondSegment];
							if (!extPack) {
								extPack = extensionsPacks[secondSegment] = {};
							}
							extPack[path.substr(secondSlash + 1)] = file.messages;
						} else {
							console.log('Unknown second segment ' + path);
						}
					} else {
						console.log('Unknown first segment ' + path);
					}
				});
			}
		);
	}, function () {
		Promise.all(parsePromises)
			.then(() => {
				const translatedMainFile = createI18nFile('./main', mainPack);
				this.emit('data', translatedMainFile);
				for (let extension in extensionsPacks) {
					const translatedExtFile = createI18nFile(`./extensions/${extension}`, extensionsPacks[extension]);
					this.emit('data', translatedExtFile);
				}
				this.emit('end'); })
			.catch(reason => { throw new Error(reason); });
	});
}

export function prepareIslFiles(language: Language, innoSetupConfig: InnoSetup): ThroughStream {
	let parsePromises: Promise<ParsedXLF[]>[] = [];

	return through(function (xlf: File) {
		let stream = this;
		let parsePromise = XLF.parse(xlf.contents.toString());
		parsePromises.push(parsePromise);
		parsePromise.then(
			resolvedFiles => {
				resolvedFiles.forEach(file => {
					if (path.basename(file.originalFilePath) === 'Default' && !innoSetupConfig.defaultInfo) {
						return;
					}
					let translatedFile = createIslFile(file.originalFilePath, file.messages, language, innoSetupConfig);
					stream.emit('data', translatedFile);
				});
			}
		);
	}, function () {
		Promise.all(parsePromises)
			.then(() => { this.emit('end'); })
			.catch(reason => { throw new Error(reason); });
	});
}

function createIslFile(originalFilePath: string, messages: Map<string>, language: Language, innoSetup: InnoSetup): File {
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
					content.push(`; *** Inno Setup version 5.5.3+ ${innoSetup.defaultInfo.name} messages ***`);
				} else {
					content.push(line);
				}
			} else {
				let sections: string[] = line.split('=');
				let key = sections[0];
				let translated = line;
				if (key) {
					if (key === 'LanguageName') {
						translated = `${key}=${innoSetup.defaultInfo.name}`;
					} else if (key === 'LanguageID') {
						translated = `${key}=${innoSetup.defaultInfo.id}`;
					} else if (key === 'LanguageCodePage') {
						translated = `${key}=${innoSetup.codePage.substr(2)}`;
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

	const basename = path.basename(originalFilePath);
	const filePath = `${basename}.${language.id}.isl`;

	return new File({
		path: filePath,
		contents: iconv.encode(new Buffer(content.join('\r\n'), 'utf8'), innoSetup.codePage)
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

function decodeEntities(value: string): string {
	return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}