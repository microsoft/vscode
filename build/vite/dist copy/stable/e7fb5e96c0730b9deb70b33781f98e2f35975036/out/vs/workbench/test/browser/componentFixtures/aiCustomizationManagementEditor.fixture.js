/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../base/browser/dom.js';
import { Dimension } from '../../../../base/browser/dom.js';
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
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, createVSCodeHarnessDescriptor, createClaudeHarnessDescriptor, createCliHarnessDescriptor, getCliUserRoots, getClaudeUserRoots } from '../../../contrib/chat/common/customizationHarnessService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ParsedPromptFile } from '../../../contrib/chat/common/promptSyntax/promptFileParser.js';
import { IAgentPluginService } from '../../../contrib/chat/common/plugins/agentPluginService.js';
import { IPluginMarketplaceService } from '../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../../contrib/chat/common/plugins/pluginInstallService.js';
import { AICustomizationManagementEditor } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IMcpWorkbenchService, IMcpService } from '../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpListWidget } from '../../../contrib/chat/browser/aiCustomization/mcpListWidget.js';
import { PluginListWidget } from '../../../contrib/chat/browser/aiCustomization/pluginListWidget.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICodeReviewService } from '../../../../sessions/contrib/codeReview/browser/codeReviewService.js';
import { createMockCodeReviewService } from './sessions/mockCodeReviewService.js';
import { IChatEditingService } from '../../../contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';
// Ensure theme colors & widget CSS are loaded
import '../../../../platform/theme/common/colors/inputColors.js';
import '../../../../platform/theme/common/colors/listColors.js';
import '../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDekYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDN0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENB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