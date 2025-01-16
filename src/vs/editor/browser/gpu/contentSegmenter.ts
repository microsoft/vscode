/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ViewLineRenderingData } from '../../common/viewModel.js';

export interface IContentSegmenter {
	/**
	 * Gets the content segment at an index within the line data's contents. This will be undefined
	 * when the index should not be rendered, ie. when it's part of an earlier segment like the tail
	 * end of an emoji, or when the line is not that long.
	 * @param index The index within the line data's content string.
	 */
	getSegmentAtIndex(index: number): string | undefined;
}

export function createContentSegmenter(lineData: ViewLineRenderingData): IContentSegmenter {
	if (lineData.isBasicASCII) {
		return new AsciiContentSegmenter(lineData);
	}
	return new GraphemeContentSegmenter(lineData);
}

class AsciiContentSegmenter implements IContentSegmenter {
	private readonly _content: string;

	constructor(lineData: ViewLineRenderingData) {
		this._content = lineData.content;
	}

	getSegmentAtIndex(column: number): string {
		return this._content[column];
	}
}

class GraphemeContentSegmenter implements IContentSegmenter {
	private readonly _segments: (string | undefined)[] = [];

	constructor(lineData: ViewLineRenderingData) {
		const content = lineData.content;
		const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
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
			this._segments.push(segment.segment);
		}
	}

	getSegmentAtIndex(index: number): string | undefined {
		return this._segments.length > index ? this._segments[index] : '';
	}
}
