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
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, IHarnessDescriptor, createVSCodeHarnessDescriptor, createClaudeHarnessDescriptor, createCliHarnessDescriptor, getCliUserRoots, getClaudeUserRoots } from '../../../contrib/chat/common/customizationHarnessService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, IAgentInstructionFile, AgentInstructionFileType, PromptsStorage, IAgentSkill, IChatPromptSlashCommand } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ParsedPromptFile } from '../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { IAgentPluginService, IAgentPlugin } from '../../../contrib/chat/common/plugins/agentPluginService.js';
import { IPluginMarketplaceService, IMarketplacePlugin, MarketplaceType, PluginSourceKind } from '../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { MarketplaceReferenceKind } from '../../../contrib/chat/common/plugins/marketplaceReference.js';
import { IPluginInstallService } from '../../../contrib/chat/common/plugins/pluginInstallService.js';
import { AICustomizationManagementEditor } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { ContributionEnablementState } from '../../../contrib/chat/common/enablement.js';
import { AICustomizationManagementEditorInput } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, IMcpService, McpServerInstallState } from '../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../contrib/mcp/common/mcpRegistryTypes.js';
import { IWorkbenchLocalMcpServer, LocalMcpServerScope } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { McpListWidget } from '../../../contrib/chat/browser/aiCustomization/mcpListWidget.js';
import { PluginListWidget } from '../../../contrib/chat/browser/aiCustomization/pluginListWidget.js';
import { IIterativePager } from '../../../../base/common/paging.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICodeReviewService } from '../../../../sessions/contrib/codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from './sessions/mockCodeReviewService.js';
import { IChatEditingService } from '../../../contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
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
	readonly extensionId?: string;
	readonly extensionDisplayName?: string;
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
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

function createMockPromptsService(files: IFixtureFile[], agentInstructions: IAgentInstructionFile[]): IPromptsService {
	const applyToMap = new ResourceMap<string | undefined>();
	const descriptionMap = new ResourceMap<string | undefined>();
	for (const f of files) { applyToMap.set(f.uri, f.applyTo); descriptionMap.set(f.uri, f.description); }
	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;
		override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
		override async listPromptFiles(type: PromptsType, _token: CancellationToken) {
			return files.filter(f => f.type === type).map(f => ({
				uri: f.uri,
				storage: f.storage as PromptsStorage.local,
				type: f.type,
				name: f.name,
				description: f.description,
				extension: toExtensionInfo(f) as never,
			}));
		}
		override async listAgentInstructions() { return agentInstructions; }
		override async getCustomAgents() {
			return files.filter(f => f.type === PromptsType.agent).map(a => ({
				uri: a.uri, name: a.name ?? 'agent', description: a.description, storage: a.storage,
				source: {
					storage: a.storage,
					extensionId: a.extensionId ? new ExtensionIdentifier(a.extensionId) : undefined,
				},
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
		override async findAgentSkills(): Promise<IAgentSkill[]> {
			return files.filter(f => f.type === PromptsType.skill).map(f => ({
				uri: f.uri,
				storage: f.storage,
				name: f.name ?? 'skill',
				description: f.description,
				disableModelInvocation: false,
				userInvocable: true,
				when: undefined,
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
					when: undefined,
				} satisfies IChatPromptSlashCommand;
			}));
			return commands;
		}
	}();
}

function createMockHarnessService(activeHarness: CustomizationHarness, descriptors: readonly IHarnessDescriptor[]): ICustomizationHarnessService {
	const active = observableValue<string>('activeHarness', activeHarness);
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
		override setActiveHarness(id: string) { active.set(id, undefined); }
		override registerExternalHarness() { return { dispose() { } }; }
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

function createMockAgentFeedbackService(): IAgentFeedbackService {
	return new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeNavigation = Event.None;
		override getFeedback() { return []; }
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
	{ definition: { id: 'github-copilot-mcp', label: 'GitHub Copilot' }, collection: { id: 'ext.github.copilot/mcp', label: 'ext.github.copilot/mcp' }, enablement: constObservable(2), connectionState: constObservable({ state: 2 }) },
];

interface IRenderEditorOptions {
	readonly harness: CustomizationHarness;
	readonly isSessionsWindow?: boolean;
	readonly managementSections?: readonly AICustomizationManagementSection[];
	readonly availableHarnesses?: readonly IHarnessDescriptor[];
	readonly selectedSection?: AICustomizationManagementSection;
	readonly scrollToBottom?: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly skillUIIntegrations?: ReadonlyMap<string, string>;
}

async function waitForAnimationFrames(count: number): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
	}
}

function getVisibleEditorSignature(container: HTMLElement): string {
	const sectionCounts = [...container.querySelectorAll('.section-list-item')].map(item => item.textContent?.replace(/\s+/g, ' ').trim() ?? '').join('|');
	const visibleContent = [...container.querySelectorAll('.prompts-content-container, .mcp-content-container, .plugin-content-container')]
		.find(node => node instanceof HTMLElement && node.style.display !== 'none');
	const visibleRows = visibleContent
		? [...visibleContent.querySelectorAll('.monaco-list-row')].map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '').join('|')
		: '';

	return `${sectionCounts}@@${visibleRows}`;
}

async function waitForEditorToSettle(container: HTMLElement): Promise<void> {
	let previousSignature = '';
	let stableIterations = 0;

	await new Promise(resolve => setTimeout(resolve, 150));

	for (let i = 0; i < 20; i++) {
		await waitForAnimationFrames(2);
		await new Promise(resolve => setTimeout(resolve, 25));

		const signature = getVisibleEditorSignature(container);
		if (signature && signature === previousSignature) {
			stableIterations++;
			if (stableIterations >= 2) {
				return;
			}
		} else {
			stableIterations = 0;
			previousSignature = signature;
		}
	}
}

async function waitForVisibleScrollbarsToFade(container: HTMLElement): Promise<void> {
	const deadline = Date.now() + 4000;

	while (Date.now() < deadline) {
		const hasVisibleScrollbar = [...container.querySelectorAll<HTMLElement>('.scrollbar.vertical')].some(scrollbar => {
			const style = mainWindow.getComputedStyle(scrollbar);
			return scrollbar.classList.contains('visible') && style.opacity !== '0';
		});

		if (!hasVisibleScrollbar) {
			return;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}
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
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Plugins,
	];
	const availableHarnesses = options.availableHarnesses ?? [
		createVSCodeHarnessDescriptor([PromptsStorage.extension, BUILTIN_STORAGE]),
		createCliHarnessDescriptor(getCliUserRoots(userHome), []),
		createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), []),
	];

	const allMcpServers = [...mcpWorkspaceServers, ...mcpUserServers];

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			const harnessService = createMockHarnessService(options.harness, availableHarnesses);
			const agentFeedbackService = createMockAgentFeedbackService();
			const codeReviewService = createMockCodeReviewService();
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(ICodeReviewService, codeReviewService);
			reg.defineInstance(IChatEditingService, new class extends mock<IChatEditingService>() {
				override readonly editingSessionsObs = constObservable([]);
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsService['model']>() {
					override readonly sessions = [];
				}();
				override getSession() { return undefined; }
			}());
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
				override getSkillUIIntegrations() { return skillUIIntegrations; }
			}());
			reg.defineInstance(ICustomizationHarnessService, harnessService);
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override async getCustomizations() { return undefined; }
				override getRegisteredChatSessionItemProviders() { return []; }
				override hasCustomizationsProvider() { return false; }
			}());
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
				override readonly plugins = constObservable(installedPlugins);
				override readonly enablementModel = undefined as never;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly onDidChangeMarketplaces = Event.None;
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() { }());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly defaultChatAgent = new class extends mock<NonNullable<IProductService['defaultChatAgent']>>() {
					override readonly chatExtensionId = 'GitHub.copilot-chat';
				}();
			}());
		},
	});

	const editor = ctx.disposableStore.add(
		instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup())
	);
	editor.create(ctx.container);
	editor.layout(new Dimension(width, height));

	await editor.setInput(AICustomizationManagementEditorInput.getOrCreate(), undefined, {}, CancellationToken.None);

	if (options.selectedSection) {
		editor.selectSectionById(options.selectedSection);
	}

	await waitForEditorToSettle(ctx.container);

	if (options.scrollToBottom) {
		editor.revealLastItem();
		await waitForAnimationFrames(2);
		await new Promise(resolve => setTimeout(resolve, 2400));
		await waitForVisibleScrollbarsToFade(ctx.container);
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
				override readonly activeProjectRoot = observableValue('root', URI.file('/workspace'));
				override readonly hasOverrideProjectRoot = observableValue('hasOverride', false);
				override getActiveProjectRoot() { return URI.file('/workspace'); }
				override getStorageSourceFilter() {
					return { sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin] };
				}
			}());
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeHarness = observableValue<string>('activeHarness', CustomizationHarness.VSCode);
				override getActiveDescriptor() { return createVSCodeHarnessDescriptor([PromptsStorage.extension, BUILTIN_STORAGE]); }
				override registerExternalHarness() { return { dispose() { } }; }
			}());
		},
	});

	const widget = ctx.disposableStore.add(
		instantiationService.createInstance(McpListWidget)
	);
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);

	// Click the Browse Marketplace button to enter browse mode
	const browseButton = widget.element.querySelector('.list-add-button') as HTMLElement;
	browseButton?.click();

	// Wait for the gallery query to resolve
	await new Promise(resolve => setTimeout(resolve, 50));
}

// ============================================================================
// Plugin Browse Mode — standalone widget with marketplace results
// ============================================================================

function makeInstalledPlugin(name: string, uri: URI, enabled: boolean): IAgentPlugin {
	return new class extends mock<IAgentPlugin>() {
		override readonly uri = uri;
		override readonly label = name;
		override readonly enablement = constObservable(enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile);
		override readonly hooks = constObservable([]);
		override readonly commands = constObservable([]);
		override readonly skills = constObservable([]);
		override readonly agents = constObservable([]);
		override readonly instructions = constObservable([]);
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

async function renderPluginBrowseMode(ctx: ComponentFixtureContext): Promise<void> {
	const width = 650;
	const height = 500;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([] as readonly IAgentPlugin[]);
				override readonly enablementModel = undefined!;
			}());
			reg.defineInstance(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = constObservable([]);
				override readonly onDidChangeMarketplaces = Event.None;
				override async fetchMarketplacePlugins() { return marketplacePlugins; }
			}());
			reg.defineInstance(IPluginInstallService, new class extends mock<IPluginInstallService>() {
				override getPluginInstallUri() { return URI.file('/dev/null'); }
			}());
		},
	});

	const widget = ctx.disposableStore.add(
		instantiationService.createInstance(PluginListWidget)
	);
	ctx.container.appendChild(widget.element);
	widget.layout(height, width);

	// Click the Browse Marketplace button to enter browse mode
	const browseButton = widget.element.querySelector('.list-add-button') as HTMLElement;
	browseButton?.click();

	// Wait for the marketplace query to resolve
	await new Promise(resolve => setTimeout(resolve, 50));
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {

	// Full editor with Local (VS Code) harness — all sections visible, harness dropdown,
	// Generate buttons, AGENTS.md shortcut, all storage groups
	LocalHarness: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
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

	// Sessions Skills tab showing UI Integration badges on built-in skills
	SessionsSkillsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.CLI,
			isSessionsWindow: true,
			selectedSection: AICustomizationManagementSection.Skills,
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
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.McpServers,
		}),
	}),

	// Agents tab — workspace and user agents, scrollable
	AgentsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Agents,
		}),
	}),

	// Skills tab — workspace and user skills, scrollable
	SkillsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Skills,
		}),
	}),

	// Instructions tab — many instructions with applyTo patterns, scrollable
	InstructionsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Instructions,
		}),
	}),

	// Hooks tab — workspace and user hooks, scrollable
	HooksTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Hooks,
		}),
	}),

	// Prompts tab — workspace and user prompts, scrollable
	PromptsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Prompts,
		}),
	}),

	// Plugins tab
	PluginsTab: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Plugins,
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

	// Scrolled-to-bottom variants — verify last items are fully visible above footer
	PromptsTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Prompts,
			scrollToBottom: true,
		}),
	}),

	McpServersTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.McpServers,
			scrollToBottom: true,
		}),
	}),

	PluginsTabScrolled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Plugins,
			scrollToBottom: true,
		}),
	}),

	// Narrow viewport — catches badge clipping and layout overflow at small sizes
	McpServersTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.McpServers,
			width: 550,
			height: 400,
		}),
	}),

	AgentsTabNarrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: ctx => renderEditor(ctx, {
			harness: CustomizationHarness.VSCode,
			selectedSection: AICustomizationManagementSection.Agents,
			width: 550,
			height: 400,
		}),
	}),
});
