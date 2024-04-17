/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IndentAction } from 'vs/editor/common/languages/languageConfiguration';
import { createScopedLineTokens } from 'vs/editor/common/languages/supports';
import { IndentConsts, IndentRulesSupport } from 'vs/editor/common/languages/supports/indentRules';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { getScopedLineTokens, ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { getStrippedLineForLineAndTokens, getStrippedScopedLineTextFor } from 'vs/editor/common/languages/enterAction';

export interface IVirtualModel {
	tokenization: {
		getLineTokens(lineNumber: number): LineTokens;
		getLanguageId(): string;
		getLanguageIdAtPosition(lineNumber: number, column: number): string;
	};
	getLineContent(lineNumber: number): string;
}

export interface IIndentConverter {
	shiftIndent(indentation: string): string;
	unshiftIndent(indentation: string): string;
	normalizeIndentation?(indentation: string): string;
}

/**
 * Get nearest preceding line which doesn't match unIndentPattern or contains all whitespace.
 * Result:
 * -1: run into the boundary of embedded languages
 * 0: every line above are invalid
 * else: nearest preceding line of the same language
 */
function getPrecedingValidLine(model: IVirtualModel, lineNumber: number, indentRulesSupport: IndentRulesSupport, tokenType: StandardTokenType | undefined = undefined) {
	console.log('getPrecedingValidLine');
	// If the current line only contains string, comemnts and regexes, then consider the preceding valid line without the doesLineContainOtherStandardTokenType check

	// If the line contains only regex, string or comment tokens, then ignore this line.
	const doesLineContainOtherStandardTokenType = (tokens: LineTokens) => {
		const numberOfTokens = tokens.getCount();
		let lineContainsOtherStandardTokenType = false;
		for (let i = 0; i < numberOfTokens; i++) {
			const tokenType = tokens.getStandardTokenType(i);
			const startOffset = tokens.getStartOffset(i);
			const endOffset = tokens.getEndOffset(i);
			const text = tokens.getLineContent().substring(startOffset, endOffset);
			console.log('text : ', text);
			console.log('tokenType : ', tokenType);

			if (tokenType === StandardTokenType.Other && text.trim() !== '') {
				lineContainsOtherStandardTokenType = true;
				break;
			}
		}
		return lineContainsOtherStandardTokenType;
	}

	console.log('tokenType : ', tokenType);
	console.log('lineNumber : ', lineNumber);
	const currentTokens = model.tokenization.getLineTokens(lineNumber);
	console.log('currentTokens : ', currentTokens);
	console.log('model.getLineContent(lineNumber) : ', model.getLineContent(lineNumber));

	const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
	if (lineNumber > 1) {
		let lastLineNumber: number;
		let resultLineNumber = -1;

		for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
			if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
				return resultLineNumber;
			}
			const text = model.getLineContent(lastLineNumber);
			const tokens = model.tokenization.getLineTokens(lastLineNumber);
			if (tokenType === StandardTokenType.Other) {
				const lineContainsOtherStandardTokenType = doesLineContainOtherStandardTokenType(tokens);
				if (indentRulesSupport.shouldIgnore(text) || /^\s+$/.test(text) || text === '' || !lineContainsOtherStandardTokenType) {
					resultLineNumber = lastLineNumber;
					continue;
				}
			} else {
				if (indentRulesSupport.shouldIgnore(text) || /^\s+$/.test(text) || text === '') {
					resultLineNumber = lastLineNumber;
					continue;
				}
			}
			return lastLineNumber;
		}
	}

	return -1;
}

/**
 * Get inherited indentation from above lines.
 * 1. Find the nearest preceding line which doesn't match unIndentedLinePattern.
 * 2. If this line matches indentNextLinePattern or increaseIndentPattern, it means that the indent level of `lineNumber` should be 1 greater than this line.
 * 3. If this line doesn't match any indent rules
 *   a. check whether the line above it matches indentNextLinePattern
 *   b. If not, the indent level of this line is the result
 *   c. If so, it means the indent of this line is *temporary*, go upward utill we find a line whose indent is not temporary (the same workflow a -> b -> c).
 * 4. Otherwise, we fail to get an inherited indent from aboves. Return null and we should not touch the indent of `lineNumber`
 *
 * This function only return the inherited indent based on above lines, it doesn't check whether current line should decrease or not.
 */
export function getInheritIndentForLine(
	autoIndent: EditorAutoIndentStrategy,
	model: IVirtualModel,
	lineNumber: number,
	honorIntentialIndent: boolean = true,
	languageConfigurationService: ILanguageConfigurationService,
	tokenType: StandardTokenType | undefined = undefined
): { indentation: string; action: IndentAction | null; line?: number } | null {

	console.log('getInheritedIndentForLine');
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	if (lineNumber <= 1) {
		return {
			indentation: '',
			action: null
		};
	}

	// Use no indent if this is the first non-blank line
	for (let priorLineNumber = lineNumber - 1; priorLineNumber > 0; priorLineNumber--) {
		if (model.getLineContent(priorLineNumber) !== '') {
			break;
		}
		if (priorLineNumber === 1) {
			return {
				indentation: '',
				action: null
			};
		}
	}

	const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, indentRulesSupport, tokenType);
	console.log('precedingUnignoredLine : ', precedingUnIgnoredLine);

	if (precedingUnIgnoredLine < 0) {
		return null;
	} else if (precedingUnIgnoredLine < 1) {
		return {
			indentation: '',
			action: null
		};
	}

	const precedingUnIgnoredLineContent = getStrippedLine(languageConfigurationService, model, precedingUnIgnoredLine);
	console.log('precedingUnIgnoredLineContent : ', precedingUnIgnoredLineContent);

	if (indentRulesSupport.shouldIncrease(precedingUnIgnoredLineContent) || indentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLineContent)) {
		return {
			indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
			action: IndentAction.Indent,
			line: precedingUnIgnoredLine
		};
	} else if (indentRulesSupport.shouldDecrease(precedingUnIgnoredLineContent)) {
		return {
			indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
			action: null,
			line: precedingUnIgnoredLine
		};
	} else {
		// precedingUnIgnoredLine can not be ignored.
		// it doesn't increase indent of following lines
		// it doesn't increase just next line
		// so current line is not affect by precedingUnIgnoredLine
		// and then we should get a correct inheritted indentation from above lines
		if (precedingUnIgnoredLine === 1) {
			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
				action: null,
				line: precedingUnIgnoredLine
			};
		}

		const previousLine = precedingUnIgnoredLine - 1;

		const previousLineIndentMetadata = indentRulesSupport.getIndentMetadata(model.getLineContent(previousLine));
		if (!(previousLineIndentMetadata & (IndentConsts.INCREASE_MASK | IndentConsts.DECREASE_MASK)) &&
			(previousLineIndentMetadata & IndentConsts.INDENT_NEXTLINE_MASK)) {
			let stopLine = 0;
			for (let i = previousLine - 1; i > 0; i--) {
				const lineContent = getStrippedLine(languageConfigurationService, model, i);
				if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
					continue;
				}
				stopLine = i;
				break;
			}

			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
				action: null,
				line: stopLine + 1
			};
		}

		if (honorIntentialIndent) {
			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
				action: null,
				line: precedingUnIgnoredLine
			};
		} else {
			// search from precedingUnIgnoredLine until we find one whose indent is not temporary
			for (let i = precedingUnIgnoredLine; i > 0; i--) {
				const lineContent = getStrippedLine(languageConfigurationService, model, i);
				if (indentRulesSupport.shouldIncrease(lineContent)) {
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
						action: IndentAction.Indent,
						line: i
					};
				} else if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
					let stopLine = 0;
					for (let j = i - 1; j > 0; j--) {
						const lineContent = getStrippedLine(languageConfigurationService, model, i);
						if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
							continue;
						}
						stopLine = j;
						break;
					}

					const lineContent = getStrippedLine(languageConfigurationService, model, stopLine + 1);
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
						action: null,
						line: stopLine + 1
					};
				} else if (indentRulesSupport.shouldDecrease(lineContent)) {
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
						action: null,
						line: i
					};
				}
			}

			const lineContent = getStrippedLine(languageConfigurationService, model, 1);
			return {
				indentation: strings.getLeadingWhitespace(lineContent),
				action: null,
				line: 1
			};
		}
	}
}

export function getGoodIndentForLine(
	autoIndent: EditorAutoIndentStrategy,
	virtualModel: IVirtualModel,
	languageId: string,
	lineNumber: number,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	console.log('getGoodIndentForLine');
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
	if (!richEditSupport) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, undefined, languageConfigurationService);
	const lineContent = getStrippedLine(languageConfigurationService, virtualModel, lineNumber);

	if (indent) {
		const inheritLine = indent.line;
		if (inheritLine !== undefined) {
			// Apply enter action as long as there are only whitespace lines between inherited line and this line.
			let shouldApplyEnterRules = true;
			for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
				const lineContent = getStrippedLine(languageConfigurationService, virtualModel, inBetweenLine);
				if (!/^\s*$/.test(lineContent)) {
					shouldApplyEnterRules = false;
					break;
				}
			}
			if (shouldApplyEnterRules) {
				const inheritedLineContent = getStrippedLine(languageConfigurationService, virtualModel, inheritLine);
				const enterResult = richEditSupport.onEnter(autoIndent, '', inheritedLineContent, '');

				if (enterResult) {
					let indentation = strings.getLeadingWhitespace(inheritedLineContent);

					if (enterResult.removeText) {
						indentation = indentation.substring(0, indentation.length - enterResult.removeText);
					}

					if (
						(enterResult.indentAction === IndentAction.Indent) ||
						(enterResult.indentAction === IndentAction.IndentOutdent)
					) {
						indentation = indentConverter.shiftIndent(indentation);
					} else if (enterResult.indentAction === IndentAction.Outdent) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					if (indentRulesSupport.shouldDecrease(lineContent)) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					if (enterResult.appendText) {
						indentation += enterResult.appendText;
					}

					return strings.getLeadingWhitespace(indentation);
				}
			}
		}

		if (indentRulesSupport.shouldDecrease(lineContent)) {
			if (indent.action === IndentAction.Indent) {
				return indent.indentation;
			} else {
				return indentConverter.unshiftIndent(indent.indentation);
			}
		} else {
			if (indent.action === IndentAction.Indent) {
				return indentConverter.shiftIndent(indent.indentation);
			} else {
				return indent.indentation;
			}
		}
	}
	return null;
}

export function getIndentForEnter(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	range: Range,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): { beforeEnter: string; afterEnter: string } | null {
	console.log('getIndentForEnter');
	console.log('range : ', range);

	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}
	model.tokenization.forceTokenization(range.startLineNumber);
	const lineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);

	let embeddedLanguage = false;
	let beforeEnterText: string;
	if (scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId) {
		// we are in the embeded language content
		embeddedLanguage = true; // if embeddedLanguage is true, then we don't touch the indentation of current line
		// beforeEnterText = scopedLineText.substring(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		const columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
		beforeEnterText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, scopedLineTokens, { isStart: false, columnIndexWithinScope });
	} else {
		// beforeEnterText = lineTokens.getLineContent().substring(0, range.startColumn - 1);
		const columnIndexWithinScope = range.startColumn - 1;
		beforeEnterText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, lineTokens, { isStart: false, columnIndexWithinScope });
	}

	let afterEnterText: string;
	if (range.isEmpty()) {
		const columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
		afterEnterText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, scopedLineTokens, { isStart: true, columnIndexWithinScope });
	} else {
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		const columnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
		afterEnterText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, endScopedLineTokens, { isStart: true, columnIndexWithinScope });
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const beforeEnterResult = beforeEnterText;
	const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterText);

	const virtualModel: IVirtualModel = {
		tokenization: {
			getLineTokens: (lineNumber: number) => {
				return model.tokenization.getLineTokens(lineNumber);
			},
			getLanguageId: () => {
				return model.getLanguageId();
			},
			getLanguageIdAtPosition: (lineNumber: number, column: number) => {
				return model.getLanguageIdAtPosition(lineNumber, column);
			},
		},
		getLineContent: (lineNumber: number) => {
			if (lineNumber === range.startLineNumber) {
				return beforeEnterResult;
			} else {
				return model.getLineContent(lineNumber);
			}
		}
	};

	let tokenType: StandardTokenType;
	const currentLineIndent = strings.getLeadingWhitespace(lineTokens.getLineContent());
	const lineLength = model.getLineLength(range.endLineNumber);

	console.log('range.endColumn : ', range.endColumn);
	console.log('lineLength : ', lineLength);
	if (range.endColumn - 1 === lineLength) {
		const endLineNumberTokens = model.tokenization.getLineTokens(range.endLineNumber + 1);
		tokenType = endLineNumberTokens.getStandardTokenType(0);
	} else {
		const endLineNumberTokens = model.tokenization.getLineTokens(range.endLineNumber);
		const tokenIndexOfCursorEnd = endLineNumberTokens.findTokenIndexAtOffset(range.endColumn - 1);
		tokenType = endLineNumberTokens.getStandardTokenType(tokenIndexOfCursorEnd);
	}

	const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, undefined, languageConfigurationService, tokenType);
	if (!afterEnterAction) {
		const beforeEnter = embeddedLanguage ? currentLineIndent : beforeEnterIndent;
		return {
			beforeEnter: beforeEnter,
			afterEnter: beforeEnter
		};
	}

	let afterEnterIndent = embeddedLanguage ? currentLineIndent : afterEnterAction.indentation;

	if (afterEnterAction.action === IndentAction.Indent) {
		afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
	}

	if (indentRulesSupport.shouldDecrease(afterEnterText)) {
		afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
	}

	return {
		beforeEnter: embeddedLanguage ? currentLineIndent : beforeEnterIndent,
		afterEnter: afterEnterIndent
	};
}

/**
 * We should always allow intentional indentation. It means, if users change the indentation of `lineNumber` and the content of
 * this line doesn't match decreaseIndentPattern, we should not adjust the indentation.
 */
export function getIndentActionForType(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	range: Range,
	ch: string,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	console.log('getIndentActionForType');

	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}
	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);

	if (scopedLineTokens.firstCharOffset) {
		// this line has mixed languages and indentation rules will not work
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const lineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	const beforeTypeText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, scopedLineTokens, { isStart: false, columnIndexWithinScope });

	// selection support
	let afterTypeText: string;
	if (range.isEmpty()) {
		const columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
		afterTypeText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, scopedLineTokens, { isStart: true, columnIndexWithinScope });
	} else {
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		const columnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
		afterTypeText = getStrippedScopedLineTextFor(languageConfigurationService, lineTokens, endScopedLineTokens, { isStart: true, columnIndexWithinScope });
	}

	const fullTypeText = beforeTypeText + afterTypeText;
	console.log('fullTypeText : ', fullTypeText);
	const fullTypeTextWithCharacter = beforeTypeText + ch + afterTypeText;
	console.log('fullTypeTextWithCharacter : ', fullTypeTextWithCharacter);

	// If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
	// Users might change the indentation by purpose and we should honor that instead of readjusting.
	if (!indentRulesSupport.shouldDecrease(fullTypeText) && indentRulesSupport.shouldDecrease(fullTypeTextWithCharacter)) {
		// after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
		// 1. Get inherited indent action
		const r = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
		if (!r) {
			return null;
		}

		let indentation = r.indentation;
		if (r.action !== IndentAction.Indent) {
			indentation = indentConverter.unshiftIndent(indentation);
		}

		return indentation;
	}

	return null;
}

export function getIndentMetadata(
	model: ITextModel,
	lineNumber: number,
	languageConfigurationService: ILanguageConfigurationService
): number | null {
	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}
	if (lineNumber < 1 || lineNumber > model.getLineCount()) {
		return null;
	}
	return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
}

function getStrippedLine(languageConfigurationService: ILanguageConfigurationService, model: IVirtualModel, lineNumber: number): string {
	console.log('getStrippedLine');
	const lineContent = model.getLineContent(lineNumber);
	console.log('lineContent : ', lineContent);
	const tokens = model.tokenization.getLineTokens(lineNumber);
	const strippedLineContent = getStrippedLineForLineAndTokens(languageConfigurationService, model.tokenization.getLanguageId(), lineContent, tokens);
	// console.log('strippedLineContent : ', strippedLineContent);
	return strippedLineContent;
}
