/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { ActionBar, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action, IAction } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { peekViewBorder } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentGlyphWidget } from 'vs/workbench/contrib/comments/browser/commentGlyphWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { SimpleCommentEditor } from './simpleCommentEditor';
import { URI } from 'vs/base/common/uri';
import { transparent, editorForeground, textLinkActiveForeground, textLinkForeground, focusBorder, textBlockQuoteBackground, textBlockQuoteBorder, contrastBorder, inputValidationErrorBorder, inputValidationErrorBackground, inputValidationErrorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IPosition } from 'vs/editor/common/core/position';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { CommentNode } from 'vs/workbench/contrib/comments/browser/commentNode';
import { ITextModel } from 'vs/editor/common/model';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { generateUuid } from 'vs/base/common/uuid';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { withNullAsUndefined } from 'vs/base/common/types';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { MenuItemAction, IMenu } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { CommentFormActions } from 'vs/workbench/contrib/comments/browser/commentFormActions';

export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';
const COLLAPSE_ACTION_CLASS = 'expand-review-action octicon octicon-chevron-up';
const COMMENT_SCHEME = 'comment';


let INMEM_MODEL_ID = 0;

export class ReviewZoneWidget extends ZoneWidget implements ICommentThreadWidget {
	private _headElement: HTMLElement;
	protected _headingLabel: HTMLElement;
	protected _actionbarWidget: ActionBar;
	private _bodyElement: HTMLElement;
	private _parentEditor: ICodeEditor;
	private _commentEditor: ICodeEditor;
	private _commentsElement: HTMLElement;
	private _commentElements: CommentNode[];
	private _commentForm: HTMLElement;
	private _reviewThreadReplyButton: HTMLElement;
	private _resizeObserver: any;
	private _onDidClose = new Emitter<ReviewZoneWidget | undefined>();
	private _onDidCreateThread = new Emitter<ReviewZoneWidget>();
	private _isExpanded?: boolean;
	private _collapseAction: Action;
	private _commentGlyph?: CommentGlyphWidget;
	private _submitActionsDisposables: IDisposable[];
	private _globalToDispose: IDisposable[];
	private _commentThreadDisposables: IDisposable[] = [];
	private _markdownRenderer: MarkdownRenderer;
	private _styleElement: HTMLStyleElement;
	private _formActions: HTMLElement | null;
	private _error: HTMLElement;
	private _contextKeyService: IContextKeyService;
	private _threadIsEmpty: IContextKey<boolean>;
	private _commentThreadContextValue: IContextKey<string>;
	private _commentEditorIsEmpty: IContextKey<boolean>;
	private _commentFormActions: CommentFormActions;

	public get owner(): string {
		return this._owner;
	}
	public get commentThread(): modes.CommentThread {
		return this._commentThread as modes.CommentThread;
	}

	public get extensionId(): string | undefined {
		return this._commentThread.extensionId;
	}

	public get draftMode(): modes.DraftMode | undefined {
		return this._draftMode;
	}

	private _commentMenus: CommentMenus;

	constructor(
		editor: ICodeEditor,
		private _owner: string,
		private _commentThread: modes.CommentThread | modes.CommentThread2,
		private _pendingComment: string,
		private _draftMode: modes.DraftMode | undefined,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModeService private modeService: IModeService,
		@ICommandService private commandService: ICommandService,
		@IModelService private modelService: IModelService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IOpenerService private openerService: IOpenerService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editor, { keepEditorSelection: true });
		this._contextKeyService = contextKeyService.createScoped(this.domNode);
		this._threadIsEmpty = CommentContextKeys.commentThreadIsEmpty.bindTo(this._contextKeyService);
		this._threadIsEmpty.set(!_commentThread.comments || !_commentThread.comments.length);
		this._commentThreadContextValue = contextKeyService.createKey('commentThread', _commentThread.contextValue);

		this._resizeObserver = null;
		this._isExpanded = _commentThread.collapsibleState ? _commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded : undefined;
		this._globalToDispose = [];
		this._commentThreadDisposables = [];
		this._submitActionsDisposables = [];
		this._formActions = null;
		this._commentMenus = this.commentService.getCommentMenus(this._owner);
		this.create();

		this._styleElement = dom.createStyleSheet(this.domNode);
		this._globalToDispose.push(this.themeService.onThemeChange(this._applyTheme, this));
		this._globalToDispose.push(this.editor.onDidChangeConfiguration(e => {
			if (e.fontInfo) {
				this._applyTheme(this.themeService.getTheme());
			}
		}));
		this._applyTheme(this.themeService.getTheme());

		this._markdownRenderer = new MarkdownRenderer(editor, this.modeService, this.openerService);
		this._parentEditor = editor;
	}

	public get onDidClose(): Event<ReviewZoneWidget | undefined> {
		return this._onDidClose.event;
	}

	public get onDidCreateThread(): Event<ReviewZoneWidget> {
		return this._onDidCreateThread.event;
	}

	public getPosition(): IPosition | undefined {
		if (this.position) {
			return this.position;
		}

		if (this._commentGlyph) {
			return withNullAsUndefined(this._commentGlyph.getPosition().position);
		}
		return undefined;
	}

	protected revealLine(lineNumber: number) {
		// we don't do anything here as we always do the reveal ourselves.
	}

	public reveal(commentId?: string) {
		if (!this._isExpanded) {
			this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
		}

		if (commentId) {
			let height = this.editor.getLayoutInfo().height;
			let matchedNode = this._commentElements.filter(commentNode => commentNode.comment.commentId === commentId);
			if (matchedNode && matchedNode.length) {
				const commentThreadCoords = dom.getDomNodePagePosition(this._commentElements[0].domNode);
				const commentCoords = dom.getDomNodePagePosition(matchedNode[0].domNode);

				this.editor.setScrollTop(this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top);
				return;
			}
		}

		this.editor.revealRangeInCenter(this._commentThread.range);
	}

	public getPendingComment(): string | null {
		if (this._commentEditor) {
			let model = this._commentEditor.getModel();

			if (model && model.getValueLength() > 0) { // checking length is cheap
				return model.getValue();
			}
		}

		return null;
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._headElement = <HTMLDivElement>dom.$('.head');
		container.appendChild(this._headElement);
		this._fillHead(this._headElement);

		this._bodyElement = <HTMLDivElement>dom.$('.body');
		container.appendChild(this._bodyElement);
	}

	protected _fillHead(container: HTMLElement): void {
		let titleElement = dom.append(this._headElement, dom.$('.review-title'));

		this._headingLabel = dom.append(titleElement, dom.$('span.filename'));
		this.createThreadLabel();

		const actionsContainer = dom.append(this._headElement, dom.$('.review-actions'));
		this._actionbarWidget = new ActionBar(actionsContainer, {
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof MenuItemAction) {
					let item = new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
					return item;
				} else {
					let item = new ActionViewItem({}, action, { label: false, icon: true });
					return item;
				}
			}
		});

		this._disposables.push(this._actionbarWidget);

		this._collapseAction = new Action('review.expand', nls.localize('label.collapse', "Collapse"), COLLAPSE_ACTION_CLASS, true, () => this.collapse());

		if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
			const menu = this._commentMenus.getCommentThreadTitleActions(this._commentThread as modes.CommentThread2, this._contextKeyService);
			this.setActionBarActions(menu);

			this._disposables.push(menu);
			this._disposables.push(menu.onDidChange(e => {
				this.setActionBarActions(menu);
			}));
		} else {
			this._actionbarWidget.push([this._collapseAction], { label: false, icon: true });
		}

		this._actionbarWidget.context = this._commentThread;
	}

	private setActionBarActions(menu: IMenu): void {
		const groups = menu.getActions({ shouldForwardArgs: true }).reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]);
		this._actionbarWidget.clear();
		this._actionbarWidget.push([...groups, this._collapseAction], { label: false, icon: true });
	}

	public collapse(): Promise<void> {
		if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			if ((this._commentThread as modes.CommentThread2).commentThreadHandle === undefined) {
				this.dispose();
				return Promise.resolve();
			} else {
				const deleteCommand = (this._commentThread as modes.CommentThread2).deleteCommand;
				if (deleteCommand) {
					return this.commandService.executeCommand(deleteCommand.id, ...(deleteCommand.arguments || []));
				} else if (this._commentEditor.getValue() === '') {
					this.commentService.disposeCommentThread(this._owner, this._commentThread.threadId!);
					this.dispose();
					return Promise.resolve();
				}
			}
		}

		this.hide();
		return Promise.resolve();
	}

	public getGlyphPosition(): number {
		if (this._commentGlyph) {
			return this._commentGlyph.getPosition().position!.lineNumber;
		}
		return 0;
	}

	toggleExpand(lineNumber: number) {
		if (this._isExpanded) {
			this.hide();
			if (this._commentThread === null || this._commentThread.threadId === null) {
				this.dispose();
			}
		} else {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}
	}

	async update(commentThread: modes.CommentThread | modes.CommentThread2) {
		const oldCommentsLen = this._commentElements.length;
		const newCommentsLen = commentThread.comments ? commentThread.comments.length : 0;
		this._threadIsEmpty.set(!newCommentsLen);

		let commentElementsToDel: CommentNode[] = [];
		let commentElementsToDelIndex: number[] = [];
		for (let i = 0; i < oldCommentsLen; i++) {
			let comment = this._commentElements[i].comment;
			let newComment = commentThread.comments ? commentThread.comments.filter(c => c.commentId === comment.commentId) : [];

			if (newComment.length) {
				this._commentElements[i].update(newComment[0]);
			} else {
				commentElementsToDelIndex.push(i);
				commentElementsToDel.push(this._commentElements[i]);
			}
		}

		// del removed elements
		for (let i = commentElementsToDel.length - 1; i >= 0; i--) {
			this._commentElements.splice(commentElementsToDelIndex[i], 1);
			this._commentsElement.removeChild(commentElementsToDel[i].domNode);
		}

		let lastCommentElement: HTMLElement | null = null;
		let newCommentNodeList: CommentNode[] = [];
		for (let i = newCommentsLen - 1; i >= 0; i--) {
			let currentComment = commentThread.comments![i];
			let oldCommentNode = this._commentElements.filter(commentNode => commentNode.comment.commentId === currentComment.commentId);
			if (oldCommentNode.length) {
				oldCommentNode[0].update(currentComment);
				lastCommentElement = oldCommentNode[0].domNode;
				newCommentNodeList.unshift(oldCommentNode[0]);
			} else {
				const newElement = this.createNewCommentNode(currentComment);

				newCommentNodeList.unshift(newElement);
				if (lastCommentElement) {
					this._commentsElement.insertBefore(newElement.domNode, lastCommentElement);
					lastCommentElement = newElement.domNode;
				} else {
					this._commentsElement.appendChild(newElement.domNode);
					lastCommentElement = newElement.domNode;
				}
			}
		}

		this._commentThread = commentThread;
		this._commentElements = newCommentNodeList;
		this.createThreadLabel();

		if (this._formActions && this._commentEditor.hasModel()) {
			dom.clearNode(this._formActions);
			const model = this._commentEditor.getModel();
			this.createCommentWidgetActions2(this._formActions, model);
		}

		// Move comment glyph widget and show position if the line has changed.
		const lineNumber = this._commentThread.range.startLineNumber;
		let shouldMoveWidget = false;
		if (this._commentGlyph) {
			if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
				shouldMoveWidget = true;
				this._commentGlyph.setLineNumber(lineNumber);
			}
		}

		if (!this._reviewThreadReplyButton) {
			this.createReplyButton();
		}

		if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			this.expandReplyArea();
		}

		if (shouldMoveWidget && this._isExpanded) {
			this.show({ lineNumber, column: 1 }, 2);
		}

		// The collapsible state is not initialized yet.
		if (this._isExpanded === undefined) {
			if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
				this.show({ lineNumber, column: 1 }, 2);
			} else {
				this.hide();
			}
		}

		if (this._commentThread.contextValue) {
			this._commentThreadContextValue.set(this._commentThread.contextValue);
		} else {
			this._commentThreadContextValue.reset();
		}
	}

	updateDraftMode(draftMode: modes.DraftMode | undefined) {
		if (this._draftMode !== draftMode) {
			this._draftMode = draftMode;

			if (this._formActions && this._commentEditor.hasModel()) {
				const model = this._commentEditor.getModel();
				dom.clearNode(this._formActions);
				this.createCommentWidgetActions(this._formActions, model);
			}
		}
	}

	protected _onWidth(widthInPixel: number): void {
		this._commentEditor.layout({ height: 5 * 18, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ });
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentEditor.layout({ height: 5 * 18, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ });
	}

	display(lineNumber: number) {
		this._commentGlyph = new CommentGlyphWidget(this.editor, lineNumber);

		this._disposables.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this._disposables.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));

		let headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;

		this._commentsElement = dom.append(this._bodyElement, dom.$('div.comments-container'));
		this._commentsElement.setAttribute('role', 'presentation');

		this._commentElements = [];
		if (this._commentThread.comments) {
			for (const comment of this._commentThread.comments) {
				const newCommentNode = this.createNewCommentNode(comment);

				this._commentElements.push(newCommentNode);
				this._commentsElement.appendChild(newCommentNode.domNode);
			}
		}

		const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
		this._commentForm = dom.append(this._bodyElement, dom.$('.comment-form'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, this._commentForm, SimpleCommentEditor.getEditorOptions(), this._parentEditor, this);
		this._commentEditorIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeyService);
		this._commentEditorIsEmpty.set(!this._pendingComment);

		const modeId = generateUuid() + '-' + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);
		const params = JSON.stringify({
			extensionId: this.extensionId,
			commentThreadId: this.commentThread.threadId
		});

		let resource = URI.parse(`${COMMENT_SCHEME}://${this.extensionId}/commentinput-${modeId}.md?${params}`); // TODO. Remove params once extensions adopt authority.
		let commentController = this.commentService.getCommentController(this.owner);
		if (commentController) {
			resource = resource.with({ authority: commentController.id });
		}

		const model = this.modelService.createModel(this._pendingComment || '', this.modeService.createByFilepathOrFirstLine(resource.path), resource, false);
		this._disposables.push(model);
		this._commentEditor.setModel(model);
		this._disposables.push(this._commentEditor);
		this._disposables.push(this._commentEditor.getModel()!.onDidChangeContent(() => {
			this.setCommentEditorDecorations();
			this._commentEditorIsEmpty.set(!this._commentEditor.getValue());
		}));

		if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
			this.createTextModelListener();
		}

		this.setCommentEditorDecorations();

		// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
		if (hasExistingComments) {
			this.createReplyButton();
		} else {
			if (this._commentThread.comments && this._commentThread.comments.length === 0) {
				this.expandReplyArea();
			}
		}

		this._error = dom.append(this._commentForm, dom.$('.validation-error.hidden'));

		this._formActions = dom.append(this._commentForm, dom.$('.form-actions'));
		if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
			this.createCommentWidgetActions2(this._formActions, model);
			this.createCommentWidgetActionsListener(this._formActions, model);
		} else {
			this.createCommentWidgetActions(this._formActions, model);
		}

		this._resizeObserver = new MutationObserver(this._refresh.bind(this));

		this._resizeObserver.observe(this._bodyElement, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true
		});

		if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		// if this._commentThread.comments is undefined, it doesn't finish initialization yet, so we don't focus the editor immediately.
		if ((this._commentThread as modes.CommentThread).reply && this._commentThread.comments && !this._commentThread.comments.length) {
			this._commentEditor.focus();
		} else if (this._commentEditor.getModel()!.getValueLength() > 0) {
			this.expandReplyArea();
		}
	}

	private createTextModelListener() {
		this._commentThreadDisposables.push(this._commentEditor.onDidFocusEditorWidget(() => {
			let commentThread = this._commentThread as modes.CommentThread2;
			commentThread.input = {
				uri: this._commentEditor.getModel()!.uri,
				value: this._commentEditor.getValue()
			};
		}));

		this._commentThreadDisposables.push(this._commentEditor.getModel()!.onDidChangeContent(() => {
			let modelContent = this._commentEditor.getValue();
			let thread = (this._commentThread as modes.CommentThread2);
			if (thread.input && thread.input.uri === this._commentEditor.getModel()!.uri && thread.input.value !== modelContent) {
				let newInput: modes.CommentInput = thread.input;
				newInput.value = modelContent;
				thread.input = newInput;
			}
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeInput(input => {
			let thread = (this._commentThread as modes.CommentThread2);

			if (thread.input && thread.input.uri !== this._commentEditor.getModel()!.uri) {
				return;
			}
			if (!input) {
				return;
			}

			if (this._commentEditor.getValue() !== input.value) {
				this._commentEditor.setValue(input.value);

				if (input.value === '') {
					this._pendingComment = '';
					if (dom.hasClass(this._commentForm, 'expand')) {
						dom.removeClass(this._commentForm, 'expand');
					}
					this._commentEditor.getDomNode()!.style.outline = '';
					this._error.textContent = '';
					dom.addClass(this._error, 'hidden');
				}
			}
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeComments(async _ => {
			await this.update(this._commentThread);
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeLabel(_ => {
			this.createThreadLabel();
		}));
	}

	private createCommentWidgetActionsListener(container: HTMLElement, model: ITextModel) {
		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeAcceptInputCommand(_ => {
			if (container) {
				dom.clearNode(container);
				this.createCommentWidgetActions2(container, model);
			}
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeAdditionalCommands(_ => {
			if (container) {
				dom.clearNode(container);
				this.createCommentWidgetActions2(container, model);
			}
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeRange(range => {
			// Move comment glyph widget and show position if the line has changed.
			const lineNumber = this._commentThread.range.startLineNumber;
			let shouldMoveWidget = false;
			if (this._commentGlyph) {
				if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
					shouldMoveWidget = true;
					this._commentGlyph.setLineNumber(lineNumber);
				}
			}

			if (shouldMoveWidget && this._isExpanded) {
				this.show({ lineNumber, column: 1 }, 2);
			}
		}));

		this._commentThreadDisposables.push((this._commentThread as modes.CommentThread2).onDidChangeCollasibleState(state => {
			if (state === modes.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
				const lineNumber = this._commentThread.range.startLineNumber;

				this.show({ lineNumber, column: 1 }, 2);
				return;
			}

			if (state === modes.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
				this.hide();
				return;
			}
		}));
	}

	private handleError(e: Error) {
		this._error.textContent = e.message;
		this._commentEditor.getDomNode()!.style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
		dom.removeClass(this._error, 'hidden');
	}

	private getActiveComment(): CommentNode | ReviewZoneWidget {
		return this._commentElements.filter(node => node.isEditing)[0] || this;
	}

	private createCommentWidgetActions(container: HTMLElement, model: ITextModel) {
		dispose(this._submitActionsDisposables);

		const button = new Button(container);
		this._submitActionsDisposables.push(attachButtonStyler(button, this.themeService));
		button.label = 'Add comment';

		button.enabled = model.getValueLength() > 0;
		this._submitActionsDisposables.push(this._commentEditor.onDidChangeModelContent(_ => {
			if (this._commentEditor.getValue()) {
				button.enabled = true;
			} else {
				button.enabled = false;
			}
		}));

		button.onDidClick(async () => {
			this.createComment();
		});

		if (this._draftMode === modes.DraftMode.NotSupported) {
			return;
		}

		switch (this._draftMode) {
			case modes.DraftMode.InDraft:
				const deleteDraftLabel = this.commentService.getDeleteDraftLabel(this._owner);
				if (deleteDraftLabel) {
					const deletedraftButton = new Button(container);
					this._submitActionsDisposables.push(attachButtonStyler(deletedraftButton, this.themeService));
					deletedraftButton.label = deleteDraftLabel;
					deletedraftButton.enabled = true;

					this._disposables.push(deletedraftButton.onDidClick(async () => {
						try {
							await this.commentService.deleteDraft(this._owner, this.editor.getModel()!.uri);
						} catch (e) {
							this.handleError(e);
						}
					}));
				}

				const submitDraftLabel = this.commentService.getFinishDraftLabel(this._owner);
				if (submitDraftLabel) {
					const submitdraftButton = new Button(container);
					this._submitActionsDisposables.push(attachButtonStyler(submitdraftButton, this.themeService));
					submitdraftButton.label = this.commentService.getFinishDraftLabel(this._owner)!;
					submitdraftButton.enabled = true;

					submitdraftButton.onDidClick(async () => {
						try {
							if (this._commentEditor.getValue()) {
								await this.createComment();
							}
							await this.commentService.finishDraft(this._owner, this.editor.getModel()!.uri);
						} catch (e) {
							this.handleError(e);
						}
					});
				}

				break;
			case modes.DraftMode.NotInDraft:
				const startDraftLabel = this.commentService.getStartDraftLabel(this._owner);
				if (startDraftLabel) {
					const draftButton = new Button(container);
					this._disposables.push(attachButtonStyler(draftButton, this.themeService));
					draftButton.label = this.commentService.getStartDraftLabel(this._owner)!;

					draftButton.enabled = model.getValueLength() > 0;
					this._submitActionsDisposables.push(this._commentEditor.onDidChangeModelContent(_ => {
						if (this._commentEditor.getValue()) {
							draftButton.enabled = true;
						} else {
							draftButton.enabled = false;
						}
					}));

					this._disposables.push(draftButton.onDidClick(async () => {
						try {
							await this.commentService.startDraft(this._owner, this.editor.getModel()!.uri);
							await this.createComment();
						} catch (e) {
							this.handleError(e);
						}
					}));
				}

				break;
		}
	}

	/**
	 * Command based actions.
	 */
	private createCommentWidgetActions2(container: HTMLElement, model: ITextModel) {
		let commentThread = this._commentThread as modes.CommentThread2;
		const { acceptInputCommand, additionalCommands } = commentThread;

		if (acceptInputCommand) {
			const button = new Button(container);
			this._disposables.push(attachButtonStyler(button, this.themeService));

			button.label = acceptInputCommand.title;
			this._disposables.push(button.onDidClick(async () => {
				commentThread.input = {
					uri: this._commentEditor.getModel()!.uri,
					value: this._commentEditor.getValue()
				};
				await this.commandService.executeCommand(acceptInputCommand.id, ...(acceptInputCommand.arguments || []));
			}));

			button.enabled = model.getValueLength() > 0;
			this._disposables.push(this._commentEditor.onDidChangeModelContent(_ => {
				if (this._commentEditor.getValue()) {
					button.enabled = true;
				} else {
					button.enabled = false;
				}
			}));
		}

		if (additionalCommands) {
			additionalCommands.reverse().forEach(command => {
				const button = new Button(container);
				this._disposables.push(attachButtonStyler(button, this.themeService));

				button.label = command.title;
				this._disposables.push(button.onDidClick(async () => {
					commentThread.input = {
						uri: this._commentEditor.getModel()!.uri,
						value: this._commentEditor.getValue()
					};
					await this.commandService.executeCommand(command.id, ...(command.arguments || []));
				}));
			});
		}

		const menu = this._commentMenus.getCommentThreadActions(commentThread, this._contextKeyService);

		this._disposables.push(menu);
		this._disposables.push(menu.onDidChange(() => {
			this._commentFormActions.setActions(menu);
		}));

		this._commentFormActions = new CommentFormActions(container, (action: IAction) => {
			action.run({
				thread: this._commentThread,
				text: this._commentEditor.getValue(),
				$mid: 8
			});

			this.hideReplyArea();
		}, this.themeService);

		this._commentFormActions.setActions(menu);
	}

	private createNewCommentNode(comment: modes.Comment): CommentNode {
		let newCommentNode = this.instantiationService.createInstance(CommentNode,
			this._commentThread,
			comment,
			this.owner,
			this.editor.getModel()!.uri,
			this._parentEditor,
			this,
			this._markdownRenderer);

		this._disposables.push(newCommentNode);
		this._disposables.push(newCommentNode.onDidDelete(deletedNode => {
			const deletedNodeId = deletedNode.comment.commentId;
			const deletedElementIndex = arrays.firstIndex(this._commentElements, commentNode => commentNode.comment.commentId === deletedNodeId);
			if (deletedElementIndex > -1) {
				this._commentElements.splice(deletedElementIndex, 1);
			}

			const deletedCommentIndex = arrays.firstIndex(this._commentThread.comments!, comment => comment.commentId === deletedNodeId);
			if (deletedCommentIndex > -1) {
				this._commentThread.comments!.splice(deletedCommentIndex, 1);
			}

			this._commentsElement.removeChild(deletedNode.domNode);
			deletedNode.dispose();

			if (this._commentThread.comments!.length === 0) {
				this.dispose();
			}
		}));

		return newCommentNode;
	}

	async submitComment(): Promise<void> {
		const activeComment = this.getActiveComment();
		if (activeComment instanceof ReviewZoneWidget) {
			if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
				let commentThread = this._commentThread as modes.CommentThread2;

				if (commentThread.acceptInputCommand) {
					commentThread.input = {
						uri: this._commentEditor.getModel()!.uri,
						value: this._commentEditor.getValue()
					};
					let commandId = commentThread.acceptInputCommand.id;
					let args = commentThread.acceptInputCommand.arguments || [];

					await this.commandService.executeCommand(commandId, ...args);
					return;
				} else if (this._commentFormActions) {
					this._commentFormActions.triggerDefaultAction();
				}
			} else {
				this.createComment();
			}
		}

		if (activeComment instanceof CommentNode) {
			activeComment.editComment();
		}
	}

	async createComment(): Promise<void> {
		try {
			if (this._commentEditor.getModel()!.getValueLength() === 0) {
				return;
			}
			if (!this._commentGlyph) {
				return;
			}

			let newCommentThread;
			const lineNumber = this._commentGlyph.getPosition().position!.lineNumber;
			const isReply = this._commentThread.threadId !== null;


			if (isReply) {
				newCommentThread = await this.commentService.replyToCommentThread(
					this._owner,
					this.editor.getModel()!.uri,
					new Range(lineNumber, 1, lineNumber, 1),
					this._commentThread,
					this._commentEditor.getValue()
				);
			} else {
				newCommentThread = await this.commentService.createNewCommentThread(
					this._owner,
					this.editor.getModel()!.uri,
					new Range(lineNumber, 1, lineNumber, 1),
					this._commentEditor.getValue()
				);

				if (newCommentThread) {
					this.createReplyButton();
				}
			}

			if (newCommentThread) {
				this._commentEditor.setValue('');
				this._pendingComment = '';
				if (dom.hasClass(this._commentForm, 'expand')) {
					dom.removeClass(this._commentForm, 'expand');
				}
				this._commentEditor.getDomNode()!.style.outline = '';
				this._error.textContent = '';
				dom.addClass(this._error, 'hidden');
				this.update(newCommentThread);

				if (!isReply) {
					this._onDidCreateThread.fire(this);
				}
			}
		} catch (e) {
			this._error.textContent = e.message
				? nls.localize('commentCreationError', "Adding a comment failed: {0}.", e.message)
				: nls.localize('commentCreationDefaultError', "Adding a comment failed. Please try again or report an issue with the extension if the problem persists.");
			this._commentEditor.getDomNode()!.style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
			dom.removeClass(this._error, 'hidden');
		}
	}

	private createThreadLabel() {
		let label: string | undefined;
		if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
			label = (this._commentThread as modes.CommentThread2).label;
		}

		if (label === undefined) {
			if (this._commentThread.comments && this._commentThread.comments.length) {
				const participantsList = this._commentThread.comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
				label = nls.localize('commentThreadParticipants', "Participants: {0}", participantsList);
			} else {
				label = nls.localize('startThread', "Start discussion");
			}
		}

		if (label) {
			this._headingLabel.innerHTML = strings.escape(label);
			this._headingLabel.setAttribute('aria-label', label);
		}
	}

	private expandReplyArea() {
		if (!dom.hasClass(this._commentForm, 'expand')) {
			dom.addClass(this._commentForm, 'expand');
			this._commentEditor.focus();
		}
	}

	private hideReplyArea() {
		this._commentEditor.setValue('');
		this._pendingComment = '';
		if (dom.hasClass(this._commentForm, 'expand')) {
			dom.removeClass(this._commentForm, 'expand');
		}
		this._commentEditor.getDomNode()!.style.outline = '';
		this._error.textContent = '';
		dom.addClass(this._error, 'hidden');
	}

	private createReplyButton() {
		this._reviewThreadReplyButton = <HTMLButtonElement>dom.append(this._commentForm, dom.$('button.review-thread-reply-button'));
		if ((this._commentThread as modes.CommentThread2).commentThreadHandle !== undefined) {
			// this._reviewThreadReplyButton.title = (this._commentThread as modes.CommentThread2).acceptInputCommands.title;
		} else {
			this._reviewThreadReplyButton.title = nls.localize('reply', "Reply...");
		}
		this._reviewThreadReplyButton.textContent = nls.localize('reply', "Reply...");
		// bind click/escape actions for reviewThreadReplyButton and textArea
		this._disposables.push(dom.addDisposableListener(this._reviewThreadReplyButton, 'click', _ => this.expandReplyArea()));
		this._disposables.push(dom.addDisposableListener(this._reviewThreadReplyButton, 'focus', _ => this.expandReplyArea()));

		this._commentEditor.onDidBlurEditorWidget(() => {
			if (this._commentEditor.getModel()!.getValueLength() === 0 && dom.hasClass(this._commentForm, 'expand')) {
				dom.removeClass(this._commentForm, 'expand');
			}
		});
	}

	_refresh() {
		if (this._isExpanded && this._bodyElement) {
			let dimensions = dom.getClientArea(this._bodyElement);
			const headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
			const lineHeight = this.editor.getConfiguration().lineHeight;
			const arrowHeight = Math.round(lineHeight / 3);
			const frameThickness = Math.round(lineHeight / 9) * 2;

			const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);
			this._relayout(computedLinesNumber);
		}
	}

	private setCommentEditorDecorations() {
		const model = this._commentEditor && this._commentEditor.getModel();
		if (model) {
			const valueLength = model.getValueLength();
			const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
			const placeholder = valueLength > 0
				? ''
				: hasExistingComments
					? nls.localize('reply', "Reply...")
					: nls.localize('newComment', "Type a new comment");
			const decorations = [{
				range: {
					startLineNumber: 0,
					endLineNumber: 0,
					startColumn: 0,
					endColumn: 1
				},
				renderOptions: {
					after: {
						contentText: placeholder,
						color: `${transparent(editorForeground, 0.4)(this.themeService.getTheme())}`
					}
				}
			}];

			this._commentEditor.setDecorations(COMMENTEDITOR_DECORATION_KEY, decorations);
		}
	}

	private mouseDownInfo: { lineNumber: number } | null;

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

		if (this._commentGlyph && this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
			return;
		}

		if (e.target.element.className.indexOf('comment-thread') >= 0) {
			this.toggleExpand(lineNumber);
		}
	}

	private _applyTheme(theme: ITheme) {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});

		const content: string[] = [];
		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a { color: ${linkColor} }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:hover, a:active { color: ${linkActiveColor} }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:focus { outline: 1px solid ${focusColor}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor.focused { outline: 1px solid ${focusColor}; }`);
		}

		const blockQuoteBackground = theme.getColor(textBlockQuoteBackground);
		if (blockQuoteBackground) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { background: ${blockQuoteBackground}; }`);
		}

		const blockQuoteBOrder = theme.getColor(textBlockQuoteBorder);
		if (blockQuoteBOrder) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { border-color: ${blockQuoteBOrder}; }`);
		}

		const hcBorder = theme.getColor(contrastBorder);
		if (hcBorder) {
			content.push(`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button { outline-color: ${hcBorder}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor { outline: 1px solid ${hcBorder}; }`);
		}

		const errorBorder = theme.getColor(inputValidationErrorBorder);
		if (errorBorder) {
			content.push(`.monaco-editor .review-widget .validation-error { border: 1px solid ${errorBorder}; }`);
		}

		const errorBackground = theme.getColor(inputValidationErrorBackground);
		if (errorBackground) {
			content.push(`.monaco-editor .review-widget .validation-error { background: ${errorBackground}; }`);
		}

		const errorForeground = theme.getColor(inputValidationErrorForeground);
		if (errorForeground) {
			content.push(`.monaco-editor .review-widget .body .comment-form .validation-error { color: ${errorForeground}; }`);
		}

		const fontInfo = this.editor.getConfiguration().fontInfo;
		content.push(`.monaco-editor .review-widget .body code {
			font-family: ${fontInfo.fontFamily};
			font-size: ${fontInfo.fontSize}px;
			font-weight: ${fontInfo.fontWeight};
		}`);

		this._styleElement.innerHTML = content.join('\n');

		// Editor decorations should also be responsive to theme changes
		this.setCommentEditorDecorations();
	}

	show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		this._isExpanded = true;
		super.show(rangeOrPos, heightInLines);
		this._refresh();
	}

	hide() {
		this._isExpanded = false;
		// Focus the container so that the comment editor will be blurred before it is hidden
		this.editor.focus();
		super.hide();
	}

	dispose() {
		super.dispose();
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}

		if (this._commentGlyph) {
			this._commentGlyph.dispose();
			this._commentGlyph = undefined;
		}

		this._globalToDispose.forEach(global => global.dispose());
		this._commentThreadDisposables.forEach(global => global.dispose());
		this._submitActionsDisposables.forEach(local => local.dispose());
		this._onDidClose.fire(undefined);
	}
}