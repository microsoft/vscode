/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableResizeObserver } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatErrorLevel, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatViewModel, IChatErrorDetailsPart, IChatResponseViewModel, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ChatContentMarkdownRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatEditorOptions } from '../../../../workbench/contrib/chat/browser/widget/chatOptions.js';
import { IChatRendererDelegate } from '../../../../workbench/contrib/chat/browser/widget/chatListRenderer.js';
import { DiffEditorPool, EditorPool } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ChatErrorConfirmationContentPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatErrorConfirmationPart.js';
import { CollapsibleListPool } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ChatToolInvocationPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { canRunProjectBoardAction, IProjectBoardPendingActions } from '../common/projectBoardActions.js';

/** Hosts the transcript's real action parts, retaining them while their requests stay pending. */
export class ProjectBoardChatActions extends Disposable {
	readonly element = mainWindow.document.createElement('div');
	private readonly toolParts = this._register(new DisposableMap<IChatToolInvocation, ChatToolInvocationPart>());
	private readonly errorPart = this._register(new MutableDisposable<ChatErrorConfirmationContentPart>());
	private readonly width = observableValue(this, 240);
	private readonly scopedInstantiation: IInstantiationService;
	private readonly response: IChatResponseViewModel;
	private readonly editorPool: EditorPool;
	private readonly diffEditorPool: DiffEditorPool;
	private readonly inlineTextModels: InlineTextModelCollection;
	private readonly listPool: CollapsibleListPool;
	private readonly renderer: ChatContentMarkdownRenderer;
	private nextCodeBlock = 0;
	private readonly limitMessage = mainWindow.document.createElement('p');
	private currentError: IProjectBoardPendingActions['error'];

	constructor(
		private actions: IProjectBoardPendingActions,
		private readonly canAct: () => boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		try {
			this.element.className = 'project-board-live-actions';
			this.element.setAttribute('role', 'group');
			this.element.setAttribute('aria-label', localize('projectBoard.chatActions', "Pending chat actions"));
			const scopedContext = this._register(contextKeyService.createScoped(this.element));
			// Transcript-wide approval shortcuts resolve through a ChatWidget, not this card.
			ChatContextKeys.inChatSession.bindTo(scopedContext).set(false);
			this.scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
			const viewModel = this._register(this.scopedInstantiation.createInstance(ChatViewModel, actions.model, undefined));
			const response = viewModel.getItems().find(item => isResponseVM(item) && item.requestId === actions.request.id);
			if (!response || !isResponseVM(response)) {
				throw new Error('The pending chat response could not be rendered');
			}
			this.response = response;
			const options = this._register(this.scopedInstantiation.createInstance(ChatEditorOptions, undefined, 'editor.foreground', 'editorWidget.background', 'editorWidget.background'));
			const delegate: IChatRendererDelegate = {
				container: this.element, getListLength: () => 1,
				currentChatMode: () => actions.model.inputModel.state.get()?.mode.kind ?? ChatModeKind.Agent,
				isStickyScrollEnabled: () => false, refreshStickyScroll: () => { }, stickyScrollTopPadding: 0,
			};
			this.editorPool = this._register(this.scopedInstantiation.createInstance(EditorPool, options, delegate, this.element, true));
			this.diffEditorPool = this._register(this.scopedInstantiation.createInstance(DiffEditorPool, options, delegate, this.element, true));
			this.inlineTextModels = this._register(this.scopedInstantiation.createInstance(InlineTextModelCollection));
			this.listPool = this._register(this.scopedInstantiation.createInstance(CollapsibleListPool, Event.None, undefined, undefined));
			this.renderer = this.scopedInstantiation.createInstance(ChatContentMarkdownRenderer);
			const observer = this._register(new DisposableResizeObserver('ProjectBoardChatActions', () => {
				const width = this.element.clientWidth;
				if (width > 0) {
					this.width.set(width, undefined);
				}
			}));
			this._register(observer.observe(this.element));
			this.limitMessage.textContent = localize('projectBoard.actionLimit', "Open the chat to check for additional pending actions.");
			this.update(actions);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	get source(): IProjectBoardPendingActions { return this.actions; }
	get rendersTools(): boolean { return this.toolParts.size > 0 && !this.actions.limited; }

	update(actions: IProjectBoardPendingActions): void {
		this.actions = actions;
		for (const tool of this.toolParts.keys()) {
			if (!actions.tools.includes(tool)) {
				this.toolParts.get(tool)?.domNode.remove();
				this.toolParts.deleteAndDispose(tool);
			}
		}
		for (const tool of actions.tools) {
			if (!this.toolParts.has(tool)) {
				const index = this.nextCodeBlock;
				const context = this.context(tool, index);
				const part = this.scopedInstantiation.createInstance(ChatToolInvocationPart, tool, context, this.renderer, this.listPool, this.editorPool, () => this.width.get(), undefined, index);
				this.toolParts.set(tool, part);
				this.nextCodeBlock += Math.max(1, part.codeblocks.length);
				this.element.appendChild(part.domNode);
			}
		}
		if (actions.error !== this.currentError) {
			this.errorPart.value?.domNode.remove();
			this.errorPart.clear();
			this.currentError = actions.error;
			if (actions.error?.confirmationButtons?.length) {
				const details: IChatErrorDetailsPart = { kind: 'errorDetails', errorDetails: actions.error, isLast: true };
				const part = this.scopedInstantiation.createInstance(ChatErrorConfirmationContentPart,
					actions.error.level ?? ChatErrorLevel.Error, new MarkdownString(actions.error.message),
					details, actions.error.confirmationButtons, this.renderer, this.context());
				this.errorPart.value = part;
				this.element.appendChild(part.domNode);
			}
		}
		this.limitMessage.remove();
		if (actions.limited) {
			this.element.appendChild(this.limitMessage);
		}
	}

	private context(tool?: IChatToolInvocation, codeBlockStartIndex = 0): IChatContentPartRenderContext {
		return {
			element: this.response, elementIndex: 0, container: this.element, content: [...this.actions.tools],
			contentIndex: tool ? this.actions.tools.indexOf(tool) : 0, codeBlockStartIndex, treeStartIndex: 0,
			editorPool: this.editorPool, diffEditorPool: this.diffEditorPool, inlineTextModels: this.inlineTextModels,
			currentWidth: this.width, onDidChangeVisibility: Event.None, focusInputOnAction: false, showActionKeybindings: false,
			canRunAction: () => {
				const allowed = !this._store.isDisposed && this.canAct() && canRunProjectBoardAction(this.actions, tool);
				if (!allowed) {
					this.logService.warn('[ProjectBoard] Ignored a stale chat action');
				}
				return allowed;
			},
			onActionError: error => {
				this.logService.error('[ProjectBoard] Chat action failed', error);
				this.notificationService.error(localize('projectBoard.chatActionFailed', "The chat action failed. Open the chat to retry."));
			},
		};
	}
}
