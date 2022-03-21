/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue, findLast } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { BracketPairInfo } from 'vs/editor/common/textModelBracketPairs';
import type { TextModel } from 'vs/editor/common/model/textModel';
import { TextModelPart } from 'vs/editor/common/model/textModelPart';
import { computeIndentLevel } from 'vs/editor/common/model/utils';
import { ILanguageConfigurationService, ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { BracketGuideOptions, HorizontalGuidesState, IActiveIndentGuideInfo, IGuidesTextModelPart, IndentGuide, IndentGuideHorizontalLine } from 'vs/editor/common/textModelGuides';

export class GuidesTextModelPart extends TextModelPart implements IGuidesTextModelPart {
	constructor(
		private readonly textModel: TextModel,
		private readonly languageConfigurationService: ILanguageConfigurationService
	) {
		super();
	}

	private getLanguageConfiguration(
		languageId: string
	): ResolvedLanguageConfiguration {
		return this.languageConfigurationService.getLanguageConfiguration(
			languageId
		);
	}

	private _computeIndentLevel(lineIndex: number): number {
		return computeIndentLevel(
			this.textModel.getLineContent(lineIndex + 1),
			this.textModel.getOptions().tabSize
		);
	}

	public getActiveIndentGuide(
		lineNumber: number,
		minLineNumber: number,
		maxLineNumber: number
	): IActiveIndentGuideInfo {
		this.assertNotDisposed();
		const lineCount = this.textModel.getLineCount();

		if (lineNumber < 1 || lineNumber > lineCount) {
			throw new Error('Illegal value for lineNumber');
		}

		const foldingRules = this.getLanguageConfiguration(
			this.textModel.getLanguageId()
		).foldingRules;
		const offSide = Boolean(foldingRules && foldingRules.offSide);

		let up_aboveContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let up_aboveContentLineIndent = -1;
		let up_belowContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let up_belowContentLineIndent = -1;
		const up_resolveIndents = (lineNumber: number) => {
			if (
				up_aboveContentLineIndex !== -1 &&
				(up_aboveContentLineIndex === -2 ||
					up_aboveContentLineIndex > lineNumber - 1)
			) {
				up_aboveContentLineIndex = -1;
				up_aboveContentLineIndent = -1;

				// must find previous line with content
				for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						up_aboveContentLineIndex = lineIndex;
						up_aboveContentLineIndent = indent;
						break;
					}
				}
			}

			if (up_belowContentLineIndex === -2) {
				up_belowContentLineIndex = -1;
				up_belowContentLineIndent = -1;

				// must find next line with content
				for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						up_belowContentLineIndex = lineIndex;
						up_belowContentLineIndent = indent;
						break;
					}
				}
			}
		};

		let down_aboveContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let down_aboveContentLineIndent = -1;
		let down_belowContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let down_belowContentLineIndent = -1;
		const down_resolveIndents = (lineNumber: number) => {
			if (down_aboveContentLineIndex === -2) {
				down_aboveContentLineIndex = -1;
				down_aboveContentLineIndent = -1;

				// must find previous line with content
				for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						down_aboveContentLineIndex = lineIndex;
						down_aboveContentLineIndent = indent;
						break;
					}
				}
			}

			if (
				down_belowContentLineIndex !== -1 &&
				(down_belowContentLineIndex === -2 ||
					down_belowContentLineIndex < lineNumber - 1)
			) {
				down_belowContentLineIndex = -1;
				down_belowContentLineIndent = -1;

				// must find next line with content
				for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						down_belowContentLineIndex = lineIndex;
						down_belowContentLineIndent = indent;
						break;
					}
				}
			}
		};

		let startLineNumber = 0;
		let goUp = true;
		let endLineNumber = 0;
		let goDown = true;
		let indent = 0;

		let initialIndent = 0;

		for (let distance = 0; goUp || goDown; distance++) {
			const upLineNumber = lineNumber - distance;
			const downLineNumber = lineNumber + distance;

			if (distance > 1 && (upLineNumber < 1 || upLineNumber < minLineNumber)) {
				goUp = false;
			}
			if (
				distance > 1 &&
				(downLineNumber > lineCount || downLineNumber > maxLineNumber)
			) {
				goDown = false;
			}
			if (distance > 50000) {
				// stop processing
				goUp = false;
				goDown = false;
			}

			let upLineIndentLevel: number = -1;
			if (goUp && upLineNumber >= 1) {
				// compute indent level going up
				const currentIndent = this._computeIndentLevel(upLineNumber - 1);
				if (currentIndent >= 0) {
					// This line has content (besides whitespace)
					// Use the line's indent
					up_belowContentLineIndex = upLineNumber - 1;
					up_belowContentLineIndent = currentIndent;
					upLineIndentLevel = Math.ceil(
						currentIndent / this.textModel.getOptions().indentSize
					);
				} else {
					up_resolveIndents(upLineNumber);
					upLineIndentLevel = this._getIndentLevelForWhitespaceLine(
						offSide,
						up_aboveContentLineIndent,
						up_belowContentLineIndent
					);
				}
			}

			let downLineIndentLevel = -1;
			if (goDown && downLineNumber <= lineCount) {
				// compute indent level going down
				const currentIndent = this._computeIndentLevel(downLineNumber - 1);
				if (currentIndent >= 0) {
					// This line has content (besides whitespace)
					// Use the line's indent
					down_aboveContentLineIndex = downLineNumber - 1;
					down_aboveContentLineIndent = currentIndent;
					downLineIndentLevel = Math.ceil(
						currentIndent / this.textModel.getOptions().indentSize
					);
				} else {
					down_resolveIndents(downLineNumber);
					downLineIndentLevel = this._getIndentLevelForWhitespaceLine(
						offSide,
						down_aboveContentLineIndent,
						down_belowContentLineIndent
					);
				}
			}

			if (distance === 0) {
				initialIndent = upLineIndentLevel;
				continue;
			}

			if (distance === 1) {
				if (
					downLineNumber <= lineCount &&
					downLineIndentLevel >= 0 &&
					initialIndent + 1 === downLineIndentLevel
				) {
					// This is the beginning of a scope, we have special handling here, since we want the
					// child scope indent to be active, not the parent scope
					goUp = false;
					startLineNumber = downLineNumber;
					endLineNumber = downLineNumber;
					indent = downLineIndentLevel;
					continue;
				}

				if (
					upLineNumber >= 1 &&
					upLineIndentLevel >= 0 &&
					upLineIndentLevel - 1 === initialIndent
				) {
					// This is the end of a scope, just like above
					goDown = false;
					startLineNumber = upLineNumber;
					endLineNumber = upLineNumber;
					indent = upLineIndentLevel;
					continue;
				}

				startLineNumber = lineNumber;
				endLineNumber = lineNumber;
				indent = initialIndent;
				if (indent === 0) {
					// No need to continue
					return { startLineNumber, endLineNumber, indent };
				}
			}

			if (goUp) {
				if (upLineIndentLevel >= indent) {
					startLineNumber = upLineNumber;
				} else {
					goUp = false;
				}
			}
			if (goDown) {
				if (downLineIndentLevel >= indent) {
					endLineNumber = downLineNumber;
				} else {
					goDown = false;
				}
			}
		}

		return { startLineNumber, endLineNumber, indent };
	}

	public getLinesBracketGuides(
		startLineNumber: number,
		endLineNumber: number,
		activePosition: IPosition | null,
		options: BracketGuideOptions
	): IndentGuide[][] {
		const result: IndentGuide[][] = [];
		const bracketPairs =
			this.textModel.bracketPairs.getBracketPairsInRangeWithMinIndentation(
				new Range(
					startLineNumber,
					1,
					endLineNumber,
					this.textModel.getLineMaxColumn(endLineNumber)
				)
			);

		let activeBracketPairRange: Range | undefined = undefined;
		if (activePosition && bracketPairs.length > 0) {
			const bracketsContainingActivePosition = (
				startLineNumber <= activePosition.lineNumber &&
					activePosition.lineNumber <= endLineNumber
					// We don't need to query the brackets again if the cursor is in the viewport
					? bracketPairs
					: this.textModel.bracketPairs.getBracketPairsInRange(
						Range.fromPositions(activePosition)
					)
			).filter((bp) => Range.strictContainsPosition(bp.range, activePosition));

			activeBracketPairRange = findLast(
				bracketsContainingActivePosition,
				/* Exclude single line bracket pairs for cases such as
				 * ```
				 * function test() {
				 * 		if (true) { | }
				 * }
				 * ```
				 */
				(i) => i.range.startLineNumber !== i.range.endLineNumber
			)?.range;
		}

		const queue = new ArrayQueue(bracketPairs);
		/** Indexed by nesting level */
		const activeGuides = new Array<{
			nestingLevel: number;
			guideVisibleColumn: number;
			start: Position;
			visibleStartColumn: number;
			end: Position;
			visibleEndColumn: number;
			bracketPair: BracketPairInfo;
			renderHorizontalEndLineAtTheBottom: boolean;
		} | null>();
		const nextGuides = new Array<IndentGuide>();
		const colorProvider = new BracketPairGuidesClassNames();

		for (
			let lineNumber = startLineNumber;
			lineNumber <= endLineNumber;
			lineNumber++
		) {
			let guides = new Array<IndentGuide>();
			if (nextGuides.length > 0) {
				guides = guides.concat(nextGuides);
				nextGuides.length = 0;
			}
			result.push(guides);

			// Update activeGuides
			for (const pair of queue.takeWhile(
				(b) => b.openingBracketRange.startLineNumber <= lineNumber
			) || []) {
				if (pair.range.startLineNumber === pair.range.endLineNumber) {
					// ignore single line brackets
					continue;
				}
				const guideVisibleColumn = Math.min(
					this.getVisibleColumnFromPosition(
						pair.openingBracketRange.getStartPosition()
					),
					this.getVisibleColumnFromPosition(
						pair.closingBracketRange?.getStartPosition() ??
						pair.range.getEndPosition()
					),
					pair.minVisibleColumnIndentation + 1
				);
				let renderHorizontalEndLineAtTheBottom = false;
				if (pair.closingBracketRange) {
					const firstNonWsIndex = strings.firstNonWhitespaceIndex(
						this.textModel.getLineContent(
							pair.closingBracketRange.startLineNumber
						)
					);
					if (firstNonWsIndex < pair.closingBracketRange.startColumn - 1) {
						renderHorizontalEndLineAtTheBottom = true;
					}
				}

				const start = pair.openingBracketRange.getStartPosition();
				const end =
					pair.closingBracketRange?.getStartPosition() ??
					pair.range.getEndPosition();

				if (pair.closingBracketRange === undefined) {
					// Don't show guides for bracket pairs that are not balanced.
					// See #135125.
					activeGuides[pair.nestingLevel] = null;
				} else {
					activeGuides[pair.nestingLevel] = {
						nestingLevel: pair.nestingLevel,
						guideVisibleColumn,
						start,
						visibleStartColumn: this.getVisibleColumnFromPosition(start),
						end,
						visibleEndColumn: this.getVisibleColumnFromPosition(end),
						bracketPair: pair,
						renderHorizontalEndLineAtTheBottom,
					};
				}
			}

			for (const line of activeGuides) {
				if (!line) {
					continue;
				}
				const isActive =
					activeBracketPairRange &&
					line.bracketPair.range.equalsRange(activeBracketPairRange);

				const className =
					colorProvider.getInlineClassNameOfLevel(line.nestingLevel) +
					(options.highlightActive && isActive
						? ' ' + colorProvider.activeClassName
						: '');

				if (
					(isActive &&
						options.horizontalGuides !==
						HorizontalGuidesState.Disabled) ||
					(options.includeInactive &&
						options.horizontalGuides === HorizontalGuidesState.Enabled)
				) {
					if (line.start.lineNumber === lineNumber) {
						if (line.guideVisibleColumn < line.visibleStartColumn) {
							guides.push(
								new IndentGuide(
									line.guideVisibleColumn,
									className,
									new IndentGuideHorizontalLine(false, line.start.column)
								)
							);
						}
					}
					if (line.end.lineNumber === lineNumber + 1) {
						// The next line might have horizontal guides.
						// However, the next line might also have a new bracket pair with the same indentation,
						// so the current bracket pair might get replaced. That's why we push the guide to nextGuides one line ahead.
						if (line.guideVisibleColumn < line.visibleEndColumn) {
							nextGuides.push(
								new IndentGuide(
									line.guideVisibleColumn,
									className,
									new IndentGuideHorizontalLine(
										!line.renderHorizontalEndLineAtTheBottom,
										line.end.column
									)
								)
							);
						}
					}
				}
			}

			let lastVisibleColumnCount = Number.MAX_SAFE_INTEGER;
			// Going backwards, so the last guide potentially replaces others
			for (let i = activeGuides.length - 1; i >= 0; i--) {
				const line = activeGuides[i];
				if (!line) {
					continue;
				}
				const isActive =
					options.highlightActive &&
					activeBracketPairRange &&
					line.bracketPair.range.equalsRange(activeBracketPairRange);

				const className =
					colorProvider.getInlineClassNameOfLevel(line.nestingLevel) +
					(isActive ? ' ' + colorProvider.activeClassName : '');

				if (isActive || options.includeInactive) {
					if (
						line.renderHorizontalEndLineAtTheBottom &&
						line.end.lineNumber === lineNumber + 1
					) {
						nextGuides.push(
							new IndentGuide(line.guideVisibleColumn, className, null)
						);
					}
				}

				if (
					line.end.lineNumber <= lineNumber ||
					line.start.lineNumber >= lineNumber
				) {
					continue;
				}

				if (line.guideVisibleColumn >= lastVisibleColumnCount && !isActive) {
					// Don't render a guide on top of an existing guide, unless it is active.
					continue;
				}
				lastVisibleColumnCount = line.guideVisibleColumn;

				if (isActive || options.includeInactive) {
					guides.push(
						new IndentGuide(line.guideVisibleColumn, className, null)
					);
				}
			}

			guides.sort((a, b) => a.visibleColumn - b.visibleColumn);
		}
		return result;
	}

	private getVisibleColumnFromPosition(position: Position): number {
		return (
			CursorColumns.visibleColumnFromColumn(
				this.textModel.getLineContent(position.lineNumber),
				position.column,
				this.textModel.getOptions().tabSize
			) + 1
		);
	}

	public getLinesIndentGuides(
		startLineNumber: number,
		endLineNumber: number
	): number[] {
		this.assertNotDisposed();
		const lineCount = this.textModel.getLineCount();

		if (startLineNumber < 1 || startLineNumber > lineCount) {
			throw new Error('Illegal value for startLineNumber');
		}
		if (endLineNumber < 1 || endLineNumber > lineCount) {
			throw new Error('Illegal value for endLineNumber');
		}

		const options = this.textModel.getOptions();
		const foldingRules = this.getLanguageConfiguration(
			this.textModel.getLanguageId()
		).foldingRules;
		const offSide = Boolean(foldingRules && foldingRules.offSide);

		const result: number[] = new Array<number>(
			endLineNumber - startLineNumber + 1
		);

		let aboveContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let aboveContentLineIndent = -1;

		let belowContentLineIndex =
			-2; /* -2 is a marker for not having computed it */
		let belowContentLineIndent = -1;

		for (
			let lineNumber = startLineNumber;
			lineNumber <= endLineNumber;
			lineNumber++
		) {
			const resultIndex = lineNumber - startLineNumber;

			const currentIndent = this._computeIndentLevel(lineNumber - 1);
			if (currentIndent >= 0) {
				// This line has content (besides whitespace)
				// Use the line's indent
				aboveContentLineIndex = lineNumber - 1;
				aboveContentLineIndent = currentIndent;
				result[resultIndex] = Math.ceil(currentIndent / options.indentSize);
				continue;
			}

			if (aboveContentLineIndex === -2) {
				aboveContentLineIndex = -1;
				aboveContentLineIndent = -1;

				// must find previous line with content
				for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						aboveContentLineIndex = lineIndex;
						aboveContentLineIndent = indent;
						break;
					}
				}
			}

			if (
				belowContentLineIndex !== -1 &&
				(belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)
			) {
				belowContentLineIndex = -1;
				belowContentLineIndent = -1;

				// must find next line with content
				for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
					const indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						belowContentLineIndex = lineIndex;
						belowContentLineIndent = indent;
						break;
					}
				}
			}

			result[resultIndex] = this._getIndentLevelForWhitespaceLine(
				offSide,
				aboveContentLineIndent,
				belowContentLineIndent
			);
		}
		return result;
	}

	private _getIndentLevelForWhitespaceLine(
		offSide: boolean,
		aboveContentLineIndent: number,
		belowContentLineIndent: number
	): number {
		const options = this.textModel.getOptions();

		if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
			// At the top or bottom of the file
			return 0;
		} else if (aboveContentLineIndent < belowContentLineIndent) {
			// we are inside the region above
			return 1 + Math.floor(aboveContentLineIndent / options.indentSize);
		} else if (aboveContentLineIndent === belowContentLineIndent) {
			// we are in between two regions
			return Math.ceil(belowContentLineIndent / options.indentSize);
		} else {
			if (offSide) {
				// same level as region below
				return Math.ceil(belowContentLineIndent / options.indentSize);
			} else {
				// we are inside the region that ends below
				return 1 + Math.floor(belowContentLineIndent / options.indentSize);
			}
		}
	}
}

export class BracketPairGuidesClassNames {
	public readonly activeClassName = 'indent-active';

	getInlineClassNameOfLevel(level: number): string {
		// To support a dynamic amount of colors up to 6 colors,
		// we use a number that is a lcm of all numbers from 1 to 6.
		return `bracket-indent-guide lvl-${level % 30}`;
	}
}
