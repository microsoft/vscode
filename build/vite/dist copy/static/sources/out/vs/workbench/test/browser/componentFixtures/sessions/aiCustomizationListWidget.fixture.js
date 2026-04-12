/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, createVSCodeHarnessDescriptor } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../../contrib/chat/common/plugins/agentPluginService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { AICustomizationManagementSection } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationListWidget } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationListWidget.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { ParsedPromptFile, PromptHeader } from '../../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { isEqual } from '../../../../../base/common/resources.js';
// Ensure color registrations are loaded
import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';
// ============================================================================
// Mock helpers
// ============================================================================
const defaultFilter = {
    sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
};
function createMockPromptsService(instructionFiles, agentInstructionFiles = []) {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeCustomAgents = Event.None;
            this.onDidChangeSlashCommands = Event.None;
            this.onDidChangeSkills = Event.None;
        }
        getDisabledPromptFiles() { return new ResourceSet(); }
        async listPromptFiles(type) {
            if (type === PromptsType.instructions) {
                return instructionFiles.map(f => f.promptPath);
            }
            return [];
        }
        async listAgentInstructions() { return agentInstructionFiles; }
        async getCustomAgents() { return []; }
        async parseNew(uri) {
            const file = instructionFiles.find(f => isEqual(f.promptPath.uri, uri));
            const headerLines = [];
            headerLines.push('---\n');
            if (file) {
                if (file.name) {
                    headerLines.push(`name: ${file.name}\n`);
                }
                if (file.description) {
                    headerLines.push(`description: ${file.description}\n`);
                }
                if (file.applyTo) {
                    headerLines.push(`applyTo: "${file.applyTo}"\n`);
                }
            }
            headerLines.push('---\n');
            const header = new PromptHeader(new Range(2, 1, headerLines.length, 1), uri, headerLines);
            return new ParsedPromptFile(uri, header);
        }
    }();
}
function createMockWorkspaceService() {
    const activeProjectRoot = observableValue('mockActiveProjectRoot', URI.file('/workspace'));
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.isSessionsWindow = false;
            this.activeProjectRoot = activeProjectRoot;
            this.hasOverrideProjectRoot = observableValue('hasOverride', false);
        }
        getActiveProjectRoot() { return URI.file('/workspace'); }
        getStorageSourceFilter() { return defaultFilter; }
    }();
}
function createMockHarnessService() {
    const descriptor = createVSCodeHarnessDescriptor([PromptsStorage.extension]);
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.activeHarness = observableValue('activeHarness', CustomizationHarness.VSCode);
            this.availableHarnesses = observableValue('harnesses', [descriptor]);
        }
        getStorageSourceFilter() { return defaultFilter; }
        getActiveDescriptor() { return descriptor; }
        registerExternalHarness() { return { dispose() { } }; }
    }();
}
function createMockWorkspaceContextService() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
            return { id: 'test', folders: [] };
        }
    }();
}
// ============================================================================
// Render helper
// ============================================================================
async function renderInstructionsTab(ctx, instructionFiles, agentInstructionFiles = []) {
    const width = 500;
    const height = 400;
    ctx.container.style.width = `${width}px`;
    ctx.container.style.height = `${height}px`;
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
        getContextViewElement() { return ctx.container; }
        layout() { }
    };
    const instantiationService = createEditorServices(ctx.disposableStore, {
        colorTheme: ctx.theme,
        additionalServices: (reg) => {
            reg.defineInstance(IContextMenuService, contextMenuService);
            reg.defineInstance(IContextViewService, contextViewService);
            registerWorkbenchServices(reg);
            reg.define(IListService, ListService);
            reg.defineInstance(IPromptsService, createMockPromptsService(instructionFiles, agentInstructionFiles));
            reg.defineInstance(IAICustomizationWorkspaceService, createMockWorkspaceService());
            reg.defineInstance(ICustomizationHarnessService, createMockHarnessService());
            reg.defineInstance(IWorkspaceContextService, createMockWorkspaceContextService());
            reg.defineInstance(IChatSessionsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeCustomizations = Event.None;
                }
                async getCustomizations() { return undefined; }
                getRegisteredChatSessionItemProviders() { return []; }
            }());
            reg.defineInstance(IAgentPluginService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.plugins = observableValue('plugins', []);
                }
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                }
            }());
            reg.defineInstance(IProductService, new class extends mock() {
            }());
            reg.defineInstance(IPathService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.defaultUriScheme = 'file';
                }
                userHome() { return URI.file('/home/dev'); }
            }());
        },
    });
    const widget = ctx.disposableStore.add(instantiationService.createInstance(AICustomizationListWidget));
    ctx.container.appendChild(widget.element);
    await widget.setSection(AICustomizationManagementSection.Instructions);
    widget.layout(height, width);
}
// ============================================================================
// Fixtures
// ============================================================================
export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
    InstructionsTabWithItems: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderInstructionsTab(ctx, [
            // Always-active instructions (no applyTo)
            { promptPath: { uri: URI.file('/workspace/.github/instructions/coding-standards.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }, name: 'Coding Standards', description: 'Repository-wide coding standards' },
            { promptPath: { uri: URI.file('/home/dev/.copilot/instructions/my-style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions }, name: 'My Style', description: 'Personal coding style preferences' },
            // Always-included instruction (applyTo: **)
            { promptPath: { uri: URI.file('/workspace/.github/instructions/general-guidelines.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }, name: 'General Guidelines', description: 'General development guidelines', applyTo: '**' },
            // On-demand instructions (with applyTo pattern)
            { promptPath: { uri: URI.file('/workspace/.github/instructions/testing-guidelines.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }, name: 'Testing Guidelines', description: 'Testing best practices', applyTo: '**/*.test.ts' },
            { promptPath: { uri: URI.file('/workspace/.github/instructions/security-review.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions }, name: 'Security Review', description: 'Security review checklist', applyTo: 'src/auth/**' },
            { promptPath: { uri: URI.file('/home/dev/.copilot/instructions/typescript-rules.instructions.md'), storage: PromptsStorage.extension, type: PromptsType.instructions, extension: undefined, source: undefined }, name: 'TypeScript Rules', description: 'TypeScript conventions', applyTo: '**/*.ts' },
        ], [
            // Agent instruction files (AGENTS.md, copilot-instructions.md)
            { uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentInstructionFileType.agentsMd },
            { uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd },
        ]),
    }),
    InstructionsTabEmpty: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderInstructionsTab(ctx, []),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9zZXNzaW9ucy9haUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNoRyxPQUFPLEVBQWMsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsZ0NBQWdDLEVBQXdCLE1BQU0sb0VBQW9FLENBQUM7QUFDNUksT0FBTyxFQUFFLG9CQUFvQixFQUFFLDRCQUE0QixFQUFzQiw2QkFBNkIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3ZMLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxXQUFXLEVBQUUs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