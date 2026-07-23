/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { BrowserEditorInput } from '../../../../contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../contrib/browserView/common/browserView.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionChatInputToolbar } from '../../../../../sessions/contrib/chat/browser/sessionChatInputToolbar.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionChatPillsDebugData } from '../../../../../sessions/contrib/chat/browser/sessionChatInputToolbarDebug.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionInputBanners } from '../../../../../sessions/contrib/sessionInputBanners/browser/sessionInputBanners.js';
// eslint-disable-next-line local/code-import-patterns
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../sessions/common/agentHostSessionsProvider.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatOriginKind, ISessionFileChange, IChat, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from '../chat/chatFixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from '../chat/chatWidget.fixture.js';

// ============================================================================
// Mock helpers
// ============================================================================

/** A file created during the turn (no original => classified as "created"). */
function createdFile(name: string, insertions: number, deletions: number): ISessionFileChange {
	return { uri: URI.file(`/repo/${name}`), modifiedUri: URI.file(`/repo/${name}`), insertions, deletions };
}

/** A file edited during the turn (has an original => classified as "modified"). */
function editedFile(name: string, insertions: number, deletions: number): ISessionFileChange {
	const uri = URI.file(`/repo/${name}`);
	return { uri, modifiedUri: uri, originalUri: uri, insertions, deletions };
}

interface ISessionSpec {
	readonly providerId?: string;
	readonly status?: SessionStatus;
	/** File changes in the last turn; omit for a chat with no last-turn changes. */
	readonly turnChanges?: readonly ISessionFileChange[];
	readonly browsers?: readonly { readonly title?: string; readonly ownerSubagent?: number }[];
	readonly subagents?: readonly string[];
}

/** A mock session + its viewed chat, as the toolbar consumes them. */
interface IMockSessionAndChat {
	readonly session: IActiveSession;
	readonly chat: IChat;
	readonly browsers: readonly BrowserEditorInput[];
}

function createMockSession(spec: ISessionSpec): IMockSessionAndChat {
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('chat:1');
		override readonly title = constObservable('Main chat');
		// Pills above the input show while the chat has an active turn.
		override readonly status: IObservable<SessionStatus> = constObservable(spec.status ?? SessionStatus.InProgress);
		override readonly lastTurnChanges: IObservable<readonly ISessionFileChange[]> | undefined =
			spec.turnChanges !== undefined ? constObservable(spec.turnChanges) : undefined;
	}();
	const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock<IChat>() {
		override readonly resource = URI.parse(`chat:subagent-${index}`);
		override readonly title = constObservable(title);
		override readonly status = constObservable(SessionStatus.InProgress);
		override readonly origin = { kind: ChatOriginKind.Tool, parentChat: chat.resource };
	}());
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly providerId = spec.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly chats = constObservable([chat, ...subagents]);
	}();
	const browsers = (spec.browsers ?? []).map((browser, index) => {
		const owner = browser.ownerSubagent === undefined ? chat : subagents[browser.ownerSubagent];
		const model = new class extends mock<IBrowserViewModel>() {
			override readonly owner = { mainWindowId: 1, sessionId: owner.resource.toString() };
		}();
		return new class extends mock<BrowserEditorInput>() {
			override get id(): string { return `browser-${index}`; }
			override get model(): IBrowserViewModel { return model; }
			override get title(): string | undefined { return browser.title; }
			override readonly onDidChangeLabel = Event.None;
		}();
	});
	return { session, chat, browsers };
}

function createBrowserViewService(inputs: readonly BrowserEditorInput[]): IBrowserViewWorkbenchService {
	const known = new Map(inputs.map(input => [input.id, input]));
	return new class extends mock<IBrowserViewWorkbenchService>() {
		override readonly onDidChangeBrowserViews = Event.None;
		override getKnownBrowserViews() { return known; }
		override async getPreferredGroup() { return undefined; }
	}();
}

// ============================================================================
// Render helpers
// ============================================================================

function renderPills(ctx: ComponentFixtureContext, sessionMock: IMockSessionAndChat, options?: { readonly debugData?: ISessionChatPillsDebugData; readonly enabled?: boolean }): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Broad chat service graph: provides IContextMenuService and the
			// ResourceLabels dependencies (decorations, text file, workspace, label
			// services) the preview pill needs, on top of the base editor services
			// (which register a partial ISessionsService).
			registerChatFixtureServices(reg);
			reg.defineInstance(IBrowserViewWorkbenchService, createBrowserViewService(sessionMock.browsers));
			if (options?.debugData) {
				reg.defineInstance(IGitHubService, new class extends mock<IGitHubService>() {
					override readonly activeSessionPullRequestObs = constObservable(undefined);
					override readonly activeSessionPullRequestCIObs = constObservable(undefined);
					override readonly activeSessionPullRequestReviewThreadsObs = constObservable(undefined);
				}());
				reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
					override readonly onDidChangeFeedback = Event.None;
					override getFeedback() { return []; }
				}());
			}
		},
	});

	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, options?.enabled ?? true);

	const pills = disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
	pills.setSession(sessionMock.session, sessionMock.chat);
	pills.setDebugData(options?.debugData);
	container.appendChild(pills.element);
	if (options?.debugData) {
		const banners = disposableStore.add(instantiationService.createInstance(SessionInputBanners));
		banners.setDebugData(options.debugData);
		container.appendChild(banners.domNode);
	}

	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
}

async function renderChatViewWithPills(ctx: ComponentFixtureContext, mock: IMockSessionAndChat, messages: IFixtureMessage[]): Promise<void> {
	await renderChatWidget(ctx, {
		messages,
		decorateInputPart: (inputPart, instantiationService) => {
			// All pills are off by default; enable them so the fixture renders.
			instantiationService.invokeFunction(accessor => {
				(accessor.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
			});
			const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
			pills.setSession(mock.session, mock.chat);
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

	// --- Preview pill (resource label + dropdown) ---------------------------

	SessionChatPills_PreviewMarkdown: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			status: SessionStatus.NeedsInput,
			turnChanges: [createdFile('README.md', 20, 0), editedFile('app.ts', 8, 3)],
		})),
	}),

	SessionChatPills_PreviewHtml: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [createdFile('index.html', 60, 2), editedFile('styles.css', 14, 1)],
		})),
	}),

	SessionChatPills_PreviewMultiple_PrimaryCreated: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [
				editedFile('app.ts', 8, 3),
				createdFile('README.md', 20, 0),
				createdFile('index.html', 30, 4),
				editedFile('CHANGELOG.md', 6, 1),
			],
		})),
	}),

	SessionChatPills_PreviewMultiple_PrimaryEdited: defineComponentFixture({
		render: (ctx) => renderPills(ctx, createMockSession({
			turnChanges: [editedFile('docs.md', 10, 2), editedFile('page.html', 4, 1)],
		})),
	}),

	// --- Background activity pill ------------------------------------------

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
			enabled: false,
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

	SessionChatView_BothPills: defineComponentFixture({
		render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
			turnChanges: [createdFile('README.md', 20, 0), createdFile('index.html', 30, 4), editedFile('app.ts', 8, 3)],
		}), FULL_VIEW_MESSAGES),
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
				decorateInputPart: (inputPart, instantiationService) => {
					instantiationService.invokeFunction(accessor => {
						(accessor.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
					});
					const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
					pills.setSession(mock.session, mock.chat);
					inputPart.persistentContentContainerElement.appendChild(pills.element);
				},
			});
		},
	}),
});
