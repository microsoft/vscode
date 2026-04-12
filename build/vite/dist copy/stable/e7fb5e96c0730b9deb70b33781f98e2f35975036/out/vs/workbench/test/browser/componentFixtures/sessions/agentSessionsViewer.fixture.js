/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { AgentSessionRenderer, AgentSessionSectionRenderer } from '../../../../contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionProviders } from '../../../../contrib/chat/browser/agentSessions/agentSessions.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import '../../../../contrib/chat/browser/agentSessions/media/agentsessionsviewer.css';
// ============================================================================
// Mock helpers
// ============================================================================
function createMockSession(overrides) {
    const now = Date.now();
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.resource = overrides.resource ?? URI.parse(`vscode-chat-session://${overrides.providerType}/session-${Math.random().toString(36).slice(2)}`);
            this.label = overrides.label;
            this.status = overrides.status;
            this.providerType = overrides.providerType;
            this.providerLabel = overrides.providerLabel ?? overrides.providerType;
            this.icon = overrides.icon ?? Codicon.vm;
            this.badge = overrides.badge;
            this.description = overrides.description;
            this.tooltip = overrides.tooltip;
            this.changes = overrides.changes;
            this.timing = overrides.timing ?? {
                created: now - 60 * 60 * 1000,
                lastRequestStarted: undefined,
                lastRequestEnded: undefined,
            };
        }
        isArchived() { return overrides.isArchived?.() ?? false; }
        setArchived() { }
        isRead() { return overrides.isRead?.() ?? true; }
        setRead() { }
    }();
}
function wrapAsTreeNode(element) {
    return {
        element,
        children: [],
        depth: 0,
        visibleChildrenCount: 0,
        visibleChildIndex: 0,
        collapsible: false,
        collapsed: false,
        visible: true,
        filterData: undefined,
    };
}
const rendererOptions = {
    disableHover: true,
    getHoverPosition: () => 2 /* HoverPosition.BELOW */,
};
// ============================================================================
// Render helpers
// ============================================================================
function createMockApprovalModel(sessionResource, info) {
    const obs = observableValue('mockApproval', info);
    return new class extends mock() {
        getApproval(resource) {
            if (resource.toString() === sessionResource.toString()) {
                return obs;
            }
            return observableValue('mockApproval.empty', undefined);
        }
    }();
}
function renderSessionItem(ctx, session, approvalModel) {
    const { container, disposableStore } = ctx;
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: ctx.theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
            reg.define(IMarkdownRendererService, MarkdownRendererService);
            reg.defineInstance(IProductService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.urlProtocol = 'vscode';
                }
            }());
        },
    });
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration('editor', { fontFamily: 'monospace' });
    const markdownRendererService = instantiationService.get(IMarkdownRendererService);
    markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
    const renderer = disposableStore.add(instantiationService.createInstance(AgentSessionRenderer, rendererOptions, approvalModel ?? undefined, observableValue('activeSessionResource', undefined)));
    container.style.width = '350px';
    container.style.height = 'auto';
    container.style.backgroundColor = 'var(--vscode-sideBar-background)';
    container.classList.add('agent-sessions-viewer');
    const listRow = document.createElement('div');
    listRow.classList.add('monaco-list-row');
    listRow.style.position = 'relative';
    container.appendChild(listRow);
    const template = renderer.renderTemplate(listRow);
    renderer.renderElement(wrapAsTreeNode(session), 0, template);
}
function renderSectionItem(ctx, section) {
    const { container, disposableStore } = ctx;
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: ctx.theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
        },
    });
    const renderer = instantiationService.createInstance(AgentSessionSectionRenderer, {});
    container.style.width = '350px';
    container.style.height = 'auto';
    container.style.backgroundColor = 'var(--vscode-sideBar-background)';
    container.classList.add('agent-sessions-viewer');
    const listRow = document.createElement('div');
    listRow.classList.add('monaco-list-row');
    listRow.style.position = 'relative';
    container.appendChild(listRow);
    const template = renderer.renderTemplate(listRow);
    renderer.renderElement(wrapAsTreeNode(section), 0, template);
}
// ============================================================================
// Fixtures
// ============================================================================
const now = Date.now();
export default defineThemedFixtureGroup({
    // --- Status variants ---
    CompletedRead: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Refactor auth middleware',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            timing: {
                created: now - 2 * 60 * 60 * 1000,
                lastRequestStarted: now - 2 * 60 * 60 * 1000,
                lastRequestEnded: now - 2 * 60 * 60 * 1000 + 45 * 1000,
            },
        })),
    }),
    CompletedUnread: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Add unit tests for parser',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            isRead: () => false,
            timing: {
                created: now - 30 * 60 * 1000,
                lastRequestStarted: now - 30 * 60 * 1000,
                lastRequestEnded: now - 25 * 60 * 1000,
            },
        })),
    }),
    InProgress: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Implement dark mode toggle',
            status: 2 /* AgentSessionStatus.InProgress */,
            providerType: AgentSessionProviders.Local,
            timing: {
                created: now - 5 * 60 * 1000,
                lastRequestStarted: now - 2 * 60 * 1000,
                lastRequestEnded: undefined,
            },
        })),
    }),
    NeedsInput: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Fix CI pipeline configuration',
            status: 3 /* AgentSessionStatus.NeedsInput */,
            providerType: AgentSessionProviders.Local,
            isRead: () => false,
            timing: {
                created: now - 10 * 60 * 1000,
                lastRequestStarted: now - 8 * 60 * 1000,
                lastRequestEnded: undefined,
            },
        })),
    }),
    FailedWithDuration: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Deploy staging environment',
            status: 0 /* AgentSessionStatus.Failed */,
            providerType: AgentSessionProviders.Local,
            timing: {
                created: now - 60 * 60 * 1000,
                lastRequestStarted: now - 60 * 60 * 1000,
                lastRequestEnded: now - 60 * 60 * 1000 + 3 * 60 * 1000,
            },
        })),
    }),
    FailedWithoutDuration: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Migrate database schema',
            status: 0 /* AgentSessionStatus.Failed */,
            providerType: AgentSessionProviders.Local,
            timing: {
                created: now - 3 * 60 * 60 * 1000,
                lastRequestStarted: undefined,
                lastRequestEnded: undefined,
            },
        })),
    }),
    // --- Content variants ---
    WithDiffChanges: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Refactor settings page',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            changes: { files: 5, insertions: 142, deletions: 87 },
            timing: {
                created: now - 45 * 60 * 1000,
                lastRequestStarted: now - 45 * 60 * 1000,
                lastRequestEnded: now - 40 * 60 * 1000,
            },
        })),
    }),
    WithFileChangesList: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Update API endpoints',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Background,
            icon: Codicon.worktree,
            changes: [
                { modifiedUri: URI.file('/src/api/routes.ts'), insertions: 25, deletions: 10 },
                { modifiedUri: URI.file('/src/api/handlers.ts'), insertions: 50, deletions: 30 },
                { modifiedUri: URI.file('/tests/api.test.ts'), insertions: 40, deletions: 5 },
            ],
            timing: {
                created: now - 2 * 60 * 60 * 1000,
                lastRequestStarted: now - 2 * 60 * 60 * 1000,
                lastRequestEnded: now - 90 * 60 * 1000,
            },
        })),
    }),
    WithBadge: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Optimize build pipeline',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            badge: 'PR #1234',
            timing: {
                created: now - 4 * 60 * 60 * 1000,
                lastRequestStarted: now - 4 * 60 * 60 * 1000,
                lastRequestEnded: now - 3.5 * 60 * 60 * 1000,
            },
        })),
    }),
    WithMarkdownBadge: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Review security patches',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Cloud,
            icon: Codicon.cloud,
            badge: new MarkdownString('$(shield) Secure'),
            timing: {
                created: now - 6 * 60 * 60 * 1000,
                lastRequestStarted: now - 6 * 60 * 60 * 1000,
                lastRequestEnded: now - 5.5 * 60 * 60 * 1000,
            },
        })),
    }),
    WithDescription: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Upgrade dependencies',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            description: 'Updated 12 packages to latest versions',
            timing: {
                created: now - 24 * 60 * 60 * 1000,
                lastRequestStarted: now - 24 * 60 * 60 * 1000,
                lastRequestEnded: now - 23.5 * 60 * 60 * 1000,
            },
        })),
    }),
    WithMarkdownDescription: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Fix accessibility issues',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            description: new MarkdownString('$(check) All WCAG checks passed'),
            timing: {
                created: now - 48 * 60 * 60 * 1000,
                lastRequestStarted: now - 48 * 60 * 60 * 1000,
                lastRequestEnded: now - 47 * 60 * 60 * 1000,
            },
        })),
    }),
    WithBadgeAndDiff: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Implement search feature',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            badge: 'draft',
            changes: { files: 8, insertions: 320, deletions: 45 },
            timing: {
                created: now - 3 * 60 * 60 * 1000,
                lastRequestStarted: now - 3 * 60 * 60 * 1000,
                lastRequestEnded: now - 2.5 * 60 * 60 * 1000,
            },
        })),
    }),
    // --- State variants ---
    Archived: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Old migration script',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            isArchived: () => true,
            timing: {
                created: now - 7 * 24 * 60 * 60 * 1000,
                lastRequestStarted: now - 7 * 24 * 60 * 60 * 1000,
                lastRequestEnded: now - 7 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000,
            },
        })),
    }),
    ArchivedUnread: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Archived unread task',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Local,
            isArchived: () => true,
            isRead: () => false,
            timing: {
                created: now - 5 * 24 * 60 * 60 * 1000,
                lastRequestStarted: now - 5 * 24 * 60 * 60 * 1000,
                lastRequestEnded: now - 5 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
            },
        })),
    }),
    // --- Provider-type variants ---
    CloudProvider: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Generate API documentation',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Cloud,
            icon: Codicon.cloud,
            timing: {
                created: now - 90 * 60 * 1000,
                lastRequestStarted: now - 90 * 60 * 1000,
                lastRequestEnded: now - 80 * 60 * 1000,
            },
        })),
    }),
    BackgroundProvider: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Run linter across codebase',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Background,
            icon: Codicon.worktree,
            timing: {
                created: now - 120 * 60 * 1000,
                lastRequestStarted: now - 120 * 60 * 1000,
                lastRequestEnded: now - 110 * 60 * 1000,
            },
        })),
    }),
    ClaudeProvider: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Analyze code complexity',
            status: 1 /* AgentSessionStatus.Completed */,
            providerType: AgentSessionProviders.Claude,
            icon: Codicon.claude,
            timing: {
                created: now - 150 * 60 * 1000,
                lastRequestStarted: now - 150 * 60 * 1000,
                lastRequestEnded: now - 140 * 60 * 1000,
            },
        })),
    }),
    CloudProviderInProgress: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Build integration tests',
            status: 2 /* AgentSessionStatus.InProgress */,
            providerType: AgentSessionProviders.Cloud,
            icon: Codicon.cloud,
            isRead: () => false,
            timing: {
                created: now - 10 * 60 * 1000,
                lastRequestStarted: now - 3 * 60 * 1000,
                lastRequestEnded: undefined,
            },
        })),
    }),
    // --- In-progress with description override ---
    InProgressWithDescription: defineComponentFixture({
        render: (ctx) => renderSessionItem(ctx, createMockSession({
            label: 'Scaffold new microservice',
            status: 2 /* AgentSessionStatus.InProgress */,
            providerType: AgentSessionProviders.Background,
            icon: Codicon.worktree,
            description: 'Installing dependencies...',
            timing: {
                created: now - 5 * 60 * 1000,
                lastRequestStarted: now - 60 * 1000,
                lastRequestEnded: undefined,
            },
        })),
    }),
    // --- Section headers ---
    SectionToday: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "today" /* AgentSessionSection.Today */,
            label: 'Today',
            sessions: [],
        }),
    }),
    SectionYesterday: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "yesterday" /* AgentSessionSection.Yesterday */,
            label: 'Yesterday',
            sessions: [],
        }),
    }),
    SectionLastWeek: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "week" /* AgentSessionSection.Week */,
            label: 'Last 7 days',
            sessions: [],
        }),
    }),
    SectionOlder: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "older" /* AgentSessionSection.Older */,
            label: 'Older',
            sessions: [],
        }),
    }),
    SectionArchived: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "archived" /* AgentSessionSection.Archived */,
            label: 'Archived',
            sessions: [],
        }),
    }),
    SectionMore: defineComponentFixture({
        render: (ctx) => renderSectionItem(ctx, {
            section: "more" /* AgentSessionSection.More */,
            label: 'More',
            sessions: [],
        }),
    }),
    // --- Approval row variants ---
    ApprovalRowJson: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-json');
            const approvalModel = createMockApprovalModel(resource, {
                label: '{ "action": "deleteFile", "path": "/src/old-module.ts" }',
                languageId: 'json',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Clean up deprecated modules',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 5 * 60 * 1000,
                    lastRequestStarted: now - 2 * 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRowBash: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-bash');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'npm install --save express@latest',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Update server dependencies',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 3 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRowPowerShell: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-powershell');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'Start-Job -ScriptBlock { Set-Location \'c:\\some\\path\'; npm install } | Out-Null',
                languageId: 'pwsh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Clean up old log files',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 4 * 60 * 1000,
                    lastRequestStarted: now - 2 * 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRowLongLabel: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-long');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'rm -rf node_modules && npm cache clean --force && npm install --legacy-peer-deps --ignore-scripts',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Reset and reinstall all dependencies',
                status: 3 /* AgentSessionStatus.NeedsInput */,
                providerType: AgentSessionProviders.Cloud,
                icon: Codicon.cloud,
                isRead: () => false,
                timing: {
                    created: now - 10 * 60 * 1000,
                    lastRequestStarted: now - 5 * 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRow1Line: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-1line');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'npm install --save express@latest',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Install express',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 3 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRow2Lines: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-2lines');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'cd /workspace/project\nnpm install',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Setup project dependencies',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 3 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRow3Lines: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-3lines');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'cd /workspace/project\nnpm install\nnpm run build',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Build the project',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 2 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRow4Lines: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-4lines');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'cd /workspace/project\nnpm install\nnpm run build\nnpm run test -- --coverage',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Build and test project',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 2 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
    ApprovalRow3LongLines: defineComponentFixture({
        render: (ctx) => {
            const resource = URI.parse('vscode-chat-session://local/approval-3longlines');
            const approvalModel = createMockApprovalModel(resource, {
                label: 'RUSTFLAGS="-C target-cpu=native -C opt-level=3" cargo build --release --target x86_64-unknown-linux-gnu\nfind ./target/release -name "*.so" -exec strip --strip-unneeded {} \\; && tar czf release-bundle.tar.gz -C target/release .\ncurl -X POST https://deploy.internal.example.com/api/v2/artifacts/upload --header "Authorization: Bearer $DEPLOY_TOKEN" --form "bundle=@release-bundle.tar.gz"',
                languageId: 'sh',
                since: new Date(),
                confirm: () => { },
            });
            renderSessionItem(ctx, createMockSession({
                resource,
                label: 'Build and deploy native release',
                status: 2 /* AgentSessionStatus.InProgress */,
                providerType: AgentSessionProviders.Local,
                timing: {
                    created: now - 2 * 60 * 1000,
                    lastRequestStarted: now - 60 * 1000,
                    lastRequestEnded: undefined,
                },
            }), approvalModel);
        },
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1ZpZXdlci5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9zZXNzaW9ucy9hZ2VudFNlc3Npb25zVmlld2VyLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sa0dBQWtHLENBQUM7QUFDbkosT0FBTyxFQUFFLG9CQUFvQixFQUFFLDJCQUEyQixFQUFnQyxNQUFNLHVFQUF1RSxDQUFDO0FBRXhLLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBR3hHLE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUVoSyxPQUFPLDhFQUE4RSxDQUFDO0FBRXRGLCtFQUErRTtBQUMvRSxlQUFlO0FBQ2YsK0VBQStFO0FBRS9FLFNB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