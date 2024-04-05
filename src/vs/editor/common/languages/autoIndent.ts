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
function getPrecedingValidLine(model: IVirtualModel, lineNumber: number, indentRulesSupport: IndentRulesSupport) {
	// We take the language id at the column 0 only. This is considered as our current language.
	// TODO, what if at column 0 we have HTML and at column 1 we have JavaScript, then we would incorrectly use the indentation from HTML?
	const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
	if (lineNumber > 1) {
		let lastLineNumber: number;
		// The initial value is -1, meaning if it is returned then that means that we do not have lines before the current line number with the same language ID
		let resultLineNumber = -1;

		// We iterate down from the current line number all the way to 1
		for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
			// Suppose that the language id at the current line number and column 0 is not the language id of interest
			// Then return the result line number
			if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
				return resultLineNumber;
			}
			// Otherwise we assume the line at lastLineNumber is of the same language as our language of interest
			// We access the line content
			const text = model.getLineContent(lastLineNumber);
			// We decide if we should ignore the current line (given by the fact that the current line is not affected by previous indentation patterns)
			// We test the line is empty
			// We test if the line contains only whitespaces
			// If any of these are the case, then we go further up to a higher line number
			if (indentRulesSupport.shouldIgnore(text) || /^\s+$/.test(text) || text === '') {
				resultLineNumber = lastLineNumber;
				continue;
			}

			return lastLineNumber;
		}
	}

	return -1;
}

// TODO: seems not very efficient, if we have to go up from the current line in order to find indentations which can be found when going from top to bottom

/**
 * Get inherited indentation from above lines.
 * 1. Find the nearest preceding line which doesn't match unIndentedLinePattern.
 * 2. If this line matches indentNextLinePattern or increaseIndentPattern, it means that the indent level of `lineNumber` should be 1 greater than this line.
 * 3. If this line doesn't match any indent rules
 *   a. check whether the line above itself matches indentNextLinePattern
 *   b. If not, the indent level of this line is the result
 *   c. If yes, it means the indent of this line is *temporary*, go upward utill we find a line whose indent is not temporary (the same workflow a -> b -> c).
 * 4. Otherwise, we fail to get an inherited indent from aboves. Return null and we should not touch the indent of `lineNumber`
 *
 * This function only return the inherited indent based on above lines, it doesn't check whether current line should decrease or not.
 * This inherited indent should be combined with information regarding the current line, in order to decide whether the current line's indentation should be changed.
 */
export function getInheritIndentForLine(
	autoIndent: EditorAutoIndentStrategy, // Different setting values can be used for the auto indentation strategy
	model: IVirtualModel,
	lineNumber: number,
	honorIntentialIndent: boolean = true, // When the user changes the indentation after the auto indent, we should keep this.
	languageConfigurationService: ILanguageConfigurationService
): { indentation: string; action: IndentAction | null; line?: number } | null {

	// The Full indent strategy is the highest value strategy, if the strategy is below this, then we do not want to calculate the inherited indent for the line
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}

	// The indent rules support basically takes the indent rules in their regex forms and can be used to test regex validity on input text
	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	// Technically this should not happen?
	if (lineNumber <= 1) {
		return {
			indentation: '',
			action: null
		};
	}

	// Use no indent if this is the first non-blank line
	// Meaning if the lineNumber line is the first line which is not consisting of only whitespaces, then we do not want to take into account the indentation of the lines before it
	// Presumably this is because no pertinent information can be gathered from the whitespace lines above it, since an arbitrary number of whitespaces can be present
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

	// In that case, a preceding valid line could exist (although not guaranteed - maybe all preceding non whitespace-only lines are ignored with the unindent pattern)
	const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, indentRulesSupport);
	if (precedingUnIgnoredLine < 0) {
		return null;
	} else if (precedingUnIgnoredLine < 1) {
		// If preceedingUnIgnoredLine >= 0 and < 1, then it is equal to 0 exactly
		// I suppose this comparison is made in such a way to preserve the symmetry in the comparison
		return {
			indentation: '',
			action: null
		};
	}

	// Take the line content for the last preceding un ignored line
	const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
	console.log('precedingUnIgnoredLineContent : ', precedingUnIgnoredLineContent);

	// Suppose that after this line, the indent should increase overall, or the indent for the next (which is our current line) should increase
	if (indentRulesSupport.shouldIncrease(precedingUnIgnoredLineContent) || indentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLineContent)) {
		// Here we take all the whitespace characters at the beginning of the line. The whitespace characters include the space character and the tab character.
		return {
			indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
			action: IndentAction.Indent, // From here on we want to indent further.
			line: precedingUnIgnoredLine
		};
	} else if (indentRulesSupport.shouldDecrease(precedingUnIgnoredLineContent)) {
		return {
			indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
			action: null, // If we should decrease the indent from here on, we return as an action null? We could return IndentAction.Outdent instead no?
			line: precedingUnIgnoredLine
		};
	} else {
		// precedingUnIgnoredLine can not be ignored.
		// it doesn't increase indent of following lines
		// it doesn't increase just next line
		// so current line is not affect by precedingUnIgnoredLine
		// and then we should get a correct inherited indentation from above lines

		// meaning that we have no information from the preceding unignored line as to the inherited indentation, but we still want to find it
		// hence the following heuristic goes above this line

		if (precedingUnIgnoredLine === 1) {
			// If the preceding unignored line number is 1, then we can not go above it, hence we return the action null
			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
				action: null,
				line: precedingUnIgnoredLine
			};
		}

		// Go to the line right above the preceding unignored line number
		const previousLine = precedingUnIgnoredLine - 1;

		// Find the mask corresponding to the line right before the preceding unignored line number
		const previousLineIndentMetadata = indentRulesSupport.getIndentMetadata(model.getLineContent(previousLine));
		// If the mask does not consist of the increase mask followed by the decrease mask, and it corresponds (entirely?) to the indent next line mask, then enter the if statement
		if (!(previousLineIndentMetadata & (IndentConsts.INCREASE_MASK | IndentConsts.DECREASE_MASK)) &&
			(previousLineIndentMetadata & IndentConsts.INDENT_NEXTLINE_MASK)) {
			// Take the stop line equal to 0, and start from the previous line number - 1, and continue decreasing the line number by 1, while we continuously get the shouldIndentNextLine on that line
			let stopLine = 0;
			for (let i = previousLine - 1; i > 0; i--) {
				if (indentRulesSupport.shouldIndentNextLine(model.getLineContent(i))) {
					continue;
				}
				stopLine = i;
				break;
			}
			// After the above for loop, we will have found the first line above precedingUnIgnoredLine which does not validate the pattern shouldIndentNextLinePattern
			// Then we take the line after that, the first in its sequence, and take the indentation of this line

			// After some thought, this makes sense. We do this because the previous lines matches the indentNextLinePattern, hence we only wanted to indent the next line pattern, not the current line
			// So we need to move up to the first occurence in a sequence of a line that validates this check, and take its indentation

			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
				action: null,
				line: stopLine + 1
			};
		}

		if (honorIntentialIndent) {
			// If we really do want to honor the intentiontal indent, we will take the indentation in fron of the preceding unignored line
			return {
				indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
				action: null,
				line: precedingUnIgnoredLine
			};
		} else {
			// search from precedingUnIgnoredLine until we find one whose indent is not temporary
			for (let i = precedingUnIgnoredLine; i > 0; i--) {
				// Take the corresponding line content
				const lineContent = model.getLineContent(i);
				// If we detect we should increase the indent, then we return the inherited indent from that line
				if (indentRulesSupport.shouldIncrease(lineContent)) {
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
						action: IndentAction.Indent,
						line: i
					};
				} else if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
					// If we detect that the current line validates the should indent next line pattern, then go up from that line until we reach a line that does not validate this pattern
					// then return the indentation for the first line in that sequence which validates the pattern indentNextLinePattern
					let stopLine = 0;
					for (let j = i - 1; j > 0; j--) {
						if (indentRulesSupport.shouldIndentNextLine(model.getLineContent(i))) {
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
				} else if (indentRulesSupport.shouldDecrease(lineContent)) {
					// In this case return null
					return {
						indentation: strings.getLeadingWhitespace(lineContent),
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

// TODO: do a search for EditorAutoIndentStrategy in order to find the usages and understand better its impact
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
	// When this language does not have a set of methods that we will use later in this method, we return null.
	// The particular language needs to support rich edits
	if (!richEditSupport) {
		return null;
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, undefined, languageConfigurationService);
	// This is information relative to the indent we inherited from the lines above
	// Even if the lines above mention we have to decrease the indent, the value will not be null necessarily, however the action will be null

	const lineContent = virtualModel.getLineContent(lineNumber);

	// Suppose the indent object is not null
	if (indent) {
		// Find the line from which we apply the indent action. This is sort of the base line from which we continue the indentation.
		// This line can be undefined, for example when the current line number is 1 and it has no preceding lines, then the base line is undefined
		const inheritLine = indent.line;
		if (inheritLine !== undefined) {
			// Apply enter action as long as there are only whitespace lines between inherited line and this line.
			let shouldApplyEnterRules = true;

			// Go from the inherited line all the way to the lineNumber - 1
			// For each such intermediary line, we test if there are only whitespace characters. If this is the case, then we want to apply the enter rules
			// Otherwise if there is at least one line where there characters other than whitespace in between then we do not want to apply the enter rules
			for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
				if (!/^\s*$/.test(virtualModel.getLineContent(inBetweenLine))) {
					shouldApplyEnterRules = false;
					break;
				}
			}
			// Suppose we want to apply the enter rules
			if (shouldApplyEnterRules) {
				// Pass in the auto indent strategy
				// For some reason previousLineText is empty?
				// The beforeEnterText is the line content of the inherited line
				// There is no afterEnterText
				const enterResult = richEditSupport.onEnter(autoIndent, '', virtualModel.getLineContent(inheritLine), '');

				if (enterResult) {
					// Get the indentation or the leading white spaces at the inherited line
					let indentation = strings.getLeadingWhitespace(virtualModel.getLineContent(inheritLine));

					// We remove 'removeText' characters from the indentation to get the new indentation string
					if (enterResult.removeText) {
						indentation = indentation.substring(0, indentation.length - enterResult.removeText);
					}

					if (
						(enterResult.indentAction === IndentAction.Indent) ||
						(enterResult.indentAction === IndentAction.IndentOutdent)
					) {
						// Shift the indent when we want to indent or indent/outdent
						indentation = indentConverter.shiftIndent(indentation);
					} else if (enterResult.indentAction === IndentAction.Outdent) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					// But I thought the shouldDecrease method is used to determine if the indentation should decrease for the next lines, not for the current line?
					if (indentRulesSupport.shouldDecrease(lineContent)) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					// add some text to the indentation result
					if (enterResult.appendText) {
						// indentation not necessarily made of just whitespaces, can contain other characters
						// Added in case the appendText contains whitespaces that should be taken into account in the return statement
						indentation += enterResult.appendText;
					}

					return strings.getLeadingWhitespace(indentation);
				}
			}
		}

		// If previously did not return (for example if inheritLine is undefined)
		// check if the indentation should decrease from the current line content
		if (indentRulesSupport.shouldDecrease(lineContent)) {
			// If the inherited indent action is to indent, then we return the inherited indent indentation
			if (indent.action === IndentAction.Indent) {
				return indent.indentation;
			} else {
				// Otherwise we want to unshift the indentation
				return indentConverter.unshiftIndent(indent.indentation);
			}
		} else {
			// Inherited indent mentions to increase indent
			if (indent.action === IndentAction.Indent) {
				// Then increase indentation
				return indentConverter.shiftIndent(indent.indentation);
			} else {
				// Otherwise do not change current indent
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
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		console.log('return 1');
		return null;
	}
	model.tokenization.forceTokenization(range.startLineNumber);
	const lineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
	// Text in the scope
	const scopedLineText = scopedLineTokens.getLineContent();

	let embeddedLanguage = false;
	let beforeEnterText: string;
	if (scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId) {
		// we are in the embeded language content
		embeddedLanguage = true; // if embeddedLanguage is true, then we don't touch the indentation of current line
		// Take the substring from the current range start column minus the first character offset
		beforeEnterText = scopedLineText.substr(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);
	} else {
		beforeEnterText = lineTokens.getLineContent().substring(0, range.startColumn - 1);
	}

	let afterEnterText: string;
	if (range.isEmpty()) {
		// If range is empty then means the end and start position coincide
		// Then take the remaining substring
		afterEnterText = scopedLineText.substr(range.startColumn - 1 - scopedLineTokens.firstCharOffset);
	} else {
		// Take the token scope around the end position
		// Fetching tokens here, could be relevant for the feature
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		afterEnterText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - scopedLineTokens.firstCharOffset);
	}

	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		console.log('return 2');
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

	const currentLineIndent = strings.getLeadingWhitespace(lineTokens.getLineContent());
	// virtual model is the model after the enter has been made
	// Getting inherited indent for the next start line number
	const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, undefined, languageConfigurationService);
	console.log('afterEnterAction : ', JSON.stringify(afterEnterAction));
	if (!afterEnterAction) {
		const beforeEnter = embeddedLanguage ? currentLineIndent : beforeEnterIndent;
		console.log('return 3');
		return {
			beforeEnter: beforeEnter,
			afterEnter: beforeEnter
		};
	}

	let afterEnterIndent = embeddedLanguage ? currentLineIndent : afterEnterAction.indentation;

	// If we need to indent, then nident using indent converter
	if (afterEnterAction.action === IndentAction.Indent) {
		afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
	}

	console.log('afterEnterText : ', afterEnterText);
	if (indentRulesSupport.shouldDecrease(afterEnterText)) {
		afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
	}

	console.log('return 4');
	console.log('embeddedLanguage : ', embeddedLanguage);
	console.log('currentLineIndent : ', currentLineIndent.length);
	console.log('beforeEnterIndent : ', beforeEnterIndent.length);
	console.log('afterEnterIndent : ', afterEnterIndent.length);
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
	if (autoIndent < EditorAutoIndentStrategy.Full) {
		return null;
	}
	// get tokens around the range start position
	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);

	if (scopedLineTokens.firstCharOffset) {
		// this line has mixed languages and indentation rules will not work
		return null;
	}

	// Finding the indent rules support for the language in the scope which is the whole line
	const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).indentRulesSupport;
	if (!indentRulesSupport) {
		return null;
	}

	const scopedLineText = scopedLineTokens.getLineContent();
	const beforeTypeText = scopedLineText.substr(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);

	// selection support
	let afterTypeText: string;
	if (range.isEmpty()) {
		afterTypeText = scopedLineText.substr(range.startColumn - 1 - scopedLineTokens.firstCharOffset);
	} else {
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		afterTypeText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - scopedLineTokens.firstCharOffset);
	}

	// If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
	// Users might change the indentation by purpose and we should honor that instead of readjusting.

	// adding ch into the second string of this check
	if (!indentRulesSupport.shouldDecrease(beforeTypeText + afterTypeText) && indentRulesSupport.shouldDecrease(beforeTypeText + ch + afterTypeText)) {
		// after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
		// 1. Get inherited indent action
		const r = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
		if (!r) {
			return null;
		}

		let indentation = r.indentation;
		// If not indent action, we unshift the indent
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
	// get metadata using the indent rules support for the specific line
	return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
}
