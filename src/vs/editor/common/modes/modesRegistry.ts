/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/platform';
import { ILanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LanguageIdentifier, LanguageId } from 'vs/editor/common/modes';

// Define extension point ids
export var Extensions = {
	ModesRegistry: 'editor.modesRegistry'
};

export class EditorModesRegistry {

	private _languages: ILanguageExtensionPoint[];

	private _onDidAddLanguages: Emitter<ILanguageExtensionPoint[]> = new Emitter<ILanguageExtensionPoint[]>();
	public onDidAddLanguages: Event<ILanguageExtensionPoint[]> = this._onDidAddLanguages.event;

	constructor() {
		this._languages = [];
	}

	// --- languages

	public registerLanguage(def: ILanguageExtensionPoint): void {
		this._languages.push(def);
		this._onDidAddLanguages.fire([def]);
	}
	public registerLanguages(def: ILanguageExtensionPoint[]): void {
		this._languages = this._languages.concat(def);
		this._onDidAddLanguages.fire(def);
	}
	public getLanguages(): ILanguageExtensionPoint[] {
		return this._languages.slice(0);
	}
}

export var ModesRegistry = new EditorModesRegistry();
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
