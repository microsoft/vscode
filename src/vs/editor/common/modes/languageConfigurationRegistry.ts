/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from 'vs/editor/common/model/wordHelper';
import { EnterAction, FoldingRules, IAutoClosingPair, IndentAction, IndentationRule, LanguageConfiguration, StandardAutoClosingPairConditional, CompleteEnterAction, AutoClosingPairs, CharacterPair, ExplicitLanguageConfiguration } from 'vs/editor/common/modes/languageConfiguration';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/modes/supports';
import { CharacterPairSupport } from 'vs/editor/common/modes/supports/characterPair';
import { BracketElectricCharacterSupport, IElectricAction } from 'vs/editor/common/modes/supports/electricCharacter';
import { IndentConsts, IndentRulesSupport } from 'vs/editor/common/modes/supports/indentRules';
import { OnEnterSupport } from 'vs/editor/common/modes/supports/onEnter';
import { RichEditBrackets } from 'vs/editor/common/modes/supports/richEditBrackets';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

/**
 * Interface used to support insertion of mode specific comments.
 */
export interface ICommentsConfiguration {
	lineCommentToken?: string;
	blockCommentStartToken?: string;
	blockCommentEndToken?: string;
}

export interface IVirtualModel {
	getLineTokens(lineNumber: number): LineTokens;
	getLanguageId(): string;
	getLanguageIdAtPosition(lineNumber: number, column: number): string;
	getLineContent(lineNumber: number): string;
}

export interface IIndentConverter {
	shiftIndent(indentation: string): string;
	unshiftIndent(indentation: string): string;
	normalizeIndentation?(indentation: string): string;
}

export interface ILanguageConfigurationService {
	readonly _serviceBrand: undefined;

	onDidChange: Event<LanguageConfigurationServiceChangeEvent>;
	getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration;
}

export class LanguageConfigurationServiceChangeEvent {
	constructor(public readonly languageId: string | undefined) { }

	public affects(languageId: string): boolean {
		return !this.languageId ? true : this.languageId === languageId;
	}
}

export const ILanguageConfigurationService = createDecorator<ILanguageConfigurationService>('languageConfigurationService');

export class LanguageConfigurationService extends Disposable implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	private readonly onDidChangeEmitter = this._register(new Emitter<LanguageConfigurationServiceChangeEvent>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private readonly configurations = new Map<string, ResolvedLanguageConfiguration>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModeService private readonly modeService: IModeService
	) {
		super();

		const languageConfigKeys = new Set(Object.values(customizedLanguageConfigKeys));

		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			const globalConfigChanged = e.change.keys.some((k) =>
				languageConfigKeys.has(k)
			);
			const localConfigChanged = e.change.overrides
				.filter(([overrideLangName, keys]) =>
					keys.some((k) => languageConfigKeys.has(k))
				)
				.map(([overrideLangName]) => this.modeService.validateLanguageId(overrideLangName));

			if (globalConfigChanged) {
				this.configurations.clear();
				this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(undefined));
			} else {
				for (const languageId of localConfigChanged) {
					if (languageId) {
						this.configurations.delete(languageId);
						this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(languageId));
					}
				}
			}
		}));

		this._register(LanguageConfigurationRegistry.onDidChange((e) => {
			this.configurations.delete(e.languageId);
			this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
		}));
	}

	public getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration {
		let result = this.configurations.get(languageId);
		if (!result) {
			result = computeConfig(languageId, this.configurationService, this.modeService);
			this.configurations.set(languageId, result);
		}
		return result;
	}
}

function computeConfig(
	languageId: string,
	configurationService: IConfigurationService,
	modeService: IModeService,
): ResolvedLanguageConfiguration {
	let languageConfig = LanguageConfigurationRegistry.getLanguageConfiguration(languageId);

	if (!languageConfig) {
		const validLanguageId = modeService.validateLanguageId(languageId);
		if (!validLanguageId) {
			throw new Error('Unexpected languageId');
		}
		languageConfig = new ResolvedLanguageConfiguration(validLanguageId, {});
	}

	const customizedConfig = getCustomizedLanguageConfig(languageConfig.languageId, configurationService);
	const data = combineLanguageConfigurations([languageConfig.underlyingConfig, customizedConfig]);
	const config = new ResolvedLanguageConfiguration(languageConfig.languageId, data);
	return config;
}

const customizedLanguageConfigKeys = {
	brackets: 'editor.language.brackets',
	colorizedBracketPairs: 'editor.language.colorizedBracketPairs'
};

function getCustomizedLanguageConfig(languageId: string, configurationService: IConfigurationService): LanguageConfiguration {
	const brackets = configurationService.getValue(customizedLanguageConfigKeys.brackets, {
		overrideIdentifier: languageId,
	});

	const colorizedBracketPairs = configurationService.getValue(customizedLanguageConfigKeys.colorizedBracketPairs, {
		overrideIdentifier: languageId,
	});

	return {
		brackets: validateBracketPairs(brackets),
		colorizedBracketPairs: validateBracketPairs(colorizedBracketPairs),
	};
}

function validateBracketPairs(data: unknown): CharacterPair[] | undefined {
	if (!Array.isArray(data)) {
		return undefined;
	}
	return data.map(pair => {
		if (!Array.isArray(pair) || pair.length !== 2) {
			return undefined;
		}
		return [pair[0], pair[1]] as CharacterPair;
	}).filter((p): p is CharacterPair => !!p);
}

export class LanguageConfigurationChangeEvent {
	constructor(public readonly languageId: string) { }
}

export class LanguageConfigurationRegistryImpl {
	private readonly _entries = new Map<string, ComposedLanguageConfiguration>();

	private readonly _onDidChange = new Emitter<LanguageConfigurationChangeEvent>();
	public readonly onDidChange: Event<LanguageConfigurationChangeEvent> = this._onDidChange.event;

	/**
	 * @param priority Use a higher number for higher priority
	 */
	public register(languageId: string, configuration: LanguageConfiguration, priority: number = 0): IDisposable {
		let entries = this._entries.get(languageId);
		if (!entries) {
			entries = new ComposedLanguageConfiguration(languageId);
			this._entries.set(languageId, entries);
		}

		const disposable = entries.register(configuration, priority);
		this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));

		return toDisposable(() => {
			disposable.dispose();
			this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
		});
	}

	public getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration | null {
		let entries = this._entries.get(languageId);
		return entries?.getResolvedConfiguration() || null;
	}

	public getIndentationRules(languageId: string): IndentationRule | null {
		const value = this.getLanguageConfiguration(languageId);
		return value ? value.indentationRules || null : null;
	}

	// begin electricCharacter

	private _getElectricCharacterSupport(languageId: string): BracketElectricCharacterSupport | null {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return null;
		}
		return value.electricCharacter || null;
	}

	public getElectricCharacters(languageId: string): string[] {
		let electricCharacterSupport = this._getElectricCharacterSupport(languageId);
		if (!electricCharacterSupport) {
			return [];
		}
		return electricCharacterSupport.getElectricCharacters();
	}

	/**
	 * Should return opening bracket type to match indentation with
	 */
	public onElectricCharacter(character: string, context: LineTokens, column: number): IElectricAction | null {
		let scopedLineTokens = createScopedLineTokens(context, column - 1);
		let electricCharacterSupport = this._getElectricCharacterSupport(scopedLineTokens.languageId);
		if (!electricCharacterSupport) {
			return null;
		}
		return electricCharacterSupport.onElectricCharacter(character, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
	}

	// end electricCharacter

	public getComments(languageId: string): ICommentsConfiguration | null {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return null;
		}
		return value.comments || null;
	}

	// begin characterPair

	private _getCharacterPairSupport(languageId: string): CharacterPairSupport | null {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return null;
		}
		return value.characterPair || null;
	}

	public getAutoClosingPairs(languageId: string): AutoClosingPairs {
		const characterPairSupport = this._getCharacterPairSupport(languageId);
		return new AutoClosingPairs(characterPairSupport ? characterPairSupport.getAutoClosingPairs() : []);
	}

	public getAutoCloseBeforeSet(languageId: string): string {
		let characterPairSupport = this._getCharacterPairSupport(languageId);
		if (!characterPairSupport) {
			return CharacterPairSupport.DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED;
		}
		return characterPairSupport.getAutoCloseBeforeSet();
	}

	public getSurroundingPairs(languageId: string): IAutoClosingPair[] {
		let characterPairSupport = this._getCharacterPairSupport(languageId);
		if (!characterPairSupport) {
			return [];
		}
		return characterPairSupport.getSurroundingPairs();
	}

	public shouldAutoClosePair(autoClosingPair: StandardAutoClosingPairConditional, context: LineTokens, column: number): boolean {
		const scopedLineTokens = createScopedLineTokens(context, column - 1);
		return CharacterPairSupport.shouldAutoClosePair(autoClosingPair, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
	}

	// end characterPair

	public getWordDefinition(languageId: string): RegExp {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return ensureValidWordDefinition(null);
		}
		return ensureValidWordDefinition(value.wordDefinition || null);
	}

	public getWordDefinitions(): [string, RegExp][] {
		let result: [string, RegExp][] = [];
		for (const [language, entries] of this._entries) {
			const value = entries.getResolvedConfiguration();
			if (value) {
				result.push([language, value.wordDefinition]);
			}
		}
		return result;
	}

	public getFoldingRules(languageId: string): FoldingRules {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return {};
		}
		return value.foldingRules;
	}

	// begin Indent Rules

	public getIndentRulesSupport(languageId: string): IndentRulesSupport | null {
		let value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return null;
		}
		return value.indentRulesSupport || null;
	}

	/**
	 * Get nearest preceding line which doesn't match unIndentPattern or contains all whitespace.
	 * Result:
	 * -1: run into the boundary of embedded languages
	 * 0: every line above are invalid
	 * else: nearest preceding line of the same language
	 */
	private getPrecedingValidLine(model: IVirtualModel, lineNumber: number, indentRulesSupport: IndentRulesSupport) {
		let languageID = model.getLanguageIdAtPosition(lineNumber, 0);
		if (lineNumber > 1) {
			let lastLineNumber: number;
			let resultLineNumber = -1;

			for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
				if (model.getLanguageIdAtPosition(lastLineNumber, 0) !== languageID) {
					return resultLineNumber;
				}
				let text = model.getLineContent(lastLineNumber);
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
	public getInheritIndentForLine(autoIndent: EditorAutoIndentStrategy, model: IVirtualModel, lineNumber: number, honorIntentialIndent: boolean = true): { indentation: string; action: IndentAction | null; line?: number; } | null {
		if (autoIndent < EditorAutoIndentStrategy.Full) {
			return null;
		}

		const indentRulesSupport = this.getIndentRulesSupport(model.getLanguageId());
		if (!indentRulesSupport) {
			return null;
		}

		if (lineNumber <= 1) {
			return {
				indentation: '',
				action: null
			};
		}

		const precedingUnIgnoredLine = this.getPrecedingValidLine(model, lineNumber, indentRulesSupport);
		if (precedingUnIgnoredLine < 0) {
			return null;
		} else if (precedingUnIgnoredLine < 1) {
			return {
				indentation: '',
				action: null
			};
		}

		const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
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
					if (indentRulesSupport.shouldIndentNextLine(model.getLineContent(i))) {
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
					const lineContent = model.getLineContent(i);
					if (indentRulesSupport.shouldIncrease(lineContent)) {
						return {
							indentation: strings.getLeadingWhitespace(lineContent),
							action: IndentAction.Indent,
							line: i
						};
					} else if (indentRulesSupport.shouldIndentNextLine(lineContent)) {
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

	public getGoodIndentForLine(autoIndent: EditorAutoIndentStrategy, virtualModel: IVirtualModel, languageId: string, lineNumber: number, indentConverter: IIndentConverter): string | null {
		if (autoIndent < EditorAutoIndentStrategy.Full) {
			return null;
		}

		const richEditSupport = this.getLanguageConfiguration(languageId);
		if (!richEditSupport) {
			return null;
		}

		const indentRulesSupport = this.getIndentRulesSupport(languageId);
		if (!indentRulesSupport) {
			return null;
		}

		const indent = this.getInheritIndentForLine(autoIndent, virtualModel, lineNumber);
		const lineContent = virtualModel.getLineContent(lineNumber);

		if (indent) {
			const inheritLine = indent.line;
			if (inheritLine !== undefined) {
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

					if (indentRulesSupport.shouldDecrease(lineContent)) {
						indentation = indentConverter.unshiftIndent(indentation);
					}

					if (enterResult.appendText) {
						indentation += enterResult.appendText;
					}

					return strings.getLeadingWhitespace(indentation);
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

	public getIndentForEnter(autoIndent: EditorAutoIndentStrategy, model: ITextModel, range: Range, indentConverter: IIndentConverter): { beforeEnter: string, afterEnter: string } | null {
		if (autoIndent < EditorAutoIndentStrategy.Full) {
			return null;
		}
		model.forceTokenization(range.startLineNumber);
		const lineTokens = model.getLineTokens(range.startLineNumber);
		const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
		const scopedLineText = scopedLineTokens.getLineContent();

		let embeddedLanguage = false;
		let beforeEnterText: string;
		if (scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId) {
			// we are in the embeded language content
			embeddedLanguage = true; // if embeddedLanguage is true, then we don't touch the indentation of current line
			beforeEnterText = scopedLineText.substr(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		} else {
			beforeEnterText = lineTokens.getLineContent().substring(0, range.startColumn - 1);
		}

		let afterEnterText: string;
		if (range.isEmpty()) {
			afterEnterText = scopedLineText.substr(range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		} else {
			const endScopedLineTokens = this.getScopedLineTokens(model, range.endLineNumber, range.endColumn);
			afterEnterText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - scopedLineTokens.firstCharOffset);
		}

		const indentRulesSupport = this.getIndentRulesSupport(scopedLineTokens.languageId);
		if (!indentRulesSupport) {
			return null;
		}

		const beforeEnterResult = beforeEnterText;
		const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterText);

		const virtualModel: IVirtualModel = {
			getLineTokens: (lineNumber: number) => {
				return model.getLineTokens(lineNumber);
			},
			getLanguageId: () => {
				return model.getLanguageId();
			},
			getLanguageIdAtPosition: (lineNumber: number, column: number) => {
				return model.getLanguageIdAtPosition(lineNumber, column);
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
		const afterEnterAction = this.getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1);
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
	public getIndentActionForType(autoIndent: EditorAutoIndentStrategy, model: ITextModel, range: Range, ch: string, indentConverter: IIndentConverter): string | null {
		if (autoIndent < EditorAutoIndentStrategy.Full) {
			return null;
		}
		const scopedLineTokens = this.getScopedLineTokens(model, range.startLineNumber, range.startColumn);

		if (scopedLineTokens.firstCharOffset) {
			// this line has mixed languages and indentation rules will not work
			return null;
		}

		const indentRulesSupport = this.getIndentRulesSupport(scopedLineTokens.languageId);
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
			const endScopedLineTokens = this.getScopedLineTokens(model, range.endLineNumber, range.endColumn);
			afterTypeText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - scopedLineTokens.firstCharOffset);
		}

		// If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
		// Users might change the indentation by purpose and we should honor that instead of readjusting.
		if (!indentRulesSupport.shouldDecrease(beforeTypeText + afterTypeText) && indentRulesSupport.shouldDecrease(beforeTypeText + ch + afterTypeText)) {
			// after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
			// 1. Get inherited indent action
			const r = this.getInheritIndentForLine(autoIndent, model, range.startLineNumber, false);
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

	public getIndentMetadata(model: ITextModel, lineNumber: number): number | null {
		const indentRulesSupport = this.getIndentRulesSupport(model.getLanguageId());
		if (!indentRulesSupport) {
			return null;
		}
		if (lineNumber < 1 || lineNumber > model.getLineCount()) {
			return null;
		}
		return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
	}

	// end Indent Rules

	// begin onEnter

	public getEnterAction(autoIndent: EditorAutoIndentStrategy, model: ITextModel, range: Range): CompleteEnterAction | null {
		const scopedLineTokens = this.getScopedLineTokens(model, range.startLineNumber, range.startColumn);
		const richEditSupport = this.getLanguageConfiguration(scopedLineTokens.languageId);
		if (!richEditSupport) {
			return null;
		}

		const scopedLineText = scopedLineTokens.getLineContent();
		const beforeEnterText = scopedLineText.substr(0, range.startColumn - 1 - scopedLineTokens.firstCharOffset);

		// selection support
		let afterEnterText: string;
		if (range.isEmpty()) {
			afterEnterText = scopedLineText.substr(range.startColumn - 1 - scopedLineTokens.firstCharOffset);
		} else {
			const endScopedLineTokens = this.getScopedLineTokens(model, range.endLineNumber, range.endColumn);
			afterEnterText = endScopedLineTokens.getLineContent().substr(range.endColumn - 1 - scopedLineTokens.firstCharOffset);
		}

		let previousLineText = '';
		if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			const oneLineAboveScopedLineTokens = this.getScopedLineTokens(model, range.startLineNumber - 1);
			if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
				// The line above ends with text belonging to the same mode
				previousLineText = oneLineAboveScopedLineTokens.getLineContent();
			}
		}

		const enterResult = richEditSupport.onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText);
		if (!enterResult) {
			return null;
		}

		const indentAction = enterResult.indentAction;
		let appendText = enterResult.appendText;
		const removeText = enterResult.removeText || 0;

		// Here we add `\t` to appendText first because enterAction is leveraging appendText and removeText to change indentation.
		if (!appendText) {
			if (
				(indentAction === IndentAction.Indent) ||
				(indentAction === IndentAction.IndentOutdent)
			) {
				appendText = '\t';
			} else {
				appendText = '';
			}
		} else if (indentAction === IndentAction.Indent) {
			appendText = '\t' + appendText;
		}

		let indentation = this.getIndentationAtPosition(model, range.startLineNumber, range.startColumn);
		if (removeText) {
			indentation = indentation.substring(0, indentation.length - removeText);
		}

		return {
			indentAction: indentAction,
			appendText: appendText,
			removeText: removeText,
			indentation: indentation
		};
	}

	public getIndentationAtPosition(model: ITextModel, lineNumber: number, column: number): string {
		const lineText = model.getLineContent(lineNumber);
		let indentation = strings.getLeadingWhitespace(lineText);
		if (indentation.length > column - 1) {
			indentation = indentation.substring(0, column - 1);
		}
		return indentation;
	}

	private getScopedLineTokens(model: ITextModel, lineNumber: number, columnNumber?: number): ScopedLineTokens {
		model.forceTokenization(lineNumber);
		const lineTokens = model.getLineTokens(lineNumber);
		const column = (typeof columnNumber === 'undefined' ? model.getLineMaxColumn(lineNumber) - 1 : columnNumber - 1);
		return createScopedLineTokens(lineTokens, column);
	}

	// end onEnter

	public getBracketsSupport(languageId: string): RichEditBrackets | null {
		const value = this.getLanguageConfiguration(languageId);
		if (!value) {
			return null;
		}
		return value.brackets || null;
	}

	public getColorizedBracketPairs(languageId: string): readonly CharacterPair[] {
		return this.getLanguageConfiguration(languageId)?.characterPair.getColorizedBrackets() || [];
	}
}

export const LanguageConfigurationRegistry = new LanguageConfigurationRegistryImpl();

class ComposedLanguageConfiguration {
	private readonly _entries: LanguageConfigurationContribution[];
	private _order: number;
	private _resolved: ResolvedLanguageConfiguration | null = null;

	constructor(public readonly languageId: string) {
		this._entries = [];
		this._order = 0;
		this._resolved = null;
	}

	public register(
		configuration: LanguageConfiguration,
		priority: number
	): IDisposable {
		const entry = new LanguageConfigurationContribution(
			configuration,
			priority,
			++this._order
		);
		this._entries.push(entry);
		this._resolved = null;
		return toDisposable(() => {
			for (let i = 0; i < this._entries.length; i++) {
				if (this._entries[i] === entry) {
					this._entries.splice(i, 1);
					this._resolved = null;
					break;
				}
			}
		});
	}

	public getResolvedConfiguration(): ResolvedLanguageConfiguration | null {
		if (!this._resolved) {
			const config = this._resolve();
			if (config) {
				this._resolved = new ResolvedLanguageConfiguration(
					this.languageId,
					config
				);
			}
		}
		return this._resolved;
	}

	private _resolve(): LanguageConfiguration | null {
		if (this._entries.length === 0) {
			return null;
		}
		this._entries.sort(LanguageConfigurationContribution.cmp);
		return combineLanguageConfigurations(this._entries.map(e => e.configuration));
	}
}

function combineLanguageConfigurations(configs: LanguageConfiguration[]): LanguageConfiguration {
	let result: ExplicitLanguageConfiguration = {
		comments: undefined,
		brackets: undefined,
		wordPattern: undefined,
		indentationRules: undefined,
		onEnterRules: undefined,
		autoClosingPairs: undefined,
		surroundingPairs: undefined,
		autoCloseBefore: undefined,
		folding: undefined,
		colorizedBracketPairs: undefined,
		__electricCharacterSupport: undefined,
	};
	for (const entry of configs) {
		result = {
			comments: entry.comments || result.comments,
			brackets: entry.brackets || result.brackets,
			wordPattern: entry.wordPattern || result.wordPattern,
			indentationRules: entry.indentationRules || result.indentationRules,
			onEnterRules: entry.onEnterRules || result.onEnterRules,
			autoClosingPairs: entry.autoClosingPairs || result.autoClosingPairs,
			surroundingPairs: entry.surroundingPairs || result.surroundingPairs,
			autoCloseBefore: entry.autoCloseBefore || result.autoCloseBefore,
			folding: entry.folding || result.folding,
			colorizedBracketPairs: entry.colorizedBracketPairs || result.colorizedBracketPairs,
			__electricCharacterSupport: entry.__electricCharacterSupport || result.__electricCharacterSupport,
		};
	}

	return result;
}

class LanguageConfigurationContribution {
	constructor(
		public readonly configuration: LanguageConfiguration,
		public readonly priority: number,
		public readonly order: number
	) { }

	public static cmp(a: LanguageConfigurationContribution, b: LanguageConfigurationContribution) {
		if (a.priority === b.priority) {
			// higher order last
			return a.order - b.order;
		}
		// higher priority last
		return a.priority - b.priority;
	}
}

/**
 * Immutable.
*/
export class ResolvedLanguageConfiguration {
	private _brackets: RichEditBrackets | null;
	private _electricCharacter: BracketElectricCharacterSupport | null;
	private readonly _onEnterSupport: OnEnterSupport | null;

	public readonly comments: ICommentsConfiguration | null;
	public readonly characterPair: CharacterPairSupport;
	public readonly wordDefinition: RegExp;
	public readonly indentRulesSupport: IndentRulesSupport | null;
	public readonly indentationRules: IndentationRule | undefined;
	public readonly foldingRules: FoldingRules;

	constructor(
		public readonly languageId: string,
		public readonly underlyingConfig: LanguageConfiguration
	) {
		this._brackets = null;
		this._electricCharacter = null;
		this._onEnterSupport =
			this.underlyingConfig.brackets ||
				this.underlyingConfig.indentationRules ||
				this.underlyingConfig.onEnterRules
				? new OnEnterSupport(this.underlyingConfig)
				: null;
		this.comments = ResolvedLanguageConfiguration._handleComments(this.underlyingConfig);
		this.characterPair = new CharacterPairSupport(this.underlyingConfig);

		this.wordDefinition = this.underlyingConfig.wordPattern || DEFAULT_WORD_REGEXP;
		this.indentationRules = this.underlyingConfig.indentationRules;
		if (this.underlyingConfig.indentationRules) {
			this.indentRulesSupport = new IndentRulesSupport(
				this.underlyingConfig.indentationRules
			);
		} else {
			this.indentRulesSupport = null;
		}
		this.foldingRules = this.underlyingConfig.folding || {};
	}

	public getWordDefinition(): RegExp {
		return ensureValidWordDefinition(this.wordDefinition);
	}

	public get brackets(): RichEditBrackets | null {
		if (!this._brackets && this.underlyingConfig.brackets) {
			this._brackets = new RichEditBrackets(
				this.languageId,
				this.underlyingConfig.brackets
			);
		}
		return this._brackets;
	}

	public get electricCharacter(): BracketElectricCharacterSupport | null {
		if (!this._electricCharacter) {
			this._electricCharacter = new BracketElectricCharacterSupport(
				this.brackets
			);
		}
		return this._electricCharacter;
	}

	public onEnter(
		autoIndent: EditorAutoIndentStrategy,
		previousLineText: string,
		beforeEnterText: string,
		afterEnterText: string
	): EnterAction | null {
		if (!this._onEnterSupport) {
			return null;
		}
		return this._onEnterSupport.onEnter(
			autoIndent,
			previousLineText,
			beforeEnterText,
			afterEnterText
		);
	}

	private static _handleComments(
		conf: LanguageConfiguration
	): ICommentsConfiguration | null {
		let commentRule = conf.comments;
		if (!commentRule) {
			return null;
		}

		// comment configuration
		let comments: ICommentsConfiguration = {};

		if (commentRule.lineComment) {
			comments.lineCommentToken = commentRule.lineComment;
		}
		if (commentRule.blockComment) {
			let [blockStart, blockEnd] = commentRule.blockComment;
			comments.blockCommentStartToken = blockStart;
			comments.blockCommentEndToken = blockEnd;
		}

		return comments;
	}
}

registerSingleton(ILanguageConfigurationService, LanguageConfigurationService);
