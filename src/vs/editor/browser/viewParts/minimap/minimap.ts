/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./minimap';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { CharCode } from 'vs/base/common/charCode';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { RenderMinimap } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { RGBA8 } from 'vs/editor/common/core/rgba';
import { Color, RGBA } from 'vs/base/common/color';
import { IConfiguration, ScrollType } from 'vs/editor/common/editorCommon';
import { ColorId } from 'vs/editor/common/modes';
import { Constants, MinimapCharRenderer, MinimapTokensColorTracker } from 'vs/editor/common/view/minimapCharRenderer';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { getOrCreateMinimapCharRenderer } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewLineData } from 'vs/editor/common/viewModel/viewModel';
import { scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';

function getMinimapLineHeight(renderMinimap: RenderMinimap): number {
	if (renderMinimap === RenderMinimap.Large) {
		return Constants.x2_CHAR_HEIGHT;
	}
	if (renderMinimap === RenderMinimap.LargeBlocks) {
		return Constants.x2_CHAR_HEIGHT + 2;
	}
	if (renderMinimap === RenderMinimap.Small) {
		return Constants.x1_CHAR_HEIGHT;
	}
	// RenderMinimap.SmallBlocks
	return Constants.x1_CHAR_HEIGHT + 1;
}

function getMinimapCharWidth(renderMinimap: RenderMinimap): number {
	if (renderMinimap === RenderMinimap.Large) {
		return Constants.x2_CHAR_WIDTH;
	}
	if (renderMinimap === RenderMinimap.LargeBlocks) {
		return Constants.x2_CHAR_WIDTH;
	}
	if (renderMinimap === RenderMinimap.Small) {
		return Constants.x1_CHAR_WIDTH;
	}
	// RenderMinimap.SmallBlocks
	return Constants.x1_CHAR_WIDTH;
}

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

class MinimapOptions {

	public readonly renderMinimap: RenderMinimap;

	public readonly scrollBeyondLastLine: boolean;

	public readonly showSlider: 'always' | 'mouseover';

	public readonly pixelRatio: number;

	public readonly typicalHalfwidthCharacterWidth: number;

	public readonly lineHeight: number;

	/**
	 * container dom node left position (in CSS px)
	 */
	public readonly minimapLeft: number;
	/**
	 * container dom node width (in CSS px)
	 */
	public readonly minimapWidth: number;
	/**
	 * container dom node height (in CSS px)
	 */
	public readonly minimapHeight: number;

	/**
	 * canvas backing store width (in device px)
	 */
	public readonly canvasInnerWidth: number;
	/**
	 * canvas backing store height (in device px)
	 */
	public readonly canvasInnerHeight: number;

	/**
	 * canvas width (in CSS px)
	 */
	public readonly canvasOuterWidth: number;
	/**
	 * canvas height (in CSS px)
	 */
	public readonly canvasOuterHeight: number;

	/**
	 * show the fuill document in the minimap (scale the lineheight)
	 */
	public readonly entireDocument: boolean;

	constructor(configuration: IConfiguration) {
		const pixelRatio = configuration.editor.pixelRatio;
		const layoutInfo = configuration.editor.layoutInfo;
		const viewInfo = configuration.editor.viewInfo;
		const fontInfo = configuration.editor.fontInfo;

		this.renderMinimap = layoutInfo.renderMinimap | 0;
		this.scrollBeyondLastLine = viewInfo.scrollBeyondLastLine;
		this.showSlider = viewInfo.minimap.showSlider;
		this.pixelRatio = pixelRatio;
		this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this.lineHeight = configuration.editor.lineHeight;
		this.minimapLeft = layoutInfo.minimapLeft;
		this.minimapWidth = layoutInfo.minimapWidth;
		this.minimapHeight = layoutInfo.height;
		this.entireDocument = viewInfo.minimap.entireDocument;

		this.canvasInnerWidth = Math.max(1, Math.floor(pixelRatio * this.minimapWidth));
		this.canvasInnerHeight = Math.max(1, Math.floor(pixelRatio * this.minimapHeight));

		this.canvasOuterWidth = this.canvasInnerWidth / pixelRatio;
		this.canvasOuterHeight = this.canvasInnerHeight / pixelRatio;
	}

	public equals(other: MinimapOptions): boolean {
		return (this.renderMinimap === other.renderMinimap
			&& this.scrollBeyondLastLine === other.scrollBeyondLastLine
			&& this.showSlider === other.showSlider
			&& this.pixelRatio === other.pixelRatio
			&& this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
			&& this.lineHeight === other.lineHeight
			&& this.minimapLeft === other.minimapLeft
			&& this.minimapWidth === other.minimapWidth
			&& this.minimapHeight === other.minimapHeight
			&& this.entireDocument === other.entireDocument
			&& this.canvasInnerWidth === other.canvasInnerWidth
			&& this.canvasInnerHeight === other.canvasInnerHeight
			&& this.canvasOuterWidth === other.canvasOuterWidth
			&& this.canvasOuterHeight === other.canvasOuterHeight
		);
	}
}

class MinimapLayout {

	/**
	 * The given editor scrollTop (input).
	 */
	public readonly scrollTop: number;

	/**
	* The given editor scrollHeight (input).
	*/
	public readonly scrollHeight: number;

	private readonly _computedSliderRatio: number;

	/**
	 * slider dom node top (in CSS px)
	 */
	public readonly sliderTop: number;
	/**
	 * maximum value for sliderTop
	 */
	public readonly maxMinimapSliderTop: number;
	/**
	 * slider dom node height (in CSS px)
	 */
	public readonly sliderHeight: number;

	/**
	 * minimap render start line number.
	 */
	public readonly startLineNumber: number;
	/**
	 * minimap render end line number.
	 */
	public readonly endLineNumber: number;
	/**
	 * lineheight used when displaying the minimap
	 * (can be a float value)
	 */
	public readonly displayLineHeight: number;
	/**
	 * RenderMinimap type used for rendering the lines
	 */
	public readonly renderMinimap: RenderMinimap;
	/**
	 * used line height for rendering the line data
	 * (is not necessarily the same as getMinimapLineHeight(),
	 * but is always an integer)
	 */
	public readonly renderLineHeight: number;
	/**
	 * indicates if all lines are visible in the minimap
	 * (entireDocument option is set or the file is small enough)
	 */
	public readonly coversAllLines: boolean;
	/**
	 * linecount of the file
	 */
	public readonly lineCount: number;
	/**
	 * the MinimapOptions when the layout was created
	 */
	public readonly options: MinimapOptions;

	constructor(
		scrollTop: number,
		maxMinimapSliderTop: number,
		scrollHeight: number,
		computedSliderRatio: number,
		sliderTop: number,
		sliderHeight: number,
		startLineNumber: number,
		endLineNumber: number,
		displayLineHeight: number,
		usedRenderMinimap: RenderMinimap,
		usedRenderLineHeight: RenderMinimap,
		coversAllLines: boolean,
		lineCount: number,
		options: MinimapOptions
	) {
		this.scrollTop = scrollTop;
		this.scrollHeight = scrollHeight;
		this._computedSliderRatio = computedSliderRatio;
		this.sliderTop = sliderTop;
		this.maxMinimapSliderTop = maxMinimapSliderTop;
		this.sliderHeight = sliderHeight;
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.displayLineHeight = displayLineHeight;
		this.renderMinimap = usedRenderMinimap;
		this.renderLineHeight = usedRenderLineHeight;
		this.coversAllLines = coversAllLines;
		this.lineCount = lineCount;
		this.options = options;
	}

	public equals(other: MinimapLayout): boolean {
		return (this.scrollTop === other.scrollTop
			&& this.scrollHeight === other.scrollHeight
			&& this._computedSliderRatio === other._computedSliderRatio
			&& this.sliderTop === other.sliderTop
			&& this.maxMinimapSliderTop === other.maxMinimapSliderTop
			&& this.sliderHeight === other.sliderHeight
			&& this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.displayLineHeight === other.displayLineHeight
			&& this.renderMinimap === other.renderMinimap
			&& this.renderLineHeight === other.renderLineHeight
			&& this.coversAllLines === other.coversAllLines
			&& this.lineCount === other.lineCount
			&& this.options.equals(other.options));
	}

	/**
	 * Compares all members which are relevant for the line layout,
	 * if the functions returns true the minimap lines should be
	 * at the same place.
	 * @param other MinimapLayout for comparison
	 */
	public equalLineLayout(other: MinimapLayout) {
		return (this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.displayLineHeight === other.displayLineHeight
			&& this.renderMinimap === other.renderMinimap
			&& this.renderLineHeight === other.renderLineHeight
			&& this.lineCount === other.lineCount
			&& this.options.equals(other.options));
	}

	/**
	 * Clones the MinimapLayout and replaces the following value:
	 * @param newSliderTop replacement value for sliderTop
	 */
	public clone_with_different_sliderTop(newSliderTop: number): MinimapLayout {
		return new MinimapLayout(
			this.scrollTop,
			this.maxMinimapSliderTop,
			this.scrollHeight,
			this._computedSliderRatio,
			newSliderTop,
			this.sliderHeight,
			this.startLineNumber,
			this.endLineNumber,
			this.displayLineHeight,
			this.renderMinimap,
			this.renderLineHeight,
			this.coversAllLines,
			this.lineCount,
			this.options);
	}

	/**
	 * Compute a desired `scrollPosition` such that the slider moves by `delta`.
	 */
	public getDesiredScrollTopFromDelta(delta: number): number {
		const desiredSliderPosition = this.sliderTop + delta;
		return Math.round(desiredSliderPosition / this._computedSliderRatio);
	}

	public static create(
		options: MinimapOptions,
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		viewportHeight: number,
		viewportContainsWhitespaceGaps: boolean,
		lineCount: number,
		scrollTop: number,
		scrollHeight: number,
		previousLayout: MinimapLayout | null
	): MinimapLayout {
		const pixelRatio = options.pixelRatio;
		const expectedViewportLineCount = viewportHeight / options.lineHeight;
		const totalLineCount = options.scrollBeyondLastLine
			? lineCount + Math.floor(expectedViewportLineCount) - 1
			: Math.max(expectedViewportLineCount, lineCount);
		let renderMinimap = options.renderMinimap;
		let renderLineHeight = getMinimapLineHeight(renderMinimap);
		let minimapLinesFitting = Math.floor(options.canvasInnerHeight / renderLineHeight);
		const coversAllLines = minimapLinesFitting >= lineCount || options.entireDocument;
		if (options.entireDocument) {
			if (minimapLinesFitting > totalLineCount) {
				if (renderMinimap === RenderMinimap.Small) {
					renderMinimap = RenderMinimap.Large;
				} else if (renderMinimap === RenderMinimap.SmallBlocks) {
					renderMinimap = RenderMinimap.LargeBlocks;
				}
				renderLineHeight = getMinimapLineHeight(renderMinimap);
				minimapLinesFitting = Math.floor(options.canvasInnerHeight / renderLineHeight);
				const lineSpacing = Math.floor((minimapLinesFitting - totalLineCount) / totalLineCount);
				if (lineSpacing > 0) {
					renderLineHeight += lineSpacing;
					minimapLinesFitting = Math.floor(options.canvasInnerHeight / renderLineHeight);
				}
			} else {
				if (renderMinimap === RenderMinimap.Large) {
					renderMinimap = RenderMinimap.Small;
				} else if (renderMinimap === RenderMinimap.LargeBlocks) {
					renderMinimap = RenderMinimap.SmallBlocks;
				}
				renderLineHeight = getMinimapLineHeight(renderMinimap);
				minimapLinesFitting = Math.floor(options.canvasInnerHeight / renderLineHeight);
				if (minimapLinesFitting < totalLineCount) {
					renderLineHeight = 1;
				}
			}
		}

		// The visible line count in a viewport can change due to a number of reasons:
		//  a) with the same viewport width, different scroll positions can result in partial lines being visible:
		//    e.g. for a line height of 20, and a viewport height of 600
		//          * scrollTop = 0  => visible lines are [1, 30]
		//          * scrollTop = 10 => visible lines are [1, 31] (with lines 1 and 31 partially visible)
		//          * scrollTop = 20 => visible lines are [2, 31]
		//  b) whitespace gaps might make their way in the viewport (which results in a decrease in the visible line count)
		//  c) we could be in the scroll beyond last line case (which also results in a decrease in the visible line count, down to possibly only one line being visible)

		// We must first establish a desirable slider height.
		let sliderHeight: number;
		let minimapLineHeight = renderLineHeight;
		if (options.entireDocument) {
			minimapLinesFitting = lineCount;
			minimapLineHeight = options.canvasInnerHeight / totalLineCount;
		}
		if (viewportContainsWhitespaceGaps && viewportEndLineNumber !== lineCount) {
			// case b) from above: there are whitespace gaps in the viewport.
			// In this case, the height of the slider directly reflects the visible line count.
			const viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
			sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
		} else {
			// The slider has a stable height
			sliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
		}
		sliderHeight = Math.min(sliderHeight, options.minimapHeight);

		let maxMinimapSliderTop: number;
		if (options.scrollBeyondLastLine) {
			// totalLineCount += viewportEndLineNumber - viewportStartLineNumber + 1;
			// The minimap slider, when dragged all the way down, will contain the last line at its top
			maxMinimapSliderTop = (lineCount - 1) * minimapLineHeight / pixelRatio;
		} else {
			// The minimap slider, when dragged all the way down, will contain the last line at its bottom
			maxMinimapSliderTop = Math.max(0, lineCount * minimapLineHeight / pixelRatio - sliderHeight);
		}
		maxMinimapSliderTop = Math.min(options.minimapHeight - sliderHeight, maxMinimapSliderTop);

		// The slider can move from 0 to `maxMinimapSliderTop`
		// in the same way `scrollTop` can move from 0 to `scrollHeight` - `viewportHeight`.
		const computedSliderRatio = (maxMinimapSliderTop) / Math.max(1, scrollHeight - viewportHeight);
		const sliderTop = (scrollTop * computedSliderRatio);

		let extraLinesAtTheBottom = 0;
		if (options.scrollBeyondLastLine) {
			extraLinesAtTheBottom = expectedViewportLineCount;
		}
		if (minimapLinesFitting >= lineCount + extraLinesAtTheBottom) {
			// All lines fit in the minimap
			const startLineNumber = 1;
			const endLineNumber = lineCount;

			return new MinimapLayout(scrollTop, maxMinimapSliderTop, scrollHeight
				, computedSliderRatio, sliderTop, sliderHeight, startLineNumber
				, endLineNumber, minimapLineHeight, renderMinimap, renderLineHeight
				, coversAllLines, lineCount, options);
		} else {
			let startLineNumber = Math.max(1, Math.floor(viewportStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));

			// Avoid flickering caused by a partial viewport start line
			// by being consistent w.r.t. the previous layout decision
			if (previousLayout && previousLayout.scrollHeight === scrollHeight) {
				if (previousLayout.scrollTop > scrollTop) {
					// Scrolling up => never increase `startLineNumber`
					startLineNumber = Math.min(startLineNumber, previousLayout.startLineNumber);
				}
				if (previousLayout.scrollTop < scrollTop) {
					// Scrolling down => never decrease `startLineNumber`
					startLineNumber = Math.max(startLineNumber, previousLayout.startLineNumber);
				}
			}

			const endLineNumber = Math.min(lineCount, startLineNumber + minimapLinesFitting - 1);

			return new MinimapLayout(scrollTop, maxMinimapSliderTop, scrollHeight
				, computedSliderRatio, sliderTop, sliderHeight, startLineNumber
				, endLineNumber, minimapLineHeight, renderMinimap, renderLineHeight
				, coversAllLines, lineCount, options);
		}
	}
}

/**
 * Class for holding the rendered line data and its position.
 */
class LineChunk {
	/** indicates changed imageData */
	dirty: boolean = true;
	/** line index where the chunk starts */
	lineOffset: number = -1;
	/** first index in the chunk which is currently used (valid min is 0) */
	firstUsedIndex: number = -1;
	/** last index in the chunk which is currently used */
	lastUsedIndex: number = -2;
	/** holds the rendered data */
	imageData: ImageData;
	/** the bitmap once the linedata was uploaded to the gpu */
	imageBitmap: Promise<ImageBitmap>;

	/** line index of the first used line */
	public firstLine(): number {
		return this.lineOffset + this.firstUsedIndex;
	}

	/** line index of the last used line */
	public lastLine(): number {
		return this.lineOffset + this.lastUsedIndex;
	}

	/** number of currently used lines */
	public numLines(): number {
		return this.lastUsedIndex - this.firstUsedIndex + 1;
	}
}

/**
 * Class for managing all line data. There is a number for each line which holds
 * (chunkId, indexInChunk, dirty). The chunks are hold seperatly in a map.
 * This class organizes change/insert/delete for the lines and keeps everything in
 * a consistent state.
 */
class LineData {
	private static readonly linesPerChunk = 128;
	private static readonly chunkLineWidth = 128;
	private static readonly initialLineValue = 1;
	private static readonly showDrawUdates = false; // emable this to see updated/drawn/total chunks in debug console
	private static readonly checkEverything = false; // enable this to check chunk and line consistency for debugging

	private _unusedChunks: LineChunk[] = [];
	private _chunks: Map<number, LineChunk> = new Map<number, LineChunk>();
	private _lines: number[] = [];
	private _nextChunkId: number = 1;
	private _minDirtyLine: number = Number.MAX_VALUE;
	private _maxDirtyLine: number = -1;
	private _dirty: boolean = true;
	private _usedRenderLineHeight: number = -1;
	private _usedRenderMinimap: RenderMinimap = RenderMinimap.None;

	private _lineIsDirty(line: number): boolean {
		return (line & 1) !== 0;
	}
	private _setLineIsDirty(line: number, value: boolean): number {
		if (value) {
			return line | 1;
		} else {
			return line & ~1;
		}
	}

	private _lineChunkId(line: number): number {
		return line >> 9;
	}
	private _setLineChunkId(line: number, value: number): number {
		return (line & ((1 << 9) - 1)) + ((value << 9) & ((1 << 52) - 1));
	}

	private _lineIndexInChunk(line: number): number {
		return (line >> 1) & ((1 << 8) - 1);
	}
	private _setLineIndexInChunk(line: number, value: number): number {
		return (line & ~(((1 << 8) - 1) << 1)) + ((value & ((1 << 8) - 1)) << 1);
	}

	/** true if the content has changed */
	public isDirty(): boolean {
		return this._dirty;
	}

	/** reset all dirty flags */
	public clearDirtyFlags(): void {
		this._dirty = false;
		this._minDirtyLine = Number.MAX_VALUE;
		this._maxDirtyLine = -1;
	}

	private _extendDirtyBounds(index: number): void {
		this._dirty = true;
		this._minDirtyLine = Math.min(this._minDirtyLine, index);
		this._maxDirtyLine = Math.max(this._maxDirtyLine, index);
	}

	private _setDirtyBounds(from: number, toIncl: number): void {
		this._extendDirtyBounds(from);
		this._extendDirtyBounds(toIncl);
	}

	private _chunkHasTheCorrectSize(chunk: LineChunk): boolean {
		if (chunk && chunk.imageData
			&& chunk.imageData.height === this._usedRenderLineHeight * LineData.linesPerChunk
			&& chunk.imageData.width === LineData.chunkLineWidth) {
			return true;
		}
		return false;
	}

	private _copyContent(count: number,
		src: LineChunk, srcIndexInChunk: number,
		dst: LineChunk, dstIndexInChunk: number
	): boolean {
		if (this._chunkHasTheCorrectSize(src)
			&& this._chunkHasTheCorrectSize(dst)) {
			const lineFactor = 4 * this._usedRenderLineHeight * LineData.chunkLineWidth;
			dst.imageData.data.set(
				src.imageData.data.subarray(
					srcIndexInChunk * lineFactor,
					(srcIndexInChunk + count) * lineFactor),
				dstIndexInChunk * lineFactor);
			dst.dirty = true;
			return true;
		}
		return false;
	}

	private _deleteChunk(chunkId: number) {
		const chunk = this._chunks.get(chunkId);
		this._chunks.delete(chunkId);
		if (chunk) {
			this._unusedChunks.push(chunk);
		}
	}

	private _addNewChunk(): [number, LineChunk] {
		let chunk: LineChunk | undefined;
		if (this._unusedChunks.length > 0) {
			chunk = this._unusedChunks.pop();
		}
		if (!chunk) {
			chunk = new LineChunk;
		}
		const key = this._nextChunkId;
		++this._nextChunkId;
		this._chunks.set(key, chunk);
		return [key, chunk];
	}

	private _checkAllDirtyInRange(): void {
		for (let i = 0; i < this._lines.length; ++i) {
			if (i < this._minDirtyLine
				&& i > this._maxDirtyLine) {
				const line = this._lines[i];
				if (this._lineIsDirty(line)) {
					console.warn(`line dirty (out of bounds) ${i}`);
				}
			}
		}
	}

	private _checkChunks(): void {
		this._checkAllDirtyInRange();
		let chunkUsage = new Map<number, number>();
		let prevChunkId = -4;
		let chunk: LineChunk | undefined = undefined;
		for (let i = 0; i < this._lines.length; ++i) {
			const line = this._lines[i];
			const chunkId = this._lineChunkId(line);
			if (prevChunkId !== chunkId) {
				prevChunkId = chunkId;
				if (chunk) {
					if (chunk.lastLine() !== i - 1) {
						console.warn('previous chunk ended wrong', i);
					}
				}
				chunk = this._chunks.get(chunkId);
				if (chunk) {
					if (chunk.firstLine() !== i) {
						console.warn('chunk starts wrong', i);
					}
					let count = chunkUsage.get(chunkId);
					if (!count) {
						count = 0;
					}
					chunkUsage.set(chunkId, count + 1);
				} else {
					console.warn('no valid chunk', i);
				}
			}
		}
		for (const [chunkId, numUses] of chunkUsage) {
			if (numUses !== 1) {
				console.warn(`chunk ${chunkId} num uses is wrong (${numUses})`);
			}
		}
		for (const [chunkId, chunk] of this._chunks) {
			if (chunk) {
				if (chunk.firstLine() >= 0) {
					if (chunk.firstLine() - chunk.firstUsedIndex
						!== chunk.lastLine() - chunk.lastUsedIndex) {
						console.warn(`offsets are wrong in chunk ${chunkId}`);
					}
				}
				const count = chunkUsage.get(chunkId);
				if (count) {
					chunkUsage.set(chunkId, count - 1);
				} else {
					console.warn(`chunk ${chunkId} is unused`);
				}
			}
		}
		for (const [chunkId, numUses] of chunkUsage) {
			if (numUses !== 0) {
				console.warn(`chunk ${chunkId} usage is wrong (${numUses})`);
			}
		}
	}

	private _checkEverything(): void {
		if (LineData.checkEverything) {
			this._checkAllDirtyInRange();
			this._checkChunks();
		}
	}

	private _mergeSmallChunks() {
		let prevChunkId = -1;
		let prevChunk: LineChunk | undefined = undefined;
		let i = 0;
		for (; i < this._lines.length; ++i) {
			const line = this._lines[i];
			let chunkId = this._lineChunkId(line);
			if (prevChunkId !== chunkId) {
				let chunk = this._chunks.get(chunkId);
				if (chunk && chunk.numLines() > 0) {
					if (prevChunk && (prevChunk.lastLine() === chunk.firstLine() - 1)
						&& (prevChunk.numLines() + chunk.numLines() <= LineData.linesPerChunk)) {
						if (prevChunk.firstUsedIndex > 0) {
							// move content in prev chunk to the start
							const copied = this._copyContent(prevChunk.numLines()
								, prevChunk, prevChunk.firstUsedIndex
								, prevChunk, 0);
							prevChunk.dirty = true;
							prevChunk.lineOffset += prevChunk.firstUsedIndex;
							prevChunk.lastUsedIndex -= prevChunk.firstUsedIndex;
							prevChunk.firstUsedIndex = 0;
							const o = prevChunk.lineOffset;
							// and update all affected lines
							for (let j = 0; j < prevChunk.numLines(); ++j) {
								const lineIndex = j + o;
								this._lines[lineIndex] = this._setLineIndexInChunk(this._lines[lineIndex], j);
								if (!copied) {
									this._lines[lineIndex] = this._setLineIsDirty(this._lines[lineIndex], true);
								}
							}
							if (!copied) {
								this._extendDirtyBounds(prevChunk.firstLine());
								this._extendDirtyBounds(prevChunk.lastLine());
							}
						}
						// copy content from second to first chunk
						const copied = this._copyContent(chunk.numLines()
							, chunk, chunk.firstUsedIndex
							, prevChunk, prevChunk.lastUsedIndex + 1);
						const o = prevChunk.lineOffset;
						const start = prevChunk.lastUsedIndex + 1;
						prevChunk.lastUsedIndex += chunk.numLines();
						// and update all affected lines too
						for (let j = start; j < prevChunk.numLines(); ++j) {
							const lineIndex = j + o;
							this._lines[lineIndex] = this._setLineChunkId(this._setLineIndexInChunk(this._lines[lineIndex], j), prevChunkId);
							if (!copied) {
								this._lines[lineIndex] = this._setLineIsDirty(this._lines[lineIndex], true);
							}
						}
						if (!copied) {
							this._extendDirtyBounds(chunk.firstLine());
							this._extendDirtyBounds(chunk.lastLine());
						}
						this._deleteChunk(chunkId);
						prevChunk.dirty = true;
						chunk = prevChunk;
						chunkId = prevChunkId;
					}
					if (chunk.lastLine() >= i) {
						i = chunk.lastLine();
					} else {
						console.warn(`line ${i} chunk does not fit`);
					}
				} else {
					console.warn(`line ${i} has no chunk`);
				}
				prevChunk = chunk;
				prevChunkId = chunkId;
			} else {
				console.warn(`line ${i} wrong assumption`);
			}
		}
	}

	private _splitChunk(lineIndex: number): void {
		if (lineIndex >= this._lines.length) {
			return;
		}
		if (lineIndex === 0) {
			return;
		}
		this._checkEverything();
		const splitLine = this._lines[lineIndex];
		const chunkId = this._lineChunkId(splitLine);
		const chunk = this._chunks.get(chunkId);
		if (chunk) {
			const sizeFirstPart = lineIndex - chunk.firstLine();
			const sizeSecondPart = chunk.lastLine() - lineIndex + 1;
			if (sizeFirstPart > 0) {
				if (sizeSecondPart > sizeFirstPart) {
					// move first part to another chunk
					let from = chunk.firstLine();
					if (from > 0) {
						const prevChunkId = this._lineChunkId(this._lines[from - 1]);
						const prevChunk = this._chunks.get(prevChunkId);
						if (prevChunk) {
							const space = LineData.linesPerChunk - 1 - prevChunk.lastUsedIndex;
							if (space > 0) {
								const usedSpace = Math.min(space, lineIndex - from);
								let indexInChunk = prevChunk.lastUsedIndex + 1;
								for (let i = 0; i < usedSpace; ++i) {
									let line = this._lines[from];
									if (this._lineIsDirty(line)
										|| !this._copyContent(1, chunk, this._lineIndexInChunk(line), prevChunk, indexInChunk)) {
										this._extendDirtyBounds(from);
										line = this._setLineIsDirty(line, true);
									}
									line = this._setLineChunkId(line, prevChunkId);
									line = this._setLineIndexInChunk(line, indexInChunk);
									this._lines[from] = line;
									++from;
									++indexInChunk;
								}
								this._checkAllDirtyInRange();
								prevChunk.lastUsedIndex = indexInChunk - 1;
							}
						}
					}
					chunk.firstUsedIndex = this._lineIndexInChunk(splitLine);
					chunk.lineOffset = lineIndex - chunk.firstUsedIndex;
					this._addLinesToNewChunk(from, lineIndex - 1);
					this._checkEverything();
				} else {
					// move second part to another chunk
					let toIncl = chunk.lastLine();
					if (toIncl < this._lines.length - 1) {
						const nextChunkId = this._lineChunkId(this._lines[toIncl + 1]);
						const nextChunk = this._chunks.get(nextChunkId);
						if (nextChunk) {
							const space = nextChunk.firstUsedIndex;
							if (space > 0) {
								const usedSpace = Math.min(space, toIncl - lineIndex + 1);
								let indexInChunk = nextChunk.firstUsedIndex - 1;
								for (let i = 0; i < usedSpace; ++i) {
									let line = this._lines[toIncl];
									if (this._lineIsDirty(line)
										|| !this._copyContent(1, chunk, this._lineIndexInChunk(line), nextChunk, indexInChunk)) {
										this._extendDirtyBounds(toIncl);
										line = this._setLineIsDirty(line, true);
									}
									line = this._setLineChunkId(line, nextChunkId);
									line = this._setLineIndexInChunk(line, indexInChunk);
									this._lines[toIncl] = line;
									--toIncl;
									--indexInChunk;
								}
								nextChunk.firstUsedIndex = indexInChunk + 1;
								nextChunk.lineOffset = toIncl + 1 - nextChunk.firstUsedIndex;
								this._checkAllDirtyInRange();
							}
						}
					}
					chunk.lastUsedIndex = this._lineIndexInChunk(this._lines[lineIndex - 1]);
					this._addLinesToNewChunk(lineIndex, toIncl);
					this._checkEverything();
				}
			}
		} else {
			console.warn('LineEntries.splitChunk() chunk not assigned');
		}
	}

	private _addLinesToNewChunk(from: number, toIncl: number): void {
		this._setDirtyBounds(from, toIncl);
		while (from <= toIncl) {
			const [chunkId, chunk] = this._addNewChunk();
			chunk.firstUsedIndex = 0;
			chunk.lineOffset = from;
			const numToInsert = Math.min(LineData.linesPerChunk, toIncl - from + 1);
			let indexInChunk = 0;
			for (; indexInChunk < numToInsert; ++indexInChunk) {
				let line = this._lines[from];
				const wasDirty = this._lineIsDirty(line);
				line = this._setLineIsDirty(line, true);
				const oldChunkId = this._lineChunkId(line);
				if (!wasDirty && (oldChunkId > 0)) {
					const oldChunk = this._chunks.get(oldChunkId);
					if (oldChunk) {
						if (this._copyContent(1, oldChunk, this._lineIndexInChunk(line), chunk, indexInChunk)) {
							line = this._setLineIsDirty(line, false);
						}
					}
				}
				line = this._setLineChunkId(line, chunkId);
				line = this._setLineIndexInChunk(line, indexInChunk);
				this._lines[from] = line;
				++from;
			}
			chunk.lastUsedIndex = indexInChunk - 1;
		}
		this._checkEverything();
	}

	private _findNewChunkForLines(from: number, toIncl: number): void {
		this._setDirtyBounds(from, toIncl);
		if (from > 0) {
			// try to add some to the previous chunk
			const chunkId = this._lineChunkId(this._lines[from - 1]);
			const chunk = this._chunks.get(chunkId);
			if (chunk) {
				let indexInChunk = chunk.lastUsedIndex + 1;
				const space = LineData.linesPerChunk - indexInChunk;
				if (space > 0) {
					const usedSpace = Math.min(space, toIncl - from + 1);
					for (let i = 0; i < usedSpace; ++i) {
						let line = this._lines[from];
						const wasDirty = this._lineIsDirty(line);
						line = this._setLineIsDirty(line, true);
						const oldChunkId = this._lineChunkId(line);
						if (!wasDirty && (oldChunkId > 0)) {
							const oldChunk = this._chunks.get(oldChunkId);
							if (oldChunk) {
								if (this._copyContent(1, oldChunk, this._lineIndexInChunk(line), chunk, indexInChunk)) {
									line = this._setLineIsDirty(line, false);
								}
							}
						}
						line = this._setLineChunkId(line, chunkId);
						line = this._setLineIndexInChunk(line, indexInChunk);
						this._lines[from] = line;
						++indexInChunk;
						++from;
					}
					chunk.lastUsedIndex = indexInChunk - 1;
				}
			}
		}
		if (toIncl < this._lines.length - 1) {
			// try to add some to the next chunk
			const chunkId = this._lineChunkId(this._lines[toIncl + 1]);
			const chunk = this._chunks.get(chunkId);
			if (chunk) {
				let indexInChunk = chunk.firstUsedIndex - 1;
				if (indexInChunk >= 0) {
					const usedSpace = Math.min(indexInChunk + 1, toIncl - from + 1);
					for (let i = 0; i < usedSpace; ++i) {
						let line = this._lines[toIncl];
						const wasDirty = this._lineIsDirty(line);
						line = this._setLineIsDirty(line, true);
						const oldChunkId = this._lineChunkId(line);
						if (!wasDirty && (oldChunkId > 0)) {
							const oldChunk = this._chunks.get(oldChunkId);
							if (oldChunk) {
								if (this._copyContent(1, oldChunk, this._lineIndexInChunk(line), chunk, indexInChunk)) {
									line = this._setLineIsDirty(line, false);
								}
							}
						}
						line = this._setLineChunkId(line, chunkId);
						line = this._setLineIndexInChunk(line, indexInChunk);
						this._lines[toIncl] = line;
						--indexInChunk;
						--toIncl;
					}
					chunk.firstUsedIndex = indexInChunk + 1;
					chunk.lineOffset = toIncl + 1 - chunk.firstUsedIndex;
				}
			}
		}
		this._addLinesToNewChunk(from, toIncl);
		this._checkEverything();
	}

	/** ensure the content fits to the current layout */
	public checkContent(layout: MinimapLayout): void {
		let lineCountFromChunks = 0;
		for (const chunk of this._chunks.values()) {
			lineCountFromChunks = Math.max(lineCountFromChunks, chunk.lastLine() + 1);
		}
		if (lineCountFromChunks !== this._lines.length) {
			console.warn('chunks out of sync');
		}
		if ((this._lines.length !== layout.lineCount)
			|| (lineCountFromChunks !== this._lines.length)) {
			// content out of sync so we better reset everything
			this._chunks.clear();
			this._lines = Array<number>(layout.lineCount);
			for (let i = 0; i < this._lines.length; ++i) {
				this._lines[i] = LineData.initialLineValue;
			}
			this._findNewChunkForLines(0, this._lines.length - 1);
		} else if (this._usedRenderMinimap !== layout.renderMinimap
			|| this._usedRenderLineHeight !== layout.renderLineHeight) {
			this.everyThingChanged();
		}
		this._usedRenderLineHeight = layout.renderLineHeight;
		this._usedRenderMinimap = layout.renderMinimap;
	}

	/** react on changing lines */
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		if ((e.fromLineNumber <= 0) || (e.toLineNumber > this._lines.length)) {
			console.warn('LineEntries.onLinesChanged() out of sync');
			return false;
		}
		const from = e.fromLineNumber - 1;
		const toIncl = e.toLineNumber - 1;
		for (let i = from; i <= toIncl; ++i) {
			this._lines[i] = this._setLineIsDirty(this._lines[i], true);
		}
		this._setDirtyBounds(from, toIncl);
		return this._dirty;
	}

	/** react on deleted lines */
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): void {
		this._checkEverything();
		if ((e.fromLineNumber <= 0) || (e.toLineNumber > this._lines.length)) {
			console.warn('LineEntries.onLinesDeleted() out of sync');
			return;
		}
		const from = e.fromLineNumber - 1;
		const toIncl = e.toLineNumber - 1;
		{
			// remove completely covered chunks
			let index = from;
			while (index <= toIncl) {
				const chunkId = this._lineChunkId(this._lines[index]);
				const chunk = this._chunks.get(chunkId);
				if (chunk) {
					index = chunk.lastLine();
					if ((chunk.firstLine() >= from)
						&& (chunk.lastLine() <= toIncl)) {
						this._deleteChunk(chunkId);
					}
				}
				++index;
			}
		}
		const numRemovedLines = toIncl - from + 1;
		let prevChunkId = -1;
		if (from > 0) {
			const prevLineIndex = from - 1;
			const prevLine = this._lines[prevLineIndex];
			prevChunkId = this._lineChunkId(prevLine);
			const chunk = this._chunks.get(prevChunkId);
			if (chunk) {
				// crop the hit chunk
				if (chunk.lastLine() > toIncl) {
					let indexInChunk = this._lineIndexInChunk(prevLine) + 1;
					for (let i = toIncl + 1; i <= chunk.lastLine(); ++i) {
						let line = this._lines[i];
						if (this._lineIsDirty(line) || !this._copyContent(1
							, chunk, this._lineIndexInChunk(line)
							, chunk, indexInChunk)
						) {
							line = this._setLineIsDirty(line, true);
							this._extendDirtyBounds(i);
						}
						line = this._setLineIndexInChunk(line, indexInChunk);
						this._lines[i] = line;
						++indexInChunk;
					}
					chunk.lastUsedIndex -= numRemovedLines;
					this._setDirtyBounds(from, chunk.lastLine());
				} else {
					chunk.lastUsedIndex = this._lineIndexInChunk(prevLine);
				}
			}
		}
		if (toIncl + 1 < this._lines.length) {
			const nextLine = this._lines[toIncl + 1];
			const nextChunkId = this._lineChunkId(nextLine);
			if (nextChunkId !== prevChunkId) {
				const chunk = this._chunks.get(nextChunkId);
				if (chunk) {
					// crop the next chunk
					chunk.firstUsedIndex = this._lineIndexInChunk(nextLine);
					chunk.lineOffset = toIncl + 1 - chunk.firstUsedIndex;
				}
			}
			for (const chunk of this._chunks.values()) {
				if (chunk.firstLine() > toIncl) {
					// adjust all chunks after the delete
					chunk.lineOffset -= numRemovedLines;
				}
			}
			if (this._minDirtyLine >= from
				&& this._minDirtyLine <= toIncl) {
				this._minDirtyLine = toIncl + 1;
			} else if (this._minDirtyLine > toIncl) {
				this._minDirtyLine -= numRemovedLines;
			}
			if (this._maxDirtyLine >= from
				&& this._maxDirtyLine <= toIncl) {
				this._maxDirtyLine = from - 1;
			} else if (this._maxDirtyLine > toIncl) {
				this._maxDirtyLine -= numRemovedLines;
			}
		}
		this._lines.splice(from, numRemovedLines);
		this._dirty = true;
		this._checkEverything();
		this._mergeSmallChunks();
	}

	/** react on inserted lines */
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): void {
		this._checkEverything();
		if ((e.fromLineNumber <= 0) || (e.fromLineNumber > this._lines.length + 1)) {
			console.warn('LineEntries.onLinesInserted() out of sync');
			return;
		}
		const from = e.fromLineNumber - 1;
		const toIncl = e.toLineNumber - 1;
		const newLines: number[] = Array<number>(toIncl - from + 1);
		for (let i = 0; i < newLines.length; i++) {
			newLines[i] = LineData.initialLineValue;
		}
		const numLines = newLines.length;
		if (from === this._lines.length) {
			// insert at the end
			this._lines = this._lines.concat(newLines);
			this._findNewChunkForLines(from, toIncl);
		} else if (from === 0) {
			// insert at the front
			this._maxDirtyLine += numLines;
			this._lines = newLines.concat(this._lines);
			for (const chunk of this._chunks.values()) {
				chunk.lineOffset += numLines;
			}
			this._findNewChunkForLines(from, toIncl);
			this._mergeSmallChunks();
		} else {
			// insert somewhere in the middle
			this._splitChunk(from);
			const offset = newLines.length;
			for (const chunk of this._chunks.values()) {
				if (chunk.firstLine() >= from) {
					chunk.lineOffset += offset;
				}
			}
			const after = this._lines.splice(from);
			this._lines = this._lines.concat(newLines).concat(after);
			if (this._maxDirtyLine >= from) {
				this._maxDirtyLine += numLines;
			}
			this._findNewChunkForLines(from, toIncl);
			this._mergeSmallChunks();
		}
		this._checkEverything();
	}

	/** react on token change */
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		if (this._lines.length === 0) {
			// no lines
			return false;
		}
		for (let i = 0, len = e.ranges.length; i < len; i++) {
			const rng = e.ranges[i];
			if (rng.fromLineNumber <= 0 || rng.toLineNumber > this._lines.length) {
				console.warn('LineEntries.onTokensChanged() out of sync');
				continue;
			}
			const from = rng.fromLineNumber - 1;
			const toIncl = rng.toLineNumber - 1;
			for (let i = from; i <= toIncl; ++i) {
				this._lines[i] = this._setLineIsDirty(this._lines[i], true);
			}
			this._setDirtyBounds(from, toIncl);
		}
		return this._dirty;
	}

	/** flag all content dirty */
	public everyThingChanged(): void {
		for (let i = 0; i < this._lines.length; ++i) {
			this._lines[i] = this._setLineIsDirty(this._lines[i], true);
		}
		this._setDirtyBounds(0, this._lines.length - 1);
	}

	/** update the line data in the chunks for all dirty lines */
	public updateChunkContent(
		ctx: CanvasRenderingContext2D,
		tokensColorTracker: MinimapTokensColorTracker,
		context: ViewContext,
		layout: MinimapLayout
	) {
		const lineCount = context.model.getLineCount();
		let startLineNumber = layout.startLineNumber;
		let endLineNumber = layout.endLineNumber;
		if (this._minDirtyLine <= this._maxDirtyLine) {
			startLineNumber = Math.min(Math.max(1, this._minDirtyLine + 1), lineCount);
			endLineNumber = Math.min(Math.max(1, this._maxDirtyLine + 1), lineCount);
		}
		const needed: boolean[] = [];
		for (let i = 0; i <= endLineNumber - startLineNumber; ++i) {
			needed[i] = this._lineIsDirty(this._lines[i + startLineNumber - 1]);
		}
		const renderMinimap = layout.renderMinimap;
		const background = tokensColorTracker.getColor(ColorId.DefaultBackground);
		const lineInfo = context.model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
		const tabSize = lineInfo.tabSize;
		const useLighterFont = tokensColorTracker.backgroundIsLight();
		let lastChunkId = -11;
		let chunk: LineChunk | undefined;
		for (let i = 0; i < this._lines.length; ++i) {
			let line = this._lines[i];
			if (this._lineIsDirty(line)) {
				const lineChunkId = this._lineChunkId(line);
				if (lastChunkId !== lineChunkId) {
					chunk = this._chunks.get(lineChunkId);
					if (chunk) {
						const height = LineData.linesPerChunk * layout.renderLineHeight;
						const width = LineData.chunkLineWidth;
						if (!this._chunkHasTheCorrectSize(chunk)) {
							chunk.imageData = ctx.createImageData(width, height);
						}
					}
				}
				if (chunk) {
					const index = i - startLineNumber + 1;
					if (index < lineInfo.data.length) {
						chunk.dirty = true;
						const content = lineInfo.data[index];
						const targetRow = this._lineIndexInChunk(line) * layout.renderLineHeight;
						{
							const width = LineData.chunkLineWidth;
							let offset = targetRow * width * 4;
							const data = chunk.imageData.data;
							const R = background.r;
							const G = background.g;
							const B = background.b;
							for (let r = 0; r < layout.renderLineHeight; r++) {
								for (let c = 0; c < width; c++) {
									data[offset] = R;
									data[offset + 1] = G;
									data[offset + 2] = B;
									data[offset + 3] = 255;
									offset += 4;
								}
							}
						}
						if (content) {
							renderLine(
								chunk.imageData,
								background,
								useLighterFont,
								renderMinimap,
								tokensColorTracker,
								getOrCreateMinimapCharRenderer(),
								targetRow,
								tabSize,
								content,
								layout.renderLineHeight);
						} else {
							console.warn(`content not filled ${i}`);
						}
						line = this._setLineIsDirty(line, false);
						this._lines[i] = line;
					} else {
						console.warn(`index out of bounds ${i}`);
					}
				} else {
					console.warn(`line has no valid chunk ${i}`);
				}
			}
		}
		this.clearDirtyFlags();
	}

	/** draw all chunks */
	public drawChunks(
		ctx: CanvasRenderingContext2D,
		tokensColorTracker: MinimapTokensColorTracker,
		layout: MinimapLayout,
		drawAll: boolean
	) {
		const pixelPerLine = layout.displayLineHeight;
		const maxY = layout.options.entireDocument
			? pixelPerLine * this._lines.length
			: pixelPerLine * (this._lines.length - layout.startLineNumber + 1);
		if (maxY < ctx.canvas.height) {
			const background = tokensColorTracker.getColor(ColorId.DefaultBackground);
			ctx.fillStyle = Color.Format.CSS.formatHex(
				new Color(new RGBA(background.r, background.g, background.b, background.a)));
			ctx.fillRect(0, maxY, ctx.canvas.width, ctx.canvas.height);
		}
		let numDirtyChunks = 0;
		let numDrawnChunks = 0;
		for (const chunk of this._chunks.values()) {
			if ((chunk.firstLine() <= layout.endLineNumber - 1)
				&& (chunk.lastLine() >= layout.startLineNumber - 1)) {
				if (chunk.dirty) {
					++numDirtyChunks;
					chunk.imageBitmap = createImageBitmap(chunk.imageData);
				}
				if (drawAll || chunk.dirty) {
					chunk.dirty = false;
					++numDrawnChunks;
					const targetWidth = ctx.canvas.width;
					const numLines = chunk.lastUsedIndex - chunk.firstUsedIndex + 1;
					const dstY = layout.options.entireDocument
						? pixelPerLine * chunk.firstLine()
						: pixelPerLine * (chunk.firstLine() - layout.startLineNumber + 1);
					chunk.imageBitmap.then(bitmap =>
						ctx.drawImage(bitmap,
							0, chunk.firstUsedIndex * layout.renderLineHeight,
							LineData.chunkLineWidth,
							numLines * layout.renderLineHeight,
							0, dstY,
							targetWidth,
							numLines * pixelPerLine));
				}
			}
		}
		if (LineData.showDrawUdates) {
			console.info(`chunks dirty: ${numDirtyChunks} drawn ${numDrawnChunks} total ${this._chunks.size}`);
		}
	}
}

export class Minimap extends ViewPart {

	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _shadow: FastDomNode<HTMLElement>;
	private readonly _canvas: FastDomNode<HTMLCanvasElement>;
	private readonly _slider: FastDomNode<HTMLElement>;
	private readonly _sliderHorizontal: FastDomNode<HTMLElement>;
	private readonly _tokensColorTracker: MinimapTokensColorTracker;
	private readonly _mouseDownListener: IDisposable;
	private readonly _sliderMouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;
	private readonly _sliderMouseDownListener: IDisposable;

	private _options: MinimapOptions;
	private _lastRenderLayout: MinimapLayout | null;
	private _renderLayout: MinimapLayout | null;

	private _lines: LineData = new LineData;

	constructor(context: ViewContext) {
		super(context);

		this._options = new MinimapOptions(this._context.configuration);
		this._lastRenderLayout = null;

		this._domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._domNode, PartFingerprint.Minimap);
		this._domNode.setClassName(this._getMinimapDomNodeClassName());
		this._domNode.setPosition('absolute');
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');

		this._shadow = createFastDomNode(document.createElement('div'));
		this._shadow.setClassName('minimap-shadow-hidden');
		this._domNode.appendChild(this._shadow);

		this._canvas = createFastDomNode(document.createElement('canvas'));
		this._canvas.setPosition('absolute');
		this._canvas.setLeft(0);
		this._domNode.appendChild(this._canvas);

		this._slider = createFastDomNode(document.createElement('div'));
		this._slider.setPosition('absolute');
		this._slider.setClassName('minimap-slider');
		this._slider.setLayerHinting(true);
		this._domNode.appendChild(this._slider);

		this._sliderHorizontal = createFastDomNode(document.createElement('div'));
		this._sliderHorizontal.setPosition('absolute');
		this._sliderHorizontal.setClassName('minimap-slider-horizontal');
		this._slider.appendChild(this._sliderHorizontal);

		this._tokensColorTracker = MinimapTokensColorTracker.getInstance();

		this._applyLayout();

		this._mouseDownListener = dom.addStandardDisposableListener(this._canvas.domNode, 'mousedown', (e) => {
			e.preventDefault();

			const renderMinimap = this._options.renderMinimap;
			if (renderMinimap === RenderMinimap.None) {
				return;
			}
			if (!this._lastRenderLayout) {
				return;
			}
			const internalOffsetY = this._options.pixelRatio * e.browserEvent.offsetY;
			const lineIndex = Math.floor(internalOffsetY / this._lastRenderLayout.displayLineHeight);

			let lineNumber = lineIndex + this._lastRenderLayout.startLineNumber;
			lineNumber = Math.min(lineNumber, this._context.model.getLineCount());

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, 1, lineNumber, 1),
				viewEvents.VerticalRevealType.Center,
				false,
				ScrollType.Smooth
			));
			if (e.leftButton && this._lastRenderLayout && this._lastRenderLayout.coversAllLines) {
				const halfSlider = Math.floor(this._lastRenderLayout.sliderHeight / 2);
				const newSliderTop = Math.min(this._lastRenderLayout.maxMinimapSliderTop,
					Math.max(0, (internalOffsetY - halfSlider) / this._options.pixelRatio));
				const initialSliderState = this._lastRenderLayout.clone_with_different_sliderTop(newSliderTop);
				this._dragSlider(e, initialSliderState);
			}
		});

		this._sliderMouseMoveMonitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();

		this._sliderMouseDownListener = dom.addStandardDisposableListener(
			this._slider.domNode, 'mousedown', (e) => {
				if (e.leftButton && this._lastRenderLayout) {
					this._dragSlider(e, this._lastRenderLayout);
				}
			});
	}

	private _dragSlider(e: IMouseEvent, initialState: MinimapLayout): void {
		const initialMousePosition = e.posy;
		const initialMouseOrthogonalPosition = e.posx;
		this._slider.toggleClassName('active', true);
		this._sliderMouseMoveMonitor.startMonitoring(
			standardMouseMoveMerger,
			(mouseMoveData: IStandardMouseMoveEventData) => {
				const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);
				if (platform.isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
					// The mouse has wondered away from the scrollbar => reset dragging
					this._context.viewLayout.setScrollPositionNow({
						scrollTop: initialState.scrollTop
					});
					return;
				}
				const mouseDelta = mouseMoveData.posy - initialMousePosition;
				this._context.viewLayout.setScrollPositionNow({
					scrollTop: initialState.getDesiredScrollTopFromDelta(mouseDelta)
				});
			},
			() => {
				this._slider.toggleClassName('active', false);
			}
		);
	}

	public dispose(): void {
		this._mouseDownListener.dispose();
		this._sliderMouseMoveMonitor.dispose();
		this._sliderMouseDownListener.dispose();
		super.dispose();
	}

	private _getMinimapDomNodeClassName(): string {
		if (this._options.showSlider === 'always') {
			return 'minimap slider-always';
		}
		return 'minimap slider-mouseover';
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	private _applyLayout(): void {
		this._domNode.setLeft(this._options.minimapLeft);
		this._domNode.setWidth(this._options.minimapWidth);
		this._domNode.setHeight(this._options.minimapHeight);
		this._shadow.setHeight(this._options.minimapHeight);
		this._canvas.setWidth(this._options.canvasOuterWidth);
		this._canvas.setHeight(this._options.canvasOuterHeight);
		this._canvas.domNode.width = this._options.canvasInnerWidth;
		this._canvas.domNode.height = this._options.canvasInnerHeight;
		this._slider.setWidth(this._options.minimapWidth);
	}

	private _onOptionsMaybeChanged(): boolean {
		const opts = new MinimapOptions(this._context.configuration);
		if (this._options.equals(opts)) {
			return false;
		}
		this._options = opts;
		this._applyLayout();
		this._domNode.setClassName(this._getMinimapDomNodeClassName());
		return true;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._lines.everyThingChanged();
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		this._lines.onLinesChanged(e);
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		this._lines.onLinesDeleted(e);
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		this._lines.onLinesInserted(e);
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		this._lines.onTokensChanged(e);
		return true;
	}
	public onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		this._lines.everyThingChanged();
		return true;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		this._lines.everyThingChanged();
		return true;
	}

	// --- end event handlers

	public prepareRender(renderingCtx: RenderingContext): void {
		this._renderLayout = null;
		const lineCount = this._context.model.getLineCount();
		const layout = MinimapLayout.create(
			this._options,
			renderingCtx.visibleRange.startLineNumber,
			renderingCtx.visibleRange.endLineNumber,
			renderingCtx.viewportHeight,
			(renderingCtx.viewportData.whitespaceViewportData.length > 0),
			lineCount,
			renderingCtx.scrollTop,
			renderingCtx.scrollHeight,
			this._lastRenderLayout ? this._lastRenderLayout : null
		);
		this._lines.checkContent(layout);
		const changedContent = this._lines.isDirty();
		const ctx = this._canvas.domNode.getContext('2d')!;
		if (changedContent) {
			this._lines.updateChunkContent(ctx, this._tokensColorTracker, this._context, layout);
		}
		this._renderLayout = layout;
	}

	public render(renderingCtx: RestrictedRenderingContext): void {
		if (!this._renderLayout) {
			console.warn('prepareRender was not called');
			return;
		}
		const layout = this._renderLayout;
		this._renderLayout = null;

		const renderMinimap = this._options.renderMinimap;
		if (renderMinimap === RenderMinimap.None) {
			this._shadow.setClassName('minimap-shadow-hidden');
			this._sliderHorizontal.setWidth(0);
			this._sliderHorizontal.setHeight(0);
			return;
		}
		if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
			this._shadow.setClassName('minimap-shadow-hidden');
		} else {
			this._shadow.setClassName('minimap-shadow-visible');
		}

		this._slider.setTop(layout.sliderTop);
		this._slider.setHeight(layout.sliderHeight);

		// Compute horizontal slider coordinates
		const scrollLeftChars = renderingCtx.scrollLeft / this._options.typicalHalfwidthCharacterWidth;
		const horizontalSliderLeft = Math.min(this._options.minimapWidth, Math.round(scrollLeftChars * getMinimapCharWidth(this._options.renderMinimap) / this._options.pixelRatio));
		this._sliderHorizontal.setLeft(horizontalSliderLeft);
		this._sliderHorizontal.setWidth(this._options.minimapWidth - horizontalSliderLeft);
		this._sliderHorizontal.setTop(0);
		this._sliderHorizontal.setHeight(layout.sliderHeight);

		const ctx = this._canvas.domNode.getContext('2d')!;
		const changedLayout = !this._lastRenderLayout || !this._lastRenderLayout.equalLineLayout(layout);
		this._lines.drawChunks(ctx, this._tokensColorTracker, layout, changedLayout);
		this._lastRenderLayout = layout;
	}

}

function renderLine(
	target: ImageData,
	backgroundColor: RGBA8,
	useLighterFont: boolean,
	renderMinimap: RenderMinimap,
	colorTracker: MinimapTokensColorTracker,
	minimapCharRenderer: MinimapCharRenderer,
	dy: number,
	tabSize: number,
	lineData: ViewLineData,
	lineHeight: number
): void {
	const content = lineData.content;
	const tokens = lineData.tokens;
	const charWidth = getMinimapCharWidth(renderMinimap);
	const maxDx = target.width - charWidth;
	const oneline = lineHeight <= 1;

	let dx = 0;
	let charIndex = 0;
	let tabsCharDelta = 0;

	for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
		const tokenEndIndex = tokens.getEndOffset(tokenIndex);
		const tokenColorId = tokens.getForeground(tokenIndex);
		const tokenColor = colorTracker.getColor(tokenColorId);

		for (; charIndex < tokenEndIndex; charIndex++) {
			if (dx > maxDx) {
				// hit edge of minimap
				return;
			}
			const charCode = content.charCodeAt(charIndex);

			if (charCode === CharCode.Tab) {
				const insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
				tabsCharDelta += insertSpacesCount - 1;
				// No need to render anything since tab is invisible
				dx += insertSpacesCount * charWidth;
			} else if (charCode === CharCode.Space) {
				// No need to render anything since space is invisible
				dx += charWidth;
			} else {
				// Render twice for a full width character
				const count = strings.isFullWidthCharacter(charCode) ? 2 : 1;

				for (let i = 0; i < count; i++) {
					if (renderMinimap === RenderMinimap.Large) {
						minimapCharRenderer.x2RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor, useLighterFont);
					} else if (renderMinimap === RenderMinimap.Small) {
						minimapCharRenderer.x1RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor, useLighterFont, oneline);
					} else if (renderMinimap === RenderMinimap.LargeBlocks) {
						minimapCharRenderer.x2BlockRenderChar(target, dx, dy, tokenColor, backgroundColor, useLighterFont);
					} else {
						// RenderMinimap.SmallBlocks
						minimapCharRenderer.x1BlockRenderChar(target, dx, dy, tokenColor, backgroundColor, useLighterFont, oneline);
					}
					dx += charWidth;

					if (dx > maxDx) {
						// hit edge of minimap
						return;
					}
				}
			}
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const sliderBackground = theme.getColor(scrollbarSliderBackground);
	if (sliderBackground) {
		const halfSliderBackground = sliderBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider, .monaco-editor .minimap-slider .minimap-slider-horizontal { background: ${halfSliderBackground}; }`);
	}
	const sliderHoverBackground = theme.getColor(scrollbarSliderHoverBackground);
	if (sliderHoverBackground) {
		const halfSliderHoverBackground = sliderHoverBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider:hover, .monaco-editor .minimap-slider:hover .minimap-slider-horizontal { background: ${halfSliderHoverBackground}; }`);
	}
	const sliderActiveBackground = theme.getColor(scrollbarSliderActiveBackground);
	if (sliderActiveBackground) {
		const halfSliderActiveBackground = sliderActiveBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider.active, .monaco-editor .minimap-slider.active .minimap-slider-horizontal { background: ${halfSliderActiveBackground}; }`);
	}
	const shadow = theme.getColor(scrollbarShadow);
	if (shadow) {
		collector.addRule(`.monaco-editor .minimap-shadow-visible { box-shadow: ${shadow} -6px 0 6px -6px inset; }`);
	}
});
