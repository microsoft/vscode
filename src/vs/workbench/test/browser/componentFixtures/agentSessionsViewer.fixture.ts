/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { mock } from '../../../../base/test/common/mock.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { AgentSessionRenderer, AgentSessionSectionRenderer, IAgentSessionRendererOptions } from '../../../contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionStatus, IAgentSession, AgentSessionSection, IAgentSessionSection } from '../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { AgentSessionProviders } from '../../../contrib/chat/browser/agentSessions/agentSessions.js';
import { AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';

import '../../../contrib/chat/browser/agentSessions/media/agentsessionsviewer.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockSession(overrides: Partial<IAgentSession> & { label: string; status: AgentSessionStatus; providerType: string }): IAgentSession {
	const now = Date.now();
	return new class extends mock<IAgentSession>() {
		override readonly resource = overrides.resource ?? URI.parse(`vscode-chat-session://${overrides.providerType}/session-${Math.random().toString(36).slice(2)}`);
		override readonly label = overrides.label;
		override readonly status = overrides.status;
		override readonly providerType = overrides.providerType;
		override readonly providerLabel = overrides.providerLabel ?? overrides.providerType;
		override readonly icon = overrides.icon ?? Codicon.vm;
		override readonly badge = overrides.badge;
		override readonly description = overrides.description;
		override readonly tooltip = overrides.tooltip;
		override readonly changes = overrides.changes;
		override readonly timing = overrides.timing ?? {
			created: now - 60 * 60 * 1000,
			lastRequestStarted: undefined,
			lastRequestEnded: undefined,
		};
		override isArchived(): boolean { return overrides.isArchived?.() ?? false; }
		override setArchived(): void { }
		override isRead(): boolean { return overrides.isRead?.() ?? true; }
		override setRead(): void { }
	}();
}

function wrapAsTreeNode<T>(element: T): ITreeNode<T, FuzzyScore> {
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

const rendererOptions: IAgentSessionRendererOptions = {
	disableHover: true,
	getHoverPosition: () => HoverPosition.BELOW,
};

// ============================================================================
// Render helpers
// ============================================================================

function createMockApprovalModel(sessionResource: URI, info: IAgentSessionApprovalInfo): AgentSessionApprovalModel {
	const obs = observableValue<IAgentSessionApprovalInfo | undefined>('mockApproval', info);
	return new class extends mock<AgentSessionApprovalModel>() {
		override getApproval(resource: URI) {
			if (resource.toString() === sessionResource.toString()) {
				return obs;
			}
			return observableValue<IAgentSessionApprovalInfo | undefined>('mockApproval.empty', undefined);
		}
	}();
}

function renderSessionItem(ctx: ComponentFixtureContext, session: IAgentSession, approvalModel?: AgentSessionApprovalModel): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly urlProtocol = 'vscode';
			}());
		},
	});

	const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configService.setUserConfiguration('editor', { fontFamily: 'monospace' });
	const markdownRendererService = instantiationService.get(IMarkdownRendererService);
	markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	const renderer = disposableStore.add(
		instantiationService.createInstance(AgentSessionRenderer, rendererOptions, approvalModel ?? undefined, observableValue<URI | undefined>('activeSessionResource', undefined))
	);

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

function renderSectionItem(ctx: ComponentFixtureContext, section: IAgentSessionSection): void {
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.InProgress,
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
			status: AgentSessionStatus.NeedsInput,
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
			status: AgentSessionStatus.Failed,
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
			status: AgentSessionStatus.Failed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.Completed,
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
			status: AgentSessionStatus.InProgress,
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
			status: AgentSessionStatus.InProgress,
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
			section: AgentSessionSection.Today,
			label: 'Today',
			sessions: [],
		}),
	}),

	SectionYesterday: defineComponentFixture({
		render: (ctx) => renderSectionItem(ctx, {
			section: AgentSessionSection.Yesterday,
			label: 'Yesterday',
			sessions: [],
		}),
	}),

	SectionLastWeek: defineComponentFixture({
		render: (ctx) => renderSectionItem(ctx, {
			section: AgentSessionSection.Week,
			label: 'Last 7 days',
			sessions: [],
		}),
	}),

	SectionOlder: defineComponentFixture({
		render: (ctx) => renderSectionItem(ctx, {
			section: AgentSessionSection.Older,
			label: 'Older',
			sessions: [],
		}),
	}),

	SectionArchived: defineComponentFixture({
		render: (ctx) => renderSectionItem(ctx, {
			section: AgentSessionSection.Archived,
			label: 'Archived',
			sessions: [],
		}),
	}),

	SectionMore: defineComponentFixture({
		render: (ctx) => renderSectionItem(ctx, {
			section: AgentSessionSection.More,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.NeedsInput,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
				status: AgentSessionStatus.InProgress,
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
