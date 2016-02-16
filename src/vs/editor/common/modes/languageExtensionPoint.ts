/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import paths = require('vs/base/common/paths');
import Strings = require('vs/base/common/strings');
import {IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {EverywhereAttr, registerThreadSynchronizableObject} from 'vs/platform/thread/common/threadService';
import {PluginsRegistry, IExtensionPointUser, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import Mime = require('vs/base/common/mime');
import Errors = require('vs/base/common/errors');
import Event, {Emitter} from 'vs/base/common/event';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';

interface ILanguagePointData {
	knownModeIds: { [id: string]: boolean; };
	mime2LanguageId: { [mimeType: string]: string; };
	name2LanguageId: { [name: string]: string; };
	name2Extensions: { [name: string]: string[]; };
	id2Name: { [id: string]: string; };
	compatModes: { [id: string]: ICompatModeDescriptor; };
	lowerName2Id: { [name: string]: string; };
}

let languagesExtPoint = PluginsRegistry.registerExtensionPoint<ILanguageExtensionPoint[]>('languages', {
	description: nls.localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
	type: 'array',
	default: [{ id: '', aliases: [], extensions: [] }],
	items: {
		type: 'object',
		default: { id: '', extensions: [] },
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
				type: 'string'
			},
			aliases: {
				description: nls.localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			extensions: {
				description: nls.localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
				default: ['.foo'],
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenames: {
				description: nls.localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenamePatterns: {
				description: nls.localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
				default: ['bar*foo.txt'],
				type: 'array',
				item: {
					type: 'string'
				}
			},
			mimetypes: {
				description: nls.localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			firstLine: {
				description: nls.localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
				type: 'string'
			},
			configuration: {
				description: nls.localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
				type: 'string'
			}
		}
	}
});

function isUndefinedOrStringArray(value: string[]): boolean {
	if (typeof value === 'undefined') {
		return true;
	}
	if (!Array.isArray(value)) {
		return false;
	}
	return value.every(item => typeof item === 'string');
}

function isValidLanguageExtensionPoint(value:ILanguageExtensionPoint, collector:IMessageCollector): boolean {
	if (!value) {
		collector.error(nls.localize('invalid.empty', "Empty value for `contributes.{0}`", languagesExtPoint.name));
		return false;
	}
	if (typeof value.id !== 'string') {
		collector.error(nls.localize('require.id', "property `{0}` is mandatory and must be of type `string`", 'id'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.extensions)) {
		collector.error(nls.localize('opt.extensions', "property `{0}` can be omitted and must be of type `string[]`", 'extensions'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.filenames)) {
		collector.error(nls.localize('opt.filenames', "property `{0}` can be omitted and must be of type `string[]`", 'filenames'));
		return false;
	}
	if (typeof value.firstLine !== 'undefined' && typeof value.firstLine !== 'string') {
		collector.error(nls.localize('opt.firstLine', "property `{0}` can be omitted and must be of type `string`", 'firstLine'));
		return false;
	}
	if (typeof value.configuration !== 'undefined' && typeof value.configuration !== 'string') {
		collector.error(nls.localize('opt.configuration', "property `{0}` can be omitted and must be of type `string`", 'configuration'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.aliases)) {
		collector.error(nls.localize('opt.aliases', "property `{0}` can be omitted and must be of type `string[]`", 'aliases'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.mimetypes)) {
		collector.error(nls.localize('opt.mimetypes', "property `{0}` can be omitted and must be of type `string[]`", 'mimetypes'));
		return false;
	}
	return true;
}

export interface ILegacyLanguageDefinition {
	id: string;
	extensions: string[];
	filenames?: string[];
	firstLine?: string;
	aliases: string[];
	mimetypes: string[];
	moduleId: string;
	ctorName: string;
}

var hasOwnProperty = Object.prototype.hasOwnProperty;

export interface ILanguageExtensionPointHandler {
	registerCompatMode(def:ILegacyLanguageDefinition): void;
	registerLanguage(lang: ILanguageExtensionPoint): void;

	onDidAddMode: Event<string>;

	isRegisteredMode(mimetypeOrModeId: string): boolean;
	getRegisteredModes(): string[];
	getRegisteredLanguageNames(): string[];
	getLanguageName(modeId: string): string;
	getExtensions(languageName: string): string[];
	getModeIdForLanguageNameLowercase(languageNameLower: string): string;
	getConfigurationFiles(modeId: string): string[];
	getMimeForMode(theModeId: string): string;
	extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIdsOrName: string): string[];
	getModeIdsFromLanguageName(languageName: string): string[];
	getModeIdsFromFilenameOrFirstLine(filename: string, firstLine?:string): string[];
	getCompatMode(modeId: string): ICompatModeDescriptor;
}

export interface ICompatModeDescriptor {
	moduleId: string;
	ctorName: string;
}

class LanguageExtensionPointHandler implements IThreadSynchronizableObject<ILanguagePointData>, ILanguageExtensionPointHandler {

	private knownModeIds: { [id: string]: boolean; };
	private mime2LanguageId: { [mimeType: string]: string; };
	private name2LanguageId: { [name: string]: string; };
	private name2Extensions: { [name: string]: string[]; };
	private id2Name: { [id: string]: string; };
	private compatModes: { [id: string]: ICompatModeDescriptor; };
	private lowerName2Id: { [name: string]: string; };
	private id2ConfigurationFiles: { [id:string]: string[]; };

	private _isRegisteredWithThreadService: boolean;

	private _onDidAddMode: Emitter<string> = new Emitter<string>();
	public onDidAddMode: Event<string> = this._onDidAddMode.event;

	constructor() {
		this.knownModeIds = {};
		this.mime2LanguageId = {};
		this.name2LanguageId = {};
		this.id2Name = {};
		this.name2Extensions = {};
		this.compatModes = {};
		this.lowerName2Id = {};
		this.id2ConfigurationFiles = {};
		this._isRegisteredWithThreadService = false;
	}

	// -- BEGIN IThreadSynchronizableObject

	public creationDone(): void {
		this._isRegisteredWithThreadService = true;
	}

	public getId(): string {
		return 'LanguageExtensionPointHandler';
	}

	public getSerializableState(): ILanguagePointData {
		return {
			knownModeIds: this.knownModeIds,
			mime2LanguageId: this.mime2LanguageId,
			name2LanguageId: this.name2LanguageId,
			name2Extensions: this.name2Extensions,
			id2Name: this.id2Name,
			compatModes: this.compatModes,
			lowerName2Id: this.lowerName2Id
		};
	}

	public setData(data: ILanguagePointData): void {
		this.knownModeIds = data.knownModeIds;
		this.mime2LanguageId = data.mime2LanguageId;
		this.name2LanguageId = data.name2LanguageId;
		this.name2Extensions = data.name2Extensions;
		this.id2Name = data.id2Name;
		this.compatModes = data.compatModes;
		this.lowerName2Id = data.lowerName2Id;
	}

	// -- END IThreadSynchronizableObject

	public registerCompatMode(def:ILegacyLanguageDefinition): void {
		this._onLanguage({
			id: def.id,
			extensions: def.extensions,
			filenames: def.filenames,
			firstLine: def.firstLine,
			aliases: def.aliases,
			mimetypes: def.mimetypes
		});

		this.compatModes[def.id] = {
			moduleId: def.moduleId,
			ctorName: def.ctorName
		};
	}

	public _handleLanguagesExtensionPointUsers(extensions:IExtensionPointUser<ILanguageExtensionPoint[]>[]): void {
		let allValidLanguages: ILanguageExtensionPoint[] = [];

		for (let i = 0, len = extensions.length; i < len; i++) {
			let extension = extensions[i];

			if (!Array.isArray(extension.value)) {
				extension.collector.error(nls.localize('invalid', "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
				continue;
			}

			for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
				if (isValidLanguageExtensionPoint(extension.value[j], extension.collector)) {
					allValidLanguages.push({
						id: extension.value[j].id,
						extensions: extension.value[j].extensions,
						filenames: extension.value[j].filenames,
						firstLine: extension.value[j].firstLine,
						aliases: extension.value[j].aliases,
						mimetypes: extension.value[j].mimetypes,
						configuration: extension.value[j].configuration ? paths.join(extension.description.extensionFolderPath, extension.value[j].configuration) : extension.value[j].configuration
					});
				}
			}
		}

		if (this._isRegisteredWithThreadService) {
			this._onLanguagesEverywhere(allValidLanguages);
		} else {
			this._onLanguagesImpl(allValidLanguages);
		}
	}

	static $_onLanguagesEverywhere = EverywhereAttr(LanguageExtensionPointHandler, LanguageExtensionPointHandler.prototype._onLanguagesEverywhere);
	private _onLanguagesEverywhere(desc: ILanguageExtensionPoint[]): void {
		this._onLanguagesImpl(desc);
	}

	private _onLanguagesImpl(desc: ILanguageExtensionPoint[]): void {
		for (let i = 0; i < desc.length; i++) {
			this._onLanguage(desc[i]);
		}
	}

	public registerLanguage(lang: ILanguageExtensionPoint): void {
		this._onLanguage(lang);
	}

	private _onLanguage(lang: ILanguageExtensionPoint): void {
		this.knownModeIds[lang.id] = true;

		var primaryMime: string = null;

		if (typeof lang.mimetypes !== 'undefined' && Array.isArray(lang.mimetypes)) {
			for (var i = 0; i < lang.mimetypes.length; i++) {
				if (!primaryMime) {
					primaryMime = lang.mimetypes[i];
				}
				this.mime2LanguageId[lang.mimetypes[i]] = lang.id;
			}
		}

		if (!primaryMime) {
			primaryMime = 'text/x-' + lang.id;
			this.mime2LanguageId[primaryMime] = lang.id;
		}

		if (Array.isArray(lang.extensions)) {
			for (let extension of lang.extensions) {
				Mime.registerTextMimeByFilename(extension, primaryMime);
			}
		}

		if (Array.isArray(lang.filenames)) {
			for (let filename of lang.filenames) {
				Mime.registerTextMimeByFilename(filename, primaryMime);
			}
		}

		if (Array.isArray(lang.filenamePatterns)) {
			for (let filenamePattern of lang.filenamePatterns) {
				Mime.registerTextMimeByFilename(filenamePattern, primaryMime);
			}
		}

		if (typeof lang.firstLine === 'string' && lang.firstLine.length > 0) {
			var firstLineRegexStr = lang.firstLine;
			if (firstLineRegexStr.charAt(0) !== '^') {
				firstLineRegexStr = '^' + firstLineRegexStr;
			}
			try {
				var firstLineRegex = new RegExp(firstLineRegexStr);
				if (!Strings.regExpLeadsToEndlessLoop(firstLineRegex)) {
					Mime.registerTextMimeByFirstLine(firstLineRegex, primaryMime);
				}
			} catch (err) {
				// Most likely, the regex was bad
				Errors.onUnexpectedError(err);
			}
		}

		var bestName: string = null;
		if (typeof lang.aliases !== 'undefined' && Array.isArray(lang.aliases)) {
			for (var i = 0; i < lang.aliases.length; i++) {
				if (!lang.aliases[i] || lang.aliases[i].length === 0) {
					continue;
				}
				if (!bestName) {
					bestName = lang.aliases[i];
					this.name2LanguageId[lang.aliases[i]] = lang.id;
					this.name2Extensions[lang.aliases[i]] = lang.extensions;
				}
				this.lowerName2Id[lang.aliases[i].toLowerCase()] = lang.id;
			}
		}
		this.id2Name[lang.id] = bestName || '';

		if (typeof lang.configuration === 'string') {
			this.id2ConfigurationFiles[lang.id] = this.id2ConfigurationFiles[lang.id] || [];
			this.id2ConfigurationFiles[lang.id].push(lang.configuration);
		}

		this._onDidAddMode.fire(lang.id);
	}

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		// Is this a known mime type ?
		if (hasOwnProperty.call(this.mime2LanguageId, mimetypeOrModeId)) {
			return true;
		}
		// Is this a known mode id ?
		return hasOwnProperty.call(this.knownModeIds, mimetypeOrModeId);
	}

	public getRegisteredModes(): string[] {
		return Object.keys(this.knownModeIds);
	}

	public getRegisteredLanguageNames(): string[]{
		return Object.keys(this.name2LanguageId);
	}

	public getLanguageName(modeId: string): string {
		return this.id2Name[modeId] || null;
	}

	public getModeIdForLanguageNameLowercase(languageNameLower: string): string {
		return this.lowerName2Id[languageNameLower] || null;
	}

	public getConfigurationFiles(modeId: string): string[] {
		return this.id2ConfigurationFiles[modeId] || [];
	}

	public getMimeForMode(theModeId: string): string {
		for (var mime in this.mime2LanguageId) {
			if (this.mime2LanguageId.hasOwnProperty(mime)) {
				var modeId = this.mime2LanguageId[mime];
				if (modeId === theModeId) {
					return mime;
				}
			}
		}

		return null;
	}

	public extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIdsOrName: string): string[] {
		if (!commaSeparatedMimetypesOrCommaSeparatedIdsOrName) {
			return [];
		}

		return (
			commaSeparatedMimetypesOrCommaSeparatedIdsOrName.
				split(',').
				map((mimeTypeOrIdOrName) => mimeTypeOrIdOrName.trim()).
				map((mimeTypeOrIdOrName) => {
					return this.mime2LanguageId[mimeTypeOrIdOrName] || mimeTypeOrIdOrName;
				}).
				filter((modeId) => {
					return this.knownModeIds[modeId];
				})
		);
	}

	public getModeIdsFromLanguageName(languageName: string): string[]{
		if (!languageName) {
			return [];
		}

		if (hasOwnProperty.call(this.name2LanguageId, languageName)) {
			return [this.name2LanguageId[languageName]];
		}

		return [];
	}

	public getModeIdsFromFilenameOrFirstLine(filename: string, firstLine?:string): string[] {
		if (!filename && !firstLine) {
			return [];
		}
		var mimeTypes = Mime.guessMimeTypes(filename, firstLine);
		return this.extractModeIds(mimeTypes.join(','));
	}

	public getCompatMode(modeId: string): ICompatModeDescriptor {
		return this.compatModes[modeId] || null;
	}

	public getExtensions(languageName: string): string[] {
		return this.name2Extensions[languageName];
	}
}

// Create the handler, register it as a thread synchronizable object and as an ext point listener
var _instance = new LanguageExtensionPointHandler();
registerThreadSynchronizableObject(_instance);

languagesExtPoint.setHandler((extensions) => {
	_instance._handleLanguagesExtensionPointUsers(extensions);
});

// Export only a subset of the handler
export var LanguageExtensions:ILanguageExtensionPointHandler = _instance;
