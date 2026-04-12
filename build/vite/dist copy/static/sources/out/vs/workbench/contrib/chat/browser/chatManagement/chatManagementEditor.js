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
var ModelsManagementEditor_1, ChatManagementEditor_1;
import './media/chatManagementEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { CHAT_MANAGEMENT_SECTION_USAGE, CHAT_MANAGEMENT_SECTION_MODELS } from './chatManagementEditorInput.js';
import { ChatModelsWidget } from './chatModelsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService, ChatEntitlement, getChatPlanName } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatUsageWidget } from './chatUsageWidget.js';
import { Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { Event } from '../../../../../base/common/event.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_MODELS_EDITOR } from '../../common/constants.js';
const $ = DOM.$;
let ModelsManagementEditor = class ModelsManagementEditor extends EditorPane {
    static { ModelsManagementEditor_1 = this; }
    static { this.ID = 'workbench.editor.modelsManagement'; }
    constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService) {
        super(ModelsManagementEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.editorDisposables = this._register(new DisposableStore());
        this.inModelsEditorContextKey = CONTEXT_MODELS_EDITOR.bindTo(contextKeyService);
    }
    createEditor(parent) {
        this.editorDisposables.clear();
        this.bodyContainer = DOM.append(parent, $('.ai-models-management-editor'));
        this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
        this.bodyContainer.appendChild(this.modelsWidget.element);
    }
    async setInput(input, options, context, token) {
        this.inModelsEditorContextKey.set(true);
        await super.setInput(input, options, context, token);
        if (this.dimension) {
            this.layout(this.dimension);
        }
        this.modelsWidget?.render();
    }
    layout(dimension) {
        this.dimension = dimension;
        if (this.bodyContainer) {
            this.modelsWidget?.layout(dimension.height - 15, this.bodyContainer.clientWidth - 24);
        }
    }
    focus() {
        super.focus();
        this.modelsWidget?.focusSearch();
    }
    clearInput() {
        this.inModelsEditorContextKey.set(false);
        super.clearInput();
    }
    clearSearch() {
        this.modelsWidget?.clearSearch();
    }
    search(query) {
        this.modelsWidget?.search(query);
    }
};
ModelsManagementEditor = ModelsManagementEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService)
], ModelsManagementEditor);
export { ModelsManagementEditor };
export const chatManagementSashBorder = registerColor('chatManagement.sashBorder', PANEL_BORDER, localize('chatManagementSashBorder', "The color of the Chat Management editor splitview sash border."));
function isNewUser(chatEntitlementService) {
    return !chatEntitlementService.sentiment.completed ||
        chatEntitlementService.entitlement === ChatEntitlement.Available;
}
let ChatManagementEditor = class ChatManagementEditor extends EditorPane {
    static { ChatManagementEditor_1 = this; }
    static { this.ID = 'workbench.editor.chatManagement'; }
    constructor(group, telemetryService, themeService, storageService, instantiationService, commandService, chatEntitlementService) {
        super(ChatManagementEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.selectedSection = CHAT_MANAGEMENT_SECTION_USAGE;
        this.sections = [];
        this.actionButtonClickListener = this._register(new MutableDisposable());
        this.commandService = commandService;
        this.chatEntitlementService = chatEntitlementService;
    }
    createEditor(parent) {
        this.container = DOM.append(parent, $('.ai-management-editor'));
        // Header spans across entire width
        this.renderHeader(this.container);
        // Create split view container
        const splitViewContainer = DOM.append(this.container, $('.split-view-container'));
        const sidebarView = DOM.append(splitViewContainer, $('.sidebar-view'));
        const sidebarContainer = DOM.append(sidebarView, $('.sidebar-container'));
        const contentsView = DOM.append(splitViewContainer, $('.contents-view'));
        this.contentsContainer = DOM.append(contentsView, $('.contents-container'));
        this.splitView = new SplitView(splitViewContainer, {
            orientation: 1 /* Orientation.HORIZONTAL */,
            proportionalLayout: true
        });
        this.renderSidebar(sidebarContainer);
        this.renderContents(this.contentsContainer);
        this.splitView.addView({
            onDidChange: Event.None,
            element: sidebarView,
            minimumSize: 150,
            maximumSize: 350,
            layout: (width, _, height) => {
                sidebarContainer.style.width = `${width}px`;
                if (this.sectionsList && height !== undefined) {
                    this.sectionsList.layout(height, width);
                }
            }
        }, 200, undefined, true);
        this.splitView.addView({
            onDidChange: Event.None,
            element: contentsView,
            minimumSize: 550,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                contentsView.style.width = `${width}px`;
                if (height !== undefined) {
                    this.layoutContents(width, height);
                }
            }
        }, Sizing.Distribute, undefined, true);
        this.updateStyles();
        // Update header data when quotas or entitlements change
        this.updateHeaderData();
        this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.updateHeaderData()));
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.updateHeaderData()));
    }
    updateStyles() {
        const borderColor = this.theme.getColor(chatManagementSashBorder);
        this.splitView?.style({ separatorBorder: borderColor });
    }
    renderSidebar(parent) {
        // Define sections
        this.sections = [
            { id: CHAT_MANAGEMENT_SECTION_USAGE, label: localize('plan.usage', 'Usage') },
            { id: CHAT_MANAGEMENT_SECTION_MODELS, label: localize('plan.models', 'Models') }
        ];
        const delegate = new SectionItemDelegate();
        const renderer = new SectionItemRenderer();
        this.sectionsList = this._register(this.instantiationService.createInstance((WorkbenchList), 'ChatManagementSections', parent, delegate, [renderer], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(element) {
                    return element.label;
                },
                getWidgetAriaLabel() {
                    return localize('sectionsListAriaLabel', "Sections");
                }
            },
            openOnSingleClick: true,
            identityProvider: {
                getId(element) {
                    return element.id;
                }
            }
        }));
        this.sectionsList.splice(0, this.sectionsList.length, this.sections);
        this.sectionsList.setSelection([0]);
        this._register(this.sectionsList.onDidChangeSelection(e => {
            if (e.elements.length > 0) {
                this.selectedSection = e.elements[0].id;
                this.renderSelectedSection();
            }
        }));
    }
    renderHeader(parent) {
        this.headerContainer = DOM.append(parent, $('.ai-management-header'));
        const headerTitleContainer = DOM.append(this.headerContainer, $('.header-title-container'));
        const headerTitleWrapper = DOM.append(headerTitleContainer, $('.header-title-wrapper'));
        // Copilot label
        const tile = DOM.append(headerTitleWrapper, $('.ai-management-editor-title'));
        tile.textContent = localize('plan.copilot', 'Copilot');
        // Plan badge
        this.planBadge = DOM.append(headerTitleWrapper, $('.plan-badge'));
        // Action button container in title
        const titleButtonContainer = DOM.append(headerTitleContainer, $('.header-upgrade-button-container'));
        this.actionButton = this._register(new Button(titleButtonContainer, { ...defaultButtonStyles }));
        this.actionButton.element.classList.add('header-upgrade-button');
        this.actionButton.element.style.display = 'none';
    }
    renderContents(parent) {
        // Body container for widgets
        const bodyContainer = DOM.append(parent, $('.ai-management-body'));
        // Create widgets
        this.chatUsageWidget = this._register(this.instantiationService.createInstance(ChatUsageWidget));
        this.modelsWidget = this._register(this.instantiationService.createInstance(ChatModelsWidget));
        // Append widgets to body
        bodyContainer.appendChild(this.chatUsageWidget.element);
        bodyContainer.appendChild(this.modelsWidget.element);
        // Initially show only the selected section
        this.renderSelectedSection();
    }
    renderSelectedSection() {
        // Hide all widgets
        this.chatUsageWidget.element.style.display = 'none';
        this.modelsWidget.element.style.display = 'none';
        // Show selected widget
        if (this.selectedSection === CHAT_MANAGEMENT_SECTION_USAGE) {
            this.chatUsageWidget.element.style.display = '';
        }
        else if (this.selectedSection === CHAT_MANAGEMENT_SECTION_MODELS) {
            this.modelsWidget.element.style.display = '';
        }
        // Trigger layout
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    layoutContents(width, height) {
        if (!this.contentsContainer) {
            return;
        }
        if (this.selectedSection === CHAT_MANAGEMENT_SECTION_MODELS) {
            this.modelsWidget.layout(height - 30, width - 30);
        }
    }
    selectSection(sectionId) {
        const index = this.sections.findIndex(s => s.id === sectionId);
        if (index >= 0) {
            this.sectionsList?.setFocus([index]);
            this.sectionsList?.setSelection([index]);
        }
    }
    updateHeaderData() {
        const newUser = isNewUser(this.chatEntitlementService);
        const anonymousUser = this.chatEntitlementService.anonymous;
        const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
        const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
        const isFreePlan = this.chatEntitlementService.entitlement === ChatEntitlement.Free;
        // Set plan name and toggle visibility based on plan type
        if (anonymousUser || isFreePlan) {
            if (anonymousUser) {
                // Hide badge for anonymous users, only show "Copilot" label
                this.planBadge.style.display = 'none';
            }
            else {
                // Show "Free" badge for free plan
                this.planBadge.style.display = '';
                this.planBadge.textContent = localize('plan.free', 'Free');
            }
        }
        else {
            this.planBadge.style.display = '';
            // Extract just the plan type (Pro, Pro+, Business, Enterprise)
            const planName = this.getCurrentPlanName();
            this.planBadge.textContent = planName.replace('Copilot ', '');
        }
        const shouldUpgrade = this.shouldShowUpgradeButton();
        // Configure action button
        if (newUser || signedOut || disabled || shouldUpgrade) {
            this.actionButton.element.style.display = '';
            let buttonLabel;
            let commandId;
            if (shouldUpgrade && !isFreePlan && !anonymousUser) {
                // Upgrade for paid plans
                if (this.chatEntitlementService.entitlement === ChatEntitlement.Pro) {
                    buttonLabel = localize('plan.upgradeToProPlus', 'Upgrade to Copilot Pro+');
                }
                else {
                    buttonLabel = localize('plan.upgradeToPro', 'Upgrade to Copilot Pro');
                }
                commandId = 'workbench.action.chat.upgradePlan';
            }
            else if (shouldUpgrade && (isFreePlan || anonymousUser)) {
                // Upgrade case for free plan
                buttonLabel = localize('upgradeToCopilotPro', 'Upgrade to Copilot Pro');
                commandId = 'workbench.action.chat.upgradePlan';
            }
            else if (newUser) {
                buttonLabel = localize('enableAIFeatures', "Use AI Features");
                commandId = newUser && anonymousUser ? 'workbench.action.chat.triggerSetupAnonymousWithoutDialog' : 'workbench.action.chat.triggerSetup';
            }
            else if (anonymousUser) {
                buttonLabel = localize('enableMoreAIFeatures', "Enable more AI Features");
                commandId = 'workbench.action.chat.triggerSetup';
            }
            else if (disabled) {
                buttonLabel = localize('enableCopilotButton', "Enable AI Features");
                commandId = 'workbench.action.chat.triggerSetup';
            }
            else {
                buttonLabel = localize('signInToUseAIFeatures', "Sign in to use AI Features");
                commandId = 'workbench.action.chat.triggerSetup';
            }
            this.actionButton.label = buttonLabel;
            this.actionButtonClickListener.value = this.actionButton.onDidClick(() => {
                this.commandService.executeCommand(commandId);
            });
        }
        else {
            this.actionButton.element.style.display = 'none';
        }
    }
    getCurrentPlanName() {
        return getChatPlanName(this.chatEntitlementService.entitlement);
    }
    shouldShowUpgradeButton() {
        const entitlement = this.chatEntitlementService.entitlement;
        return entitlement === ChatEntitlement.Available ||
            entitlement === ChatEntitlement.Free ||
            entitlement === ChatEntitlement.EDU ||
            entitlement === ChatEntitlement.Pro;
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    layout(dimension) {
        this.dimension = dimension;
        if (this.container && this.splitView) {
            const headerHeight = this.headerContainer?.offsetHeight || 0;
            const splitViewHeight = dimension.height - headerHeight;
            this.splitView.layout(this.container.clientWidth, splitViewHeight);
            this.splitView.el.style.height = `${splitViewHeight}px`;
        }
    }
    focus() {
        super.focus();
        this.sectionsList?.domFocus();
    }
};
ChatManagementEditor = ChatManagementEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, ICommandService),
    __param(6, IChatEntitlementService)
], ChatManagementEditor);
export { ChatManagementEditor };
class SectionItemDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId() { return 'sectionItem'; }
}
class SectionItemRenderer {
    constructor() {
        this.templateId = 'sectionItem';
    }
    renderTemplate(container) {
        container.classList.add('section-list-item');
        const label = DOM.append(container, $('.section-list-item-label'));
        return { label };
    }
    renderElement(element, index, templateData) {
        templateData.label.textContent = element.label;
    }
    disposeTemplate(templateData) {
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hbmFnZW1lbnRFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdE1hbmFnZW1lbnQvY2hhdE1hbmFnZW1lbnRFZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sa0NBQWtDLENBQUM7QUFDMUMsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUk1RSxPQUFPLEVBQTZCLDZCQUE2QixFQUFFLDhCQUE4QixFQUErQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDdkksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBZSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFdkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU1RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RixPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVsRSxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRVQsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxVQUFVOzthQUVyQyxPQUFFLEdBQVcsbUNBQW1DLEFBQTlDLENBQStDO0lBU2pFLFlBQ0MsS0FBbUIsRUFDQSxnQkFBbUMsRUFDdkMsWUFBMkIsRUFDekIsY0FBK0IsRUFDekIsb0JBQTRELEVBQy9ELGlCQUFxQztRQUV6RCxLQUFLLENBQUMsd0JBQXNCLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFIaEQseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQVpuRSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQWdCMUUsSUFBSSxDQUFDLHdCQUF3QixHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFFa0IsWUFBWSxDQUFDLE1BQW1CO1FBQ2xELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsYUFBYSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQzNHLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVRLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBa0MsRUFBRSxPQUFtQyxFQUFFLE9BQTJCLEVBQUUsS0FBd0I7UUFDckosSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckQsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0IsQ0FBQztRQUNELElBQUksQ0FBQyxZQUFZLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVRLE1BQU0sQ0FBQyxTQUFvQjtRQUNuQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEVBQUUsRUFBRSxJQUFJLENBQUMsYUFBYyxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUN4RixDQUFDO0lBQ0YsQ0FBQztJQUVRLEtBQUs7UUFDYixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFUSxVQUFVO1FBQ2xCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxXQUFXO1FBQ1YsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQWE7UUFDbkIsSUFBSSxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsQ0FBQzs7QUE5RFcsc0JBQXNCO0lBYWhDLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtHQWpCUixzQkFBc0IsQ0ErRGxDOztBQUVELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGFBQWEsQ0FBQywyQkFBMkIsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLGdFQUFnRSxDQUFDLENBQUMsQ0FBQztBQUV6TSxTQUFTLFNBQVMsQ0FBQyxzQkFBK0M7SUFDakUsT0FBTyxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxTQUFTO1FBQ2pELHNCQUFzQixDQUFDLFdBQVcsS0FBSyxlQUFlLENBQUMsU0FBUyxDQUFDO0FBQ25FLENBQUM7QUFPTSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7O2FBRW5DLE9BQUUsR0FBVyxpQ0FBaUMsQUFBNUMsQ0FBNkM7SUFzQi9ELFlBQ0MsS0FBbUIsRUFDQSxnQkFBbUMsRUFDdkMsWUFBMkIsRUFDekIsY0FBK0IsRUFDekIsb0JBQTRELEVBQ2xFLGNBQStCLEVBQ3ZCLHNCQUErQztRQUV4RSxLQUFLLENBQUMsc0JBQW9CLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFKOUMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQVo1RSxvQkFBZSxHQUFXLDZCQUE2QixDQUFDO1FBQ3hELGFBQVEsR0FBa0IsRUFBRSxDQUFDO1FBSXBCLDhCQUF5QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFZcEYsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLHNCQUFzQixHQUFHLHNCQUFzQixDQUFDO0lBQ3RELENBQUM7SUFFa0IsWUFBWSxDQUFDLE1BQW1CO1FBQ2xELElBQUksQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUVoRSxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEMsOEJBQThCO1FBQzlCLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFFbEYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN2RSxNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFMUUsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBRTVFLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxTQUFTLENBQUMsa0JBQWtCLEVBQUU7WUFDbEQsV0FBVyxnQ0FBd0I7WUFDbkMsa0JBQWtCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUN0QixXQUFXLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDdkIsT0FBTyxFQUFFLFdBQVc7WUFDcEIsV0FBVyxFQUFFLEdBQUc7WUFDaEIsV0FBVyxFQUFFLEdBQUc7WUFDaEIsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDNUIsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLEtBQUssSUFBSSxDQUFDO2dCQUM1QyxJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUMvQyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3pDLENBQUM7WUFDRixDQUFDO1NBQ0QsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXpCLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO1lBQ3RCLFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSTtZQUN2QixPQUFPLEVBQUUsWUFBWTtZQUNyQixXQUFXLEVBQUUsR0FBRztZQUNoQixXQUFXLEVBQUUsTUFBTSxDQUFDLGlCQUFpQjtZQUNyQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM1QixZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLEtBQUssSUFBSSxDQUFDO2dCQUN4QyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDMUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3BDLENBQUM7WUFDRixDQUFDO1NBQ0QsRUFBRSxNQUFNLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUV2QyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFcEIsd0RBQXdEO1FBQ3hELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLHlCQUF5QixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUVRLFlBQVk7UUFDcEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUUsQ0FBQztRQUNuRSxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFTyxhQUFhLENBQUMsTUFBbUI7UUFDeEMsa0JBQWtCO1FBQ2xCLElBQUksQ0FBQyxRQUFRLEdBQUc7WUFDZixFQUFFLEVBQUUsRUFBRSw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsRUFBRTtZQUM3RSxFQUFFLEVBQUUsRUFBRSw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRTtTQUNoRixDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1FBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUUzQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDMUUsQ0FBQSxhQUEwQixDQUFBLEVBQzFCLHdCQUF3QixFQUN4QixNQUFNLEVBQ04sUUFBUSxFQUNSLENBQUMsUUFBUSxDQUFDLEVBQ1Y7WUFDQyx3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixxQkFBcUIsRUFBRTtnQkFDdEIsWUFBWSxDQUFDLE9BQW9CO29CQUNoQyxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUM7Z0JBQ3RCLENBQUM7Z0JBQ0Qsa0JBQWtCO29CQUNqQixPQUFPLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxVQUFVLENBQUMsQ0FBQztnQkFDdEQsQ0FBQzthQUNEO1lBQ0QsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixnQkFBZ0IsRUFBRTtnQkFDakIsS0FBSyxDQUFDLE9BQW9CO29CQUN6QixPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ25CLENBQUM7YUFDRDtTQUNELENBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3pELElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLFlBQVksQ0FBQyxNQUFtQjtRQUN2QyxJQUFJLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDdEUsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUM1RixNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUV4RixnQkFBZ0I7UUFDaEIsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUV2RCxhQUFhO1FBQ2IsSUFBSSxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBRWxFLG1DQUFtQztRQUNuQyxNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztRQUNyRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxNQUFNLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxHQUFHLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztJQUNsRCxDQUFDO0lBRU8sY0FBYyxDQUFDLE1BQW1CO1FBQ3pDLDZCQUE2QjtRQUM3QixNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBRW5FLGlCQUFpQjtRQUNqQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUUvRix5QkFBeUI7UUFDekIsYUFBYSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVyRCwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVPLHFCQUFxQjtRQUM1QixtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDcEQsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFFakQsdUJBQXVCO1FBQ3ZCLElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyw2QkFBNkIsRUFBRSxDQUFDO1lBQzVELElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2pELENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssOEJBQThCLEVBQUUsQ0FBQztZQUNwRSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUM5QyxDQUFDO1FBRUQsaUJBQWlCO1FBQ2pCLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRU8sY0FBYyxDQUFDLEtBQWEsRUFBRSxNQUFjO1FBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyw4QkFBOEIsRUFBRSxDQUFDO1lBQzdELElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxFQUFFLEVBQUUsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ25ELENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLFNBQWlCO1FBQzlCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxTQUFTLENBQUMsQ0FBQztRQUMvRCxJQUFJLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDckMsSUFBSSxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDRixDQUFDO0lBRU8sZ0JBQWdCO1FBQ3ZCLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN2RCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDO1FBQ25ILE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLEtBQUssZUFBZSxDQUFDLE9BQU8sQ0FBQztRQUN0RixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxLQUFLLGVBQWUsQ0FBQyxJQUFJLENBQUM7UUFFcEYseURBQXlEO1FBQ3pELElBQUksYUFBYSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2pDLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25CLDREQUE0RDtnQkFDNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztZQUN2QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asa0NBQWtDO2dCQUNsQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzVELENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDbEMsK0RBQStEO1lBQy9ELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzNDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUVyRCwwQkFBMEI7UUFDMUIsSUFBSSxPQUFPLElBQUksU0FBUyxJQUFJLFFBQVEsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUN2RCxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUU3QyxJQUFJLFdBQW1CLENBQUM7WUFDeEIsSUFBSSxTQUFpQixDQUFDO1lBRXRCLElBQUksYUFBYSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3BELHlCQUF5QjtnQkFDekIsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxLQUFLLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztvQkFDckUsV0FBVyxHQUFHLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsV0FBVyxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO2dCQUN2RSxDQUFDO2dCQUNELFNBQVMsR0FBRyxtQ0FBbUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLElBQUksYUFBYSxJQUFJLENBQUMsVUFBVSxJQUFJLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQzNELDZCQUE2QjtnQkFDN0IsV0FBVyxHQUFHLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO2dCQUN4RSxTQUFTLEdBQUcsbUNBQW1DLENBQUM7WUFDakQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNwQixXQUFXLEdBQUcsUUFBUSxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixDQUFDLENBQUM7Z0JBQzlELFNBQVMsR0FBRyxPQUFPLElBQUksYUFBYSxDQUFDLENBQUMsQ0FBQywwREFBMEQsQ0FBQyxDQUFDLENBQUMsb0NBQW9DLENBQUM7WUFDMUksQ0FBQztpQkFBTSxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUMxQixXQUFXLEdBQUcsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHlCQUF5QixDQUFDLENBQUM7Z0JBQzFFLFNBQVMsR0FBRyxvQ0FBb0MsQ0FBQztZQUNsRCxDQUFDO2lCQUFNLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ3JCLFdBQVcsR0FBRyxRQUFRLENBQUMscUJBQXFCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztnQkFDcEUsU0FBUyxHQUFHLG9DQUFvQyxDQUFDO1lBQ2xELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxXQUFXLEdBQUcsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDRCQUE0QixDQUFDLENBQUM7Z0JBQzlFLFNBQVMsR0FBRyxvQ0FBb0MsQ0FBQztZQUNsRCxDQUFDO1lBRUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1lBQ3RDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUN4RSxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMvQyxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7SUFFTyxrQkFBa0I7UUFDekIsT0FBTyxlQUFlLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFTyx1QkFBdUI7UUFDOUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsQ0FBQztRQUM1RCxPQUFPLFdBQVcsS0FBSyxlQUFlLENBQUMsU0FBUztZQUMvQyxXQUFXLEtBQUssZUFBZSxDQUFDLElBQUk7WUFDcEMsV0FBVyxLQUFLLGVBQWUsQ0FBQyxHQUFHO1lBQ25DLFdBQVcsS0FBSyxlQUFlLENBQUMsR0FBRyxDQUFDO0lBQ3RDLENBQUM7SUFFUSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQWdDLEVBQUUsT0FBbUMsRUFBRSxPQUEyQixFQUFFLEtBQXdCO1FBQ25KLE1BQU0sS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyRCxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVRLE1BQU0sQ0FBQyxTQUFvQjtRQUNuQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUUzQixJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsWUFBWSxJQUFJLENBQUMsQ0FBQztZQUM3RCxNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQztZQUN4RCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNuRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsZUFBZSxJQUFJLENBQUM7UUFDekQsQ0FBQztJQUNGLENBQUM7SUFFUSxLQUFLO1FBQ2IsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2QsSUFBSSxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUMvQixDQUFDOztBQWpVVyxvQkFBb0I7SUEwQjlCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHVCQUF1QixDQUFBO0dBL0JiLG9CQUFvQixDQWtVaEM7O0FBRUQsTUFBTSxtQkFBbUI7SUFDeEIsU0FBUyxDQUFDLE9BQW9CO1FBQzdCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELGFBQWEsS0FBSyxPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUM7Q0FDekM7QUFNRCxNQUFNLG1CQUFtQjtJQUF6QjtRQUNVLGVBQVUsR0FBRyxhQUFhLENBQUM7SUFjckMsQ0FBQztJQVpBLGNBQWMsQ0FBQyxTQUFzQjtRQUNwQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzdDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDbkUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBb0IsRUFBRSxLQUFhLEVBQUUsWUFBc0M7UUFDeEYsWUFBWSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUNoRCxDQUFDO0lBRUQsZUFBZSxDQUFDLFlBQXNDO0lBQ3RELENBQUM7Q0FDRCJ9