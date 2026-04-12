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
var ChatEditor_1;
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { raceCancellationError } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import * as nls from '../../../../../../nls.js';
import { ITextResourceConfigurationService } from '../../../../../../editor/common/services/textResourceConfiguration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { AbstractEditorWithViewState } from '../../../../../browser/parts/editor/editorWithViewState.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../../common/theme.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { clearChatEditor } from '../../actions/chatClear.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { ChatWidget } from '../../widget/chatWidget.js';
let ChatEditor = class ChatEditor extends AbstractEditorWithViewState {
    static { ChatEditor_1 = this; }
    static { this.VIEW_STATE_KEY = 'chatEditorViewState'; }
    get widget() {
        return this._widget;
    }
    get scopedContextKeyService() {
        return this._scopedContextKeyService;
    }
    constructor(group, telemetryService, themeService, instantiationService, storageService, chatSessionsService, contextKeyService, chatService, textResourceConfigurationService, editorService, editorGroupService) {
        super(ChatEditorInput.EditorID, group, ChatEditor_1.VIEW_STATE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);
        this.chatSessionsService = chatSessionsService;
        this.contextKeyService = contextKeyService;
        this.chatService = chatService;
        this.dimension = new dom.Dimension(0, 0);
    }
    async clear() {
        if (this.input) {
            return this.instantiationService.invokeFunction(clearChatEditor, this.input);
        }
    }
    createEditor(parent) {
        this._editorContainer = parent;
        // Ensure the container has position relative for the loading overlay
        parent.classList.add('chat-editor-relative');
        this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        ChatContextKeys.inChatEditor.bindTo(this._scopedContextKeyService).set(true);
        this._widget = this._register(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, undefined, {
            autoScroll: mode => mode !== ChatModeKind.Ask,
            renderFollowups: true,
            supportsFileReferences: true,
            clear: () => this.clear(),
            rendererOptions: {
                renderTextEditsAsSummary: (uri) => {
                    return true;
                },
                referencesExpandedWhenEmptyResponse: false,
                progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
            },
            enableImplicitContext: true,
            enableWorkingSet: 'explicit',
            supportsChangingModes: true,
        }, {
            listForeground: editorForeground,
            listBackground: editorBackground,
            overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
            inputEditorBackground: inputBackground,
            resultEditorBackground: editorBackground
        }));
        this._register(this.widget.onDidSubmitAgent(() => {
            this.group.pinEditor(this.input);
        }));
        this.widget.render(parent);
        this.widget.setVisible(true);
    }
    setEditorVisible(visible) {
        super.setEditorVisible(visible);
        this.widget?.setVisible(visible);
        if (visible && this.widget) {
            this.widget.layout(this.dimension.height, this.dimension.width);
        }
    }
    focus() {
        super.focus();
        this.widget?.focusInput();
    }
    clearInput() {
        this.widget.setModel(undefined);
        super.clearInput();
    }
    showLoadingInChatWidget(message) {
        if (!this._editorContainer) {
            return;
        }
        // If already showing, just update text
        if (this._loadingContainer) {
            // eslint-disable-next-line no-restricted-syntax
            const existingText = this._loadingContainer.querySelector('.chat-loading-content span');
            if (existingText) {
                existingText.textContent = message;
                return; // aria-live will announce the text change
            }
            this.hideLoadingInChatWidget(); // unexpected structure
        }
        // Mark container busy for assistive technologies
        this._editorContainer.setAttribute('aria-busy', 'true');
        this._loadingContainer = dom.append(this._editorContainer, dom.$('.chat-loading-overlay'));
        // Accessibility: announce loading state politely without stealing focus
        this._loadingContainer.setAttribute('role', 'status');
        this._loadingContainer.setAttribute('aria-live', 'polite');
        // Rely on live region text content instead of aria-label to avoid duplicate announcements
        this._loadingContainer.tabIndex = -1; // ensure it isn't focusable
        const loadingContent = dom.append(this._loadingContainer, dom.$('.chat-loading-content'));
        const spinner = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
        spinner.setAttribute('aria-hidden', 'true');
        loadingContent.appendChild(spinner);
        const text = dom.append(loadingContent, dom.$('span'));
        text.textContent = message;
    }
    hideLoadingInChatWidget() {
        if (this._loadingContainer) {
            this._loadingContainer.remove();
            this._loadingContainer = undefined;
        }
        if (this._editorContainer) {
            this._editorContainer.removeAttribute('aria-busy');
        }
    }
    async setInput(input, options, context, token) {
        // Show loading indicator early for non-local sessions to prevent layout shifts
        let isContributedChatSession = false;
        const chatSessionType = input.getSessionType();
        if (chatSessionType !== localChatSessionType) {
            const loadingMessage = nls.localize('chatEditor.loadingSession', "Loading...");
            this.showLoadingInChatWidget(loadingMessage);
        }
        await super.setInput(input, options, context, token);
        if (token.isCancellationRequested) {
            this.hideLoadingInChatWidget();
            return;
        }
        if (!this.widget) {
            throw new Error('ChatEditor lifecycle issue: no editor widget');
        }
        if (chatSessionType !== localChatSessionType) {
            try {
                await raceCancellationError(this.chatSessionsService.canResolveChatSession(input.resource.scheme), token);
                const contributions = this.chatSessionsService.getAllChatSessionContributions();
                const contribution = contributions.find(c => c.type === chatSessionType);
                if (contribution) {
                    this.widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
                    isContributedChatSession = true;
                }
                else {
                    this.widget.unlockFromCodingAgent();
                }
            }
            catch (error) {
                this.hideLoadingInChatWidget();
                throw error;
            }
        }
        else {
            this.widget.unlockFromCodingAgent();
        }
        try {
            const editorModel = await raceCancellationError(input.resolve(), token);
            if (!editorModel) {
                throw new Error(`Failed to get model for chat editor. resource: ${input.sessionResource}`);
            }
            // Hide loading state before updating model
            if (chatSessionType !== localChatSessionType) {
                this.hideLoadingInChatWidget();
            }
            if (options?.modelInputState) {
                editorModel.model.inputModel.setState(options.modelInputState);
            }
            this.updateModel(editorModel.model);
            const viewState = this.loadEditorViewState(input, context);
            if (viewState) {
                this._widget.scrollTop = viewState.scrollTop;
            }
            if (isContributedChatSession && options?.title?.preferred && input.sessionResource) {
                this.chatService.setChatSessionTitle(input.sessionResource, options.title.preferred);
            }
        }
        catch (error) {
            this.hideLoadingInChatWidget();
            throw error;
        }
    }
    updateModel(model) {
        this.widget.setModel(model);
    }
    computeEditorViewState(_resource) {
        if (!this._widget) {
            return undefined;
        }
        return { scrollTop: this._widget.scrollTop };
    }
    tracksEditorViewState(input) {
        return input instanceof ChatEditorInput;
    }
    toEditorViewStateResource(input) {
        return input.sessionResource;
    }
    layout(dimension, position) {
        this.dimension = dimension;
        if (this.widget) {
            this.widget.layout(dimension.height, dimension.width);
        }
    }
};
ChatEditor = ChatEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IInstantiationService),
    __param(4, IStorageService),
    __param(5, IChatSessionsService),
    __param(6, IContextKeyService),
    __param(7, IChatService),
    __param(8, ITextResourceConfigurationService),
    __param(9, IEditorService),
    __param(10, IEditorGroupsService)
], ChatEditor);
export { ChatEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RSxPQUFPLEtBQUssR0FBRyxNQUFNLDBCQUEwQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQzFILE9BQU8sRUFBRSxrQkFBa0IsRUFBNEIsTUFBTSw0REFBNEQsQ0FBQztBQUUxSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUd6RyxP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