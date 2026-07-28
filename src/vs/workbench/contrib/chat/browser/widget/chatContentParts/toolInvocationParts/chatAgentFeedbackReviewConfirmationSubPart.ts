/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Checkbox } from '../../../../../../../base/browser/ui/toggle/toggle.js';
import { Action } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { DisposableMap, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { defaultCheckboxStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../../browser/labels.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackReviewComment, IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { IChatToolRiskAssessmentService } from '../../../tools/chatToolRiskAssessmentService.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
import '../media/chatAgentFeedbackReviewConfirmation.css';

interface ICommentRow {
	readonly comment: IChatAgentFeedbackReviewComment;
	readonly checkbox: Checkbox;
	readonly element: HTMLElement;
}

/**
 * Confirmation for the agent host `viewUnreviewedComments` tool. Lists the
 * review comments the user has not accepted yet — each with a checkbox (reveal
 * to the agent or not), an action to open the file at the comment, and an
 * action to delete the comment. Accepting reveals (accepts) the checked
 * comments before approving the tool call; the comments and all actions are
 * fetched/applied via {@link AgentFeedbackReviewCommandId} commands so this
 * layer stays decoupled from the `vs/sessions` feedback model.
 */
export class ChatAgentFeedbackReviewConfirmationSubPart extends AbstractToolConfirmationSubPart {
	public override readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly _rows = new Map<string, ICommentRow>();
	private readonly _rowStores = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _resourceLabels: ResourceLabels;

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IChatToolRiskAssessmentService riskAssessmentService: IChatToolRiskAssessmentService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);

		const data = toolInvocation.toolSpecificData;
		if (!data || data.kind !== 'agentFeedbackReviewConfirmation') {
			throw new Error('Agent feedback review confirmation data is missing');
		}

		this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		const listElement = dom.$('.chat-agent-feedback-review-list');
		void this._populate(listElement);

		const revealLabel = data.options[0] ?? localize('agentFeedback.reveal', "Reveal Selected");
		const buttons: IChatConfirmationButton<() => void>[] = [
			{
				label: revealLabel,
				data: () => this._onReveal(),
			},
			{
				label: localize('agentFeedback.cancel', "Cancel"),
				isSecondary: true,
				data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.Skipped }),
			},
		];

		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget<() => void>,
			this.context,
			{
				title: this.getTitle(),
				icon: Codicon.commentDiscussion,
				message: listElement,
				buttons,
			}
		));

		const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmation.set(true);

		this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
			button.data();
			if (!isTouchClick) {
				this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
			}
		}));

		this._register(toDisposable(() => hasToolConfirmation.reset()));
		this.domNode = confirmWidget.domNode;
	}

	private get _sessionResource(): URI {
		return this.context.element.sessionResource;
	}

	private async _populate(listElement: HTMLElement): Promise<void> {
		let comments: readonly IChatAgentFeedbackReviewComment[] = [];
		try {
			comments = await this.commandService.executeCommand<IChatAgentFeedbackReviewComment[]>(
				AgentFeedbackReviewCommandId.GetComments,
				this._sessionResource,
			) ?? [];
		} catch (error) {
			this.logService.warn('[AgentFeedbackReview] Failed to fetch unreviewed comments', error);
		}

		if (this._store.isDisposed) {
			return;
		}

		dom.clearNode(listElement);
		if (!comments.length) {
			listElement.append(dom.$('.chat-agent-feedback-review-empty', undefined, localize('agentFeedback.none', "No unreviewed comments.")));
			return;
		}

		for (const comment of comments) {
			this._renderRow(listElement, comment);
		}
	}

	private _renderRow(listElement: HTMLElement, comment: IChatAgentFeedbackReviewComment): void {
		const rowStore = new DisposableStore();
		this._rowStores.set(comment.id, rowStore);
		const rowElement = dom.append(listElement, dom.$('.chat-agent-feedback-review-row'));

		const checkbox = rowStore.add(new Checkbox(
			localize('agentFeedback.revealComment', "Reveal this comment to the agent"),
			true,
			defaultCheckboxStyles,
		));
		dom.append(rowElement, checkbox.domNode);

		const main = dom.append(rowElement, dom.$('.chat-agent-feedback-review-main'));
		const header = dom.append(main, dom.$('.chat-agent-feedback-review-header'));
		if (comment.kindLabel) {
			dom.append(header, dom.$('.chat-agent-feedback-review-kind', undefined, comment.kindLabel));
		}
		const fileUri = URI.revive(comment.fileUri);
		const fileLabel = rowStore.add(this._resourceLabels.create(header));
		fileLabel.element.classList.add('chat-agent-feedback-review-file');
		fileLabel.setResource(
			{ resource: fileUri, name: basename(fileUri) },
			{ fileKind: FileKind.FILE, title: fileUri.fsPath || fileUri.path },
		);

		this._renderCommentText(rowStore, main, comment.text);

		const actionsContainer = dom.append(rowElement, dom.$('.chat-agent-feedback-review-actions'));
		const actionBar = rowStore.add(new ActionBar(actionsContainer));
		actionBar.push(rowStore.add(new Action(
			'agentFeedbackReview.reveal',
			localize('agentFeedback.openFile', "Open File and Reveal Comment"),
			ThemeIcon.asClassName(Codicon.goToFile),
			true,
			() => this._reveal(comment.id),
		)), { icon: true, label: false });
		actionBar.push(rowStore.add(new Action(
			'agentFeedbackReview.delete',
			localize('agentFeedback.delete', "Delete Comment"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => this._delete(comment.id),
		)), { icon: true, label: false });

		this._rows.set(comment.id, { comment, checkbox, element: rowElement });
	}

	/**
	 * Renders the comment body clamped to two visual lines by default, with an
	 * expand/collapse toggle in the bottom-right corner. The toggle and the
	 * fade/ellipsis affordance only appear when the text actually overflows two
	 * lines; overflow is re-evaluated whenever the available width changes.
	 */
	private _renderCommentText(rowStore: DisposableStore, main: HTMLElement, text: string): void {
		const container = dom.append(main, dom.$('.chat-agent-feedback-review-text-container'));
		const textElement = dom.append(container, dom.$('.chat-agent-feedback-review-text'));
		textElement.textContent = text;

		const toggle = dom.append(container, dom.$<HTMLButtonElement>('button.chat-agent-feedback-review-expand-toggle'));
		toggle.type = 'button';
		toggle.tabIndex = 0;
		const toggleIcon = dom.append(toggle, dom.$('span.codicon'));
		toggleIcon.setAttribute('aria-hidden', 'true');

		const expandLabel = localize('agentFeedback.expandComment', "Show More");
		const collapseLabel = localize('agentFeedback.collapseComment', "Show Less");

		let expanded = false;

		const renderState = () => {
			container.classList.toggle('collapsed', !expanded);
			container.classList.toggle('expanded', expanded);
			toggleIcon.classList.toggle('codicon-chevron-down', !expanded);
			toggleIcon.classList.toggle('codicon-chevron-up', expanded);
			toggle.setAttribute('aria-label', expanded ? collapseLabel : expandLabel);
			toggle.setAttribute('aria-expanded', String(expanded));
		};

		const isOverflowing = (): boolean => {
			// `scrollHeight` reflects the full content height even while clamped,
			// so compare it against the (clamped) `clientHeight`. Measure in the
			// collapsed state, restoring the previous state in the same frame so
			// no intermediate layout is painted.
			const wasExpanded = expanded;
			if (wasExpanded) {
				container.classList.add('collapsed');
				container.classList.remove('expanded');
			}
			const overflowing = textElement.scrollHeight - textElement.clientHeight > 1;
			if (wasExpanded) {
				container.classList.remove('collapsed');
				container.classList.add('expanded');
			}
			return overflowing;
		};

		const updateOverflow = () => {
			const overflowing = isOverflowing();
			container.classList.toggle('overflowing', overflowing);
			if (!overflowing && expanded) {
				expanded = false;
				renderState();
			}
		};

		rowStore.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			toggle,
			() => expanded ? collapseLabel : expandLabel,
		));

		rowStore.add(dom.addDisposableListener(toggle, dom.EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			expanded = !expanded;
			renderState();
		}));

		renderState();

		const targetWindow = dom.getWindow(container);
		const observer = new targetWindow.ResizeObserver(() => updateOverflow());
		observer.observe(textElement);
		rowStore.add(toDisposable(() => observer.disconnect()));
	}

	private async _reveal(commentId: string): Promise<void> {
		try {
			await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Reveal, this._sessionResource, commentId);
		} catch (error) {
			this.logService.warn('[AgentFeedbackReview] Failed to reveal comment', error);
		}
	}

	private async _delete(commentId: string): Promise<void> {
		const row = this._rows.get(commentId);
		try {
			await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Delete, this._sessionResource, commentId);
			row?.element.remove();
			this._rows.delete(commentId);
			this._rowStores.deleteAndDispose(commentId);
		} catch (error) {
			this.logService.warn('[AgentFeedbackReview] Failed to delete comment', error);
		}
	}

	private async _onReveal(): Promise<void> {
		const checkedIds: string[] = [];
		for (const row of this._rows.values()) {
			if (row.checkbox.checked) {
				checkedIds.push(row.comment.id);
			}
		}
		// Accept the checked comments before approving the tool call so the
		// annotation writes are dispatched ahead of the approval on the same
		// connection; the server tool body then reads the updated state and
		// returns exactly the revealed comments.
		if (checkedIds.length) {
			try {
				await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Accept, this._sessionResource, checkedIds);
			} catch (error) {
				this.logService.warn('[AgentFeedbackReview] Failed to accept comments', error);
			}
		}
		this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
	}

	protected createContentElement(): HTMLElement | string {
		// This confirmation builds its own widget content (the comment list) in
		// the constructor and never goes through the base `render()` flow, so
		// this is unused. Return an empty string rather than throwing so the
		// class stays safe if a future refactor routes through `render()`.
		return '';
	}

	protected getTitle(): string {
		const state = this.toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
			return '';
		}
		const title = state.confirmationMessages?.title;
		return typeof title === 'string' ? title : title?.value ?? '';
	}
}
