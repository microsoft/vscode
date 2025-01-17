/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../base/common/date.js';
import type { GraphemeIterator } from '../../../base/common/strings.js';
import type { ViewLineRenderingData } from '../../common/viewModel.js';
import type { ViewLineOptions } from '../viewParts/viewLines/viewLineOptions.js';

export interface IContentSegmenter {
	/**
	 * Gets the content segment at an index within the line data's contents. This will be undefined
	 * when the index should not be rendered, ie. when it's part of an earlier segment like the tail
	 * end of an emoji, or when the line is not that long.
	 * @param index The index within the line data's content string.
	 */
	getSegmentAtIndex(index: number): string | undefined;
	getSegmentData(index: number): Intl.SegmentData | undefined;
}

export function createContentSegmenter(lineData: ViewLineRenderingData, options: ViewLineOptions): IContentSegmenter {
	if (lineData.isBasicASCII && options.useMonospaceOptimizations) {
		return new AsciiContentSegmenter(lineData);
	}
	return new GraphemeContentSegmenter(lineData);
}

class AsciiContentSegmenter implements IContentSegmenter {
	private readonly _content: string;

	constructor(lineData: ViewLineRenderingData) {
		this._content = lineData.content;
	}

	getSegmentAtIndex(index: number): string {
		return this._content[index];
	}

	getSegmentData(index: number): Intl.SegmentData | undefined {
		return undefined;
	}
}

/**
 * This is a more modern version of {@link GraphemeIterator}, relying on browser APIs instead of a
 * manual table approach.
 */
class GraphemeContentSegmenter implements IContentSegmenter {
	private readonly _segments: (Intl.SegmentData | undefined)[] = [];

	constructor(lineData: ViewLineRenderingData) {
		const content = lineData.content;
		const segmenter = safeIntl.Segmenter(undefined, { granularity: 'grapheme' });
		const segmentedContent = Array.from(segmenter.segment(content));
		let segmenterIndex = 0;

		for (let x = 0; x < content.length; x++) {
			const segment = segmentedContent[segmenterIndex];

			// No more segments in the string (eg. an emoji is the last segment)
			if (!segment) {
				break;
			}

			// The segment isn't renderable (eg. the tail end of an emoji)
			if (segment.index !== x) {
				this._segments.push(undefined);
				continue;
			}

			segmenterIndex++;
			this._segments.push(segment);
		}
	}

	getSegmentAtIndex(index: number): string | undefined {
		return this._segments[index]?.segment;
	}

	getSegmentData(index: number): Intl.SegmentData | undefined {
		return this._segments[index];
	}
}
