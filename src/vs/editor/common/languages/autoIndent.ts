/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IndentAction } from 'vs/editor/common/languages/languageConfiguration';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/languages/supports';
import { IndentConsts, IndentRulesSupport } from 'vs/editor/common/languages/supports/indentRules';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { getScopedLineTokens, ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ProcessLinesForIndentation, ProcessLinesForIndentationExtended, withinEmbeddedLanguage } from 'vs/editor/common/languages/enterAction';
import { Position } from 'vs/editor/common/core/position';

export interface IVirtualModel {
	tokenization: {
		getLineTokens(lineNumber: number): LineTokens | ScopedLineTokens;
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
function getPrecedingValidLine(model: IVirtualModel, position: Position, indentRulesSupport: IndentRulesSupport) {
	console.log('getPrecedingValidLine');
	console.log('position : ', position);

	// If the line contains only regex, string or comment tokens, then ignore this line.
	const doesLineContainOtherStandardTokenType = (tokens: LineTokens | ScopedLineTokens) => {
		console.log('tokens : ', tokens);
		const numberOfTokens = tokens.getCount();
		console.log('numberOfTokens : ', numberOfTokens);
		let lineContainsOtherStandardTokenType = false;
		for (let i = 0; i < numberOfTokens; i++) {
			const tokenType = tokens.getStandardTokenType(i);
			const startOffset = tokens.getStartOffset(i);
			const endOffset = tokens.getEndOffset(i);
			const text = tokens.getLineContent().substring(startOffset, endOffset);
			console.log('text : ', text);
			console.log('tokenType : ', tokenType);

			if (tokenType === StandardTokenType.Other) {
				lineContainsOtherStandardTokenType = true;
				break;
			}
		}
		return lineContainsOtherStandardTokenType;
	}

	const lineNumber = position.lineNumber;
	const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
	console.log('lineTokens : ', lineTokens);
	console.log('position.column - 1 : ', position.column - 1);
	const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
	console.log('tokenIndex : ', tokenIndex);
	const currentTokenType = lineTokens.getStandardTokenType(tokenIndex);
	console.log('current tokenType : ', currentTokenType);

	const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
	if (lineNumber > 1) {
		let lastLineNumber: number;
		let resultLineNumber = -1;

		for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
			if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
				return resultLineNumber;
			}
			const text = model.getLineContent(lastLineNumber);
			console.log()
			const tokens = model.tokenization.getLineTokens(lastLineNumber);
			console.log('lastLineNumber : ', lastLineNumber);
			if (currentTokenType === StandardTokenType.Other) {
				const lineContainsOtherStandardTokenType = doesLineContainOtherStandardTokenType(tokens);
				console.log('lineContainsOtherStandardTokenType : ', lineContainsOtherStandardTokenType);
				if (!lineContainsOtherStandardTokenType) {
					resultLineNumber = lastLineNumber;
					continue;
				}
			}
			if (indentRulesSupport.shouldIgnore(text) || /^\s+$/.test(text) || text === '') {
				resultLineNumber = lastLineNumber;
				continue;
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
	position: Position,
	honorIntentialIndent: boolean = true,
	languageConfigurationService: ILanguageConfigurationService,
): { indentation: string; action: IndentAction | null; line?: number } | null {

	console.log('getInheritedIndentForLine');
	console.log('position : ', position);
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const lineNumber = position.lineNumber;
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

	const precedingUnIgnoredLine = getPrecedingValidLine(model, position, indentRulesSupport);
	console.log('precedingUnignoredLine : ', precedingUnIgnoredLine);

	if (precedingUnIgnoredLine < 0) {
		return null;
	} else if (precedingUnIgnoredLine < 1) {
		return {
			indentation: '',
			action: null
		};
	}

	const processLines = new ProcessLinesForIndentation(model, languageConfigurationService);
	const precedingUnIgnoredLineContent = processLines.getStrippedLine(precedingUnIgnoredLine);
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
				const lineContent = processLines.getStrippedLine(i);
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
				const lineContent = processLines.getStrippedLine(i);
				if (indentRulesSupport.shouldIncrease(lineContent)) {
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
						action: IndentAction.Indent,
						line: i
					};
				} else if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
					let stopLine = 0;
					for (let j = i - 1; j > 0; j--) {
						const lineContent = processLines.getStrippedLine(i);
						if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
							continue;
						}
						stopLine = j;
						break;
					}

					const lineContent = processLines.getStrippedLine(stopLine + 1);
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

			const lineContent = processLines.getStrippedLine(1);
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
	position: Position,
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

	const indent = getInheritIndentForLine(autoIndent, virtualModel, position, undefined, languageConfigurationService);
	const lineNumber = position.lineNumber;
	const processLines = new ProcessLinesForIndentation(virtualModel, languageConfigurationService);
	const lineContent = processLines.getStrippedLine(lineNumber);

	if (indent) {
		const inheritLine = indent.line;
		if (inheritLine !== undefined) {
			// Apply enter action as long as there are only whitespace lines between inherited line and this line.
			let shouldApplyEnterRules = true;
			for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
				const lineContent = processLines.getStrippedLine(inBetweenLine);
				if (!/^\s*$/.test(lineContent)) {
					shouldApplyEnterRules = false;
					break;
				}
			}
			if (shouldApplyEnterRules) {
				const inheritedLineContent = processLines.getStrippedLine(inheritLine);
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
	const processLines = new ProcessLinesForIndentationExtended(model, languageConfigurationService);
	const lineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);

	const embeddedLanguage = withinEmbeddedLanguage(lineTokens, scopedLineTokens);
	const beforeEnterResult = processLines.getBeforeProcessedLine(range, scopedLineTokens);
	const beforeEnterText = beforeEnterResult.line;
	const strippedBeforeEnterText = beforeEnterResult.strippedLine;
	const beforeEnterTokens = beforeEnterResult.tokens;

	const afterEnterResult = processLines.getAfterProcessedLine(range, scopedLineTokens);
	const strippedAfterEnterText = afterEnterResult.strippedLine;
	const afterEnterText = afterEnterResult.line;
	const afterEnterTokens = afterEnterResult.tokens;

	console.log('strippedBeforeEnterText : ', strippedBeforeEnterText);
	console.log('beforeEnterText : ', beforeEnterText);
	console.log('beforeEnterTokens : ', beforeEnterTokens);
	console.log('strippedAfterEnterText : ', strippedAfterEnterText);
	console.log('afterEnterText : ', afterEnterText);
	console.log('afterEnterTokens : ', afterEnterTokens);

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterText);

	const virtualModel: IVirtualModel = {
		tokenization: {
			getLineTokens: (lineNumber: number) => {
				console.log('getLineTokens of virtualModel');
				console.log('lineNumber : ', lineNumber);

				console.log('lineNumber === range.startLineNumber : ', lineNumber === range.startLineNumber)
				console.log('lineNumber === range.startLineNumber + 1 : ', lineNumber === range.startLineNumber + 1);

				if (lineNumber === range.startLineNumber) {
					return beforeEnterTokens;
				} else if (lineNumber === range.startLineNumber + 1) {
					return afterEnterTokens;
				} else {
					model.tokenization.forceTokenization(lineNumber);
					return model.tokenization.getLineTokens(lineNumber);
				}
			},
			getLanguageId: () => {
				return model.getLanguageId();
			},
			getLanguageIdAtPosition: (lineNumber: number, column: number) => {
				return model.getLanguageIdAtPosition(lineNumber, column);
			},
		},
		getLineContent: (lineNumber: number) => {
			if (lineNumber < range.startLineNumber) {
				return model.getLineContent(lineNumber);
			} else if (lineNumber === range.startLineNumber) {
				return beforeEnterText;
			} else if (lineNumber === range.startLineNumber + 1) {
				return afterEnterText;
			} else {
				return model.getLineContent(lineNumber + 1);
			}
		}
	};

	const currentLineIndent = strings.getLeadingWhitespace(lineTokens.getLineContent());
	const position = new Position(range.startLineNumber + 1, afterEnterText.length + 1);
	const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, position, undefined, languageConfigurationService);
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

	if (indentRulesSupport.shouldDecrease(strippedAfterEnterText)) {
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

	const processLines = new ProcessLinesForIndentationExtended(model, languageConfigurationService);
	// not sure the before enter result can be combined in this manner
	const beforeEnterResult = processLines.getBeforeProcessedLine(range, scopedLineTokens);
	const afterEnterResult = processLines.getAfterProcessedLine(range, scopedLineTokens);

	const fullTypeText = beforeEnterResult.strippedLine + afterEnterResult.strippedLine;
	console.log('fullTypeText : ', fullTypeText);
	const fullTypeTextWithCharacter = beforeEnterResult.strippedLine + ch + afterEnterResult.strippedLine;
	console.log('fullTypeTextWithCharacter : ', fullTypeTextWithCharacter);

	// How to use a virtual model to retokenize after the change

	// If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
	// Users might change the indentation by purpose and we should honor that instead of readjusting.
	if (!indentRulesSupport.shouldDecrease(fullTypeText) && indentRulesSupport.shouldDecrease(fullTypeTextWithCharacter)) {
		// after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
		// 1. Get inherited indent action
		const r = getInheritIndentForLine(autoIndent, model, range.getStartPosition(), false, languageConfigurationService);
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

