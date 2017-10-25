/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, FontStyle, StandardTokenType, MetadataConsts, ColorId, LanguageId } from 'vs/editor/common/modes';
import { CharCode } from 'vs/base/common/charCode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Constants } from 'vs/editor/common/core/uint';

export interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
}

export interface ITokensAdjuster {
	adjust(toColumn: number, delta: number, minimumAllowedColumn: number): void;
	finish(delta: number, lineTextLength: number): void;
}

var NO_OP_TOKENS_ADJUSTER: ITokensAdjuster = {
	adjust: () => { },
	finish: () => { }
};

/**
 * Returns:
 *  - -1 => the line consists of whitespace
 *  - otherwise => the indent level is returned value
 */
export function computeIndentLevel(line: string, tabSize: number): number {
	let indent = 0;
	let i = 0;
	let len = line.length;

	while (i < len) {
		let chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			indent++;
		} else if (chCode === CharCode.Tab) {
			indent = indent - indent % tabSize + tabSize;
		} else {
			break;
		}
		i++;
	}

	if (i === len) {
		return -1; // line only consists of whitespace
	}

	return indent;
}

export interface IModelLine {
	readonly text: string;

	// --- tokenization
	resetTokenizationState(): void;
	isInvalid(): boolean;
	setIsInvalid(isInvalid: boolean): void;
	getState(): IState;
	setState(state: IState): void;
	getTokens(topLevelLanguageId: LanguageId): LineTokens;
	setTokens(topLevelLanguageId: LanguageId, tokens: Uint32Array): void;

	// --- editing
	applyEdits(edits: ILineEdit[]): number;
	append(other: IModelLine): void;
	split(splitColumn: number): IModelLine;
}

export abstract class AbstractModelLine {

	constructor() {
	}

	///

	public abstract get text(): string;
	protected abstract _setText(text: string): void;
	protected abstract _createTokensAdjuster(): ITokensAdjuster;
	protected abstract _createModelLine(text: string): IModelLine;

	///

	public applyEdits(edits: ILineEdit[]): number {
		let deltaColumn = 0;
		let resultText = this.text;

		let tokensAdjuster = this._createTokensAdjuster();

		for (let i = 0, len = edits.length; i < len; i++) {
			let edit = edits[i];

			// console.log();
			// console.log('=============================');
			// console.log('EDIT #' + i + ' [ ' + edit.startColumn + ' -> ' + edit.endColumn + ' ] : <<<' + edit.text + '>>>');
			// console.log('deltaColumn: ' + deltaColumn);

			let startColumn = deltaColumn + edit.startColumn;
			let endColumn = deltaColumn + edit.endColumn;
			let deletingCnt = endColumn - startColumn;
			let insertingCnt = edit.text.length;

			// Adjust tokens before this edit
			// console.log('Adjust tokens before this edit');
			tokensAdjuster.adjust(edit.startColumn - 1, deltaColumn, 1);

			// Adjust tokens for the common part of this edit
			let commonLength = Math.min(deletingCnt, insertingCnt);
			if (commonLength > 0) {
				// console.log('Adjust tokens for the common part of this edit');
				tokensAdjuster.adjust(edit.startColumn - 1 + commonLength, deltaColumn, startColumn);
			}

			// Perform the edit & update `deltaColumn`
			resultText = resultText.substring(0, startColumn - 1) + edit.text + resultText.substring(endColumn - 1);
			deltaColumn += insertingCnt - deletingCnt;

			// Adjust tokens inside this edit
			// console.log('Adjust tokens inside this edit');
			tokensAdjuster.adjust(edit.endColumn, deltaColumn, startColumn);
		}

		// Wrap up tokens; adjust remaining if needed
		tokensAdjuster.finish(deltaColumn, resultText.length);

		// Save the resulting text
		this._setText(resultText);

		return deltaColumn;
	}

	public split(splitColumn: number): IModelLine {
		const myText = this.text.substring(0, splitColumn - 1);
		const otherText = this.text.substring(splitColumn - 1);

		this._setText(myText);
		return this._createModelLine(otherText);
	}

	public append(other: IModelLine): void {
		this._setText(this.text + other.text);
	}
}

export class ModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	private _isInvalid: boolean;

	public isInvalid(): boolean {
		return this._isInvalid;
	}

	public setIsInvalid(isInvalid: boolean): void {
		this._isInvalid = isInvalid;
	}

	private _state: IState;
	private _lineTokens: ArrayBuffer;

	constructor(text: string) {
		super();
		this._isInvalid = false;
		this._setText(text);
		this._state = null;
		this._lineTokens = null;
	}

	protected _createModelLine(text: string): IModelLine {
		return new ModelLine(text);
	}

	public split(splitColumn: number): IModelLine {
		let result = super.split(splitColumn);

		// Mark overflowing tokens for deletion & delete marked tokens
		this._deleteMarkedTokens(this._markOverflowingTokensForDeletion(0, this.text.length));

		return result;
	}

	public append(other: IModelLine): void {
		let thisTextLength = this.text.length;

		super.append(other);

		if (other instanceof ModelLine) {
			let otherRawTokens = other._lineTokens;
			if (otherRawTokens) {
				// Other has real tokens

				let otherTokens = new Uint32Array(otherRawTokens);

				// Adjust other tokens
				if (thisTextLength > 0) {
					for (let i = 0, len = (otherTokens.length >>> 1); i < len; i++) {
						otherTokens[(i << 1)] = otherTokens[(i << 1)] + thisTextLength;
					}
				}

				// Append other tokens
				let myRawTokens = this._lineTokens;
				if (myRawTokens) {
					// I have real tokens
					let myTokens = new Uint32Array(myRawTokens);
					let result = new Uint32Array(myTokens.length + otherTokens.length);
					result.set(myTokens, 0);
					result.set(otherTokens, myTokens.length);
					this._lineTokens = result.buffer;
				} else {
					// I don't have real tokens
					this._lineTokens = otherTokens.buffer;
				}
			}
		}
	}

	// --- BEGIN STATE

	public resetTokenizationState(): void {
		this._state = null;
		this._lineTokens = null;
	}

	public setState(state: IState): void {
		this._state = state;
	}

	public getState(): IState {
		return this._state || null;
	}

	// --- END STATE

	// --- BEGIN TOKENS

	public setTokens(topLevelLanguageId: LanguageId, tokens: Uint32Array): void {
		if (!tokens || tokens.length === 0) {
			this._lineTokens = null;
			return;
		}
		if (tokens.length === 2) {
			// there is one token
			if (tokens[0] === 0 && tokens[1] === getDefaultMetadata(topLevelLanguageId)) {
				this._lineTokens = null;
				return;
			}
		}
		this._lineTokens = tokens.buffer;
	}

	public getTokens(topLevelLanguageId: LanguageId): LineTokens {
		let rawLineTokens = this._lineTokens;
		if (rawLineTokens) {
			return new LineTokens(new Uint32Array(rawLineTokens), this._text);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = 0;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, this._text);
	}

	// --- END TOKENS

	protected _createTokensAdjuster(): ITokensAdjuster {
		if (!this._lineTokens) {
			// This line does not have real tokens, so there is nothing to adjust
			return NO_OP_TOKENS_ADJUSTER;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);
		let tokenIndex = 0;
		let tokenStartOffset = 0;
		let removeTokensCount = 0;

		let adjust = (toColumn: number, delta: number, minimumAllowedColumn: number) => {
			// console.log(`------------------------------------------------------------------`);
			// console.log(`before call: tokenIndex: ${tokenIndex}: ${lineTokens}`);
			// console.log(`adjustTokens: ${toColumn} with delta: ${delta} and [${minimumAllowedColumn}]`);
			// console.log(`tokenStartOffset: ${tokenStartOffset}`);
			let minimumAllowedIndex = minimumAllowedColumn - 1;

			while (tokenStartOffset < toColumn && tokenIndex < tokensLength) {

				if (tokenStartOffset > 0 && delta !== 0) {
					// adjust token's `startIndex` by `delta`
					let newTokenStartOffset = Math.max(minimumAllowedIndex, tokenStartOffset + delta);
					lineTokens[(tokenIndex << 1)] = newTokenStartOffset;

					// console.log(` * adjusted token start offset for token at ${tokenIndex}: ${newTokenStartOffset}`);

					if (delta < 0) {
						let tmpTokenIndex = tokenIndex;
						while (tmpTokenIndex > 0) {
							let prevTokenStartOffset = lineTokens[((tmpTokenIndex - 1) << 1)];
							if (prevTokenStartOffset >= newTokenStartOffset) {
								if (prevTokenStartOffset !== Constants.MAX_UINT_32) {
									// console.log(` * marking for deletion token at ${tmpTokenIndex - 1}`);
									lineTokens[((tmpTokenIndex - 1) << 1)] = Constants.MAX_UINT_32;
									removeTokensCount++;
								}
								tmpTokenIndex--;
							} else {
								break;
							}
						}
					}
				}

				tokenIndex++;
				if (tokenIndex < tokensLength) {
					tokenStartOffset = lineTokens[(tokenIndex << 1)];
				}
			}
			// console.log(`after call: tokenIndex: ${tokenIndex}: ${lineTokens}`);
		};

		let finish = (delta: number, lineTextLength: number) => {
			adjust(Constants.MAX_SAFE_SMALL_INTEGER, delta, 1);

			// Mark overflowing tokens for deletion & delete marked tokens
			this._deleteMarkedTokens(this._markOverflowingTokensForDeletion(removeTokensCount, lineTextLength));
		};

		return {
			adjust: adjust,
			finish: finish
		};
	}

	private _markOverflowingTokensForDeletion(removeTokensCount: number, lineTextLength: number): number {
		if (!this._lineTokens) {
			return removeTokensCount;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);

		if (removeTokensCount + 1 === tokensLength) {
			// no more removing, cannot end up without any tokens for mode transition reasons
			return removeTokensCount;
		}

		for (let tokenIndex = tokensLength - 1; tokenIndex > 0; tokenIndex--) {
			let tokenStartOffset = lineTokens[(tokenIndex << 1)];
			if (tokenStartOffset < lineTextLength) {
				// valid token => stop iterating
				return removeTokensCount;
			}

			// this token now overflows the text => mark it for removal
			if (tokenStartOffset !== Constants.MAX_UINT_32) {
				// console.log(` * marking for deletion token at ${tokenIndex}`);
				lineTokens[(tokenIndex << 1)] = Constants.MAX_UINT_32;
				removeTokensCount++;

				if (removeTokensCount + 1 === tokensLength) {
					// no more removing, cannot end up without any tokens for mode transition reasons
					return removeTokensCount;
				}
			}
		}

		return removeTokensCount;
	}

	private _deleteMarkedTokens(removeTokensCount: number): void {
		if (removeTokensCount === 0) {
			return;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);
		let newTokens = new Uint32Array(((tokensLength - removeTokensCount) << 1)), newTokenIdx = 0;
		for (let i = 0; i < tokensLength; i++) {
			let startOffset = lineTokens[(i << 1)];
			if (startOffset === Constants.MAX_UINT_32) {
				// marked for deletion
				continue;
			}
			let metadata = lineTokens[(i << 1) + 1];
			newTokens[newTokenIdx++] = startOffset;
			newTokens[newTokenIdx++] = metadata;
		}
		this._lineTokens = newTokens.buffer;
	}

	protected _setText(text: string): void {
		this._text = text;
	}

}

/**
 * A model line that cannot store any tokenization state.
 * It has no fields except the text.
 */
export class MinimalModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	public isInvalid(): boolean {
		return false;
	}

	public setIsInvalid(isInvalid: boolean): void {
	}

	constructor(text: string) {
		super();
		this._setText(text);
	}

	protected _createModelLine(text: string): IModelLine {
		return new MinimalModelLine(text);
	}

	public split(splitColumn: number): IModelLine {
		return super.split(splitColumn);
	}

	public append(other: IModelLine): void {
		super.append(other);
	}

	// --- BEGIN STATE

	public resetTokenizationState(): void {
	}

	public setState(state: IState): void {
	}

	public getState(): IState {
		return null;
	}

	// --- END STATE

	// --- BEGIN TOKENS

	public setTokens(topLevelLanguageId: LanguageId, tokens: Uint32Array): void {
	}

	public getTokens(topLevelLanguageId: LanguageId): LineTokens {
		let lineTokens = new Uint32Array(2);
		lineTokens[0] = 0;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, this._text);
	}

	// --- END TOKENS

	protected _createTokensAdjuster(): ITokensAdjuster {
		// This line does not have real tokens, so there is nothing to adjust
		return NO_OP_TOKENS_ADJUSTER;
	}

	protected _setText(text: string): void {
		this._text = text;
	}
}

function getDefaultMetadata(topLevelLanguageId: LanguageId): number {
	return (
		(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;
}
