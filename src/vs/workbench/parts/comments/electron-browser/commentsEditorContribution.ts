/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/review';
import { $ } from 'vs/base/browser/builder';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IViewZone } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import * as modes from 'vs/editor/common/modes';
import { peekViewEditorBackground } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { editorBackground, editorForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { CommentThreadCollapsibleState } from 'vs/workbench/api/node/extHostTypes';
import { ReviewModel } from 'vs/workbench/parts/comments/common/reviewModel';
import { CommentGlyphWidget } from 'vs/workbench/parts/comments/electron-browser/commentGlyphWidget';
import { ReviewZoneWidget } from 'vs/workbench/parts/comments/electron-browser/commentThreadWidget';
import { ICommentService } from 'vs/workbench/services/comments/electron-browser/commentService';

export const ctxReviewPanelVisible = new RawContextKey<boolean>('reviewPanelVisible', false);
export const overviewRulerReviewForeground = registerColor('editorOverviewRuler.reviewForeground', { dark: '#ff646480', light: '#ff646480', hc: '#ff646480' }, nls.localize('overviewRulerWordHighlightStrongForeground', 'Overview ruler marker color for write-access symbol highlights. The color must not be opaque to not hide underlying decorations.'), true);

export const ID = 'editor.contrib.review';

const COMMENTING_RANGE_DECORATION = ModelDecorationOptions.register({
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	linesDecorationsClassName: 'commenting-range',
});

export class ReviewViewZone implements IViewZone {
	public readonly afterLineNumber: number;
	public readonly domNode: HTMLElement;
	private callback: (top: number) => void;

	constructor(afterLineNumber: number, onDomNodeTop: (top: number) => void) {
		this.afterLineNumber = afterLineNumber;
		this.callback = onDomNodeTop;

		this.domNode = $('.review-viewzone').getHTMLElement();
	}

	onDomNodeTop(top: number): void {
		this.callback(top);
	}
}

export class ReviewController implements IEditorContribution {
	private globalToDispose: IDisposable[];
	private localToDispose: IDisposable[];
	private editor: ICodeEditor;
	private decorationIDs: string[];
	private commentingRangeDecorationMap: Map<number, string[]>;
	private commentingRangeDecorations: string[];
	private _newCommentWidget: ReviewZoneWidget;
	private _commentWidgets: ReviewZoneWidget[];
	private _reviewPanelVisible: IContextKey<boolean>;
	private _commentInfos: modes.CommentInfo[];
	private _reviewModel: ReviewModel;
	private _newCommentGlyph: CommentGlyphWidget;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@ICommandService private commandService: ICommandService,
		@ICommentService private commentService: ICommentService,
		@INotificationService private notificationService: INotificationService
	) {
		this.editor = editor;
		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorationIDs = [];
		this.commentingRangeDecorations = [];
		this.commentingRangeDecorationMap = new Map();
		this._commentInfos = [];
		this._commentWidgets = [];
		this._newCommentWidget = null;
		this._newCommentGlyph = null;

		this._reviewPanelVisible = ctxReviewPanelVisible.bindTo(contextKeyService);
		this._reviewModel = new ReviewModel();

		this._reviewModel.onDidChangeStyle(style => {
			this.editor.changeDecorations(accessor => {
				this.decorationIDs = accessor.deltaDecorations(this.decorationIDs, []);
			});

			if (this._newCommentWidget) {
				this._newCommentWidget.dispose();
				this._newCommentWidget = null;
			}

			this._commentWidgets.forEach(zone => {
				zone.dispose();
			});

			this._commentInfos.forEach(info => {
				info.threads.forEach(thread => {
					let zoneWidget = new ReviewZoneWidget(this.editor, info.owner, thread, info.reply, {}, this.themeService, this.commandService);
					zoneWidget.display(thread.range.startLineNumber);
					this._commentWidgets.push(zoneWidget);
				});
			});
		});

		this.globalToDispose.push(this.commentService.onDidSetResourceCommentInfos(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (editorURI && editorURI.toString() === e.resource.toString()) {
				this.setComments(e.commentInfos);
			}
		}));

		this.globalToDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
	}

	public static get(editor: ICodeEditor): ReviewController {
		return editor.getContribution<ReviewController>(ID);
	}

	public revealCommentThread(threadId: string): void {
		const commentThreadWidget = this._commentWidgets.filter(widget => widget.commentThread.threadId === threadId);
		if (commentThreadWidget.length === 1) {
			commentThreadWidget[0].reveal();
		}
	}

	getId(): string {
		return ID;
	}

	dispose(): void {
		this.globalToDispose = dispose(this.globalToDispose);
		this.localToDispose = dispose(this.localToDispose);

		if (this._newCommentWidget) {
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}
		this.editor = null;
	}

	public onModelChanged(): void {
		this.localToDispose = dispose(this.localToDispose);
		if (this._newCommentWidget) {
			// todo store view state.
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}

		this._commentWidgets.forEach(zone => {
			zone.dispose();
		});
		this._commentWidgets = [];

		this.localToDispose.push(this.editor.onMouseMove(e => this.onEditorMouseMove(e)));
		this.localToDispose.push(this.commentService.onDidUpdateCommentThreads(e => {
			const editorURI = this.editor && this.editor.getModel() && this.editor.getModel().uri;
			if (!editorURI) {
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
				let zoneWidget = new ReviewZoneWidget(this.editor, e.owner, thread, thread.reply, {}, this.themeService, this.commandService);
				zoneWidget.display(thread.range.startLineNumber);
				this._commentWidgets.push(zoneWidget);
				this._commentInfos.filter(info => info.owner === e.owner)[0].threads.push(thread);
			});
		}));
	}

	private addComment(lineNumber: number) {
		let newCommentInfo = this.getNewCommentAction(lineNumber);
		if (!newCommentInfo) {
			return;
		}

		// add new comment
		this._reviewPanelVisible.set(true);
		const { replyCommand, ownerId } = newCommentInfo;
		this._newCommentWidget = new ReviewZoneWidget(this.editor, ownerId, {
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
		}, replyCommand, {}, this.themeService, this.commandService);

		this._newCommentWidget.onDidClose(e => {
			this._newCommentWidget = null;
		});
		this._newCommentWidget.display(lineNumber);
	}

	private onEditorMouseMove(e: IEditorMouseEvent): void {
		if (e.target.position && e.target.position.lineNumber !== undefined) {
			if (this._newCommentGlyph && e.target.element.className !== 'comment-hint') {
				this.editor.removeContentWidget(this._newCommentGlyph);
			}

			const lineNumber = e.target.position.lineNumber;
			if (!this.isExistingCommentThreadAtLine(lineNumber)) {
				this._newCommentGlyph = this.isLineInCommentingRange(lineNumber)
					? this._newCommentGlyph = new CommentGlyphWidget('comment-hint', this.editor, lineNumber, false, () => {
						this.addComment(lineNumber);
					})
					: this._newCommentGlyph = new CommentGlyphWidget('comment-hint', this.editor, lineNumber, true, () => {
						this.notificationService.warn('Commenting is not supported outside of diff chunk areas.');
					});

				this.editor.layoutContentWidget(this._newCommentGlyph);
			}
		}
	}

	getNewCommentAction(line: number): { replyCommand: modes.Command, ownerId: number } {
		for (let i = 0; i < this._commentInfos.length; i++) {
			const commentInfo = this._commentInfos[i];
			const lineWithinRange = commentInfo.commentingRanges.some(range =>
				range.startLineNumber <= line && line <= range.endLineNumber
			);

			if (lineWithinRange) {
				return {
					replyCommand: commentInfo.reply,
					ownerId: commentInfo.owner
				};
			}
		}

		return null;
	}

	private isLineInCommentingRange(line: number): boolean {
		return this._commentInfos.some(commentInfo => {
			return commentInfo.commentingRanges.some(range =>
				range.startLineNumber <= line && line <= range.endLineNumber
			);
		});
	}

	private isExistingCommentThreadAtLine(line: number): boolean {
		const existingThread = this._commentInfos.some(commentInfo => {
			return commentInfo.threads.some(thread =>
				thread.range.startLineNumber === line
			);
		});

		const existingNewComment = this._newCommentWidget && this._newCommentWidget.position && this._newCommentWidget.position.lineNumber === line;

		return existingThread || existingNewComment;
	}

	setComments(commentInfos: modes.CommentInfo[]): void {
		this._commentInfos = commentInfos;

		this.editor.changeDecorations(accessor => {
			this.commentingRangeDecorationMap.forEach((val, index) => {
				accessor.deltaDecorations(val, []);
				this.commentingRangeDecorationMap.delete(index);
			});

			if (this._commentInfos.length === 0) {
				return;
			}

			commentInfos.forEach(info => {
				let ranges = [];
				if (info.commentingRanges) {
					ranges.push(...info.commentingRanges);
				}

				const commentingRangeDecorations: IModelDeltaDecoration[] = [];

				ranges.forEach(range => {
					commentingRangeDecorations.push({
						options: COMMENTING_RANGE_DECORATION,
						range: range
					});
				});

				let commentingRangeDecorationIds = accessor.deltaDecorations(this.commentingRangeDecorations, commentingRangeDecorations);
				this.commentingRangeDecorationMap.set(info.owner, commentingRangeDecorationIds);
			});
		});

		// create viewzones
		this._commentWidgets.forEach(zone => {
			zone.dispose();
		});

		this._commentInfos.forEach(info => {
			info.threads.forEach(thread => {
				let zoneWidget = new ReviewZoneWidget(this.editor, info.owner, thread, info.reply, {}, this.themeService, this.commandService);
				zoneWidget.display(thread.range.startLineNumber);
				this._commentWidgets.push(zoneWidget);
			});
		});
	}


	public closeWidget(): void {
		this._reviewPanelVisible.reset();

		if (this._newCommentWidget) {
			this._newCommentWidget.dispose();
			this._newCommentWidget = null;
		}

		if (this._commentWidgets) {
			this._commentWidgets.forEach(widget => widget.dispose());
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
			`}` +
			`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button {` +
			`	background-color: ${monacoEditorBackground}` +
			`}`
		);
	}

	let monacoEditorForeground = theme.getColor(editorForeground);
	if (monacoEditorForeground) {
		collector.addRule(
			`.monaco-editor .review-widget .body textarea {` +
			`	color: ${monacoEditorForeground}` +
			`}` +
			`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button {` +
			`	color: ${monacoEditorForeground}` +
			`}`
		);
	}
});
