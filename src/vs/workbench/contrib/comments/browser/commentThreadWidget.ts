/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/review.css';
import * as dom from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import * as languages from '../../../../editor/common/languages.js';
import { IMarkdownRendererExtraOptions } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CommentMenus } from './commentMenus.js';
import { CommentReply } from './commentReply.js';
import { ICommentService } from './commentService.js';
import { CommentThreadBody } from './commentThreadBody.js';
import { CommentThreadHeader } from './commentThreadHeader.js';
import { CommentThreadAdditionalActions } from './commentThreadAdditionalActions.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { ICommentThreadWidget } from '../common/commentThreadWidget.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { FontInfo } from '../../../../editor/common/config/fontInfo.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COMMENTS_SECTION, ICommentsConfiguration } from '../common/commentsConfiguration.js';
import { localize } from '../../../../nls.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { LayoutableEditor } from './simpleCommentEditor.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';

export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';

export class CommentThreadWidget<T extends IRange | ICellRange = IRange> extends Disposable implements ICommentThreadWidget {
	private _header!: CommentThreadHeader<T>;
	private _body: CommentThreadBody<T>;
	private _commentReply?: CommentReply<T>;
	private _additionalActions?: CommentThreadAdditionalActions<T>;
	private _commentMenus: CommentMenus;
	private _commentThreadDisposables: IDisposable[] = [];
	private _threadIsEmpty: IContextKey<boolean>;
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
		private _pendingComment: languages.PendingComment | undefined,
		private _pendingEdits: { [key: number]: languages.PendingComment } | undefined,
		private _markdownOptions: IMarkdownRendererExtraOptions,
		private _commentOptions: languages.CommentOptions | undefined,
		private _containerDelegate: {
			actionRunner: (() => void) | null;
			collapse: () => Promise<boolean>;
		},
		@ICommentService private readonly commentService: ICommentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();

		this._threadIsEmpty = CommentContextKeys.commentThreadIsEmpty.bindTo(this._contextKeyService);
		this._threadIsEmpty.set(!_commentThread.comments || !_commentThread.comments.length);
		this._focusedContextKey = CommentContextKeys.commentFocused.bindTo(this._contextKeyService);

		this._commentMenus = this.commentService.getCommentMenus(this._owner);

		this._register(this._header = this._scopedInstantiationService.createInstance(
			CommentThreadHeader,
			container,
			{
				collapse: this._containerDelegate.collapse.bind(this)
			},
			this._commentMenus,
			this._commentThread
		));

		this._header.updateCommentThread(this._commentThread);

		const bodyElement = dom.$('.body');
		container.appendChild(bodyElement);
		this._register(toDisposable(() => bodyElement.remove()));

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

		this._commentThreadContextValue = CommentContextKeys.commentThreadContext.bindTo(this._contextKeyService);
		this._commentThreadContextValue.set(_commentThread.contextValue);

		const commentControllerKey = CommentContextKeys.commentControllerContext.bindTo(this._contextKeyService);
		const controller = this.commentService.getCommentController(this._owner);

		if (controller?.contextValue) {
			commentControllerKey.set(controller.contextValue);
		}

		this.currentThreadListeners();
	}

	get hasUnsubmittedComments(): boolean {
		return !!this._commentReply?.commentEditor.getValue() || this._body.hasCommentsInEditMode();
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
		} else if (verbose) {
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
			if (e.relatedTarget === this.container) {
				hasMouse = true;
				this.updateCurrentThread(hasMouse, hasFocus);
			}
		}, true));
		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_LEAVE, (e) => {
			if (e.relatedTarget === this.container) {
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

	async display(lineHeight: number, focus: boolean) {
		const headHeight = Math.max(23, Math.ceil(lineHeight * 1.2)); // 23 is the value of `Math.ceil(lineHeight * 1.2)` with the default editor font size
		this._header.updateHeight(headHeight);

		await this._body.display();

		// create comment thread only when it supports reply
		if (this._commentThread.canReply) {
			this._createCommentForm(focus);
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
					this._createCommentForm(false);
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

	private _createCommentForm(focus: boolean) {
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
			focus,
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

	getPendingEdits(): { [key: number]: languages.PendingComment } {
		return this._body.getPendingEdits();
	}

	getPendingComment(): languages.PendingComment | undefined {
		if (this._commentReply) {
			return this._commentReply.getPendingComment();
		}

		return undefined;
	}

	setPendingComment(pending: languages.PendingComment) {
		this._pendingComment = pending;
		this._commentReply?.setPendingComment(pending);
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

	ensureFocusIntoNewEditingComment() {
		this._body.ensureFocusIntoNewEditingComment();
	}

	focusCommentEditor() {
		this._commentReply?.expandReplyAreaAndFocusCommentEditor();
	}

	focus(commentUniqueId: number | undefined) {
		this._body.focus(commentUniqueId);
	}

	async submitComment() {
		const activeComment = this._body.activeComment;
		if (activeComment) {
			return activeComment.submitComment();
		} else if ((this._commentReply?.getPendingComment()?.body.length ?? 0) > 0) {
			return this._commentReply?.submitComment();
		}
	}

	async collapse() {
		if ((await this._containerDelegate.collapse()) && Range.isIRange(this.commentThread.range) && isCodeEditor(this._parentEditor)) {
			this._parentEditor.setSelection(this.commentThread.range);
		}

	}

	applyTheme(fontInfo: FontInfo) {
		const fontFamilyVar = '--comment-thread-editor-font-family';
		const fontWeightVar = '--comment-thread-editor-font-weight';
		this.container?.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		this.container?.style.setProperty(fontWeightVar, fontInfo.fontWeight);

		this._commentReply?.setCommentEditorDecorations();
	}
}
