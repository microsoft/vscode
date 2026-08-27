/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import type { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { dirname as dirnameUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IWebviewService } from '../../../../contrib/webview/browser/webview.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection, AICustomizationSource } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider, ICustomizationSourceFolder, IHarnessDescriptor, createVSCodeHarnessDescriptor } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../../contrib/chat/common/model/chatUri.js';
import { IPromptsService, AgentInstructionFileType, PromptsStorage, IAgentSkill, IChatPromptSlashCommand, IAgentInstructionFile } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { IResolvedPromptSourceFolder } from '../../../../contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { ParsedPromptFile, PromptFileParser } from '../../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgentPluginService, IAgentPlugin } from '../../../../contrib/chat/common/plugins/agentPluginService.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IAgentHostToolSetEnablementService, IToolEnablementState } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../contrib/extensions/common/extensions.js';
import { IPluginMarketplaceService, IMarketplacePlugin, MarketplaceType, PluginSourceKind } from '../../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { MarketplaceReferenceKind } from '../../../../contrib/chat/common/plugins/marketplaceReference.js';
import { IPluginInstallService } from '../../../../contrib/chat/common/plugins/pluginInstallService.js';
import { AICustomizationManagementEditor } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { CustomizationMigrationCategoryId } from '../../../../contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemSource.js';
import { AICustomizationItemsModel, IAICustomizationItemsModel, ItemsModelSection } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { createWorkbenchMcpServerDetailInput, EmbeddedMcpServerDetail } from '../../../../contrib/chat/browser/aiCustomization/embeddedMcpServerDetail.js';
import { EmbeddedAgentPluginDetail } from '../../../../contrib/chat/browser/aiCustomization/embeddedAgentPluginDetail.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../../../../contrib/chat/browser/agentPluginEditor/agentPluginItems.js';
import { ContributionEnablementState } from '../../../../contrib/chat/common/enablement.js';
import { AICustomizationManagementEditorInput } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IAutomationDialogService } from '../../../../contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner } from '../../../../contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../contrib/chat/common/automations/automationService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, IMcpService, McpConnectionState, McpServerInstallState } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../../contrib/mcp/common/mcpRegistryTypes.js';
import { IWorkbenchLocalMcpServer, LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { McpListWidget } from '../../../../contrib/chat/browser/aiCustomization/mcpListWidget.js';
import { PluginListWidget } from '../../../../contrib/chat/browser/aiCustomization/pluginListWidget.js';
import { IIterativePager } from '../../../../../base/common/paging.js';
import { IAgentHostCustomizationService } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { McpAuthRequiredReason, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICodeReviewService } from '../../../../../sessions/contrib/codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from './mockCodeReviewService.js';
import { IChatEditingService } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

// Ensure theme colors & widget CSS are loaded
import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';
import '../../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';

// ============================================================================
// Mock helpers
// ============================================================================

const userHome = URI.file('/home/dev');
const BUILTIN_STORAGE = 'builtin';

interface IFixtureFile {
	readonly uri: URI;
	readonly storage: PromptsStorage;
	readonly type: PromptsType;
	readonly source?: PromptFileSource;
	readonly name?: string;
	readonly description?: string;
	readonly applyTo?: string;
	readonly extensionId?: string;
	readonly extensionDisplayName?: string;
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

function createMockAICustomizationItemsModel(): IAICustomizationItemsModel {
	const itemSource = new class extends mock<IAICustomizationItemSource>() {
		override readonly sessionResource = LocalChatSessionUri.getNewSessionUri();
		override readonly onDidAICustomizationItemsChange = Event.None;
		override async fetchProviderItems() { return []; }
		override async fetchAICustomizationItems(_promptType: PromptsType) { return []; }
		override async fetchSourceFolders(_promptType: PromptsType) { return []; }
	}();

	return new class extends mock<IAICustomizationItemsModel>() {
		override getItems(_section: ItemsModelSection): IObservable<readonly IAICustomizationListItem[]> { return constObservable([]); }
		override getActiveItemSource() { return itemSource; }
		override getCount(_section: ItemsModelSection): IObservable<number> { return constObservable(0); }
		override getPluginCount(): IObservable<number> { return constObservable(0); }
		override async whenSectionLoaded(_section: ItemsModelSection): Promise<void> { }
	}();
}

type FixtureAgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

function mcpLifecycleNoop(): Promise<void> {
	return Promise.resolve();
}

function createMockAgentHostCustomizationService(mcpServers: readonly FixtureAgentHostMcpServer[] = []): IAgentHostCustomizationService {
	return new class extends mock<IAgentHostCustomizationService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeCustomizations = Event.None;
		override getCustomAgents() { return []; }
		override getCustomizations() { return []; }
		override getWorkingDirectory() { return undefined; }
		override getWorkingDirectories() { return []; }
		override getMcpServers() { return mcpServers; }
		override addMcpServer() { }
		override async authenticateMcpServer() { return true; }
	}();
}

// Agent-host harnesses supply their customization items directly through an
// item provider (bypassing the prompts-service discovery used by local
// harnesses). Provide items and writable folders so the fixture exercises
// the same discovery and migration availability as the real provider.
function createFixtureAgentHostItemProvider(files: readonly IFixtureFile[]): ICustomizationItemProvider {
	return {
		onDidChange: Event.None,
		async provideChatSessionCustomizations(): Promise<ICustomizationItem[]> {
			return files.filter(file => file.source !== PromptFileSource.UserData).map(file => ({
				uri: file.uri,
				type: file.type,
				name: file.name ?? '',
				description: file.description,
				source: file.storage as AICustomizationSource,
				groupKey: 'remote-host',
				extensionId: file.extensionId,
				pluginUri: undefined,
			}));
		},
		async provideSourceFolders(_sessionResource, type): Promise<readonly ICustomizationSourceFolder[]> {
			let folderName: string;
			switch (type) {
				case PromptsType.agent:
					folderName = 'agents';
					break;
				case PromptsType.instructions:
					folderName = 'instructions';
					break;
				case PromptsType.skill:
					folderName = 'skills';
					break;
				default:
					return [];
			}
			return [
				{
					uri: URI.file(`/workspace/.github/${folderName}`),
					label: '.github',
					source: PromptsStorage.local,
				},
				{
					uri: URI.file(`/home/dev/.copilot/${folderName}`),
					label: '~/.copilot',
					source: PromptsStorage.user,
				},
			];
		},
	};
}

function toExtensionInfo(file: IFixtureFile): { identifier: ExtensionIdentifier; displayName?: string } | undefined {
	if (!file.extensionId) {
		return undefined;
	}

	return {
		identifier: new ExtensionIdentifier(file.extensionId),
		displayName: file.extensionDisplayName,
	};
}

function createFixtureFileContent(file: IFixtureFile): string {
	if (file.type === PromptsType.hook) {
		return JSON.stringify({
			name: file.name,
			description: file.description,
			command: 'npm test',
		}, null, 2);
	}

	const headerLines = [
		'---',
		`description: ${JSON.stringify(file.description ?? `${file.name ?? 'Customization'} description`)}`,
	];

	if (file.type === PromptsType.instructions && file.applyTo) {
		headerLines.push(`applyTo: ${JSON.stringify(file.applyTo)}`);
	}

	if (file.type === PromptsType.agent) {
		headerLines.push('tools:');
		headerLines.push('  - read_file');
		headerLines.push('  - grep_search');
	}

	if (file.type === PromptsType.skill) {
		headerLines.push(`input: ${JSON.stringify('Code review findings')}`);
	}

	if (file.type === PromptsType.prompt) {
		headerLines.push(`argument-hint: ${JSON.stringify('Paste the failing stack trace')}`);
	}

	headerLines.push('---', '');

	return `${headerLines.join('\n')}## Overview\n\nUse **${file.name ?? 'this customization'}** when you need consistent AI guidance.\n\n- Review the active change\n- Preserve existing conventions\n- Explain the reasoning clearly\n\n\`\`\`ts\nconst ready = true;\n\`\`\`\n`;
}

function createInstructionFileContent(file: IAgentInstructionFile): string {
	return `---\ndescription: ${JSON.stringify('Repository-level instructions')}\napplyTo: ${JSON.stringify('**/*')}\n---\n\n## Overview\n\nThese instructions apply across the workspace.\n`;
}

function createFixtureContentMap(files: IFixtureFile[], instructions: IAgentInstructionFile[]): ResourceMap<string> {
	const contents = new ResourceMap<string>();
	for (const file of files) {
		contents.set(file.uri, createFixtureFileContent(file));
	}
	for (const file of instructions) {
		contents.set(file.uri, createInstructionFileContent(file));
	}
	return contents;
}

function createFixtureFileContentStat(resource: URI, value: string): IFileContent {
	return {
		resource,
		name: '',
		mtime: 0,
		ctime: 0,
		etag: '',
		size: value.length,
		readonly: false,
		locked: false,
		executable: false,
		value: VSBuffer.fromString(value),
	};
}

function createFixtureFileStat(resource: URI, size: number, isDirectory: boolean): IFileStatWithMetadata {
	return {
		resource,
		name: '',
		mtime: 0,
		ctime: 0,
		etag: '',
		size,
		readonly: false,
		locked: false,
		executable: false,
		isFile: !isDirectory,
		isDirectory,
		isSymbolicLink: false,
		children: undefined,
	};
}

function createMockPromptsService(files: IFixtureFile[], agentInstructions: IAgentInstructionFile[], contents: ResourceMap<string>, onDidChangeFiles: Event<void>): IPromptsService {
	const parser = new PromptFileParser();
	const skillSourceFolders: IResolvedPromptSourceFolder[] = [
		{ uri: URI.file('/workspace/.agents/skills'), searchRoot: URI.file('/workspace/.agents/skills'), filePattern: undefined, source: PromptFileSource.AgentsWorkspace, storage: PromptsStorage.local },
		{ uri: URI.file('/workspace/.github/skills'), searchRoot: URI.file('/workspace/.github/skills'), filePattern: undefined, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
		{ uri: URI.file('/workspace/.claude/skills'), searchRoot: URI.file('/workspace/.claude/skills'), filePattern: undefined, source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
		{ uri: URI.file('/home/dev/.agents/skills'), searchRoot: URI.file('/home/dev/.agents/skills'), filePattern: undefined, source: PromptFileSource.AgentsPersonal, storage: PromptsStorage.user },
		{ uri: URI.file('/home/dev/.copilot/skills'), searchRoot: URI.file('/home/dev/.copilot/skills'), filePattern: undefined, source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
		{ uri: URI.file('/home/dev/.claude/skills'), searchRoot: URI.file('/home/dev/.claude/skills'), filePattern: undefined, source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
	];
	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = onDidChangeFiles;
		override readonly onDidChangeSkills = onDidChangeFiles;
		override readonly onDidChangeInstructions = Event.None;
		override readonly onDidChangeAgentInstructions = Event.None;
		override readonly onDidChangeHooks = Event.None;
		override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
		override getPromptLocationLabel() { return ''; }
		override async listPromptFiles(type: PromptsType, _token: CancellationToken) {
			return files.filter(f => f.type === type).map(f => ({
				uri: f.uri,
				storage: f.storage as PromptsStorage.local,
				type: f.type,
				name: f.name,
				description: f.description,
				source: f.source,
				extension: toExtensionInfo(f) as never,
			}));
		}
		override async listAgentInstructions() { return agentInstructions; }
		override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, _token: CancellationToken) {
			return files.filter(f => f.type === type && f.storage === storage).map(f => ({
				uri: f.uri,
				storage: f.storage as PromptsStorage.local,
				type: f.type,
				name: f.name,
				description: f.description,
				source: f.source,
				extension: toExtensionInfo(f) as never,
			}));
		}
		override async getCustomAgents() {
			return files.filter(f => f.type === PromptsType.agent).map(a => ({
				uri: a.uri, name: a.name ?? 'agent', description: a.description, storage: a.storage,
				source: {
					storage: a.storage,
					extensionId: a.extensionId ? new ExtensionIdentifier(a.extensionId) : undefined,
				},
				visibility: { userInvocable: true, agentInvocable: true },
			})) as never[];
		}
		override async parseNew(uri: URI, _token: CancellationToken): Promise<ParsedPromptFile> {
			return parser.parse(uri, contents.get(uri) ?? '');
		}
		override getParsedPromptFile(model: { uri: URI; getValue(): string }) {
			return parser.parse(model.uri, model.getValue());
		}
		override async getSourceFolders() { return [] as never[]; }
		override async getResolvedSourceFolders(type: PromptsType) {
			if (type === PromptsType.skill) {
				return skillSourceFolders;
			}

			return [];
		}
		override async getInstructionFiles() {
			return files.filter(f => f.type === PromptsType.instructions).map(f => ({
				uri: f.uri,
				name: f.name ?? '',
				description: f.description,
				storage: f.storage,
				pattern: f.applyTo,
				extension: toExtensionInfo(f) as never,
			}));
		}
		override async findAgentSkills(): Promise<IAgentSkill[]> {
			return files.filter(f => f.type === PromptsType.skill).map(f => ({
				uri: f.uri,
				storage: f.storage,
				name: f.name ?? 'skill',
				description: f.description,
				disableModelInvocation: false,
				userInvocable: true,
			}));
		}
		override async getPromptSlashCommands(): Promise<readonly IChatPromptSlashCommand[]> {
			const promptFiles = files.filter(f => f.type === PromptsType.prompt);
			const commands = await Promise.all(promptFiles.map(async f => {
				return {
					uri: f.uri,
					userInvocable: true,
					name: f.name ?? 'prompt',
					description: f.description,
					argumentHint: undefined,
					type: f.type,
					storage: f.storage,
					source: undefined,
					extension: toExtensionInfo(f) as never,
				} satisfies IChatPromptSlashCommand;
			}));
			return commands;
		}
	}();
}

function createMockHarnessService(sessionResource: URI, descriptors: readonly IHarnessDescriptor[]): ICustomizationHarnessService {
	const activeSessionResource = observableValue<URI>('activeSessionResource', sessionResource);
	const activeHarness = derived(reader => getChatSessionType(activeSessionResource.read(reader)));
	return new class extends mock<ICustomizationHarnessService>() {
		override readonly activeSessionResource = activeSessionResource;
		override readonly activeHarness = activeHarness;
		override readonly availableHarnesses = constObservable(descriptors);
		override findHarnessById(id: string) {
			return descriptors.find(h => h.id === id);
		}
		override getActiveDescriptor() {
			return descriptors.find(h => h.id === activeHarness.get()) ?? descriptors[0];
		}
		override setActiveSession(sessionResource: URI) {
			activeSessionResource.set(sessionResource, undefined);
		}
		override registerExternalHarness() { return { dispose() { } }; }
	}();
}

function makeLocalMcpServer(id: string, label: string, scope: LocalMcpServerScope, description?: string, config?: IWorkbenchMcpServer['config']): IWorkbenchMcpServer {
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = id;
		override readonly name = id;
		override readonly label = label;
		override readonly description = description ?? '';
		override readonly config = config;
		override readonly installState = McpServerInstallState.Installed;
		override readonly local = new class extends mock<IWorkbenchLocalMcpServer>() {
			override readonly id = id;
			override readonly scope = scope;
		}();
	}();
}

function createMockAgentFeedbackService(): IAgentFeedbackService {
	return new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeFeedbackVisibility = Event.None;
		override readonly onDidChangeNavigation = Event.None;
		override readonly onDidChangeFeedbackScope = Event.None;
		override readonly onDidRevealSessionComment = Event.None;
		override readonly onDidAddFeedback = Event.None;
		override readonly onDidConvertFeedback = Event.None;
		override readonly onDidAddReply = Event.None;
		override readonly onDidSubmitFeedback = Event.None;
		override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
		override getFeedback() { return []; }
		override getSessionForFile() { return undefined; }
		override getFeedbackSessionResource() { return undefined; }
		override getMostRecentSessionForResource() { return undefined; }
		override async revealFeedback(): Promise<void> { }
		override getNextFeedback() { return undefined; }
		override getNavigationBearing() { return { activeIdx: -1, totalCount: 0 }; }
		override getNextNavigableItem() { return undefined; }
		override setNavigationAnchor(): void { }
		override clearFeedback(): void { }
		override removeFeedback(): void { }
		override async addFeedbackAndSubmit(): Promise<void> { }
	}();
}

// ============================================================================
// Realistic test data — a project that has Copilot + Claude customizations
// ============================================================================

const allFiles: IFixtureFile[] = [
	// Instructions - extension (built-in + third-party)
	{ uri: URI.file('/extensions/github.copilot-chat/instructions/coding.instructions.md'), storage: PromptsStorage.extension, type: PromptsType.instructions, name: 'Copilot Coding', description: 'Built-in coding guidance', extensionId: 'GitHub.copilot-chat', extensionDisplayName: 'GitHub Copilot Chat' },
	{ uri: URI.file('/extensions/acme.tools/instructions/team.instructions.md'), storage: PromptsStorage.extension, type: PromptsType.instructions, name: 'Team Conventions', description: 'Third-party extension instructions', extensionId: 'acme.tools', extensionDisplayName: 'Acme Tools' },
	// Instructions — workspace
	{ uri: URI.file('/workspace/.github/instructions/coding-standards.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Coding Standards', description: 'Repository-wide coding standards' },
	{ uri: URI.file('/workspace/.github/instructions/testing.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Testing', description: 'Testing best practices', applyTo: '**/*.test.ts' },
	{ uri: URI.file('/workspace/.github/instructions/security.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Security', description: 'Security review checklist', applyTo: 'src/auth/**' },
	{ uri: URI.file('/workspace/.github/instructions/accessibility.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Accessibility', description: 'WCAG compliance guidelines', applyTo: '**/*.tsx' },
	{ uri: URI.file('/workspace/.github/instructions/api-design.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'API Design', description: 'REST API design conventions' },
	{ uri: URI.file('/workspace/.github/instructions/performance.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Performance', description: 'Performance optimization rules', applyTo: 'src/core/**' },
	{ uri: URI.file('/workspace/.github/instructions/error-handling.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Error Handling', description: 'Error handling patterns' },
	{ uri: URI.file('/workspace/.github/instructions/database.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Database', description: 'Database migration and query patterns', applyTo: 'src/db/**' },
	// Instructions — user
	{ uri: URI.file('/user-data/prompts/personal.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData, name: 'Personal Instructions', description: 'VS Code profile instructions' },
	{ uri: URI.file('/home/dev/.copilot/instructions/my-style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'My Style', description: 'Personal coding style' },
	{ uri: URI.file('/home/dev/.copilot/instructions/typescript-rules.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'TypeScript Rules', description: 'Strict TypeScript conventions' },
	{ uri: URI.file('/home/dev/.copilot/instructions/commit-messages.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'Commit Messages', description: 'Conventional commit format' },
	// Instructions — Claude rules
	{ uri: URI.file('/workspace/.claude/rules/code-style.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Code Style', description: 'Claude code style rules' },
	{ uri: URI.file('/workspace/.claude/rules/testing.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Testing', description: 'Claude testing conventions' },
	{ uri: URI.file('/home/dev/.claude/rules/personal.md'), storage: PromptsStorage.user, type: PromptsType.instructions, name: 'Personal', description: 'Personal rules' },
	// Agents — workspace
	{ uri: URI.file('/workspace/.github/agents/reviewer.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Reviewer', description: 'Code review agent' },
	{ uri: URI.file('/workspace/.github/agents/documenter.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Documenter', description: 'Documentation agent' },
	{ uri: URI.file('/workspace/.github/agents/tester.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Tester', description: 'Test generation and validation' },
	{ uri: URI.file('/workspace/.github/agents/refactorer.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Refactorer', description: 'Code refactoring specialist' },
	{ uri: URI.file('/workspace/.github/agents/security-auditor.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Security Auditor', description: 'Security vulnerability scanner' },
	{ uri: URI.file('/workspace/.github/agents/api-designer.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'API Designer', description: 'REST and GraphQL API design' },
	{ uri: URI.file('/workspace/.github/agents/performance-tuner.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, name: 'Performance Tuner', description: 'Performance profiling and optimization' },
	// Agents — user
	{ uri: URI.file('/user-data/prompts/legacy.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData, name: 'Legacy Agent', description: 'VS Code profile agent' },
	{ uri: URI.file('/home/dev/.copilot/agents/planner.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, name: 'Planner', description: 'Project planning agent' },
	{ uri: URI.file('/home/dev/.copilot/agents/debugger.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, name: 'Debugger', description: 'Interactive debugging assistant' },
	{ uri: URI.file('/home/dev/.copilot/agents/nls-helper.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, name: 'NLS Helper', description: 'Natural language searching code for clarity' },
	// Agents - extension (built-in + third-party)
	{ uri: URI.file('/extensions/github.copilot-chat/agents/workspace-guide.agent.md'), storage: PromptsStorage.extension, type: PromptsType.agent, name: 'Workspace Guide', description: 'Built-in workspace exploration agent', extensionId: 'GitHub.copilot-chat', extensionDisplayName: 'GitHub Copilot Chat' },
	{ uri: URI.file('/extensions/acme.tools/agents/api-helper.agent.md'), storage: PromptsStorage.extension, type: PromptsType.agent, name: 'API Helper', description: 'Third-party API agent', extensionId: 'acme.tools', extensionDisplayName: 'Acme Tools' },
	// Skills — workspace
	{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Deploy', description: 'Deployment automation' },
	{ uri: URI.file('/workspace/.github/skills/refactor/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Refactor', description: 'Code refactoring patterns' },
	{ uri: URI.file('/workspace/.github/skills/unit-tests/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Unit Tests', description: 'Test generation and runner integration' },
	{ uri: URI.file('/workspace/.github/skills/ci-fix/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'CI Fix', description: 'Diagnose and fix CI failures' },
	{ uri: URI.file('/workspace/.github/skills/migration/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Migration', description: 'Database migration generation' },
	{ uri: URI.file('/workspace/.github/skills/accessibility/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Accessibility', description: 'ARIA labels and keyboard navigation' },
	{ uri: URI.file('/workspace/.github/skills/docker/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'Docker', description: 'Dockerfile and compose generation' },
	{ uri: URI.file('/workspace/.github/skills/api-docs/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, name: 'API Docs', description: 'OpenAPI spec generation' },
	// Skills — user
	{ uri: URI.file('/home/dev/.copilot/skills/git-workflow/SKILL.md'), storage: PromptsStorage.user, type: PromptsType.skill, name: 'Git Workflow', description: 'Branch and PR workflows' },
	{ uri: URI.file('/home/dev/.copilot/skills/code-review/SKILL.md'), storage: PromptsStorage.user, type: PromptsType.skill, name: 'Code Review', description: 'Structured code review checklist' },
	// Skills - extension (built-in + third-party)
	{ uri: URI.file('/extensions/github.copilot-chat/skills/workspace/SKILL.md'), storage: PromptsStorage.extension, type: PromptsType.skill, name: 'Workspace Search', description: 'Built-in workspace search skill', extensionId: 'GitHub.copilot-chat', extensionDisplayName: 'GitHub Copilot Chat' },
	{ uri: URI.file('/extensions/acme.tools/skills/audit/SKILL.md'), storage: PromptsStorage.extension, type: PromptsType.skill, name: 'Audit', description: 'Third-party audit skill', extensionId: 'acme.tools', extensionDisplayName: 'Acme Tools' },
	// Skills - built-in (sessions bundled skills with UI integrations)
	{ uri: URI.file('/app/skills/act-on-feedback/SKILL.md'), storage: BUILTIN_STORAGE as PromptsStorage, type: PromptsType.skill, name: 'act-on-feedback', description: 'Act on user feedback attached to the current session' },
	{ uri: URI.file('/app/skills/generate-run-commands/SKILL.md'), storage: BUILTIN_STORAGE as PromptsStorage, type: PromptsType.skill, name: 'generate-run-commands', description: 'Generate or modify run commands for the current session' },
	{ uri: URI.file('/app/skills/commit/SKILL.md'), storage: BUILTIN_STORAGE as PromptsStorage, type: PromptsType.skill, name: 'commit', description: 'Commit staged or unstaged changes with an AI-generated commit message' },
	{ uri: URI.file('/app/skills/create-pr/SKILL.md'), storage: BUILTIN_STORAGE as PromptsStorage, type: PromptsType.skill, name: 'create-pr', description: 'Create a pull request for the current session' },
	// Prompts — workspace
	{ uri: URI.file('/workspace/.github/prompts/explain.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Explain', description: 'Explain selected code' },
	{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Review', description: 'Review changes' },
	{ uri: URI.file('/workspace/.github/prompts/fix-bug.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Fix Bug', description: 'Diagnose and fix a bug from issue' },
	{ uri: URI.file('/workspace/.github/prompts/write-tests.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Write Tests', description: 'Generate unit tests for selection' },
	{ uri: URI.file('/workspace/.github/prompts/add-docs.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Add Docs', description: 'Add JSDoc comments to functions' },
	{ uri: URI.file('/workspace/.github/prompts/optimize.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Optimize', description: 'Optimize code for performance' },
	{ uri: URI.file('/workspace/.github/prompts/convert-to-ts.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Convert to TS', description: 'Convert JavaScript to TypeScript' },
	{ uri: URI.file('/workspace/.github/prompts/summarize-pr.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Summarize PR', description: 'Generate PR description from diff' },
	// Prompts — user
	{ uri: URI.file('/user-data/prompts/profile.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData, name: 'Profile Prompt', description: 'VS Code profile prompt' },
	{ uri: URI.file('/home/dev/.copilot/prompts/translate.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, name: 'Translate', description: 'Translate strings for i18n' },
	{ uri: URI.file('/home/dev/.copilot/prompts/commit-msg.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, name: 'Commit Message', description: 'Generate conventional commit' },
	// Prompts - extension (built-in + third-party)
	{ uri: URI.file('/extensions/github.copilot-chat/prompts/trace.prompt.md'), storage: PromptsStorage.extension, type: PromptsType.prompt, name: 'Trace', description: 'Built-in tracing prompt', extensionId: 'GitHub.copilot-chat', extensionDisplayName: 'GitHub Copilot Chat' },
	{ uri: URI.file('/extensions/acme.tools/prompts/lint.prompt.md'), storage: PromptsStorage.extension, type: PromptsType.prompt, name: 'Lint', description: 'Third-party lint prompt', extensionId: 'acme.tools', extensionDisplayName: 'Acme Tools' },
	// Hooks — workspace
	{ uri: URI.file('/workspace/.github/hooks/pre-commit.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'Pre-Commit Lint', description: 'Run linting before commit' },
	{ uri: URI.file('/workspace/.github/hooks/post-save.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'Post-Save Format', description: 'Auto-format on save' },
	{ uri: URI.file('/workspace/.github/hooks/on-test-fail.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'On Test Failure', description: 'Suggest fix when tests fail' },
	{ uri: URI.file('/workspace/.github/hooks/pre-push.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'Pre-Push Check', description: 'Run type-check before push' },
	{ uri: URI.file('/workspace/.github/hooks/post-create.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'Post-Create', description: 'Initialize boilerplate for new files' },
	{ uri: URI.file('/workspace/.github/hooks/on-error.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'On Error', description: 'Log and report unhandled errors' },
	{ uri: URI.file('/workspace/.github/hooks/post-tool-call.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'Post Tool Call', description: 'Echo confirmation after each tool call' },
	{ uri: URI.file('/workspace/.github/hooks/on-build-fail.json'), storage: PromptsStorage.local, type: PromptsType.hook, name: 'On Build Failure', description: 'Auto-diagnose build errors' },
	// Hooks — user
	{ uri: URI.file('/home/dev/.copilot/hooks/daily-summary.json'), storage: PromptsStorage.user, type: PromptsType.hook, name: 'Daily Summary', description: 'Generate daily work summary' },
	{ uri: URI.file('/home/dev/.copilot/hooks/backup-changes.json'), storage: PromptsStorage.user, type: PromptsType.hook, name: 'Backup Changes', description: 'Auto-stash uncommitted changes' },
];

const agentInstructions: IAgentInstructionFile[] = [
	{ uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentInstructionFileType.agentsMd },
	{ uri: URI.file('/workspace/CLAUDE.md'), realPath: undefined, type: AgentInstructionFileType.claudeMd },
	{ uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd },
];

const mcpWorkspaceServers = [
	makeLocalMcpServer(
		'component-explorer',
		'component-explorer',
		LocalMcpServerScope.Workspace,
		'Component fixtures and screenshot tooling',
		{
			type: McpServerType.LOCAL,
			command: 'npm',
			args: ['exec', '--no', '--', 'component-explorer', 'mcp', '-p', './test/componentFixtures/component-explorer.json', '--use-daemon', '-vv'],
		}
	),
	makeLocalMcpServer('mcp-postgres', 'PostgreSQL', LocalMcpServerScope.Workspace, 'Database access'),
	makeLocalMcpServer('mcp-github', 'GitHub', LocalMcpServerScope.Workspace, 'GitHub API'),
	makeLocalMcpServer('mcp-redis', 'Redis', LocalMcpServerScope.Workspace, 'In-memory data store'),
	makeLocalMcpServer('mcp-docker', 'Docker', LocalMcpServerScope.Workspace, 'Container management'),
	makeLocalMcpServer('mcp-slack', 'Slack', LocalMcpServerScope.Workspace, 'Team messaging'),
	makeLocalMcpServer('mcp-jira', 'Jira', LocalMcpServerScope.Workspace, 'Issue tracking'),
	makeLocalMcpServer('mcp-aws', 'AWS', LocalMcpServerScope.Workspace, 'Amazon Web Services'),
	makeLocalMcpServer('mcp-graphql', 'GraphQL', LocalMcpServerScope.Workspace, 'GraphQL API gateway'),
];
const mcpUserServers = [
	makeLocalMcpServer('mcp-web-search', 'Web Search', LocalMcpServerScope.User, 'Search the web'),
	makeLocalMcpServer('mcp-filesystem', 'Filesystem', LocalMcpServerScope.User, 'Local file operations'),
	makeLocalMcpServer('mcp-puppeteer', 'Puppeteer', LocalMcpServerScope.User, 'Browser automation'),
];
const mcpRuntimeServers = [
	{ definition: { id: 'github-copilot-mcp', label: 'GitHub Copilot' }, collection: { id: 'ext.github.copilot/mcp', label: 'ext.github.copilot/mcp' }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Starting }), readDefinitions: () => constObservable({ server: undefined, collection: undefined }), showOutput() { } },
	{ definition: { id: 'mcp-postgres', label: 'PostgreSQL' }, collection: { id: 'workspace-mcp', label: 'Workspace MCP' }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Error }), readDefinitions: () => constObservable({ server: undefined, collection: undefined }), showOutput() { } },
	{ definition: { id: 'mcp-web-search', label: 'Web Search' }, collection: { id: 'user-mcp', label: 'User MCP' }, enablement: constObservable(ContributionEnablementState.DisabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), readDefinitions: () => constObservable({ server: undefined, collection: undefined }), showOutput() { } },
	{ definition: { id: 'mcp-filesystem', label: 'Filesystem' }, collection: { id: 'user-mcp', label: 'User MCP' }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), readDefinitions: () => constObservable({ server: undefined, collection: undefined }), showOutput() { } },
];

const activeSessionMcpServers: FixtureAgentHostMcpServer[] = [
	{ id: 'mcp-top-level:fixture:session:component-explorer', name: 'component-explorer', enabled: true, status: McpServerStatus.Ready, state: { kind: McpServerStatus.Ready }, logOutputChannelId: 'fixture-agent-host', start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() { } },
	{ id: 'mcp-top-level:fixture:session:Remote Browser', name: 'Remote Browser', enabled: true, status: McpServerStatus.AuthRequired, state: { kind: McpServerStatus.AuthRequired, reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.example.com' } }, sourceUri: URI.file('/workspace/.vscode/mcp.json'), logOutputChannelId: 'fixture-agent-host', start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() { } },
	{ id: 'mcp-top-level:fixture:session:Remote Search', name: 'Remote Search', enabled: true, status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: 'Fixture error' } }, logOutputChannelId: 'fixture-agent-host', start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() { } },
];

function makeFixtureTool(id: string, displayName: string, description: string, source: ToolDataSource): IToolData {
	return {
		id,
		displayName,
		modelDescription: description,
		userDescription: description,
		source,
	};
}

const fixtureToolExtension = new class extends mock<IExtension>() {
	override readonly identifier = { id: 'acme.agent-tools', uuid: undefined };
	override readonly displayName = 'Acme Agent Tools';
	override readonly publisherDisplayName = 'Acme';
	override readonly description = 'Issue tracking and deployment tools for agents.';
	override readonly state = ExtensionState.Installed;
	override readonly local = undefined;
}();

const fixtureToolSets: readonly IToolSet[] = [
	{
		id: 'vscode-core-tools',
		referenceName: 'vscode',
		description: 'VS Code',
		detail: 'Built-in editor and workspace tools.',
		icon: Codicon.tools,
		source: ToolDataSource.Internal,
		getTools: () => [
			makeFixtureTool('vscode.readFile', 'Read File', 'Read files from the active workspace.', ToolDataSource.Internal),
			makeFixtureTool('vscode.search', 'Search Workspace', 'Search text and symbols in the workspace.', ToolDataSource.Internal),
			makeFixtureTool('vscode.terminal', 'Run in Terminal', 'Run commands in the integrated terminal.', ToolDataSource.Internal),
		],
	},
	{
		id: 'acme-agent-tools',
		referenceName: 'acme',
		description: 'Acme Agent Tools',
		detail: 'Tools contributed by the Acme extension.',
		icon: Codicon.extensions,
		source: { type: 'extension', label: 'Acme Agent Tools', extensionId: new ExtensionIdentifier('acme.agent-tools') },
		getTools: () => [
			makeFixtureTool('acme.issues', 'Find Issues', 'Find and summarize open issues.', { type: 'extension', label: 'Acme Agent Tools', extensionId: new ExtensionIdentifier('acme.agent-tools') }),
			makeFixtureTool('acme.deploy', 'Create Deployment', 'Create a deployment for the current project.', { type: 'extension', label: 'Acme Agent Tools', extensionId: new ExtensionIdentifier('acme.agent-tools') }),
		],
	},
];

interface IRenderEditorOptions {
	readonly sessionResource: URI;
	readonly isSessionsWindow?: boolean;
	readonly managementSections?: readonly AICustomizationManagementSection[];
	readonly availableHarnesses?: readonly IHarnessDescriptor[];
	readonly selectedSection?: AICustomizationManagementSection;
	readonly customizationSearchQuery?: string;
	readonly mcpSearchQuery?: string;
	readonly toolsSearchQuery?: string;
	readonly migrationPartialSelection?: boolean;
	readonly emptyMigrationUserSection?: boolean;
	readonly emptyWorkspaceSection?: boolean;
	readonly emptyUserSection?: boolean;
	readonly emptyToolExtensions?: boolean;
	readonly scrollToBottom?: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly skillUIIntegrations?: ReadonlyMap<string, string>;
	readonly activeSessionMcpServers?: readonly FixtureAgentHostMcpServer[];
	/** When true, simulates clicking the first list row to enter the embedded editor / detail view. */
	readonly openFirstItem?: boolean;
	readonly openItemLabel?: string;
	readonly editorDisplayMode?: 'preview' | 'raw';
	readonly migrationCategory?: CustomizationMigrationCategoryId;
}

function renderFixtureMarkdown(markdown: string): HTMLElement {
	const container = DOM.$('div.fixture-rendered-markdown');
	const lines = markdown.split(/\r?\n/);
	let index = 0;

	while (index < lines.length) {
		const line = lines[index].trimEnd();
		if (!line.trim()) {
			index++;
			continue;
		}

		if (line.startsWith('## ')) {
			const heading = DOM.append(container, DOM.$('h2'));
			heading.textContent = line.slice(3);
			index++;
			continue;
		}

		if (line.startsWith('- ')) {
			const list = DOM.append(container, DOM.$('ul'));
			while (index < lines.length && lines[index].trimStart().startsWith('- ')) {
				DOM.append(list, DOM.$('li')).textContent = lines[index].trimStart().slice(2);
				index++;
			}
			continue;
		}

		if (line.startsWith('```')) {
			index++;
			const codeLines: string[] = [];
			while (index < lines.length && !lines[index].startsWith('```')) {
				codeLines.push(lines[index]);
				index++;
			}
			const pre = DOM.append(container, DOM.$('pre'));
			DOM.append(pre, DOM.$('code')).textContent = codeLines.join('\n');
			index++;
			continue;
		}

		const paragraph = DOM.append(container, DOM.$('p'));
		paragraph.textContent = line.replace(/\*\*/g, '');
		index++;
	}

	return container;
}

// ============================================================================
// Render helper — creates the full management editor
// ============================================================================

async function renderEditor(ctx: ComponentFixtureContext, options: IRenderEditorOptions): Promise<void> {
	const width = options.width ?? 900;
	const height = options.height ?? 600;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const isSessionsWindow = options.isSessionsWindow ?? false;
	const skillUIIntegrations = options.skillUIIntegrations ?? new Map();
	const managementSections = options.managementSections ?? [
		AICustomizationManagementSection.Plugins,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.Tools,
		AICustomizationManagementSection.Prompts,
	];
	const availableHarnesses = options.availableHarnesses ?? [
		createVSCodeHarnessDescriptor(),
		{
			id: 'agent-host-copilotcli',
			label: 'Copilot',
			icon: ThemeIcon.fromId(Codicon.server.id),
			hiddenSections: [AICustomizationManagementSection.Prompts],
			hideGenerateButton: true,
			itemProvider: createFixtureAgentHostItemProvider(allFiles),
		},
	];

	const allMcpServers = [...mcpWorkspaceServers, ...mcpUserServers];
	const selectedPromptType = options.selectedSection === AICustomizationManagementSection.Agents ? PromptsType.agent
		: options.selectedSection === AICustomizationManagementSection.Skills ? PromptsType.skill
			: options.selectedSection === AICustomizationManagementSection.Instructions ? PromptsType.instructions
				: options.selectedSection === AICustomizationManagementSection.Hooks ? PromptsType.hook
					: options.selectedSection === AICustomizationManagementSection.Prompts ? PromptsType.prompt
						: undefined;
	const fixtureFiles = allFiles
		.filter(file => !(file.type === selectedPromptType && options.emptyWorkspaceSection && file.storage === PromptsStorage.local))
		.filter(file => !(file.type === selectedPromptType && options.emptyUserSection && file.storage === PromptsStorage.user))
		.filter(file => !(options.emptyMigrationUserSection && file.type === PromptsType.prompt && file.storage === PromptsStorage.user))
		.map(file => ({ ...file }));
	const fileContents = createFixtureContentMap(fixtureFiles, agentInstructions);
	fileContents.set(URI.file('/workspace/.vscode/mcp.json'), '{\n\t"servers": {\n\t\t"Remote Browser": {\n\t\t\t"type": "http",\n\t\t\t"url": "https://mcp.example.com"\n\t\t}\n\t}\n}\n');
	const promptFilesDidChangeEmitter = ctx.disposableStore.add(new Emitter<void>());
	const createdFolders = new ResourceSet();

	// Holds a lazy reference to the model service so the ITextModelService mock
	// (registered below) can create real ITextModel instances on demand. The
	// management editor calls `createModelReference` when the user opens an
	// item — fixtureUtils' default mock returns `{ textEditorModel: null }`,
	// which crashes the editor. We populate this after the instantiation
	// service is created.
	const modelServiceRef: { value: IModelService | undefined } = { value: undefined };
	const languageServiceRef: { value: ILanguageService | undefined } = { value: undefined };

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			const harnessService = createMockHarnessService(options.sessionResource, availableHarnesses);
			const agentFeedbackService = createMockAgentFeedbackService();
			const codeReviewService = createMockCodeReviewService();
			registerWorkbenchServices(reg);
			// Enable the structured customization preview setting so the
			// editor exercises the preview-first behavior in fixtures.
			// Also enable customization migration so migration affordances render in
			// screenshot fixtures that depend on agent-host harnesses.
			reg.defineInstance(IConfigurationService, new TestConfigurationService({
				[ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
				[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
				[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
			}));
			reg.define(IListService, ListService);
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() {
				declare readonly _serviceBrand: undefined;
				override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
					const modelService = modelServiceRef.value!;
					const languageService = languageServiceRef.value!;
					let model = modelService.getModel(resource);
					if (!model) {
						const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? 'plaintext';
						const languageSelection = languageService.createById(languageId);
						model = modelService.createModel('', languageSelection, resource);
					}
					const onWillDispose = new Emitter<void>();
					const textEditorModel: IResolvedTextEditorModel = {
						textEditorModel: model,
						onWillDispose: onWillDispose.event,
						isReadonly: () => false,
						isResolved: () => true,
						isDisposed: () => false,
						getLanguageId: () => model.getLanguageId(),
						createSnapshot: () => model.createSnapshot(),
						resolve: async () => { },
						dispose: () => onWillDispose.dispose(),
					};
					return { object: textEditorModel, dispose: () => { } };
				}
				override canHandleResource() { return true; }
				override registerTextModelContentProvider() { return { dispose: () => { } }; }
			}());
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(ICodeReviewService, codeReviewService);
			reg.defineInstance(IChatEditingService, new class extends mock<IChatEditingService>() {
				override readonly editingSessionsObs = constObservable([]);
				override getEditingSession() { return undefined; }
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsService['model']>() {
					override readonly sessions = [];
				}();
				override getSession() { return undefined; }
			}());
			reg.defineInstance(IPromptsService, createMockPromptsService(fixtureFiles, agentInstructions, fileContents, promptFilesDidChangeEmitter.event));
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = isSessionsWindow;
				override readonly welcomePageFeatures = {
					showGettingStartedBanner: true,
				};
				override readonly activeProjectRoot = observableValue('root', URI.file('/workspace'));
				override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
				override getActiveProjectRoot() { return URI.file('/workspace'); }
				override clearOverrideProjectRoot() { }
				override setOverrideProjectRoot() { }
				override readonly managementSections = managementSections;
				override async generateCustomization() { }
				override getSkillUIIntegrations() { return skillUIIntegrations; }
			}());
			reg.defineInstance(ICustomizationHarnessService, harnessService);
			reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService(options.activeSessionMcpServers));
			// AICustomizationItemsModel is the single source of truth for items
			// in the editor. Register the real implementation — it will resolve
			// items via the mock prompts service / harness service above.
			reg.define(IAICustomizationItemsModel, AICustomizationItemsModel);
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override async getCustomizations() { return undefined; }
				override getRegisteredChatSessionItemProviders() { return []; }
				override hasCustomizationsProvider() { return false; }
			}());
			reg.defineInstance(IAutomationService, new class extends mock<IAutomationService>() {
				override readonly automations = constObservable([]);
				override readonly runs = constObservable([]);
				override runsFor() { return constObservable([]); }
			}());
			reg.defineInstance(IAutomationRunner, new class extends mock<IAutomationRunner>() { }());
			reg.defineInstance(IAutomationDialogService, new class extends mock<IAutomationDialogService>() {
				override async showAutomationDialog() { return undefined; }
			}());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = Event.None;
				override getWorkspace(): IWorkspace { return { id: 'test', folders: [] }; }
				override getWorkbenchState(): WorkbenchState { return WorkbenchState.WORKSPACE; }
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
				override async exists(resource: URI) {
					return fileContents.has(resource) || createdFolders.has(resource);
				}
				override async readFile(resource: URI) {
					const value = fileContents.get(resource) ?? '';
					return createFixtureFileContentStat(resource, value);
				}
				override async createFolder(resource: URI) {
					createdFolders.add(resource);
					return createFixtureFileStat(resource, 0, true);
				}
				override async writeFile(resource: URI, buffer: VSBuffer) {
					fileContents.set(resource, buffer.toString());
					createdFolders.add(dirnameUri(resource));
					if (resource.path.endsWith('/SKILL.md') && !fixtureFiles.some(file => file.uri.toString() === resource.toString())) {
						const skillName = resource.path.split('/').at(-2) ?? 'migrated-skill';
						fixtureFiles.push({
							uri: resource,
							storage: resource.path.startsWith('/workspace/') ? PromptsStorage.local : PromptsStorage.user,
							type: PromptsType.skill,
							name: skillName,
							description: `Migrated from prompt ${skillName}`,
						});
					}
					promptFilesDidChangeEmitter.fire();
					return createFixtureFileStat(resource, buffer.byteLength, false);
				}
				override async del(resource: URI) {
					fileContents.delete(resource);
					const fileIndex = fixtureFiles.findIndex(file => file.uri.toString() === resource.toString());
					if (fileIndex >= 0) {
						fixtureFiles.splice(fileIndex, 1);
					}
					promptFilesDidChangeEmitter.fire();
				}
			}());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() {
				override readonly defaultUriScheme = 'file';
				override userHome(): URI;
				override userHome(): Promise<URI>;
				override userHome(): URI | Promise<URI> { return userHome; }
			}());
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() {
				declare readonly _serviceBrand: undefined;
				override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
					const modelService = modelServiceRef.value!;
					const languageService = languageServiceRef.value!;
					let model = modelService.getModel(resource);
					if (!model) {
						const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? 'plaintext';
						const languageSelection = languageService.createById(languageId);
						model = modelService.createModel(fileContents.get(resource) ?? '', languageSelection, resource);
					}
					const onWillDispose = new Emitter<void>();
					const textEditorModel: IResolvedTextEditorModel = {
						textEditorModel: model,
						onWillDispose: onWillDispose.event,
						isReadonly: () => false,
						isResolved: () => true,
						isDisposed: () => false,
						getLanguageId: () => model.getLanguageId(),
						createSnapshot: () => model.createSnapshot(),
						resolve: async () => { },
						dispose: () => onWillDispose.dispose(),
					};
					return { object: textEditorModel, dispose: () => { } };
				}
				override canHandleResource() { return true; }
				override registerTextModelContentProvider() { return { dispose: () => { } }; }
			}());
			reg.defineInstance(IWorkingCopyService, new class extends mock<IWorkingCopyService>() {
				override readonly onDidChangeDirty = Event.None;
				override readonly onDidSave = Event.None;
				override isDirty(_resource: URI) { return false; }
			}());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { }());
			reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
				override readonly toolSets = constObservable(options.emptyToolExtensions ? fixtureToolSets.filter(toolSet => toolSet.source.type !== 'extension') : fixtureToolSets);
			}());
			const fixtureToolState: IToolEnablementState = { toolSets: new Map(), tools: new Map() };
			reg.defineInstance(IAgentHostToolSetEnablementService, new class extends mock<IAgentHostToolSetEnablementService>() {
				override observe() { return constObservable(fixtureToolState); }
				override getState() { return fixtureToolState; }
				override setToolSetEnabled() { }
				override setToolEnabled() { }
			}());
			reg.defineInstance(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
				override readonly local = options.emptyToolExtensions ? [] : [fixtureToolExtension];
				override readonly onChange = Event.None;
			}());
			reg.defineInstance(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
				override canExecuteOnSessionsWindow() { return true; }
			}());
			reg.defineInstance(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = false;
			}());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() { }());
			reg.defineInstance(IViewsService, new class extends mock<IViewsService>() {
				override async openView<T extends {}>(_id: string, _focus?: boolean) { return null as T | null; }
			}());
			reg.defineInstance(IOutputService, new class extends mock<IOutputService>() {
				override async showChannel() { }
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override get lastFocusedWidget() { return undefined; }
				override async reveal() { return false; }
			}());
			reg.defineInstance(IRequestService, new class extends mock<IRequestService>() { }());
			reg.defineInstance(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
				override render(markdown: IMarkdownString | string) {
					const rendered: IRenderedMarkdown = {
						element: renderFixtureMarkdown(typeof markdown === 'string' ? markdown : markdown.value),
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
				override async queryGallery(options?: { text?: string }): Promise<IIterativePager<IWorkbenchMcpServer>> {
					const query = options?.text?.toLowerCase().trim();
					const items = query
						? galleryServers.filter(server => server.label.toLowerCase().includes(query) || server.description.toLowerCase().includes(query))
						: galleryServers;
					return {
						firstPage: { items, hasMore: false },
						async getNextPage() { return { items: [], hasMore: false }; },
					};
				}
				override canInstall() { return true as const; }
				override async install(server: IWorkbenchMcpServer) { return server; }
			}());
			reg.defineInstance(IMcpService, new class extends mock<IMcpService>() {
				override readonly servers = constObservable(mcpRuntimeServers as never[]);
				override readonly enablementModel = {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					readProfileEnabled: () => true,
					setEnabled: () => { },
					remove: () => { },
				};
			}());
			reg.defineInstance(IMcpRegistry, new class extends mock<IMcpRegistry>() {
				override readonly collections = constObservable([]);
				override readonly delegates = constObservable([]);
				override readonly onDidChangeInputs = Event.None;
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable(installedPlugins);
				override readonly enablementModel = undefined as never;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly recommendedPlugins = constObservable(new Set(['Figma@copilot', 'Stripe@copilot']));
				override readonly onDidChangeMarketplaces = Event.None;
				override async fetchMarketplacePlugins() { return marketplacePlugins; }
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() {
				override getPluginInstallUri(plugin: IMarketplacePlugin) {
					return URI.file(`/home/dev/.vscode/agent-plugins/${plugin.source}`);
				}
			}());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly defaultChatAgent = new class extends mock<NonNullable<IProductService['defaultChatAgent']>>() {
					override readonly chatExtensionId = 'GitHub.copilot-chat';
				}();
			}());
		},
	});

	modelServiceRef.value = instantiationService.get(IModelService);
	languageServiceRef.value = instantiationService.get(ILanguageService);
	for (const [uri, content] of fileContents) {
		if (!modelServiceRef.value.getModel(uri)) {
			const model = modelServiceRef.value.createModel(content, null, uri, false);
			ctx.disposableStore.add({ dispose: () => model.dispose() });
		}
	}

	const editor = ctx.disposableStore.add(
		instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup())
	);
	editor.create(ctx.container);
	editor.layout(new Dimension(width, height));

	const editorInput = ctx.disposableStore.add(AICustomizationManagementEditorInput.getOrCreate());
	await editor.setInput(editorInput, undefined, {}, CancellationToken.None);

	if (options.selectedSection) {
		editor.selectSectionById(options.selectedSection);
	}

	if (options.customizationSearchQuery) {
		const input = ctx.container.querySelector('.prompts-content-container input') as HTMLInputElement | null;
		if (input) {
			input.value = options.customizationSearchQuery;
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: options.customizationSearchQuery, inputType: 'insertText' }));
			input.blur();
			await new Promise(resolve => setTimeout(resolve, 300));
		}
	}

	if (options.mcpSearchQuery) {
		const input = ctx.container.querySelector('.mcp-content-container input') as HTMLInputElement | null;
		if (input) {
			await new Promise(resolve => setTimeout(resolve, 100));
			input.value = options.mcpSearchQuery;
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: options.mcpSearchQuery, inputType: 'insertText' }));
			await new Promise(resolve => setTimeout(resolve, 600));
			input.blur();
			for (const scrollbar of ctx.container.querySelectorAll<HTMLElement>('.mcp-content-container .scrollbar')) {
				scrollbar.style.visibility = 'hidden';
			}
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	} else if (options.selectedSection === AICustomizationManagementSection.McpServers) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	if (options.toolsSearchQuery) {
		const input = ctx.container.querySelector('.tools-content-container input') as HTMLInputElement | null;
		if (input) {
			input.value = options.toolsSearchQuery;
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: options.toolsSearchQuery, inputType: 'insertText' }));
			input.blur();
			await new Promise(resolve => setTimeout(resolve, 300));
		}
	}

	if (options.migrationPartialSelection) {
		let firstMigrationCheckbox: HTMLElement | null = null;
		for (let attempt = 0; attempt < 20 && !firstMigrationCheckbox; attempt++) {
			firstMigrationCheckbox = ctx.container.querySelector<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]');
			if (!firstMigrationCheckbox) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
		}
		firstMigrationCheckbox?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.scrollToBottom) {
		editor.revealLastItem();
	}

	if (options.migrationCategory) {
		editor.showCustomizationMigrationPage(options.migrationCategory);
	}

	if (options.openFirstItem) {
		const visibleContent = [...ctx.container.querySelectorAll('.prompts-content-container, .mcp-content-container, .plugin-content-container')]
			.find(node => node instanceof HTMLElement && node.style.display !== 'none') as HTMLElement | undefined;
		const openItemLabel = options.openItemLabel;
		const rowToOpen = openItemLabel
			? [...(visibleContent?.querySelectorAll('.monaco-list-row') ?? [])].find((row): row is HTMLElement => row instanceof HTMLElement && row.textContent?.includes(openItemLabel))
			: visibleContent?.querySelector('.monaco-list-row.ai-customization-list-item, .monaco-list-row.mcp-server-item, .plugin-home-row') as HTMLElement | undefined;
		if (rowToOpen) {
			rowToOpen.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
			rowToOpen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			rowToOpen.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
			rowToOpen.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			if (options.editorDisplayMode === 'raw') {
				const modeButton = ctx.container.querySelector('.editor-mode-button') as HTMLButtonElement | undefined;
				modeButton?.click();
			}
		}
	}
}

// ============================================================================
// MCP Browse Mode — standalone widget with gallery results
// ============================================================================

function makeGalleryServer(id: string, label: string, description: string, publisher: string): IWorkbenchMcpServer {
	const galleryStub = new class extends mock<NonNullable<IWorkbenchMcpServer['gallery']>>() { }();
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = id;
		override readonly name = id;
		override readonly label = label;
		override readonly description = description;
		override readonly publisherDisplayName = publisher;
		override readonly installState = McpServerInstallState.Uninstalled;
		override readonly gallery = galleryStub;
		override readonly local = undefined;
	}();
}

const galleryServers = [
	makeGalleryServer('gallery-postgres', 'PostgreSQL', 'Access PostgreSQL databases with schema inspection and query tools', 'Microsoft'),
	makeGalleryServer('gallery-github', 'GitHub', 'Repository management, issues, pull requests, and code search', 'GitHub'),
	makeGalleryServer('gallery-slack', 'Slack', 'Send messages, manage channels, and search workspace history', 'Slack Technologies'),
	makeGalleryServer('gallery-docker', 'Docker', 'Container lifecycle management and image operations', 'Docker Inc'),
	makeGalleryServer('gallery-filesystem', 'Filesystem', 'Read, write, and navigate local files and directories', 'Microsoft'),
	makeGalleryServer('gallery-brave', 'Brave Search', 'Web and local search powered by the Brave Search API', 'Brave Software'),
	makeGalleryServer('gallery-puppeteer', 'Puppeteer', 'Browser automation with screenshots, navigation, and form filling', 'Google'),
	makeGalleryServer('gallery-memory', 'Memory', 'Knowledge graph for persistent memory across conversations', 'Microsoft'),
	makeGalleryServer('gallery-fetch', 'Fetch', 'Retrieve and convert web content to markdown for analysis', 'Microsoft'),
	makeGalleryServer('gallery-sentry', 'Sentry', 'Error monitoring, issue tracking, and performance tracing', 'Sentry'),
	makeGalleryServer('gallery-sqlite', 'SQLite', 'Query and manage SQLite databases with schema exploration', 'Community'),
	makeGalleryServer('gallery-redis', 'Redis', 'In-memory data store operations and key management', 'Redis Ltd'),
];

async function renderMcpBrowseMode(ctx: ComponentFixtureContext): Promise<void> {
	const width = 650;
	const height = 500;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
				override readonly onChange = Event.None;
				override readonly onReset = Event.None;
				override readonly local: IWorkbenchMcpServer[] = [];
				override async queryLocal() { return []; }
				override canInstall() { return true as const; }
				override async queryGallery(): Promise<IIterativePager<IWorkbenchMcpServer>> {
					return {
						firstPage: { items: galleryServers, hasMore: false },
						async getNextPage() { return { items: [], hasMore: false }; },
					};
				}
			}());
			reg.defineInstance(IMcpService, new class extends mock<IMcpService>() {
				override readonly servers = constObservable([] as never[]);
			}());
			reg.defineInstance(IMcpRegistry, new class extends mock<IMcpRegistry>() {
				override readonly collections = constObservable([]);
				override readonly delegates = constObservable([]);
				override readonly onDidChangeInputs = Event.None;
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
			}());
			reg.defineInstance(IDialogService, new class extends mock<IDialogService>() { }());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = false;
				override readonly welcomePageFeatures = {
					showGettingStartedBanner: true,
				};
				override readonly activeProjectRoot = observableValue('root', URI.file('/workspace'));
				override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
				override getActiveProjectRoot() { return URI.file('/workspace'); }
			}());
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = observableValue<URI>('activeSessionResource', LocalChatSessionUri.getNewSessionUri());
				override readonly activeHarness = derived(reader => getChatSessionType(this.activeSessionResource.read(reader)));
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor(); }
				override registerExternalHarness() { return { dispose() { } }; }
			}());
			reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
			reg.defineInstance(IOutputService, new class extends mock<IOutputService>() {
				override async showChannel() { }
			}());
		},
	});

	const widget = ctx.disposableStore.add(
		instantiationService.createInstance(McpListWidget)
	);
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);

	widget.showBrowseMarketplace();

	// Wait for the gallery query to resolve
	await new Promise(resolve => setTimeout(resolve, 50));
}

// ============================================================================
// Plugin Browse Mode — standalone widget with marketplace results
// ============================================================================

function makeInstalledPlugin(name: string, uri: URI, enablement: boolean | ContributionEnablementState, policyBlocked = false): IAgentPlugin {
	const contributionName = name.toLowerCase().replace(/\s+/g, '-');
	const enablementState = typeof enablement === 'boolean'
		? (enablement ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile)
		: enablement;
	return new class extends mock<IAgentPlugin>() {
		override readonly uri = uri;
		override readonly format = PluginFormat.Copilot;
		override readonly label = name;
		override readonly version = constObservable('1.0.0');
		override readonly enablement = constObservable(enablementState);
		override readonly policyBlocked = constObservable(policyBlocked);
		override readonly hooks = constObservable([]);
		override readonly commands = constObservable([
			{ uri: URI.joinPath(uri, 'commands', `${contributionName}-lookup.md`), name: `${name} lookup`, description: `Search ${name} from chat.` },
			{ uri: URI.joinPath(uri, 'commands', `${contributionName}-summarize.md`), name: `${name} summary`, description: `Summarize recent ${name} activity.` },
		]);
		override readonly skills = constObservable([
			{ uri: URI.joinPath(uri, 'skills', `${contributionName}-triage.md`), name: `${name} triage`, description: `Help triage ${name} workflows.` },
		]);
		override readonly agents = constObservable([
			{ uri: URI.joinPath(uri, 'agents', `${contributionName}.agent.md`), name: `${name} assistant`, description: `An agent specialized for ${name}.` },
		]);
		override readonly instructions = constObservable([
			{ uri: URI.joinPath(uri, 'instructions', `${contributionName}.instructions.md`), name: `${name} instructions`, description: `Context rules for ${name}.` },
		]);
		override readonly mcpServerDefinitions = constObservable([]);
		override remove() { }
	}();
}

const installedPlugins: IAgentPlugin[] = [
	makeInstalledPlugin('Linear', URI.file('/workspace/.copilot/plugins/linear'), true),
	makeInstalledPlugin('Sentry', URI.file('/workspace/.copilot/plugins/sentry'), true),
	makeInstalledPlugin('Datadog', URI.file('/workspace/.copilot/plugins/datadog'), true),
	makeInstalledPlugin('Notion', URI.file('/workspace/.copilot/plugins/notion'), true),
	makeInstalledPlugin('Confluence', URI.file('/workspace/.copilot/plugins/confluence'), true),
	makeInstalledPlugin('PagerDuty', URI.file('/workspace/.copilot/plugins/pagerduty'), false),
	makeInstalledPlugin('LaunchDarkly', URI.file('/workspace/.copilot/plugins/launchdarkly'), true),
	makeInstalledPlugin('CircleCI', URI.file('/workspace/.copilot/plugins/circleci'), true),
	makeInstalledPlugin('Vercel', URI.file('/workspace/.copilot/plugins/vercel'), false),
	makeInstalledPlugin('Supabase', URI.file('/workspace/.copilot/plugins/supabase'), true),
];

function makeMarketplacePlugin(name: string, description: string, repo: string): IMarketplacePlugin {
	return {
		name,
		description,
		version: '1.0.0',
		source: repo,
		sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `example/${repo}` },
		marketplace: 'copilot',
		marketplaceReference: { rawValue: `example/${repo}`, displayLabel: repo, cloneUrl: `https://github.com/example/${repo}.git`, canonicalId: `github:example/${repo}`, cacheSegments: ['example', repo], kind: MarketplaceReferenceKind.GitHubShorthand },
		marketplaceType: MarketplaceType.Copilot,
	};
}

const marketplacePlugins: IMarketplacePlugin[] = [
	makeMarketplacePlugin('Linear', 'Issue tracking and project management integration', 'linear-plugin'),
	makeMarketplacePlugin('Sentry', 'Error monitoring and performance tracing', 'sentry-plugin'),
	makeMarketplacePlugin('Datadog', 'Observability and monitoring dashboards', 'datadog-plugin'),
	makeMarketplacePlugin('Notion', 'Knowledge base and documentation management', 'notion-plugin'),
	makeMarketplacePlugin('Figma', 'Design system inspection and asset export', 'figma-plugin'),
	makeMarketplacePlugin('Stripe', 'Payment processing and billing management', 'stripe-plugin'),
	makeMarketplacePlugin('Twilio', 'Communication APIs for SMS and voice', 'twilio-plugin'),
	makeMarketplacePlugin('Auth0', 'Identity and access management', 'auth0-plugin'),
	makeMarketplacePlugin('Algolia', 'Search and discovery API integration', 'algolia-plugin'),
	makeMarketplacePlugin('LaunchDarkly', 'Feature flag management and experimentation', 'launchdarkly-plugin'),
	makeMarketplacePlugin('PlanetScale', 'Serverless MySQL database management', 'planetscale-plugin'),
	makeMarketplacePlugin('Vercel', 'Deployment and preview environments', 'vercel-plugin'),
];

async function renderPluginCatalog(ctx: ComponentFixtureContext, browse: boolean, searchQuery?: string, width = browse ? 650 : 840, noInstalledPlugins = false): Promise<void> {
	const height = browse ? 600 : 800;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	// Some marketplace plugins match installed plugins by URI so the renderer
	// shows them as "Installed" (exercises the installed-state check from #7379).
	const browseInstalledPlugins = noInstalledPlugins ? [] : [
		makeInstalledPlugin('Linear', URI.file('/home/dev/.vscode/agent-plugins/example/linear-plugin'), true),
		makeInstalledPlugin('Sentry', URI.file('/home/dev/.vscode/agent-plugins/example/sentry-plugin'), true),
		makeInstalledPlugin('Datadog', URI.file('/home/dev/.vscode/agent-plugins/example/datadog-plugin'), false, true),
	];

	// Map plugin source descriptors to install URIs, matching installed URIs above
	const pluginInstallUris = new Map<string, URI>([
		['example/linear-plugin', URI.file('/home/dev/.vscode/agent-plugins/example/linear-plugin')],
		['example/sentry-plugin', URI.file('/home/dev/.vscode/agent-plugins/example/sentry-plugin')],
		['example/datadog-plugin', URI.file('/home/dev/.vscode/agent-plugins/example/datadog-plugin')],
	]);

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = observableValue<URI>('activeSessionResource', LocalChatSessionUri.getNewSessionUri());
				override readonly activeHarness = derived(reader => getChatSessionType(this.activeSessionResource.read(reader)));
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor(); }
				override registerExternalHarness() { return { dispose() { } }; }
			}());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = false;
				override readonly activeProjectRoot = constObservable(URI.file('/workspace'));
				override getActiveProjectRoot() { return URI.file('/workspace'); }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable(browseInstalledPlugins as readonly IAgentPlugin[]);
				override readonly enablementModel = undefined!;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly recommendedPlugins = constObservable(new Set(['Figma@copilot', 'Stripe@copilot']));
				override readonly onDidChangeMarketplaces = Event.None;
				override async fetchMarketplacePlugins() { return marketplacePlugins; }
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() {
				override getPluginInstallUri(plugin: IMarketplacePlugin) {
					const repo = plugin.sourceDescriptor.kind === PluginSourceKind.GitHub ? plugin.sourceDescriptor.repo : undefined;
					return repo ? (pluginInstallUris.get(repo) ?? URI.file('/dev/null')) : URI.file('/dev/null');
				}
			}());
			reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
		},
	});

	const widget = ctx.disposableStore.add(
		instantiationService.createInstance(PluginListWidget, true)
	);
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);

	if (browse) {
		widget.showBrowseMarketplace();
	}
	if (searchQuery) {
		const input = widget.element.querySelector('input') as HTMLInputElement;
		input.value = searchQuery;
		input.dispatchEvent(new InputEvent('input', { bubbles: true, data: searchQuery, inputType: 'insertText' }));
	}

	// Wait for the marketplace query to resolve, then wait for scrollbar fade transition
	// (visible → invisible takes ~2s after programmatic scroll/list populate)
	await new Promise(resolve => setTimeout(resolve, searchQuery ? 600 : 100));
	// Blur the search input to prevent cursor blink instability in screenshots
	(widget.element.querySelector('input') as HTMLElement)?.blur();
	// Force-hide scrollbars to avoid fade-transition instability
	for (const scrollbar of widget.element.querySelectorAll<HTMLElement>('.scrollbar')) {
		scrollbar.style.visibility = 'hidden';
	}
	await new Promise(resolve => setTimeout(resolve, 200));
}

function renderPluginHomeMode(ctx: ComponentFixtureContext): Promise<void> {
	return renderPluginCatalog(ctx, false);
}

function renderPluginBrowseMode(ctx: ComponentFixtureContext): Promise<void> {
	return renderPluginCatalog(ctx, true);
}

function renderPluginSearchMode(ctx: ComponentFixtureContext): Promise<void> {
	return renderPluginCatalog(ctx, false, 'a');
}

function renderPluginHomeNarrowMode(ctx: ComponentFixtureContext): Promise<void> {
	return renderPluginCatalog(ctx, false, undefined, 420);
}

function renderPluginHomeEmptyInstalledMode(ctx: ComponentFixtureContext): Promise<void> {
	return renderPluginCatalog(ctx, false, undefined, 840, true);
}

// ============================================================================
// MCP / Plugin Disabled (access blocked) splash
// ============================================================================

function createDisabledConfigService(key: string, disabledValue: unknown, byPolicy: boolean): IConfigurationService {
	return new class extends mock<IConfigurationService>() {
		override readonly onDidChangeConfiguration = Event.None;
		override getValue<T>(arg1?: string | object, _arg2?: object): T {
			const k = typeof arg1 === 'string' ? arg1 : undefined;
			return (k === key ? disabledValue : undefined) as T;
		}
		override inspect<T>(k: string): IConfigurationValue<T> {
			if (k !== key) {
				return { value: undefined, defaultValue: undefined };
			}
			return {
				value: disabledValue as T,
				defaultValue: disabledValue as T,
				policyValue: byPolicy ? (disabledValue as T) : undefined,
			};
		}
	}();
}

function renderMcpDisabled(ctx: ComponentFixtureContext, byPolicy: boolean): void {
	const width = 650;
	const height = 500;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IConfigurationService, createDisabledConfigService(mcpAccessConfig, McpAccessValue.None, byPolicy));
			reg.defineInstance(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
				override readonly onChange = Event.None;
				override readonly onReset = Event.None;
				override readonly local: IWorkbenchMcpServer[] = [];
			}());
			reg.defineInstance(IMcpService, new class extends mock<IMcpService>() {
				override readonly servers = constObservable([] as never[]);
			}());
			reg.defineInstance(IMcpRegistry, new class extends mock<IMcpRegistry>() {
				override readonly collections = constObservable([]);
				override readonly delegates = constObservable([]);
				override readonly onDidChangeInputs = Event.None;
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
			}());
			reg.defineInstance(IDialogService, new class extends mock<IDialogService>() { }());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = false;
				override readonly welcomePageFeatures = { showGettingStartedBanner: true };
				override readonly activeProjectRoot = observableValue('root', URI.file('/workspace'));
				override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
				override getActiveProjectRoot() { return URI.file('/workspace'); }
			}());
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = observableValue<URI>('activeSessionResource', LocalChatSessionUri.getNewSessionUri());
				override readonly activeHarness = derived(reader => getChatSessionType(this.activeSessionResource.read(reader)));
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor(); }
				override registerExternalHarness() { return { dispose() { } }; }
			}());
			reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
			reg.defineInstance(IOutputService, new class extends mock<IOutputService>() {
				override async showChannel() { }
			}());
		},
	});

	const widget = ctx.disposableStore.add(instantiationService.createInstance(McpListWidget));
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);
}

function renderPluginDisabled(ctx: ComponentFixtureContext, byPolicy: boolean): void {
	const width = 650;
	const height = 500;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IConfigurationService, createDisabledConfigService(ChatConfiguration.PluginsEnabled, false, byPolicy));
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = observableValue<URI>('activeSessionResource', LocalChatSessionUri.getNewSessionUri());
				override readonly activeHarness = derived(reader => getChatSessionType(this.activeSessionResource.read(reader)));
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor(); }
				override registerExternalHarness() { return { dispose() { } }; }
			}());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = false;
				override readonly activeProjectRoot = constObservable(URI.file('/workspace'));
				override getActiveProjectRoot() { return URI.file('/workspace'); }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
				override readonly enablementModel = undefined!;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly recommendedPlugins = constObservable(new Set<string>());
				override readonly onDidChangeMarketplaces = Event.None;
				override async fetchMarketplacePlugins() { return []; }
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() { }());
			reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
		},
	});

	const widget = ctx.disposableStore.add(instantiationService.createInstance(PluginListWidget, undefined));
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);
}

// ============================================================================
// Embedded compact detail widgets — standalone (no host editor)
// ============================================================================

function renderEmbeddedMcpDetail(ctx: ComponentFixtureContext, server: IWorkbenchMcpServer | undefined): void {
	const width = 480;
	const height = 320;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
				override readonly onChange = Event.None;
				override readonly onReset = Event.None;
				override readonly local: IWorkbenchMcpServer[] = server ? [server] : [];
				override async open() { /* no-op in fixture */ }
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { }());
		},
	});

	// Mirror the host editor's class so the scoped CSS selectors apply.
	const host = DOM.append(ctx.container, DOM.$('.ai-customization-management-editor'));
	host.style.height = '100%';
	host.style.width = '100%';
	host.style.overflow = 'auto';

	const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedMcpServerDetail, host));
	if (server) {
		detail.setInput(createWorkbenchMcpServerDetailInput(server));
	}
}

function renderEmbeddedPluginDetail(ctx: ComponentFixtureContext, item: IAgentPluginItem | undefined): void {
	const width = 480;
	const height = 320;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeHarness = constObservable('local');
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor(); }
			}());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly isSessionsWindow = false;
				override readonly activeProjectRoot = constObservable(URI.file('/workspace'));
				override getActiveProjectRoot() { return URI.file('/workspace'); }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable(item?.kind === AgentPluginItemKind.Installed ? [item.plugin] : []);
				override readonly enablementModel = undefined!;
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() { }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override async readFile(): Promise<IFileContent> { throw new Error('Fixture README not found'); }
			}());
			reg.defineInstance(IRequestService, new class extends mock<IRequestService>() {
				override async request(): Promise<IRequestContext> { throw new Error('Fixture request unavailable'); }
			}());
			reg.defineInstance(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
				override render(markdown: IMarkdownString | string) {
					return {
						element: renderFixtureMarkdown(typeof markdown === 'string' ? markdown : markdown.value),
						dispose() { },
					};
				}
			}());
		},
	});

	const host = DOM.append(ctx.container, DOM.$('.ai-customization-management-editor'));
	host.style.height = '100%';
	host.style.width = '100%';
	host.style.overflow = 'auto';

	const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedAgentPluginDetail, host));
	if (item) {
		detail.setInput(item);
	}
}

function makeInstalledPluginItem(name: string, description: string, enablement = ContributionEnablementState.EnabledProfile, policyBlocked = false): IAgentPluginItem {
	return {
		kind: AgentPluginItemKind.Installed,
		name,
		description,
		marketplace: 'GitHub',
		plugin: makeInstalledPlugin(name, URI.file(`/workspace/.copilot/plugins/${name.toLowerCase()}`), enablement, policyBlocked),
	};
}

function makeMarketplacePluginItem(name: string, description: string): IAgentPluginItem {
	return {
		kind: AgentPluginItemKind.Marketplace,
		name,
		description,
		version: '2.0.0',
		source: 'GitHub',
		sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `acme/${name.toLowerCase()}` },
		marketplace: 'GitHub',
		marketplaceType: MarketplaceType.Copilot,
		marketplaceReference: {
			rawValue: `acme/${name.toLowerCase()}`,
			displayLabel: `acme/${name.toLowerCase()}`,
			cloneUrl: `https://github.com/acme/${name.toLowerCase()}`,
			canonicalId: `github:acme/${name.toLowerCase()}`,
			cacheSegments: ['github', 'acme', name.toLowerCase()],
			kind: MarketplaceReferenceKind.GitHubShorthand,
			githubRepo: `acme/${name.toLowerCase()}`,
		},
	};
}

// ============================================================================
// Fixtures
// ============================================================================

const localSessionResource = LocalChatSessionUri.getNewSessionUri();
const agentHostCopilotSessionResource = URI.from({ scheme: 'agent-host-copilotcli', path: '/fixture-session' });

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {



	// Welcome page — default state with no section selected
	WelcomePage: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, { sessionResource: localSessionResource }),
	}),

	WelcomePageNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, { sessionResource: localSessionResource, width: 550, height: 500 }),
	}),

	// Full editor with Local (VS Code) harness — all sections visible, harness dropdown,
	// Generate buttons, AGENTS.md shortcut, all storage groups
	LocalHarness: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, { sessionResource: localSessionResource, selectedSection: AICustomizationManagementSection.Agents }),
	}),

	// Agent-host welcome page variant that highlights local prompt files which
	// need to be migrated because the active harness only consumes skills.
	AgentHostPromptMigration: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
		}),
	}),

	// Sessions-window variant of the full editor with workspace override UX
	// and sessions section ordering.
	Sessions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.Agents,
			availableHarnesses: [
				createVSCodeHarnessDescriptor(),
			],
			managementSections: [
				AICustomizationManagementSection.Plugins,
				AICustomizationManagementSection.McpServers,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.Instructions,
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Hooks,
				AICustomizationManagementSection.Tools,
				AICustomizationManagementSection.Prompts,
			],
		}),
	}),

	// Sessions Skills tab showing UI Integration badges on built-in skills
	SessionsSkillsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.Skills,
			availableHarnesses: [
				createVSCodeHarnessDescriptor(),
			],
			managementSections: [
				AICustomizationManagementSection.Plugins,
				AICustomizationManagementSection.McpServers,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.Instructions,
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Hooks,
				AICustomizationManagementSection.Tools,
				AICustomizationManagementSection.Prompts,
			],
			skillUIIntegrations: new Map([
				['act-on-feedback', 'Used by the Submit Feedback button in the Changes toolbar'],
				['generate-run-commands', 'Used by the Run button in the title bar'],
			]),
		}),
	}),

	// MCP Servers tab with many servers to verify scrollable list layout
	McpServersTab: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
		}),
	}),

	McpServersSearch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
			mcpSearchQuery: 'search',
		}),
	}),

	McpServersTabActiveSession: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.McpServers,
			activeSessionMcpServers,
		}),
	}),

	McpServersAuthRequired: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.McpServers,
			activeSessionMcpServers,
			mcpSearchQuery: 'Remote Browser',
		}),
	}),

	McpServerActiveSessionDetail: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.McpServers,
			activeSessionMcpServers,
			mcpSearchQuery: 'Remote Browser',
			openFirstItem: true,
		}),
	}),

	// Agents tab — workspace and user agents, scrollable
	AgentsTab: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
		}),
	}),

	AgentsSearch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
			customizationSearchQuery: 'review',
		}),
	}),

	AgentsEmptyUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
			emptyUserSection: true,
		}),
	}),

	// Skills tab — workspace and user skills, scrollable
	SkillsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Skills,
		}),
	}),

	RemoteSkillsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			selectedSection: AICustomizationManagementSection.Skills,
		}),
	}),

	// Instructions tab — many instructions with applyTo patterns, scrollable
	InstructionsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Instructions,
		}),
	}),

	// Hooks tab — workspace and user hooks, scrollable
	HooksTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Hooks,
		}),
	}),

	HooksEmptyWorkspace: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Hooks,
			emptyWorkspaceSection: true,
		}),
	}),

	// Prompts tab — workspace and user prompts, scrollable
	PromptsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Prompts,
		}),
	}),

	PromptsTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Prompts,
			width: 550,
			height: 500,
		}),
	}),

	PromptMigration: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			migrationCategory: CustomizationMigrationCategoryId.PromptFiles,
		}),
	}),

	PromptMigrationNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			migrationCategory: CustomizationMigrationCategoryId.PromptFiles,
			width: 550,
			height: 500,
		}),
	}),

	PromptMigrationPartialSelection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			migrationCategory: CustomizationMigrationCategoryId.PromptFiles,
			migrationPartialSelection: true,
		}),
	}),

	PromptMigrationEmptyUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			migrationCategory: CustomizationMigrationCategoryId.PromptFiles,
			emptyMigrationUserSection: true,
		}),
	}),

	ToolsTab: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Tools,
			availableHarnesses: [{ ...createVSCodeHarnessDescriptor(), hiddenSections: [] }],
			managementSections: [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Tools,
			],
		}),
	}),

	ToolsTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Tools,
			availableHarnesses: [{ ...createVSCodeHarnessDescriptor(), hiddenSections: [] }],
			managementSections: [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Tools,
			],
			width: 550,
			height: 500,
		}),
	}),

	ToolsSearchEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Tools,
			availableHarnesses: [{ ...createVSCodeHarnessDescriptor(), hiddenSections: [] }],
			managementSections: [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Tools,
			],
			toolsSearchQuery: 'no such tool',
		}),
	}),

	ToolsEmptyExtensions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Tools,
			availableHarnesses: [{ ...createVSCodeHarnessDescriptor(), hiddenSections: [] }],
			managementSections: [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Tools,
			],
			emptyToolExtensions: true,
		}),
	}),

	UserDataMigration: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: agentHostCopilotSessionResource,
			migrationCategory: CustomizationMigrationCategoryId.UserData,
		}),
	}),

	// Plugins tab
	PluginsTab: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Plugins,
		}),
	}),

	SessionsPluginsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.Plugins,
			availableHarnesses: [
				createVSCodeHarnessDescriptor(),
			],
		}),
	}),

	// MCP browse/marketplace mode — standalone widget with gallery results, scrollable
	// Verifies fix for https://github.com/microsoft/vscode/issues/304139
	McpBrowseMode: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderMcpBrowseMode,
	}),

	// Plugin browse/marketplace mode — standalone widget with marketplace results, scrollable
	PluginBrowseMode: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderPluginBrowseMode,
	}),

	PluginCatalogHome: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderPluginHomeMode,
	}),

	PluginCatalogSearch: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderPluginSearchMode,
	}),

	PluginCatalogHomeNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderPluginHomeNarrowMode,
	}),

	PluginCatalogHomeEmptyInstalled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderPluginHomeEmptyInstalledMode,
	}),

	// MCP disabled splash — chat.mcp.access set to 'none' by user
	McpDisabledByUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderMcpDisabled(ctx, false),
	}),

	// MCP disabled splash — chat.mcp.access locked to 'none' by enterprise policy
	McpDisabledByPolicy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderMcpDisabled(ctx, true),
	}),

	// Plugins disabled splash — chat.plugins.enabled=false by user
	PluginsDisabledByUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderPluginDisabled(ctx, false),
	}),

	// Plugins disabled splash — chat.plugins.enabled locked to false by enterprise policy
	PluginsDisabledByPolicy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderPluginDisabled(ctx, true),
	}),

	// Scrolled-to-bottom variants — verify last items are fully visible above footer
	PromptsTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Prompts,
			scrollToBottom: true,
		}),
	}),

	McpServersTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
			scrollToBottom: true,
		}),
	}),

	PluginsTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Plugins,
			scrollToBottom: true,
		}),
	}),

	// Narrow viewport — catches badge clipping and layout overflow at small sizes
	McpServersTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
			width: 550,
			height: 400,
		}),
	}),

	AgentsTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
			width: 550,
			height: 400,
		}),
	}),

	PluginsTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Plugins,
			width: 550,
			height: 400,
		}),
	}),

	// Item-preview view (after clicking an agent) — verifies the structured front
	// matter preview and rendered markdown body.
	AgentsItemPreview: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
			openFirstItem: true,
		}),
	}),

	// Raw markdown editor view reached from the structured preview's Edit action.
	AgentsItemRaw: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Agents,
			openFirstItem: true,
			editorDisplayMode: 'raw',
		}),
	}),

	// Built-in skill preview view — verifies that built-in skills open in the
	// structured preview while still offering an editable raw override path.
	BuiltinSkillItemPreview: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Skills,
			openFirstItem: true,
			openItemLabel: 'act-on-feedback',
		}),
	}),

	// Built-in skill raw view reached from the structured preview's Edit action.
	BuiltinSkillItemRaw: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Skills,
			openFirstItem: true,
			openItemLabel: 'act-on-feedback',
			editorDisplayMode: 'raw',
		}),
	}),

	// MCP definition editor — matches the standard customization file editor layout.
	McpServerDetail: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
			openFirstItem: true,
		}),
	}),

	// Narrow MCP editor — catches header overflow and editor framing regressions.
	McpServerDetailNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.McpServers,
			openFirstItem: true,
			width: 550,
			height: 400,
		}),
	}),

	// Plugin detail view — same alignment check for the detail back button.
	PluginDetail: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Plugins,
			openFirstItem: true,
		}),
	}),

	PluginDetailNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			sessionResource: localSessionResource,
			selectedSection: AICustomizationManagementSection.Plugins,
			openFirstItem: true,
			width: 550,
			height: 400,
		}),
	}),

	// Standalone embedded MCP detail widget with a workspace stdio definition.
	EmbeddedMcpDetailWorkspace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer('mcp-postgres', 'PostgreSQL', LocalMcpServerScope.Workspace, 'Database access for the active workspace', {
			type: McpServerType.LOCAL,
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-postgres'],
		})),
	}),

	// Standalone embedded MCP detail widget with a user HTTP definition.
	EmbeddedMcpDetailUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer('mcp-web-search', 'Web Search', LocalMcpServerScope.User, 'Search the web from any session', {
			type: McpServerType.REMOTE,
			url: 'https://mcp.example.com/search',
		})),
	}),

	// Standalone embedded MCP detail widget — empty / no input state.
	EmbeddedMcpDetailEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedMcpDetail(ctx, undefined),
	}),

	// Standalone embedded plugin detail widget — installed plugin.
	EmbeddedPluginDetailInstalled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedPluginDetail(ctx, makeInstalledPluginItem('Linear', 'Issue tracking and project management integration')),
	}),

	EmbeddedPluginDetailExcludedWorkspace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedPluginDetail(ctx, makeInstalledPluginItem('PagerDuty', 'Incident response and on-call management', ContributionEnablementState.DisabledWorkspace)),
	}),

	EmbeddedPluginDetailPolicyBlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedPluginDetail(ctx, makeInstalledPluginItem('Deployment Guard', 'Deployment controls managed by your organization', ContributionEnablementState.DisabledProfile, true)),
	}),

	// Standalone embedded plugin detail widget — marketplace plugin.
	EmbeddedPluginDetailMarketplace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedPluginDetail(ctx, makeMarketplacePluginItem('Sentry', 'Error monitoring and performance tracing')),
	}),

	// Standalone embedded plugin detail widget — empty / no input state.
	EmbeddedPluginDetailEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEmbeddedPluginDetail(ctx, undefined),
	}),
});
