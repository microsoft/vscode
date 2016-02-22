/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import * as mime from 'vs/base/common/mime';
import * as strings from 'vs/base/common/strings';
import {ILegacyLanguageDefinition, ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';

var hasOwnProperty = Object.prototype.hasOwnProperty;

export interface ICompatModeDescriptor {
	moduleId: string;
	ctorName: string;
}

export class LanguagesRegistry {

	private knownModeIds: { [id: string]: boolean; };
	private mime2LanguageId: { [mimeType: string]: string; };
	private name2LanguageId: { [name: string]: string; };
	private name2Extensions: { [name: string]: string[]; };
	private id2Name: { [id: string]: string; };
	private compatModes: { [id: string]: ICompatModeDescriptor; };
	private lowerName2Id: { [name: string]: string; };
	private id2ConfigurationFiles: { [id:string]: string[]; };

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	constructor() {
		this.knownModeIds = {};
		this.mime2LanguageId = {};
		this.name2LanguageId = {};
		this.id2Name = {};
		this.name2Extensions = {};
		this.compatModes = {};
		this.lowerName2Id = {};
		this.id2ConfigurationFiles = {};

		this._registerCompatModes(ModesRegistry.getCompatModes());
		ModesRegistry.onDidAddCompatModes((m) => this._registerCompatModes(m));

		this._registerLanguages(ModesRegistry.getLanguages());
		ModesRegistry.onDidAddLanguages((m) => this._registerLanguages(m));
	}

	private _registerCompatModes(defs:ILegacyLanguageDefinition[]): void {
		let addedModes: string[] = [];
		for (let i = 0; i < defs.length; i++) {
			let def = defs[i];

			this._registerLanguage({
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

			addedModes.push(def.id);
		}
		this._onDidAddModes.fire(addedModes);
	}

	private _registerLanguages(desc:ILanguageExtensionPoint[]): void {
		let addedModes: string[] = [];
		for (let i = 0; i < desc.length; i++) {
			this._registerLanguage(desc[i]);
			addedModes.push(desc[i].id);
		}
		this._onDidAddModes.fire(addedModes);
	}

	private _registerLanguage(lang: ILanguageExtensionPoint): void {
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
				mime.registerTextMimeByFilename(extension, primaryMime);
			}
		}

		if (Array.isArray(lang.filenames)) {
			for (let filename of lang.filenames) {
				mime.registerTextMimeByFilename(filename, primaryMime);
			}
		}

		if (Array.isArray(lang.filenamePatterns)) {
			for (let filenamePattern of lang.filenamePatterns) {
				mime.registerTextMimeByFilename(filenamePattern, primaryMime);
			}
		}

		if (typeof lang.firstLine === 'string' && lang.firstLine.length > 0) {
			var firstLineRegexStr = lang.firstLine;
			if (firstLineRegexStr.charAt(0) !== '^') {
				firstLineRegexStr = '^' + firstLineRegexStr;
			}
			try {
				var firstLineRegex = new RegExp(firstLineRegexStr);
				if (!strings.regExpLeadsToEndlessLoop(firstLineRegex)) {
					mime.registerTextMimeByFirstLine(firstLineRegex, primaryMime);
				}
			} catch (err) {
				// Most likely, the regex was bad
				onUnexpectedError(err);
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
		for (var _mime in this.mime2LanguageId) {
			if (this.mime2LanguageId.hasOwnProperty(_mime)) {
				var modeId = this.mime2LanguageId[_mime];
				if (modeId === theModeId) {
					return _mime;
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
		var mimeTypes = mime.guessMimeTypes(filename, firstLine);
		return this.extractModeIds(mimeTypes.join(','));
	}

	public getCompatMode(modeId: string): ICompatModeDescriptor {
		return this.compatModes[modeId] || null;
	}

	public getExtensions(languageName: string): string[] {
		return this.name2Extensions[languageName];
	}
}
