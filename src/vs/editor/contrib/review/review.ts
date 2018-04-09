/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./review';
import * as nls from 'vs/nls';
import * as modes from 'vs/editor/common/modes';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType, IViewZone } from 'vs/editor/browser/editorBrowser';
import { $ } from 'vs/base/browser/builder';
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
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { registerThemingParticipant, ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { peekViewEditorBackground, peekViewBorder, } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { Color } from 'vs/base/common/color';

export const ctxReviewPanelVisible = new RawContextKey<boolean>('reviewPanelVisible', false);
export const ID = 'editor.contrib.review';

declare var ResizeObserver: any;

const REVIEWL_DECORATION = ModelDecorationOptions.register({
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	glyphMarginClassName: 'review'
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
	private _headElement: HTMLElement;
	protected _primaryHeading: HTMLElement;
	protected _secondaryHeading: HTMLElement;
	protected _metaHeading: HTMLElement;
	protected _actionbarWidget: ActionBar;
	private _bodyElement: HTMLElement;
	private _resizeObserver: any;
	private _comments: modes.Comment[];

	constructor(@IThemeService private themeService: IThemeService,
		editor: ICodeEditor, options: IOptions = {}, comments: modes.Comment[]) {
		super(editor, options);
		this._resizeObserver = null;
		this._comments = comments;
		this.create();
		this.themeService.onThemeChange(this._applyTheme, this);
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._headElement = <HTMLDivElement>$('.head').getHTMLElement();
		container.appendChild(this._headElement);
		this._fillHead(this._headElement);

		this._bodyElement = <HTMLDivElement>$('.body').getHTMLElement(); document.createElement('div');
		container.appendChild(this._bodyElement);
	}

	protected _fillHead(container: HTMLElement): void {
		var titleElement = $('.review-title').
			// on(dom.EventType.CLICK, e => this._onTitleClick(<MouseEvent>e)).
			appendTo(this._headElement).
			getHTMLElement();

		this._primaryHeading = $('span.filename').appendTo(titleElement).getHTMLElement();
		this._secondaryHeading = $('span.dirname').appendTo(titleElement).getHTMLElement();
		this._metaHeading = $('span.meta').appendTo(titleElement).getHTMLElement();

		let primaryHeading = 'Discussion';
		$(this._primaryHeading).safeInnerHtml(primaryHeading);
		this._primaryHeading.setAttribute('aria-label', primaryHeading);
		let secondaryHeading = `@${this._comments[0].userName}`;
		$(this._secondaryHeading).safeInnerHtml(secondaryHeading);

		const actionsContainer = $('.review-actions').appendTo(this._headElement);
		this._actionbarWidget = new ActionBar(actionsContainer.getHTMLElement(), {});
		this._disposables.push(this._actionbarWidget);

		this._actionbarWidget.push(new Action('review.expand', nls.localize('label.expand', "Expand"), 'expand-review-action octicon octicon-chevron-down', true, () => {
			// let webView = await commentProvider.resolveComment(threadId)
			// this._bodyElement.appendChild(webView);
			this._bodyElement.style.display = 'block';
			return null;
		}), { label: false, icon: true });

		this._actionbarWidget.push(new Action('review.close', nls.localize('label.close', "Close"), 'close-review-action', true, () => {
			this.dispose();
			return null;
		}), { label: false, icon: true });

	}

	display(comments: modes.Comment[], lineNumber: number) {
		this.show({ lineNumber: lineNumber, column: 1 }, 2);

		this._bodyElement.style.display = 'none';
		for (let i = 0; i < comments.length; i++) {
			let singleCommentContainer = document.createElement('div');
			singleCommentContainer.className = 'review-comment';
			let avatar = document.createElement('span');
			avatar.className = 'float-left';
			let img = document.createElement('img');
			img.className = 'avatar';
			img.src = comments[i].gravatar;
			avatar.appendChild(img);
			let commentDetailsContainer = document.createElement('div');
			commentDetailsContainer.className = 'review-comment-contents';

			singleCommentContainer.appendChild(avatar);
			singleCommentContainer.appendChild(commentDetailsContainer);

			let header = document.createElement('h4');
			let author = document.createElement('strong');
			author.className = 'author';
			author.innerText = comments[i].userName;
			// let time = document.createElement('span');
			// time.className = 'created_at';
			// time.innerText = comments[i].created_at;
			header.appendChild(author);
			// header.appendChild(time);
			commentDetailsContainer.appendChild(header);
			let body = document.createElement('div');
			body.className = 'comment-body';
			commentDetailsContainer.appendChild(body);
			let md = comments[i].body;
			body.appendChild(renderMarkdown(md));
			this._bodyElement.appendChild(singleCommentContainer);
		}
		// this._domNode.appendChild(document.createElement('textarea'));
		this._resizeObserver = new ResizeObserver(entries => {
			if (entries[0].target === this._bodyElement) {
				const lineHeight = this.editor.getConfiguration().lineHeight;
				const arrowHeight = Math.round(lineHeight / 3);
				const computedLinesNumber = Math.ceil((entries[0].contentRect.height + arrowHeight + 30) / lineHeight);
				this._relayout(computedLinesNumber);
			}
		});

		this._resizeObserver.observe(this._bodyElement);
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});
	}

	dispose() {
		super.dispose();
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}
	}

}

export class ReviewController implements IEditorContribution {
	private globalToDispose: IDisposable[];
	private localToDispose: IDisposable[];
	private editor: ICodeEditor;
	private decorationIDs: string[];
	private _domNode: HTMLElement;
	private _zoneWidget: ReviewZoneWidget;
	private _zoneWidgets: ReviewZoneWidget[];
	private _reviewPanelVisible: IContextKey<boolean>;
	private _commentThreads: modes.CommentThread[];

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorationIDs = [];
		this.mouseDownInfo = null;
		this._commentThreads = [];
		this._zoneWidgets = [];

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

		this._zoneWidgets.forEach(zone => {
			zone.dispose();
		});
		this._zoneWidgets = [];
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
			case MouseTargetType.GUTTER_GLYPH_MARGIN:
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
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
				return;
			}
		}

		if (this._zoneWidget && this._zoneWidget.position.lineNumber === lineNumber) {
			return;
		}

		let comments = this.getComments(lineNumber);
		if (comments && comments.length) {
			this._reviewPanelVisible.set(true);
			this._zoneWidget = new ReviewZoneWidget(this.themeService, this.editor, {}, comments);
			this._zoneWidget.display(this.getComments(lineNumber), lineNumber);
		}
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

		// create viewzones
		this._zoneWidgets.forEach(zone => {
			zone.dispose();
		});

		this._commentThreads.forEach(thread => {
			let zoneWidget = new ReviewZoneWidget(this.themeService, this.editor, {}, thread.comments);
			zoneWidget.display(this.getComments(thread.range.startLineNumber), thread.range.startLineNumber);
			this._zoneWidgets.push(zoneWidget);
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


registerThemingParticipant((theme, collector) => {
	let editorBackground = theme.getColor(peekViewEditorBackground);
	if (editorBackground) {
		collector.addRule(
			`.monaco-editor .review-widget,` +
			`.monaco-editor .review-widget {` +
			`	background-color: ${editorBackground};` +
			`}`);
	}
});
