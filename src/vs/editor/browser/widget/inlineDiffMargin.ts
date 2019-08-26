/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Action } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { Range } from 'vs/editor/common/core/range';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';

export interface IDiffLinesChange {
	readonly originalStartLineNumber: number;
	readonly originalEndLineNumber: number;
	readonly modifiedStartLineNumber: number;
	readonly modifiedEndLineNumber: number;
	readonly originalContent: string[];
}

export class InlineDiffMargin extends Disposable {
	private readonly _diffActions: HTMLElement;

	constructor(
		marginDomNode: HTMLElement,
		public editor: CodeEditorWidget,
		public diff: IDiffLinesChange,
		private _contextMenuService: IContextMenuService,
		private _clipboardService: IClipboardService
	) {
		super();

		// make sure the diff margin shows above overlay.
		marginDomNode.style.zIndex = '10';

		this._diffActions = document.createElement('div');
		this._diffActions.className = 'octicon octicon-zap';
		this._diffActions.style.position = 'absolute';
		const lineHeight = editor.getConfiguration().lineHeight;
		const lineFeed = editor.getModel()!.getEOL();
		this._diffActions.style.right = '0px';
		this._diffActions.style.visibility = 'hidden';
		this._diffActions.style.height = `${lineHeight}px`;
		this._diffActions.style.lineHeight = `${lineHeight}px`;
		marginDomNode.appendChild(this._diffActions);

		const actions = [
			new Action(
				'diff.clipboard.copyDeletedContent',
				nls.localize('diff.clipboard.copyDeletedContent.label', "Copy deleted lines content to clipboard"),
				undefined,
				true,
				async () => {
					await this._clipboardService.writeText(diff.originalContent.join(lineFeed) + lineFeed);
				}
			)
		];

		let currentLineNumberOffset = 0;

		const copyLineAction = new Action(
			'diff.clipboard.copyDeletedLineContent',
			nls.localize('diff.clipboard.copyDeletedLineContent.label', "Copy deleted line {0} content to clipboard", diff.originalStartLineNumber),
			undefined,
			true,
			async () => {
				await this._clipboardService.writeText(diff.originalContent[currentLineNumberOffset]);
			}
		);

		actions.push(copyLineAction);

		const readOnly = editor.getConfiguration().readOnly;
		if (!readOnly) {
			actions.push(new Action('diff.inline.revertChange', nls.localize('diff.inline.revertChange.label', "Revert this change"), undefined, true, async () => {
				if (diff.modifiedEndLineNumber === 0) {
					// deletion only
					const column = editor.getModel()!.getLineMaxColumn(diff.modifiedStartLineNumber);
					editor.executeEdits('diffEditor', [
						{
							range: new Range(diff.modifiedStartLineNumber, column, diff.modifiedStartLineNumber, column),
							text: lineFeed + diff.originalContent.join(lineFeed)
						}
					]);
				} else {
					const column = editor.getModel()!.getLineMaxColumn(diff.modifiedEndLineNumber);
					editor.executeEdits('diffEditor', [
						{
							range: new Range(diff.modifiedStartLineNumber, 1, diff.modifiedEndLineNumber, column),
							text: diff.originalContent.join(lineFeed)
						}
					]);
				}

			}));
		}

		this._register(dom.addStandardDisposableListener(marginDomNode, 'mouseenter', e => {
			this._diffActions.style.visibility = 'visible';
			currentLineNumberOffset = this._updateLightBulbPosition(marginDomNode, e.y, lineHeight);
		}));

		this._register(dom.addStandardDisposableListener(marginDomNode, 'mouseleave', e => {
			this._diffActions.style.visibility = 'hidden';
		}));

		this._register(dom.addStandardDisposableListener(marginDomNode, 'mousemove', e => {
			currentLineNumberOffset = this._updateLightBulbPosition(marginDomNode, e.y, lineHeight);
		}));

		this._register(dom.addStandardDisposableListener(this._diffActions, 'mousedown', e => {
			const { top, height } = dom.getDomNodePagePosition(this._diffActions);
			let pad = Math.floor(lineHeight / 3) + lineHeight;
			this._contextMenuService.showContextMenu({
				getAnchor: () => {
					return {
						x: e.posx,
						y: top + height + pad
					};
				},
				getActions: () => {
					copyLineAction.label = nls.localize('diff.clipboard.copyDeletedLineContent.label', "Copy deleted line {0} content to clipboard", diff.originalStartLineNumber + currentLineNumberOffset);
					return actions;
				},
				autoSelectFirstItem: true
			});
		}));
	}

	private _updateLightBulbPosition(marginDomNode: HTMLElement, y: number, lineHeight: number): number {
		const { top } = dom.getDomNodePagePosition(marginDomNode);
		const offset = y - top;
		const lineNumberOffset = Math.floor(offset / lineHeight);
		const newTop = lineNumberOffset * lineHeight;
		this._diffActions.style.top = `${newTop}px`;
		return lineNumberOffset;
	}
}
