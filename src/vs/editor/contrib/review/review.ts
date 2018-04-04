/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./review';
import * as modes from 'vs/editor/common/modes';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType, IViewZone } from 'vs/editor/browser/editorBrowser';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { ZoneWidget, IOptions } from '../zoneWidget/zoneWidget';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';

export const ctxReviewPanelVisible = new RawContextKey<boolean>('reviewPanelVisible', false);
export const ID = 'editor.contrib.review';

declare var ResizeObserver: any;

const REVIEWL_DECORATION = ModelDecorationOptions.register({
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	linesDecorationsClassName: 'review'
});

export class ReviewViewZone implements IViewZone {
	public readonly afterLineNumber: number;
	public readonly domNode: HTMLElement;
	private callback: (top: number) => void;

	constructor(afterLineNumber: number, onDomNodeTop: (top: number) => void) {
		this.afterLineNumber = afterLineNumber;
		this.callback = onDomNodeTop;

		this.domNode = document.createElement('div');
		this.domNode.className = 'review-viewzone';
	}

	onDomNodeTop(top: number): void {
		this.callback(top);
	}
}

export class ReviewZoneWidget extends ZoneWidget {
	private _domNode: HTMLElement;
	private _resizeObserver: any;

	constructor(editor: ICodeEditor, options: IOptions = {}) {
		super(editor, options);
		this._resizeObserver = null;
		this.create();
	}

	protected _fillContainer(container: HTMLElement): void {
		this._domNode = document.createElement('div');
		this._domNode.className = 'review-widget';
		container.appendChild(this._domNode);
	}

	display(comments: modes.Comment[], lineNumber: number) {
		this.show({ lineNumber: lineNumber, column: 1 }, 2);

		for (let i = 0; i < comments.length; i++) {
			let singleCommentContainer = document.createElement('div');
			singleCommentContainer.className = 'review-comment-contents';
			let header = document.createElement('h4');
			let author = document.createElement('strong');
			author.className = 'author';
			author.innerText = comments[i].userName;
			// let time = document.createElement('span');
			// time.className = 'created_at';
			// time.innerText = comments[i].created_at;
			header.appendChild(author);
			// header.appendChild(time);
			singleCommentContainer.appendChild(header);
			let body = document.createElement('div');
			body.className = 'comment-body';
			singleCommentContainer.appendChild(body);
			let md = comments[i].body;
			body.appendChild(renderMarkdown(md));
			this._domNode.appendChild(singleCommentContainer);
		}
		// this._domNode.appendChild(document.createElement('textarea'));
		this._resizeObserver = new ResizeObserver(entries => {
			if (entries[0].target === this._domNode) {
				const lineHeight = this.editor.getConfiguration().lineHeight;
				const arrowHeight = Math.round(lineHeight / 3);
				const computedLinesNumber = Math.ceil((entries[0].contentRect.height + arrowHeight + 30) / lineHeight);
				this._relayout(computedLinesNumber);
			}
		});

		this._resizeObserver.observe(this._domNode);
	}

	dispose() {
		super.dispose();
		this._resizeObserver.disconnect();
		this._resizeObserver = null;
	}
}

export class ReviewController implements IEditorContribution {
	private globalToDispose: IDisposable[];
	private localToDispose: IDisposable[];
	private editor: ICodeEditor;
	private decorationIDs: string[];
	private _domNode: HTMLElement;
	private _zoneWidget: ReviewZoneWidget;
	private _reviewPanelVisible: IContextKey<boolean>;
	private _commentThreads: modes.CommentThread[];

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorationIDs = [];
		this.mouseDownInfo = null;
		this._commentThreads = [];

		this._reviewPanelVisible = ctxReviewPanelVisible.bindTo(contextKeyService);
		this._domNode = document.createElement('div');
		this._domNode.className = 'review-widget';
		this._zoneWidget = null;

		this.globalToDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
	}

	public static get(editor: ICodeEditor): ReviewController {
		return editor.getContribution<ReviewController>(ID);
	}

	getId(): string {
		return ID;
	}
	dispose(): void {
		this.globalToDispose = dispose(this.globalToDispose);
		this.localToDispose = dispose(this.localToDispose);

		if (this._zoneWidget) {
			this._zoneWidget.dispose();
			this._zoneWidget = null;
		}
		this.editor = null;
	}

	public onModelChanged(): void {
		this.localToDispose = dispose(this.localToDispose);
		if (this._zoneWidget) {
			// todo store view state.
			this._zoneWidget.dispose();
			this._zoneWidget = null;
		}
		this.localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
	}

	private mouseDownInfo: { lineNumber: number, iconClicked: boolean };

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		if (!e.event.leftButton) {
			return;
		}

		let range = e.target.range;
		if (!range) {
			return;
		}

		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_LINE_DECORATIONS:
				iconClicked = true;
				break;
			default:
				return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}
		let lineNumber = this.mouseDownInfo.lineNumber;
		let iconClicked = this.mouseDownInfo.iconClicked;

		let range = e.target.range;
		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
				return;
			}
		}

		if (this._zoneWidget && this._zoneWidget.position.lineNumber === lineNumber) {
			return;
		}

		this._reviewPanelVisible.set(true);
		this._zoneWidget = new ReviewZoneWidget(this.editor);
		this._zoneWidget.display(this.getComments(lineNumber), lineNumber);
	}

	getComments(line: number): modes.Comment[] {
		for (let i = 0; i < this._commentThreads.length; i++) {
			if (this._commentThreads[i].range.startLineNumber === line) {
				return this._commentThreads[i].comments;
			}
		}

		return [];
	}

	setComments(commentThreads: modes.CommentThread[]): void {
		this._commentThreads = commentThreads;
		this.editor.changeDecorations(accessor => {
			this.decorationIDs = accessor.deltaDecorations(this.decorationIDs, commentThreads.map(thread => ({
				range: thread.range,
				options: REVIEWL_DECORATION
			})));
		});
	}


	public closeWidget(): void {
		this._reviewPanelVisible.reset();

		if (this._zoneWidget) {
			this._zoneWidget.dispose();
			this._zoneWidget = null;
		}

		this.editor.focus();
	}
}

registerEditorContribution(ReviewController);


KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReviewPanel',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ctxReviewPanelVisible,
	handler: closeReviewPanel
});

export function getOuterEditor(accessor: ServicesAccessor): ICodeEditor {
	let editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}
	return editor;
}

function closeReviewPanel(accessor: ServicesAccessor, args: any) {
	var outerEditor = getOuterEditor(accessor);
	if (!outerEditor) {
		return;
	}

	let controller = ReviewController.get(outerEditor);

	if (!controller) {
		return;
	}

	controller.closeWidget();
}