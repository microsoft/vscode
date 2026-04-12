/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../../base/browser/dom.js';
import { Button, ButtonWithIcon } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
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
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatCustomConfirmationWidget } from '../chatConfirmationWidget.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
let ChatModifiedFilesConfirmationSubPart = class ChatModifiedFilesConfirmationSubPart extends AbstractToolConfirmationSubPart {
    constructor(toolInvocation, context, listPool, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, markdownRendererService, editorService, commandService) {
        super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);
        this.listPool = listPool;
        this.markdownRendererService = markdownRendererService;
        this.editorService = editorService;
        this.commandService = commandService;
        this.codeblocks = [];
        const state = toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || !state.confirmationMessages?.title) {
            throw new Error('Modified files confirmation messages are missing');
        }
        const data = toolInvocation.toolSpecificData;
        if (!data || data.kind !== 'modifiedFilesConfirmation') {
            throw new Error('Modified files confirmation data is missing');
        }
        const tool = languageModelToolsService.getTool(toolInvocation.toolId);
        const confirmWidget = this._register(this.instantiationService.createInstance((ChatCustomConfirmationWidget), this.context, {
            title: this.getTitle(),
            icon: tool?.icon && hasKey(tool.icon, { id: true }) ? tool.icon : Codicon.tools,
            subtitle: typeof toolInvocation.originMessage === 'string' ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
            buttons: this.createButtons(data.options),
            message: this.createWidgetContentElement(state.confirmationMessages.message, data),
        }));
        const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
        hasToolConfirmation.set(true);
        this._register(confirmWidget.onDidClick(button => {
            button.data();
            this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
        }));
        this._register(toDisposable(() => hasToolConfirmation.reset()));
        this.domNode = confirmWidget.domNode;
    }
    createButtons(options) {
        const [primaryOption, ...secondaryOptions] = options;
        return [
            {
                label: primaryOption,
                data: () => this.confirmWith(this.toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */, selectedButton: primaryOption }),
                moreActions: secondaryOptions.map(option => ({
                    label: option,
                    data: () => this.confirmWith(this.toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */, selectedButton: option }),
                }))
            }
        ];
    }
    createWidgetContentElement(message, data) {
        const container = dom.$('.chat-modified-files-confirmation');
        if (message) {
            const renderedMessage = this._register(this.markdownRendererService.render(typeof message === 'string' ? new MarkdownString(message) : message));
            container.append(renderedMessage.element);
        }
        container.append(this.createModifiedFilesElement(data));
        return container;
    }
    createModifiedFilesElement(data) {
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
        }
        else {
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
        const listItems = data.modifiedFiles.map(file => {
            const resource = URI.revive(file.uri);
            const originalUri = file.originalUri ? URI.revive(file.originalUri) : undefined;
            return {
                kind: 'reference',
                reference: resource,
                title: file.title,
                description: file.description,
                state: 1 /* ModifiedFileEntryState.Accepted */,
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
        this._register(list.onDidOpen(async (e) => {
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
            const target = e.target;
            if (target.closest('.monaco-button')) {
                return;
            }
            toggleWorkingSet();
        }));
        return container;
    }
    async openAllChanges(data) {
        await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
            title: localize('modifiedFilesAllChangesTitle', 'All Changes'),
            resources: data.modifiedFiles.map(file => ({
                originalUri: file.originalUri ? URI.revive(file.originalUri) : undefined,
                modifiedUri: URI.revive(file.uri),
            }))
        });
    }
    createContentElement() {
        throw new Error('Not used');
    }
    getTitle() {
        const state = this.toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            return '';
        }
        const title = state.confirmationMessages?.title;
        return typeof title === 'string' ? title : title?.value ?? '';
    }
};
ChatModifiedFilesConfirmationSubPart = __decorate([
    __param(3, IInstantiationService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService),
    __param(6, IChatWidgetService),
    __param(7, ILanguageModelToolsService),
    __param(8, IMarkdownRendererService),
    __param(9, IEditorService),
    __param(10, ICommandService)
], ChatModifiedFilesConfirmationSubPart);
export { ChatModifiedFilesConfirmationSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdkUsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNoRixPQUFPLEVBQXNCLGtCQUFrQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFMUUsT0FBTyxFQUFFLDRCQUE0QixFQUEyQixNQUFNLDhCQUE4QixDQUFDO0FBRXJHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMzRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRixJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLCtCQUErQjtJQUl4RixZQUNDLGNBQW1DLEVBQ25DLE9BQXNDLEVBQ3JCLFFBQTZCLEVBQ3ZCLG9CQUEyQyxFQUM5QyxpQkFBcUMsRUFDckMsaUJBQXFDLEVBQ3JDLGlCQUFxQyxFQUM3Qix5QkFBcUQsRUFDdkQsdUJBQWtFLEVBQzVFLGFBQThDLEVBQzdDLGNBQWdEO1FBRWpFLEtBQUssQ0FBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFWeEgsYUFBUSxHQUFSLFFBQVEsQ0FBcUI7UUFNSCw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQzNELGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUM1QixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFiekMsZUFBVSxHQUF5QixFQUFFLENBQUM7UUFpQjlELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekMsSUFBSSxLQUFLLENBQUMsSUFBSSxpRUFBeUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUMvRyxNQUFNLElBQUksS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztRQUM3QyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssMkJBQTJCLEVBQUUsQ0FBQztZQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEUsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUM1RSxDQUFBLDRCQUF3QyxDQUFBLEVBQ3hDLElBQUksQ0FBQyxPQUFPLEVBQ1o7WUFDQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUN0QixJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSztZQUMvRSxRQUFRLEVBQUUsT0FBTyxjQUFjLENBQUMsYUFBYSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRSxLQUFLO1lBQy9ILE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDekMsT0FBTyxFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQztTQUNsRixDQUNELENBQUMsQ0FBQztRQUVILE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDdkcsbUJBQW1CLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTlCLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNoRCxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsaUJBQWlCLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUM7UUFDdkcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUM7SUFDdEMsQ0FBQztJQUVPLGFBQWEsQ0FBQyxPQUEwQjtRQUMvQyxNQUFNLENBQUMsYUFBYSxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxPQUFPLENBQUM7UUFDckQsT0FBTztZQUNOO2dCQUNDLEtBQUssRUFBRSxhQUFhO2dCQUNwQixJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsSUFBSSxvQ0FBNEIsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLENBQUM7Z0JBQ3RILFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM1QyxLQUFLLEVBQUUsTUFBTTtvQkFDYixJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsSUFBSSxvQ0FBNEIsRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLENBQUM7aUJBQy9HLENBQUMsQ0FBQzthQUNIO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFTywwQkFBMEIsQ0FBQyxPQUE2QyxFQUFFLElBQXdDO1FBQ3pILE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUU3RCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLE9BQU8sT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakosU0FBUyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLDBCQUEwQixDQUFDLElBQXdDO1FBQzFFLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsdUZBQXVGLENBQUMsQ0FBQztRQUNqSCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztRQUNoRixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUNoRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksY0FBYyxDQUFDLEtBQUssRUFBRTtZQUM1RCxnQkFBZ0IsRUFBRSxTQUFTO1lBQzNCLFlBQVksRUFBRSxTQUFTO1lBQ3ZCLGdCQUFnQixFQUFFLFNBQVM7WUFDM0IscUJBQXFCLEVBQUUsU0FBUztZQUNoQyx5QkFBeUIsRUFBRSxTQUFTO1lBQ3BDLHlCQUF5QixFQUFFLFNBQVM7WUFDcEMsOEJBQThCLEVBQUUsU0FBUztZQUN6QyxlQUFlLEVBQUUsU0FBUztZQUMxQixZQUFZLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUMxRCxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQztRQUNyRixXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVqRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQ2pELENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUM7WUFDOUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxtQkFBbUIsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hGLFdBQVcsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDO1FBRS9CLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNoQixJQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7UUFDekIsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdkMsSUFBSSxPQUFPLElBQUksQ0FBQyxVQUFVLEtBQUssUUFBUSxJQUFJLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDL0UsWUFBWSxHQUFHLElBQUksQ0FBQztnQkFDcEIsS0FBSyxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDO2dCQUM5QixPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLFNBQVMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNwQyxXQUFXLENBQUMsV0FBVyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7WUFDeEMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSx5Q0FBeUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEssZUFBZSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLG9DQUFvQyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ25JLENBQUM7YUFBTSxDQUFDO1lBQ1AsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLFdBQVcsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRTtZQUMvRCxHQUFHLG1CQUFtQjtZQUN0QixTQUFTLEVBQUUsSUFBSTtZQUNmLEtBQUssRUFBRSxJQUFJO1lBQ1gsWUFBWSxFQUFFLElBQUk7WUFDbEIsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxrQkFBa0IsQ0FBQztZQUN6RCxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDO1NBQ3JELENBQUMsQ0FBQyxDQUFDO1FBQ0osb0JBQW9CLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUM3RCxvQkFBb0IsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUNqRCxvQkFBb0IsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO1FBQ2pDLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ3pELE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDMUQsTUFBTSxJQUFJLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBMkIsSUFBSSxDQUFDLEVBQUU7WUFDekUsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNoRixPQUFPO2dCQUNOLElBQUksRUFBRSxXQUFXO2dCQUNqQixTQUFTLEVBQUUsUUFBUTtnQkFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO2dCQUNqQixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7Z0JBQzdCLEtBQUsseUNBQWlDO2dCQUN0QyxpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixPQUFPLEVBQUU7b0JBQ1IsUUFBUSxFQUFFLE9BQU8sSUFBSSxDQUFDLFVBQVUsS0FBSyxRQUFRLElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBQ3JGLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUM7d0JBQzNCLE9BQU8sRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUM7cUJBQzVCLENBQUMsQ0FBQyxDQUFDLFNBQVM7b0JBQ2IsV0FBVztvQkFDWCxNQUFNLEVBQUUsU0FBUztpQkFDakI7YUFDRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFDLENBQUMsRUFBQyxFQUFFO1lBQ3ZDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssV0FBVyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hFLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7WUFDeEMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDO1lBQ25ELElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7b0JBQ25DLFFBQVEsRUFBRSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUU7b0JBQ25DLFFBQVEsRUFBRSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUU7b0JBQ25DLE9BQU8sRUFBRSxDQUFDLENBQUMsYUFBYTtpQkFDeEIsQ0FBQyxDQUFDO2dCQUNILE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQztnQkFDbkMsUUFBUSxFQUFFLFdBQVc7Z0JBQ3JCLE9BQU8sRUFBRSxDQUFDLENBQUMsYUFBYTthQUN4QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztRQUM3RCxNQUFNLE1BQU0sR0FBRyxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQy9CLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUM7UUFDakcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDO1FBQ25ELElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdkMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRWxELElBQUksV0FBVyxHQUFHLElBQUksQ0FBQztRQUN2QixNQUFNLGlCQUFpQixHQUFHLEdBQUcsRUFBRTtZQUM5QixXQUFXLENBQUMsSUFBSSxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztZQUM1RSxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRSxDQUFDLENBQUM7UUFDRixpQkFBaUIsRUFBRSxDQUFDO1FBRXBCLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxFQUFFO1lBQzdCLFdBQVcsR0FBRyxDQUFDLFdBQVcsQ0FBQztZQUMzQixpQkFBaUIsRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDekQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRTtZQUMvRCxJQUFJLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN4QixPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFxQixDQUFDO1lBQ3ZDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLE9BQU87WUFDUixDQUFDO1lBRUQsZ0JBQWdCLEVBQUUsQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBd0M7UUFDcEUsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxnQ0FBZ0MsRUFBRTtZQUMxRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGFBQWEsQ0FBQztZQUM5RCxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3hFLFdBQVcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7YUFDakMsQ0FBQyxDQUFDO1NBQ0gsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVTLG9CQUFvQjtRQUM3QixNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFUyxRQUFRO1FBQ2pCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzlDLElBQUksS0FBSyxDQUFDLElBQUksaUVBQXlELEVBQUUsQ0FBQztZQUN6RSxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDO1FBQ2hELE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDO0lBQy9ELENBQUM7Q0FDRCxDQUFBO0FBeFBZLG9DQUFvQztJQVE5QyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGNBQWMsQ0FBQTtJQUNkLFlBQUEsZUFBZSxDQUFBO0dBZkwsb0NBQW9DLENBd1BoRCJ9