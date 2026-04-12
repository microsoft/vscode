/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IWebviewService } from '../../../../contrib/webview/browser/webview.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, createVSCodeHarnessDescriptor, createClaudeHarnessDescriptor, createCliHarnessDescriptor, getCliUserRoots, getClaudeUserRoots } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ParsedPromptFile } from '../../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { IAgentPluginService } from '../../../../contrib/chat/common/plugins/agentPluginService.js';
import { IPluginMarketplaceService } from '../../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../../../contrib/chat/common/plugins/pluginInstallService.js';
import { AICustomizationManagementEditor } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IMcpWorkbenchService, IMcpService } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpListWidget } from '../../../../contrib/chat/browser/aiCustomization/mcpListWidget.js';
import { PluginListWidget } from '../../../../contrib/chat/browser/aiCustomization/pluginListWidget.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICodeReviewService } from '../../../../../sessions/contrib/codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from './mockCodeReviewService.js';
import { IChatEditingService } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
// Ensure theme colors & widget CSS are loaded
import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';
import '../../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';
// ============================================================================
// Mock helpers
// ============================================================================
const userHome = URI.file('/home/dev');
const BUILTIN_STORAGE = 'builtin';
function createMockEditorGroup() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.windowId = mainWindow.vscodeWindowId;
        }
    }();
}
function toExtensionInfo(file) {
    if (!file.extensionId) {
        return undefined;
    }
    return {
        identifier: new ExtensionIdentifier(file.extensionId),
        displayName: file.extensionDisplayName,
    };
}
function createMockPromptsService(files, agentInstructions) {
    const applyToMap = new ResourceMap();
    const descriptionMap = new ResourceMap();
    for (const f of files) {
        applyToMap.set(f.uri, f.applyTo);
        descriptionMap.set(f.uri, f.description);
    }
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeCustomAgents = Event.None;
            this.onDidChangeSlashCommands = Event.None;
            this.onDidChangeSkills = Event.None;
            this.onDidChangeInstructions = Event.None;
        }
        getDisabledPromptFiles() { return new ResourceSet(); }
        async listPromptFiles(type, _token) {
            return files.filter(f => f.type === type).map(f => ({
                uri: f.uri,
                storage: f.storage,
                type: f.type,
                name: f.name,
                description: f.description,
                extension: toExtensionInfo(f),
            }));
        }
        async listAgentInstructions() { return agentInstructions; }
        async getCustomAgents() {
            return files.filter(f => f.type === PromptsType.agent).map(a => ({
                uri: a.uri, name: a.name ?? 'agent', description: a.description, storage: a.storage,
                source: {
                    storage: a.storage,
                    extensionId: a.extensionId ? new ExtensionIdentifier(a.extensionId) : undefined,
                },
            }));
        }
        async parseNew(uri, _token) {
            const header = {
                get applyTo() { return applyToMap.get(uri); },
                get description() { return descriptionMap.get(uri); },
            };
            return new ParsedPromptFile(uri, header);
        }
        async getSourceFolders() { return []; }
        async findAgentSkills() {
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
        async getPromptSlashCommands() {
            const promptFiles = files.filter(f => f.type === PromptsType.prompt);
            const commands = await Promise.all(promptFiles.map(async (f) => {
                return {
                    uri: f.uri,
                    userInvocable: true,
                    name: f.name ?? 'prompt',
                    description: f.description,
                    argumentHint: undefined,
                    type: f.type,
                    storage: f.storage,
                    source: undefined,
                    extension: toExtensionInfo(f),
                    when: undefined,
                };
            }));
            return commands;
        }
    }();
}
function createMockHarnessService(activeHarness, descriptors) {
    const active = observableValue('activeHarness', activeHarness);
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.activeHarness = active;
            this.availableHarnesses = constObservable(descriptors);
        }
        getStorageSourceFilter(type) {
            const d = descriptors.find(h => h.id === active.get()) ?? descriptors[0];
            return d.getStorageSourceFilter(type);
        }
        getActiveDescriptor() {
            return descriptors.find(h => h.id === active.get()) ?? descriptors[0];
        }
        setActiveHarness(id) { active.set(id, undefined); }
        registerExternalHarness() { return { dispose() { } }; }
    }();
}
function makeLocalMcpServer(id, label, scope, description) {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.id = id;
            this.name = id;
            this.label = label;
            this.description = description ?? '';
            this.installState = 1 /* McpServerInstallState.Installed */;
            this.local = new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.id = id;
                    this.scope = scope;
                }
            }();
        }
    }();
}
function createMockAgentFeedbackService() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeFeedback = Event.None;
            this.onDidChangeNavigation = Event.None;
        }
        getFeedback() { return []; }
        getMostRecentSessionForResource() { return undefined; }
        async revealFeedback() { }
        getNextFeedback() { return undefined; }
        getNavigationBearing() { return { activeIdx: -1, totalCount: 0 }; }
        getNextNavigableItem() { return undefined; }
        setNavigationAnchor() { }
        clearFeedback() { }
        removeFeedback() { }
        async addFeedbackAndSubmit() { }
    }();
}
// ============================================================================
// Realistic test data — a project that has Copilot + Claude customizations
// ============================================================================
const allFiles = [
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
    { uri: URI.file('/app/skills/act-on-feedback/SKILL.md'), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: 'act-on-feedback', description: 'Act on user feedback attached to the current session' },
    { uri: URI.file('/app/skills/generate-run-commands/SKILL.md'), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: 'generate-run-commands', description: 'Generate or modify run commands for the current session' },
    { uri: URI.file('/app/skills/commit/SKILL.md'), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: 'commit', description: 'Commit staged or unstaged changes with an AI-generated commit message' },
    { uri: URI.file('/app/skills/create-pr/SKILL.md'), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: 'create-pr', description: 'Create a pull request for the current session' },
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
const agentInstructions = [
    { uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentInstructionFileType.agentsMd },
    { uri: URI.file('/workspace/CLAUDE.md'), realPath: undefined, type: AgentInstructionFileType.claudeMd },
    { uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd },
];
const mcpWorkspaceServers = [
    makeLocalMcpServer('mcp-postgres', 'PostgreSQL', "workspace" /* LocalMcpServerScope.Workspace */, 'Database access'),
    makeLocalMcpServer('mcp-github', 'GitHub', "workspace" /* LocalMcpServerScope.Workspace */, 'GitHub API'),
    makeLocalMcpServer('mcp-redis', 'Redis', "workspace" /* LocalMcpServerScope.Workspace */, 'In-memory data store'),
    makeLocalMcpServer('mcp-docker', 'Docker', "workspace" /* LocalMcpServerScope.Workspace */, 'Container management'),
    makeLocalMcpServer('mcp-slack', 'Slack', "workspace" /* LocalMcpServerScope.Workspace */, 'Team messaging'),
    makeLocalMcpServer('mcp-jira', 'Jira', "workspace" /* LocalMcpServerScope.Workspace */, 'Issue tracking'),
    makeLocalMcpServer('mcp-aws', 'AWS', "workspace" /* LocalMcpServerScope.Workspace */, 'Amazon Web Services'),
    makeLocalMcpServer('mcp-graphql', 'GraphQL', "workspace" /* LocalMcpServerScope.Workspace */, 'GraphQL API gateway'),
];
const mcpUserServers = [
    makeLocalMcpServer('mcp-web-search', 'Web Search', "user" /* LocalMcpServerScope.User */, 'Search the web'),
    makeLocalMcpServer('mcp-filesystem', 'Filesystem', "user" /* LocalMcpServerScope.User */, 'Local file operations'),
    makeLocalMcpServer('mcp-puppeteer', 'Puppeteer', "user" /* LocalMcpServerScope.User */, 'Browser automation'),
];
const mcpRuntimeServers = [
    { definition: { id: 'github-copilot-mcp', label: 'GitHub Copilot' }, collection: { id: 'ext.github.copilot/mcp', label: 'ext.github.copilot/mcp' }, enablement: constObservable(2), connectionState: constObservable({ state: 2 }) },
];
async function waitForAnimationFrames(count) {
    for (let i = 0; i < count; i++) {
        await new Promise(resolve => mainWindow.requestAnimationFrame(() => resolve()));
    }
}
function getVisibleEditorSignature(container) {
    const sectionCounts = [...container.querySelectorAll('.section-list-item')].map(item => item.textContent?.replace(/\s+/g, ' ').trim() ?? '').join('|');
    const visibleContent = [...container.querySelectorAll('.prompts-content-container, .mcp-content-container, .plugin-content-container')]
        .find(node => node instanceof HTMLElement && node.style.display !== 'none');
    const visibleRows = visibleContent
        ? [...visibleContent.querySelectorAll('.monaco-list-row')].map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '').join('|')
        : '';
    return `${sectionCounts}@@${visibleRows}`;
}
async function waitForEditorToSettle(container) {
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
        }
        else {
            stableIterations = 0;
            previousSignature = signature;
        }
    }
}
async function waitForVisibleScrollbarsToFade(container) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        const hasVisibleScrollbar = [...container.querySelectorAll('.scrollbar.vertical')].some(scrollbar => {
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
async function renderEditor(ctx, options) {
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
            reg.defineInstance(IChatEditingService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.editingSessionsObs = constObservable([]);
                }
            }());
            reg.defineInstance(IAgentSessionsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.model = new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.sessions = [];
                        }
                    }();
                }
                getSession() { return undefined; }
            }());
            reg.defineInstance(IPromptsService, createMockPromptsService(allFiles, agentInstructions));
            reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.isSessionsWindow = isSessionsWindow;
                    this.activeProjectRoot = observableValue('root', URI.file('/workspace'));
                    this.hasOverrideProjectRoot = observableValue('hasOverride', false);
                    this.managementSections = managementSections;
                }
                getActiveProjectRoot() { return URI.file('/workspace'); }
                getStorageSourceFilter(type) { return harnessService.getStorageSourceFilter(type); }
                clearOverrideProjectRoot() { }
                setOverrideProjectRoot() { }
                async generateCustomization() { }
                getSkillUIIntegrations() { return skillUIIntegrations; }
            }());
            reg.defineInstance(ICustomizationHarnessService, harnessService);
            reg.defineInstance(IChatSessionsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeCustomizations = Event.None;
                }
                async getCustomizations() { return undefined; }
                getRegisteredChatSessionItemProviders() { return []; }
                hasCustomizationsProvider() { return false; }
            }());
            reg.defineInstance(IWorkspaceContextService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeWorkspaceFolders = Event.None;
                }
                getWorkspace() { return { id: 'test', folders: [] }; }
                getWorkbenchState() { return 3 /* WorkbenchState.WORKSPACE */; }
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                }
            }());
            reg.defineInstance(IPathService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.defaultUriScheme = 'file';
                }
                userHome() { return userHome; }
            }());
            reg.defineInstance(ITextModelService, new class extends mock() {
            }());
            reg.defineInstance(IWorkingCopyService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeDirty = Event.None;
                }
            }());
            reg.defineInstance(IFileDialogService, new class extends mock() {
            }());
            reg.defineInstance(IExtensionService, new class extends mock() {
            }());
            reg.defineInstance(IQuickInputService, new class extends mock() {
            }());
            reg.defineInstance(IRequestService, new class extends mock() {
            }());
            reg.defineInstance(IMarkdownRendererService, new class extends mock() {
                render() {
                    const rendered = {
                        element: DOM.$('span'),
                        dispose() { },
                    };
                    return rendered;
                }
            }());
            reg.defineInstance(IWebviewService, new class extends mock() {
            }());
            reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onChange = Event.None;
                    this.onReset = Event.None;
                    this.local = allMcpServers;
                }
                async queryLocal() { return allMcpServers; }
                canInstall() { return true; }
            }());
            reg.defineInstance(IMcpService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.servers = constObservable(mcpRuntimeServers);
                }
            }());
            reg.defineInstance(IMcpRegistry, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.collections = constObservable([]);
                    this.delegates = constObservable([]);
                    this.onDidChangeInputs = Event.None;
                }
            }());
            reg.defineInstance(IAgentPluginService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.plugins = constObservable(installedPlugins);
                    this.enablementModel = undefined;
                }
            }());
            reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.installedPlugins = constObservable([]);
                    this.onDidChangeMarketplaces = Event.None;
                }
            }());
            reg.defineInstance(IPluginInstallService, new class extends mock() {
            }());
            reg.defineInstance(IProductService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.defaultChatAgent = new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.chatExtensionId = 'GitHub.copilot-chat';
                        }
                    }();
                }
            }());
        },
    });
    const editor = ctx.disposableStore.add(instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup()));
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
function makeGalleryServer(id, label, description, publisher) {
    const galleryStub = new class extends mock() {
    }();
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.id = id;
            this.name = id;
            this.label = label;
            this.description = description;
            this.publisherDisplayName = publisher;
            this.installState = 3 /* McpServerInstallState.Uninstalled */;
            this.gallery = galleryStub;
            this.local = undefined;
        }
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
async function renderMcpBrowseMode(ctx) {
    const width = 650;
    const height = 500;
    ctx.container.style.width = `${width}px`;
    ctx.container.style.height = `${height}px`;
    const instantiationService = createEditorServices(ctx.disposableStore, {
        colorTheme: ctx.theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
            reg.define(IListService, ListService);
            reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onChange = Event.None;
                    this.onReset = Event.None;
                    this.local = [];
                }
                async queryLocal() { return []; }
                canInstall() { return true; }
                async queryGallery() {
                    return {
                        firstPage: { items: galleryServers, hasMore: false },
                        async getNextPage() { return { items: [], hasMore: false }; },
                    };
                }
            }());
            reg.defineInstance(IMcpService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.servers = constObservable([]);
                }
            }());
            reg.defineInstance(IMcpRegistry, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.collections = constObservable([]);
                    this.delegates = constObservable([]);
                    this.onDidChangeInputs = Event.None;
                }
            }());
            reg.defineInstance(IAgentPluginService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.plugins = constObservable([]);
                }
            }());
            reg.defineInstance(IDialogService, new class extends mock() {
            }());
            reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.isSessionsWindow = false;
                    this.activeProjectRoot = observableValue('root', URI.file('/workspace'));
                    this.hasOverrideProjectRoot = observableValue('hasOverride', false);
                }
                getActiveProjectRoot() { return URI.file('/workspace'); }
                getStorageSourceFilter() {
                    return { sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin] };
                }
            }());
            reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.activeHarness = observableValue('activeHarness', CustomizationHarness.VSCode);
                }
                getActiveDescriptor() { return createVSCodeHarnessDescriptor([PromptsStorage.extension, BUILTIN_STORAGE]); }
                registerExternalHarness() { return { dispose() { } }; }
            }());
        },
    });
    const widget = ctx.disposableStore.add(instantiationService.createInstance(McpListWidget));
    ctx.container.appendChild(widget.element);
    widget.layout(height, width);
    // Click the Browse Marketplace button to enter browse mode
    const browseButton = widget.element.querySelector('.list-add-button');
    browseButton?.click();
    // Wait for the gallery query to resolve
    await new Promise(resolve => setTimeout(resolve, 50));
}
// ============================================================================
// Plugin Browse Mode — standalone widget with marketplace results
// ============================================================================
function makeInstalledPlugin(name, uri, enabled) {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.uri = uri;
            this.label = name;
            this.enablement = constObservable(enabled ? 2 /* ContributionEnablementState.EnabledProfile */ : 0 /* ContributionEnablementState.DisabledProfile */);
            this.hooks = constObservable([]);
            this.commands = constObservable([]);
            this.skills = constObservable([]);
            this.agents = constObservable([]);
            this.instructions = constObservable([]);
            this.mcpServerDefinitions = constObservable([]);
        }
        remove() { }
    }();
}
const installedPlugins = [
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
function makeMarketplacePlugin(name, description, repo) {
    return {
        name,
        description,
        version: '1.0.0',
        source: repo,
        sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: `example/${repo}` },
        marketplace: 'copilot',
        marketplaceReference: { rawValue: `example/${repo}`, displayLabel: repo, cloneUrl: `https://github.com/example/${repo}.git`, canonicalId: `github:example/${repo}`, cacheSegments: ['example', repo], kind: "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */ },
        marketplaceType: "copilot" /* MarketplaceType.Copilot */,
    };
}
const marketplacePlugins = [
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
async function renderPluginBrowseMode(ctx) {
    const width = 650;
    const height = 500;
    ctx.container.style.width = `${width}px`;
    ctx.container.style.height = `${height}px`;
    const instantiationService = createEditorServices(ctx.disposableStore, {
        colorTheme: ctx.theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
            reg.define(IListService, ListService);
            reg.defineInstance(IAgentPluginService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.plugins = constObservable([]);
                    this.enablementModel = undefined;
                }
            }());
            reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.installedPlugins = constObservable([]);
                    this.onDidChangeMarketplaces = Event.None;
                }
                async fetchMarketplacePlugins() { return marketplacePlugins; }
            }());
            reg.defineInstance(IPluginInstallService, new class extends mock() {
                getPluginInstallUri() { return URI.file('/dev/null'); }
            }());
        },
    });
    const widget = ctx.disposableStore.add(instantiationService.createInstance(PluginListWidget));
    ctx.container.appendChild(widget.element);
    widget.layout(height, width);
    // Click the Browse Marketplace button to enter browse mode
    const browseButton = widget.element.querySelector('.list-add-button');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9zZXNzaW9ucy9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0s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