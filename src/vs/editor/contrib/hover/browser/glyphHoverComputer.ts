/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { IMarkdownString, isEmptyMarkdownString } from '../../../../base/common/htmlContent.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { IHoverComputer } from './hoverOperation.js';
import { GlyphMarginLane } from '../../../common/model.js';

export type LaneOrLineNumber = GlyphMarginLane | 'lineNo';

export interface IHoverMessage {
	value: IMarkdownString;
}

export interface GlyphHoverComputerOptions {
	lineNumber: number;
	laneOrLine: LaneOrLineNumber;
}

export class GlyphHoverComputer implements IHoverComputer<GlyphHoverComputerOptions, IHoverMessage> {

	constructor(
		private readonly _editor: ICodeEditor
	) {
	}

	public computeSync(opts: GlyphHoverComputerOptions): IHoverMessage[] {

		const toHoverMessage = (contents: IMarkdownString): IHoverMessage => {
			return {
				value: contents
			};
		};

		const lineDecorations = this._editor.getLineDecorations(opts.lineNumber);

		const result: IHoverMessage[] = [];
		const isLineHover = opts.laneOrLine === 'lineNo';
		if (!lineDecorations) {
			return result;
		}

		for (const d of lineDecorations) {
			const lane = d.options.glyphMargin?.position ?? GlyphMarginLane.Center;
			if (!isLineHover && lane !== opts.laneOrLine) {
				continue;
			}

			const hoverMessage = isLineHover ? d.options.lineNumberHoverMessage : d.options.glyphMarginHoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			result.push(...asArray(hoverMessage).map(toHoverMessage));
		}

		return result;
	}
}
