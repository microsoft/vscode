/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { LanguageId, StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';

export interface IValidGrammarDefinition {
	location: URI;
	language?: string;
	scopeName: string;
	embeddedLanguages: IValidEmbeddedLanguagesMap;
	tokenTypes: IValidTokenTypeMap;
	injectTo?: string[];
	balancedBracketSelectors: string[];
	unbalancedBracketSelectors: string[];
	sourceExtensionId?: string;
}

export interface IValidTokenTypeMap {
	[selector: string]: StandardTokenType;
}

export interface IValidEmbeddedLanguagesMap {
	[scopeName: string]: LanguageId;
}

export class TMScopeRegistry {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: IValidGrammarDefinition };

	constructor() {
		this._scopeNameToLanguageRegistration = Object.create(null);
	}

	public reset(): void {
		this._scopeNameToLanguageRegistration = Object.create(null);
	}

	public register(def: IValidGrammarDefinition): void {
		this._scopeNameToLanguageRegistration[def.scopeName] = def;
	}

	public getGrammarDefinition(scopeName: string): IValidGrammarDefinition | null {
		return this._scopeNameToLanguageRegistration[scopeName] || null;
	}
}
