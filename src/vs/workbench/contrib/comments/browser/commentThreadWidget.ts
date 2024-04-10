/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/review';
import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as languages from 'vs/editor/common/languages';
import { IMarkdownRendererOptions } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { CommentReply } from 'vs/workbench/contrib/comments/browser/commentReply';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { CommentThreadBody } from 'vs/workbench/contrib/comments/browser/commentThreadBody';
import { CommentThreadHeader } from 'vs/workbench/contrib/comments/browser/commentThreadHeader';
import { CommentThreadAdditionalActions } from 'vs/workbench/contrib/comments/browser/commentThreadAdditionalActions';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { IColorTheme } from 'vs/platform/theme/common/themeService';
import { contrastBorder, focusBorder, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { IRange } from 'vs/editor/common/core/range';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar } from 'vs/workbench/contrib/comments/browser/commentColors';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { registerNavigableContainer } from 'vs/workbench/browser/actions/widgetNavigationCommands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { COMMENTS_SECTION, ICommentsConfiguration } from 'vs/workbench/contrib/comments/common/commentsConfiguration';
import { localize } from 'vs/nls';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { LayoutableEditor } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';

export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';


export class CommentThreadWidget<T extends IRange | ICellRange = IRange> extends Disposable implements ICommentThreadWidget {
	private _header!: CommentThreadHeader<T>;
	private _body: CommentThreadBody<T>;
	private _commentReply?: CommentReply<T>;
	private _additionalActions?: CommentThreadAdditionalActions<T>;
	private _commentMenus: CommentMenus;
	private _commentThreadDisposables: IDisposable[] = [];
	private _threadIsEmpty: IContextKey<boolean>;
	private _styleElement: HTMLStyleElement;
	private _commentThreadContextValue: IContextKey<string | undefined>;
	private _focusedContextKey: IContextKey<boolean>;
	private _onDidResize = new Emitter<dom.Dimension>();
	onDidResize = this._onDidResize.event;

	private _commentThreadState: languages.CommentThreadState | undefined;

	get commentThread() {
		return this._commentThread;
	}
	constructor(
		readonly container: HTMLElement,
		readonly _parentEditor: LayoutableEditor,
		private _owner: string,
		private _parentResourceUri: URI,
		private _contextKeyService: IContextKeyService,
		private _scopedInstantiationService: IInstantiationService,
		private _commentThread: languages.CommentThread<T>,
		private _pendingComment: string | undefined,
		private _pendingEdits: { [key: number]: string } | undefined,
		private _markdownOptions: IMarkdownRendererOptions,
		private _commentOptions: languages.CommentOptions | undefined,
		private _containerDelegate: {
			actionRunner: (() => void) | null;
			collapse: () => void;
		},
		@ICommentService private commentService: ICommentService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super();

		this._threadIsEmpty = CommentContextKeys.commentThreadIsEmpty.bindTo(this._contextKeyService);
		this._threadIsEmpty.set(!_commentThread.comments || !_commentThread.comments.length);
		this._focusedContextKey = CommentContextKeys.commentFocused.bindTo(this._contextKeyService);

		this._commentMenus = this.commentService.getCommentMenus(this._owner);

		this._header = new CommentThreadHeader<T>(
			container,
			{
				collapse: this.collapse.bind(this)
			},
			this._commentMenus,
			this._commentThread,
			this._contextKeyService,
			this._scopedInstantiationService,
			contextMenuService
		);

		this._header.updateCommentThread(this._commentThread);

		const bodyElement = <HTMLDivElement>dom.$('.body');
		container.appendChild(bodyElement);

		const tracker = this._register(dom.trackFocus(bodyElement));
		this._register(registerNavigableContainer({
			name: 'commentThreadWidget',
			focusNotifiers: [tracker],
			focusNextWidget: () => {
				if (!this._commentReply?.isCommentEditorFocused()) {
					this._commentReply?.expandReplyAreaAndFocusCommentEditor();
				}
			},
			focusPreviousWidget: () => {
				if (this._commentReply?.isCommentEditorFocused() && this._commentThread.comments?.length) {
					this._body.focus();
				}
			}
		}));
		this._register(tracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this._register(tracker.onDidBlur(() => this._focusedContextKey.reset()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Comments)) {
				this._setAriaLabel();
			}
		}));
		this._body = this._scopedInstantiationService.createInstance(
			CommentThreadBody,
			this._parentEditor,
			this._owner,
			this._parentResourceUri,
			bodyElement,
			this._markdownOptions,
			this._commentThread,
			this._pendingEdits,
			this._scopedInstantiationService,
			this
		) as unknown as CommentThreadBody<T>;
		this._register(this._body);
		this._setAriaLabel();
		this._styleElement = dom.createStyleSheet(this.container);


		this._commentThreadContextValue = CommentContextKeys.commentThreadContext.bindTo(this._contextKeyService);
		this._commentThreadContextValue.set(_commentThread.contextValue);

		const commentControllerKey = CommentContextKeys.commentControllerContext.bindTo(this._contextKeyService);
		const controller = this.commentService.getCommentController(this._owner);

		if (controller?.contextValue) {
			commentControllerKey.set(controller.contextValue);
		}

		this.currentThreadListeners();
	}

	private _setAriaLabel(): void {
		let ariaLabel = localize('commentLabel', "Comment");
		let keybinding: string | undefined;
		const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Comments);
		if (verbose) {
			keybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp, this._contextKeyService)?.getLabel() ?? undefined;
		}
		if (keybinding) {
			ariaLabel = localize('commentLabelWithKeybinding', "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
		} else {
			ariaLabel = localize('commentLabelWithKeybindingNoKeybinding', "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
		}
		this._body.container.ariaLabel = ariaLabel;
	}

	private updateCurrentThread(hasMouse: boolean, hasFocus: boolean) {
		if (hasMouse || hasFocus) {
			this.commentService.setCurrentCommentThread(this.commentThread);
		} else {
			this.commentService.setCurrentCommentThread(undefined);
		}
	}

	private currentThreadListeners() {
		let hasMouse = false;
		let hasFocus = false;
		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_ENTER, (e) => {
			if ((<any>e).toElement === this.container) {
				hasMouse = true;
				this.updateCurrentThread(hasMouse, hasFocus);
			}
		}, true));
		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_LEAVE, (e) => {
			if ((<any>e).fromElement === this.container) {
				hasMouse = false;
				this.updateCurrentThread(hasMouse, hasFocus);
			}
		}, true));
		this._register(dom.addDisposableListener(this.container, dom.EventType.FOCUS_IN, () => {
			hasFocus = true;
			this.updateCurrentThread(hasMouse, hasFocus);
		}, true));
		this._register(dom.addDisposableListener(this.container, dom.EventType.FOCUS_OUT, () => {
			hasFocus = false;
			this.updateCurrentThread(hasMouse, hasFocus);
		}, true));
	}

	async updateCommentThread(commentThread: languages.CommentThread<T>) {
		const shouldCollapse = (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) && (this._commentThreadState === languages.CommentThreadState.Unresolved)
			&& (commentThread.state === languages.CommentThreadState.Resolved);
		this._commentThreadState = commentThread.state;
		this._commentThread = commentThread;
		dispose(this._commentThreadDisposables);
		this._commentThreadDisposables = [];
		this._bindCommentThreadListeners();

		await this._body.updateCommentThread(commentThread, this._commentReply?.isCommentEditorFocused() ?? false);
		this._threadIsEmpty.set(!this._body.length);
		this._header.updateCommentThread(commentThread);
		this._commentReply?.updateCommentThread(commentThread);

		if (this._commentThread.contextValue) {
			this._commentThreadContextValue.set(this._commentThread.contextValue);
		} else {
			this._commentThreadContextValue.reset();
		}

		if (shouldCollapse && this.configurationService.getValue<ICommentsConfiguration>(COMMENTS_SECTION).collapseOnResolve) {
			this.collapse();
		}
	}

	async display(lineHeight: number) {
		const headHeight = Math.max(23, Math.ceil(lineHeight * 1.2)); // 23 is the value of `Math.ceil(lineHeight * 1.2)` with the default editor font size
		this._header.updateHeight(headHeight);

		await this._body.display();

		// create comment thread only when it supports reply
		if (this._commentThread.canReply) {
			this._createCommentForm();
		}
		this._createAdditionalActions();

		this._register(this._body.onDidResize(dimension => {
			this._refresh(dimension);
		}));

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		// if this._commentThread.comments is undefined, it doesn't finish initialization yet, so we don't focus the editor immediately.
		if (this._commentThread.canReply && this._commentReply) {
			this._commentReply.focusIfNeeded();
		}

		this._bindCommentThreadListeners();
	}

	private _refresh(dimension: dom.Dimension) {
		this._body.layout();
		this._onDidResize.fire(dimension);
	}

	override dispose() {
		super.dispose();
		dispose(this._commentThreadDisposables);
		this.updateCurrentThread(false, false);
	}

	private _bindCommentThreadListeners() {
		this._commentThreadDisposables.push(this._commentThread.onDidChangeCanReply(() => {
			if (this._commentReply) {
				this._commentReply.updateCanReply();
			} else {
				if (this._commentThread.canReply) {
					this._createCommentForm();
				}
			}
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async _ => {
			await this.updateCommentThread(this._commentThread);
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeLabel(_ => {
			this._header.createThreadLabel();
		}));
	}

	private _createCommentForm() {
		this._commentReply = this._scopedInstantiationService.createInstance(
			CommentReply,
			this._owner,
			this._body.container,
			this._parentEditor,
			this._commentThread,
			this._scopedInstantiationService,
			this._contextKeyService,
			this._commentMenus,
			this._commentOptions,
			this._pendingComment,
			this,
			this._containerDelegate.actionRunner
		);

		this._register(this._commentReply);
	}

	private _createAdditionalActions() {
		this._additionalActions = this._scopedInstantiationService.createInstance(
			CommentThreadAdditionalActions,
			this._body.container,
			this._commentThread,
			this._contextKeyService,
			this._commentMenus,
			this._containerDelegate.actionRunner,
		);

		this._register(this._additionalActions);
	}

	getCommentCoords(commentUniqueId: number) {
		return this._body.getCommentCoords(commentUniqueId);
	}

	getPendingEdits(): { [key: number]: string } {
		return this._body.getPendingEdits();
	}

	getPendingComment(): string | undefined {
		if (this._commentReply) {
			return this._commentReply.getPendingComment();
		}

		return undefined;
	}

	setPendingComment(comment: string) {
		this._pendingComment = comment;
		this._commentReply?.setPendingComment(comment);
	}

	getDimensions() {
		return this._body.getDimensions();
	}

	layout(widthInPixel?: number) {
		this._body.layout(widthInPixel);

		if (widthInPixel !== undefined) {
			this._commentReply?.layout(widthInPixel);
		}
	}

	focusCommentEditor() {
		this._commentReply?.expandReplyAreaAndFocusCommentEditor();
	}

	focus() {
		this._body.focus();
	}

	async submitComment() {
		const activeComment = this._body.activeComment;
		if (activeComment) {
			return activeComment.submitComment();
		} else if ((this._commentReply?.getPendingComment()?.length ?? 0) > 0) {
			return this._commentReply?.submitComment();
		}
	}

	collapse() {
		this._containerDelegate.collapse();
	}

	applyTheme(theme: IColorTheme, fontInfo: FontInfo) {
		const content: string[] = [];

		content.push(`.monaco-editor .review-widget > .body { border-top: 1px solid var(${commentThreadStateColorVar}) }`);
		content.push(`.monaco-editor .review-widget > .head { background-color: var(${commentThreadStateBackgroundColorVar}) }`);

		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.review-widget .body .comment-body a { color: ${linkColor} }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.review-widget .body .comment-body a:hover, a:active { color: ${linkActiveColor} }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.review-widget .body .comment-body a:focus { outline: 1px solid ${focusColor}; }`);
			content.push(`.review-widget .body .monaco-editor.focused { outline: 1px solid ${focusColor}; }`);
		}

		const blockQuoteBackground = theme.getColor(textBlockQuoteBackground);
		if (blockQuoteBackground) {
			content.push(`.review-widget .body .review-comment blockquote { background: ${blockQuoteBackground}; }`);
		}

		const blockQuoteBOrder = theme.getColor(textBlockQuoteBorder);
		if (blockQuoteBOrder) {
			content.push(`.review-widget .body .review-comment blockquote { border-color: ${blockQuoteBOrder}; }`);
		}

		const border = theme.getColor(PANEL_BORDER);
		if (border) {
			content.push(`.review-widget .body .review-comment .review-comment-contents .comment-reactions .action-item a.action-label { border-color: ${border}; }`);
		}

		const hcBorder = theme.getColor(contrastBorder);
		if (hcBorder) {
			content.push(`.review-widget .body .comment-form .review-thread-reply-button { outline-color: ${hcBorder}; }`);
			content.push(`.review-widget .body .monaco-editor { outline: 1px solid ${hcBorder}; }`);
		}

		const errorBorder = theme.getColor(inputValidationErrorBorder);
		if (errorBorder) {
			content.push(`.review-widget .validation-error { border: 1px solid ${errorBorder}; }`);
		}

		const errorBackground = theme.getColor(inputValidationErrorBackground);
		if (errorBackground) {
			content.push(`.review-widget .validation-error { background: ${errorBackground}; }`);
		}

		const errorForeground = theme.getColor(inputValidationErrorForeground);
		if (errorForeground) {
			content.push(`.review-widget .body .comment-form .validation-error { color: ${errorForeground}; }`);
		}

		const fontFamilyVar = '--comment-thread-editor-font-family';
		const fontSizeVar = '--comment-thread-editor-font-size';
		const fontWeightVar = '--comment-thread-editor-font-weight';
		this.container?.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		this.container?.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
		this.container?.style.setProperty(fontWeightVar, fontInfo.fontWeight);

		content.push(`.review-widget .body code {
			font-family: var(${fontFamilyVar});
			font-weight: var(${fontWeightVar});
		}`);

		this._styleElement.textContent = content.join('\n');
		this._commentReply?.setCommentEditorDecorations();
	}
}
