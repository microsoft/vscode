/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from 'vs/base/common/arrays';
import { IMarkdownString, isEmptyMarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { GlyphMarginLane } from 'vs/editor/common/model';

export type LaneOrLineNumber = GlyphMarginLane | 'lineNo';

export interface IHoverMessage {
	value: IMarkdownString;
}

export interface MarginHoverComputerOptions {
	lineNumber: number;
	laneOrLine: LaneOrLineNumber;
}

export class MarginHoverComputer implements IHoverComputer<MarginHoverComputerOptions, IHoverMessage> {

	constructor(
		private readonly _editor: ICodeEditor
	) {
	}

	public computeSync(opts: MarginHoverComputerOptions): IHoverMessage[] {

		if (!opts) {
			return [];
		}
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
