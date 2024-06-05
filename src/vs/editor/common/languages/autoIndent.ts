/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IndentAction } from 'vs/editor/common/languages/languageConfiguration';
import { IndentConsts } from 'vs/editor/common/languages/supports/indentRules';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';
import { IndentationContextProcessor, isLanguageDifferentFromLineStart, ProcessedIndentRulesSupport } from 'vs/editor/common/languages/supports/indentationLineProcessor';

export interface IVirtualModel {
	tokenization: {
		getLineTokens(lineNumber: number): IViewLineTokens;
		getLanguageId(): string;
		getLanguageIdAtPosition(lineNumber: number, column: number): string;
		forceTokenization?(lineNumber: number): void;
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
function getPrecedingValidLine(model: IVirtualModel, lineNumber: number, processedIndentRulesSupport: ProcessedIndentRulesSupport) {
	const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
	if (lineNumber > 1) {
		let lastLineNumber: number;
		let resultLineNumber = -1;

		for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
			if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
				return resultLineNumber;
			}
			const text = model.getLineContent(lastLineNumber);
			if (processedIndentRulesSupport.shouldIgnore(lastLineNumber) || /^\s+$/.test(text) || text === '') {
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
	lineNumber: number,
	honorIntentialIndent: boolean = true,
	languageConfigurationService: ILanguageConfigurationService
): { indentation: string; action: IndentAction | null; line?: number } | null {
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}
	const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentRulesSupport, languageConfigurationService);

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

	const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport);
	if (precedingUnIgnoredLine < 0) {
		return null;
	} else if (precedingUnIgnoredLine < 1) {
		return {
			indentation: '',
			action: null
		};
	}

	if (processedIndentRulesSupport.shouldIncrease(precedingUnIgnoredLine) || processedIndentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLine)) {
		const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
		return {
			indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
			action: IndentAction.Indent,
			line: precedingUnIgnoredLine
		};
	} else if (processedIndentRulesSupport.shouldDecrease(precedingUnIgnoredLine)) {
		const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
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
				if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
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
				if (processedIndentRulesSupport.shouldIncrease(i)) {
					return {
						indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
						action: IndentAction.Indent,
						line: i
					};
				} else if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
					let stopLine = 0;
					for (let j = i - 1; j > 0; j--) {
						if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
							continue;
						}
						stopLine = j;
						break;
					}

					return {
						indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
						action: null,
						line: stopLine + 1
					};
				} else if (processedIndentRulesSupport.shouldDecrease(i)) {
					return {
						indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
						action: null,
						line: i
					};
				}
			}

			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(1)),
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

	const processedIndentRulesSupport = new ProcessedIndentRulesSupport(virtualModel, indentRulesSupport, languageConfigurationService);
	const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, undefined, languageConfigurationService);

	if (indent) {
		const inheritLine = indent.line;
		if (inheritLine !== undefined) {
			// Apply enter action as long as there are only whitespace lines between inherited line and this line.
			let shouldApplyEnterRules = true;
			for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
				if (!/^\s*$/.test(virtualModel.getLineContent(inBetweenLine))) {
					shouldApplyEnterRules = false;
					break;
				}
			}
			if (shouldApplyEnterRules) {
				const enterResult = richEditSupport.onEnter(autoIndent, '', virtualModel.getLineContent(inheritLine), '');

				if (enterResult) {
					let indentation = strings.getLeadingWhitespace(virtualModel.getLineContent(inheritLine));

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

					if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					if (enterResult.appendText) {
						indentation += enterResult.appendText;
					}

					return strings.getLeadingWhitespace(indentation);
				}
			}
		}

		if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
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
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	model.tokenization.forceTokenization(range.startLineNumber);
	const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
	const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
	const afterEnterProcessedTokens = processedContextTokens.afterRangeProcessedTokens;
	const beforeEnterProcessedTokens = processedContextTokens.beforeRangeProcessedTokens;
	const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterProcessedTokens.getLineContent());

	const virtualModel = createVirtualModelWithModifiedTokensAtLine(model, range.startLineNumber, beforeEnterProcessedTokens);
	const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
	const currentLine = model.getLineContent(range.startLineNumber);
	const currentLineIndent = strings.getLeadingWhitespace(currentLine);
	const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, undefined, languageConfigurationService);
	if (!afterEnterAction) {
		const beforeEnter = languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent;
		return {
			beforeEnter: beforeEnter,
			afterEnter: beforeEnter
		};
	}

	let afterEnterIndent = languageIsDifferentFromLineStart ? currentLineIndent : afterEnterAction.indentation;

	if (afterEnterAction.action === IndentAction.Indent) {
		afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
	}

	if (indentRulesSupport.shouldDecrease(afterEnterProcessedTokens.getLineContent())) {
		afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
	}

	return {
		beforeEnter: languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent,
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
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}
	const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
	if (languageIsDifferentFromLineStart) {
		// this line has mixed languages and indentation rules will not work
		return null;
	}

	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
	const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
	const beforeRangeText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
	const afterRangeText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
	const textAroundRange = beforeRangeText + afterRangeText;
	const textAroundRangeWithCharacter = beforeRangeText + ch + afterRangeText;

	// If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
	// Users might change the indentation by purpose and we should honor that instead of readjusting.
	if (!indentRulesSupport.shouldDecrease(textAroundRange) && indentRulesSupport.shouldDecrease(textAroundRangeWithCharacter)) {
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

function createVirtualModelWithModifiedTokensAtLine(model: ITextModel, modifiedLineNumber: number, modifiedTokens: IViewLineTokens): IVirtualModel {
	const virtualModel: IVirtualModel = {
		tokenization: {
			getLineTokens: (lineNumber: number): IViewLineTokens => {
				if (lineNumber === modifiedLineNumber) {
					return modifiedTokens;
				} else {
					return model.tokenization.getLineTokens(lineNumber);
				}
			},
			getLanguageId: (): string => {
				return model.getLanguageId();
			},
			getLanguageIdAtPosition: (lineNumber: number, column: number): string => {
				return model.getLanguageIdAtPosition(lineNumber, column);
			},
		},
		getLineContent: (lineNumber: number): string => {
			if (lineNumber === modifiedLineNumber) {
				return modifiedTokens.getLineContent();
			} else {
				return model.getLineContent(lineNumber);
			}
		}
	};
	return virtualModel;
}

