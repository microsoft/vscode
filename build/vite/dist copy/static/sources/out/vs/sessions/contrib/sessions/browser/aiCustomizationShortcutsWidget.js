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
import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { Menus } from '../../../browser/menus.js';
import { getCustomizationTotalCount } from './customizationCounts.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
const $ = DOM.$;
const CUSTOMIZATIONS_COLLAPSED_KEY = 'agentSessions.customizationsCollapsed';
let AICustomizationShortcutsWidget = class AICustomizationShortcutsWidget extends Disposable {
    constructor(container, options, instantiationService, storageService, promptsService, mcpService, workspaceContextService, workspaceService, agentPluginService) {
        super();
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.promptsService = promptsService;
        this.mcpService = mcpService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceService = workspaceService;
        this.agentPluginService = agentPluginService;
        this._render(container, options);
    }
    _render(parent, options) {
        // Get initial collapsed state
        const isCollapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_KEY, 0 /* StorageScope.PROFILE */, false);
        const container = DOM.append(parent, $('.ai-customization-toolbar'));
        if (isCollapsed) {
            container.classList.add('collapsed');
        }
        // Header (clickable to toggle)
        const header = DOM.append(container, $('.ai-customization-header'));
        header.classList.toggle('collapsed', isCollapsed);
        const headerButtonContainer = DOM.append(header, $('.customization-link-button-container'));
        const headerButton = this._register(new Button(headerButtonContainer, {
            ...defaultButtonStyles,
            secondary: true,
            title: false,
            supportIcons: true,
            buttonSecondaryBackground: 'transparent',
            buttonSecondaryHoverBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryBorder: undefined,
        }));
        headerButton.element.classList.add('customization-link-button', 'sidebar-action-button');
        headerButton.element.setAttribute('aria-expanded', String(!isCollapsed));
        headerButton.label = localize('customizations', "Customizations");
        const chevronContainer = DOM.append(headerButton.element, $('span.customization-link-counts'));
        const chevron = DOM.append(chevronContainer, $('.ai-customization-chevron'));
        const headerTotalCount = DOM.append(chevronContainer, $('span.ai-customization-header-total.hidden'));
        chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));
        // Toolbar container
        const toolbarContainer = DOM.append(container, $('.ai-customization-toolbar-content.sidebar-action-list'));
        const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarCustomizations, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: { primaryGroup: () => true },
            telemetrySource: 'sidebarCustomizations',
        }));
        // Re-layout when toolbar items change (e.g., Plugins item appearing after extension activation)
        this._register(toolbar.onDidChangeMenuItems(() => {
            options?.onDidChangeLayout?.();
        }));
        let updateCountRequestId = 0;
        const updateHeaderTotalCount = async () => {
            const requestId = ++updateCountRequestId;
            const totalCount = await getCustomizationTotalCount(this.promptsService, this.mcpService, this.workspaceService, this.workspaceContextService, this.agentPluginService);
            if (requestId !== updateCountRequestId) {
                return;
            }
            headerTotalCount.classList.toggle('hidden', totalCount === 0);
            headerTotalCount.textContent = `${totalCount}`;
        };
        this._register(this.promptsService.onDidChangeCustomAgents(() => updateHeaderTotalCount()));
        this._register(this.promptsService.onDidChangeSlashCommands(() => updateHeaderTotalCount()));
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => updateHeaderTotalCount()));
        this._register(autorun(reader => {
            this.mcpService.servers.read(reader);
            updateHeaderTotalCount();
        }));
        this._register(autorun(reader => {
            this.workspaceService.activeProjectRoot.read(reader);
            updateHeaderTotalCount();
        }));
        updateHeaderTotalCount();
        // Toggle collapse on header click
        const transitionListener = this._register(new MutableDisposable());
        const toggleCollapse = () => {
            const collapsed = container.classList.toggle('collapsed');
            header.classList.toggle('collapsed', collapsed);
            this.storageService.store(CUSTOMIZATIONS_COLLAPSED_KEY, collapsed, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            headerButton.element.setAttribute('aria-expanded', String(!collapsed));
            chevron.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chevronRight), ...ThemeIcon.asClassNameArray(Codicon.chevronDown));
            chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));
            // Re-layout after the transition
            transitionListener.value = DOM.addDisposableListener(toolbarContainer, 'transitionend', () => {
                transitionListener.clear();
                options?.onDidChangeLayout?.();
            });
        };
        this._register(headerButton.onDidClick(() => toggleCollapse()));
    }
};
AICustomizationShortcutsWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IStorageService),
    __param(4, IPromptsService),
    __param(5, IMcpService),
    __param(6, IWorkspaceContextService),
    __param(7, IAICustomizationWorkspaceService),
    __param(8, IAgentPluginService)
], AICustomizationShortcutsWidget);
export { AICustomizationShortcutsWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uU2hvcnRjdXRzV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL2FpQ3VzdG9taXphdGlvblNob3J0Y3V0c1dpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLGdEQUFnRCxDQUFDO0FBQ3hELE9BQU8sbUNBQW1DLENBQUM7QUFDM0MsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBc0Isb0JBQW9CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDbkgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNEQUFz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