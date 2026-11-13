/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { IAction } from '../../../../base/common/actions.js';
import { Disposable, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IRange } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { CommentFormActions } from './commentFormActions.js';
import { CommentMenus } from './commentMenus.js';
import { ICommentService } from './commentService.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { ICommentThreadWidget } from '../common/commentThreadWidget.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { LayoutableEditor, MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from './simpleCommentEditor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { Position } from '../../../../editor/common/core/position.js';

let INMEM_MODEL_ID = 0;
export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';

export class CommentReply<T extends IRange | ICellRange> extends Disposable {
	commentEditor: ICodeEditor;
	private _container: HTMLElement;
	private _form: HTMLElement;
	commentEditorIsEmpty: IContextKey<boolean>;
	private avatar!: HTMLElement;
	private _error!: HTMLElement;
	private _formActions!: HTMLElement;
	private _editorActions!: HTMLElement;
	private _commentThreadDisposables: IDisposable[] = [];
	private _commentFormActions!: CommentFormActions;
	private _commentEditorActions!: CommentFormActions;
	private _reviewThreadReplyButton!: HTMLElement;
	private _editorHeight = MIN_EDITOR_HEIGHT;

	constructor(
		readonly owner: string,
		container: HTMLElement,
		private readonly _parentEditor: LayoutableEditor,
		private _commentThread: languages.CommentThread<T>,
		private _scopedInstatiationService: IInstantiationService,
		private _contextKeyService: IContextKeyService,
		private _commentMenus: CommentMenus,
		private _commentOptions: languages.CommentOptions | undefined,
		private _pendingComment: languages.PendingComment | undefined,
		private _parentThread: ICommentThreadWidget,
		focus: boolean,
		private _actionRunDelegate: (() => void) | null,
		@ICommentService private commentService: ICommentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IHoverService private hoverService: IHoverService,
		@ITextModelService private readonly textModelService: ITextModelService
	) {
		super();
		this._container = dom.append(container, dom.$('.comment-form-container'));
		this._form = dom.append(this._container, dom.$('.comment-form'));
		this.commentEditor = this._register(this._scopedInstatiationService.createInstance(SimpleCommentEditor, this._form, SimpleCommentEditor.getEditorOptions(configurationService), _contextKeyService, this._parentThread));
		this.commentEditorIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeyService);
		this.commentEditorIsEmpty.set(!this._pendingComment);

		this.initialize(focus);
	}

	private async initialize(focus: boolean) {
		this.avatar = dom.append(this._form, dom.$('.avatar-container'));
		this.updateAuthorInfo();
		const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
		const modeId = generateUuid() + '-' + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);

		let resource = URI.from({
			scheme: Schemas.commentsInput,
			path: `/${this._commentThread.extensionId}/commentinput-${modeId}.md`
		});
		const commentController = this.commentService.getCommentController(this.owner);
		if (commentController) {
			resource = resource.with({ authority: commentController.id });
		}

		const model = await this.textModelService.createModelReference(resource);
		model.object.textEditorModel.setValue(this._pendingComment?.body || '');

		this._register(model);
		this.commentEditor.setModel(model.object.textEditorModel);
		if (this._pendingComment) {
			this.commentEditor.setPosition(this._pendingComment.cursor);
		}
		this.calculateEditorHeight();

		this._register(model.object.textEditorModel.onDidChangeContent(() => {
			this.setCommentEditorDecorations();
			this.commentEditorIsEmpty?.set(!this.commentEditor.getValue());
			if (this.calculateEditorHeight()) {
				this.commentEditor.layout({ height: this._editorHeight, width: this.commentEditor.getLayoutInfo().width });
				this.commentEditor.render(true);
			}
		}));

		this.createTextModelListener(this.commentEditor);

		this.setCommentEditorDecorations();

		// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
		if (this._pendingComment) {
			this.expandReplyArea();
		} else if (hasExistingComments) {
			this.createReplyButton(this.commentEditor, this._form);
		} else if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			this.expandReplyArea(focus);
		}
		this._error = dom.append(this._container, dom.$('.validation-error.hidden'));
		const formActions = dom.append(this._container, dom.$('.form-actions'));
		this._formActions = dom.append(formActions, dom.$('.other-actions'));
		this.createCommentWidgetFormActions(this._formActions, model.object.textEditorModel);
		this._editorActions = dom.append(formActions, dom.$('.editor-actions'));
		this.createCommentWidgetEditorActions(this._editorActions, model.object.textEditorModel);
	}

	private calculateEditorHeight(): boolean {
		const newEditorHeight = calculateEditorHeight(this._parentEditor, this.commentEditor, this._editorHeight);
		if (newEditorHeight !== this._editorHeight) {
			this._editorHeight = newEditorHeight;
			return true;
		}
		return false;
	}

	public updateCommentThread(commentThread: languages.CommentThread<IRange | ICellRange>) {
		const isReplying = this.commentEditor.hasTextFocus();
		const oldAndNewBothEmpty = !this._commentThread.comments?.length && !commentThread.comments?.length;

		if (!this._reviewThreadReplyButton) {
			this.createReplyButton(this.commentEditor, this._form);
		}

		if (this._commentThread.comments && this._commentThread.comments.length === 0 && !oldAndNewBothEmpty) {
			this.expandReplyArea();
		}

		// A thread that is created without comments expands its reply area for the first comment. Once its comments
		// arrive, an untouched reply area collapses to the reply button, as it does when it loses focus.
		if (commentThread.comments?.length && this.isReplyExpanded && !this.commentEditor.hasWidgetFocus() && !this.commentEditor.getModel()?.getValueLength()) {
			this._container.classList.remove('expand');
		}

		if (isReplying) {
			this.commentEditor.focus();
		}
	}

	public getPendingComment(): languages.PendingComment | undefined {
		const model = this.commentEditor.getModel();

		if (model && model.getValueLength() > 0) { // checking length is cheap
			return { body: model.getValue(), cursor: this.commentEditor.getPosition() ?? new Position(1, 1) };
		}

		return undefined;
	}

	public setPendingComment(pending: languages.PendingComment) {
		this._pendingComment = pending;
		this.expandReplyArea();
		this.commentEditor.setValue(pending.body);
		this.commentEditor.setPosition(pending.cursor);
	}

	public layout(widthInPixel: number) {
		this.commentEditor.layout({ height: this._editorHeight, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ - this.getAvatarWidth() });
	}

	/**
	 * The width taken up by the author's avatar, which shares a row with the comment editor.
	 */
	private getAvatarWidth(): number {
		return this.avatar ? dom.getTotalWidth(this.avatar) : 0;
	}

	/**
	 * Sizes the comment editor to the space that the author's avatar leaves in the comment form.
	 */
	private layoutCommentEditorInForm(): void {
		const editorNode = this.commentEditor.getDomNode();
		const formWidth = dom.getContentWidth(this._form);
		if (!editorNode || formWidth <= 0) {
			// The form isn't rendered, so there is nothing to measure.
			this.commentEditor.layout();
			return;
		}
		const editorFrameWidth = dom.getTotalWidth(editorNode) - dom.getContentWidth(editorNode);
		this.commentEditor.layout({ height: this._editorHeight, width: formWidth - this.getAvatarWidth() - editorFrameWidth });
	}

	public focusIfNeeded() {
		if (!this._commentThread.comments || !this._commentThread.comments.length) {
			this.commentEditor.focus();
		} else if ((this.commentEditor.getModel()?.getValueLength() ?? 0) > 0) {
			this.expandReplyArea();
		}
	}

	public focusCommentEditor() {
		this.commentEditor.focus();
	}

	public expandReplyAreaAndFocusCommentEditor() {
		this.expandReplyArea();
		this.commentEditor.focus();
	}

	public isCommentEditorFocused(): boolean {
		return this.commentEditor.hasWidgetFocus();
	}

	private updateAuthorInfo() {
		this.avatar.textContent = '';
		if (typeof this._commentThread.canReply !== 'boolean' && this._commentThread.canReply.iconPath) {
			this.avatar.style.display = 'block';
			const img = dom.append(this.avatar, dom.$('img.avatar')) as HTMLImageElement;
			img.src = FileAccess.uriToBrowserUri(URI.revive(this._commentThread.canReply.iconPath)).toString(true);
		} else {
			this.avatar.style.display = 'none';
		}
	}

	public updateCanReply() {
		this.updateAuthorInfo();
		if (!this._commentThread.canReply) {
			this._container.style.display = 'none';
		} else {
			this._container.style.display = 'block';
			if (this.isReplyExpanded) {
				// The avatar may have appeared or disappeared next to the comment editor.
				this.layoutCommentEditorInForm();
			}
		}
	}

	async submitComment(): Promise<void> {
		await this._commentFormActions?.triggerDefaultAction();
		this._pendingComment = undefined;
	}

	setCommentEditorDecorations() {
		const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
		const placeholder = hasExistingComments
			? (this._commentOptions?.placeHolder || nls.localize('reply', "Reply..."))
			: (this._commentOptions?.placeHolder || nls.localize('newComment', "Type a new comment"));

		this.commentEditor.updateOptions({ placeholder });
	}

	private createTextModelListener(commentEditor: ICodeEditor) {
		this._commentThreadDisposables.push(commentEditor.onDidFocusEditorWidget(() => {
			this._commentThread.input = {
				uri: commentEditor.getModel()!.uri,
				value: commentEditor.getValue()
			};
			this.commentService.setActiveEditingCommentThread(this._commentThread);
			this.commentService.setActiveCommentAndThread(this.owner, { thread: this._commentThread });
		}));

		this._commentThreadDisposables.push(commentEditor.getModel()!.onDidChangeContent(() => {
			const modelContent = commentEditor.getValue();
			if (this._commentThread.input && this._commentThread.input.uri === commentEditor.getModel()!.uri && this._commentThread.input.value !== modelContent) {
				const newInput: languages.CommentInput = this._commentThread.input;
				newInput.value = modelContent;
				this._commentThread.input = newInput;
			}
			this.commentService.setActiveEditingCommentThread(this._commentThread);
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeInput(input => {
			const thread = this._commentThread;
			const model = commentEditor.getModel();
			if (thread.input && model && (thread.input.uri !== model.uri)) {
				return;
			}
			if (!input) {
				return;
			}

			if (commentEditor.getValue() !== input.value) {
				commentEditor.setValue(input.value);

				if (input.value === '') {
					this._pendingComment = { body: '', cursor: new Position(1, 1) };
					if (this.isReply) {
						this._container.classList.remove('expand');
					}
					commentEditor.getDomNode()!.style.outline = '';
					this._error.textContent = '';
					this._error.classList.add('hidden');
				}
			}
		}));
	}

	/**
	 * Command based actions.
	 */
	private createCommentWidgetFormActions(container: HTMLElement, model: ITextModel) {
		const menu = this._commentMenus.getCommentThreadActions(this._contextKeyService);

		this._register(menu);
		this._register(menu.onDidChange(() => {
			this._commentFormActions.setActions(menu);
		}));

		this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action: IAction) => {
			await this._actionRunDelegate?.();

			await action.run({
				thread: this._commentThread,
				text: this.commentEditor.getValue(),
				$mid: MarshalledId.CommentThreadReply
			});

			this.hideReplyArea();
		});

		this._register(this._commentFormActions);
		this._commentFormActions.setActions(menu);
	}

	private createCommentWidgetEditorActions(container: HTMLElement, model: ITextModel) {
		const editorMenu = this._commentMenus.getCommentEditorActions(this._contextKeyService);
		this._register(editorMenu);
		this._register(editorMenu.onDidChange(() => {
			this._commentEditorActions.setActions(editorMenu, true);
		}));

		this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action: IAction) => {
			this._actionRunDelegate?.();

			action.run({
				thread: this._commentThread,
				text: this.commentEditor.getValue(),
				$mid: MarshalledId.CommentThreadReply
			});

			this.focusCommentEditor();
		});

		this._register(this._commentEditorActions);
		this._commentEditorActions.setActions(editorMenu, true);
	}

	/**
	 * Whether the editor is for a reply, i.e. the thread already has comments.
	 */
	private get isReply(): boolean {
		return !!this._commentThread.comments?.length;
	}

	get isReplyExpanded(): boolean {
		return this._container.classList.contains('expand');
	}

	get domNode(): HTMLElement {
		return this._container;
	}

	/**
	 * Measures the width the reply needs: room for the author's avatar and the reply button, or for the widest of
	 * the buttons below a reply that is being written, which wrap.
	 */
	measureMinimumWidth(): number {
		if (this._container.style.display === 'none') {
			return 0;
		}
		const targetWindow = dom.getWindow(this._container);
		const avatarWidth = this.avatar && this.avatar.offsetWidth > 0 ? dom.getTotalWidth(this.avatar) : 0;
		let buttonWidth = 0;
		if (this._reviewThreadReplyButton && this._reviewThreadReplyButton.offsetWidth > 0) {
			// The button stretches to fill the form, so measure its text instead.
			const range = this._reviewThreadReplyButton.ownerDocument.createRange();
			range.selectNodeContents(this._reviewThreadReplyButton);
			const buttonStyle = targetWindow.getComputedStyle(this._reviewThreadReplyButton);
			buttonWidth = range.getBoundingClientRect().width + (this._reviewThreadReplyButton.offsetWidth - this._reviewThreadReplyButton.clientWidth)
				+ (parseFloat(buttonStyle.paddingLeft) || 0) + (parseFloat(buttonStyle.paddingRight) || 0);
		}
		let actionsWidth = 0;
		for (const actions of [this._formActions, this._editorActions]) {
			for (const action of actions?.children ?? []) {
				actionsWidth = Math.max(actionsWidth, dom.isHTMLElement(action) ? dom.getTotalWidth(action) : 0);
			}
		}
		const style = targetWindow.getComputedStyle(this._container);
		return (parseFloat(style.marginLeft) || 0) + Math.max(avatarWidth + buttonWidth, actionsWidth) + (parseFloat(style.marginRight) || 0);
	}

	private expandReplyArea(focus: boolean = true) {
		if (!this.isReplyExpanded) {
			this._container.classList.add('expand');
			if (focus) {
				this.commentEditor.focus();
			}
			this.layoutCommentEditorInForm();
		}
	}

	private clearAndExpandReplyArea() {
		if (!this.isReplyExpanded) {
			this.commentEditor.setValue('');
			this.expandReplyArea();
		}
	}

	private hideReplyArea() {
		const domNode = this.commentEditor.getDomNode();
		if (domNode) {
			domNode.style.outline = '';
		}
		this.commentEditor.setValue('');
		this._pendingComment = { body: '', cursor: new Position(1, 1) };
		this._container.classList.remove('expand');
		this._error.textContent = '';
		this._error.classList.add('hidden');
	}

	private createReplyButton(commentEditor: ICodeEditor, commentForm: HTMLElement) {
		this._reviewThreadReplyButton = <HTMLButtonElement>dom.append(commentForm, dom.$(`button.review-thread-reply-button.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._reviewThreadReplyButton, this._commentOptions?.prompt || nls.localize('reply', "Reply...")));

		this._reviewThreadReplyButton.textContent = this._commentOptions?.prompt || nls.localize('reply', "Reply...");
		// bind click/escape actions for reviewThreadReplyButton and textArea
		this._register(dom.addDisposableListener(this._reviewThreadReplyButton, 'click', _ => this.clearAndExpandReplyArea()));
		this._register(dom.addDisposableListener(this._reviewThreadReplyButton, 'focus', _ => this.clearAndExpandReplyArea()));

		this._register(commentEditor.onDidBlurEditorWidget(() => {
			if (this.isReply && commentEditor.getModel()!.getValueLength() === 0 && this.isReplyExpanded) {
				this._container.classList.remove('expand');
			}
		}));
	}

	override dispose(): void {
		super.dispose();
		dispose(this._commentThreadDisposables);
	}
}
