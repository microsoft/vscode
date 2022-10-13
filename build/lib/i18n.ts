/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import { merge, through, ThroughStream, writeArray } from 'event-stream';
import * as File from 'vinyl';
import * as Is from 'is';
import * as xml2js from 'xml2js';
import * as gulp from 'gulp';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as iconv from '@vscode/iconv-lite-umd';
import { l10nJsonFormat, getL10nXlf, l10nJsonDetails, getL10nFilesFromXlf, getL10nJson } from '@vscode/l10n-dev';

function log(message: any, ...rest: any[]): void {
	fancyLog(ansiColors.green('[i18n]'), message, ...rest);
}

export interface Language {
	id: string; // language id, e.g. zh-tw, de
	translationId?: string; // language id used in translation tools, e.g. zh-hant, de (optional, if not set, the id is used)
	folderName?: string; // language specific folder name, e.g. cht, deu  (optional, if not set, the id is used)
}

export interface InnoSetup {
	codePage: string; //code page for encoding (http://www.jrsoftware.org/ishelp/index.php?topic=langoptionssection)
}

export const defaultLanguages: Language[] = [
	{ id: 'zh-tw', folderName: 'cht', translationId: 'zh-hant' },
	{ id: 'zh-cn', folderName: 'chs', translationId: 'zh-hans' },
	{ id: 'ja', folderName: 'jpn' },
	{ id: 'ko', folderName: 'kor' },
	{ id: 'de', folderName: 'deu' },
	{ id: 'fr', folderName: 'fra' },
	{ id: 'es', folderName: 'esn' },
	{ id: 'ru', folderName: 'rus' },
	{ id: 'it', folderName: 'ita' }
];

// languages requested by the community to non-stable builds
export const extraLanguages: Language[] = [
	{ id: 'pt-br', folderName: 'ptb' },
	{ id: 'hu', folderName: 'hun' },
	{ id: 'tr', folderName: 'trk' }
];

// non built-in extensions also that are transifex and need to be part of the language packs
const externalExtensionsWithTranslations: Record<string, string> = {
	'vscode-chrome-debug': 'msjsdiag.debugger-for-chrome',
	'vscode-node-debug': 'ms-vscode.node-debug',
	'vscode-node-debug2': 'ms-vscode.node-debug2'
};

interface Item {
	id: string;
	message: string;
	comment?: string;
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
		const candidate = value as LocalizeInfo;
		return Is.defined(candidate) && Is.string(candidate.key) && (Is.undef(candidate.comment) || (Is.array(candidate.comment) && candidate.comment.every(element => Is.string(element))));
	}
}

interface BundledFormat {
	keys: Record<string, (string | LocalizeInfo)[]>;
	messages: Record<string, string[]>;
	bundles: Record<string, string[]>;
}

module BundledFormat {
	export function is(value: any): value is BundledFormat {
		if (Is.undef(value)) {
			return false;
		}

		const candidate = value as BundledFormat;
		const length = Object.keys(value).length;

		return length === 3 && Is.defined(candidate.keys) && Is.defined(candidate.messages) && Is.defined(candidate.bundles);
	}
}

interface BundledExtensionFormat {
	[key: string]: {
		messages: string[];
		keys: (string | LocalizeInfo)[];
	};
}

interface I18nFormat {
	version: string;
	contents: {
		[module: string]: {
			[messageKey: string]: string;
		};
	};
}

export class Line {
	private buffer: string[] = [];

	constructor(indent: number = 0) {
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
	private files: Record<string, Item[]>;
	public numberOfMessages: number;

	constructor(public project: string) {
		this.buffer = [];
		this.files = Object.create(null);
		this.numberOfMessages = 0;
	}

	public toString(): string {
		this.appendHeader();

		const files = Object.keys(this.files).sort();
		for (const file of files) {
			this.appendNewLine(`<file original="${file}" source-language="en" datatype="plaintext"><body>`, 2);
			const items = this.files[file].sort((a: Item, b: Item) => {
				return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
			});
			for (const item of items) {
				this.addStringItem(file, item);
			}
			this.appendNewLine('</body></file>');
		}
		this.appendFooter();
		return this.buffer.join('\r\n');
	}

	public addFile(original: string, keys: (string | LocalizeInfo)[], messages: string[]) {
		if (keys.length === 0) {
			console.log('No keys in ' + original);
			return;
		}
		if (keys.length !== messages.length) {
			throw new Error(`Unmatching keys(${keys.length}) and messages(${messages.length}).`);
		}
		this.numberOfMessages += keys.length;
		this.files[original] = [];
		const existingKeys = new Set<string>();
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			let realKey: string | undefined;
			let comment: string | undefined;
			if (Is.string(key)) {
				realKey = key;
				comment = undefined;
			} else if (LocalizeInfo.is(key)) {
				realKey = key.key;
				if (key.comment && key.comment.length > 0) {
					comment = key.comment.map(comment => encodeEntities(comment)).join('\r\n');
				}
			}
			if (!realKey || existingKeys.has(realKey)) {
				continue;
			}
			existingKeys.add(realKey);
			const message: string = encodeEntities(messages[i]);
			this.files[original].push({ id: realKey, message: message, comment: comment });
		}
	}

	private addStringItem(file: string, item: Item): void {
		if (!item.id || item.message === undefined || item.message === null) {
			throw new Error(`No item ID or value specified: ${JSON.stringify(item)}. File: ${file}`);
		}
		if (item.message.length === 0) {
			log(`Item with id ${item.id} in file ${file} has an empty message.`);
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
		const line = new Line(indent);
		line.append(content);
		this.buffer.push(line.toString());
	}

	static parse = function (xlfString: string): Promise<l10nJsonDetails[]> {
		return new Promise((resolve, reject) => {
			const parser = new xml2js.Parser();

			const files: { messages: Record<string, string>; name: string; language: string }[] = [];

			parser.parseString(xlfString, function (err: any, result: any) {
				if (err) {
					reject(new Error(`XLF parsing error: Failed to parse XLIFF string. ${err}`));
				}

				const fileNodes: any[] = result['xliff']['file'];
				if (!fileNodes) {
					reject(new Error(`XLF parsing error: XLIFF file does not contain "xliff" or "file" node(s) required for parsing.`));
				}

				fileNodes.forEach((file) => {
					const name = file.$.original;
					if (!name) {
						reject(new Error(`XLF parsing error: XLIFF file node does not contain original attribute to determine the original location of the resource file.`));
					}
					const language = file.$['target-language'];
					if (!language) {
						reject(new Error(`XLF parsing error: XLIFF file node does not contain target-language attribute to determine translated language.`));
					}
					const messages: Record<string, string> = {};

					const transUnits = file.body[0]['trans-unit'];
					if (transUnits) {
						transUnits.forEach((unit: any) => {
							const key = unit.$.id;
							if (!unit.target) {
								return; // No translation available
							}

							let val = unit.target[0];
							if (typeof val !== 'string') {
								// We allow empty source values so support them for translations as well.
								val = val._ ? val._ : '';
							}
							if (!key) {
								reject(new Error(`XLF parsing error: trans-unit ${JSON.stringify(unit, undefined, 0)} defined in file ${name} is missing the ID attribute.`));
								return;
							}
							messages[key] = decodeEntities(val);
						});
						files.push({ messages, name, language: language.toLowerCase() });
					}
				});

				resolve(files);
			});
		});
	};
}

function sortLanguages(languages: Language[]): Language[] {
	return languages.sort((a: Language, b: Language): number => {
		return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
	});
}

function stripComments(content: string): string {
	// Copied from stripComments.js
	//
	// First group matches a double quoted string
	// Second group matches a single quoted string
	// Third group matches a multi line comment
	// Forth group matches a single line comment
	// Fifth group matches a trailing comma
	const regexp = /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')|(\/\*[^\/\*]*(?:(?:\*|\/)[^\/\*]*)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))|(,\s*[}\]])/g;
	const result = content.replace(regexp, (match, _m1: string, _m2: string, m3: string, m4: string, m5: string) => {
		// Only one of m1, m2, m3, m4, m5 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// Since m4 is a single line comment is is at least of length 2 (e.g. //)
			// If it ends in \r?\n then keep it.
			const length = m4.length;
			if (m4[length - 1] === '\n') {
				return m4[length - 2] === '\r' ? '\r\n' : '\n';
			} else {
				return '';
			}
		} else if (m5) {
			// Remove the trailing comma
			return match.substring(1);
		} else {
			// We match a string
			return match;
		}
	});
	return result;
}

function escapeCharacters(value: string): string {
	const result: string[] = [];
	for (let i = 0; i < value.length; i++) {
		const ch = value.charAt(i);
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

function processCoreBundleFormat(fileHeader: string, languages: Language[], json: BundledFormat, emitter: ThroughStream) {
	const keysSection = json.keys;
	const messageSection = json.messages;
	const bundleSection = json.bundles;

	const statistics: Record<string, number> = Object.create(null);

	const defaultMessages: Record<string, Record<string, string>> = Object.create(null);
	const modules = Object.keys(keysSection);
	modules.forEach((module) => {
		const keys = keysSection[module];
		const messages = messageSection[module];
		if (!messages || keys.length !== messages.length) {
			emitter.emit('error', `Message for module ${module} corrupted. Mismatch in number of keys and messages.`);
			return;
		}
		const messageMap: Record<string, string> = Object.create(null);
		defaultMessages[module] = messageMap;
		keys.map((key, i) => {
			if (typeof key === 'string') {
				messageMap[key] = messages[i];
			} else {
				messageMap[key.key] = messages[i];
			}
		});
	});

	const languageDirectory = path.join(__dirname, '..', '..', '..', 'vscode-loc', 'i18n');
	if (!fs.existsSync(languageDirectory)) {
		log(`No VS Code localization repository found. Looking at ${languageDirectory}`);
		log(`To bundle translations please check out the vscode-loc repository as a sibling of the vscode repository.`);
	}
	const sortedLanguages = sortLanguages(languages);
	sortedLanguages.forEach((language) => {
		if (process.env['VSCODE_BUILD_VERBOSE']) {
			log(`Generating nls bundles for: ${language.id}`);
		}

		statistics[language.id] = 0;
		const localizedModules: Record<string, string[]> = Object.create(null);
		const languageFolderName = language.translationId || language.id;
		const i18nFile = path.join(languageDirectory, `vscode-language-pack-${languageFolderName}`, 'translations', 'main.i18n.json');
		let allMessages: I18nFormat | undefined;
		if (fs.existsSync(i18nFile)) {
			const content = stripComments(fs.readFileSync(i18nFile, 'utf8'));
			allMessages = JSON.parse(content);
		}
		modules.forEach((module) => {
			const order = keysSection[module];
			let moduleMessage: { [messageKey: string]: string } | undefined;
			if (allMessages) {
				moduleMessage = allMessages.contents[module];
			}
			if (!moduleMessage) {
				if (process.env['VSCODE_BUILD_VERBOSE']) {
					log(`No localized messages found for module ${module}. Using default messages.`);
				}
				moduleMessage = defaultMessages[module];
				statistics[language.id] = statistics[language.id] + Object.keys(moduleMessage).length;
			}
			const localizedMessages: string[] = [];
			order.forEach((keyInfo) => {
				let key: string | null = null;
				if (typeof keyInfo === 'string') {
					key = keyInfo;
				} else {
					key = keyInfo.key;
				}
				let message: string = moduleMessage![key];
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
			const modules = bundleSection[bundle];
			const contents: string[] = [
				fileHeader,
				`define("${bundle}.nls.${language.id}", {`
			];
			modules.forEach((module, index) => {
				contents.push(`\t"${module}": [`);
				const messages = localizedModules[module];
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
			emitter.queue(new File({ path: bundle + '.nls.' + language.id + '.js', contents: Buffer.from(contents.join('\n'), 'utf-8') }));
		});
	});
	Object.keys(statistics).forEach(key => {
		const value = statistics[key];
		log(`${key} has ${value} untranslated strings.`);
	});
	sortedLanguages.forEach(language => {
		const stats = statistics[language.id];
		if (Is.undef(stats)) {
			log(`\tNo translations found for language ${language.id}. Using default language instead.`);
		}
	});
}

export function processNlsFiles(opts: { fileHeader: string; languages: Language[] }): ThroughStream {
	return through(function (this: ThroughStream, file: File) {
		const fileName = path.basename(file.path);
		if (fileName === 'nls.metadata.json') {
			let json = null;
			if (file.isBuffer()) {
				json = JSON.parse((<Buffer>file.contents).toString('utf8'));
			} else {
				this.emit('error', `Failed to read component file: ${file.relative}`);
				return;
			}
			if (BundledFormat.is(json)) {
				processCoreBundleFormat(opts.fileHeader, opts.languages, json, this);
			}
		}
		this.queue(file);
	});
}

const editorProject: string = 'vscode-editor',
	workbenchProject: string = 'vscode-workbench',
	extensionsProject: string = 'vscode-extensions',
	setupProject: string = 'vscode-setup',
	serverProject: string = 'vscode-server';

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
	} else if (/^vs\/server/.test(sourceFile)) {
		return { name: 'vs/server', project: serverProject };
	} else if (/^vs\/workbench\/contrib/.test(sourceFile)) {
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


export function createXlfFilesForCoreBundle(): ThroughStream {
	return through(function (this: ThroughStream, file: File) {
		const basename = path.basename(file.path);
		if (basename === 'nls.metadata.json') {
			if (file.isBuffer()) {
				const xlfs: Record<string, XLF> = Object.create(null);
				const json: BundledFormat = JSON.parse((file.contents as Buffer).toString('utf8'));
				for (const coreModule in json.keys) {
					const projectResource = getResource(coreModule);
					const resource = projectResource.name;
					const project = projectResource.project;

					const keys = json.keys[coreModule];
					const messages = json.messages[coreModule];
					if (keys.length !== messages.length) {
						this.emit('error', `There is a mismatch between keys and messages in ${file.relative} for module ${coreModule}`);
						return;
					} else {
						let xlf = xlfs[resource];
						if (!xlf) {
							xlf = new XLF(project);
							xlfs[resource] = xlf;
						}
						xlf.addFile(`src/${coreModule}`, keys, messages);
					}
				}
				for (const resource in xlfs) {
					const xlf = xlfs[resource];
					const filePath = `${xlf.project}/${resource.replace(/\//g, '_')}.xlf`;
					const xlfFile = new File({
						path: filePath,
						contents: Buffer.from(xlf.toString(), 'utf8')
					});
					this.queue(xlfFile);
				}
			} else {
				this.emit('error', new Error(`File ${file.relative} is not using a buffer content`));
				return;
			}
		} else {
			this.emit('error', new Error(`File ${file.relative} is not a core meta data file.`));
			return;
		}
	});
}

function createL10nBundleForExtension(extensionName: string): ThroughStream {
	const result = through();
	gulp.src([
		`extensions/${extensionName}/src/**/*.ts`,
	]).pipe(writeArray((err, files: File[]) => {
		if (err) {
			result.emit('error', err);
			return;
		}

		const json = getL10nJson(files.map(file => {
			return file.contents.toString('utf8');
		}));

		if (Object.keys(json).length > 0) {
			result.emit('data', new File({
				path: `${extensionName}/bundle.l10n.json`,
				contents: Buffer.from(JSON.stringify(json), 'utf8')
			}));
		}
		result.emit('end');
	}));

	return result;
}

export function createXlfFilesForExtensions(): ThroughStream {
	let counter: number = 0;
	let folderStreamEnded: boolean = false;
	let folderStreamEndEmitted: boolean = false;
	return through(function (this: ThroughStream, extensionFolder: File) {
		const folderStream = this;
		const stat = fs.statSync(extensionFolder.path);
		if (!stat.isDirectory()) {
			return;
		}
		const extensionName = path.basename(extensionFolder.path);
		if (extensionName === 'node_modules') {
			return;
		}
		counter++;
		let _l10nMap: Map<string, l10nJsonFormat>;
		function getL10nMap() {
			if (!_l10nMap) {
				_l10nMap = new Map();
			}
			return _l10nMap;
		}
		merge(
			gulp.src([`.build/extensions/${extensionName}/package.nls.json`, `.build/extensions/${extensionName}/**/nls.metadata.json`], { allowEmpty: true }),
			createL10nBundleForExtension(extensionName)
		).pipe(through(function (file: File) {
			if (file.isBuffer()) {
				const buffer: Buffer = file.contents as Buffer;
				const basename = path.basename(file.path);
				if (basename === 'package.nls.json') {
					const json: l10nJsonFormat = JSON.parse(buffer.toString('utf8'));
					getL10nMap().set(`extensions/${extensionName}/package`, json);
				} else if (basename === 'nls.metadata.json') {
					const json: BundledExtensionFormat = JSON.parse(buffer.toString('utf8'));
					const relPath = path.relative(`.build/extensions/${extensionName}`, path.dirname(file.path));
					for (const file in json) {
						const fileContent = json[file];
						const info: l10nJsonFormat = Object.create(null);
						for (let i = 0; i < fileContent.messages.length; i++) {
							const message = fileContent.messages[i];
							const { key, comment } = LocalizeInfo.is(fileContent.keys[i])
								? fileContent.keys[i] as LocalizeInfo
								: { key: fileContent.keys[i] as string, comment: undefined };

							info[key] = comment ? { message, comment } : message;
						}
						getL10nMap().set(`extensions/${extensionName}/${relPath}/${file}`, info);
					}
				} else if (basename === 'bundle.l10n.json') {
					const json: l10nJsonFormat = JSON.parse(buffer.toString('utf8'));
					getL10nMap().set(`extensions/${extensionName}/bundle`, json);
				} else {
					this.emit('error', new Error(`${file.path} is not a valid extension nls file`));
					return;
				}
			}
		}, function () {
			if (_l10nMap?.size > 0) {
				const xlfFile = new File({
					path: path.join(extensionsProject, extensionName + '.xlf'),
					contents: Buffer.from(getL10nXlf(_l10nMap), 'utf8')
				});
				folderStream.queue(xlfFile);
			}
			this.queue(null);
			counter--;
			if (counter === 0 && folderStreamEnded && !folderStreamEndEmitted) {
				folderStreamEndEmitted = true;
				folderStream.queue(null);
			}
		}));
	}, function () {
		folderStreamEnded = true;
		if (counter === 0) {
			folderStreamEndEmitted = true;
			this.queue(null);
		}
	});
}

export function createXlfFilesForIsl(): ThroughStream {
	return through(function (this: ThroughStream, file: File) {
		let projectName: string,
			resourceFile: string;
		if (path.basename(file.path) === 'messages.en.isl') {
			projectName = setupProject;
			resourceFile = 'messages.xlf';
		} else {
			throw new Error(`Unknown input file ${file.path}`);
		}

		const xlf = new XLF(projectName),
			keys: string[] = [],
			messages: string[] = [];

		const model = new TextModel(file.contents.toString());
		let inMessageSection = false;
		model.lines.forEach(line => {
			if (line.length === 0) {
				return;
			}
			const firstChar = line.charAt(0);
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
			const sections: string[] = line.split('=');
			if (sections.length !== 2) {
				throw new Error(`Badly formatted message found: ${line}`);
			} else {
				const key = sections[0];
				const value = sections[1];
				if (key.length > 0 && value.length > 0) {
					keys.push(key);
					messages.push(value);
				}
			}
		});

		const originalPath = file.path.substring(file.cwd.length + 1, file.path.split('.')[0].length).replace(/\\/g, '/');
		xlf.addFile(originalPath, keys, messages);

		// Emit only upon all ISL files combined into single XLF instance
		const newFilePath = path.join(projectName, resourceFile);
		const xlfFile = new File({ path: newFilePath, contents: Buffer.from(xlf.toString(), 'utf-8') });
		this.queue(xlfFile);
	});
}

function createI18nFile(name: string, messages: any): File {
	const result = Object.create(null);
	result[''] = [
		'--------------------------------------------------------------------------------------------',
		'Copyright (c) Microsoft Corporation. All rights reserved.',
		'Licensed under the MIT License. See License.txt in the project root for license information.',
		'--------------------------------------------------------------------------------------------',
		'Do not edit this file. It is machine generated.'
	];
	for (const key of Object.keys(messages)) {
		result[key] = messages[key];
	}

	let content = JSON.stringify(result, null, '\t');
	if (process.platform === 'win32') {
		content = content.replace(/\n/g, '\r\n');
	}
	return new File({
		path: path.join(name + '.i18n.json'),
		contents: Buffer.from(content, 'utf8')
	});
}

interface I18nPack {
	version: string;
	contents: {
		[path: string]: Record<string, string>;
	};
}

const i18nPackVersion = '1.0.0';

export interface TranslationPath {
	id: string;
	resourceName: string;
}

function getRecordFromL10nJsonFormat(l10nJsonFormat: l10nJsonFormat): Record<string, string> {
	const record: Record<string, string> = {};
	for (const key of Object.keys(l10nJsonFormat)) {
		const value = l10nJsonFormat[key];
		record[key] = typeof value === 'string' ? value : value.message;
	}
	return record;
}

export function prepareI18nPackFiles(resultingTranslationPaths: TranslationPath[]): NodeJS.ReadWriteStream {
	const parsePromises: Promise<l10nJsonDetails[]>[] = [];
	const mainPack: I18nPack = { version: i18nPackVersion, contents: {} };
	const extensionsPacks: Record<string, I18nPack> = {};
	const errors: any[] = [];
	return through(function (this: ThroughStream, xlf: File) {
		const project = path.basename(path.dirname(path.dirname(xlf.relative)));
		const resource = path.basename(xlf.relative, '.xlf');
		const contents = xlf.contents.toString();
		log(`Found ${project}: ${resource}`);
		const parsePromise = getL10nFilesFromXlf(contents);
		parsePromises.push(parsePromise);
		parsePromise.then(
			resolvedFiles => {
				resolvedFiles.forEach(file => {
					const path = file.name;
					const firstSlash = path.indexOf('/');

					if (project === extensionsProject) {
						let extPack = extensionsPacks[resource];
						if (!extPack) {
							extPack = extensionsPacks[resource] = { version: i18nPackVersion, contents: {} };
						}
						const externalId = externalExtensionsWithTranslations[resource];
						if (!externalId) { // internal extension: remove 'extensions/extensionId/' segnent
							const secondSlash = path.indexOf('/', firstSlash + 1);
							extPack.contents[path.substring(secondSlash + 1)] = getRecordFromL10nJsonFormat(file.messages);
						} else {
							extPack.contents[path] = getRecordFromL10nJsonFormat(file.messages);
						}
					} else {
						mainPack.contents[path.substring(firstSlash + 1)] = getRecordFromL10nJsonFormat(file.messages);
					}
				});
			}
		).catch(reason => {
			errors.push(reason);
		});
	}, function () {
		Promise.all(parsePromises)
			.then(() => {
				if (errors.length > 0) {
					throw errors;
				}
				const translatedMainFile = createI18nFile('./main', mainPack);
				resultingTranslationPaths.push({ id: 'vscode', resourceName: 'main.i18n.json' });

				this.queue(translatedMainFile);
				for (const extension in extensionsPacks) {
					const translatedExtFile = createI18nFile(`extensions/${extension}`, extensionsPacks[extension]);
					this.queue(translatedExtFile);

					const externalExtensionId = externalExtensionsWithTranslations[extension];
					if (externalExtensionId) {
						resultingTranslationPaths.push({ id: externalExtensionId, resourceName: `extensions/${extension}.i18n.json` });
					} else {
						resultingTranslationPaths.push({ id: `vscode.${extension}`, resourceName: `extensions/${extension}.i18n.json` });
					}

				}
				this.queue(null);
			})
			.catch((reason) => {
				this.emit('error', reason);
			});
	});
}

export function prepareIslFiles(language: Language, innoSetupConfig: InnoSetup): ThroughStream {
	const parsePromises: Promise<l10nJsonDetails[]>[] = [];

	return through(function (this: ThroughStream, xlf: File) {
		const stream = this;
		const parsePromise = XLF.parse(xlf.contents.toString());
		parsePromises.push(parsePromise);
		parsePromise.then(
			resolvedFiles => {
				resolvedFiles.forEach(file => {
					const translatedFile = createIslFile(file.name, file.messages, language, innoSetupConfig);
					stream.queue(translatedFile);
				});
			}
		).catch(reason => {
			this.emit('error', reason);
		});
	}, function () {
		Promise.all(parsePromises)
			.then(() => { this.queue(null); })
			.catch(reason => {
				this.emit('error', reason);
			});
	});
}

function createIslFile(name: string, messages: l10nJsonFormat, language: Language, innoSetup: InnoSetup): File {
	const content: string[] = [];
	let originalContent: TextModel;
	if (path.basename(name) === 'Default') {
		originalContent = new TextModel(fs.readFileSync(name + '.isl', 'utf8'));
	} else {
		originalContent = new TextModel(fs.readFileSync(name + '.en.isl', 'utf8'));
	}
	originalContent.lines.forEach(line => {
		if (line.length > 0) {
			const firstChar = line.charAt(0);
			if (firstChar === '[' || firstChar === ';') {
				content.push(line);
			} else {
				const sections: string[] = line.split('=');
				const key = sections[0];
				let translated = line;
				if (key) {
					const translatedMessage = messages[key];
					if (translatedMessage) {
						translated = `${key}=${translatedMessage}`;
					}
				}

				content.push(translated);
			}
		}
	});

	const basename = path.basename(name);
	const filePath = `${basename}.${language.id}.isl`;
	const encoded = iconv.encode(Buffer.from(content.join('\r\n'), 'utf8').toString(), innoSetup.codePage);

	return new File({
		path: filePath,
		contents: Buffer.from(encoded),
	});
}

function encodeEntities(value: string): string {
	const result: string[] = [];
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
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
