/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, ISession, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../../../../sessions/contrib/blockedSessions/browser/blockedSessions.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionActionFeedback } from '../../../../../sessions/contrib/sessions/browser/sessionActionFeedback.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsTitleBarWidget } from '../../../../../sessions/contrib/sessions/browser/sessionsTitleBarWidget.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockActiveSession(title: string, workspaceLabel: string): IActiveSession {
	const workspace = new class extends mock<ISessionWorkspace>() {
		override readonly label = workspaceLabel;
	}();
	return new class extends mock<IActiveSession>() {
		override readonly icon = Codicon.copilot;
		override readonly title: IObservable<string> = constObservable(title);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly isQuickChat: IObservable<boolean> = constObservable<boolean>(false);
	}();
}

/** A blocked session to synthesize for a fixture. */
interface IBlockedSpec {
	/** Why the session is blocked. */
	readonly reason: BlockedSessionReason;
	/** For `NeedsInput`, the kind of pending approval (terminal vs question). */
	readonly approvalKind?: AgentSessionApprovalKind;
}

/**
 * Build mock blocked sessions plus an approval model that reports the requested
 * approval kind for each session's chat, so the widget classifies them exactly.
 */
function buildBlocked(specs: readonly IBlockedSpec[]): { blocked: IBlockedSession[]; approvalModel: AgentSessionApprovalModel } {
	const approvals = new Map<string, IAgentSessionApprovalInfo>();
	const blocked = specs.map((spec, i): IBlockedSession => {
		const chatResource = URI.parse(`session-chat:/blocked/${i}`);
		if (spec.approvalKind) {
			approvals.set(chatResource.toString(), {
				kind: spec.approvalKind,
				label: 'npm run build',
				languageId: undefined,
				since: new Date(),
				confirm: () => { },
			});
		}
		const chat = new class extends mock<IChat>() {
			override readonly resource = chatResource;
		}();
		const session = new class extends mock<ISession>() {
			override readonly sessionId = `blocked-${i}`;
			override readonly chats: IObservable<readonly IChat[]> = constObservable([chat]);
		}();
		return { session, reason: spec.reason };
	});
	const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
		override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
			return constObservable(approvals.get(resource.toString()));
		}
	}();
	return { blocked, approvalModel };
}

interface ITitleBarState {
	/** The active session shown in the default pill (falls back to "New Session"). */
	activeSession?: IActiveSession;
	/** Number of blocked sessions (drives the orange "N sessions require input"). */
	blockedCount?: number;
	/** Explicit typed blocked sessions (drives the specific requires-input message). */
	blocked?: readonly IBlockedSpec[];
	/** Number of recently approved sessions (drives the green "Approved N sessions"). */
	approvedCount?: number;
}

// ============================================================================
// Render helper
// ============================================================================

function renderTitleBar(ctx: ComponentFixtureContext, state: ITitleBarState): void {
	const { container, disposableStore } = ctx;

	// Blocked sessions: either an explicit typed list, or a plain count of
	// unclassified needs-input sessions (which yield the generic message).
	const specs: readonly IBlockedSpec[] = state.blocked
		?? Array.from({ length: state.blockedCount ?? 0 }, (): IBlockedSpec => ({ reason: BlockedSessionReason.NeedsInput }));
	const { blocked, approvalModel } = buildBlocked(specs);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(state.activeSession);
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
			}());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly onDidChangePartVisibility = Event.None;
			}());
			// The blocked-sessions feature is only enabled outside of stable builds.
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly quality = 'insider';
			}());
		},
	});

	// The widget's pill styles are scoped under `.command-center`, so recreate
	// that ancestor. The command center box sizes itself relative to the
	// viewport, so give the host a representative width.
	container.classList.add('agent-sessions-workbench');
	container.style.width = '460px';
	const commandCenter = append(container, $('.command-center'));
	const widgetHost = append(commandCenter, $('div'));

	const action = new class extends mock<SubmenuItemAction>() {
		override readonly id = 'workbench.agentSessions.titlebar';
		override readonly label = 'Agent Sessions';
		override readonly tooltip = '';
		override readonly enabled = true;
		override async run() { }
	}();

	const sessionActionFeedback = new class extends mock<SessionActionFeedback>() {
		override readonly approvedCount: IObservable<number> = constObservable<number>(state.approvedCount ?? 0);
		override notifyApproved(): void { }
	}();

	const blockedSessionsModel = new class extends mock<BlockedSessions>() {
		override readonly blockedSessions: IObservable<readonly ISession[]> = constObservable(blocked.map(entry => entry.session));
		override readonly blockedSessionsWithReasons: IObservable<readonly IBlockedSession[]> = constObservable(blocked);
	}();

	const widget = disposableStore.add(instantiationService.createInstance(SessionsTitleBarWidget, action, undefined, sessionActionFeedback, approvalModel, blockedSessionsModel));
	widget.render(widgetHost);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	// Default: shows the active session pill (icon + title + workspace).
	SessionsTitleBar_ActiveSession: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
		}),
	}),

	// Requires-input: generic orange state (a mix, or unclassified needs-input).
	SessionsTitleBar_RequiresInput: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blockedCount: 3,
		}),
	}),

	// Requires-input (terminal): all blocked sessions are waiting on a terminal command.
	SessionsTitleBar_RequiresInputTerminal: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blocked: [
				{ reason: BlockedSessionReason.NeedsInput, approvalKind: AgentSessionApprovalKind.Terminal },
				{ reason: BlockedSessionReason.NeedsInput, approvalKind: AgentSessionApprovalKind.Terminal },
			],
		}),
	}),

	// Requires-input (question): all blocked sessions are asking a question.
	SessionsTitleBar_RequiresInputQuestion: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blocked: [
				{ reason: BlockedSessionReason.NeedsInput, approvalKind: AgentSessionApprovalKind.Question },
			],
		}),
	}),

	// Requires-input (failing CI): all blocked sessions have failing CI checks.
	SessionsTitleBar_RequiresInputFailingCI: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blocked: [
				{ reason: BlockedSessionReason.FailingCI },
				{ reason: BlockedSessionReason.FailingCI },
			],
		}),
	}),

	// Requires-input (mixed): a mix of reasons falls back to the generic message.
	SessionsTitleBar_RequiresInputMixed: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blocked: [
				{ reason: BlockedSessionReason.NeedsInput, approvalKind: AgentSessionApprovalKind.Terminal },
				{ reason: BlockedSessionReason.FailingCI },
			],
		}),
	}),

	// Approved (one): transient green confirmation after approving a session action.
	SessionsTitleBar_ApprovedOne: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			approvedCount: 1,
		}),
	}),

	// Approved (many): green confirmation after approving several sessions in a row.
	// Takes precedence over the orange requires-input state while visible.
	SessionsTitleBar_ApprovedMany: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blockedCount: 3,
			approvedCount: 3,
		}),
	}),
});
