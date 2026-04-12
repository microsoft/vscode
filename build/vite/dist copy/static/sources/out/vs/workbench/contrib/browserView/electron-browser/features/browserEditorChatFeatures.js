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
import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { createElementContextValue } from '../../../../../platform/browserElements/common/browserElements.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_FOCUSED } from '../browserEditor.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { BrowserActionCategory } from '../browserViewActions.js';
// Register tools
import '../tools/browserTools.contribution.js';
// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);
const BrowserCategory = localize2('browserCategory', "Browser");
const CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE = new RawContextKey('browserElementSelectionActive', false, localize('browser.elementSelectionActive', "Whether element selection is currently active"));
const canShareBrowserWithAgentContext = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`), ContextKeyExpr.has(`config.workbench.browser.enableChatTools`));
/**
 * Contribution that manages element selection, element attachment to chat,
 * console log attachment to chat, and agent sharing.
 */
let BrowserEditorChatIntegration = class BrowserEditorChatIntegration extends BrowserEditorContribution {
    constructor(editor, contextKeyService, instantiationService, telemetryService, logService, chatWidgetService, configurationService) {
        super(editor);
        this.contextKeyService = contextKeyService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.chatWidgetService = chatWidgetService;
        this.configurationService = configurationService;
        this._elementSelectionActiveContext = CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE.bindTo(contextKeyService);
        // Build share toggle button
        const hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', undefined, { position: { hoverPosition: 3 /* HoverPosition.ABOVE */ } }));
        this._shareButtonContainer = $('.browser-share-toggle-container');
        this._shareButton = this._register(new Button(this._shareButtonContainer, {
            supportIcons: true,
            title: localize('browser.shareWithAgent', "Share with Agent"),
            small: true,
            hoverDelegate
        }));
        this._shareButton.element.classList.add('browser-share-toggle');
        this._shareButton.label = '$(agent)';
        this._register(this._shareButton.onDidClick(() => {
            this._toggleShareWithAgent();
        }));
        // Show share button only when chat is enabled and browser tools are enabled
        const updateShareButtonVisibility = () => {
            this._shareButtonContainer.style.display = contextKeyService.contextMatchesRules(canShareBrowserWithAgentContext) ? '' : 'none';
        };
        updateShareButtonVisibility();
        const agentSharingKeys = new Set(canShareBrowserWithAgentContext.keys());
        this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(agentSharingKeys))(() => {
            updateShareButtonVisibility();
        }));
    }
    get urlBarWidgets() {
        return [{ element: this._shareButtonContainer, order: 100 }];
    }
    subscribeToModel(model, store) {
        // Manage sharing state
        this._updateSharingState(true);
        store.add(model.onDidChangeSharedWithAgent(() => {
            this._updateSharingState(false);
        }));
        store.add(Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set(canShareBrowserWithAgentContext.keys())))(() => {
            this._updateSharingState(false);
        }));
    }
    clear() {
        if (this._elementSelectionCts) {
            this._elementSelectionCts.dispose(true);
            this._elementSelectionCts = undefined;
        }
        this._elementSelectionActiveContext.reset();
    }
    // -- Sharing -------------------------------------------------------
    _toggleShareWithAgent() {
        const model = this.editor.model;
        if (!model) {
            return;
        }
        model.setSharedWithAgent(!model.sharedWithAgent);
    }
    _updateSharingState(isInitialState) {
        const model = this.editor.model;
        const sharingEnabled = this.contextKeyService.contextMatchesRules(canShareBrowserWithAgentContext);
        const isShared = sharingEnabled && !!model && model.sharedWithAgent;
        this.editor.browserContainer.classList.toggle('animate', !isInitialState);
        this.editor.browserContainer.classList.toggle('shared', isShared);
        this._shareButton.checked = isShared;
        this._shareButton.label = isShared
            ? localize('browser.sharingWithAgent', "Sharing with Agent") + ' $(agent)'
            : '$(agent)';
        this._shareButton.setTitle(isShared
            ? localize('browser.unshareWithAgent', "Stop Sharing with Agent")
            : localize('browser.shareWithAgent', "Share with Agent"));
    }
    // -- Element Selection ----------------------------------------------
    /**
     * Start element selection in the browser view, wait for a user selection, and add it to chat.
     */
    async addElementToChat() {
        // If selection is already active, cancel it
        if (this._elementSelectionCts) {
            this._elementSelectionCts.dispose(true);
            this._elementSelectionCts = undefined;
            this._elementSelectionActiveContext.set(false);
            return;
        }
        // Start new selection
        const cts = new CancellationTokenSource();
        this._elementSelectionCts = cts;
        this._elementSelectionActiveContext.set(true);
        this.telemetryService.publicLog2('integratedBrowser.addElementToChat.start', {});
        try {
            const model = this.editor.model;
            if (!model) {
                throw new Error('No browser view model found');
            }
            // Make the browser the focused view
            this.editor.ensureBrowserFocus();
            // Get element data from user selection
            const elementData = await model.getElementData(cts.token);
            if (!elementData) {
                throw new Error('Element data not found');
            }
            const { attachCss, attachImages } = await this._attachElementDataToChat(elementData);
            this.telemetryService.publicLog2('integratedBrowser.addElementToChat.added', {
                attachCss,
                attachImages
            });
        }
        catch (error) {
            if (!cts.token.isCancellationRequested) {
                this.logService.error('BrowserEditor.addElementToChat: Failed to select element', error);
            }
        }
        finally {
            cts.dispose(true);
            if (this._elementSelectionCts === cts) {
                this._elementSelectionCts = undefined;
                this._elementSelectionActiveContext.set(false);
            }
        }
    }
    /**
     * Accept the currently focused element during element selection and attach it to chat.
     */
    async addFocusedElementToChat() {
        if (!this._elementSelectionCts) {
            return;
        }
        const cts = this._elementSelectionCts;
        const model = this.editor.model;
        if (!model) {
            return;
        }
        const elementData = await model.getFocusedElementData();
        if (!elementData) {
            return;
        }
        await this._attachElementDataToChat(elementData);
        cts.dispose(true);
        if (this._elementSelectionCts === cts) {
            this._elementSelectionCts = undefined;
            this._elementSelectionActiveContext.set(false);
        }
    }
    async _attachElementDataToChat(elementData) {
        const bounds = elementData.bounds;
        const toAttach = [];
        const container = document.createElement('div');
        safeSetInnerHtml(container, elementData.outerHTML);
        const element = container.firstElementChild;
        const innerText = container.textContent;
        let displayNameShort = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}` : '';
        let displayNameFull = element ? `${displayNameShort}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}` : '';
        if (elementData.ancestors && elementData.ancestors.length > 0) {
            let last = elementData.ancestors[elementData.ancestors.length - 1];
            let pseudo = '';
            if (last.tagName.startsWith('::') && elementData.ancestors.length > 1) {
                pseudo = last.tagName;
                last = elementData.ancestors[elementData.ancestors.length - 2];
            }
            displayNameShort = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${pseudo}`;
            displayNameFull = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${last.classNames && last.classNames.length ? `.${last.classNames.join('.')}` : ''}${pseudo}`;
        }
        const attachCss = this.configurationService.getValue('chat.sendElementsToChat.attachCSS');
        const value = createElementContextValue(elementData, displayNameFull, attachCss);
        toAttach.push({
            id: 'element-' + Date.now(),
            name: displayNameShort,
            fullName: displayNameFull,
            value: value,
            modelDescription: attachCss
                ? 'Structured browser element context with HTML path, attributes, and computed styles.'
                : 'Structured browser element context with HTML path and attributes.',
            kind: 'element',
            icon: ThemeIcon.fromId(Codicon.layout.id),
            ancestors: elementData.ancestors,
            attributes: elementData.attributes,
            computedStyles: attachCss ? elementData.computedStyles : undefined,
            dimensions: elementData.dimensions,
            innerText,
        });
        const attachImages = this.configurationService.getValue('chat.sendElementsToChat.attachImages');
        const model = this.editor.model;
        if (attachImages && model) {
            const screenshotBuffer = await model.captureScreenshot({
                quality: 90,
                pageRect: bounds
            });
            toAttach.push({
                id: 'element-screenshot-' + Date.now(),
                name: 'Element Screenshot',
                fullName: 'Element Screenshot',
                kind: 'image',
                value: screenshotBuffer.buffer
            });
        }
        const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
        widget?.attachmentModel?.addContext(...toAttach);
        return { attachCss, attachImages };
    }
    // -- Console Logs ---------------------------------------------------
    /**
     * Grab the current console logs from the active console session and attach them to chat.
     */
    async addConsoleLogsToChat() {
        const model = this.editor.model;
        if (!model) {
            return;
        }
        try {
            const logs = await model.getConsoleLogs();
            if (!logs) {
                return;
            }
            const toAttach = [];
            toAttach.push({
                id: 'console-logs-' + Date.now(),
                name: localize('consoleLogs', 'Console Logs'),
                fullName: localize('consoleLogs', 'Console Logs'),
                value: logs,
                modelDescription: 'Console logs captured from Integrated Browser.',
                kind: 'element',
                icon: ThemeIcon.fromId(Codicon.terminal.id),
            });
            const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
            widget?.attachmentModel?.addContext(...toAttach);
        }
        catch (error) {
            this.logService.error('BrowserEditor.addConsoleLogsToChat: Failed to get console logs', error);
        }
    }
};
BrowserEditorChatIntegration = __decorate([
    __param(1, IContextKeyService),
    __param(2, IInstantiationService),
    __param(3, ITelemetryService),
    __param(4, ILogService),
    __param(5, IChatWidgetService),
    __param(6, IConfigurationService)
], BrowserEditorChatIntegration);
export { BrowserEditorChatIntegration };
// Register the contribution
BrowserEditor.registerContribution(BrowserEditorChatIntegration);
// -- Actions ------------------------------------------------------------
class AddElementToChatAction extends Action2 {
    static { this.ID = BrowserViewCommandId.AddElementToChat; }
    constructor() {
        const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
        super({
            id: AddElementToChatAction.ID,
            title: localize2('browser.addElementToChatAction', 'Add Element to Chat'),
            category: BrowserCategory,
            icon: Codicon.inspect,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
            toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: 'actions',
                order: 1,
                when: enabled
            },
            keybinding: [{
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // Priority over terminal
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */,
                }, {
                    when: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    primary: 9 /* KeyCode.Escape */
                }]
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorChatIntegration)?.addElementToChat();
        }
    }
}
class AddConsoleLogsToChatAction extends Action2 {
    static { this.ID = BrowserViewCommandId.AddConsoleLogsToChat; }
    constructor() {
        const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
        super({
            id: AddConsoleLogsToChatAction.ID,
            title: localize2('browser.addConsoleLogsToChatAction', 'Add Console Logs to Chat'),
            category: BrowserActionCategory,
            icon: Codicon.output,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: 'actions',
                order: 2,
                when: enabled
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorChatIntegration)?.addConsoleLogsToChat();
        }
    }
}
class AddFocusedElementToChatAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.browser.addFocusedElementToChat',
            title: localize2('browser.addFocusedElementToChat', 'Add Focused Element to Chat'),
            category: BrowserActionCategory,
            f1: false,
            precondition: CONTEXT_BROWSER_FOCUSED,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                when: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE
            }
        });
    }
    async run(accessor) {
        const browserEditor = accessor.get(IEditorService).activeEditorPane;
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorChatIntegration)?.addFocusedElementToChat();
        }
    }
}
registerAction2(AddElementToChatAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(AddFocusedElementToChatAction);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
        'workbench.browser.enableChatTools': {
            type: 'boolean',
            default: false,
            experiment: { mode: 'startup' },
            tags: ['experimental'],
            markdownDescription: localize({ comment: ['This is the description for a setting.'], key: 'browser.enableChatTools' }, 'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.'),
            policy: {
                name: 'BrowserChatTools',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.110',
                value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
                localization: {
                    description: {
                        key: 'browser.enableChatTools',
                        value: localize('browser.enableChatTools', 'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.')
                    }
                },
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVkaXRvckNoYXRGZWF0dXJlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvZmVhdHVyZXMvYnJvd3NlckVkaXRvckNoYXRGZWF0dXJlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQWUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JHLE9BQU8sRUFBb0IscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUd4SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRW5FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQWdCLHlCQUF5QixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDNUgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFakcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXhGLE9BQU8sRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQW9DLHlCQUF5QixFQUFFLHVCQUF1QixFQUFFLHVCQUF1QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDOUwsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUN0SixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRWpFLGlCQUFpQjtBQUNqQixPQUFPLHVDQUF1QyxDQUFDO0FBRS9DLDhEQUE4RDtBQUM5RCxNQUFNLHFCQUFxQixHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2xHLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUVoRSxNQUFNLHdDQUF3QyxHQUFHLElBQUksYUFBYSxDQUFVLCtCQUErQixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsK0NBQStDLENBQUMsQ0FBQyxDQUFDO0FBRWpOLE1BQU0sK0JBQStCLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FDekQsZUFBZSxDQUFDLE9BQU8sRUFDdkIsY0FBYyxDQUFDLEdBQUcsQ0FBQyxVQUFVLGlCQUFpQixDQUFDLFlBQVksRUFBRSxDQUFDLEVBQzlELGNBQWMsQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FDN0QsQ0FBQztBQUdIOzs7R0FHRztBQUNJLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEseUJBQXlCO0lBUTFFLFlBQ0MsTUFBcUIsRUFDZ0IsaUJBQXFDLEVBQ25ELG9CQUEyQyxFQUM5QixnQkFBbUMsRUFDekMsVUFBdUIsRUFDaEIsaUJBQXFDLEVBQ2xDLG9CQUEyQztRQUVuRixLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFQdUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUV0QyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ3pDLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDaEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNsQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBR25GLElBQUksQ0FBQyw4QkFBOEIsR0FBRyx3Q0FBd0MsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUV6Ryw0QkFBNEI7UUFDNUIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQ3ZFLHNCQUFzQixFQUN0QixTQUFTLEVBQ1QsU0FBUyxFQUNULEVBQUUsUUFBUSxFQUFFLEVBQUUsYUFBYSw2QkFBcUIsRUFBRSxFQUFFLENBQ3BELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFO1lBQ3pFLFlBQVksRUFBRSxJQUFJO1lBQ2xCLEtBQUssRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsa0JBQWtCLENBQUM7WUFDN0QsS0FBSyxFQUFFLElBQUk7WUFDWCxhQUFhO1NBQ2IsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDaEUsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDO1FBRXJDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2hELElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSiw0RUFBNEU7UUFDNUUsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLEVBQUU7WUFDeEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsaUJBQWlCLENBQUMsbUJBQW1CLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDakksQ0FBQyxDQUFDO1FBQ0YsMkJBQTJCLEVBQUUsQ0FBQztRQUM5QixNQUFNLGdCQUFnQixHQUFHLElBQUksR0FBRyxDQUFDLCtCQUErQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQzVHLDJCQUEyQixFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxJQUFhLGFBQWE7UUFDekIsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRWtCLGdCQUFnQixDQUFDLEtBQXdCLEVBQUUsS0FBc0I7UUFDbkYsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLEVBQUU7WUFDL0MsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7WUFDM0ksSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRVEsS0FBSztRQUNiLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsU0FBUyxDQUFDO1FBQ3ZDLENBQUM7UUFDRCxJQUFJLENBQUMsOEJBQThCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUVELHFFQUFxRTtJQUU3RCxxQkFBcUI7UUFDNUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFDRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVPLG1CQUFtQixDQUFDLGNBQXVCO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2hDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxtQkFBbUIsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sUUFBUSxHQUFHLGNBQWMsSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFFcEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFbEUsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxHQUFHLFFBQVE7WUFDakMsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxvQkFBb0IsQ0FBQyxHQUFHLFdBQVc7WUFDMUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNkLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVE7WUFDbEMsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx5QkFBeUIsQ0FBQztZQUNqRSxDQUFDLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRUQsc0VBQXNFO0lBRXRFOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGdCQUFnQjtRQUNyQiw0Q0FBNEM7UUFDNUMsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMvQixJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxTQUFTLENBQUM7WUFDdEMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQyxPQUFPO1FBQ1IsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixNQUFNLEdBQUcsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztRQUNoQyxJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBUzlDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQW9HLDBDQUEwQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXBMLElBQUksQ0FBQztZQUNKLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUVELG9DQUFvQztZQUNwQyxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFFakMsdUNBQXVDO1lBQ3ZDLE1BQU0sV0FBVyxHQUFHLE1BQU0sS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUVELE1BQU0sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFjckYsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBb0csMENBQTBDLEVBQUU7Z0JBQy9LLFNBQVM7Z0JBQ1QsWUFBWTthQUNaLENBQUMsQ0FBQztRQUVKLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ3hDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDBEQUEwRCxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFGLENBQUM7UUFDRixDQUFDO2dCQUFTLENBQUM7WUFDVixHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLElBQUksSUFBSSxDQUFDLG9CQUFvQixLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUN2QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsU0FBUyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHVCQUF1QjtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUM7UUFDdEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxNQUFNLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3hELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEIsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztZQUN0QyxJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLHdCQUF3QixDQUFDLFdBQXlCO1FBQy9ELE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQWdDLEVBQUUsQ0FBQztRQUVqRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELGdCQUFnQixDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLGlCQUFpQixDQUFDO1FBQzVDLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUM7UUFFeEMsSUFBSSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUM5RyxJQUFJLGVBQWUsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNwSSxJQUFJLFdBQVcsQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDL0QsSUFBSSxJQUFJLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNuRSxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7WUFDaEIsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdkUsTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7Z0JBQ3RCLElBQUksR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7WUFDRCxnQkFBZ0IsR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQztZQUMzRixlQUFlLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDOUssQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsbUNBQW1DLENBQUMsQ0FBQztRQUNuRyxNQUFNLEtBQUssR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWpGLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDYixFQUFFLEVBQUUsVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDM0IsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QixRQUFRLEVBQUUsZUFBZTtZQUN6QixLQUFLLEVBQUUsS0FBSztZQUNaLGdCQUFnQixFQUFFLFNBQVM7Z0JBQzFCLENBQUMsQ0FBQyxxRkFBcUY7Z0JBQ3ZGLENBQUMsQ0FBQyxtRUFBbUU7WUFDdEUsSUFBSSxFQUFFLFNBQVM7WUFDZixJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN6QyxTQUFTLEVBQUUsV0FBVyxDQUFDLFNBQVM7WUFDaEMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxVQUFVO1lBQ2xDLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDbEUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxVQUFVO1lBQ2xDLFNBQVM7U0FDVCxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLHNDQUFzQyxDQUFDLENBQUM7UUFDekcsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDaEMsSUFBSSxZQUFZLElBQUksS0FBSyxFQUFFLENBQUM7WUFDM0IsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztnQkFDdEQsT0FBTyxFQUFFLEVBQUU7Z0JBQ1gsUUFBUSxFQUFFLE1BQU07YUFDaEIsQ0FBQyxDQUFDO1lBRUgsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDYixFQUFFLEVBQUUscUJBQXFCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDdEMsSUFBSSxFQUFFLG9CQUFvQjtnQkFDMUIsUUFBUSxFQUFFLG9CQUFvQjtnQkFDOUIsSUFBSSxFQUFFLE9BQU87Z0JBQ2IsS0FBSyxFQUFFLGdCQUFnQixDQUFDLE1BQU07YUFDOUIsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksRUFBRSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQztRQUN2RyxNQUFNLEVBQUUsZUFBZSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO1FBRWpELE9BQU8sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELHNFQUFzRTtJQUV0RTs7T0FFRztJQUNILEtBQUssQ0FBQyxvQkFBb0I7UUFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLElBQUksR0FBRyxNQUFNLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUMxQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1gsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLFFBQVEsR0FBZ0MsRUFBRSxDQUFDO1lBQ2pELFFBQVEsQ0FBQyxJQUFJLENBQUM7Z0JBQ2IsRUFBRSxFQUFFLGVBQWUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNoQyxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUM7Z0JBQzdDLFFBQVEsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQztnQkFDakQsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsZ0JBQWdCLEVBQUUsZ0RBQWdEO2dCQUNsRSxJQUFJLEVBQUUsU0FBUztnQkFDZixJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQzthQUMzQyxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUM7WUFDdkcsTUFBTSxFQUFFLGVBQWUsRUFBRSxVQUFVLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxnRUFBZ0UsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRyxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFoVFksNEJBQTRCO0lBVXRDLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHFCQUFxQixDQUFBO0dBZlgsNEJBQTRCLENBZ1R4Qzs7QUFFRCw0QkFBNEI7QUFDNUIsYUFBYSxDQUFDLG9CQUFvQixDQUFDLDRCQUE0QixDQUFDLENBQUM7QUFFakUsMEVBQTBFO0FBRTFFLE1BQU0sc0JBQXVCLFNBQVEsT0FBTzthQUMzQixPQUFFLEdBQUcsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUM7SUFFM0Q7UUFDQyxNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyx3Q0FBd0MsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25JLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFO1lBQzdCLEtBQUssRUFBRSxTQUFTLENBQUMsZ0NBQWdDLEVBQUUscUJBQXFCLENBQUM7WUFDekUsUUFBUSxFQUFFLGVBQWU7WUFDekIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPO1lBQ3JCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLENBQUMsTUFBTSxFQUFFLEVBQUUsT0FBTyxDQUFDO1lBQzdILE9BQU8sRUFBRSx3Q0FBd0M7WUFDakQsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsSUFBSSxFQUFFLE9BQU87YUFDYjtZQUNELFVBQVUsRUFBRSxDQUFDO29CQUNaLE1BQU0sRUFBRSw4Q0FBb0MsRUFBRSxFQUFFLHlCQUF5QjtvQkFDekUsT0FBTyxFQUFFLG1EQUE2Qix3QkFBZTtpQkFDckQsRUFBRTtvQkFDRixJQUFJLEVBQUUsd0NBQXdDO29CQUM5QyxNQUFNLDZDQUFtQztvQkFDekMsT0FBTyx3QkFBZ0I7aUJBQ3ZCLENBQUM7U0FDRixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRyxJQUFJLGFBQWEsWUFBWSxhQUFhLEVBQUUsQ0FBQztZQUM1QyxNQUFNLGFBQWEsQ0FBQyxlQUFlLENBQUMsNEJBQTRCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3ZGLENBQUM7SUFDRixDQUFDOztBQUdGLE1BQU0sMEJBQTJCLFNBQVEsT0FBTzthQUMvQixPQUFFLEdBQUcsb0JBQW9CLENBQUMsb0JBQW9CLENBQUM7SUFFL0Q7UUFDQyxNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyx3Q0FBd0MsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25JLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwwQkFBMEIsQ0FBQyxFQUFFO1lBQ2pDLEtBQUssRUFBRSxTQUFTLENBQUMsb0NBQW9DLEVBQUUsMEJBQTBCLENBQUM7WUFDbEYsUUFBUSxFQUFFLHFCQUFxQjtZQUMvQixJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDcEIsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxPQUFPLENBQUM7WUFDN0gsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsSUFBSSxFQUFFLE9BQU87YUFDYjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsZ0JBQWdCO1FBQ2xHLElBQUksYUFBYSxZQUFZLGFBQWEsRUFBRSxDQUFDO1lBQzVDLE1BQU0sYUFBYSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLENBQUM7UUFDM0YsQ0FBQztJQUNGLENBQUM7O0FBR0YsTUFBTSw2QkFBOEIsU0FBUSxPQUFPO0lBQ2xEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLGtEQUFrRDtZQUN0RCxLQUFLLEVBQUUsU0FBUyxDQUFDLGlDQUFpQyxFQUFFLDZCQUE2QixDQUFDO1lBQ2xGLFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsRUFBRSxFQUFFLEtBQUs7WUFDVCxZQUFZLEVBQUUsdUJBQXVCO1lBQ3JDLFVBQVUsRUFBRTtnQkFDWCxNQUFNLEVBQUUsOENBQW9DLEVBQUU7Z0JBQzlDLE9BQU8sRUFBRSxpREFBOEI7Z0JBQ3ZDLElBQUksRUFBRSx3Q0FBd0M7YUFDOUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO1FBQ3BFLElBQUksYUFBYSxZQUFZLGFBQWEsRUFBRSxDQUFDO1lBQzVDLE1BQU0sYUFBYSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLHVCQUF1QixFQUFFLENBQUM7UUFDOUYsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3hDLGVBQWUsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQzVDLGVBQWUsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0FBRS9DLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDLHFCQUFxQixDQUFDO0lBQ2hHLEdBQUcsOEJBQThCO0lBQ2pDLFVBQVUsRUFBRTtRQUNYLG1DQUFtQyxFQUFFO1lBQ3BDLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxVQUFVLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQy9CLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztZQUN0QixtQkFBbUIsRUFBRSxRQUFRLENBQzVCLEVBQUUsT0FBTyxFQUFFLENBQUMsd0NBQXdDLENBQUMsRUFBRSxHQUFHLEVBQUUseUJBQXlCLEVBQUUsRUFDdkYsNEdBQTRHLENBQzVHO1lBQ0QsTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSxrQkFBa0I7Z0JBQ3hCLFFBQVEsRUFBRSxjQUFjLENBQUMsa0JBQWtCO2dCQUMzQyxjQUFjLEVBQUUsT0FBTztnQkFDdkIsS0FBSyxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsNkJBQTZCLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQzdGLFlBQVksRUFBRTtvQkFDYixXQUFXLEVBQUU7d0JBQ1osR0FBRyxFQUFFLHlCQUF5Qjt3QkFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSw0R0FBNEcsQ0FBQztxQkFDeEo7aUJBQ0Q7YUFDRDtTQUNEO0tBQ0Q7Q0FDRCxDQUFDLENBQUMifQ==