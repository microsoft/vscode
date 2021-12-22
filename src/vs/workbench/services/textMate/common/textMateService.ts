/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITextMateService = createDecorator<ITextMateService>('textMateService');

export interface ITextMateService {
	readonly _serviceBrand: undefined;

	onDidEncounterLanguage: Event<string>;

	createGrammar(languageId: string): Promise<IGrammar | null>;

	startDebugMode(printFn: (str: string) => void, onStop: () => void): void;
}

// -------------- Types copied from vscode-textmate due to usage in /common/

/**
 * A grammar
 */
export interface IGrammar {
	/**
	 * Tokenize `lineText` using previous line state `prevState`.
	 */
	tokenizeLine(lineText: string, prevState: StackElement | null, timeLimit?: number): ITokenizeLineResult;
	/**
	 * Tokenize `lineText` using previous line state `prevState`.
	 * The result contains the tokens in binary format, resolved with the following information:
	 *  - language
	 *  - token type (regex, string, comment, other)
	 *  - font style
	 *  - foreground color
	 *  - background color
	 * e.g. for getting the languageId: `(metadata & MetadataConsts.LANGUAGEID_MASK) >>> MetadataConsts.LANGUAGEID_OFFSET`
	 */
	tokenizeLine2(lineText: string, prevState: StackElement | null, timeLimit?: number): ITokenizeLineResult2;
}
export interface ITokenizeLineResult {
	readonly tokens: IToken[];
	/**
	 * The `prevState` to be passed on to the next line tokenization.
	 */
	readonly ruleStack: StackElement;
	/**
	 * Did tokenization stop early due to reaching the time limit.
	 */
	readonly stoppedEarly: boolean;
}
export interface ITokenizeLineResult2 {
	/**
	 * The tokens in binary format. Each token occupies two array indices. For token i:
	 *  - at offset 2*i => startIndex
	 *  - at offset 2*i + 1 => metadata
	 *
	 */
	readonly tokens: Uint32Array;
	/**
	 * The `prevState` to be passed on to the next line tokenization.
	 */
	readonly ruleStack: StackElement;
	/**
	 * Did tokenization stop early due to reaching the time limit.
	 */
	readonly stoppedEarly: boolean;
}
export interface IToken {
	startIndex: number;
	readonly endIndex: number;
	readonly scopes: string[];
}
/**
 * **IMPORTANT** - Immutable!
 */
export interface StackElement {
	_stackElementBrand: void;
	readonly depth: number;
	clone(): StackElement;
	equals(other: StackElement): boolean;
}
// -------------- End Types "liberated" from vscode-textmate due to usage in /common/
