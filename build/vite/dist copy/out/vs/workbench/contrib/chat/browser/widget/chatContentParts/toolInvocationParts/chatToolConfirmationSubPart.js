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
import { Separator } from '../../../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { count } from '../../../../../../../base/common/strings.js';
import { isEmptyObject } from '../../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { ElementSizeObserver } from '../../../../../../../editor/browser/config/elementSizeObserver.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkerService, MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';
import { createToolSchemaUri, ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../common/tools/languageModelToolsConfirmationService.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { renderFileWidgets } from '../chatInlineAnchorWidget.js';
import { CodeBlockPart } from '../codeBlockPart.js';
import { IChatMarkdownAnchorService } from '../chatMarkdownAnchorService.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
const SHOW_MORE_MESSAGE_HEIGHT_TRIGGER = 100;
let ToolConfirmationSubPart = class ToolConfirmationSubPart extends AbstractToolConfirmationSubPart {
    get codeblocks() {
        return this.markdownParts.flatMap(part => part.codeblocks);
    }
    constructor(toolInvocation, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, keybindingService, languageService, contextKeyService, chatWidgetService, commandService, markerService, languageModelToolsService, chatMarkdownAnchorService, confirmationService) {
        const state = toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || !state.confirmationMessages?.title) {
            throw new Error('Confirmation messages are missing');
        }
        super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);
        this.renderer = renderer;
        this.editorPool = editorPool;
        this.currentWidthDelegate = currentWidthDelegate;
        this.codeBlockStartIndex = codeBlockStartIndex;
        this.languageService = languageService;
        this.commandService = commandService;
        this.markerService = markerService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.confirmationService = confirmationService;
        this.markdownParts = [];
        this.render({
            allowActionId: AcceptToolConfirmationActionId,
            skipActionId: SkipToolConfirmationActionId,
            allowLabel: state.confirmationMessages.confirmResults ? localize('allowReview', "Allow and Review Once") : localize('allow', "Allow Once"),
            skipLabel: localize('skip.detail', 'Proceed without running this tool'),
            partType: 'chatToolConfirmation',
            subtitle: typeof toolInvocation.originMessage === 'string' ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
        });
    }
    additionalPrimaryActions() {
        const actions = super.additionalPrimaryActions();
        const state = this.toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            return actions;
        }
        if (state.confirmationMessages?.allowAutoConfirm !== false) {
            // Get combination label and precomputed key if present
            const approveCombination = state.confirmationMessages?.approveCombination;
            const combination = approveCombination
                ? {
                    label: typeof approveCombination.label === 'string' ? approveCombination.label : approveCombination.label.value,
                    key: approveCombination.key,
                }
                : undefined;
            // Get actions from confirmation service
            const confirmActions = this.confirmationService.getPreConfirmActions({
                toolId: this.toolInvocation.toolId,
                source: this.toolInvocation.source,
                parameters: state.parameters,
                chatSessionResource: this.context.element.sessionResource,
                combination,
            });
            for (const action of confirmActions) {
                if (action.divider) {
                    actions.push(new Separator());
                }
                actions.push({
                    label: action.label,
                    tooltip: action.detail,
                    scope: action.scope,
                    data: async () => {
                        const shouldConfirm = await action.select();
                        if (shouldConfirm) {
                            this.confirmWith(this.toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
                        }
                    }
                });
            }
        }
        if (state.confirmationMessages?.confirmResults) {
            actions.unshift({
                label: localize('allowSkip', 'Allow and Skip Reviewing Result'),
                data: () => {
                    state.confirmationMessages.confirmResults = undefined;
                    this.confirmWith(this.toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */ });
                }
            }, new Separator());
        }
        return actions;
    }
    useAllowOnceAsPrimary() {
        const state = this.toolInvocation.state.get();
        if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            return !!state.confirmationMessages?.approveCombination;
        }
        return false;
    }
    createContentElement() {
        const state = this.toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            return '';
        }
        const { message, disclaimer } = state.confirmationMessages;
        const toolInvocation = this.toolInvocation;
        if (typeof message === 'string' && !disclaimer) {
            return message;
        }
        else {
            const codeBlockRenderOptions = {
                hideToolbar: true,
                reserveWidth: 19,
                verticalPadding: 5,
                editorOptions: {
                    tabFocusMode: true,
                    ariaLabel: this.getTitle(),
                },
            };
            const elements = dom.h('div', [
                dom.h('.message@messageContainer', [
                    dom.h('.message-wrapper@message'),
                    dom.h('.see-more@showMore', [
                        dom.h('a', [localize('showMore', "Show More")])
                    ]),
                ]),
                dom.h('.editor@editor'),
                dom.h('.disclaimer@disclaimer'),
            ]);
            if (toolInvocation.toolSpecificData?.kind === 'input' && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {
                const titleEl = document.createElement('h3');
                titleEl.textContent = localize('chat.input', "Input");
                elements.editor.appendChild(titleEl);
                const inputData = toolInvocation.toolSpecificData;
                const codeBlockRenderOptions = {
                    hideToolbar: true,
                    reserveWidth: 19,
                    maxHeightInLines: 13,
                    verticalPadding: 5,
                    editorOptions: {
                        wordWrap: 'off',
                        readOnly: false,
                        ariaLabel: this.getTitle(),
                    }
                };
                const langId = this.languageService.getLanguageIdByLanguageName('json');
                const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
                const canSeeMore = count(rawJsonInput, '\n') > 2; // if more than one key:value
                // View a single JSON line by default until they 'see more'
                const initialText = rawJsonInput.replace(/\n */g, ' ');
                const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
                const editor = this._register(this.editorPool.get(key));
                editor.object.render({
                    codeBlockIndex: this.codeBlockStartIndex,
                    element: this.context.element,
                    languageId: langId ?? 'json',
                    text: initialText,
                    renderOptions: codeBlockRenderOptions,
                    chatSessionResource: this.context.element.sessionResource
                }, this.currentWidthDelegate());
                const model = editor.object.editor.getModel();
                const markerOwner = generateUuid();
                const schemaUri = createToolSchemaUri(toolInvocation.toolId);
                const validator = new RunOnceScheduler(async () => {
                    const newMarker = [];
                    const result = await this.commandService.executeCommand('json.validate', schemaUri, model.getValue());
                    for (const item of result ?? []) {
                        if (item.range && item.message) {
                            newMarker.push({
                                severity: item.severity === 'Error' ? MarkerSeverity.Error : MarkerSeverity.Warning,
                                message: item.message,
                                startLineNumber: item.range[0].line + 1,
                                startColumn: item.range[0].character + 1,
                                endLineNumber: item.range[1].line + 1,
                                endColumn: item.range[1].character + 1,
                                code: item.code ? String(item.code) : undefined
                            });
                        }
                    }
                    this.markerService.changeOne(markerOwner, model.uri, newMarker);
                }, 500);
                validator.schedule();
                this._register(model.onDidChangeContent(() => validator.schedule()));
                this._register(toDisposable(() => this.markerService.remove(markerOwner, [model.uri])));
                this._register(validator);
                this.codeblocks.push({
                    codeBlockIndex: this.codeBlockStartIndex,
                    codemapperUri: undefined,
                    elementId: this.context.element.id,
                    focus: () => editor.object.focus(),
                    ownerMarkdownPartId: this.codeblocksPartId,
                    uri: model.uri,
                    chatSessionResource: this.context.element.sessionResource
                });
                this._register(model.onDidChangeContent(e => {
                    try {
                        inputData.rawInput = JSON.parse(model.getValue());
                    }
                    catch {
                        // ignore
                    }
                }));
                elements.editor.append(editor.object.element);
                if (canSeeMore) {
                    const seeMore = dom.h('div.see-more', [dom.h('a@link')]);
                    seeMore.link.textContent = localize('seeMore', "See more");
                    this._register(dom.addDisposableGenericMouseDownListener(seeMore.link, () => {
                        try {
                            const parsed = JSON.parse(model.getValue());
                            model.setValue(JSON.stringify(parsed, null, 2));
                            editor.object.editor.updateOptions({ tabFocusMode: false });
                            editor.object.editor.updateOptions({ wordWrap: 'on' });
                        }
                        catch {
                            // ignored
                        }
                        seeMore.root.remove();
                    }));
                    elements.editor.append(seeMore.root);
                }
            }
            const mdPart = this._makeMarkdownPart(elements.message, message, codeBlockRenderOptions);
            const messageSeeMoreObserver = this._register(new ElementSizeObserver(mdPart.domNode, undefined));
            const updateSeeMoreDisplayed = () => {
                const show = messageSeeMoreObserver.getHeight() > SHOW_MORE_MESSAGE_HEIGHT_TRIGGER;
                if (elements.messageContainer.classList.contains('can-see-more') !== show) {
                    elements.messageContainer.classList.toggle('can-see-more', show);
                }
            };
            this._register(dom.addDisposableListener(elements.showMore, 'click', () => {
                elements.messageContainer.classList.toggle('can-see-more', false);
                messageSeeMoreObserver.dispose();
            }));
            this._register(messageSeeMoreObserver.onDidChange(updateSeeMoreDisplayed));
            messageSeeMoreObserver.startObserving();
            if (disclaimer) {
                this._makeMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
            }
            else {
                elements.disclaimer.remove();
            }
            return elements.root;
        }
    }
    getTitle() {
        const state = this.toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            return '';
        }
        const title = state.confirmationMessages?.title;
        if (!title) {
            return '';
        }
        return typeof title === 'string' ? title : title.value;
    }
    _makeMarkdownPart(container, message, codeBlockRenderOptions) {
        const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, {
            kind: 'markdownContent',
            content: typeof message === 'string' ? new MarkdownString().appendMarkdown(message) : message,
        }, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, undefined, this.currentWidthDelegate(), { codeBlockRenderOptions }));
        renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store);
        container.append(part.domNode);
        return part;
    }
};
ToolConfirmationSubPart = __decorate([
    __param(6, IInstantiationService),
    __param(7, IKeybindingService),
    __param(8, ILanguageService),
    __param(9, IContextKeyService),
    __param(10, IChatWidgetService),
    __param(11, ICommandService),
    __param(12, IMarkerService),
    __param(13, ILanguageModelToolsService),
    __param(14, IChatMarkdownAnchorService),
    __param(15, ILanguageModelToolsConfirmationService)
], ToolConfirmationSubPart);
export { ToolConfirmationSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdFLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFF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