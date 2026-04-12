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
var BrowserChatAgentToolsContribution_1;
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatContextService } from '../../../chat/browser/contextContrib/chatContextService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { ClickBrowserTool, ClickBrowserToolData } from './clickBrowserTool.js';
import { DragElementTool, DragElementToolData } from './dragElementTool.js';
import { HandleDialogBrowserTool, HandleDialogBrowserToolData } from './handleDialogBrowserTool.js';
import { HoverElementTool, HoverElementToolData } from './hoverElementTool.js';
import { NavigateBrowserTool, NavigateBrowserToolData } from './navigateBrowserTool.js';
import { OpenBrowserTool, OpenBrowserToolData } from './openBrowserTool.js';
import { OpenBrowserToolNonAgentic, OpenBrowserToolNonAgenticData } from './openBrowserToolNonAgentic.js';
import { ReadBrowserTool, ReadBrowserToolData } from './readBrowserTool.js';
import { RunPlaywrightCodeTool, RunPlaywrightCodeToolData } from './runPlaywrightCodeTool.js';
import { ScreenshotBrowserTool, ScreenshotBrowserToolData } from './screenshotBrowserTool.js';
import { TypeBrowserTool, TypeBrowserToolData } from './typeBrowserTool.js';
let BrowserChatAgentToolsContribution = class BrowserChatAgentToolsContribution extends Disposable {
    static { BrowserChatAgentToolsContribution_1 = this; }
    static { this.ID = 'browserView.chatAgentTools'; }
    static { this.CONTEXT_ID = 'browserView.trackedPages'; }
    constructor(instantiationService, toolsService, configurationService, playwrightService, chatContextService, editorService) {
        super();
        this.instantiationService = instantiationService;
        this.toolsService = toolsService;
        this.configurationService = configurationService;
        this.playwrightService = playwrightService;
        this.chatContextService = chatContextService;
        this.editorService = editorService;
        this._toolsStore = this._register(new DisposableStore());
        this._trackedIds = new Set();
        this._browserToolSet = this._register(this.toolsService.createToolSet(ToolDataSource.Internal, 'browser', 'browser', {
            icon: Codicon.globe,
            description: localize('browserToolSet.description', 'Open and interact with integrated browser pages'),
        }));
        this._updateToolRegistrations();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.browser.enableChatTools')) {
                this._updateToolRegistrations();
            }
        }));
    }
    _updateToolRegistrations() {
        this._toolsStore.clear();
        if (!this.configurationService.getValue('workbench.browser.enableChatTools')) {
            // If chat tools are disabled, we only register the non-agentic open tool,
            // which allows opening browser pages without granting access to their contents.
            this._toolsStore.add(this.toolsService.registerTool(OpenBrowserToolNonAgenticData, this.instantiationService.createInstance(OpenBrowserToolNonAgentic)));
            this._toolsStore.add(this._browserToolSet.addTool(OpenBrowserToolNonAgenticData));
            this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution_1.CONTEXT_ID, []);
            return;
        }
        this._toolsStore.add(this.toolsService.registerTool(OpenBrowserToolData, this.instantiationService.createInstance(OpenBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(ReadBrowserToolData, this.instantiationService.createInstance(ReadBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(ScreenshotBrowserToolData, this.instantiationService.createInstance(ScreenshotBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(NavigateBrowserToolData, this.instantiationService.createInstance(NavigateBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(ClickBrowserToolData, this.instantiationService.createInstance(ClickBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(DragElementToolData, this.instantiationService.createInstance(DragElementTool)));
        this._toolsStore.add(this.toolsService.registerTool(HoverElementToolData, this.instantiationService.createInstance(HoverElementTool)));
        this._toolsStore.add(this.toolsService.registerTool(TypeBrowserToolData, this.instantiationService.createInstance(TypeBrowserTool)));
        this._toolsStore.add(this.toolsService.registerTool(RunPlaywrightCodeToolData, this.instantiationService.createInstance(RunPlaywrightCodeTool)));
        this._toolsStore.add(this.toolsService.registerTool(HandleDialogBrowserToolData, this.instantiationService.createInstance(HandleDialogBrowserTool)));
        this._toolsStore.add(this._browserToolSet.addTool(OpenBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(ReadBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(ScreenshotBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(NavigateBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(ClickBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(DragElementToolData));
        this._toolsStore.add(this._browserToolSet.addTool(HoverElementToolData));
        this._toolsStore.add(this._browserToolSet.addTool(TypeBrowserToolData));
        this._toolsStore.add(this._browserToolSet.addTool(RunPlaywrightCodeToolData));
        this._toolsStore.add(this._browserToolSet.addTool(HandleDialogBrowserToolData));
        // Publish tracked browser pages as workspace context for chat requests
        this.playwrightService.getTrackedPages().then(ids => {
            this._trackedIds = new Set(ids);
            this._updateBrowserContext();
        });
        this._toolsStore.add(this.playwrightService.onDidChangeTrackedPages(ids => {
            this._trackedIds = new Set(ids);
            this._updateBrowserContext();
        }));
        this._toolsStore.add(this.editorService.onDidEditorsChange(() => this._updateBrowserContext()));
    }
    _updateBrowserContext() {
        const lines = [];
        const activeEditor = this.editorService.activeEditor;
        const visibleEditors = new Set(this.editorService.visibleEditors);
        for (const editor of this.editorService.editors) {
            if (editor instanceof BrowserEditorInput && this._trackedIds.has(editor.id)) {
                const title = editor.getTitle() || 'Untitled';
                const url = editor.getDescription() || 'about:blank';
                const hint = editor === activeEditor ? ' (active)' : visibleEditors.has(editor) ? ' (visible)' : '';
                lines.push(`- [${editor.id}] ${title} (${url})${hint}`);
            }
        }
        if (lines.length === 0) {
            this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution_1.CONTEXT_ID, []);
            return;
        }
        this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution_1.CONTEXT_ID, [{
                handle: 0,
                label: localize('browserContext.label', "Browser Pages"),
                modelDescription: `The following browser pages are currently available and can be interacted with using the browser tools:`,
                value: lines.join('\n'),
            }]);
    }
};
BrowserChatAgentToolsContribution = BrowserChatAgentToolsContribution_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILanguageModelToolsService),
    __param(2, IConfigurationService),
    __param(3, IPlaywrightService),
    __param(4, IChatContextService),
    __param(5, IEditorService)
], BrowserChatAgentToolsContribution);
registerWorkbenchContribution2(BrowserChatAgentToolsContribution.ID, BrowserChatAgentToolsContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclRvb2xzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvYnJvd3NlclRvb2xzLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSw4QkFBOEIsRUFBK0MsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGNBQWMsRUFBVyxNQUFNLHlEQUF5RCxDQUFDO0FBQzlILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM1RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUs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