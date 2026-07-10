/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionChatInputToolbar } from '../../../../../sessions/contrib/chat/browser/sessionChatInputToolbar.js';
// eslint-disable-next-line local/code-import-patterns
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../sessions/common/agentHostSessionsProvider.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionFileChange, IChat, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
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
	/** File changes in the last turn; omit for a chat with no last-turn changes. */
	readonly turnChanges?: readonly ISessionFileChange[];
}

/** A mock session + its viewed chat, as the toolbar consumes them. */
interface IMockSessionAndChat {
	readonly session: IActiveSession;
	readonly chat: IChat;
}

function createMockSession(spec: ISessionSpec): IMockSessionAndChat {
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('chat:1');
		// Pills above the input only show while the chat's turn is in progress.
		override readonly status: IObservable<SessionStatus> = constObservable(SessionStatus.InProgress);
		override readonly lastTurnChanges: IObservable<readonly ISessionFileChange[]> | undefined =
			spec.turnChanges !== undefined ? constObservable(spec.turnChanges) : undefined;
	}();
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly providerId = spec.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID;
	}();
	return { session, chat };
}

// ============================================================================
// Render helpers
// ============================================================================

function renderPills(ctx: ComponentFixtureContext, mock: IMockSessionAndChat): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Broad chat service graph: provides IContextMenuService and the
			// ResourceLabels dependencies (decorations, text file, workspace, label
			// services) the preview pill needs, on top of the base editor services
			// (which register a partial ISessionsService).
			registerChatFixtureServices(reg);
		},
	});

	// Both pills are off by default; enable them so the fixture renders.
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, { changes: true, preview: true });

	const pills = disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
	pills.setSession(mock.session, mock.chat);
	container.appendChild(pills.element);

	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
}

async function renderChatViewWithPills(ctx: ComponentFixtureContext, mock: IMockSessionAndChat, messages: IFixtureMessage[]): Promise<void> {
	await renderChatWidget(ctx, {
		messages,
		decorateInputPart: (inputPart, instantiationService) => {
			// Both pills are off by default; enable them so the fixture renders.
			instantiationService.invokeFunction(accessor => {
				(accessor.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, { changes: true, preview: true });
			});
			const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
			pills.setSession(mock.session, mock.chat);
			// Mount above the input, mirroring the sessions ChatView.
			inputPart.element.insertBefore(pills.element, inputPart.element.firstChild);
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
});
