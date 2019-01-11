/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { IEditorContribution, IModelChangedEvent } from 'vs/editor/common/editorCommon';
import { IRange } from 'vs/editor/common/core/range';
import * as modes from 'vs/editor/common/modes';
import { peekViewResultsBackground, peekViewResultsSelectionBackground, peekViewTitleBackground } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { CommentThreadCollapsibleState } from 'vs/workbench/api/node/extHostTypes';
import { ReviewZoneWidget, COMMENTEDITOR_DECORATION_KEY } from 'vs/workbench/parts/comments/electron-browser/commentThreadWidget';
import { ICommentService, ICommentInfo } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDecorationOptions } from 'vs/editor/common/model';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { overviewRulerCommentingRangeForeground } from 'vs/workbench/parts/comments/electron-browser/commentGlyphWidget';

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

class CommentingRangeDecoration {
	private _decorationId: string;

	public get id(): string {
		return this._decorationId;
	}

	constructor(private _editor: ICodeEditor, private _ownerId: string, private _extensionId: string, private _range: IRange, private _reply: modes.Command, commentingOptions: ModelDecorationOptions) {
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

	public getCommentAction(): { replyCommand: modes.Command, ownerId: string, extensionId: string } {
		return {
			extensionId: this._extensionId,
			replyCommand: this._reply,
			ownerId: this._ownerId
		};
	}

	public getOriginalRange() {
		return this._range;
	}

	public getActiveRange() {
		return this._editor.getModel().getDecorationRange(this._decorationId);
	}
}
class CommentingRangeDecorator {

	private decorationOptions: ModelDecorationOptions;
	private commentingRangeDecorations: CommentingRangeDecoration[] = [];
	private disposables: IDisposable[] = [];

	constructor() {
		const decorationOptions: IModelDecorationOptions = {
			isWholeLine: true,
			linesDecorationsClassName: 'comment-range-glyph comment-diff-added'
		};

		this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
	}

	public update(editor: ICodeEditor, commentInfos: ICommentInfo[]) {
		let model = editor.getModel();
		if (!model) {
			return;
		}

		let commentingRangeDecorations: CommentingRangeDecoration[] = [];
		for (const info of commentInfos) {
			info.commentingRanges.forEach(range => {
				commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.owner, info.extensionId, range, info.reply, this.decorationOptions));
			});
		}

		let oldDecorations = this.commentingRangeDecorations.map(decoration => decoration.id);
		editor.deltaDecorations(oldDecorations, []);

		this.commentingRangeDecorations = commentingRangeDecorations;
	}

	public getMatchedCommentAction(line: number) {
		for (const decoration of this.commentingRangeDecorations) {
			const range = decoration.getActiveRange();
			if (range.startLineNumber <= line && line <= range.endLineNumber) {
				return decoration.getCommentAction();
			}
		}

		return null;
	}

	public dispose(): void {
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
	private _commentInfos: ICommentInfo[];
	private _commentingRangeDecorator: CommentingRangeDecorator;
	private mouseDownInfo: { lineNumber: number } | null = null;
	private _commentingRangeSpaceReserved = false;
	private _computePromise: CancelablePromise<ICommentInfo[]> | null;

	private _pendingCommentCache: { [key: number]: { [key: string]: string } };
	private _pendingNewCommentCache: { [key: string]: { lineNumber: number, replyCommand: modes.Command, ownerId: string, extensionId: string, pendingComment: string, draftMode: modes.DraftMode } };

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommentService private readonly commentService: ICommentService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this._commentInfos = [];
		this._commentWidgets = [];
		this._pendingCommentCache = {};
		this._pendingNewCommentCache = {};
		this._newCommentWidget = null;
		this._computePromise = null;

		this._reviewPanelVisible = ctxReviewPanelVisible.bindTo(contextKeyService);
		this._commentingRangeDecorator = new CommentingRangeDecorator();

		this.globalToDispose.push(this.commentService.onDidDeleteDataProvider(ownerId => {
			// Remove new comment widget and glyph, refresh comments
			if (this._newCommentWidget && this._newCommentWidget.owner === ownerId) {
				this._newCommentWidget.dispose();
				this._newCommentWidget = null;
			}

			delete this._pendingCommentCache[ownerId];
			this.beginCompute();
		}));
		this.globalToDispose.push(this.commentService.onDidSetDataProvider(_ => this.beginCompute()));

		this.globalToDispose.push(this.commentService.onDidSetResourceCommentInfos(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (editorURI && editorURI.toString() === e.resource.toString()) {
				this.setComments(e.commentInfos.filter(commentInfo => commentInfo !== null));
			}
		}));

		this.globalToDispose.push(this.editor.onDidChangeModel(e => this.onModelChanged(e)));
		this.codeEditorService.registerDecorationType(COMMENTEDITOR_DECORATION_KEY, {});
		this.beginCompute();
	}

	private beginCompute(): Promise<void> {
		this._computePromise = createCancelablePromise(token => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;

			if (editorURI) {
				return this.commentService.getComments(editorURI);
			}

			return Promise.resolve([]);
		});

		return this._computePromise.then(commentInfos => {
			this.setComments(commentInfos.filter(commentInfo => commentInfo !== null));
			this._computePromise = null;
		}, error => console.log(error));
	}

	public static get(editor: ICodeEditor): ReviewController {
		return editor.getContribution<ReviewController>(ID);
	}

	public revealCommentThread(threadId: string, commentId: string, fetchOnceIfNotExist: boolean): void {
		const commentThreadWidget = this._commentWidgets.filter(widget => widget.commentThread.threadId === threadId);
		if (commentThreadWidget.length === 1) {
			commentThreadWidget[0].reveal(commentId);
		} else if (fetchOnceIfNotExist) {
			this.beginCompute().then(_ => {
				this.revealCommentThread(threadId, commentId, false);
			});
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

	public getId(): string {
		return ID;
	}

	public dispose(): void {
		this.globalToDispose = dispose(this.globalToDispose);
		this.localToDispose = dispose(this.localToDispose);

		this._commentWidgets.forEach(widget => widget.dispose());

		if (this._newCommentWidget) {
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}
		this.editor = null;
	}

	public onModelChanged(e: IModelChangedEvent): void {
		this.localToDispose = dispose(this.localToDispose);
		if (this._newCommentWidget) {
			let pendingNewComment = this._newCommentWidget.getPendingComment();

			if (e.oldModelUrl) {
				if (pendingNewComment) {
					// we can't fetch zone widget's position as the model is already gone
					const position = this._newCommentWidget.getPosition();
					if (position) {
						this._pendingNewCommentCache[e.oldModelUrl.toString()] = {
							lineNumber: position.lineNumber,
							ownerId: this._newCommentWidget.owner,
							extensionId: this._newCommentWidget.extensionId,
							replyCommand: this._newCommentWidget.commentThread.reply,
							pendingComment: pendingNewComment,
							draftMode: this._newCommentWidget.draftMode
						};
					}
				} else {
					// clear cache if it is empty
					delete this._pendingNewCommentCache[e.oldModelUrl.toString()];
				}
			}

			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}

		this.removeCommentWidgetsAndStoreCache();

		if (e.newModelUrl && this._pendingNewCommentCache[e.newModelUrl.toString()]) {
			let newCommentCache = this._pendingNewCommentCache[e.newModelUrl.toString()];
			this.addComment(newCommentCache.lineNumber, newCommentCache.replyCommand, newCommentCache.ownerId, newCommentCache.extensionId, newCommentCache.draftMode, newCommentCache.pendingComment);
		}

		this.localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
		this.localToDispose.push(this.editor.onDidChangeModelContent(() => {
		}));
		this.localToDispose.push(this.commentService.onDidUpdateCommentThreads(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (!editorURI) {
				return;
			}

			let commentInfo = this._commentInfos.filter(info => info.owner === e.owner);
			if (!commentInfo || !commentInfo.length) {
				return;
			}

			let added = e.added.filter(thread => thread.resource.toString() === editorURI.toString());
			let removed = e.removed.filter(thread => thread.resource.toString() === editorURI.toString());
			let changed = e.changed.filter(thread => thread.resource.toString() === editorURI.toString());
			let draftMode = e.draftMode;

			commentInfo.forEach(info => info.draftMode = draftMode);
			this._commentWidgets.filter(ZoneWidget => ZoneWidget.owner === e.owner).forEach(widget => widget.updateDraftMode(draftMode));
			if (this._newCommentWidget && this._newCommentWidget.owner === e.owner) {
				this._newCommentWidget.updateDraftMode(draftMode);
			}

			removed.forEach(thread => {
				let matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner && zoneWidget.commentThread.threadId === thread.threadId);
				if (matchedZones.length) {
					let matchedZone = matchedZones[0];
					let index = this._commentWidgets.indexOf(matchedZone);
					this._commentWidgets.splice(index, 1);
					matchedZone.dispose();
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
				let zoneWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.notificationService, this.editor, e.owner, thread, null, draftMode, {});
				zoneWidget.display(thread.range.startLineNumber);
				this._commentWidgets.push(zoneWidget);
				this._commentInfos.filter(info => info.owner === e.owner)[0].threads.push(thread);
			});

		}));

		this.beginCompute();
	}

	private addComment(lineNumber: number, replyCommand: modes.Command, ownerId: string, extensionId: string, draftMode: modes.DraftMode, pendingComment: string) {
		if (this._newCommentWidget !== null) {
			this.notificationService.warn(`Please submit the comment at line ${this._newCommentWidget.position.lineNumber} before creating a new one.`);
			return;
		}

		// add new comment
		this._reviewPanelVisible.set(true);
		this._newCommentWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.notificationService, this.editor, ownerId, {
			extensionId: extensionId,
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
		}, pendingComment, draftMode, {});

		this.localToDispose.push(this._newCommentWidget.onDidClose(e => {
			this.clearNewCommentWidget();
		}));

		this.localToDispose.push(this._newCommentWidget.onDidCreateThread(commentWidget => {
			const thread = commentWidget.commentThread;
			this._commentWidgets.push(commentWidget);
			this._commentInfos.filter(info => info.owner === commentWidget.owner)[0].threads.push(thread);
			this.clearNewCommentWidget();
		}));

		this._newCommentWidget.display(lineNumber);
	}

	private clearNewCommentWidget() {
		this._newCommentWidget = null;

		if (this.editor && this.editor.getModel()) {
			delete this._pendingNewCommentCache[this.editor.getModel().uri.toString()];
		}
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
			let newCommentInfo = this._commentingRangeDecorator.getMatchedCommentAction(lineNumber);
			if (!newCommentInfo) {
				return;
			}
			const { replyCommand, ownerId, extensionId } = newCommentInfo;

			let commentInfo = this._commentInfos.filter(info => info.owner === ownerId);
			if (!commentInfo || !commentInfo.length) {
				return;
			}

			let draftMode = commentInfo[0].draftMode;

			this.addComment(lineNumber, replyCommand, ownerId, extensionId, draftMode, null);
		}
	}


	private setComments(commentInfos: ICommentInfo[]): void {
		if (!this.editor) {
			return;
		}

		this._commentInfos = commentInfos;
		let lineDecorationsWidth: number = this.editor.getConfiguration().layoutInfo.decorationsWidth;

		if (this._commentInfos.some(info => Boolean(info.commentingRanges && info.commentingRanges.length))) {
			if (!this._commentingRangeSpaceReserved) {
				this._commentingRangeSpaceReserved = true;
				let extraEditorClassName: string[] = [];
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

		// create viewzones
		this.removeCommentWidgetsAndStoreCache();

		this._commentInfos.forEach(info => {
			let providerCacheStore = this._pendingCommentCache[info.owner];
			info.threads.forEach(thread => {
				let pendingComment: string = null;
				if (providerCacheStore) {
					pendingComment = providerCacheStore[thread.threadId];
				}

				if (pendingComment) {
					thread.collapsibleState = modes.CommentThreadCollapsibleState.Expanded;
				}

				let zoneWidget = new ReviewZoneWidget(this.instantiationService, this.modeService, this.modelService, this.themeService, this.commentService, this.openerService, this.dialogService, this.notificationService, this.editor, info.owner, thread, pendingComment, info.draftMode, {});
				zoneWidget.display(thread.range.startLineNumber);
				this._commentWidgets.push(zoneWidget);
			});
		});

		const commentingRanges: IRange[] = [];
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

	private removeCommentWidgetsAndStoreCache() {
		if (this._commentWidgets) {
			this._commentWidgets.forEach(zone => {
				let pendingComment = zone.getPendingComment();
				let providerCacheStore = this._pendingCommentCache[zone.owner];

				if (pendingComment) {
					if (!providerCacheStore) {
						this._pendingCommentCache[zone.owner] = {};
					}

					this._pendingCommentCache[zone.owner][zone.commentThread.threadId] = pendingComment;
				} else {
					if (providerCacheStore) {
						delete providerCacheStore[zone.commentThread.threadId];
					}
				}

				zone.dispose();
			});
		}

		this._commentWidgets = [];
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
	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}
	return editor;
}

function closeReviewPanel(accessor: ServicesAccessor, args: any) {
	const outerEditor = getOuterEditor(accessor);
	if (!outerEditor) {
		return;
	}

	const controller = ReviewController.get(outerEditor);
	if (!controller) {
		return;
	}

	controller.closeWidget();
}


registerThemingParticipant((theme, collector) => {
	const peekViewBackground = theme.getColor(peekViewResultsBackground);
	if (peekViewBackground) {
		collector.addRule(
			`.monaco-editor .review-widget,` +
			`.monaco-editor .review-widget {` +
			`	background-color: ${peekViewBackground};` +
			`}`);
	}

	const monacoEditorBackground = theme.getColor(peekViewTitleBackground);
	if (monacoEditorBackground) {
		collector.addRule(
			`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button {` +
			`	background-color: ${monacoEditorBackground}` +
			`}`
		);
	}

	const monacoEditorForeground = theme.getColor(editorForeground);
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

	const selectionBackground = theme.getColor(peekViewResultsSelectionBackground);

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
