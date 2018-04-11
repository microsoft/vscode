/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./review';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import * as modes from 'vs/editor/common/modes';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType, IViewZone, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { $ } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TrackedRangeStickiness, IModelDeltaDecoration } from 'vs/editor/common/model';
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
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Emitter, Event } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import { ReviewModel, ReviewStyle } from 'vs/editor/contrib/review/reviewModel';
import { editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';

export const ctxReviewPanelVisible = new RawContextKey<boolean>('reviewPanelVisible', false);
export const ID = 'editor.contrib.review';

declare var ResizeObserver: any;

const REVIEW_DECORATION = ModelDecorationOptions.register({
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	glyphMarginClassName: 'review'
});

const NEW_COMMENT_DECORATION = ModelDecorationOptions.register({
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	glyphMarginClassName: 'new-comment-hint',
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
	private _commentsElement: HTMLElement;
	private _resizeObserver: any;
	private _comments: modes.Comment[];
	private _onDidClose = new Emitter<ReviewZoneWidget>();

	constructor(
		private readonly themeService: IThemeService,
		private readonly commandService: ICommandService,

		editor: ICodeEditor, options: IOptions = {}, comments: modes.Comment[]) {
		super(editor, options);
		this._resizeObserver = null;
		this._comments = comments;
		this.create();
		this.themeService.onThemeChange(this._applyTheme, this);
	}

	public get onDidClose(): Event<ReviewZoneWidget> {
		return this._onDidClose.event;
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._headElement = <HTMLDivElement>$('.head').getHTMLElement();
		container.appendChild(this._headElement);
		this._fillHead(this._headElement);

		this._bodyElement = <HTMLDivElement>$('.body').getHTMLElement();
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

		let primaryHeading = 'Reviewers:';
		$(this._primaryHeading).safeInnerHtml(primaryHeading);
		this._primaryHeading.setAttribute('aria-label', primaryHeading);

		let secondaryHeading = this._comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
		$(this._secondaryHeading).safeInnerHtml(secondaryHeading);

		const actionsContainer = $('.review-actions').appendTo(this._headElement);
		this._actionbarWidget = new ActionBar(actionsContainer.getHTMLElement(), {});
		this._disposables.push(this._actionbarWidget);

		let toggleAction = new Action('review.expand', nls.localize('label.expand', "Expand"), 'expand-review-action octicon octicon-chevron-down', true, () => {
			// let webView = await commentProvider.resolveComment(threadId)
			// this._bodyElement.appendChild(webView);
			if (toggleAction.class.indexOf('octicon-chevron-down') >= 0) {
				this._bodyElement.style.display = 'block';
				toggleAction.class = 'expand-review-action octicon octicon-chevron-up';
			} else {
				this._bodyElement.style.display = 'none';
				toggleAction.class = 'expand-review-action octicon octicon-chevron-down';

			}
			return null;
		});

		this._actionbarWidget.push(toggleAction, { label: false, icon: true });

		// this._actionbarWidget.push(new Action('review.close', nls.localize('label.close', "Close"), 'close-review-action', true, () => {
		// 	this.dispose();
		// 	return null;
		// }), { label: false, icon: true });
	}

	createCommentElement(comment: modes.Comment) {
		let singleCommentContainer = document.createElement('div');
		singleCommentContainer.className = 'review-comment';
		let avatar = document.createElement('span');
		avatar.className = 'float-left';
		let img = document.createElement('img');
		img.className = 'avatar';
		img.src = comment.gravatar;
		avatar.appendChild(img);
		let commentDetailsContainer = document.createElement('div');
		commentDetailsContainer.className = 'review-comment-contents';

		singleCommentContainer.appendChild(avatar);
		singleCommentContainer.appendChild(commentDetailsContainer);

		let header = document.createElement('h4');
		let author = document.createElement('strong');
		author.className = 'author';
		author.innerText = comment.userName;
		// let time = document.createElement('span');
		// time.className = 'created_at';
		// time.innerText = comment.created_at;
		header.appendChild(author);
		// header.appendChild(time);
		commentDetailsContainer.appendChild(header);
		let body = document.createElement('div');
		body.className = 'comment-body';
		commentDetailsContainer.appendChild(body);
		let md = comment.body;
		body.appendChild(renderMarkdown(md));

		return singleCommentContainer;
	}

	display(commentThread: modes.CommentThread, lineNumber: number) {
		const comments = commentThread.comments;
		this.show({ lineNumber: lineNumber, column: 1 }, 2);

		var headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;

		this._bodyElement.style.display = 'none';
		this._commentsElement = $('div.comments-container').getHTMLElement();
		this._bodyElement.appendChild(this._commentsElement);
		for (let i = 0; i < comments.length; i++) {
			let singleCommentContainer = this.createCommentElement(comments[i]);
			this._commentsElement.appendChild(singleCommentContainer);
		}

		const commentForm = document.createElement('div');
		commentForm.className = 'comment-form';
		this._bodyElement.appendChild(commentForm);

		const textArea = document.createElement('textarea');
		commentForm.appendChild(textArea);

		const formActions = document.createElement('div');
		formActions.className = 'form-actions';
		commentForm.appendChild(formActions);

		for (const action of commentThread.actions) {
			const button = document.createElement('button');
			button.onclick = async () => {
				let newComment = await this.commandService.executeCommand(action.id, commentThread.threadId, textArea.value);
				if (newComment) {
					textArea.value = '';
					let singleCommentContainer = this.createCommentElement(newComment);
					this._commentsElement.appendChild(singleCommentContainer);
				}
			};
			button.textContent = action.title;
			formActions.appendChild(button);
		}

		this._resizeObserver = new ResizeObserver(entries => {
			if (entries[0].target === this._bodyElement) {
				const lineHeight = this.editor.getConfiguration().lineHeight;
				const arrowHeight = Math.round(lineHeight / 3);
				const computedLinesNumber = Math.ceil((headHeight + entries[0].contentRect.height + arrowHeight) / lineHeight);
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
		this._onDidClose.fire();
	}

}

export class ReviewSwitchWidget extends Widget implements IOverlayWidget {
	private _domNode: HTMLElement;

	constructor(reviewModel: ReviewModel) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.className = 'review-switch-widget';
		this._domNode.textContent = 'Review';

		this._domNode.onclick = e => {
			dom.toggleClass(this._domNode, 'inactive');
			if (dom.hasClass(this._domNode, 'inactive')) {
				reviewModel.setStyle(ReviewStyle.Gutter);
			} else {
				reviewModel.setStyle(ReviewStyle.Inline);
			}
		};
	}

	getId(): string {
		return 'editor.contrib.reviewSwitch';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

export class ReviewController implements IEditorContribution {
	private globalToDispose: IDisposable[];
	private localToDispose: IDisposable[];
	private editor: ICodeEditor;
	private decorationIDs: string[];
	private newCommentHintDecoration: string[];
	private _domNode: HTMLElement;
	private _reviewSwitch: ReviewSwitchWidget;
	private _zoneWidget: ReviewZoneWidget;
	private _zoneWidgets: ReviewZoneWidget[];
	private _reviewPanelVisible: IContextKey<boolean>;
	private _commentThreads: modes.CommentThread[];
	private _reviewModel: ReviewModel;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@ICommandService private commandService: ICommandService,
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorationIDs = [];
		this.newCommentHintDecoration = [];
		this.mouseDownInfo = null;
		this._commentThreads = [];
		this._zoneWidgets = [];
		this._zoneWidget = null;
		this._reviewSwitch = null;

		this._reviewPanelVisible = ctxReviewPanelVisible.bindTo(contextKeyService);
		this._domNode = document.createElement('div');
		this._domNode.className = 'review-widget';
		this._reviewModel = new ReviewModel();

		this._reviewModel.onDidChangeStyle(style => {
			if (style === ReviewStyle.Gutter) {
				this._zoneWidgets.forEach(zone => {
					zone.dispose();
				});
				this._zoneWidgets = [];

				this.editor.changeDecorations(accessor => {
					this.decorationIDs = accessor.deltaDecorations(this.decorationIDs, this._commentThreads.map(thread => ({
						range: thread.range,
						options: REVIEW_DECORATION
					})));
				});
			} else {
				this.editor.changeDecorations(accessor => {
					this.decorationIDs = accessor.deltaDecorations(this.decorationIDs, []);
				});

				if (this._zoneWidget) {
					this._zoneWidget.dispose();
					this._zoneWidget = null;
				}

				this._zoneWidgets.forEach(zone => {
					zone.dispose();
				});

				this._commentThreads.forEach(thread => {
					let zoneWidget = new ReviewZoneWidget(this.themeService, this.commandService, this.editor, {}, thread.comments);
					zoneWidget.display(this.getCommentThread(thread.range.startLineNumber), thread.range.startLineNumber);
					this._zoneWidgets.push(zoneWidget);
				});
			}
		});

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
		this.localToDispose.push(this.editor.onMouseMove(e => this.onEditorMouseMove(e)));
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

		let thread = this.getCommentThread(lineNumber);
		if (thread && thread.comments.length) {
			this._reviewPanelVisible.set(true);
			this._zoneWidget = new ReviewZoneWidget(this.themeService, this.commandService, this.editor, {}, thread.comments);
			this._zoneWidget.onDidClose(e => {
				this._zoneWidget = null;
			});
			this._zoneWidget.display(this.getCommentThread(lineNumber), lineNumber);
		}
	}

	private onEditorMouseMove(e: IEditorMouseEvent): void {
		let showNewCommentHintAtLineNumber = -1;
		if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN
			&& this.marginFreeFromCommentHintDecorations(e.target.position.lineNumber)) {
			const data = e.target.detail as IMarginData;
			if (!data.isAfterLines) {
				showNewCommentHintAtLineNumber = e.target.position.lineNumber;
			}
		}
		this.ensureNewCommentHintDecoration(showNewCommentHintAtLineNumber);
	}

	ensureNewCommentHintDecoration(showNewCommentHintAtLineNumber: number) {
		const newDecoration: IModelDeltaDecoration[] = [];
		if (showNewCommentHintAtLineNumber !== -1) {
			newDecoration.push({
				options: NEW_COMMENT_DECORATION,
				range: {
					startLineNumber: showNewCommentHintAtLineNumber,
					startColumn: 1,
					endLineNumber: showNewCommentHintAtLineNumber,
					endColumn: 1
				}
			});
		}

		this.newCommentHintDecoration = this.editor.deltaDecorations(this.newCommentHintDecoration, newDecoration);
	}

	marginFreeFromCommentHintDecorations(line: number): boolean {
		let allowNewComment = false;

		for (let i = 0; i < this._commentThreads.length; i++) {
			if (this._commentThreads[i].newCommentRange.startLineNumber <= line && this._commentThreads[i].newCommentRange.endLineNumber >= line) {
				allowNewComment = true;
				break;
			}

		}

		if (!allowNewComment) {
			return false;
		}

		const decorations = this.editor.getLineDecorations(line);
		if (decorations) {
			for (const { options } of decorations) {
				if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf('review') > -1) {
					return false;
				}
			}
		}

		return true;
	}

	getCommentThread(line: number): modes.CommentThread | undefined {
		for (let i = 0; i < this._commentThreads.length; i++) {
			if (this._commentThreads[i].range.startLineNumber === line) {
				return this._commentThreads[i];
			}
		}

		return undefined;
	}

	setComments(commentThreads: modes.CommentThread[]): void {
		this._commentThreads = commentThreads;

		if (this._commentThreads.length === 0) {
			return;
		}

		// if (!this._reviewSwitch) {
		// 	this._reviewSwitch = new ReviewSwitchWidget(this._reviewModel);
		// 	this.editor.addOverlayWidget(this._reviewSwitch);
		// }

		if (this._reviewModel.style === ReviewStyle.Gutter) {
			this.editor.changeDecorations(accessor => {
				this.decorationIDs = accessor.deltaDecorations(this.decorationIDs, commentThreads.map(thread => ({
					range: thread.range,
					options: REVIEW_DECORATION
				})));
			});
		} else {
			// create viewzones
			this._zoneWidgets.forEach(zone => {
				zone.dispose();
			});

			this._commentThreads.forEach(thread => {
				let zoneWidget = new ReviewZoneWidget(this.themeService, this.commandService, this.editor, {}, thread.comments);
				zoneWidget.display(this.getCommentThread(thread.range.startLineNumber), thread.range.startLineNumber);
				this._zoneWidgets.push(zoneWidget);
			});
		}
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
	let peekViewBackground = theme.getColor(peekViewEditorBackground);
	if (peekViewBackground) {
		collector.addRule(
			`.monaco-editor .review-widget,` +
			`.monaco-editor .review-widget {` +
			`	background-color: ${peekViewBackground};` +
			`}`);
	}

	let monacoEditorBackground = theme.getColor(editorBackground);
	if (monacoEditorBackground) {
		collector.addRule(
			`.monaco-editor .review-widget .body textarea {` +
			`	background-color: ${monacoEditorBackground}` +
			`}`
		);
	}

	let monacoEditorForeground = theme.getColor(editorForeground);
	if (monacoEditorForeground) {
		collector.addRule(
			`.monaco-editor .review-widget .body textarea {` +
			`	color: ${monacoEditorForeground}` +
			`}`
		);
	}
});
