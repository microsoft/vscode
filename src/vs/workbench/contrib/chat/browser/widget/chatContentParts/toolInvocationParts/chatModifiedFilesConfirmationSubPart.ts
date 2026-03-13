/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button, ButtonWithIcon } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatModifiedFilesConfirmationData, IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from '../chatReferencesContentPart.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';

export class ChatModifiedFilesConfirmationSubPart extends AbstractToolConfirmationSubPart {
	public override readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		private readonly listPool: CollapsibleListPool,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);

		const state = toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
			throw new Error('Modified files confirmation messages are missing');
		}

		const data = toolInvocation.toolSpecificData;
		if (!data || data.kind !== 'modifiedFilesConfirmation') {
			throw new Error('Modified files confirmation data is missing');
		}

		const tool = languageModelToolsService.getTool(toolInvocation.toolId);
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget<() => void>,
			this.context,
			{
				title: this.getTitle(),
				icon: tool?.icon && hasKey(tool.icon, { id: true }) ? tool.icon : Codicon.tools,
				subtitle: typeof toolInvocation.originMessage === 'string' ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
				buttons: this.createButtons(data.options),
				message: this.createWidgetContentElement(state.confirmationMessages.message, data),
			}
		));

		const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmation.set(true);

		this._register(confirmWidget.onDidClick(button => {
			button.data();
			this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
		}));

		this._register(toDisposable(() => hasToolConfirmation.reset()));
		this.domNode = confirmWidget.domNode;
	}

	private createButtons(options: readonly string[]): IChatConfirmationButton<() => void>[] {
		const [primaryOption, ...secondaryOptions] = options;
		return [
			{
				label: primaryOption,
				data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: primaryOption }),
				moreActions: secondaryOptions.map(option => ({
					label: option,
					data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: option }),
				}))
			},
			{
				label: localize('cancel', 'Cancel'),
				data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.Skipped }),
				isSecondary: true,
			}
		];
	}

	private createWidgetContentElement(message: string | IMarkdownString | undefined, data: IChatModifiedFilesConfirmationData): HTMLElement {
		const container = dom.$('.chat-modified-files-confirmation');

		if (message) {
			const renderedMessage = this._register(this.markdownRendererService.render(typeof message === 'string' ? new MarkdownString(message) : message));
			container.append(renderedMessage.element);
		}

		container.append(this.createModifiedFilesElement(data));
		return container;
	}

	private createModifiedFilesElement(data: IChatModifiedFilesConfirmationData): HTMLElement {
		const container = dom.$('.chat-modified-files-confirmation-list.chat-editing-session-container.show-file-icons');
		const overview = dom.append(container, dom.$('.chat-editing-session-overview'));
		const title = dom.append(overview, dom.$('.working-set-title'));
		const titleButton = this._register(new ButtonWithIcon(title, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined,
			supportIcons: true,
		}));
		const actions = dom.append(overview, dom.$('.chat-editing-session-actions'));
		const countsContainer = dom.$('.working-set-line-counts');
		const addedSpan = dom.append(countsContainer, dom.$('.working-set-lines-added'));
		const removedSpan = dom.append(countsContainer, dom.$('.working-set-lines-removed'));
		titleButton.element.appendChild(countsContainer);

		const filesLabel = data.modifiedFiles.length === 1
			? localize('oneFileChanged', '1 file changed')
			: localize('manyFilesChanged', '{0} files changed', data.modifiedFiles.length);
		titleButton.label = filesLabel;

		let added = 0;
		let removed = 0;
		let hasDiffStats = false;
		for (const file of data.modifiedFiles) {
			if (typeof file.insertions === 'number' || typeof file.deletions === 'number') {
				hasDiffStats = true;
				added += file.insertions ?? 0;
				removed += file.deletions ?? 0;
			}
		}

		if (hasDiffStats) {
			addedSpan.textContent = `+${added}`;
			removedSpan.textContent = `-${removed}`;
			titleButton.element.setAttribute('aria-label', localize('modifiedFilesSummaryWithCounts', '{0}, {1} lines added, {2} lines removed', filesLabel, added, removed));
			countsContainer.setAttribute('aria-label', localize('modifiedFilesCounts', '{0} lines added, {1} lines removed', added, removed));
		} else {
			countsContainer.remove();
			titleButton.element.setAttribute('aria-label', filesLabel);
		}

		const viewAllChangesButton = this._register(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			supportIcons: true,
			ariaLabel: localize('viewAllChanges', 'View All Changes'),
			title: localize('viewAllChanges', 'View All Changes'),
		}));
		viewAllChangesButton.element.classList.add('default-colors');
		viewAllChangesButton.icon = Codicon.diffMultiple;
		viewAllChangesButton.label = ' ';
		this._register(viewAllChangesButton.onDidClick(async () => {
			await this.openAllChanges(data);
		}));

		const listReference = this._register(this.listPool.get());
		const list = listReference.object;
		const listItems = data.modifiedFiles.map<IChatCollapsibleListItem>(file => {
			const resource = URI.revive(file.uri);
			const originalUri = file.originalUri ? URI.revive(file.originalUri) : undefined;
			return {
				kind: 'reference',
				reference: resource,
				title: file.title,
				description: file.description,
				state: ModifiedFileEntryState.Accepted,
				showModifiedState: true,
				options: {
					diffMeta: typeof file.insertions === 'number' || typeof file.deletions === 'number' ? {
						added: file.insertions ?? 0,
						removed: file.deletions ?? 0,
					} : undefined,
					originalUri,
					status: undefined,
				}
			};
		});

		this._register(list.onDidOpen(async e => {
			if (e.element?.kind !== 'reference' || !URI.isUri(e.element.reference)) {
				return;
			}

			const modifiedUri = e.element.reference;
			const originalUri = e.element.options?.originalUri;
			if (originalUri) {
				await this.editorService.openEditor({
					original: { resource: originalUri },
					modified: { resource: modifiedUri },
					options: e.editorOptions,
				});
				return;
			}

			await this.editorService.openEditor({
				resource: modifiedUri,
				options: e.editorOptions,
			});
		}));

		const maxItemsShown = 6;
		const itemsShown = Math.min(listItems.length, maxItemsShown);
		const height = itemsShown * 22;
		const workingSetContainer = dom.append(container, dom.$('.chat-editing-session-list.collapsed'));
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, listItems);
		workingSetContainer.append(list.getHTMLElement());

		let isCollapsed = true;
		const setExpansionState = () => {
			titleButton.icon = isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			workingSetContainer.classList.toggle('collapsed', isCollapsed);
		};
		setExpansionState();

		const toggleWorkingSet = () => {
			isCollapsed = !isCollapsed;
			setExpansionState();
		};

		this._register(titleButton.onDidClick(toggleWorkingSet));
		this._register(dom.addDisposableListener(overview, 'click', e => {
			if (e.defaultPrevented) {
				return;
			}

			const target = e.target as HTMLElement;
			if (target.closest('.monaco-button')) {
				return;
			}

			toggleWorkingSet();
		}));

		return container;
	}

	private async openAllChanges(data: IChatModifiedFilesConfirmationData): Promise<void> {
		await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
			title: localize('modifiedFilesAllChangesTitle', 'All Changes'),
			resources: data.modifiedFiles.map(file => ({
				originalUri: file.originalUri ? URI.revive(file.originalUri) : undefined,
				modifiedUri: URI.revive(file.uri),
			}))
		});
	}

	protected createContentElement(): HTMLElement | string {
		throw new Error('Not used');
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
