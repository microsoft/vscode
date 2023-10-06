/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { compareIgnoreCase, regExpLeadsToEndlessLoop } from 'vs/base/common/strings';
import { clearPlatformLanguageAssociations, getLanguageIds, registerPlatformLanguageAssociation } from 'vs/editor/common/services/languagesAssociations';
import { URI } from 'vs/base/common/uri';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { ModesRegistry, PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ILanguageExtensionPoint, ILanguageNameIdPair, ILanguageIcon } from 'vs/editor/common/languages/language';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

const hasOwnProperty = Object.prototype.hasOwnProperty;
const NULL_LANGUAGE_ID = 'vs.editor.nullLanguage';

interface IResolvedLanguage {
	identifier: string;
	name: string | null;
	mimetypes: string[];
	aliases: string[];
	extensions: string[];
	filenames: string[];
	configurationFiles: URI[];
	icons: ILanguageIcon[];
}

export class LanguageIdCodec implements ILanguageIdCodec {

	private _nextLanguageId: number;
	private readonly _languageIdToLanguage: string[] = [];
	private readonly _languageToLanguageId = new Map<string, number>();

	constructor() {
		this._register(NULL_LANGUAGE_ID, LanguageId.Null);
		this._register(PLAINTEXT_LANGUAGE_ID, LanguageId.PlainText);
		this._nextLanguageId = 2;
	}

	private _register(language: string, languageId: LanguageId): void {
		this._languageIdToLanguage[languageId] = language;
		this._languageToLanguageId.set(language, languageId);
	}

	public register(language: string): void {
		if (this._languageToLanguageId.has(language)) {
			return;
		}
		const languageId = this._nextLanguageId++;
		this._register(language, languageId);
	}

	public encodeLanguageId(languageId: string): LanguageId {
		return this._languageToLanguageId.get(languageId) || LanguageId.Null;
	}

	public decodeLanguageId(languageId: LanguageId): string {
		return this._languageIdToLanguage[languageId] || NULL_LANGUAGE_ID;
	}
}

export class LanguagesRegistry extends Disposable {

	static instanceCount = 0;

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _warnOnOverwrite: boolean;
	public readonly languageIdCodec: LanguageIdCodec;
	private _dynamicLanguages: ILanguageExtensionPoint[];
	private _languages: { [id: string]: IResolvedLanguage };
	private _mimeTypesMap: { [mimeType: string]: string };
	private _nameMap: { [name: string]: string };
	private _lowercaseNameMap: { [name: string]: string };

	constructor(useModesRegistry = true, warnOnOverwrite = false) {
		super();
		LanguagesRegistry.instanceCount++;

		this._warnOnOverwrite = warnOnOverwrite;
		this.languageIdCodec = new LanguageIdCodec();
		this._dynamicLanguages = [];
		this._languages = {};
		this._mimeTypesMap = {};
		this._nameMap = {};
		this._lowercaseNameMap = {};

		if (useModesRegistry) {
			this._initializeFromRegistry();
			this._register(ModesRegistry.onDidChangeLanguages((m) => {
				this._initializeFromRegistry();
			}));
		}
	}

	override dispose() {
		LanguagesRegistry.instanceCount--;
		super.dispose();
	}

	public setDynamicLanguages(def: ILanguageExtensionPoint[]): void {
		this._dynamicLanguages = def;
		this._initializeFromRegistry();
	}

	private _initializeFromRegistry(): void {
		this._languages = {};
		this._mimeTypesMap = {};
		this._nameMap = {};
		this._lowercaseNameMap = {};

		clearPlatformLanguageAssociations();
		const desc = (<ILanguageExtensionPoint[]>[]).concat(ModesRegistry.getLanguages()).concat(this._dynamicLanguages);
		this._registerLanguages(desc);
	}

	registerLanguage(desc: ILanguageExtensionPoint): IDisposable {
		return ModesRegistry.registerLanguage(desc);
	}

	_registerLanguages(desc: ILanguageExtensionPoint[]): void {

		for (const d of desc) {
			this._registerLanguage(d);
		}

		// Rebuild fast path maps
		this._mimeTypesMap = {};
		this._nameMap = {};
		this._lowercaseNameMap = {};
		Object.keys(this._languages).forEach((langId) => {
			const language = this._languages[langId];
			if (language.name) {
				this._nameMap[language.name] = language.identifier;
			}
			language.aliases.forEach((alias) => {
				this._lowercaseNameMap[alias.toLowerCase()] = language.identifier;
			});
			language.mimetypes.forEach((mimetype) => {
				this._mimeTypesMap[mimetype] = language.identifier;
			});
		});

		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerOverrideIdentifiers(this.getRegisteredLanguageIds());

		this._onDidChange.fire();
	}

	private _registerLanguage(lang: ILanguageExtensionPoint): void {
		const langId = lang.id;

		let resolvedLanguage: IResolvedLanguage;
		if (hasOwnProperty.call(this._languages, langId)) {
			resolvedLanguage = this._languages[langId];
		} else {
			this.languageIdCodec.register(langId);
			resolvedLanguage = {
				identifier: langId,
				name: null,
				mimetypes: [],
				aliases: [],
				extensions: [],
				filenames: [],
				configurationFiles: [],
				icons: []
			};
			this._languages[langId] = resolvedLanguage;
		}

		this._mergeLanguage(resolvedLanguage, lang);
	}

	private _mergeLanguage(resolvedLanguage: IResolvedLanguage, lang: ILanguageExtensionPoint): void {
		const langId = lang.id;

		let primaryMime: string | null = null;

		if (Array.isArray(lang.mimetypes) && lang.mimetypes.length > 0) {
			resolvedLanguage.mimetypes.push(...lang.mimetypes);
			primaryMime = lang.mimetypes[0];
		}

		if (!primaryMime) {
			primaryMime = `text/x-${langId}`;
			resolvedLanguage.mimetypes.push(primaryMime);
		}

		if (Array.isArray(lang.extensions)) {
			if (lang.configuration) {
				// insert first as this appears to be the 'primary' language definition
				resolvedLanguage.extensions = lang.extensions.concat(resolvedLanguage.extensions);
			} else {
				resolvedLanguage.extensions = resolvedLanguage.extensions.concat(lang.extensions);
			}
			for (const extension of lang.extensions) {
				registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, extension: extension }, this._warnOnOverwrite);
			}
		}

		if (Array.isArray(lang.filenames)) {
			for (const filename of lang.filenames) {
				registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, filename: filename }, this._warnOnOverwrite);
				resolvedLanguage.filenames.push(filename);
			}
		}

		if (Array.isArray(lang.filenamePatterns)) {
			for (const filenamePattern of lang.filenamePatterns) {
				registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, filepattern: filenamePattern }, this._warnOnOverwrite);
			}
		}

		if (typeof lang.firstLine === 'string' && lang.firstLine.length > 0) {
			let firstLineRegexStr = lang.firstLine;
			if (firstLineRegexStr.charAt(0) !== '^') {
				firstLineRegexStr = '^' + firstLineRegexStr;
			}
			try {
				const firstLineRegex = new RegExp(firstLineRegexStr);
				if (!regExpLeadsToEndlessLoop(firstLineRegex)) {
					registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, firstline: firstLineRegex }, this._warnOnOverwrite);
				}
			} catch (err) {
				// Most likely, the regex was bad
				console.warn(`[${lang.id}]: Invalid regular expression \`${firstLineRegexStr}\`: `, err);
			}
		}

		resolvedLanguage.aliases.push(langId);

		let langAliases: Array<string | null> | null = null;
		if (typeof lang.aliases !== 'undefined' && Array.isArray(lang.aliases)) {
			if (lang.aliases.length === 0) {
				// signal that this language should not get a name
				langAliases = [null];
			} else {
				langAliases = lang.aliases;
			}
		}

		if (langAliases !== null) {
			for (const langAlias of langAliases) {
				if (!langAlias || langAlias.length === 0) {
					continue;
				}
				resolvedLanguage.aliases.push(langAlias);
			}
		}

		const containsAliases = (langAliases !== null && langAliases.length > 0);
		if (containsAliases && langAliases![0] === null) {
			// signal that this language should not get a name
		} else {
			const bestName = (containsAliases ? langAliases![0] : null) || langId;
			if (containsAliases || !resolvedLanguage.name) {
				resolvedLanguage.name = bestName;
			}
		}

		if (lang.configuration) {
			resolvedLanguage.configurationFiles.push(lang.configuration);
		}

		if (lang.icon) {
			resolvedLanguage.icons.push(lang.icon);
		}
	}

	public isRegisteredLanguageId(languageId: string | null | undefined): boolean {
		if (!languageId) {
			return false;
		}
		return hasOwnProperty.call(this._languages, languageId);
	}

	public getRegisteredLanguageIds(): string[] {
		return Object.keys(this._languages);
	}

	public getSortedRegisteredLanguageNames(): ILanguageNameIdPair[] {
		const result: ILanguageNameIdPair[] = [];
		for (const languageName in this._nameMap) {
			if (hasOwnProperty.call(this._nameMap, languageName)) {
				result.push({
					languageName: languageName,
					languageId: this._nameMap[languageName]
				});
			}
		}
		result.sort((a, b) => compareIgnoreCase(a.languageName, b.languageName));
		return result;
	}

	public getLanguageName(languageId: string): string | null {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return null;
		}
		return this._languages[languageId].name;
	}

	public getMimeType(languageId: string): string | null {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return null;
		}
		const language = this._languages[languageId];
		return (language.mimetypes[0] || null);
	}

	public getExtensions(languageId: string): ReadonlyArray<string> {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return [];
		}
		return this._languages[languageId].extensions;
	}

	public getFilenames(languageId: string): ReadonlyArray<string> {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return [];
		}
		return this._languages[languageId].filenames;
	}

	public getIcon(languageId: string): ILanguageIcon | null {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return null;
		}
		const language = this._languages[languageId];
		return (language.icons[0] || null);
	}

	public getConfigurationFiles(languageId: string): ReadonlyArray<URI> {
		if (!hasOwnProperty.call(this._languages, languageId)) {
			return [];
		}
		return this._languages[languageId].configurationFiles || [];
	}

	public getLanguageIdByLanguageName(languageName: string): string | null {
		const languageNameLower = languageName.toLowerCase();
		if (!hasOwnProperty.call(this._lowercaseNameMap, languageNameLower)) {
			return null;
		}
		return this._lowercaseNameMap[languageNameLower];
	}

	public getLanguageIdByMimeType(mimeType: string | null | undefined): string | null {
		if (!mimeType) {
			return null;
		}
		if (hasOwnProperty.call(this._mimeTypesMap, mimeType)) {
			return this._mimeTypesMap[mimeType];
		}
		return null;
	}

	public guessLanguageIdByFilepathOrFirstLine(resource: URI | null, firstLine?: string): string[] {
		if (!resource && !firstLine) {
			return [];
		}
		return getLanguageIds(resource, firstLine);
	}
}
