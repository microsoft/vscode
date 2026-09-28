/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ONBOARDING_TARGET_ATTR } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightOverlay } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightOverlay.js';
import { ComponentFixtureContext, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { createSessionArchiveTour } from '../../../onboardingTours/browser/tours/sessionArchiveTour.js';
import { AUTOMATIONS_NEW_BADGE_STYLE_SETTING } from '../../browser/automationsNewBadge.js';
import { SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, SessionsGrouping } from '../../browser/views/sessionsList.js';
import { defineSessionsListFixture, ISessionsListFixture, ISessionsListFixtureGroup, ISessionsListFixtureSession } from './sessionsListFixtureUtils.js';

//#region Data

function releaseWork(...sessions: string[]): ISessionsListFixtureGroup {
	return { id: 'release', name: 'Release work', sessions };
}

const NESTED_CHAT_SESSION: ISessionsListFixtureSession = {
	id: 'a',
	title: 'HTTP Client Retry Plan',
	workspace: 'vscode-tools',
	minutesAgo: 2,
	chats: [
		{ id: 'task-a', title: 'Task A' },
		{ id: 'task-b', title: 'Task B' },
	],
};
const ARCHIVED_CHAT_SESSION: ISessionsListFixtureSession = {
	id: 'nested-archive',
	title: 'Investigate session persistence',
	workspace: 'vscode',
	minutesAgo: 2,
	chats: [
		{ id: 'active', title: 'Compare provider state', canArchive: true },
		{ id: 'archived', title: 'Previous persistence approach', isArchived: true, canArchive: true },
	],
};
const COMPACT_NESTED_CHAT_PRIMARY_ACTION_SESSION: ISessionsListFixtureSession = {
	id: 'nested-primary-action',
	title: 'Move chats',
	workspace: 'vscode',
	workspaceFolders: ['vscode', 'vscode-tools'],
	minutesAgo: 2,
	chats: [
		{ id: 'review', title: 'Review chat transfer', workspace: 'vscode', canArchive: true },
	],
};
const GROUPED_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 12, changesSummary: { files: 4, additions: 132, deletions: 18 } },
	{ id: 'b', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 64 },
	{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 },
];
const EXTERNAL_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'regular', title: 'Update onboarding copy', workspace: 'vscode', minutesAgo: 10 },
	{ id: 'external-repo', title: 'Hello world test', workspace: 'vscode', minutesAgo: 15, isExternal: true, supportsMultipleChats: true },
	{ id: 'external-directory', title: 'Directory-only SDK session', workspace: 'scratch', minutesAgo: 30, isExternal: true, supportsMultipleChats: true },
	{ id: 'done', title: 'Completed external session', workspace: 'vscode', minutesAgo: 60, isExternal: true, isArchived: true },
];
const COLLAPSED_SECTION_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'grouped-unread', title: 'Unread session in the group only', workspace: 'vscode', minutesAgo: 12, isRead: false },
	{ id: 'workspace-read', title: 'Read session in the workspace', workspace: 'vscode', minutesAgo: 24 },
	{ id: 'workspace-unread', title: 'Unread session in the workspace', workspace: 'vscode-docs', minutesAgo: 36, isRead: false },
];
const COLLAPSED_NEEDS_INPUT_SESSIONS: readonly ISessionsListFixtureSession[] = [
	...COLLAPSED_SECTION_SESSIONS,
	{ id: 'grouped-needs-input', title: 'Needs input in the group only', workspace: 'vscode', minutesAgo: 48, status: SessionStatus.NeedsInput },
	{ id: 'workspace-needs-input', title: 'Needs input in the workspace', workspace: 'vscode-docs', minutesAgo: 60, status: SessionStatus.NeedsInput },
];
const COLLAPSED_CI_FAILURE_SESSIONS: readonly ISessionsListFixtureSession[] = [
	...COLLAPSED_SECTION_SESSIONS,
	{ id: 'grouped-failing-ci', title: 'CI failure in the group only', workspace: 'vscode', minutesAgo: 48, hasFailingCI: true },
	{ id: 'workspace-failing-ci', title: 'CI failure in the workspace', workspace: 'vscode-docs', minutesAgo: 60, hasFailingCI: true },
];
const COMPACT_RENAME_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'terminal-confirmation', title: 'Terminal confirmation UX ideas', workspace: 'vscode', minutesAgo: 2, chats: [{ id: 'peer', title: 'hi' }] },
	{ id: 'folder-worktree', title: 'Folder vs Worktree sessions', workspace: 'vscode', minutesAgo: 8 },
];
const UNREAD_STATUS_ICON_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'workspace-less', title: 'Fix worktree workspace mapping', isQuickChat: true, minutesAgo: 1, isRead: false },
	{ id: 'workspace', title: 'Fix VS Code #331780', workspace: 'vscode', minutesAgo: 2, isRead: false },
];
const COMPACT_NEEDS_INPUT_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{
		id: 'question',
		title: 'Choose the authentication migration',
		workspace: 'vscode',
		minutesAgo: 2,
		status: SessionStatus.NeedsInput,
		description: 'Which compatibility strategy should I use for existing authentication extensions and older remote clients?',
	},
	{ id: 'approval', title: 'Publish the release branch', workspace: 'vscode', minutesAgo: 5, status: SessionStatus.NeedsInput, approvalCommand: 'git push origin release/1.139' },
	{ id: 'completed', title: 'Update onboarding copy', workspace: 'vscode', minutesAgo: 12 },
];

/** Sessions for the custom group fixtures. */
const GROUP_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'auth', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 12, changesSummary: { files: 4, additions: 132, deletions: 18 } },
	{ id: 'backoff', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 64 },
	{ id: 'flaky', title: 'Investigate flaky smoke test', workspace: 'vscode', minutesAgo: 20, status: SessionStatus.InProgress, description: 'Running the smoke tests' },
	{ id: 'guide', title: 'Refresh the getting started guide', workspace: 'vscode-docs', minutesAgo: 90 },
	{ id: 'copy', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 },
];
const RELEASE_GROUP: ISessionsListFixtureGroup = { id: 'release', name: 'Release work', sessions: ['auth', 'backoff'] };
const TRIAGE_GROUP: ISessionsListFixtureGroup = { id: 'triage', name: 'Triage', sessions: ['flaky'] };
const DOCS_GROUP: ISessionsListFixtureGroup = { id: 'docs', name: 'Docs refresh', sessions: ['guide'] };
const EMPTY_GROUP: ISessionsListFixtureGroup = { id: 'later', name: 'Later' };

//#endregion

//#region Feature overlays

function showArchiveOnboarding(sessionId: string, wording: ChatSessionArchiveActionWording) {
	return ({ list, container, sessions }: ISessionsListFixture, { disposableStore }: ComponentFixtureContext): void => {
		const reveal = disposableStore.add(list.revealArchiveAction(sessions.get(sessionId)!.session));
		const target = container.querySelector<HTMLElement>(`[${ONBOARDING_TARGET_ATTR}="${CSS.escape(reveal.targetId)}"]`);
		if (!target) {
			throw new Error('Expected the production session archive action.');
		}
		const step = createSessionArchiveTour(reveal.targetId, wording, async () => { }).presentation.payload.steps[0];
		const overlay = disposableStore.add(new SpotlightOverlay(container));
		const finish = () => {
			overlay.hide();
			reveal.dispose();
		};
		disposableStore.add(overlay.onDidClickNext(finish));
		disposableStore.add(overlay.onDidSkip(finish));
		overlay.show(target, {
			title: step.title,
			description: step.description,
			stepIndex: 0,
			stepCount: 1,
			canGoBack: false,
			isLastStep: true,
			nextButtonLabel: step.nextButtonLabel,
		}, {
			placement: step.placement,
			advanceOnTargetClick: step.advanceOnTargetClick,
			hideNext: step.hideNext,
		});
	};
}

const ONBOARDING_FRAME = { width: 760, height: 420 };
/** Room beside and below the list for an open context menu. */
const CONTEXT_MENU_FRAME = { width: 480, height: 320 };

//#endregion

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	//#region Sections and placement

	SessionsList_ExternalWorkspace: defineSessionsListFixture({
		sessions: EXTERNAL_SESSIONS,
		view: { height: 340 },
		settings: { [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: true, [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, { labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast'] }),
	SessionsList_ExternalDate: defineSessionsListFixture({
		sessions: EXTERNAL_SESSIONS,
		view: { grouping: SessionsGrouping.Date, height: 340 },
		settings: { [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: true, [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, { labels: { kind: 'screenshot' } }),
	SessionsList_ExternalGroupingDisabled: defineSessionsListFixture({
		sessions: EXTERNAL_SESSIONS,
		view: { height: 340 },
		settings: { [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: false, [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, { labels: { kind: 'screenshot' } }),
	SessionsList_WorkspaceSection: defineSessionsListFixture({
		sessions: [{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 }],
	}),
	SessionsList_UnreadStatusIcons: defineSessionsListFixture({
		sessions: UNREAD_STATUS_ICON_SESSIONS,
		view: { width: 400 },
		interaction: { selected: [{ session: 'workspace-less' }], focused: { session: 'workspace-less' }, listFocused: false },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The unread blue-dot status icons for the workspace-less chat and workspace session are the same size.'],
	}),

	//#endregion

	//#region Collapsed sections

	SessionsList_CollapsedUnreadSections: defineSessionsListFixture({
		sessions: COLLAPSED_SECTION_SESSIONS,
		groups: [releaseWork('grouped-unread')],
		view: { collapsed: 'all' },
		settings: { [SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING]: true },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All sections are collapsed. Filled unread indicators replace the icons for Release work and vscode-docs. The vscode section retains its folder icon because its unread session appears only in Release work.'],
	}),
	SessionsList_CollapsedUnreadSections_Disabled: defineSessionsListFixture({
		sessions: COLLAPSED_SECTION_SESSIONS,
		groups: [releaseWork('grouped-unread')],
		view: { collapsed: 'all' },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All sections are collapsed and retain their normal group or folder icons despite containing unread sessions, because collapsed-section indicators are disabled by default.'],
	}),
	SessionsList_CollapsedNeedsInputSections: defineSessionsListFixture({
		sessions: COLLAPSED_NEEDS_INPUT_SESSIONS,
		groups: [releaseWork('grouped-unread', 'grouped-needs-input')],
		view: { collapsed: 'all', reducedMotion: false },
		settings: { [SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING]: true },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All sections are collapsed. Orange ring pixel spinners replace the icons for Release work and vscode-docs, taking priority over unread indicators. The vscode section retains its folder icon because its needs-input session appears only in Release work.'],
	}),
	SessionsList_CollapsedNeedsInputSections_Disabled: defineSessionsListFixture({
		sessions: COLLAPSED_NEEDS_INPUT_SESSIONS,
		groups: [releaseWork('grouped-unread', 'grouped-needs-input')],
		view: { collapsed: 'all' },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All collapsed sections retain their normal group or folder icons despite containing unread and needs-input sessions, because collapsed-section indicators are disabled by default.'],
	}),
	SessionsList_CollapsedCIFailureSections: defineSessionsListFixture({
		sessions: COLLAPSED_CI_FAILURE_SESSIONS,
		groups: [releaseWork('grouped-unread', 'grouped-failing-ci')],
		view: { collapsed: 'all' },
		settings: { [SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING]: true },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All sections are collapsed. Orange dots replace the icons for Release work and vscode-docs, taking priority over unread indicators. The vscode section retains its folder icon because its session with failing CI appears only in Release work.'],
	}),
	SessionsList_CollapsedCIFailureSections_Disabled: defineSessionsListFixture({
		sessions: COLLAPSED_CI_FAILURE_SESSIONS,
		groups: [releaseWork('grouped-unread', 'grouped-failing-ci')],
		view: { collapsed: 'all' },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['All collapsed sections retain their normal group or folder icons despite containing unread sessions and CI failures, because collapsed-section indicators are disabled by default.'],
	}),

	//#endregion

	//#region Custom groups

	SessionsList_CustomGroup: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		groups: [releaseWork('a', 'b')],
	}),
	SessionsList_CustomGroup_LongWorkspaceNarrow: defineSessionsListFixture({
		sessions: [
			{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'an-extremely-long-workspace-name-that-must-truncate', minutesAgo: 12, changesSummary: { files: 4, additions: 132, deletions: 18 } },
			...GROUPED_SESSIONS.slice(1),
		],
		groups: [releaseWork('a', 'b')],
		view: { width: 260 },
	}),
	SessionsList_CustomGroup_InProgress: defineSessionsListFixture({
		sessions: [
			{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'agent-host-protocol', minutesAgo: 1, status: SessionStatus.InProgress, description: 'Running the integration suite' },
			...GROUPED_SESSIONS.slice(1),
		],
		groups: [releaseWork('a', 'b')],
		view: { width: 260 },
	}),
	SessionsList_CustomGroup_Phone: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		groups: [releaseWork('a', 'b')],
		view: { phone: true, width: 340 },
	}),
	SessionsList_Groups: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP, TRIAGE_GROUP, DOCS_GROUP],
		view: { height: 460 },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['Three custom groups render in their listed order, Release work, Triage, then Docs refresh, above the vscode-docs workspace section that holds the one ungrouped session. Completed grouped session rows show a workspace badge, the in-progress Triage session shows its status instead, and connectors link the two Release work sessions.'],
	}),
	SessionsList_Groups_Empty: defineSessionsListFixture({
		sessions: GROUP_SESSIONS.filter(session => session.id !== 'flaky' && session.id !== 'guide'),
		groups: [RELEASE_GROUP, EMPTY_GROUP],
		view: { height: 300 },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['An empty Later group shows a muted "No session" placeholder row below its header, between the populated Release work group and the vscode-docs workspace section.'],
	}),
	SessionsList_Groups_EmptyHidden: defineSessionsListFixture({
		sessions: GROUP_SESSIONS.filter(session => session.id !== 'flaky' && session.id !== 'guide'),
		groups: [RELEASE_GROUP, EMPTY_GROUP],
		view: { height: 300, showEmptyGroups: false },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With empty groups filtered out, only the populated Release work group and the vscode-docs workspace section are shown; the empty Later group is hidden.'],
	}),
	SessionsList_Groups_EmptyHoveredHeader: defineSessionsListFixture({
		sessions: GROUP_SESSIONS.filter(session => session.id !== 'flaky' && session.id !== 'guide'),
		groups: [RELEASE_GROUP, EMPTY_GROUP],
		view: { height: 300 },
		interaction: { hovered: { group: 'later' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The pointer is over the empty Later group header. The header shows its hover background, a chevron in place of the group icon, and New Session and Delete Group actions on the right. Its "No session" placeholder row remains below.'],
	}),
	SessionsList_Groups_Rename: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP, TRIAGE_GROUP],
		view: { height: 380 },
		interaction: { renaming: { group: 'release' } },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Release work group header shows an inline name editor with the whole name selected, aligned with the group icon and without changing the header height. The Triage group header and all session rows are unchanged.'],
	}),
	SessionsList_Groups_Create: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP],
		view: { height: 460 },
		interaction: { createGroupFrom: ['guide', 'copy'] },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A new group created from two sessions appears first with an inline name editor showing "New Group" selected. It contains the two vscode-docs sessions, followed by the Release work group and the remaining workspace sections.'],
	}),
	SessionsList_Groups_HoveredHeader: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP],
		view: { height: 380 },
		interaction: { hovered: { group: 'release' } },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The pointer is over the Release work group header. It shows its hover background, a chevron in place of the group icon, and New Session and Archive All actions on the right.'],
	}),
	SessionsList_Groups_FocusedHeader: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP],
		view: { height: 380 },
		interaction: { focused: { group: 'release' } },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Release work group header has keyboard focus, shown with a focus outline, a chevron in place of the group icon, and its New Session and Archive All actions.'],
	}),
	SessionsList_Groups_Collapsed: defineSessionsListFixture({
		sessions: GROUP_SESSIONS,
		groups: [RELEASE_GROUP, TRIAGE_GROUP],
		view: { height: 320, collapsed: [{ group: 'release' }] },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Release work group is collapsed to its header while the Triage group and the workspace sections stay expanded.'],
	}),
	SessionsList_Groups_DateGrouping: defineSessionsListFixture({
		sessions: [
			...GROUP_SESSIONS,
			{ id: 'legacy', title: 'Remove the legacy settings migration', workspace: 'vscode', minutesAgo: 20_000 },
		],
		groups: [RELEASE_GROUP, TRIAGE_GROUP],
		view: { grouping: SessionsGrouping.Date, height: 460 },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With date grouping, the Release work and Triage groups form a contiguous block at the top. The ungrouped sessions follow in the Recent section, and the Older section is collapsed.'],
	}),
	SessionsList_Groups_PinnedPrecedence: defineSessionsListFixture({
		sessions: GROUP_SESSIONS.map(session => session.id === 'auth' ? { ...session, pinned: true } : session),
		groups: [RELEASE_GROUP],
		view: { height: 420, expanded: [{ section: 'pinned' }] },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A pinned member of Release work appears in the expanded Pinned section at the top rather than in its group, which keeps only its other session.'],
	}),

	//#endregion

	//#region Pointer and keyboard state

	SessionsList_HoveredSession: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		view: { height: 300 },
		interaction: { hovered: { session: 'a' } },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The pointer is over the first session row. It shows the hover background and Pin and Archive actions after its title; the other rows are at rest.'],
	}),
	SessionsList_HoveredWorkspaceHeader: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		view: { height: 300 },
		interaction: { hovered: { workspace: 'vscode-docs' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The pointer is over the vscode-docs workspace section header. It shows its hover background, a chevron in place of the folder icon, and its section actions on the right.'],
	}),
	SessionsList_HoveredChat: defineSessionsListFixture({
		sessions: [NESTED_CHAT_SESSION],
		view: { width: 340 },
		interaction: { hovered: { session: 'a', chat: 'task-b' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The pointer is over the Task B chat row, which shows its hover background. Hovering a chat reveals its parent session hierarchy guides while the parent keeps its status icon.'],
	}),
	SessionsList_KeyboardFocusedSession: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		view: { height: 300 },
		interaction: { focused: { session: 'b' } },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Add reconnect backoff session has keyboard focus without being selected: it shows a focus outline and its Pin and Archive actions.'],
	}),
	SessionsList_SelectedSession: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		view: { height: 300 },
		interaction: { selected: [{ session: 'a' }], listFocused: false },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The first session is selected while the list does not have keyboard focus, so it shows the inactive selection background without actions.'],
	}),
	SessionsList_MultiSelection: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		view: { height: 300 },
		interaction: { selected: [{ session: 'a' }, { session: 'c' }], focused: { session: 'c' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Two sessions are selected with the list focused. Both show the active selection background, and the focused Update onboarding copy row also shows its focus outline and actions.'],
	}),
	SessionsList_NarrowHoverToolbar: defineSessionsListFixture({
		sessions: [{ id: 'a', title: 'Review PR 333429: sessions fix normalize Windows workspace path casing', workspace: 'vscode', minutesAgo: 12, changesSummary: { files: 4, additions: 104, deletions: 4 } }],
		groups: [releaseWork('a')],
		view: { width: 260 },
		interaction: { hovered: { session: 'a' } },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A narrow hovered session row truncates its long title and shows its Pin and Archive actions fully inside the rounded row boundary.'],
	}),
	SessionsList_SelectedKeyboardFocus: defineSessionsListFixture({
		sessions: [{ id: 'a', title: 'Fix keyboard navigation in the selected session', workspace: 'vscode', minutesAgo: 12 }],
		view: { width: 260 },
		interaction: { selected: [{ session: 'a' }], focused: { session: 'a' } },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The selected session row has keyboard focus and visible Pin and Archive actions without hover; its long title truncates before the actions.'],
	}),

	//#endregion

	//#region Compact rows and rename

	SessionsList_Compact: defineSessionsListFixture({
		sessions: COMPACT_RENAME_SESSIONS,
		view: { compact: true, width: 340 },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A compact vscode workspace section shows a session with one nested chat and a second session. Session titles, status icons, and nested-chat titles are vertically centered in their rows.'],
	}),
	SessionsList_CompactTwistie: defineSessionsListFixture({
		sessions: COMPACT_RENAME_SESSIONS,
		view: { compact: true, width: 340 },
		interaction: { hovered: { session: 'terminal-confirmation' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A compact vscode workspace section shows a hovered, expanded session with its nested-chat twistie visible in place of the status icon. The twistie is vertically centered with the session title.'],
	}),
	SessionsList_CompactUnreadStatusIcons: defineSessionsListFixture({
		sessions: UNREAD_STATUS_ICON_SESSIONS,
		view: { compact: true, width: 400 },
		interaction: { selected: [{ session: 'workspace-less' }], focused: { session: 'workspace-less' }, listFocused: false },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['In compact mode, the unread blue-dot status icons for the workspace-less chat and workspace session are the same size.'],
	}),
	SessionsList_CompactNeedsInput: defineSessionsListFixture({
		sessions: COMPACT_NEEDS_INPUT_SESSIONS,
		view: { compact: true, width: 380 },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A compact vscode workspace section shows three sessions. The first session expands with a truncated input-needed callout but no button. The second expands with a terminal-command approval callout and an Allow button. The completed third session remains a single compact title row.'],
	}),
	SessionsList_CompactSessionRename: defineSessionsListFixture({
		sessions: COMPACT_RENAME_SESSIONS,
		view: { compact: true, width: 340 },
		interaction: { focused: { session: 'terminal-confirmation' }, listFocused: false, renaming: { session: 'terminal-confirmation' } },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The first compact session row is being renamed inline. The input text and border are vertically centered with the status icon and row actions, without shifting the row height.'],
	}),
	SessionsList_CompactChatRename: defineSessionsListFixture({
		sessions: COMPACT_RENAME_SESSIONS,
		view: { compact: true, width: 340 },
		interaction: { renaming: { session: 'terminal-confirmation', chat: 'peer' } },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The nested chat row is being renamed inline. Its input text and border are vertically centered with the compact chat status icon, without shifting the row height.'],
	}),

	//#endregion

	//#region Nested chats

	SessionsList_PeerChatInProgress: defineSessionsListFixture({
		sessions: [{
			id: 'a',
			title: 'Single-pane details behavior',
			workspace: 'vscode',
			minutesAgo: 0,
			status: SessionStatus.InProgress,
			mainChatStatus: SessionStatus.Completed,
			chats: [
				{ id: 'layout', title: 'Fix single-pane details layout' },
				{ id: 'restore', title: 'Fix empty files restore', status: SessionStatus.InProgress },
			],
		}],
		view: { width: 620 },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An expanded session has a completed main chat and two nested peer chat rows. The session row and the active "Fix empty files restore" peer chat row both show blue in-progress icons, while the completed "Fix single-pane details layout" peer chat shows an inactive dot. The session details say "Working...".'],
	}),
	// A session whose nested chats each surface their own pending approval on
	// their own row, plus an approval on the session's main chat (on the session
	// row). Exercises the per-chat approval rendering and row-height reservation.
	SessionsList_NestedChatApprovals: defineSessionsListFixture({
		sessions: [{
			id: 'a',
			title: 'HTTP Client Retry Plan',
			workspace: 'vscode-tools',
			minutesAgo: 2,
			status: SessionStatus.NeedsInput,
			approvalCommand: 'yarn workspace @vscode-tools/server build --watch',
			chats: [
				{ id: 'task-a', title: 'Task A', status: SessionStatus.NeedsInput, approvalCommand: 'yarn workspace @vscode-tools/server build' },
				{ id: 'task-b', title: 'Task B' },
				{ id: 'task-c', title: 'Task C', status: SessionStatus.NeedsInput, approvalCommand: 'npm run test:integration -- --grep "retry"' },
			],
		}],
		view: { width: 340 },
	}),
	SessionsList_NestedChatApprovals_Phone: defineSessionsListFixture({
		sessions: [{
			id: 'a',
			title: 'HTTP Client Retry Plan',
			workspace: 'vscode-tools',
			minutesAgo: 2,
			status: SessionStatus.NeedsInput,
			chats: [
				{ id: 'task-a', title: 'Task A', status: SessionStatus.NeedsInput, approvalCommand: 'yarn workspace @vscode-tools/server build' },
				{ id: 'task-b', title: 'Task B' },
			],
		}],
		view: { phone: true, width: 340 },
	}),
	SessionsList_NestedChats: defineSessionsListFixture({
		sessions: [NESTED_CHAT_SESSION],
		view: { width: 340 },
		interaction: { hovered: { session: 'a' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A hovered, expanded session in its workspace section has two nested chat rows. Its twistie replaces the status icon, and rounded hierarchy connectors run continuously from the parent and stop before each child status icon.'],
	}),
	SessionsList_NestedChats_PinnedView: defineSessionsListFixture({
		sessions: [{ ...NESTED_CHAT_SESSION, sticky: true }],
		view: { width: 340 },
		interaction: { hovered: { session: 'a', chat: 'task-b' } },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['An expanded session with its view pinned remains in its workspace section rather than the Pinned sidebar section. With the pointer over its Task B chat, its sticky marker does not shift the parent icon or hierarchy connectors, and both nested chat rows remain visible.'],
	}),
	SessionsList_NestedChatHierarchyGuides: defineSessionsListFixture({
		sessions: [{ ...NESTED_CHAT_SESSION, pinned: true, sticky: true }],
		view: { width: 340, expanded: [{ section: 'pinned' }] },
		interaction: { hovered: { session: 'a', chat: 'task-a' } },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An expanded pinned and sticky session has two nested chat rows, and the pointer is over the Task A chat. Its compact blue sticky marker does not shift the session icon away from the hierarchy guide. A single high-contrast guide color runs continuously from the parent, through the hovered row, into rounded branches that stop short of each child status icon, without gaps or visible shade changes.'],
	}),

	//#endregion

	//#region Archived chats

	SessionsList_ArchivedNestedChat: defineSessionsListFixture({
		sessions: [ARCHIVED_CHAT_SESSION],
		view: { showArchived: true, width: 400 },
		interaction: { focused: { session: 'nested-archive', chat: 'archived' } },
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['An expanded vscode session shows one active nested chat and one archived nested chat. The archived chat remains under its parent, uses the completed archive status icon, and shows Restore as its primary row action when focused.'],
	}),
	SessionsList_CompactNestedChatPrimaryAction: defineSessionsListFixture({
		sessions: [COMPACT_NESTED_CHAT_PRIMARY_ACTION_SESSION],
		view: { compact: true, width: 400 },
		interaction: { focused: { session: 'nested-primary-action', chat: 'review' } },
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An expanded compact multi-folder session shows a nested chat with its workspace badge beside the title and its Mark as Done primary action aligned to the trailing edge of the row.'],
	}),
	SessionsList_ArchivedNestedChatSessionMenu: defineSessionsListFixture({
		sessions: [{ ...ARCHIVED_CHAT_SESSION, chats: ARCHIVED_CHAT_SESSION.chats?.filter(chat => !chat.isArchived) }],
		view: { width: 400 },
		interaction: { contextMenu: { session: 'nested-archive' } },
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
		frame: CONTEXT_MENU_FRAME,
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['An expanded vscode session with no Done chats has its context menu open. Show Done Chats is always available, unchecked, and appears directly after New Chat in This Session in the same action group.'],
	}),

	//#endregion

	//#region Archive onboarding

	SessionsList_ArchiveOnboarding: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		frame: ONBOARDING_FRAME,
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		afterRender: showArchiveOnboarding('a', ChatSessionArchiveActionWording.Archive),
	}),
	SessionsList_MarkAsDoneOnboarding: defineSessionsListFixture({
		sessions: GROUPED_SESSIONS,
		frame: ONBOARDING_FRAME,
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, {
		labels: { kind: 'screenshot' },
		afterRender: showArchiveOnboarding('a', ChatSessionArchiveActionWording.MarkAsDone),
	}),
	SessionsList_Confetti: defineSessionsListFixture({
		sessions: [{ id: 'confetti', title: 'Finish confetti animation fixture', workspace: 'vscode', minutesAgo: 1 }],
		view: { reducedMotion: false },
		frame: ONBOARDING_FRAME,
		settings: { [SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: true, [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone },
	}, {
		afterRender: ({ list, sessions }, { disposableStore }) => {
			disposableStore.add(list.revealArchiveAction(sessions.get('confetti')!.session));
		},
	}),

	//#endregion

	//#region Header

	SessionsList_AutomationsNewBadge: defineSessionsListFixture({
		sessions: [],
		header: { automations: true },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button. Directly below it, the Automations row has a smaller right-aligned outlined NEW capsule that reads as a non-interactive feature badge rather than a second button.'],
	}),
	SessionsList_AutomationsNewBadge_Accent: defineSessionsListFixture({
		sessions: [],
		header: { automations: true },
		settings: { [AUTOMATIONS_NEW_BADGE_STYLE_SETTING]: 'accent' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row has a compact right-aligned NEW pill using the prominent activity badge colors, while the larger outlined New button remains visually distinct in the Sessions header.'],
	}),
	SessionsList_AutomationsNewBadge_Soft: defineSessionsListFixture({
		sessions: [],
		header: { automations: true },
		settings: { [AUTOMATIONS_NEW_BADGE_STYLE_SETTING]: 'soft' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row has a compact right-aligned NEW pill with a subtle neutral fill, while the larger outlined New button remains visually distinct in the Sessions header.'],
	}),
	SessionsList_AutomationsNewBadge_Unread: defineSessionsListFixture({
		sessions: [],
		header: { automations: true },
		settings: { [AUTOMATIONS_NEW_BADGE_STYLE_SETTING]: 'unread' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row uses the standard filled blue unread indicator in its leading icon slot to signal the new feature and does not show a trailing NEW capsule, while the Sessions header retains its outlined New button.'],
	}),
	SessionsList_AutomationsNewBadge_Narrow: defineSessionsListFixture({
		sessions: [],
		view: { width: 170 },
		header: { automations: true },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['At the 170px minimum sidebar width, the Automations label remains readable and the outlined NEW capsule stays right-aligned without changing the row height.'],
	}),
	SessionsList_AutomationsNewBadge_Running: defineSessionsListFixture({
		sessions: [],
		header: { automations: true, automationRunStatus: 'running' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row shows its running status icon and the outlined NEW capsule together without overlap or layout shift.'],
	}),
	SessionsList_CustomizationsNavigationTreatment: defineSessionsListFixture({
		sessions: [{ id: 'treatment', title: 'Validate the customizations experiment', workspace: 'vscode', minutesAgo: 5 }],
		header: { navigationShortcuts: true, customizationsCount: 8 },
		settings: { [AUTOMATIONS_NEW_BADGE_STYLE_SETTING]: 'outline' },
	}, {
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['Automations and Customizations appear as two full-width navigation rows at the start of the scrollable Sessions tree. The Sessions header follows them and becomes sticky as they scroll away. Automations has a compact right-aligned NEW capsule, Customizations shows its count of 8, and the outlined New button remains in the Sessions header rather than becoming a list entry.'],
	}),
	SessionsList_CustomizationsMigrationsAvailable: defineSessionsListFixture({
		sessions: [{ id: 'migrations', title: 'Move instructions into the new format', workspace: 'vscode', minutesAgo: 5 }],
		header: { navigationShortcuts: true, customizationsCount: 8, customizationMigrationsAvailable: true },
	}, {
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Customizations navigation row shows a small warning dot right after its label, before the right-aligned count of 8.'],
	}),
	SessionsList_LightweightNewButton: defineSessionsListFixture({
		sessions: [],
		header: { newSessionButtonStyle: 'lightweight' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button whose keyboard shortcut is plain inline text without a nested keycap or chip background. The shortcut uses a quieter type role than New and compact platform-native chord notation.'],
	}),
	SessionsList_LightweightNewButtonWithKeybindingBackground: defineSessionsListFixture({
		sessions: [],
		header: { newSessionButtonTreatment: 'lightweightWithKeybindingBackground' },
	}, {
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button whose keyboard shortcut uses a quieter type role than New and sits on a subtle grouped keybinding background.'],
	}),

	//#endregion
});
