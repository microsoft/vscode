/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import * as mime from 'vs/base/common/mime';
import * as strings from 'vs/base/common/strings';
import { Registry } from 'vs/platform/platform';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { ILanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { NULL_MODE_ID, NULL_LANGUAGE_IDENTIFIER } from 'vs/editor/common/modes/nullMode';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

var hasOwnProperty = Object.prototype.hasOwnProperty;

export interface IResolvedLanguage {
	id: LanguageId;
	name: string;
	mimetypes: string[];
	aliases: string[];
	extensions: string[];
	filenames: string[];
	configurationFiles: string[];
}

export class LanguagesRegistry {

	private _nextLanguageId: number;
	private _languages: { [id: string]: IResolvedLanguage; };

	private mime2LanguageId: { [mimeType: string]: string; };
	private name2LanguageId: { [name: string]: string; };
	private lowerName2Id: { [name: string]: string; };
	private languageIds: string[];

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	constructor(useModesRegistry = true) {
		this._nextLanguageId = 1;
		this._languages = {};
		this.mime2LanguageId = {};
		this.name2LanguageId = {};
		this.lowerName2Id = {};
		this.languageIds = [];

		if (useModesRegistry) {
			this._registerLanguages(ModesRegistry.getLanguages());
			ModesRegistry.onDidAddLanguages((m) => this._registerLanguages(m));
		}
	}

	_registerLanguages(desc: ILanguageExtensionPoint[]): void {
		if (desc.length === 0) {
			return;
		}

		let addedModes: string[] = [];
		for (let i = 0; i < desc.length; i++) {
			this._registerLanguage(desc[i]);
			addedModes.push(desc[i].id);
		}

		// Rebuild fast path maps
		this.mime2LanguageId = {};
		this.name2LanguageId = {};
		this.lowerName2Id = {};
		Object.keys(this._languages).forEach((langId) => {
			let language = this._languages[langId];
			if (language.name) {
				this.name2LanguageId[language.name] = langId;
			}
			language.aliases.forEach((alias) => {
				this.lowerName2Id[alias.toLowerCase()] = langId;
			});
			language.mimetypes.forEach((mimetype) => {
				this.mime2LanguageId[mimetype] = langId;
			});
		});

		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerOverrideIdentifiers(ModesRegistry.getLanguages().map(language => language.id));
		this._onDidAddModes.fire(addedModes);
	}

	private _registerLanguage(lang: ILanguageExtensionPoint): void {
		const langId = lang.id;

		let resolvedLanguage: IResolvedLanguage = null;
		if (hasOwnProperty.call(this._languages, langId)) {
			resolvedLanguage = this._languages[langId];
		} else {
			let languageId = this._nextLanguageId++;
			resolvedLanguage = {
				id: languageId,
				name: null,
				mimetypes: [],
				aliases: [],
				extensions: [],
				filenames: [],
				configurationFiles: []
			};
			this.languageIds[languageId] = langId;
			this._languages[langId] = resolvedLanguage;
		}

		LanguagesRegistry._mergeLanguage(resolvedLanguage, lang);
	}

	private static _mergeLanguage(resolvedLanguage: IResolvedLanguage, lang: ILanguageExtensionPoint): void {
		const langId = lang.id;

		let primaryMime: string = null;

		if (typeof lang.mimetypes !== 'undefined' && Array.isArray(lang.mimetypes)) {
			for (let i = 0; i < lang.mimetypes.length; i++) {
				if (!primaryMime) {
					primaryMime = lang.mimetypes[i];
				}
				resolvedLanguage.mimetypes.push(lang.mimetypes[i]);
			}
		}

		if (!primaryMime) {
			primaryMime = `text/x-${langId}`;
			resolvedLanguage.mimetypes.push(primaryMime);
		}

		if (Array.isArray(lang.extensions)) {
			for (let extension of lang.extensions) {
				mime.registerTextMime({ id: langId, mime: primaryMime, extension: extension });
				resolvedLanguage.extensions.push(extension);
			}
		}

		if (Array.isArray(lang.filenames)) {
			for (let filename of lang.filenames) {
				mime.registerTextMime({ id: langId, mime: primaryMime, filename: filename });
				resolvedLanguage.filenames.push(filename);
			}
		}

		if (Array.isArray(lang.filenamePatterns)) {
			for (let filenamePattern of lang.filenamePatterns) {
				mime.registerTextMime({ id: langId, mime: primaryMime, filepattern: filenamePattern });
			}
		}

		if (typeof lang.firstLine === 'string' && lang.firstLine.length > 0) {
			let firstLineRegexStr = lang.firstLine;
			if (firstLineRegexStr.charAt(0) !== '^') {
				firstLineRegexStr = '^' + firstLineRegexStr;
			}
			try {
				let firstLineRegex = new RegExp(firstLineRegexStr);
				if (!strings.regExpLeadsToEndlessLoop(firstLineRegex)) {
					mime.registerTextMime({ id: langId, mime: primaryMime, firstline: firstLineRegex });
				}
			} catch (err) {
				// Most likely, the regex was bad
				onUnexpectedError(err);
			}
		}

		resolvedLanguage.aliases.push(langId);

		let langAliases: string[] = null;
		if (typeof lang.aliases !== 'undefined' && Array.isArray(lang.aliases)) {
			if (lang.aliases.length === 0) {
				// signal that this language should not get a name
				langAliases = [null];
			} else {
				langAliases = lang.aliases;
			}
		}

		if (langAliases !== null) {
			for (let i = 0; i < langAliases.length; i++) {
				if (!langAliases[i] || langAliases[i].length === 0) {
					continue;
				}
				resolvedLanguage.aliases.push(langAliases[i]);
			}
		}

		let containsAliases = (langAliases !== null && langAliases.length > 0);
		if (containsAliases && langAliases[0] === null) {
			// signal that this language should not get a name
		} else {
			let bestName = (containsAliases ? langAliases[0] : null) || langId;
			if (containsAliases || !resolvedLanguage.name) {
				resolvedLanguage.name = bestName;
			}
		}

		if (typeof lang.configuration === 'string') {
			resolvedLanguage.configurationFiles.push(lang.configuration);
		}
	}

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		// Is this a known mime type ?
		if (hasOwnProperty.call(this.mime2LanguageId, mimetypeOrModeId)) {
			return true;
		}
		// Is this a known mode id ?
		return hasOwnProperty.call(this._languages, mimetypeOrModeId);
	}

	public getRegisteredModes(): string[] {
		return Object.keys(this._languages);
	}

	public getRegisteredLanguageNames(): string[] {
		return Object.keys(this.name2LanguageId);
	}

	public getLanguageName(modeId: string): string {
		if (!hasOwnProperty.call(this._languages, modeId)) {
			return null;
		}
		return this._languages[modeId].name;
	}

	public getModeIdForLanguageNameLowercase(languageNameLower: string): string {
		return this.lowerName2Id[languageNameLower] || null;
	}

	public getConfigurationFiles(modeId: string): string[] {
		if (!hasOwnProperty.call(this._languages, modeId)) {
			return [];
		}
		return this._languages[modeId].configurationFiles || [];
	}

	public getMimeForMode(theModeId: string): string {
		let keys = Object.keys(this.mime2LanguageId);
		for (let i = 0, len = keys.length; i < len; i++) {
			let _mime = keys[i];
			let modeId = this.mime2LanguageId[_mime];
			if (modeId === theModeId) {
				return _mime;
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
					return hasOwnProperty.call(this._languages, modeId);
				})
		);
	}

	public getLanguageIdentifier(_modeId: string | LanguageId): LanguageIdentifier {
		if (_modeId === NULL_MODE_ID || _modeId === LanguageId.Null) {
			return NULL_LANGUAGE_IDENTIFIER;
		}

		let modeId: string;
		if (typeof _modeId === 'string') {
			modeId = _modeId;
		} else {
			modeId = this.languageIds[_modeId];
			if (!modeId) {
				return null;
			}
		}

		if (!hasOwnProperty.call(this._languages, modeId)) {
			return null;
		}
		return new LanguageIdentifier(modeId, this._languages[modeId].id);
	}

	public getModeIdsFromLanguageName(languageName: string): string[] {
		if (!languageName) {
			return [];
		}
		if (hasOwnProperty.call(this.name2LanguageId, languageName)) {
			return [this.name2LanguageId[languageName]];
		}
		return [];
	}

	public getModeIdsFromFilenameOrFirstLine(filename: string, firstLine?: string): string[] {
		if (!filename && !firstLine) {
			return [];
		}
		var mimeTypes = mime.guessMimeTypes(filename, firstLine);
		return this.extractModeIds(mimeTypes.join(','));
	}

	public getExtensions(languageName: string): string[] {
		let languageId = this.name2LanguageId[languageName];
		if (!languageId) {
			return [];
		}
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return [];
		}
		return this._languages[languageId].extensions;
	}

	public getFilenames(languageName: string): string[] {
		let languageId = this.name2LanguageId[languageName];
		if (!languageId) {
			return [];
		}
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return [];
		}
		return this._languages[languageId].filenames;
	}
}
