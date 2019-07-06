/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IEmbeddedLanguagesMap, TokenTypesContribution } from 'vs/workbench/services/textMate/common/TMGrammars';
import { Disposable } from 'vs/base/common/lifecycle';
import { StandardTokenType } from 'vs/editor/common/modes';

/**
 * A map from selectors to token types.
 */
export interface ITokenTypeMap {
	[selector: string]: StandardTokenType;
}

export class TMScopeRegistry extends Disposable {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: TMLanguageRegistration; };

	constructor() {
		super();
		this.reset();
	}

	public reset(): void {
		this._scopeNameToLanguageRegistration = Object.create(null);
	}

	public register(scopeName: string, grammarLocation: URI, embeddedLanguages?: IEmbeddedLanguagesMap, tokenTypes?: TokenTypesContribution): void {
		if (this._scopeNameToLanguageRegistration[scopeName]) {
			const existingRegistration = this._scopeNameToLanguageRegistration[scopeName];
			if (!resources.isEqual(existingRegistration.grammarLocation, grammarLocation)) {
				console.warn(
					`Overwriting grammar scope name to file mapping for scope ${scopeName}.\n` +
					`Old grammar file: ${existingRegistration.grammarLocation.toString()}.\n` +
					`New grammar file: ${grammarLocation.toString()}`
				);
			}
		}
		this._scopeNameToLanguageRegistration[scopeName] = new TMLanguageRegistration(scopeName, grammarLocation, embeddedLanguages, tokenTypes);
	}

	public getLanguageRegistration(scopeName: string): TMLanguageRegistration {
		return this._scopeNameToLanguageRegistration[scopeName] || null;
	}

	public getGrammarLocation(scopeName: string): URI | null {
		let data = this.getLanguageRegistration(scopeName);
		return data ? data.grammarLocation : null;
	}
}

export class TMLanguageRegistration {
	_topLevelScopeNameDataBrand: void;

	readonly scopeName: string;
	readonly grammarLocation: URI;
	readonly embeddedLanguages: IEmbeddedLanguagesMap;
	readonly tokenTypes: ITokenTypeMap;

	constructor(scopeName: string, grammarLocation: URI, embeddedLanguages: IEmbeddedLanguagesMap | undefined, tokenTypes: TokenTypesContribution | undefined) {
		this.scopeName = scopeName;
		this.grammarLocation = grammarLocation;

		// embeddedLanguages handling
		this.embeddedLanguages = Object.create(null);

		if (embeddedLanguages) {
			// If embeddedLanguages are configured, fill in `this._embeddedLanguages`
			let scopes = Object.keys(embeddedLanguages);
			for (let i = 0, len = scopes.length; i < len; i++) {
				let scope = scopes[i];
				let language = embeddedLanguages[scope];
				if (typeof language !== 'string') {
					// never hurts to be too careful
					continue;
				}
				this.embeddedLanguages[scope] = language;
			}
		}

		this.tokenTypes = Object.create(null);
		if (tokenTypes) {
			// If tokenTypes is configured, fill in `this._tokenTypes`
			const scopes = Object.keys(tokenTypes);
			for (const scope of scopes) {
				const tokenType = tokenTypes[scope];
				switch (tokenType) {
					case 'string':
						this.tokenTypes[scope] = StandardTokenType.String;
						break;
					case 'other':
						this.tokenTypes[scope] = StandardTokenType.Other;
						break;
					case 'comment':
						this.tokenTypes[scope] = StandardTokenType.Comment;
						break;
				}
			}
		}
	}
}
