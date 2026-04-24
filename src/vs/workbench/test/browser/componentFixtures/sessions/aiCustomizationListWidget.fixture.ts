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
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor, createVSCodeHarnessDescriptor } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../../contrib/chat/common/plugins/agentPluginService.js';
import { IChatSessionsService, SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, AgentInstructionFileType, PromptsStorage, IPromptPath, IAgentInstructionFile } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { AICustomizationManagementSection } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationListWidget } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationListWidget.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { ParsedPromptFile, PromptHeader } from '../../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { isEqual } from '../../../../../base/common/resources.js';

// Ensure color registrations are loaded
import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';

// ============================================================================
// Mock helpers
// ============================================================================

const defaultFilter: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
};

interface IFixtureInstructionFile {
	readonly promptPath: IPromptPath;
	readonly name?: string;
	readonly description?: string;
	readonly applyTo?: string; /** If set, this instruction file has an applyTo pattern that controls automatic inclusion when the context matches (or `**` for always). */
}

function createMockPromptsService(instructionFiles: IFixtureInstructionFile[], agentInstructionFiles: IAgentInstructionFile[] = []): IPromptsService {
	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;
		override readonly onDidChangeHooks = Event.None;
		override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
		override async listPromptFiles(type: PromptsType) {
			if (type === PromptsType.instructions) {
				return instructionFiles.map(f => f.promptPath);
			}
			return [];
		}
		override async listAgentInstructions() { return agentInstructionFiles; }
		override async getCustomAgents() { return []; }
		override async getInstructionFiles() {
			return instructionFiles.map(f => ({
				uri: f.promptPath.uri,
				name: f.name ?? '',
				description: f.description,
				storage: f.promptPath.storage,
				pattern: f.applyTo,
			}));
		}
		override async parseNew(uri: URI): Promise<ParsedPromptFile> {
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
			const header = new PromptHeader(
				new Range(2, 1, headerLines.length, 1),
				uri,
				headerLines
			);
			return new ParsedPromptFile(uri, header);
		}
	}();
}

function createMockWorkspaceService(): IAICustomizationWorkspaceService {
	const activeProjectRoot = observableValue<URI | undefined>('mockActiveProjectRoot', URI.file('/workspace'));
	return new class extends mock<IAICustomizationWorkspaceService>() {
		override readonly isSessionsWindow = false;
		override readonly welcomePageFeatures = {
			showGettingStartedBanner: true,
		};
		override readonly activeProjectRoot = activeProjectRoot;
		override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
		override getActiveProjectRoot() { return URI.file('/workspace'); }
		override getStorageSourceFilter() { return defaultFilter; }
	}();
}

function createMockHarnessService(): ICustomizationHarnessService {
	const descriptor = createVSCodeHarnessDescriptor([PromptsStorage.extension]);
	return new class extends mock<ICustomizationHarnessService>() {
		override readonly activeHarness = observableValue<string>('activeHarness', SessionType.Local);
		override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('harnesses', [descriptor]);
		override getStorageSourceFilter() { return defaultFilter; }
		override getActiveDescriptor() { return descriptor; }
		override registerExternalHarness() { return { dispose() { } }; }
	}();
}

function createMockWorkspaceContextService(): IWorkspaceContextService {
	return new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace(): IWorkspace {
			return { id: 'test', folders: [] };
		}
	}();
}

// ============================================================================
// Render helper
// ============================================================================

async function renderInstructionsTab(ctx: ComponentFixtureContext, instructionFiles: IFixtureInstructionFile[], agentInstructionFiles: IAgentInstructionFile[] = []): Promise<void> {
	const width = 500;
	const height = 400;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const contextMenuService = new class extends mock<IContextMenuService>() {
		override onDidShowContextMenu = Event.None;
		override onDidHideContextMenu = Event.None;
		override showContextMenu(): void { }
	};

	const contextViewService = new class extends mock<IContextViewService>() {
		override anchorAlignment = 0;
		override showContextView() { return { close: () => { } }; }
		override hideContextView(): void { }
		override getContextViewElement(): HTMLElement { return ctx.container; }
		override layout(): void { }
	};

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IContextMenuService, contextMenuService);
			reg.defineInstance(IContextViewService, contextViewService);
			reg.define(IListService, ListService);
			reg.defineInstance(IPromptsService, createMockPromptsService(instructionFiles, agentInstructionFiles));
			reg.defineInstance(IAICustomizationWorkspaceService, createMockWorkspaceService());
			reg.defineInstance(ICustomizationHarnessService, createMockHarnessService());
			reg.defineInstance(IWorkspaceContextService, createMockWorkspaceContextService());
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override async getCustomizations() { return undefined; }
				override getRegisteredChatSessionItemProviders() { return []; }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue('plugins', []);
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
			}());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() { }());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() {
				override readonly defaultUriScheme = 'file';
				override userHome(): URI;
				override userHome(): Promise<URI>;
				override userHome(): URI | Promise<URI> { return URI.file('/home/dev'); }
			}());
		},
	});

	const widget = ctx.disposableStore.add(
		instantiationService.createInstance(AICustomizationListWidget)
	);
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
			{ promptPath: { uri: URI.file('/home/dev/.copilot/instructions/typescript-rules.instructions.md'), storage: PromptsStorage.extension, type: PromptsType.instructions, extension: undefined!, source: undefined! }, name: 'TypeScript Rules', description: 'TypeScript conventions', applyTo: '**/*.ts' },
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
