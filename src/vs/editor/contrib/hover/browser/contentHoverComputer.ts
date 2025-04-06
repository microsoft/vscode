/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { IModelDecoration } from '../../../common/model.js';
import { HoverStartSource, IHoverComputer } from './hoverOperation.js';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IHoverPart } from './hoverTypes.js';
import { AsyncIterableObject } from '../../../../base/common/async.js';

export interface ContentHoverComputerOptions {
	shouldFocus: boolean;
	anchor: HoverAnchor;
	source: HoverStartSource;
	insistOnKeepingHoverVisible: boolean;
}

export class ContentHoverComputer implements IHoverComputer<ContentHoverComputerOptions, IHoverPart> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly IEditorHoverParticipant[]
	) {
	}

	private static _getLineDecorations(editor: IActiveCodeEditor, anchor: HoverAnchor): IModelDecoration[] {
		if (anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
			return [];
		}

		const model = editor.getModel();
		const lineNumber = anchor.range.startLineNumber;

		if (lineNumber > model.getLineCount()) {
			// invalid line
			return [];
		}

		const maxColumn = model.getLineMaxColumn(lineNumber);

		return editor.getLineDecorations(lineNumber).filter((d) => {
			if (d.options.isWholeLine) {
				return true;
			}

			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			if (d.options.showIfCollapsed) {
				// Relax check around `showIfCollapsed` decorations to also include +/- 1 character
				if (startColumn > anchor.range.startColumn + 1 || anchor.range.endColumn - 1 > endColumn) {
					return false;
				}
			} else {
				if (startColumn > anchor.range.startColumn || anchor.range.endColumn > endColumn) {
					return false;
				}
			}

			return true;
		});
	}

	public computeAsync(options: ContentHoverComputerOptions, token: CancellationToken): AsyncIterableObject<IHoverPart> {
		const anchor = options.anchor;

		if (!this._editor.hasModel() || !anchor) {
			return AsyncIterableObject.EMPTY;
		}

		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, anchor);

		return AsyncIterableObject.merge(
			this._participants.map((participant) => {
				if (!participant.computeAsync) {
					return AsyncIterableObject.EMPTY;
				}
				return participant.computeAsync(anchor, lineDecorations, options.source, token);
			})
		);
	}

	public computeSync(options: ContentHoverComputerOptions): IHoverPart[] {
		if (!this._editor.hasModel()) {
			return [];
		}

		const anchor = options.anchor;
		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, anchor);

		let result: IHoverPart[] = [];
		for (const participant of this._participants) {
			result = result.concat(participant.computeSync(anchor, lineDecorations, options.source));
		}

		return coalesce(result);
	}
}

