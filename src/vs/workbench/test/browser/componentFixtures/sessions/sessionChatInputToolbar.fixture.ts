/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { chatPersistentContentVisibleClass } from '../../../../contrib/chat/browser/widget/chatWidget.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS } from '../../../../contrib/chat/common/sessionChatPills.js';
import { BrowserEditorInput } from '../../../../contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../contrib/browserView/common/browserView.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { SESSION_CHAT_INPUT_TOOLBAR_HEIGHT, SessionChatInputToolbar } from '../../../../../sessions/contrib/chat/browser/sessionChatInputToolbar.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionChatPillsDebugData } from '../../../../../sessions/contrib/chat/browser/sessionChatInputToolbarDebug.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionInputBanners } from '../../../../../sessions/contrib/sessionInputBanners/browser/sessionInputBanners.js';
// eslint-disable-next-line local/code-import-patterns
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../sessions/common/agentHostSessionsProvider.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentWorkbenchLayoutService } from '../../../../../sessions/browser/workbench.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionChangesService } from '../../../../../sessions/contrib/changes/browser/sessionChangesService.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatOriginKind, type IGitHubInfo, type IGitHubPullRequestRef, ISessionArtifact, ISessionChatCustomization, ISessionTurnFileChange, ISessionWorkspace, IChat, ISessionCapabilities, ISessionFolder, ISessionGitRepository, SessionArtifactKind, SessionCustomizationKind, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, type ServiceRegistration } from '../fixtureUtils.js';
import { registerChatFixtureServices } from '../chat/chatFixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from '../chat/chatWidget.fixture.js';
import { createFixtureGitHubService, createFixtureWorkbenchGitHubService } from './githubFixtureUtils.js';

// ============================================================================
// Mock helpers
// ============================================================================

/** A file created during the turn (no original => classified as "created"). */
function createdFile(name: string, insertions: number, deletions: number, isOutsideWorkspace = false): ISessionTurnFileChange {
	const uri = URI.file(`/${isOutsideWorkspace ? 'outside' : 'repo'}/${name}`);
	return { uri, modifiedUri: uri, insertions, deletions, isOutsideWorkspace };
}

/** A file edited during the turn (has an original => classified as "modified"). */
function editedFile(name: string, insertions: number, deletions: number, isOutsideWorkspace = false): ISessionTurnFileChange {
	const uri = URI.file(`/${isOutsideWorkspace ? 'outside' : 'repo'}/${name}`);
	return { uri, modifiedUri: uri, originalUri: uri, insertions, deletions, isOutsideWorkspace };
}

interface ISessionSpec {
	readonly providerId?: string;
	readonly status?: SessionStatus;
	/** File changes in the last turn; omit for a chat with no last-turn changes. */
	readonly turnChanges?: readonly ISessionTurnFileChange[];
	readonly browsers?: readonly { readonly title?: string; readonly ownerSubagent?: number }[];
	readonly subagents?: readonly string[];
	/** Artifacts and references the agent recorded on the session. */
	readonly artifacts?: readonly ISessionArtifact[];
	readonly removableArtifacts?: boolean;
	/** Customizations the chat used or read. */
	readonly customizations?: readonly ISessionChatCustomization[];
	readonly pullRequests?: readonly IGitHubPullRequestRef[];
}

/** A mock session + its viewed chat, as the toolbar consumes them. */
interface IMockSessionAndChat {
	readonly session: IActiveSession;
	readonly chat: IChat;
	readonly browsers: readonly BrowserEditorInput[];
	removeArtifact(id: string): void;
}

export function createMockSession(spec: ISessionSpec): IMockSessionAndChat {
	const workspaceRoot = URI.file('/repo');
	const gitHubInfo: IGitHubInfo | undefined = spec.pullRequests ? {
		owner: 'microsoft',
		repo: 'vscode',
		pullRequests: spec.pullRequests,
	} : undefined;
	const gitRepository: ISessionGitRepository | undefined = gitHubInfo ? {
		uri: workspaceRoot,
		workTreeUri: undefined,
		baseBranchName: 'main',
		gitHubInfo: constObservable(gitHubInfo),
	} : undefined;
	const folder: ISessionFolder = {
		root: workspaceRoot,
		workingDirectory: workspaceRoot,
		name: 'vscode',
		description: undefined,
		gitRepository,
	};
	const workspace: ISessionWorkspace = {
		uri: workspaceRoot,
		label: 'vscode',
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('chat:1');
		override readonly title = constObservable('Main chat');
		// Pills above the input show while the chat has an active turn.
		override readonly status: IObservable<SessionStatus> = constObservable(spec.status ?? SessionStatus.InProgress);
		override readonly lastTurnChanges: IObservable<readonly ISessionTurnFileChange[]> | undefined =
			spec.turnChanges !== undefined ? constObservable(spec.turnChanges) : undefined;
		override readonly customizations: IObservable<readonly ISessionChatCustomization[]> | undefined =
			spec.customizations !== undefined ? constObservable(spec.customizations) : undefined;
	}();
	const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock<IChat>() {
		override readonly resource = URI.parse(`chat:subagent-${index}`);
		override readonly title = constObservable(title);
		override readonly status = constObservable(SessionStatus.InProgress);
		override readonly origin = { kind: ChatOriginKind.Tool, parentChat: chat.resource };
	}());
	const artifacts = observableValue<readonly ISessionArtifact[]>('fixture.artifacts', spec.artifacts ?? []);
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly sessionId = 'fixture-session';
		override readonly providerId = spec.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly chats = constObservable([chat, ...subagents]);
		override readonly status = constObservable(spec.status ?? SessionStatus.InProgress);
		override readonly isArchived = constObservable(false);
		override readonly isRead = constObservable(true);
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: spec.removableArtifacts });
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly artifacts = artifacts;
	}();
	const browsers = (spec.browsers ?? []).map((browser, index) => {
		const owner = browser.ownerSubagent === undefined ? chat : subagents[browser.ownerSubagent];
		const model = new class extends mock<IBrowserViewModel>() {
			override readonly owner = { type: 'agent' as const, sessionId: owner.resource.toString() };
		}();
		return new class extends mock<BrowserEditorInput>() {
			override get id(): string { return `browser-${index}`; }
			override get model(): IBrowserViewModel { return model; }
			override get title(): string | undefined { return browser.title; }
			override readonly onDidChangeLabel = Event.None;
		}();
	});
	return { session, chat, browsers, removeArtifact: id => artifacts.set(artifacts.get().filter(artifact => artifact.id !== id), undefined) };
}

function createBrowserViewService(inputs: readonly BrowserEditorInput[]): IBrowserViewWorkbenchService {
	const known = new Map(inputs.map(input => [input.id, input]));
	return new class extends mock<IBrowserViewWorkbenchService>() {
		override readonly onDidChangeBrowserViews = Event.None;
		override getKnownBrowserViews() { return known; }
		override async getPreferredGroup() { return undefined; }
	}();
}

function registerSessionChatPillFixtureServices(registration: ServiceRegistration, sessionMock: IMockSessionAndChat): void {
	registration.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override getProvider() { return undefined; }
	}());
	registration.defineInstance(IBrowserViewWorkbenchService, createBrowserViewService(sessionMock.browsers));
	registration.defineInstance(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
		override revealEditorPartExplicitly(): void { }
	}());
	registration.defineInstance(ISessionChangesService, new class extends mock<ISessionChangesService>() {
		override async openChangesEditor(): Promise<undefined> { return undefined; }
	}());
	registration.defineInstance(IGitHubService, createFixtureGitHubService([]));
	registration.defineInstance(IWorkbenchGitHubService, createFixtureWorkbenchGitHubService({}));
	if (sessionMock.session.capabilities.get().supportsRemoveArtifacts) {
		registration.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override async removeSessionArtifact(_session: IActiveSession, artifactId: string): Promise<void> {
				sessionMock.removeArtifact(artifactId);
			}
		}());
	}
}

// ============================================================================
// Render helpers
// ============================================================================

async function createImageReferenceContent(resource: URI): Promise<IFileContent> {
	const fixtureUrl = resource.path.includes('refined-chat')
		? new URL('../chat/media/image-hover-portrait.png', import.meta.url)
		: new URL('../chat/media/image-hover-wide.png', import.meta.url);
	const value = VSBuffer.wrap(new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer()));
	return {
		resource,
		name: resource.path.split('/').at(-1) ?? resource.path,
		mtime: 0,
		ctime: 0,
		etag: 'fixture',
		size: value.byteLength,
		readonly: true,
		locked: false,
		executable: false,
		value,
	};
}

export function renderPills(ctx: ComponentFixtureContext, sessionMock: IMockSessionAndChat, options?: { readonly compact?: boolean | 'auto'; readonly debugData?: ISessionChatPillsDebugData; readonly height?: string; readonly width?: string; readonly popupPlacement?: 'above'; readonly additionalServices?: (reg: ServiceRegistration) => void; readonly prepareServices?: (services: TestInstantiationService) => void }): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		fileIconTheme: ctx.fileIconTheme,
		additionalServices: (reg) => {
			// Broad chat service graph: provides IContextMenuService and the
			// ResourceLabels dependencies (decorations, text file, workspace, label
			// services) the artifact pill needs, on top of the base editor services
			// (which register a partial ISessionsService).
			registerChatFixtureServices(reg);
			registerSessionChatPillFixtureServices(reg, sessionMock);
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			reg.define(IContextViewService, ContextViewService);
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
				override readonly onDidRunOperation = Event.None;
				override hasProvider(): boolean { return true; }
				override async readFile(resource: URI): Promise<IFileContent> { return createImageReferenceContent(resource); }
			}());
			if (options?.debugData) {
				reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
					override readonly onDidChangeFeedback = Event.None;
					override readonly onDidChangeFeedbackVisibility = Event.None;
					override readonly onDidChangeFeedbackScope = Event.None;
					override readonly onDidRevealSessionComment = Event.None;
					override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
					override getFeedback() { return []; }
					override getFeedbackSessionResource() { return undefined; }
				}());
			}
			options?.additionalServices?.(reg);
		},
	});
	const actionWidgetService = disposableStore.add(instantiationService.createInstance(ActionWidgetService));
	instantiationService.stub(IActionWidgetService, actionWidgetService);
	options?.prepareServices?.(instantiationService);

	const visibility = instantiationService.get(ISessionChatPillVisibilityService);
	for (const kind of SESSION_CHAT_PILL_KINDS) {
		if (!visibility.isVisible(kind, undefined)) {
			visibility.toggle(kind);
		}
	}
	container.style.padding = '12px';
	container.style.height = options?.height ?? 'auto';
	container.style.width = options?.width ?? 'auto';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const pills = disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar, options?.compact ?? false, undefined));
	// Mount and size the row before it gets pills, so it measures its overflow synchronously
	// instead of on a later native ResizeObserver callback that can escape virtual time.
	container.appendChild(pills.element);
	if (options?.popupPlacement === 'above') {
		container.style.position = 'relative';
		pills.element.style.position = 'absolute';
		pills.element.style.left = '24px';
		pills.element.style.right = '24px';
		pills.element.style.bottom = '52px';
		pills.element.style.width = 'auto';
	}
	pills.setSession(sessionMock.session, sessionMock.chat);
	pills.setDebugData(options?.debugData);
	if (options?.debugData) {
		const banners = disposableStore.add(instantiationService.createInstance(SessionInputBanners));
		banners.setDebugData(options.debugData);
		container.appendChild(banners.domNode);
	}
}

async function renderChatViewWithPills(ctx: ComponentFixtureContext, mock: IMockSessionAndChat, messages: IFixtureMessage[], options?: { readonly height?: number; readonly scrollOffsetFromBottom?: number }): Promise<void> {
	const scrollOffsetFromBottom = options?.scrollOffsetFromBottom;
	await renderChatWidget(ctx, {
		messages,
		height: options?.height,
		persistentContentHeight: SESSION_CHAT_INPUT_TOOLBAR_HEIGHT,
		additionalServices: registration => registerSessionChatPillFixtureServices(registration, mock),
		onRendered: scrollOffsetFromBottom
			? handle => {
				const maximumScrollTop = Math.max(0, handle.listWidget.scrollHeight - handle.listWidget.renderHeight);
				handle.listWidget.scrollTop = Math.max(0, maximumScrollTop - scrollOffsetFromBottom);
			}
			: undefined,
		decorateInputPart: (inputPart, instantiationService) => {
			const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			const updateChatPillsVisibility = (visible: boolean) => {
				inputPart.persistentContentContainerElement.classList.toggle(chatPersistentContentVisibleClass, visible);
			};
			ctx.disposableStore.add(pills.onDidChangeVisibility(updateChatPillsVisibility));
			pills.setSession(mock.session, mock.chat);
			updateChatPillsVisibility(pills.visible);
			// Mount above the input, mirroring the sessions ChatView.
			inputPart.persistentContentContainerElement.appendChild(pills.element);
		},
	});
}

const FULL_VIEW_MESSAGES: IFixtureMessage[] = [
	{
		user: 'Add a README describing the project',
		assistant: [
			{ kind: 'markdown', text: 'I created `README.md` with a project overview, setup steps, and usage examples.' },
		],
	},
	{
		user: 'Now scaffold a simple landing page',
		assistant: [
			{ kind: 'markdown', text: 'Added `index.html` with a minimal landing page and linked it from the README.' },
		],
	},
];

const FADE_VIEW_MESSAGES: IFixtureMessage[] = [
	...FULL_VIEW_MESSAGES,
	{
		user: 'Add a responsive navigation bar',
		assistant: [
			{ kind: 'markdown', text: 'Implemented a responsive navigation bar with accessible labels and keyboard focus styles.' },
		],
	},
	{
		user: 'Verify the production build',
		assistant: [
			{ kind: 'markdown', text: 'The implementation is complete. The production build requires permission to run.' },
			{ kind: 'terminalConfirmation', command: 'npm run build' },
		],
		responseComplete: false,
	},
];

const STACKED_SURFACES_VIEW_MESSAGES: IFixtureMessage[] = [
	{
		user: 'Deploy the production build',
		assistant: [
			{ kind: 'markdown', text: 'Before deployment, I need a target and permission to run the build.' },
			{
				kind: 'questionCarousel',
				message: 'Choose a deployment target',
				questions: [{
					id: 'target',
					type: 'singleSelect',
					title: 'Where should I deploy?',
					allowFreeformInput: false,
					options: [
						{ id: 'staging', label: 'Staging', value: 'staging' },
						{ id: 'production', label: 'Production', value: 'production' },
					],
				}],
			},
			{ kind: 'terminalConfirmation', command: 'npm run build' },
		],
		responseComplete: false,
	},
];

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	// --- Changes pill (per turn) --------------------------------------------

	SessionChatPills_ChangesSingleFile: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile('app.ts', 12, 5)] })),
	}),

	SessionChatPills_ChangesMultipleFiles: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [editedFile('app.ts', 42, 7), editedFile('util.ts', 118, 64), editedFile('index.ts', 5, 0)],
		})),
	}),

	SessionChatPills_ChangesOnlyInsertions: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile('feature.ts', 256, 0)] })),
	}),

	SessionChatPills_ChangesOnlyDeletions: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile('legacy.ts', 0, 89)] })),
	}),

	// --- Artifact pill ------------------------------------------------------

	SessionChatPills_ExternalMarkdownPreview: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			status: SessionStatus.NeedsInput,
			turnChanges: [createdFile('README.md', 20, 0, true), editedFile('app.ts', 8, 3)],
		})),
	}),

	SessionChatPills_WorkspaceMarkdown_NoPreview: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [createdFile('README.md', 60, 2), editedFile('app.ts', 14, 1)],
		})),
	}),

	SessionChatPills_ExternalMarkdownMultiple_PrimaryCreated: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [
				editedFile('app.ts', 8, 3),
				createdFile('README.md', 20, 0, true),
				createdFile('index.html', 30, 4),
				editedFile('CHANGELOG.md', 6, 1, true),
			],
		})),
	}),

	SessionChatPills_ExternalMarkdown_PrimaryEdited: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [editedFile('docs.md', 10, 2, true), editedFile('page.html', 4, 1)],
		})),
	}),

	SessionChatPills_CompletedSessionChanges: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			status: SessionStatus.Completed,
			turnChanges: [createdFile('README.md', 20, 0, true), editedFile('app.ts', 8, 3)],
		})),
	}),

	// --- Customizations used by the chat ------------------------------------

	SessionChatPills_CustomizationSingle: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			customizations: [{ id: 'c1', kind: SessionCustomizationKind.Skill, name: 'sessions', uri: URI.file('/repo/.github/skills/sessions/SKILL.md') }],
		})),
	}),

	SessionChatPills_CustomizationsEveryType: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			customizations: [
				{ id: 'c1', kind: SessionCustomizationKind.Skill, name: 'sessions', uri: URI.file('/repo/.github/skills/sessions/SKILL.md') },
				{ id: 'c2', kind: SessionCustomizationKind.Instruction, name: 'writing-tests', uri: URI.file('/repo/.github/instructions/writing-tests.instructions.md') },
				{ id: 'c3', kind: SessionCustomizationKind.Hook, name: 'pre-commit', uri: URI.file('/repo/.github/hooks/pre-commit.md') },
				{ id: 'c4', kind: SessionCustomizationKind.Agent, name: 'rubber-duck', uri: URI.file('/repo/.github/agents/rubber-duck.md') },
				{ id: 'c5', kind: SessionCustomizationKind.McpServer, name: 'playwright' },
				{ id: 'c6', kind: SessionCustomizationKind.Plugin, name: 'component-explorer' },
			],
		})),
	}),

	// --- Browser and background activity pills ------------------------------

	SessionChatPills_BackgroundBrowser: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: 'Visual Studio Code' }] })),
	}),

	SessionChatPills_BackgroundBrowserFallback: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{}] })),
	}),

	SessionChatPills_BackgroundSubagent: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ subagents: ['Investigate authentication failures'] })),
	}),

	SessionChatPills_BackgroundSubagentTruncated: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ subagents: ['Investigate the authentication failure in production'] })),
	}),

	SessionChatPills_BackgroundBrowsersMultiple: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: 'Visual Studio Code' }, { title: 'GitHub' }] })),
	}),

	SessionChatPills_BackgroundSubagentsMultiple: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({ subagents: ['Investigate authentication', 'Review the proposed fix'] })),
	}),

	SessionChatPills_BackgroundMixed: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			browsers: [{ title: 'Visual Studio Code' }, { title: 'GitHub', ownerSubagent: 0 }],
			subagents: ['Investigate authentication'],
		})),
	}),

	SessionChatPills_BackgroundWithChanges: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			status: SessionStatus.NeedsInput,
			turnChanges: [createdFile('index.html', 30, 4), editedFile('app.ts', 8, 3)],
			browsers: [{ title: 'Project Preview' }],
		})),
	}),

	SessionChatPills_DebugFakeData: defineComponentFixture({
		render: ctx => renderPills(ctx, createMockSession({ providerId: 'debug-provider' }), {
			debugData: {
				stats: { files: 7, insertions: 128, deletions: 34 },
				markdownFiles: ['README.md', 'CONTRIBUTING.md', 'docs/testing.md'],
				subagents: ['Investigate authentication', 'Review accessibility'],
				browsers: ['Project Preview', 'Component Explorer'],
				ciFailed: 3,
				ciPending: 2,
				prFeedback: 4,
				agentFeedback: 2,
				autoIncrementChanges: false,
			},
		}),
	}),

	SessionChatPills_HorizontalOverflow: defineComponentFixture({
		render: ctx => renderPills(ctx, createMockSession({ providerId: 'debug-provider' }), {
			width: '280px',
			debugData: {
				stats: { files: 7, insertions: 128, deletions: 34 },
				markdownFiles: ['README.md', 'CONTRIBUTING.md', 'docs/testing.md'],
				subagents: ['Investigate authentication', 'Review accessibility'],
				browsers: ['Project Preview', 'Component Explorer'],
				ciFailed: 3,
				ciPending: 2,
				prFeedback: 4,
				agentFeedback: 2,
				autoIncrementChanges: false,
			},
		}),
	}),

	SessionChatPills_Compact: defineComponentFixture({
		render: ctx => renderPills(ctx, createMockSession({
			status: SessionStatus.NeedsInput,
			turnChanges: [editedFile('app.ts', 452, 85), editedFile('util.ts', 8, 2)],
			artifacts: [
				{ id: 'a1', kind: SessionArtifactKind.File, label: 'Implementation plan', isArtifact: true, uri: URI.file('/repo/docs/plan.md') },
			],
			browsers: [{ title: 'Project Preview' }, { title: 'Component Explorer' }],
		}), {
			compact: true,
			width: '280px',
		}),
	}),

	...Object.fromEntries([
		['Wide', '600px'],
		['Medium', '280px'],
		['Narrow', '180px'],
		['Overflow', '60px'],
	].map(([name, width]) => [`SessionChatPills_Responsive${name}`, defineComponentFixture({
		render: ctx => renderPills(ctx, createMockSession({
			status: SessionStatus.NeedsInput,
			turnChanges: [editedFile('app.ts', 452, 85), editedFile('util.ts', 8, 2)],
			artifacts: [{ id: 'a1', kind: SessionArtifactKind.File, label: 'Implementation plan', isArtifact: true, uri: URI.file('/repo/docs/plan.md') }],
			browsers: [{ title: 'Project Preview' }, { title: 'Component Explorer' }],
			subagents: ['Review implementation', 'Review tests'],
		}), { compact: 'auto', width }),
	})])),

	// --- Gating -------------------------------------------------------------

	SessionChatPills_NotAgentHost_Hidden: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			providerId: 'copilot-cloud',
			turnChanges: [editedFile('app.ts', 12, 5)],
		})),
	}),

	SessionChatPills_NoActivity_Hidden: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({})),
	}),

	// --- Full chat view -----------------------------------------------------

	SessionChatView_ChangesPill: defineComponentFixture({
		render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
			turnChanges: [editedFile('app.ts', 12, 5), editedFile('util.ts', 4, 2)],
		}), FULL_VIEW_MESSAGES),
	}),

	SessionChatView_ChangesAndExternalPreview: defineComponentFixture({
		render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
			turnChanges: [createdFile('README.md', 20, 0, true), createdFile('index.html', 30, 4), editedFile('app.ts', 8, 3)],
		}), FULL_VIEW_MESSAGES),
	}),

	SessionChatView_ArtifactPillAndPermission: defineComponentFixture({
		render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
			artifacts: [{ id: 'a1', kind: SessionArtifactKind.File, label: 'Implementation plan', isArtifact: true, uri: URI.file('/repo/docs/plan.md') }],
		}), FADE_VIEW_MESSAGES, { height: 400, scrollOffsetFromBottom: 16 }),
	}),

	SessionChatView_StackedInputSurfaces: defineComponentFixture({
		render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
			artifacts: [{ id: 'a1', kind: SessionArtifactKind.File, label: 'Implementation plan', isArtifact: true, uri: URI.file('/repo/docs/plan.md') }],
		}), STACKED_SURFACES_VIEW_MESSAGES, { height: 720 }),
	}),

	SessionChatView_ReadOnlyPills: defineComponentFixture({
		render: async (ctx) => {
			const mock = createMockSession({
				turnChanges: [editedFile('app.ts', 12, 5)],
				subagents: ['Investigate authentication'],
			});
			await renderChatWidget(ctx, {
				messages: FULL_VIEW_MESSAGES,
				inputVisible: false,
				persistentContentHeight: SESSION_CHAT_INPUT_TOOLBAR_HEIGHT,
				additionalServices: registration => registerSessionChatPillFixtureServices(registration, mock),
				decorateInputPart: (inputPart, instantiationService) => {
					const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
					pills.setSession(mock.session, mock.chat);
					inputPart.persistentContentContainerElement.appendChild(pills.element);
				},
			});
		},
	}),
});
