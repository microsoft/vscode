/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { PromptFilePickers } from '../../../../contrib/chat/browser/promptSyntax/pickers/promptFilePickers.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
class FixtureQuickInputService extends QuickInputService {
    createQuickPick(options = { useSeparators: false }) {
        const quickPick = super.createQuickPick(options);
        quickPick.ignoreFocusOut = true;
        return quickPick;
    }
}
export default defineThemedFixtureGroup({ path: 'chat/' }, {
    PromptFiles: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderPromptFilePickerFixture({
            ...context,
            type: PromptsType.prompt,
            placeholder: 'Select the prompt file to run',
            seedData: promptsService => {
                promptsService.localPromptFiles = [
                    { uri: URI.file('/workspace/.github/prompts/refactor.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Refactor Prompt', description: 'Refactor selected code' },
                    { uri: URI.file('/workspace/.github/prompts/docs.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Docs Prompt', description: 'Generate docs for symbols' },
                ];
                promptsService.userPromptFiles = [
                    { uri: URI.file('/home/dev/.copilot/prompts/review.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, name: 'Review Prompt', description: 'Review this change' },
                ];
            },
        }),
    }),
    InstructionFilesWithAgentInstructions: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: context => renderPromptFilePickerFixture({
            ...context,
            type: PromptsType.instructions,
            placeholder: 'Select instruction files',
            seedData: promptsService => {
                promptsService.localPromptFiles = [
                    { uri: URI.file('/workspace/.github/instructions/repo.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Repo Rules', description: 'Repository-wide coding rules' },
                ];
                promptsService.agentInstructionFiles = [
                    { uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentInstructionFileType.agentsMd },
                    { uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd },
                ];
            },
        }),
    }),
});
async function renderPromptFilePickerFixture({ container, disposableStore, theme, type, placeholder, seedData }) {
    const quickInputHost = document.createElement('div');
    quickInputHost.style.position = 'relative';
    const hostWidth = 800;
    const hostHeight = 600;
    quickInputHost.style.width = `${hostWidth}px`;
    quickInputHost.style.height = `${hostHeight}px`;
    quickInputHost.style.minHeight = `${hostHeight}px`;
    quickInputHost.style.overflow = 'hidden';
    container.appendChild(quickInputHost);
    const promptsState = {
        localPromptFiles: [],
        userPromptFiles: [],
        extensionPromptFiles: [],
        agentInstructionFiles: [],
        disabled: new ResourceSet(),
    };
    seedData(promptsState);
    const promptsService = new class extends mock() {
        async listPromptFilesForStorage(type, storage, _token) {
            switch (storage) {
                case PromptsStorage.local:
                    return promptsState.localPromptFiles.filter(file => file.type === type);
                case PromptsStorage.user:
                    return promptsState.userPromptFiles.filter(file => file.type === type);
                case PromptsStorage.extension:
                    return promptsState.extensionPromptFiles.filter(file => file.type === type);
                case PromptsStorage.plugin:
                    return [];
                default:
                    return [];
            }
        }
        async listAgentInstructions(_token) {
            return promptsState.agentInstructionFiles;
        }
        async parseNew(_uri, _token) {
            throw new Error('Not implemented');
        }
        getDisabledPromptFiles(_type) {
            return promptsState.disabled;
        }
        setDisabledPromptFiles(_type, uris) {
            promptsState.disabled = uris;
        }
    };
    const layoutService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.activeContainer = quickInputHost;
            this.activeContainerOffset = { top: 0, quickPickTop: 20 };
            this.mainContainer = quickInputHost;
            this.mainContainerOffset = { top: 0, quickPickTop: 20 };
            this.containers = [quickInputHost];
            this.onDidLayoutMainContainer = Event.None;
            this.onDidLayoutContainer = Event.None;
            this.onDidLayoutActiveContainer = Event.None;
            this.onDidAddContainer = Event.None;
            this.onDidChangeActiveContainer = Event.None;
        }
        get activeContainerDimension() { return { width: hostWidth, height: hostHeight }; }
        get mainContainerDimension() { return { width: hostWidth, height: hostHeight }; }
        getContainer() {
            return quickInputHost;
        }
        whenContainerStylesLoaded() {
            return undefined;
        }
        focus() { }
    };
    const contextMenuService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidShowContextMenu = Event.None;
            this.onDidHideContextMenu = Event.None;
        }
        showContextMenu() { }
    };
    const contextViewService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.anchorAlignment = 0;
        }
        showContextView() { return { close: () => { } }; }
        hideContextView() { }
        getContextViewElement() { return quickInputHost; }
        layout() { }
    };
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: registration => {
            registration.defineInstance(ILayoutService, layoutService);
            registration.defineInstance(IContextMenuService, contextMenuService);
            registration.defineInstance(IContextViewService, contextViewService);
            registration.define(IListService, ListService);
            registration.define(IQuickInputService, FixtureQuickInputService);
            registration.defineInstance(IPromptsService, promptsService);
            registration.defineInstance(IOpenerService, new class extends mock() {
            });
            registration.defineInstance(IFileService, new class extends mock() {
            });
            registration.defineInstance(IDialogService, new class extends mock() {
            });
            registration.defineInstance(ICommandService, new class extends mock() {
            });
            registration.defineInstance(ILabelService, new class extends mock() {
                getUriLabel(uri) {
                    return uri.path;
                }
            });
            registration.defineInstance(IProductService, new class extends mock() {
            });
        }
    });
    const pickers = instantiationService.createInstance(PromptFilePickers);
    void pickers.selectPromptFile({
        placeholder,
        type,
    });
    // Wait for the quickpick widget to render and have dimensions
    const quickInputWidget = await waitForElement(quickInputHost, '.quick-input-widget', el => el.offsetWidth > 0 && el.offsetHeight > 0);
    if (quickInputWidget) {
        // Reset positioning
        quickInputWidget.style.position = 'relative';
        quickInputWidget.style.top = '0';
        quickInputWidget.style.left = '0';
        // Move widget to container and remove host
        container.appendChild(quickInputWidget);
        quickInputHost.remove();
        // Set explicit dimensions on container to match widget
        const rect = quickInputWidget.getBoundingClientRect();
        container.style.width = `${rect.width}px`;
        container.style.height = `${rect.height}px`;
    }
}
async function waitForElement(root, selector, condition, timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = root.querySelector(selector);
        if (el && condition(el)) {
            // Wait one more frame to ensure layout is complete
            await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
            return el;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return root.querySelector(selector);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVBpY2tlcnMuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9wcm9tcHRGaWxlUGlja2Vycy5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUE4QixNQUFNLHlEQUF5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