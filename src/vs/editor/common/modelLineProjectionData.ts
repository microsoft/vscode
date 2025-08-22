/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../base/common/assert.js';
import { WrappingIndent } from './config/editorOptions.js';
import { FontInfo } from './config/fontInfo.js';
import { Position } from './core/position.js';
import { InjectedTextCursorStops, InjectedTextOptions, PositionAffinity } from './model.js';
import { LineInjectedText } from './textModelEvents.js';

/**
 * *input*:
 * ```
 * xxxxxxxxxxxxxxxxxxxxxxxxxxx
 * ```
 *
 * -> Applying injections `[i...i]`, *inputWithInjections*:
 * ```
 * xxxxxx[iiiiiiiiii]xxxxxxxxxxxxxxxxx[ii]xxxx
 * ```
 *
 * -> breaking at offsets `|` in `xxxxxx[iiiiiii|iii]xxxxxxxxxxx|xxxxxx[ii]xxxx|`:
 * ```
 * xxxxxx[iiiiiii
 * iii]xxxxxxxxxxx
 * xxxxxx[ii]xxxx
 * ```
 *
 * -> applying wrappedTextIndentLength, *output*:
 * ```
 * xxxxxx[iiiiiii
 *    iii]xxxxxxxxxxx
 *    xxxxxx[ii]xxxx
 * ```
 */
export class ModelLineProjectionData {
	constructor(
		public injectionOffsets: number[] | null,
		/**
		 * `injectionOptions.length` must equal `injectionOffsets.length`
		 */
		public injectionOptions: InjectedTextOptions[] | null,
		/**
		 * Refers to offsets after applying injections to the source.
		 * The last break offset indicates the length of the source after applying injections.
		 */
		public breakOffsets: number[],
		/**
		 * Refers to offsets after applying injections
		 */
		public breakOffsetsVisibleColumn: number[],
		public wrappedTextIndentLength: number
	) {
	}

	public getOutputLineCount(): number {
		return this.breakOffsets.length;
	}

	public getMinOutputOffset(outputLineIndex: number): number {
		if (outputLineIndex > 0) {
			return this.wrappedTextIndentLength;
		}
		return 0;
	}

	public getLineLength(outputLineIndex: number): number {
		// These offsets refer to model text with injected text.
		const startOffset = outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0;
		const endOffset = this.breakOffsets[outputLineIndex];

		let lineLength = endOffset - startOffset;
		if (outputLineIndex > 0) {
			lineLength += this.wrappedTextIndentLength;
		}
		return lineLength;
	}

	public getMaxOutputOffset(outputLineIndex: number): number {
		return this.getLineLength(outputLineIndex);
	}

	public translateToInputOffset(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex > 0) {
			outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength);
		}

		const offsetInInputWithInjection = outputLineIndex === 0 ? outputOffset : this.breakOffsets[outputLineIndex - 1] + outputOffset;
		let offsetInInput = offsetInInputWithInjection;

		if (this.injectionOffsets !== null) {
			for (let i = 0; i < this.injectionOffsets.length; i++) {
				if (offsetInInput > this.injectionOffsets[i]) {
					if (offsetInInput < this.injectionOffsets[i] + this.injectionOptions![i].content.length) {
						// `inputOffset` is within injected text
						offsetInInput = this.injectionOffsets[i];
					} else {
						offsetInInput -= this.injectionOptions![i].content.length;
					}
				} else {
					break;
				}
			}
		}

		return offsetInInput;
	}

	public translateToOutputPosition(inputOffset: number, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		let inputOffsetInInputWithInjection = inputOffset;
		if (this.injectionOffsets !== null) {
			for (let i = 0; i < this.injectionOffsets.length; i++) {
				if (inputOffset < this.injectionOffsets[i]) {
					break;
				}

				if (affinity !== PositionAffinity.Right && inputOffset === this.injectionOffsets[i]) {
					break;
				}

				inputOffsetInInputWithInjection += this.injectionOptions![i].content.length;
			}
		}

		return this.offsetInInputWithInjectionsToOutputPosition(inputOffsetInInputWithInjection, affinity);
	}

	private offsetInInputWithInjectionsToOutputPosition(offsetInInputWithInjections: number, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		let low = 0;
		let high = this.breakOffsets.length - 1;
		let mid = 0;
		let midStart = 0;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;

			const midStop = this.breakOffsets[mid];
			midStart = mid > 0 ? this.breakOffsets[mid - 1] : 0;

			if (affinity === PositionAffinity.Left) {
				if (offsetInInputWithInjections <= midStart) {
					high = mid - 1;
				} else if (offsetInInputWithInjections > midStop) {
					low = mid + 1;
				} else {
					break;
				}
			} else {
				if (offsetInInputWithInjections < midStart) {
					high = mid - 1;
				} else if (offsetInInputWithInjections >= midStop) {
					low = mid + 1;
				} else {
					break;
				}
			}
		}

		let outputOffset = offsetInInputWithInjections - midStart;
		if (mid > 0) {
			outputOffset += this.wrappedTextIndentLength;
		}

		return new OutputPosition(mid, outputOffset);
	}

	public normalizeOutputPosition(outputLineIndex: number, outputOffset: number, affinity: PositionAffinity): OutputPosition {
		if (this.injectionOffsets !== null) {
			const offsetInInputWithInjections = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset);
			const normalizedOffsetInUnwrappedLine = this.normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections, affinity);
			if (normalizedOffsetInUnwrappedLine !== offsetInInputWithInjections) {
				// injected text caused a change
				return this.offsetInInputWithInjectionsToOutputPosition(normalizedOffsetInUnwrappedLine, affinity);
			}
		}

		if (affinity === PositionAffinity.Left) {
			if (outputLineIndex > 0 && outputOffset === this.getMinOutputOffset(outputLineIndex)) {
				return new OutputPosition(outputLineIndex - 1, this.getMaxOutputOffset(outputLineIndex - 1));
			}
		}
		else if (affinity === PositionAffinity.Right) {
			const maxOutputLineIndex = this.getOutputLineCount() - 1;
			if (outputLineIndex < maxOutputLineIndex && outputOffset === this.getMaxOutputOffset(outputLineIndex)) {
				return new OutputPosition(outputLineIndex + 1, this.getMinOutputOffset(outputLineIndex + 1));
			}
		}

		return new OutputPosition(outputLineIndex, outputOffset);
	}

	private outputPositionToOffsetInInputWithInjections(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex > 0) {
			outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength);
		}
		const result = (outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0) + outputOffset;
		return result;
	}

	private normalizeOffsetInInputWithInjectionsAroundInjections(offsetInInputWithInjections: number, affinity: PositionAffinity): number {
		const injectedText = this.getInjectedTextAtOffset(offsetInInputWithInjections);
		if (!injectedText) {
			return offsetInInputWithInjections;
		}

		if (affinity === PositionAffinity.None) {
			if (offsetInInputWithInjections === injectedText.offsetInInputWithInjections + injectedText.length
				&& hasRightCursorStop(this.injectionOptions![injectedText.injectedTextIndex].cursorStops)) {
				return injectedText.offsetInInputWithInjections + injectedText.length;
			} else {
				let result = injectedText.offsetInInputWithInjections;
				if (hasLeftCursorStop(this.injectionOptions![injectedText.injectedTextIndex].cursorStops)) {
					return result;
				}

				let index = injectedText.injectedTextIndex - 1;
				while (index >= 0 && this.injectionOffsets![index] === this.injectionOffsets![injectedText.injectedTextIndex]) {
					if (hasRightCursorStop(this.injectionOptions![index].cursorStops)) {
						break;
					}
					result -= this.injectionOptions![index].content.length;
					if (hasLeftCursorStop(this.injectionOptions![index].cursorStops)) {
						break;
					}
					index--;
				}

				return result;
			}
		} else if (affinity === PositionAffinity.Right || affinity === PositionAffinity.RightOfInjectedText) {
			let result = injectedText.offsetInInputWithInjections + injectedText.length;
			let index = injectedText.injectedTextIndex;
			// traverse all injected text that touch each other
			while (index + 1 < this.injectionOffsets!.length && this.injectionOffsets![index + 1] === this.injectionOffsets![index]) {
				result += this.injectionOptions![index + 1].content.length;
				index++;
			}
			return result;
		} else if (affinity === PositionAffinity.Left || affinity === PositionAffinity.LeftOfInjectedText) {
			// affinity is left
			let result = injectedText.offsetInInputWithInjections;
			let index = injectedText.injectedTextIndex;
			// traverse all injected text that touch each other
			while (index - 1 >= 0 && this.injectionOffsets![index - 1] === this.injectionOffsets![index]) {
				result -= this.injectionOptions![index - 1].content.length;
				index--;
			}
			return result;
		}

		assertNever(affinity);
	}

	public getInjectedText(outputLineIndex: number, outputOffset: number): InjectedText | null {
		const offset = this.outputPositionToOffsetInInputWithInjections(outputLineIndex, outputOffset);
		const injectedText = this.getInjectedTextAtOffset(offset);
		if (!injectedText) {
			return null;
		}
		return {
			options: this.injectionOptions![injectedText.injectedTextIndex]
		};
	}

	private getInjectedTextAtOffset(offsetInInputWithInjections: number): { injectedTextIndex: number; offsetInInputWithInjections: number; length: number } | undefined {
		const injectionOffsets = this.injectionOffsets;
		const injectionOptions = this.injectionOptions;

		if (injectionOffsets !== null) {
			let totalInjectedTextLengthBefore = 0;
			for (let i = 0; i < injectionOffsets.length; i++) {
				const length = injectionOptions![i].content.length;
				const injectedTextStartOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore;
				const injectedTextEndOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore + length;

				if (injectedTextStartOffsetInInputWithInjections > offsetInInputWithInjections) {
					// Injected text starts later.
					break; // All later injected texts have an even larger offset.
				}

				if (offsetInInputWithInjections <= injectedTextEndOffsetInInputWithInjections) {
					// Injected text ends after or with the given position (but also starts with or before it).
					return {
						injectedTextIndex: i,
						offsetInInputWithInjections: injectedTextStartOffsetInInputWithInjections,
						length
					};
				}

				totalInjectedTextLengthBefore += length;
			}
		}

		return undefined;
	}
}

function hasRightCursorStop(cursorStop: InjectedTextCursorStops | null | undefined): boolean {
	if (cursorStop === null || cursorStop === undefined) { return true; }
	return cursorStop === InjectedTextCursorStops.Right || cursorStop === InjectedTextCursorStops.Both;
}
function hasLeftCursorStop(cursorStop: InjectedTextCursorStops | null | undefined): boolean {
	if (cursorStop === null || cursorStop === undefined) { return true; }
	return cursorStop === InjectedTextCursorStops.Left || cursorStop === InjectedTextCursorStops.Both;
}

export class InjectedText {
	constructor(public readonly options: InjectedTextOptions) { }
}

export class OutputPosition {
	outputLineIndex: number;
	outputOffset: number;

	constructor(outputLineIndex: number, outputOffset: number) {
		this.outputLineIndex = outputLineIndex;
		this.outputOffset = outputOffset;
	}

	toString(): string {
		return `${this.outputLineIndex}:${this.outputOffset}`;
	}

	toPosition(baseLineNumber: number): Position {
		return new Position(baseLineNumber + this.outputLineIndex, this.outputOffset + 1);
	}
}

export interface ILineBreaksComputerFactory {
	createLineBreaksComputer(fontInfo: FontInfo, tabSize: number, wrappingColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll', wrapOnEscapedLineFeeds: boolean): ILineBreaksComputer;
}

export interface ILineBreaksComputer {
	/**
	 * Pass in `previousLineBreakData` if the only difference is in breaking columns!!!
	 */
	addRequest(lineText: string, injectedText: LineInjectedText[] | null, previousLineBreakData: ModelLineProjectionData | null): void;
	finalize(): (ModelLineProjectionData | null)[];
}
