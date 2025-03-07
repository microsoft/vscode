/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addStandardDisposableListener, getDomNodePagePosition } from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isIOS } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IEditorMouseEvent, MouseTargetType } from '../../../../editorBrowser.js';
import { CodeEditorWidget } from '../../../codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../diffEditorWidget.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { DetailedLineRangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { EndOfLineSequence, ITextModel } from '../../../../../common/model.js';
import { localize } from '../../../../../../nls.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';

export class InlineDiffDeletedCodeMargin extends Disposable {
	private readonly _diffActions: HTMLElement;

	private _visibility: boolean = false;

	get visibility(): boolean {
		return this._visibility;
	}

	set visibility(_visibility: boolean) {
		if (this._visibility !== _visibility) {
			this._visibility = _visibility;
			this._diffActions.style.visibility = _visibility ? 'visible' : 'hidden';
		}
	}

	constructor(
		private readonly _getViewZoneId: () => string,
		private readonly _marginDomNode: HTMLElement,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diff: DetailedLineRangeMapping,
		private readonly _editor: DiffEditorWidget,
		private readonly _viewLineCounts: number[],
		private readonly _originalTextModel: ITextModel,
		private readonly _contextMenuService: IContextMenuService,
		private readonly _clipboardService: IClipboardService,
	) {
		super();

		// make sure the diff margin shows above overlay.
		this._marginDomNode.style.zIndex = '10';

		this._diffActions = document.createElement('div');
		this._diffActions.className = ThemeIcon.asClassName(Codicon.lightBulb) + ' lightbulb-glyph';
		this._diffActions.style.position = 'absolute';
		const lineHeight = this._modifiedEditor.getOption(EditorOption.lineHeight);
		this._diffActions.style.right = '0px';
		this._diffActions.style.visibility = 'hidden';
		this._diffActions.style.height = `${lineHeight}px`;
		this._diffActions.style.lineHeight = `${lineHeight}px`;
		this._marginDomNode.appendChild(this._diffActions);

		let currentLineNumberOffset = 0;

		const useShadowDOM = _modifiedEditor.getOption(EditorOption.useShadowDOM) && !isIOS; // Do not use shadow dom on IOS #122035
		const showContextMenu = (x: number, y: number) => {
			this._contextMenuService.showContextMenu({
				domForShadowRoot: useShadowDOM ? _modifiedEditor.getDomNode() ?? undefined : undefined,
				getAnchor: () => ({ x, y }),
				getActions: () => {
					const actions: Action[] = [];
					const isDeletion = _diff.modified.isEmpty;

					// default action
					actions.push(new Action(
						'diff.clipboard.copyDeletedContent',
						isDeletion
							? (_diff.original.length > 1
								? localize('diff.clipboard.copyDeletedLinesContent.label', "Copy deleted lines")
								: localize('diff.clipboard.copyDeletedLinesContent.single.label', "Copy deleted line"))
							: (_diff.original.length > 1
								? localize('diff.clipboard.copyChangedLinesContent.label', "Copy changed lines")
								: localize('diff.clipboard.copyChangedLinesContent.single.label', "Copy changed line")),
						undefined,
						true,
						async () => {
							const originalText = this._originalTextModel.getValueInRange(_diff.original.toExclusiveRange());
							await this._clipboardService.writeText(originalText);
						}
					));

					if (_diff.original.length > 1) {
						actions.push(new Action(
							'diff.clipboard.copyDeletedLineContent',
							isDeletion
								? localize('diff.clipboard.copyDeletedLineContent.label', "Copy deleted line ({0})",
									_diff.original.startLineNumber + currentLineNumberOffset)
								: localize('diff.clipboard.copyChangedLineContent.label', "Copy changed line ({0})",
									_diff.original.startLineNumber + currentLineNumberOffset),
							undefined,
							true,
							async () => {
								let lineContent = this._originalTextModel.getLineContent(_diff.original.startLineNumber + currentLineNumberOffset);
								if (lineContent === '') {
									// empty line -> new line
									const eof = this._originalTextModel.getEndOfLineSequence();
									lineContent = eof === EndOfLineSequence.LF ? '\n' : '\r\n';
								}
								await this._clipboardService.writeText(lineContent);
							}
						));
					}
					const readOnly = _modifiedEditor.getOption(EditorOption.readOnly);
					if (!readOnly) {
						actions.push(new Action(
							'diff.inline.revertChange',
							localize('diff.inline.revertChange.label', "Revert this change"),
							undefined,
							true,
							async () => {
								this._editor.revert(this._diff);
							})
						);
					}
					return actions;
				},
				autoSelectFirstItem: true
			});
		};

		this._register(addStandardDisposableListener(this._diffActions, 'mousedown', e => {
			if (!e.leftButton) { return; }

			const { top, height } = getDomNodePagePosition(this._diffActions);
			const pad = Math.floor(lineHeight / 3);
			e.preventDefault();
			showContextMenu(e.posx, top + height + pad);
		}));

		this._register(_modifiedEditor.onMouseMove((e: IEditorMouseEvent) => {
			if ((e.target.type === MouseTargetType.CONTENT_VIEW_ZONE || e.target.type === MouseTargetType.GUTTER_VIEW_ZONE) && e.target.detail.viewZoneId === this._getViewZoneId()) {
				currentLineNumberOffset = this._updateLightBulbPosition(this._marginDomNode, e.event.browserEvent.y, lineHeight);
				this.visibility = true;
			} else {
				this.visibility = false;
			}
		}));

		this._register(_modifiedEditor.onMouseDown((e: IEditorMouseEvent) => {
			if (!e.event.leftButton) { return; }

			if (e.target.type === MouseTargetType.CONTENT_VIEW_ZONE || e.target.type === MouseTargetType.GUTTER_VIEW_ZONE) {
				const viewZoneId = e.target.detail.viewZoneId;

				if (viewZoneId === this._getViewZoneId()) {
					e.event.preventDefault();
					currentLineNumberOffset = this._updateLightBulbPosition(this._marginDomNode, e.event.browserEvent.y, lineHeight);
					showContextMenu(e.event.posx, e.event.posy + lineHeight);
				}
			}
		}));
	}

	private _updateLightBulbPosition(marginDomNode: HTMLElement, y: number, lineHeight: number): number {
		const { top } = getDomNodePagePosition(marginDomNode);
		const offset = y - top;
		const lineNumberOffset = Math.floor(offset / lineHeight);
		const newTop = lineNumberOffset * lineHeight;
		this._diffActions.style.top = `${newTop}px`;
		if (this._viewLineCounts) {
			let acc = 0;
			for (let i = 0; i < this._viewLineCounts.length; i++) {
				acc += this._viewLineCounts[i];
				if (lineNumberOffset < acc) {
					return i;
				}
			}
		}
		return lineNumberOffset;
	}
}
