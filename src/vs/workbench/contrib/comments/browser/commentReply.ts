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
import { Schemas } from '../../../../base/common/network.js';
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

let INMEM_MODEL_ID = 0;
export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';

export class CommentReply<T extends IRange | ICellRange> extends Disposable {
	commentEditor: ICodeEditor;
	form: HTMLElement;
	commentEditorIsEmpty: IContextKey<boolean>;
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
		private _pendingComment: string | undefined,
		private _parentThread: ICommentThreadWidget,
		focus: boolean,
		private _actionRunDelegate: (() => void) | null,
		@ICommentService private commentService: ICommentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IHoverService private hoverService: IHoverService,
		@ITextModelService private readonly textModelService: ITextModelService
	) {
		super();

		this.form = dom.append(container, dom.$('.comment-form'));
		this.commentEditor = this._register(this._scopedInstatiationService.createInstance(SimpleCommentEditor, this.form, SimpleCommentEditor.getEditorOptions(configurationService), _contextKeyService, this._parentThread));
		this.commentEditorIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeyService);
		this.commentEditorIsEmpty.set(!this._pendingComment);

		this.initialize(focus);
	}

	async initialize(focus: boolean) {
		const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
		const modeId = generateUuid() + '-' + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);
		const params = JSON.stringify({
			extensionId: this._commentThread.extensionId,
			commentThreadId: this._commentThread.threadId
		});

		let resource = URI.from({
			scheme: Schemas.commentsInput,
			path: `/${this._commentThread.extensionId}/commentinput-${modeId}.md?${params}` // TODO. Remove params once extensions adopt authority.
		});
		const commentController = this.commentService.getCommentController(this.owner);
		if (commentController) {
			resource = resource.with({ authority: commentController.id });
		}

		const model = await this.textModelService.createModelReference(resource);
		model.object.textEditorModel.setValue(this._pendingComment || '');

		this._register(model);
		this.commentEditor.setModel(model.object.textEditorModel);
		this.calculateEditorHeight();

		this._register(model.object.textEditorModel.onDidChangeContent(() => {
			this.setCommentEditorDecorations();
			this.commentEditorIsEmpty?.set(!this.commentEditor.getValue());
			if (this.calculateEditorHeight()) {
				this.commentEditor.layout({ height: this._editorHeight, width: this.commentEditor.getLayoutInfo().width });
				this.commentEditor.render(true);
			}
		}));

		this.createTextModelListener(this.commentEditor, this.form);

		this.setCommentEditorDecorations();

		// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
		if (this._pendingComment) {
			this.expandReplyArea();
		} else if (hasExistingComments) {
			this.createReplyButton(this.commentEditor, this.form);
		} else if (focus && (this._commentThread.comments && this._commentThread.comments.length === 0)) {
			this.expandReplyArea();
		}
		this._error = dom.append(this.form, dom.$('.validation-error.hidden'));
		const formActions = dom.append(this.form, dom.$('.form-actions'));
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
			this.createReplyButton(this.commentEditor, this.form);
		}

		if (this._commentThread.comments && this._commentThread.comments.length === 0 && !oldAndNewBothEmpty) {
			this.expandReplyArea();
		}

		if (isReplying) {
			this.commentEditor.focus();
		}
	}

	public getPendingComment(): string | undefined {
		const model = this.commentEditor.getModel();

		if (model && model.getValueLength() > 0) { // checking length is cheap
			return model.getValue();
		}

		return undefined;
	}

	public setPendingComment(comment: string) {
		this._pendingComment = comment;
		this.expandReplyArea();
		this.commentEditor.setValue(comment);
	}

	public layout(widthInPixel: number) {
		this.commentEditor.layout({ height: this._editorHeight, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ });
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

	public updateCanReply() {
		if (!this._commentThread.canReply) {
			this.form.style.display = 'none';
		} else {
			this.form.style.display = 'block';
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

	private createTextModelListener(commentEditor: ICodeEditor, commentForm: HTMLElement) {
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
					this._pendingComment = '';
					commentForm.classList.remove('expand');
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

		this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, container, async (action: IAction) => {
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
			this._commentEditorActions.setActions(editorMenu);
		}));

		this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, container, async (action: IAction) => {
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

	private get isReplyExpanded(): boolean {
		return this.form.classList.contains('expand');
	}

	private expandReplyArea() {
		if (!this.isReplyExpanded) {
			this.form.classList.add('expand');
			this.commentEditor.focus();
			this.commentEditor.layout();
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
		this._pendingComment = '';
		this.form.classList.remove('expand');
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

		commentEditor.onDidBlurEditorWidget(() => {
			if (commentEditor.getModel()!.getValueLength() === 0 && commentForm.classList.contains('expand')) {
				commentForm.classList.remove('expand');
			}
		});
	}

	override dispose(): void {
		super.dispose();
		dispose(this._commentThreadDisposables);
	}
}
