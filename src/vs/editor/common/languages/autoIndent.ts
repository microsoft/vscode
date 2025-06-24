/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';
import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { IndentAction } from './languageConfiguration.js';
import { IndentConsts } from './supports/indentRules.js';
import { EditorAutoIndentStrategy } from '../config/editorOptions.js';
import { ILanguageConfigurationService } from './languageConfigurationRegistry.js';
import { IViewLineTokens } from '../tokens/lineTokens.js';
import { IndentationContextProcessor, isLanguageDifferentFromLineStart, ProcessedIndentRulesSupport } from './supports/indentationLineProcessor.js';
import { CursorConfiguration } from '../cursorCommon.js';

/**
 * Result type for indentation inheritance operations
 */
interface IndentationResult {
	indentation: string;
	action: IndentAction | null;
	line?: number;
}

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
 * Validates prerequisites for auto-indentation operations
 */
function validateAutoIndentPrerequisites(
	autoIndent: EditorAutoIndentStrategy,
	languageConfigurationService: ILanguageConfigurationService,
	languageId: string
) {
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	return indentRulesSupport;
}

/**
 * Creates a standardized indentation result object
 */
function createIndentationResult(
	indentation: string,
	action: IndentAction | null = null,
	line?: number
): IndentationResult {
	return { indentation, action, line };
}

/**
 * Checks if the line is the first non-blank line and returns appropriate indentation
 */
function getIndentationForFirstNonBlankLine(
	model: IVirtualModel,
	lineNumber: number
): IndentationResult | null {
	if (lineNumber <= 1) {
		return createIndentationResult('');
	}

	// Use no indent if this is the first non-blank line
	for (let priorLineNumber = lineNumber - 1; priorLineNumber > 0; priorLineNumber--) {
		if (model.getLineContent(priorLineNumber) !== '') {
			break;
		}
		if (priorLineNumber === 1) {
			return createIndentationResult('');
		}
	}

	return null;
}

/**
 * Processes indentation based on the preceding valid line's characteristics
 */
function processIndentationFromPrecedingLine(
	model: IVirtualModel,
	precedingLineNumber: number,
	processedIndentRulesSupport: ProcessedIndentRulesSupport,
	indentRulesSupport: any
): IndentationResult {
	const precedingLineContent = model.getLineContent(precedingLineNumber);
	const precedingIndentation = strings.getLeadingWhitespace(precedingLineContent);

	if (processedIndentRulesSupport.shouldIncrease(precedingLineNumber) || 
		processedIndentRulesSupport.shouldIndentNextLine(precedingLineNumber)) {
		return createIndentationResult(precedingIndentation, IndentAction.Indent, precedingLineNumber);
	}

	if (processedIndentRulesSupport.shouldDecrease(precedingLineNumber)) {
		return createIndentationResult(precedingIndentation, null, precedingLineNumber);
	}

	// Handle case where preceding line doesn't match any indent patterns
	if (precedingLineNumber === 1) {
		return createIndentationResult(precedingIndentation, null, precedingLineNumber);
	}

	return handleComplexIndentationCase(model, precedingLineNumber, processedIndentRulesSupport, indentRulesSupport);
}

/**
 * Handles complex indentation cases where the preceding line doesn't match simple patterns
 */
function handleComplexIndentationCase(
	model: IVirtualModel,
	precedingLineNumber: number,
	processedIndentRulesSupport: ProcessedIndentRulesSupport,
	indentRulesSupport: any
): IndentationResult {
	const previousLine = precedingLineNumber - 1;
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

		return createIndentationResult(
			strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
			null,
			stopLine + 1
		);
	}

	return createIndentationResult(
		strings.getLeadingWhitespace(model.getLineContent(precedingLineNumber)),
		null,
		precedingLineNumber
	);
}

/**
 * Searches for appropriate indentation when honoring intentional indent is disabled
 */
function searchForNonTemporaryIndent(
	model: IVirtualModel,
	startLineNumber: number,
	processedIndentRulesSupport: ProcessedIndentRulesSupport
): IndentationResult {
	for (let i = startLineNumber; i > 0; i--) {
		if (processedIndentRulesSupport.shouldIncrease(i)) {
			return createIndentationResult(
				strings.getLeadingWhitespace(model.getLineContent(i)),
				IndentAction.Indent,
				i
			);
		}

		if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
			let stopLine = 0;
			for (let j = i - 1; j > 0; j--) {
				if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
					continue;
				}
				stopLine = j;
				break;
			}

			return createIndentationResult(
				strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
				null,
				stopLine + 1
			);
		}

		if (processedIndentRulesSupport.shouldDecrease(i)) {
			return createIndentationResult(
				strings.getLeadingWhitespace(model.getLineContent(i)),
				null,
				i
			);
		}
	}

	return createIndentationResult(
		strings.getLeadingWhitespace(model.getLineContent(1)),
		null,
		1
	);
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
): IndentationResult | null {
	const indentRulesSupport = validateAutoIndentPrerequisites(
		autoIndent, 
		languageConfigurationService, 
		model.tokenization.getLanguageId()
	);
	if (!indentRulesSupport) {
		return null;
	}

	const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentRulesSupport, languageConfigurationService);

	// Check if this is the first non-blank line
	const firstLineResult = getIndentationForFirstNonBlankLine(model, lineNumber);
	if (firstLineResult) {
		return firstLineResult;
	}

	const precedingValidLineNumber = getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport);
	if (precedingValidLineNumber < 0) {
		return null;
	}
	if (precedingValidLineNumber < 1) {
		return createIndentationResult('');
	}

	const baseResult = processIndentationFromPrecedingLine(
		model,
		precedingValidLineNumber,
		processedIndentRulesSupport,
		indentRulesSupport
	);

	// If we honor intentional indent or have a clear action, return the base result
	if (honorIntentialIndent || baseResult.action !== null) {
		return baseResult;
	}

	// Search for non-temporary indent
	return searchForNonTemporaryIndent(model, precedingValidLineNumber, processedIndentRulesSupport);
}

export function getGoodIndentForLine(
	autoIndent: EditorAutoIndentStrategy,
	virtualModel: IVirtualModel,
	languageId: string,
	lineNumber: number,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	const indentRulesSupport = validateAutoIndentPrerequisites(autoIndent, languageConfigurationService, languageId);
	if (!indentRulesSupport) {
		return null;
	}

	const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
	if (!richEditSupport) {
		return null;
	}

	const processedIndentRulesSupport = new ProcessedIndentRulesSupport(virtualModel, indentRulesSupport, languageConfigurationService);
	const indentData = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, undefined, languageConfigurationService);

	if (indentData) {
		const inheritLine = indentData.line;
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
			if (indentData.action === IndentAction.Indent) {
				return indentData.indentation;
			} else {
				return indentConverter.unshiftIndent(indentData.indentation);
			}
		} else {
			if (indentData.action === IndentAction.Indent) {
				return indentConverter.shiftIndent(indentData.indentation);
			} else {
				return indentData.indentation;
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
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const indentRulesSupport = validateAutoIndentPrerequisites(autoIndent, languageConfigurationService, languageId);
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
 * Checks if typing a character should trigger decrease indentation
 */
function shouldTriggerDecreaseIndentation(
	indentRulesSupport: any,
	textAroundRange: string,
	textAroundRangeWithCharacter: string
): boolean {
	return !indentRulesSupport.shouldDecrease(textAroundRange) && 
		   indentRulesSupport.shouldDecrease(textAroundRangeWithCharacter);
}

/**
 * Calculates indentation for decrease indent scenario
 */
function getDecreaseIndentation(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	lineNumber: number,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	const indentationData = getInheritIndentForLine(autoIndent, model, lineNumber, false, languageConfigurationService);
	if (!indentationData) {
		return null;
	}

	let indentation = indentationData.indentation;
	if (indentationData.action !== IndentAction.Indent) {
		indentation = indentConverter.unshiftIndent(indentation);
	}

	return indentation;
}

/**
 * Checks conditions for auto-closing pair indentation
 */
function shouldIndentForAutoClosingPair(
	cursorConfig: CursorConfiguration,
	model: ITextModel,
	range: Range,
	ch: string,
	textAroundRange: string,
	indentRulesSupport: any,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	const previousLineNumber = range.startLineNumber - 1;
	if (previousLineNumber <= 0) {
		return null;
	}

	const previousLine = model.getLineContent(previousLineNumber);
	const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
	const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
	const beforeRangeText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
	const afterRangeText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
	const textAroundRangeWithCharacter = beforeRangeText + ch + afterRangeText;
	
	if (!indentRulesSupport.shouldIndentNextLine(previousLine) || 
		!indentRulesSupport.shouldIncrease(textAroundRangeWithCharacter)) {
		return null;
	}

	const inheritedIndentationData = getInheritIndentForLine(
		EditorAutoIndentStrategy.Full, 
		model, 
		range.startLineNumber, 
		false, 
		languageConfigurationService
	);
	const inheritedIndentation = inheritedIndentationData?.indentation;
	
	if (inheritedIndentation === undefined) {
		return null;
	}

	const currentLine = model.getLineContent(range.startLineNumber);
	const actualCurrentIndentation = strings.getLeadingWhitespace(currentLine);
	const inferredCurrentIndentation = indentConverter.shiftIndent(inheritedIndentation);
	
	// If the inferred current indentation is not equal to the actual current indentation, 
	// then the indentation has been intentionally changed, in that case keep it
	const inferredIndentationEqualsActual = inferredCurrentIndentation === actualCurrentIndentation;
	const textAroundRangeContainsOnlyWhitespace = /^\s*$/.test(textAroundRange);
	const autoClosingPairs = cursorConfig.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
	const autoClosingPairExists = autoClosingPairs && autoClosingPairs.length > 0;
	const isChFirstNonWhitespaceCharacterAndInAutoClosingPair = autoClosingPairExists && textAroundRangeContainsOnlyWhitespace;
	
	if (inferredIndentationEqualsActual && isChFirstNonWhitespaceCharacterAndInAutoClosingPair) {
		return inheritedIndentation;
	}

	return null;
}
/**
 * We should always allow intentional indentation. It means, if users change the indentation of `lineNumber` and the content of
 * this line doesn't match decreaseIndentPattern, we should not adjust the indentation.
 */
export function getIndentActionForType(
	cursorConfig: CursorConfiguration,
	model: ITextModel,
	range: Range,
	ch: string,
	indentConverter: IIndentConverter,
	languageConfigurationService: ILanguageConfigurationService
): string | null {
	const autoIndent = cursorConfig.autoIndent;
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const indentRulesSupport = validateAutoIndentPrerequisites(autoIndent, languageConfigurationService, languageId);
	if (!indentRulesSupport) {
		return null;
	}

	const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
	if (languageIsDifferentFromLineStart) {
		// this line has mixed languages and indentation rules will not work
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
	if (shouldTriggerDecreaseIndentation(indentRulesSupport, textAroundRange, textAroundRangeWithCharacter)) {
		// after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
		return getDecreaseIndentation(autoIndent, model, range.startLineNumber, indentConverter, languageConfigurationService);
	}

	// Check for auto-closing pair indentation
	return shouldIndentForAutoClosingPair(
		cursorConfig,
		model,
		range,
		ch,
		textAroundRange,
		indentRulesSupport,
		indentConverter,
		languageConfigurationService
	);
}

export function getIndentMetadata(
	model: ITextModel,
	lineNumber: number,
	languageConfigurationService: ILanguageConfigurationService
): number | null {
	const indentRulesSupport = validateAutoIndentPrerequisites(
		EditorAutoIndentStrategy.Full,
		languageConfigurationService,
		model.getLanguageId()
	);
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

