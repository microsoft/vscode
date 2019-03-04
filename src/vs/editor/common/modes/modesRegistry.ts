/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ILanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { Registry } from 'vs/platform/registry/common/platform';

// Define extension point ids
export const Extensions = {
	ModesRegistry: 'editor.modesRegistry'
};

export class EditorModesRegistry {

	private _languages: ILanguageExtensionPoint[];
	private _dynamicLanguages: ILanguageExtensionPoint[];

	private readonly _onDidChangeLanguages = new Emitter<void>();
	public readonly onDidChangeLanguages: Event<void> = this._onDidChangeLanguages.event;

	constructor() {
		this._languages = [];
		this._dynamicLanguages = [];
	}

	// --- languages

	public registerLanguage(def: ILanguageExtensionPoint): void {
		this._languages.push(def);
		this._onDidChangeLanguages.fire(undefined);
	}
	public setDynamicLanguages(def: ILanguageExtensionPoint[]): void {
		this._dynamicLanguages = def;
		this._onDidChangeLanguages.fire(undefined);
	}
	public getLanguages(): ILanguageExtensionPoint[] {
		return (<ILanguageExtensionPoint[]>[]).concat(this._languages).concat(this._dynamicLanguages);
	}
}

export const ModesRegistry = new EditorModesRegistry();
Registry.add(Extensions.ModesRegistry, ModesRegistry);

export const PLAINTEXT_MODE_ID = 'plaintext';
export const PLAINTEXT_LANGUAGE_IDENTIFIER = new LanguageIdentifier(PLAINTEXT_MODE_ID, LanguageId.PlainText);

ModesRegistry.registerLanguage({
	id: PLAINTEXT_MODE_ID,
	extensions: ['.txt', '.gitignore'],
	aliases: [nls.localize('plainText.alias', "Plain Text"), 'text'],
	mimetypes: ['text/plain']
});
LanguageConfigurationRegistry.register(PLAINTEXT_LANGUAGE_IDENTIFIER, {
	brackets: [
		['(', ')'],
		['[', ']'],
		['{', '}'],
	]
});
