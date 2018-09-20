/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/review';
import * as nls from 'vs/nls';
import { $ } from 'vs/base/browser/dom';
import { findFirstInSorted } from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IViewZone, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorAction, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IRange } from 'vs/editor/common/core/range';
import * as modes from 'vs/editor/common/modes';
import { peekViewResultsBackground, peekViewResultsSelectionBackground, peekViewTitleBackground } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { editorForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { CommentThreadCollapsibleState } from 'vs/workbench/api/node/extHostTypes';
import { ReviewZoneWidget, COMMENTEDITOR_DECORATION_KEY } from 'vs/workbench/parts/comments/electron-browser/commentThreadWidget';
import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDecorationOptions } from 'vs/editor/common/model';
import { Color, RGBA } from 'vs/base/common/color';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export const ctxReviewPanelVisible = new RawContextKey<boolean>('reviewPanelVisible', false);

export const ID = 'editor.contrib.review';

export class ReviewViewZone implements IViewZone {
	public readonly afterLineNumber: number;
	public readonly domNode: HTMLElement;
	private callback: (top: number) => void;

	constructor(afterLineNumber: number, onDomNodeTop: (top: number) => void) {
		this.afterLineNumber = afterLineNumber;
		this.callback = onDomNodeTop;

		this.domNode = $('.review-viewzone');
	}

	onDomNodeTop(top: number): void {
		this.callback(top);
	}
}

const overviewRulerDefault = new Color(new RGBA(197, 197, 197, 1));

export const overviewRulerCommentingRangeForeground = registerColor('editorGutter.commentRangeForeground', { dark: overviewRulerDefault, light: overviewRulerDefault, hc: overviewRulerDefault }, nls.localize('editorGutterCommentRangeForeground', 'Editor gutter decoration color for commenting ranges.'));

class CommentingRangeDecoration {
	private _decorationId: string;

	get id(): string {
		return this._decorationId;
	}

	constructor(private _editor: ICodeEditor, private _ownerId: number, private _range: IRange, private _reply: modes.Command, commentingOptions: ModelDecorationOptions) {
		const startLineNumber = _range.startLineNumber;
		const endLineNumber = _range.endLineNumber;
		let commentingRangeDecorations = [{
			range: {
				startLineNumber: startLineNumber, startColumn: 1,
				endLineNumber: endLineNumber, endColumn: 1
			},
			options: commentingOptions
		}];

		let model = this._editor.getModel();
		if (model) {
			this._decorationId = model.deltaDecorations([this._decorationId], commentingRangeDecorations)[0];
		}
	}

	getCommentAction(): { replyCommand: modes.Command, ownerId: number } {
		return {
			replyCommand: this._reply,
			ownerId: this._ownerId
		};
	}

	getOriginalRange() {
		return this._range;
	}

	getActiveRange() {
		return this._editor.getModel().getDecorationRange(this._decorationId);
	}
}
class CommentingRangeDecorator {

	static createDecoration(className: string, foregroundColor: string, options: { gutter: boolean, overview: boolean }): ModelDecorationOptions {
		const decorationOptions: IModelDecorationOptions = {
			isWholeLine: true,
		};

		decorationOptions.linesDecorationsClassName = `comment-range-glyph ${className}`;
		return ModelDecorationOptions.createDynamic(decorationOptions);
	}

	private commentingOptions: ModelDecorationOptions;
	public commentsOptions: ModelDecorationOptions;
	private commentingRangeDecorations: CommentingRangeDecoration[] = [];
	private disposables: IDisposable[] = [];

	constructor(
	) {
		const options = { gutter: true, overview: false };
		this.commentingOptions = CommentingRangeDecorator.createDecoration('comment-diff-added', overviewRulerCommentingRangeForeground, options);
		this.commentsOptions = CommentingRangeDecorator.createDecoration('comment-thread', overviewRulerCommentingRangeForeground, options);
	}

	update(editor: ICodeEditor, commentInfos: modes.CommentInfo[]) {
		let model = editor.getModel();
		if (!model) {
			return;
		}

		let commentingRangeDecorations = [];
		for (let i = 0; i < commentInfos.length; i++) {
			let info = commentInfos[i];
			info.commentingRanges.forEach(range => {
				commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.owner, range, info.reply, this.commentingOptions));
			});
		}

		let oldDecorations = this.commentingRangeDecorations.map(decoration => decoration.id);
		editor.deltaDecorations(oldDecorations, []);

		this.commentingRangeDecorations = commentingRangeDecorations;
	}

	getMatchedCommentAction(line: number) {
		for (let i = 0; i < this.commentingRangeDecorations.length; i++) {
			let range = this.commentingRangeDecorations[i].getActiveRange();

			if (range.startLineNumber <= line && line <= range.endLineNumber) {
				return this.commentingRangeDecorations[i].getCommentAction();
			}
		}

		return null;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.commentingRangeDecorations = [];
	}
}

export class ReviewController implements IEditorContribution {
	private globalToDispose: IDisposable[];
	private localToDispose: IDisposable[];
	private editor: ICodeEditor;
	private _newCommentWidget: ReviewZoneWidget;
	private _commentWidgets: ReviewZoneWidget[];
	private _reviewPanelVisible: IContextKey<boolean>;
	private _commentInfos: modes.CommentInfo[];
	// private _hasSetComments: boolean;
	private _commentingRangeDecorator: CommentingRangeDecorator;
	private mouseDownInfo: { lineNumber: number } | null = null;
	private _commentingRangeSpaceReserved = false;


	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IOpenerService private openerService: IOpenerService,
		@IDialogService private dialogService: IDialogService
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this._commentInfos = [];
		this._commentWidgets = [];
		this._newCommentWidget = null;
		// this._hasSetComments = false;

		this._reviewPanelVisible = ctxReviewPanelVisible.bindTo(contextKeyService);
		this._commentingRangeDecorator = new CommentingRangeDecorator();

		this.globalToDispose.push(this.commentService.onDidDeleteDataProvider(e => {
			// Remove new comment widget and glyph, refresh comments
			if (this._newCommentWidget) {
				this._newCommentWidget.dispose();
				this._newCommentWidget = null;
			}

			this.getComments();
		}));

		this.globalToDispose.push(this.commentService.onDidSetResourceCommentInfos(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (editorURI && editorURI.toString() === e.resource.toString()) {
				this.setComments(e.commentInfos.filter(commentInfo => commentInfo !== null));
			}
		}));

		this.globalToDispose.push(this.commentService.onDidSetDataProvider(_ => this.getComments()));

		this.globalToDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this.codeEditorService.registerDecorationType(COMMENTEDITOR_DECORATION_KEY, {});
	}

	private getComments(): void {
		const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;

		if (editorURI) {
			this.commentService.getComments(editorURI).then(commentInfos => {
				this.setComments(commentInfos.filter(commentInfo => commentInfo !== null));
			}, error => console.log(error));
		}
	}

	public static get(editor: ICodeEditor): ReviewController {
		return editor.getContribution<ReviewController>(ID);
	}

	public revealCommentThread(threadId: string, commentId?: string): void {
		const commentThreadWidget = this._commentWidgets.filter(widget => widget.commentThread.threadId === threadId);
		if (commentThreadWidget.length === 1) {
			commentThreadWidget[0].reveal(commentId);
		}
	}

	public nextCommentThread(): void {
		if (!this._commentWidgets.length) {
			return;
		}

		const after = this.editor.getSelection().getEndPosition();
		const sortedWidgets = this._commentWidgets.sort((a, b) => {
			if (a.commentThread.range.startLineNumber < b.commentThread.range.startLineNumber) {
				return -1;
			}

			if (a.commentThread.range.startLineNumber > b.commentThread.range.startLineNumber) {
				return 1;
			}

			if (a.commentThread.range.startColumn < b.commentThread.range.startColumn) {
				return -1;
			}

			if (a.commentThread.range.startColumn > b.commentThread.range.startColumn) {
				return 1;
			}

			return 0;
		});

		let idx = findFirstInSorted(sortedWidgets, widget => {
			if (widget.commentThread.range.startLineNumber > after.lineNumber) {
				return true;
			}

			if (widget.commentThread.range.startLineNumber < after.lineNumber) {
				return false;
			}

			if (widget.commentThread.range.startColumn > after.column) {
				return true;
			}
			return false;
		});

		if (idx === this._commentWidgets.length) {
			this._commentWidgets[0].reveal();
			this.editor.setSelection(this._commentWidgets[0].commentThread.range);
		} else {
			sortedWidgets[idx].reveal();
			this.editor.setSelection(sortedWidgets[idx].commentThread.range);
		}
	}

	getId(): string {
		return ID;
	}

	dispose(): void {
		this.globalToDispose = dispose(this.globalToDispose);
		this.localToDispose = dispose(this.localToDispose);

		this._commentWidgets.forEach(widget => widget.dispose());

		if (this._newCommentWidget) {
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}
		this.editor = null;
	}

	public onModelChanged(): void {
		this.localToDispose = dispose(this.localToDispose);
		if (this._newCommentWidget) {
			// todo@peng store view state.
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}

		this._commentWidgets.forEach(zone => {
			zone.dispose();
		});
		this._commentWidgets = [];

		this.localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
		this.localToDispose.push(this.editor.onDidChangeModelContent(() => {
		}));
		this.localToDispose.push(this.commentService.onDidUpdateCommentThreads(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (!editorURI) {
				return;
			}

			if (!this._commentInfos.some(info => info.owner === e.owner)) {
				return;
			}

			let added = e.added.filter(thread => thread.resource.toString() === editorURI.toString());
			let removed = e.removed.filter(thread => thread.resource.toString() === editorURI.toString());
			let changed = e.changed.filter(thread => thread.resource.toString() === editorURI.toString());

			removed.forEach(thread => {
				let matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner && zoneWidget.commentThread.threadId === thread.threadId);
				if (matchedZones.length) {
					let matchedZone = matchedZones[0];
					let index = this._commentWidgets.indexOf(matchedZone);
					this._commentWidgets.splice(index, 1);
				}
			});

			changed.forEach(thread => {
				let matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner && zoneWidget.commentThread.threadId === thread.threadId);
				if (matchedZones.length) {
					let matchedZone = matchedZones[0];
					matchedZone.update(thread);
				}
			});
			added.forEach(thread => {
				let zoneWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.editor, e.owner, thread, {});
				zoneWidget.display(thread.range.startLineNumber, this._commentingRangeDecorator.commentsOptions);
				this._commentWidgets.push(zoneWidget);
				this._commentInfos.filter(info => info.owner === e.owner)[0].threads.push(thread);
			});
		}));
	}

	private addComment(lineNumber: number) {
		if (this._newCommentWidget !== null) {
			this.notificationService.warn(`Please submit the comment at line ${this._newCommentWidget.position.lineNumber} before creating a new one.`);
			return;
		}

		let newCommentInfo = this._commentingRangeDecorator.getMatchedCommentAction(lineNumber);
		if (!newCommentInfo) {
			return;
		}

		// add new comment
		this._reviewPanelVisible.set(true);
		const { replyCommand, ownerId } = newCommentInfo;
		this._newCommentWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.editor, ownerId, {
			threadId: null,
			resource: null,
			comments: [],
			range: {
				startLineNumber: lineNumber,
				startColumn: 0,
				endLineNumber: lineNumber,
				endColumn: 0
			},
			reply: replyCommand,
			collapsibleState: CommentThreadCollapsibleState.Expanded,
		}, {});

		this.localToDispose.push(this._newCommentWidget.onDidClose(e => {
			this._newCommentWidget = null;
		}));

		this.localToDispose.push(this._newCommentWidget.onDidCreateThread(commentWidget => {
			const thread = commentWidget.commentThread;
			this._commentWidgets.push(commentWidget);
			this._commentInfos.filter(info => info.owner === commentWidget.owner)[0].threads.push(thread);
			this._newCommentWidget = null;
		}));

		this._newCommentWidget.display(lineNumber, this._commentingRangeDecorator.commentsOptions);
	}

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range) {
			return;
		}

		if (!e.event.leftButton) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}

		const data = e.target.detail as IMarginData;
		const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

		// don't collide with folding and git decorations
		if (gutterOffsetX > 14) {
			return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}

		const { lineNumber } = this.mouseDownInfo;
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}

		if (!e.target.element) {
			return;
		}

		if (e.target.element.className.indexOf('comment-diff-added') >= 0) {
			const lineNumber = e.target.position.lineNumber;
			this.addComment(lineNumber);
		}
	}

	setComments(commentInfos: modes.CommentInfo[]): void {
		this._commentInfos = commentInfos;
		let lineDecorationsWidth: number = this.editor.getConfiguration().layoutInfo.decorationsWidth;

		if (this._commentInfos.some(info => Boolean(info.commentingRanges && info.commentingRanges.length))) {
			if (!this._commentingRangeSpaceReserved) {
				this._commentingRangeSpaceReserved = true;
				let extraEditorClassName = [];
				if (this.editor.getRawConfiguration().extraEditorClassName) {
					extraEditorClassName = this.editor.getRawConfiguration().extraEditorClassName.split(' ');
				}

				if (this.editor.getConfiguration().contribInfo.folding) {
					lineDecorationsWidth -= 16;
				}
				lineDecorationsWidth += 9;
				extraEditorClassName.push('inline-comment');
				this.editor.updateOptions({
					extraEditorClassName: extraEditorClassName.join(' '),
					lineDecorationsWidth: lineDecorationsWidth
				});

				// we only update the lineDecorationsWidth property but keep the width of the whole editor.
				const originalLayoutInfo = this.editor.getLayoutInfo();

				this.editor.layout({
					width: originalLayoutInfo.width,
					height: originalLayoutInfo.height
				});
			}
		}

		// this._hasSetComments = true;

		// create viewzones
		this._commentWidgets.forEach(zone => {
			zone.dispose();
		});

		this._commentWidgets = [];

		this._commentInfos.forEach(info => {
			info.threads.forEach(thread => {
				let zoneWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.editor, info.owner, thread, {});
				zoneWidget.display(thread.range.startLineNumber, this._commentingRangeDecorator.commentsOptions);
				this._commentWidgets.push(zoneWidget);
			});
		});

		const commentingRanges = [];
		this._commentInfos.forEach(info => {
			commentingRanges.push(...info.commentingRanges);
		});
		this._commentingRangeDecorator.update(this.editor, this._commentInfos);
	}

	public closeWidget(): void {
		this._reviewPanelVisible.reset();

		if (this._newCommentWidget) {
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}

		if (this._commentWidgets) {
			this._commentWidgets.forEach(widget => widget.hide());
		}

		this.editor.focus();
		this.editor.revealRangeInCenter(this.editor.getSelection());
	}
}

export class NextCommentThreadAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.nextCommentThreadAction',
			label: nls.localize('nextCommentThreadAction', "Go to Next Comment Thread"),
			alias: 'Go to Next Comment Thread',
			precondition: null,
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = ReviewController.get(editor);
		if (controller) {
			controller.nextCommentThread();
		}
	}
}

registerEditorContribution(ReviewController);
registerEditorAction(NextCommentThreadAction);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReviewPanel',
	weight: KeybindingWeight.EditorContrib,
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
	let peekViewBackground = theme.getColor(peekViewResultsBackground);
	if (peekViewBackground) {
		collector.addRule(
			`.monaco-editor .review-widget,` +
			`.monaco-editor .review-widget {` +
			`	background-color: ${peekViewBackground};` +
			`}`);
	}

	let monacoEditorBackground = theme.getColor(peekViewTitleBackground);
	if (monacoEditorBackground) {
		collector.addRule(
			`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button {` +
			`	background-color: ${monacoEditorBackground}` +
			`}`
		);
	}

	let monacoEditorForeground = theme.getColor(editorForeground);
	if (monacoEditorForeground) {
		collector.addRule(
			`.monaco-editor .review-widget .body .monaco-editor {` +
			`	color: ${monacoEditorForeground}` +
			`}` +
			`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button {` +
			`	color: ${monacoEditorForeground}` +
			`}`
		);
	}

	let selectionBackground = theme.getColor(peekViewResultsSelectionBackground);

	if (selectionBackground) {
		collector.addRule(
			`@keyframes monaco-review-widget-focus {` +
			`	0% { background: ${selectionBackground}; }` +
			`	100% { background: transparent; }` +
			`}` +
			`.monaco-editor .review-widget .body .review-comment.focus {` +
			`	animation: monaco-review-widget-focus 3s ease 0s;` +
			`}`
		);
	}

	const commentingRangeForeground = theme.getColor(overviewRulerCommentingRangeForeground);
	if (commentingRangeForeground) {
		collector.addRule(`
			.monaco-editor .comment-diff-added {
				border-left: 3px solid ${commentingRangeForeground};
			}
			.monaco-editor .comment-diff-added:before {
				background: ${commentingRangeForeground};
			}
			.monaco-editor .comment-thread {
				border-left: 3px solid ${commentingRangeForeground};
			}
			.monaco-editor .comment-thread:before {
				background: ${commentingRangeForeground};
			}
		`);
	}
});
