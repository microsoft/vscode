/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IRenderedMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, IHarnessDescriptor, createVSCodeHarnessDescriptor, createClaudeHarnessDescriptor, createCliHarnessDescriptor, getCliUserRoots, getClaudeUserRoots } from '../../../contrib/chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, IResolvedAgentFile, AgentFileType, PromptsStorage } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ParsedPromptFile } from '../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { IAgentPluginService } from '../../../contrib/chat/common/plugins/agentPluginService.js';
import { IPluginMarketplaceService } from '../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../../contrib/chat/common/plugins/pluginInstallService.js';
import { AICustomizationManagementEditor } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, IMcpService, McpServerInstallState } from '../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../contrib/mcp/common/mcpRegistryTypes.js';
import { IWorkbenchLocalMcpServer, LocalMcpServerScope } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';

// Ensure theme colors & widget CSS are loaded
import '../../../../platform/theme/common/colors/inputColors.js';
import '../../../../platform/theme/common/colors/listColors.js';
import '../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';

// ============================================================================
// Mock helpers
// ============================================================================

const userHome = URI.file('/home/dev');
const BUILTIN_STORAGE = 'builtin';

interface IFixtureFile {
	readonly uri: URI;
	readonly storage: PromptsStorage;
	readonly type: PromptsType;
	readonly name?: string;
	readonly description?: string;
	readonly applyTo?: string;
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

function createMockPromptsService(files: IFixtureFile[], agentInstructions: IResolvedAgentFile[]): IPromptsService {
	const applyToMap = new ResourceMap<string | undefined>();
	const descriptionMap = new ResourceMap<string | undefined>();
	for (const f of files) { applyToMap.set(f.uri, f.applyTo); descriptionMap.set(f.uri, f.description); }
	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;
		override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
		override async listPromptFiles(type: PromptsType) {
			return files.filter(f => f.type === type).map(f => ({
				uri: f.uri, storage: f.storage as PromptsStorage.local, type: f.type, name: f.name, description: f.description,
			}));
		}
		override async listAgentInstructions() { return agentInstructions; }
		override async getCustomAgents() {
			return files.filter(f => f.type === PromptsType.agent).map(a => ({
				uri: a.uri, name: a.name ?? 'agent', description: a.description, storage: a.storage,
				source: { storage: a.storage },
			})) as never[];
		}
		override async parseNew(uri: URI, _token: CancellationToken): Promise<ParsedPromptFile> {
			const header = {
				get applyTo() { return applyToMap.get(uri); },
				get description() { return descriptionMap.get(uri); },
			};
			return new ParsedPromptFile(uri, header as never);
		}
		override async getSourceFolders() { return [] as never[]; }
		override async findAgentSkills() { return [] as never[]; }
		override async getPromptSlashCommands() { return [] as never[]; }
	}();
}

function createMockHarnessService(activeHarness: CustomizationHarness, descriptors: readonly IHarnessDescriptor[]): ICustomizationHarnessService {
	const active = observableValue('activeHarness', activeHarness);
	return new class extends mock<ICustomizationHarnessService>() {
		override readonly activeHarness = active;
		override readonly availableHarnesses = constObservable(descriptors);
		override getStorageSourceFilter(type: PromptsType) {
			const d = descriptors.find(h => h.id === active.get()) ?? descriptors[0];
			return d.getStorageSourceFilter(type);
		}
		override getActiveDescriptor() {
			return descriptors.find(h => h.id === active.get()) ?? descriptors[0];
		}
		override setActiveHarness(id: CustomizationHarness) { active.set(id, undefined); }
	}();
}

function makeLocalMcpServer(id: string, label: string, scope: LocalMcpServerScope, description?: string): IWorkbenchMcpServer {
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = id;
		override readonly name = id;
		override readonly label = label;
		override readonly description = description ?? '';
		override readonly installState = McpServerInstallState.Installed;
		override readonly local = new class extends mock<IWorkbenchLocalMcpServer>() {
			override readonly id = id;
			override readonly scope = scope;
		}();
	}();
}

// ============================================================================
// Realistic test data — a project that has Copilot + Claude customizations
// ============================================================================

const allFiles: IFixtureFile[] = [
	// Copilot instructions
	{ uri: URI.file('/workspace/.github/instructions/coding-standards.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Coding Standards', description: 'Repository-wide coding standards' },
	{ uri: URI.file('/workspace/.github/instructions/testing.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Testing', description: 'Testing best practices', applyTo: '**/*.test.ts' },
	{ uri: URI.file('/home/dev/.copilot/instructions/my-style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'My Style', description: 'Personal coding style' },
	// Claude rules
	{ uri: URI.file('/workspace/.claude/rules/code-style.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Code Style', description: 'Claude code style rules' },
	{ uri: URI.file('/workspace/.claude/rules/testing.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Testing', description: 'Claude testing conventions' },
	{ uri: URI.file('/home/dev/.claude/rules/personal.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'Personal', description: 'Personal rules' },
	// Agents
	{ uri: URI.file('/workspace/.github/agents/reviewer.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Reviewer', description: 'Code review agent' },
	{ uri: URI.file('/workspace/.github/agents/documenter.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Documenter', description: 'Documentation agent' },
	{ uri: URI.file('/workspace/.claude/agents/planner.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Planner', description: 'Project planning agent' },
	// Skills
	{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Deploy', description: 'Deployment automation' },
	{ uri: URI.file('/workspace/.github/skills/refactor/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Refactor', description: 'Code refactoring patterns' },
	// Prompts
	{ uri: URI.file('/workspace/.github/prompts/explain.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Explain', description: 'Explain selected code' },
	{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Review', description: 'Review changes' },
];

const agentInstructions: IResolvedAgentFile[] = [
	{ uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentFileType.agentsMd },
	{ uri: URI.file('/workspace/CLAUDE.md'), realPath: undefined, type: AgentFileType.claudeMd },
	{ uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentFileType.copilotInstructionsMd },
];

const mcpWorkspaceServers = [
	makeLocalMcpServer('mcp-postgres', 'PostgreSQL', LocalMcpServerScope.Workspace, 'Database access'),
	makeLocalMcpServer('mcp-github', 'GitHub', LocalMcpServerScope.Workspace, 'GitHub API'),
];
const mcpUserServers = [
	makeLocalMcpServer('mcp-web-search', 'Web Search', LocalMcpServerScope.User, 'Search the web'),
];
const mcpRuntimeServers = [
	{ definition: { id: 'github-copilot-mcp', label: 'GitHub Copilot' }, collection: { id: 'ext.github.copilot/mcp', label: 'ext.github.copilot/mcp' }, enablement: constObservable(2), connectionState: constObservable({ state: 2 }) },
];

interface IRenderEditorOptions {
	readonly harness: CustomizationHarness;
	readonly isSessionsWindow?: boolean;
	readonly managementSections?: readonly AICustomizationManagementSection[];
	readonly availableHarnesses?: readonly IHarnessDescriptor[];
}

// ============================================================================
// Render helper — creates the full management editor
// ============================================================================

async function renderEditor(ctx: ComponentFixtureContext, options: IRenderEditorOptions): Promise<void> {
	const width = 900;
	const height = 600;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const isSessionsWindow = options.isSessionsWindow ?? false;
	const managementSections = options.managementSections ?? [
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Plugins,
	];
	const availableHarnesses = options.availableHarnesses ?? [
		createVSCodeHarnessDescriptor([PromptsStorage.extension]),
		createCliHarnessDescriptor(getCliUserRoots(userHome), []),
		createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), []),
	];

	const allMcpServers = [...mcpWorkspaceServers, ...mcpUserServers];

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			const harnessService = createMockHarnessService(options.harness, availableHarnesses);
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IPromptsService, createMockPromptsService(allFiles, agentInstructions));
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = isSessionsWindow;
				override readonly activeProjectRoot = observableValue('root', URI.file('/workspace'));
				override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
				override getActiveProjectRoot() { return URI.file('/workspace'); }
				override getStorageSourceFilter(type: PromptsType) { return harnessService.getStorageSourceFilter(type); }
				override clearOverrideProjectRoot() { }
				override setOverrideProjectRoot() { }
				override readonly managementSections = managementSections;
				override async generateCustomization() { }
			}());
			reg.defineInstance(ICustomizationHarnessService, harnessService);
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = Event.None;
				override getWorkspace(): IWorkspace { return { id: 'test', folders: [] }; }
				override getWorkbenchState(): WorkbenchState { return WorkbenchState.WORKSPACE; }
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
			}());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() {
				override readonly defaultUriScheme = 'file';
				override userHome(): URI;
				override userHome(): Promise<URI>;
				override userHome(): URI | Promise<URI> { return userHome; }
			}());
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() { }());
			reg.defineInstance(IWorkingCopyService, new class extends mock<IWorkingCopyService>() {
				override readonly onDidChangeDirty = Event.None;
			}());
			reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { }());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() { }());
			reg.defineInstance(IRequestService, new class extends mock<IRequestService>() { }());
			reg.defineInstance(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
				override render() {
					const rendered: IRenderedMarkdown = {
						element: DOM.$('span'),
						dispose() { },
					};
					return rendered;
				}
			}());
			reg.defineInstance(IWebviewService, new class extends mock<IWebviewService>() { }());
			reg.defineInstance(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
				override readonly onChange = Event.None;
				override readonly onReset = Event.None;
				override readonly local = allMcpServers;
				override async queryLocal() { return allMcpServers; }
				override canInstall() { return true as const; }
			}());
			reg.defineInstance(IMcpService, new class extends mock<IMcpService>() {
				override readonly servers = constObservable(mcpRuntimeServers as never[]);
			}());
			reg.defineInstance(IMcpRegistry, new class extends mock<IMcpRegistry>() {
				override readonly collections = constObservable([]);
				override readonly delegates = constObservable([]);
				override readonly onDidChangeInputs = Event.None;
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
				override readonly enablementModel = undefined as never;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly onDidChangeMarketplaces = Event.None;
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() { }());
		},
	});

	const editor = ctx.disposableStore.add(
		instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup())
	);
	editor.create(ctx.container);
	editor.layout(new Dimension(width, height));

	// setInput may fail on unmocked service calls — catch to still show the editor shell
	try {
		await editor.setInput(AICustomizationManagementEditorInput.getOrCreate(), undefined, {}, CancellationToken.None);
	} catch {
		// Expected in fixture — some services are partially mocked
	}
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {

	// Full editor with Local (VS Code) harness — all sections visible, harness dropdown,
	// Generate buttons, AGENTS.md shortcut, all storage groups
	LocalHarness: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, { harness: CustomizationHarness.VSCode }),
	}),

	// Full editor with Copilot CLI harness — no prompts section, CLI-specific
	// root files and instruction filtering under .github/.copilot paths.
	CliHarness: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, { harness: CustomizationHarness.CLI }),
	}),

	// Full editor with Claude harness — Prompts+Plugins hidden, Agents visible,
	// "Add CLAUDE.md" button, "New Rule" dropdown, instruction filtering, bridged MCP badge
	ClaudeHarness: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, { harness: CustomizationHarness.Claude }),
	}),

	// Sessions-window variant of the full editor with workspace override UX
	// and sessions section ordering.
	Sessions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.CLI,
			isSessionsWindow: true,
			availableHarnesses: [
				createCliHarnessDescriptor(getCliUserRoots(userHome), [BUILTIN_STORAGE]),
			],
			managementSections: [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.Instructions,
				AICustomizationManagementSection.Prompts,
				AICustomizationManagementSection.Hooks,
				AICustomizationManagementSection.McpServers,
				AICustomizationManagementSection.Plugins,
			],
		}),
	}),
});
