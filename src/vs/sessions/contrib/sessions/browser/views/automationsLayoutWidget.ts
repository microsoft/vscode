/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/automationsLayout.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { LayoutPriority, Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { getAutomationAfterDate } from '../../../../../platform/agentHost/common/automationDisableConditions.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SpotlightOverlay } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightOverlay.js';
import { IChatExecuteActionContext } from '../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import type { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_SAMPLE_DATA_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { automationTriggerSummary, hasAutomationEventTrigger } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { isAgentHostProviderId, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService, trackNewSessionRequestEnd, WorkspaceNotTrustedError } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { AbstractChatView } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ComposerInputSnapshot } from '../../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { isActiveSessionStatus, ISession, SessionArtifactKind, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AutomationsCustomViewFocusContext } from '../../../../common/agentsWindowContextKeys.js';
import { AutomationCardCanDeleteContext, AutomationCardCanUpdateContext, AutomationCardEnabledContext, AutomationCardHasEventTriggerContext, AutomationCardHasExternalResourceContext, AutomationCardHasLimitsContext, AutomationCardIsCloudContext } from './automationCardContextKeys.js';
import { getUnavailableAutomationsReasons, getVisibleAutomations } from './automationCataloguePresentation.js';
import { AutomationsLayoutActions } from './automationsLayoutActions.js';
import { AUTOMATIONS_NAV_IDS, AutomationRunState, AutomationsNavId, AutomationsSectionId, IAutomationLayoutSection, AutomationStatusFilter, classifyAutomation, CLOUD_AUTOMATION_HOST, EMPTY_AUTOMATIONS_LAYOUT_FILTERS, filterAutomationExamples, filterAutomationRows, filterAutomationRuns, getAutomationLayoutDetails, getAutomationLayoutSections, getAutomationNavCounts, getAutomationNavWarnings, getAutomationRunArtifacts, getAutomationRunDestination, getAutomationRunState, getSharedRepositoryLabel, getThisMachineLabel, groupAutomationRunsByDay, IAutomationLayoutDetails, IAutomationLayoutExample, IAutomationLayoutRow, IAutomationLayoutRun, IAutomationLayoutRunResult, IAutomationLayoutWarning, IAutomationsLayoutFilters, isAutomationsFilterActive, LOCAL_AUTOMATION_HOST } from './automationsLayoutModel.js';
import { getAutomationsSampleData, IAutomationsSampleData, sampleAutomationRunsRead } from './automationsLayoutSampleData.js';
import { describeAutomationSchedule } from './automationsLayoutSchedule.js';
import { readAutomationTemplates } from './automationTemplates.js';
import { automationRunWithLocalProgress } from './automationRunProgress.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';

const $ = DOM.$;

const SELECTED_NAV_STORAGE_KEY = 'sessions.automations.layout.selectedNav';
const CREATE_SPOTLIGHT_SHOWN_STORAGE_KEY = 'sessions.automations.layout.createSpotlightShown';
const FILTERS_STORAGE_KEY = 'sessions.automations.layout.filters';
const OPEN_SECTIONS_STORAGE_KEY = 'sessions.automations.layout.openSections';
const SIDEBAR_WIDTH_STORAGE_KEY = 'sessions.automations.layout.sidebarWidth';
const SIDEBAR_DEFAULT_WIDTH = 200;
const SIDEBAR_MIN_WIDTH = 150;
const SIDEBAR_MAX_WIDTH = 350;
const CONTENT_MIN_WIDTH = 400;
const DETAILS_DEFAULT_WIDTH = 440;
const DETAILS_MIN_WIDTH = 320;
const NARROW_WIDTH = 640;
const REPOSITORY_DESCRIPTION = localize('automationsLayout.repositoryDescription', "These automations are visible to anyone with repository access, and can be edited by anyone with write access.");
const DEFAULT_OPEN_SECTIONS: Readonly<Record<AutomationsSectionId, boolean>> = { personal: true, cloud: true, repository: false, disabled: false };
const STATUS_FILTER_LABELS: Record<AutomationStatusFilter, string> = {
	on: localize('automationsLayout.filter.on', "On"),
	off: localize('automationsLayout.filter.off', "Off"),
	failed: localize('automationsLayout.filter.failed', "Last run failed"),
};
const FILTER_LABELS: Record<keyof IAutomationsLayoutFilters, string> = {
	workspaces: localize('automationsLayout.filter.allWorkspaces', "All workspaces"),
	hosts: localize('automationsLayout.filter.allLocations', "All locations"),
	statuses: localize('automationsLayout.filter.anyStatus', "Any status"),
};

/** Set on the new-session composer at the top of the `chatInput` layout. */
const AutomationsLayoutComposerContext = new RawContextKey<boolean>('automationsLayoutComposer', false);

registerAction2(class CreateAutomationManuallyFromComposerAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.automations.layout.createManuallyFromComposer',
			title: localize2('automationsLayout.createManually', "Create manually"),
			tooltip: localize2('automationsLayout.createManuallyFromComposerTitle', "Create an automation with a form, starting from this description"),
			f1: false,
			// Next to Send (order 4), in the composer's own row.
			menu: { id: MenuId.ChatExecute, group: 'navigation', order: 3, when: AutomationsLayoutComposerContext },
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const actions = accessor.get(IInstantiationService).createInstance(AutomationsLayoutActions);
		await actions.createManually(context?.widget?.getInput().trim() ?? '');
	}
});

/** The buttons and switch inside a row, reached with Left and Right. */
const controlElements = new WeakMap<HTMLElement, readonly HTMLElement[]>();

const AutomationsLayoutSearchHasTextContext = new RawContextKey<boolean>('automationsLayoutSearchHasText', false);

registerAction2(class ClearAutomationsLayoutSearchAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.automations.layout.clearSearch',
			title: localize2('automationsLayout.clearSearch', "Clear Search"),
			f1: false,
			// Above the modal editor's Escape (WorkbenchContrib + 10), which would otherwise close it first.
			keybinding: {
				when: AutomationsLayoutSearchHasTextContext,
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib + 20,
			},
		});
	}

	override run(): void {
		getFocusedAutomationsLayoutWidget()?.clearSearch();
	}
});

/** Set while the details of an automation are open, for focus anywhere in the layout. */
const AutomationsLayoutDetailsOpenContext = new RawContextKey<boolean>('automationsLayoutDetailsOpen', false);

registerAction2(class CloseAutomationsLayoutDetailsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.automations.layout.closeDetails',
			title: localize2('automationsLayout.closeDetails', "Close Details"),
			f1: false,
			// Above the modal editor's Escape (WorkbenchContrib + 10), below Clear Search, so a non-empty search clears first.
			keybinding: {
				when: AutomationsLayoutDetailsOpenContext,
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib + 15,
			},
		});
	}

	override run(): void {
		getFocusedAutomationsLayoutWidget()?.closeDetails();
	}
});

let focusedLayoutWidget: AutomationsLayoutWidget | undefined;

/** The layout widget that last had focus, for the accessibility help and the Accessible View. */
export function getFocusedAutomationsLayoutWidget(): AutomationsLayoutWidget | undefined {
	return focusedLayoutWidget;
}

export type AutomationsLayoutVariant = 'modal' | 'chatInput';

export interface IAutomationsLayoutWidgetOptions {
	readonly variant: AutomationsLayoutVariant;
	/** Closes the modal before New opens a session. */
	readonly close?: () => Promise<void>;
}

interface INavItem {
	readonly id: AutomationsNavId;
	readonly element: HTMLElement;
	readonly label: HTMLElement;
	readonly warning: HTMLElement;
	readonly count: HTMLElement;
}

interface IFocusedContent {
	readonly key: string;
	/** The `data-control` name of the focused control in the item (`run`, `more`, `enabled` or `use`), if any. */
	readonly control: string | undefined;
}

/** The open details panel of one automation. */
interface IDetailsView {
	readonly rowId: string;
	readonly panel: HTMLElement;
	readonly title: HTMLElement;
	readonly source: HTMLElement;
	readonly sampleLabel: HTMLElement;
	readonly body: HTMLElement;
	/** The disposables of the rendered content, cleared on every render. */
	readonly content: DisposableStore;
	/** The rendered elements that can have focus, by their `data-details-key`, to keep focus across renders. */
	readonly keyed: Map<string, HTMLElement>;
	/** The `data-details-key` of the run that Tab reaches in the runs list. */
	activeRun: string | undefined;
}

/** Where an automation runs: the host and folder of a personal one, or the repository of a cloud one. */
function getAutomationRowPlace(row: IAutomationLayoutRow, separator = ' \u00B7 '): string {
	return row.group === 'personal' && row.workspace ? `${row.hostLabel}${separator}${row.workspace}` : row.group === 'personal' ? row.hostLabel : row.workspace ?? row.hostLabel;
}

/** The facts at the top of an automation's details: its schedule and whether it's on, where it runs, and its next run. */
function getAutomationDetailsFacts(row: IAutomationLayoutRow, now: number, separator = ' \u00B7 '): { readonly term: string; readonly description: string }[] {
	const schedule = row.schedule.cronExpression ? `${row.schedule.label} (${row.schedule.cronExpression})` : row.schedule.label;
	// On and Off are about the schedule; a manual automation has none, and Run now works either way.
	const onOff = row.enabled ? localize('automationsLayout.details.on', "On") : localize('automationsLayout.details.off', "Off");
	const facts = [
		{ term: localize('automationsLayout.details.schedule', "Schedule"), description: row.automation?.schedule.interval === 'manual' ? schedule : `${schedule}${separator}${onOff}` },
		{ term: localize('automationsLayout.details.runsOn', "Runs on"), description: getAutomationRowPlace(row, separator) },
	];
	const next = row.enabled && row.automation?.nextRunAt ? Date.parse(row.automation.nextRunAt) : Number.NaN;
	if (next > now) {
		facts.push({ term: localize('automationsLayout.details.nextRun', "Next run"), description: fromNow(next, true) });
	}
	return facts;
}

/** What opening a run does, read after the run. */
function getRunDestinationText(run: IAutomationLayoutRun): string | undefined {
	if (run.isSample) {
		return localize('automationsLayout.details.sampleRun', "Sample run");
	}
	const destination = getAutomationRunDestination(run);
	switch (destination.kind) {
		case 'session': return localize('automationsLayout.details.opensSession', "Opens its session");
		case 'external': return localize('automationsLayout.details.opensGitHub', "Opens on GitHub");
		case 'none': return getRunNotOpenableReason(run);
	}
}

/** One run of the details as text, for its row's label and the Accessible View. */
function getDetailsRunText(run: IAutomationLayoutRun): string {
	const preview = getResultPreview(run.result);
	return joinSentences([
		`${getRunStateTitle(run.state)}, ${getDetailsRunTime(run)}`,
		getRunTriggerLabel(run.trigger),
		getDetailsRunDescription(run),
		preview && formatResultPreview(preview),
		getRunDestinationText(run),
	]);
}

/** Joins text into sentences, without doubling the stop of text that already ends one. */
function joinSentences(parts: readonly (string | undefined)[]): string {
	return parts.filter((part): part is string => !!part).map(part => /[.!?]$/.test(part) ? part : `${part}.`).join(' ');
}

function getNavLabel(id: AutomationsNavId): string {
	switch (id) {
		case 'all': return localize('automationsLayout.nav.all', "All automations");
		case 'personal': return localize('automationsLayout.nav.personal', "Personal");
		case 'cloud': return localize('automationsLayout.nav.cloud', "Cloud");
		case 'repository': return localize('automationsLayout.nav.repository', "Repository");
		case 'runs': return localize('automationsLayout.nav.runs', "Runs");
		case 'examples': return localize('automationsLayout.nav.examples', "Examples");
	}
}

function getNavDescription(id: AutomationsNavId): string {
	switch (id) {
		case 'all': return localize('automationsLayout.description.all', "Agent sessions that run on a schedule or when something happens.");
		case 'personal': return localize('automationsLayout.description.personal', "Automations that run on this machine or on your remote hosts.");
		case 'cloud': return localize('automationsLayout.description.cloud', "Your automations that run on GitHub, even when VS Code is closed.");
		case 'repository': return localize('automationsLayout.description.repository', "Automations shared with everyone who can see the repository.");
		case 'runs': return localize('automationsLayout.description.runs', "Recent runs of all your automations.");
		case 'examples': return localize('automationsLayout.description.examples', "Starting points to review and customize before you create them.");
	}
}

function getNavAriaLabel(id: AutomationsNavId, count: number, warnings: number): string {
	const label = getNavLabel(id);
	let text: string;
	if (id === 'runs') {
		text = count === 1 ? localize('automationsLayout.navAria.unreadOne', "{0}, 1 unread run", label) : localize('automationsLayout.navAria.unreadMany', "{0}, {1} unread runs", label, count);
	} else if (id === 'examples') {
		text = count === 1 ? localize('automationsLayout.navAria.exampleOne', "{0}, 1 example", label) : localize('automationsLayout.navAria.exampleMany', "{0}, {1} examples", label, count);
	} else {
		text = count === 1 ? localize('automationsLayout.navAria.automationOne', "{0}, 1 automation", label) : localize('automationsLayout.navAria.automationMany', "{0}, {1} automations", label, count);
	}
	if (warnings === 1) {
		return localize('automationsLayout.navAria.warningOne', "{0}, 1 warning", text);
	}
	return warnings > 1 ? localize('automationsLayout.navAria.warningMany', "{0}, {1} warnings", text, warnings) : text;
}

function getSectionLabel(id: AutomationsSectionId, repository: string | undefined): string {
	switch (id) {
		case 'personal': return localize('automationsLayout.section.personal', "Personal");
		case 'cloud': return localize('automationsLayout.section.cloud', "Cloud");
		case 'repository': return repository
			? localize('automationsLayout.section.repositoryNamed', "Shared in {0}", repository)
			: localize('automationsLayout.section.repository', "Repository");
		case 'disabled': return localize('automationsLayout.section.disabled', "Disabled");
	}
}

function getRunStateLabel(state: AutomationRunState | undefined, time: number): string {
	switch (state) {
		case 'running': return localize('automationsLayout.lastRun.running', "Running");
		case 'needsInput': return localize('automationsLayout.lastRun.needsInput', "Needs input");
		default: return fromNow(time, true);
	}
}

function getRunStateIcon(state: AutomationRunState | undefined): ThemeIcon | undefined {
	switch (state) {
		case 'completed': return Codicon.pass;
		case 'failed': return Codicon.error;
		case 'running': return ThemeIcon.modify(Codicon.loading, 'spin');
		case 'needsInput': return Codicon.report;
		default: return undefined;
	}
}

function getRunStateDescription(state: AutomationRunState | undefined): string | undefined {
	switch (state) {
		case 'completed': return localize('automationsLayout.runState.completed', "succeeded");
		case 'failed': return localize('automationsLayout.runState.failed', "failed");
		case 'running': return localize('automationsLayout.runState.running', "running");
		case 'needsInput': return localize('automationsLayout.runState.needsInput', "needs input");
		default: return undefined;
	}
}

function getRunStateTitle(state: AutomationRunState): string {
	switch (state) {
		case 'completed': return localize('automationsLayout.runTitle.completed', "Succeeded");
		case 'failed': return localize('automationsLayout.runTitle.failed', "Failed");
		case 'running': return localize('automationsLayout.runTitle.running', "Running");
		case 'needsInput': return localize('automationsLayout.runTitle.needsInput', "Needs input");
	}
}

/** When a run finished, or when it started while it's still going. */
function getDetailsRunTime(run: IAutomationLayoutRun): string {
	return run.state === 'running' || run.state === 'needsInput'
		? localize('automationsLayout.details.started', "started {0}", fromNow(run.startTime, true))
		: fromNow(run.time, true);
}

/** The state of an automation's latest run, in a sentence. */
function getLatestRunText(run: IAutomationLayoutRun): string {
	switch (run.state) {
		case 'completed': return localize('automationsLayout.details.latestSucceeded', "Succeeded {0}", fromNow(run.time, true));
		case 'failed': return localize('automationsLayout.details.latestFailed', "Failed {0}", fromNow(run.time, true));
		case 'running': return localize('automationsLayout.details.latestRunning', "Running, started {0}", fromNow(run.startTime, true));
		case 'needsInput': return localize('automationsLayout.details.latestNeedsInput', "Needs input, started {0}", fromNow(run.startTime, true));
	}
}

/** Runs that didn't start on their own schedule say so. */
function getRunTriggerLabel(trigger: AutomationRunTrigger | undefined): string | undefined {
	switch (trigger) {
		case 'manual': return localize('automationsLayout.trigger.manual', "Manual run");
		case 'catch_up': return localize('automationsLayout.trigger.catchUp', "Ran late");
		default: return undefined;
	}
}

/** What a successful run did: its summary, or its session's title when that says more than the automation's name and the run's first artifact. */
function getRunSummary(run: IAutomationLayoutRun): string | undefined {
	if (run.result?.summary) {
		return run.result.summary;
	}
	if (run.title === run.automationName) {
		return undefined;
	}
	const first = run.result?.artifacts[0];
	return first?.label.toLocaleLowerCase().includes(run.title.toLocaleLowerCase()) ? undefined : run.title;
}

/** A run's line of text: what it did, why it failed, or what it's doing now. */
function getDetailsRunDescription(run: IAutomationLayoutRun): string | undefined {
	return run.state === 'completed' ? getRunSummary(run) ?? run.outcome : run.outcome;
}

/** Why a run can't be opened, when that isn't obvious. Sample runs say so when clicked, like on Runs. */
function getRunNotOpenableReason(run: IAutomationLayoutRun): string | undefined {
	const destination = getAutomationRunDestination(run);
	if (destination.kind !== 'none') {
		return undefined;
	}
	switch (destination.reason) {
		case 'notLinked': return localize('automationsLayout.details.notLinked', "Its session isn't available yet.");
		case 'noSession': return localize('automationsLayout.details.noSession', "No session was recorded for this run.");
		case 'sample': return undefined;
	}
}

/** Where the latest result came from, so a result never reads as the output of a newer run that failed or is still going. */
function getResultSourceText(details: IAutomationLayoutDetails): string | undefined {
	const result = details.latestResult;
	const latest = details.latestRun;
	if (!result || !latest) {
		return undefined;
	}
	const when = fromNow(result.run.time, true);
	if (result.fromLatestRun) {
		return localize('automationsLayout.details.fromLatest', "From the latest run, {0}", when);
	}
	switch (latest.state) {
		case 'failed': return localize('automationsLayout.details.fromEarlierFailed', "From an earlier run, {0}. The latest run failed.", when);
		case 'running': return localize('automationsLayout.details.fromEarlierRunning', "From an earlier run, {0}. The latest run is still going.", when);
		case 'needsInput': return localize('automationsLayout.details.fromEarlierNeedsInput', "From an earlier run, {0}. The latest run needs input.", when);
		case 'completed': return localize('automationsLayout.details.fromEarlierNoResult', "From an earlier run, {0}. The latest run has no result to show.", when);
	}
}

const ARTIFACT_ICONS: ReadonlyMap<SessionArtifactKind, ThemeIcon> = new Map([
	[SessionArtifactKind.PullRequest, Codicon.gitPullRequest],
	[SessionArtifactKind.Issue, Codicon.issues],
	[SessionArtifactKind.Commit, Codicon.gitCommit],
	[SessionArtifactKind.Website, Codicon.globe],
	[SessionArtifactKind.File, Codicon.file],
	[SessionArtifactKind.Resource, Codicon.link],
]);

function getArtifactKindLabel(kind: SessionArtifactKind): string {
	switch (kind) {
		case SessionArtifactKind.PullRequest: return localize('automationsLayout.artifact.pullRequest', "Pull request");
		case SessionArtifactKind.Issue: return localize('automationsLayout.artifact.issue', "Issue");
		case SessionArtifactKind.Commit: return localize('automationsLayout.artifact.commit', "Commit");
		case SessionArtifactKind.Website: return localize('automationsLayout.artifact.website', "Website");
		case SessionArtifactKind.File: return localize('automationsLayout.artifact.file', "File");
		case SessionArtifactKind.Resource: return localize('automationsLayout.artifact.resource', "Resource");
	}
}

function formatChanges(files: number, additions: number, deletions: number): string {
	return files === 1
		? localize('automationsLayout.details.changesOne', "1 file changed, +{0} -{1}", additions, deletions)
		: localize('automationsLayout.details.changesMany', "{0} files changed, +{1} -{2}", files, additions, deletions);
}

/** A result's preview line: its first artifact, or the files it changed. */
interface IResultPreview {
	readonly icon: ThemeIcon;
	readonly label: string;
	/** Read with the label, such as "Pull request". */
	readonly kind: string;
	readonly more: number;
}

function getResultPreview(result: IAutomationLayoutRunResult | undefined): IResultPreview | undefined {
	const [first, ...rest] = result?.artifacts ?? [];
	if (first) {
		return { icon: ARTIFACT_ICONS.get(first.kind) ?? Codicon.archive, label: first.label, kind: getArtifactKindLabel(first.kind), more: rest.length };
	}
	const changes = result?.changes;
	if (changes && changes.files > 0) {
		return { icon: Codicon.diffMultiple, label: formatChanges(changes.files, changes.additions, changes.deletions), kind: localize('automationsLayout.artifact.changes', "Changes"), more: 0 };
	}
	return undefined;
}

function formatResultPreview(preview: IResultPreview): string {
	const text = `${preview.kind}: ${preview.label}`;
	return preview.more > 0 ? localize('automationsLayout.details.previewMore', "{0}, and {1} more", text, preview.more) : text;
}

/** Reads the automations, runs and examples the layouts show, merging sample data when it is on. */
class AutomationsLayoutModel extends Disposable {

	readonly sampleDataEnabled: IObservable<boolean>;
	readonly catalogueState: IObservable<AutomationCatalogueState>;
	readonly rows: IObservable<readonly IAutomationLayoutRow[]>;
	readonly runs: IObservable<readonly IAutomationLayoutRun[]>;
	readonly examples: IObservable<readonly IAutomationLayoutExample[]>;
	readonly warnings: IObservable<readonly IAutomationLayoutWarning[]>;
	readonly now = observableValue<number>(this, Date.now());
	private readonly sample: IObservable<IAutomationsSampleData | undefined>;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAgentPluginService agentPluginService: IAgentPluginService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatService chatService: IChatService,
	) {
		super();
		const sampleSetting = observableConfigValue<boolean>(CHAT_AUTOMATIONS_SAMPLE_DATA_SETTING, false, configurationService);
		const sendLaterSetting = observableConfigValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING, false, configurationService);
		this.sampleDataEnabled = sampleSetting.map(value => value === true);
		this.catalogueState = automationService.catalogueState;
		this.sample = derived(this, reader => this.sampleDataEnabled.read(reader)
			? getAutomationsSampleData(this.now.read(reader), sampleAutomationRunsRead.read(reader))
			: undefined);
		const providersChanged = observableSignalFromEvent(this, sessionsProvidersService.onDidChangeProviders);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		// Like today's page, newer progress in a run's conversation (a follow-up that is running or needs input)
		// overrides the run's history until the history catches up.
		const withLocalProgress = (run: IAutomationRun, reader: IReader) => automationRunWithLocalProgress(run, chatService.chatModels.read(reader), reader);

		this.rows = derived(this, reader => {
			providersChanged.read(reader);
			automationService.availableProviders.read(reader);
			const runs = automationService.runs.read(reader);
			const sendLaterEnabled = sendLaterSetting.read(reader) === true;
			const real = getVisibleAutomations(automationService.automations.read(reader), sendLaterEnabled).map(automation => {
				const latestRun = runs.find(run => run.automationId === automation.id);
				return this.toRow(automation, latestRun && withLocalProgress(latestRun, reader));
			});
			return [...real, ...this.sample.read(reader)?.rows ?? []];
		});

		this.runs = derived(this, reader => {
			sessionsChanged.read(reader);
			const real = automationService.runs.read(reader).map((historyRun): IAutomationLayoutRun => {
				const run = withLocalProgress(historyRun, reader);
				const session = run.sessionResource ? sessionsManagementService.getSession(run.sessionResource) : undefined;
				const automationName = automationService.getAutomation(run.automationId)?.name
					?? automationService.getAutomationHistoryName?.(run.automationId)
					?? localize('automationsLayout.removedAutomation', "Removed automation");
				let state = getAutomationRunState(run);
				if (state === 'running' && session?.status.read(reader) === SessionStatus.NeedsInput) {
					state = 'needsInput';
				}
				const time = getRunTime(run, state);
				const startTime = Date.parse(run.startedAt);
				return {
					id: run.id,
					automationId: run.automationId,
					automationName,
					title: session?.title.read(reader) || automationName,
					state,
					time: Number.isNaN(time) ? 0 : time,
					startTime: Number.isNaN(startTime) ? 0 : startTime,
					trigger: run.trigger,
					outcome: getRunOutcome(run, state, session, reader),
					// Only what the run's session recorded; without the session nothing is known about its result.
					result: session ? {
						artifacts: getAutomationRunArtifacts(session.artifacts?.read(reader) ?? []),
						changes: session.changesSummary?.read(reader),
					} : undefined,
					unread: (state === 'completed' || state === 'failed') && !!session && !session.isRead.read(reader),
					isSample: false,
					sessionResource: run.sessionResource,
					externalResource: run.externalResource,
				};
			});
			return [...real, ...this.sample.read(reader)?.runs ?? []];
		});

		this.examples = derived(this, reader => readAutomationTemplates(agentPluginService.plugins.read(reader), reader).map((template): IAutomationLayoutExample => ({
			template,
			schedule: describeAutomationSchedule(template.schedule),
			source: template.source?.label ?? '',
		})));

		this.warnings = derived(this, reader => {
			const real = automationService.unavailableProviders.read(reader).map((provider): IAutomationLayoutWarning => ({
				group: isAgentHostProviderId(provider.id) ? 'personal' : 'cloud',
				reason: getUnavailableAutomationsReasons([provider])[0] ?? '',
				disconnected: provider.unavailableReasonCode === 'disconnected',
			}));
			return [...real, ...this.sample.read(reader)?.warnings ?? []];
		});

		const ticker = DOM.disposableWindowInterval(DOM.getActiveWindow(), () => this.now.set(Date.now(), undefined), 60_000);
		this._register(ticker);
	}

	private toRow(automation: IAutomationDescriptor, latestRun: IAutomationRun | undefined): IAutomationLayoutRow {
		const providerId = automation.target.providerId;
		const group = classifyAutomation(automation, id => !!id && !isAgentHostProviderId(id));
		const local = !providerId || providerId === LOCAL_AGENT_HOST_PROVIDER_ID;
		const hostKey = group === 'personal' ? (local ? LOCAL_AUTOMATION_HOST : providerId) : CLOUD_AUTOMATION_HOST;
		const hostLabel = group === 'personal'
			? (local ? getThisMachineLabel() : this.sessionsProvidersService.getProvider(providerId)?.label ?? providerId)
			: localize('automationsLayout.cloudHost', "Cloud");
		const triggers = automation.cloudTrigger?.triggers ?? {};
		const triggerSummary = automationTriggerSummary(triggers);
		const latestRunState = latestRun && getAutomationRunState(latestRun);
		const runTime = latestRun && latestRunState ? getRunTime(latestRun, latestRunState) : Number.NaN;
		const lastRunAt = automation.lastRunAt ? Date.parse(automation.lastRunAt) : Number.NaN;
		return {
			id: automation.id,
			automation,
			isSample: false,
			group,
			name: automation.name,
			prompt: automation.prompt,
			enabled: automation.enabled,
			schedule: triggerSummary ? { label: triggerSummary } : describeAutomationSchedule(automation.schedule),
			eventTriggered: hasAutomationEventTrigger(triggers),
			hostKey,
			hostLabel,
			workspace: automation.targetDisplay?.label ?? (automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : undefined),
			lastRun: latestRun && latestRunState && !Number.isNaN(runTime)
				? { time: runTime, state: latestRunState }
				: !Number.isNaN(lastRunAt) ? { time: lastRunAt, state: undefined } : undefined,
			canRun: this.automationService.canRunAutomation(automation.id),
			canUpdate: this.automationService.canUpdateAutomation(automation.id),
		};
	}
}

/**
 * The experimental Automations layouts: `modal` shows a navigation sidebar next to the selected pane, and
 * `chatInput` shows a chat input on top with the navigation as tabs under it.
 */
export class AutomationsLayoutWidget extends Disposable {

	readonly element: HTMLElement;
	/** Shown after the host's title: the `chatInput` layout's Sample data label, while sample data is on. */
	readonly titleAccessory: IObservable<HTMLElement | undefined>;

	private readonly model: AutomationsLayoutModel;
	private readonly actions: AutomationsLayoutActions;
	private readonly selectedNav: ISettableObservable<AutomationsNavId>;
	private readonly query = observableValue<string>(this, '');
	private readonly filters: ISettableObservable<IAutomationsLayoutFilters>;
	private readonly openSections: ISettableObservable<Readonly<Record<string, boolean>>>;

	private readonly navContainer: HTMLElement;
	private readonly navItems: INavItem[] = [];
	private readonly tabsRow: HTMLElement | undefined;
	private readonly paneContainer: HTMLElement;
	private readonly paneSplitContainer: HTMLElement;
	private readonly paneSplitView: SplitView<number>;
	private readonly detailsContainer: HTMLElement;
	private readonly paneDimension = { width: 0, height: 0 };
	private detailsWidth = DETAILS_DEFAULT_WIDTH;
	private detailsOnly = false;
	private readonly detailsTransition = this._register(new RunOnceScheduler(() => this.paneSplitContainer.classList.remove('details-transition'), 150));
	private readonly paneHeader: HTMLElement | undefined;
	private readonly paneTitle: HTMLElement | undefined;
	private readonly paneDescription: HTMLElement | undefined;
	private readonly filterBar: HTMLElement | undefined;
	private readonly filterPickers = new Map<keyof IAutomationsLayoutFilters, { readonly button: Button; readonly label: HTMLElement }>();
	private readonly toolbar: HTMLElement;
	private readonly sampleLabel: HTMLElement;
	private readonly searchBox: InputBox;
	private readonly filterButton: Button;
	private filterTitle = localize('automationsLayout.filterTitle', "Filter");
	private readonly markAllButton: Button;
	private readonly createButtons: HTMLElement | undefined;
	private readonly resultCount: HTMLElement;
	private readonly scrollContainer: HTMLElement;
	private readonly content: HTMLElement;
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly splitView: SplitView<number> | undefined;
	private readonly sidebar: HTMLElement | undefined;
	private composerView: AbstractChatView | undefined;
	private rovingItems: HTMLElement[] = [];
	/** The state each automation is being saved to, while its On or Off change is in flight. */
	private readonly pendingToggles = new Map<string, boolean>();
	/** The rendered switch of each automation row, so a finished save can update it after a re-render. */
	private readonly rowSwitches = new Map<string, Switch>();
	private readonly navHovers = new Map<AutomationsNavId, { readonly key: string; readonly disposable: IDisposable }>();
	/** Set while Create manually shows its form in the pane (the modal layout). */
	private inlineCreation: CancellationTokenSource | undefined;
	private readonly idPrefix = `automations-layout-${generateUuid()}`;
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => void this.refresh(), 60_000));
	private readonly createSpotlight = this._register(new MutableDisposable<DisposableStore>());
	/** The open details panel's disposables. */
	private readonly details = this._register(new MutableDisposable<DisposableStore>());
	private detailsView: IDetailsView | undefined;
	private readonly detailsOpen: IContextKey<boolean>;

	constructor(
		private readonly options: IAutomationsLayoutWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAutomationService private readonly automationService: IAutomationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
		this.model = this._register(instantiationService.createInstance(AutomationsLayoutModel));
		this.actions = instantiationService.createInstance(AutomationsLayoutActions);
		const storedNav = this.storageService.get(SELECTED_NAV_STORAGE_KEY, StorageScope.PROFILE);
		this.selectedNav = observableValue<AutomationsNavId>(this, AUTOMATIONS_NAV_IDS.find(id => id === storedNav) ?? 'all');
		this.filters = observableValue<IAutomationsLayoutFilters>(this, this.readFilters());
		this.openSections = observableValue<Readonly<Record<string, boolean>>>(this, this.readOpenSections());

		const modal = options.variant === 'modal';
		this.titleAccessory = modal ? constObservable(undefined) : this.model.sampleDataEnabled.map(sample => sample ? this.sampleLabel : undefined);
		this.element = $('.automations-layout');
		this.element.classList.add(modal ? 'automations-layout-modal' : 'automations-layout-chat-input');
		// Scoped to the whole layout, so Escape closes the details wherever focus is in it.
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
		this.detailsOpen = AutomationsLayoutDetailsOpenContext.bindTo(scopedContextKeyService);

		if (!modal) {
			this.renderComposer(DOM.append(this.element, $('.automations-layout-composer')));
		}

		this.navContainer = $('.automations-layout-nav');
		this.navContainer.setAttribute('role', 'tablist');
		this.navContainer.setAttribute('aria-label', localize('automationsLayout.navAriaLabel', "Automations"));
		this.navContainer.setAttribute('aria-orientation', modal ? 'vertical' : 'horizontal');
		this.paneContainer = $('.automations-layout-pane');
		this.paneContainer.setAttribute('role', 'tabpanel');
		this.paneContainer.id = `${this.idPrefix}-pane`;
		this.paneSplitContainer = $('.automations-layout-pane-split');
		this.detailsContainer = $('.automations-layout-details-host');
		this.paneSplitView = this._register(new SplitView<number>(this.paneSplitContainer, { orientation: Orientation.HORIZONTAL, proportionalLayout: false }));
		const paneDimension = this.paneDimension;
		this.paneSplitView.addView({
			onDidChange: Event.None,
			element: this.paneContainer,
			get minimumSize() { return Math.min(CONTENT_MIN_WIDTH, paneDimension.width); },
			maximumSize: Number.POSITIVE_INFINITY,
			priority: LayoutPriority.High,
			layout: (width, _offset, height) => {
				this.paneContainer.style.width = `${width}px`;
				if (height !== undefined) {
					this.paneContainer.style.height = `${height}px`;
				}
				if (width > 0) {
					this.updateNarrow(width);
				}
			},
		}, Sizing.Distribute, undefined, true);
		this.paneSplitView.addView({
			onDidChange: Event.None,
			element: this.detailsContainer,
			get minimumSize() { return Math.min(DETAILS_MIN_WIDTH, paneDimension.width); },
			maximumSize: Number.POSITIVE_INFINITY,
			priority: LayoutPriority.Low,
			layout: (width, _offset, height) => {
				this.detailsContainer.style.width = `${width}px`;
				if (height !== undefined) {
					this.detailsContainer.style.height = `${height}px`;
				}
			},
		}, Sizing.Invisible(DETAILS_DEFAULT_WIDTH), undefined, true);
		this._register(this.paneSplitView.onDidSashChange(() => {
			if (this.detailsView && !this.detailsOnly) {
				this.detailsWidth = this.paneSplitView.getViewSize(1);
			}
		}));
		this._register(this.paneSplitView.onDidSashReset(() => {
			if (this.detailsView && !this.detailsOnly) {
				this.detailsWidth = DETAILS_DEFAULT_WIDTH;
				this.paneSplitView.resizeView(1, this.detailsWidth);
			}
		}));

		this.sampleLabel = $('span.automations-layout-sample-label', undefined, localize('automationsLayout.sampleData', "Sample data"));
		this._register(this.hoverService.setupDelayedHover(this.sampleLabel, {
			content: localize('automationsLayout.sampleDataHover', "Prototype only. These automations aren't real."),
			style: HoverStyle.Pointer,
		}, { setupKeyboardEvents: true }));
		this.sampleLabel.tabIndex = 0;

		this.toolbar = $('.automations-layout-toolbar');
		const searchContainer = DOM.append(this.toolbar, $('.automations-layout-search'));
		this.searchBox = this._register(new InputBox(searchContainer, undefined, {
			placeholder: localize('automationsLayout.searchPlaceholder', "Search automations"),
			ariaLabel: localize('automationsLayout.searchAriaLabel', "Search automations"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		// Lets Escape clear a non-empty search before the modal's own Escape closes it.
		const searchHasText = AutomationsLayoutSearchHasTextContext.bindTo(this._register(scopedContextKeyService.createScoped(searchContainer)));
		this._register(this.searchBox.onDidChange(value => {
			searchHasText.set(!!value);
			this.query.set(value, undefined);
		}));
		this._register(DOM.addDisposableListener(this.searchBox.inputElement, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape) && this.clearSearch()) {
				DOM.EventHelper.stop(event, true);
			} else if (keyboardEvent.equals(KeyCode.DownArrow)) {
				DOM.EventHelper.stop(event, true);
				this.focusFirstContentItem();
			}
		}));
		this.filterButton = this._register(new Button(this.toolbar, { supportIcons: true, ariaLabel: localize('automationsLayout.filter', "Filter automations") }));
		// A pointer-only hover: a title would show again each time the filter menu gives focus back to the button.
		this._register(this.hoverService.setupDelayedHover(this.filterButton.element, () => ({ content: this.filterTitle, style: HoverStyle.Pointer })));
		this.filterButton.element.classList.add('automations-layout-icon-button', 'automations-layout-filter-button');
		this.filterButton.element.setAttribute('aria-haspopup', 'menu');
		this._register(this.filterButton.onDidClick(() => this.showFilterMenu()));
		this.markAllButton = this._register(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.markAllRead', "Mark all as read"), title: localize('automationsLayout.markAllReadTitle', "Mark all finished runs as read") }));
		this.markAllButton.label = localize('automationsLayout.markAllRead', "Mark all as read");
		this.markAllButton.element.classList.add('automations-layout-mark-all');
		this._register(this.markAllButton.onDidClick(() => this.markAllRunsRead()));

		if (modal) {
			this.createButtons = DOM.append(this.toolbar, $('.automations-layout-create-buttons'));
			const newButton = this._register(new ButtonWithDropdown(this.createButtons, {
				...defaultButtonStyles,
				title: localize('automationsLayout.createWithAgentTitle', "Close Automations and describe the automation in a new session"),
				contextMenuProvider: this.contextMenuService,
				actions: [toAction({
					id: 'sessions.automations.createManually',
					label: localize('automationsLayout.createManuallyDropdown', "Create Manually"),
					run: () => this.createManuallyInPane(),
				})],
				addPrimaryActionToDropdown: false,
			}));
			newButton.label = localize('automationsLayout.createWithAgent', "Create with Agent");
			newButton.primaryButton.element.classList.add('automations-layout-new-button');
			this._register(newButton.onDidClick(() => this.startNewAutomation()));
			this._register(DOM.addDisposableListener(newButton.primaryButton.element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
				if (new StandardKeyboardEvent(event).equals(KeyCode.RightArrow)) {
					newButton.dropdownButton.focus();
					DOM.EventHelper.stop(event, true);
				}
			}));
			this._register(DOM.addDisposableListener(newButton.dropdownButton.element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
				if (new StandardKeyboardEvent(event).equals(KeyCode.LeftArrow)) {
					newButton.primaryButton.focus();
					DOM.EventHelper.stop(event, true);
				}
			}));
			this._register(markOnboardingTarget(newButton.element, 'sessions.automations.create', {
				onDidActivate: Event.map(Event.any(newButton.onDidClick, newButton.dropdownButton.onDidClick), () => undefined),
			}));
			this.showCreateWithAgentSpotlightOnce(newButton.element);
			this._register(toDisposable(() => this.inlineCreation?.cancel()));

			this.filterBar = DOM.append(this.paneContainer, $('.automations-layout-context-bar', { role: 'group', 'aria-label': localize('automationsLayout.contextFilters', "Automation filters") }));
			for (const [kind, icon] of [['workspaces', Codicon.folder], ['hosts', Codicon.remote], ['statuses', Codicon.filter]] as const) {
				const button = this._register(new Button(this.filterBar, { secondary: true }));
				button.element.classList.add('automations-layout-context-button');
				button.element.setAttribute('aria-haspopup', 'menu');
				button.element.dataset.filter = kind;
				DOM.append(button.element, renderIcon(icon)).setAttribute('aria-hidden', 'true');
				const label = DOM.append(button.element, $('span.automations-layout-context-label'));
				DOM.append(button.element, renderIcon(Codicon.chevronDown)).setAttribute('aria-hidden', 'true');
				this.filterPickers.set(kind, { button, label });
				this._register(button.onDidClick(() => this.showFilterMenu(kind)));
			}
			this.paneHeader = DOM.append(this.paneContainer, $('.automations-layout-pane-header'));
			const titleRow = DOM.append(this.paneHeader, $('.automations-layout-pane-title-row'));
			this.paneTitle = DOM.append(titleRow, $('h2.automations-layout-pane-title'));
			titleRow.appendChild(this.sampleLabel);
			titleRow.appendChild(this.toolbar);
			this.paneDescription = DOM.append(this.paneHeader, $('p.automations-layout-pane-description'));

			this.sidebar = $('.automations-layout-sidebar');
			DOM.append(this.sidebar, this.navContainer);
			const splitContainer = DOM.append(this.element, $('.automations-layout-split'));
			this.splitView = this._register(new SplitView<number>(splitContainer, { orientation: Orientation.HORIZONTAL, proportionalLayout: true }));
			const sidebar = this.sidebar;
			this.splitView.addView({
				onDidChange: Event.None,
				element: sidebar,
				minimumSize: SIDEBAR_MIN_WIDTH,
				maximumSize: SIDEBAR_MAX_WIDTH,
				layout: width => { sidebar.style.width = `${width}px`; },
			}, this.storageService.getNumber(SIDEBAR_WIDTH_STORAGE_KEY, StorageScope.PROFILE, SIDEBAR_DEFAULT_WIDTH), undefined, true);
			const pane = this.paneSplitContainer;
			this.splitView.addView({
				onDidChange: Event.None,
				element: pane,
				minimumSize: CONTENT_MIN_WIDTH,
				maximumSize: Number.POSITIVE_INFINITY,
				layout: (width, _offset, height) => {
					pane.style.width = `${width}px`;
					if (height !== undefined) {
						pane.style.height = `${height}px`;
					}
					this.layoutPane(width, height ?? this.paneDimension.height);
				},
			}, Sizing.Distribute, undefined, true);
			this._register(this.splitView.onDidSashChange(() => {
				if (this.splitView) {
					this.storageService.store(SIDEBAR_WIDTH_STORAGE_KEY, this.splitView.getViewSize(0), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
			this._register(this.splitView.onDidSashReset(() => {
				if (this.splitView) {
					const total = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
					this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
					this.splitView.resizeView(1, total - SIDEBAR_DEFAULT_WIDTH);
				}
			}));
		} else {
			const tabsRow = this.tabsRow = DOM.append(this.element, $('.automations-layout-tabs-row'));
			tabsRow.appendChild(this.navContainer);
			const tools = DOM.append(tabsRow, $('.automations-layout-tabs-tools'));
			tools.appendChild(this.toolbar);
			this.element.appendChild(this.paneSplitContainer);
			const resizeObserver = this._register(new DOM.DisposableResizeObserver('automationsLayout.chatInput', entries => {
				for (const entry of entries) {
					this.layoutPane(entry.contentRect.width, entry.contentRect.height);
				}
			}, DOM.getWindow(this.element)));
			this._register(resizeObserver.observe(this.paneSplitContainer));
		}

		this.resultCount = DOM.append(this.paneContainer, $('.automations-layout-result-count', { role: 'status', 'aria-live': 'polite' }));
		this.scrollContainer = DOM.append(this.paneContainer, $('.automations-layout-scroll'));
		this.content = DOM.append(this.scrollContainer, $('.automations-layout-content'));
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => this.onContentKeyDown(event)));
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.FOCUS_IN, (event: FocusEvent) => this.onContentFocus(event)));

		this.renderNavItems();
		const focusContext = AutomationsCustomViewFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => {
			focusedLayoutWidget = this;
			focusContext.set(true);
		}));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => {
			if (focusedLayoutWidget === this) {
				focusedLayoutWidget = undefined;
				focusContext.reset();
			}
		}));
		this._register(toDisposable(() => {
			for (const hover of this.navHovers.values()) {
				hover.disposable.dispose();
			}
			this.navHovers.clear();
		}));

		this._register(autorun(reader => {
			const nav = this.selectedNav.read(reader);
			const rows = this.model.rows.read(reader);
			const runs = this.model.runs.read(reader);
			const examples = this.model.examples.read(reader);
			const warnings = this.model.warnings.read(reader);
			const sample = this.model.sampleDataEnabled.read(reader);
			const query = this.query.read(reader);
			const filters = this.filters.read(reader);
			const openSections = this.openSections.read(reader);
			const catalogueState = this.model.catalogueState.read(reader);
			this.model.now.read(reader);
			this.updateNav(nav, rows, runs, examples, warnings);
			this.updateChrome(nav, sample, filters);
			this.renderPane(nav, rows, runs, examples, query, filters, openSections, catalogueState);
		}));

		void this.refresh();
	}

	private async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		try {
			await this.automationService.refresh?.({ background: true });
		} catch (error) {
			this.logService.warn('[AutomationsLayout] Failed to refresh automations', error);
		}
		if (!this._store.isDisposed) {
			this.refreshScheduler.schedule();
		}
	}

	layout(width: number, height: number): void {
		this.element.style.height = `${height}px`;
		if (this.splitView) {
			this.splitView.layout(width, height);
		} else {
			this.layoutPane(this.paneSplitContainer.clientWidth, this.paneSplitContainer.clientHeight);
		}
	}

	private layoutPane(width: number, height: number): void {
		this.paneDimension.width = width;
		this.paneDimension.height = height;
		if (width <= 0 || height <= 0) {
			return;
		}
		this.tabsRow?.classList.toggle('narrow', width < NARROW_WIDTH);
		const wasDetailsOnly = this.detailsOnly;
		const wasDetailsVisible = this.paneSplitView.isViewVisible(1);
		this.detailsOnly = !!this.detailsView && width < CONTENT_MIN_WIDTH + DETAILS_MIN_WIDTH;
		const moveFocus = this.detailsOnly && DOM.isAncestorOfActiveElement(this.paneContainer);
		this.paneSplitContainer.classList.toggle('details-only', this.detailsOnly);
		this.paneSplitView.setViewVisible(0, !this.detailsOnly);
		this.paneSplitView.setViewVisible(1, !!this.detailsView);
		this.paneSplitView.layout(width, height);
		if (this.detailsView && !this.detailsOnly && (!wasDetailsVisible || wasDetailsOnly)) {
			this.paneSplitView.resizeView(1, this.detailsWidth);
		}
		if (moveFocus) {
			this.detailsView?.panel.focus({ preventScroll: true });
		}
	}

	private animateDetailsLayout(): void {
		this.paneSplitContainer.classList.add('details-transition');
		this.detailsTransition.schedule();
	}

	focus(): void {
		if (this.detailsView) {
			this.detailsView.panel.focus({ preventScroll: true });
			return;
		}
		if (this.composerView) {
			this.composerView.focus();
			return;
		}
		const selected = this.navItems.find(item => item.id === this.selectedNav.get());
		selected?.element.focus();
	}

	/** Clears a non-empty search. Returns whether there was anything to clear. */
	clearSearch(): boolean {
		if (!this.searchBox.value) {
			return false;
		}
		this.searchBox.value = '';
		return true;
	}

	/** The selected pane as plain text, for the Accessible View, or the open details. */
	getAccessibleContent(): string {
		const nav = this.selectedNav.get();
		const rows = this.model.rows.get();
		const runs = this.model.runs.get();
		const detailsRow = this.detailsView && rows.find(row => row.id === this.detailsView?.rowId);
		if (detailsRow) {
			return this.getDetailsAccessibleContent(detailsRow, getAutomationLayoutDetails(runs, detailsRow.id));
		}
		const examples = this.model.examples.get();
		const warnings = this.model.warnings.get();
		const counts = getAutomationNavCounts(rows, runs, examples);
		const lines: string[] = [localize('automationsLayout.accessible.title', "Automations")];
		if (this.model.sampleDataEnabled.get()) {
			lines.push(localize('automationsLayout.accessible.sample', "Sample data is on. Sample automations are prototype only and aren't real."));
		}
		lines.push('');
		for (const id of AUTOMATIONS_NAV_IDS) {
			const itemWarnings = getAutomationNavWarnings(warnings, id);
			lines.push(getNavAriaLabel(id, counts[id], itemWarnings.length) + (itemWarnings.length ? `. ${itemWarnings.map(warning => warning.reason).join(' ')}` : ''));
		}
		lines.push('', localize('automationsLayout.accessible.selected', "Showing {0}.", getNavLabel(nav)));
		const query = this.query.get();
		if (nav === 'runs') {
			for (const group of groupAutomationRunsByDay(filterAutomationRuns(runs, query), this.model.now.get())) {
				lines.push('', group.label);
				for (const run of group.runs) {
					lines.push([run.title, run.title !== run.automationName ? run.automationName : '', getRunStateDescription(run.state) ?? '', fromNow(run.time, true), run.unread ? localize('automationsLayout.runAria.unread', "unread") : ''].filter(Boolean).join(', '));
				}
			}
		} else if (nav === 'examples') {
			for (const example of filterAutomationExamples(examples, query)) {
				lines.push('', localize('automationsLayout.accessible.example', "{0}, {1}. {2}", example.template.name, example.schedule.label, example.template.description));
			}
		} else {
			const repository = getSharedRepositoryLabel(rows);
			for (const section of getAutomationLayoutSections(filterAutomationRows(rows, query, this.filters.get()), nav)) {
				lines.push('', section.id === 'repository' ? `${getSectionLabel(section.id, repository)}. ${REPOSITORY_DESCRIPTION}` : getSectionLabel(section.id, repository));
				for (const row of section.rows) {
					const place = getAutomationRowPlace(row, ', ');
					const lastRun = row.lastRun ? `${getRunStateLabel(row.lastRun.state, row.lastRun.time)}${row.lastRun.state === 'failed' ? `, ${getRunStateDescription('failed')}` : ''}` : localize('automationsLayout.notRunYet', "Not run yet");
					lines.push(localize('automationsLayout.accessible.row', "{0}: {1}, runs on {2}, last run {3}, {4}. Prompt: {5}", row.name, row.schedule.cronExpression ? `${row.schedule.label} (${row.schedule.cronExpression})` : row.schedule.label, place, lastRun,
						row.enabled ? localize('automationsLayout.rowAria.on', "on") : localize('automationsLayout.rowAria.off', "off"), row.prompt));
				}
			}
		}
		return lines.join('\n');
	}

	/** Selects a navigation item, for example from the empty state's See all examples. */
	select(nav: AutomationsNavId): void {
		this.setSelectedNav(nav);
	}

	private updateNarrow(width: number): void {
		this.element.classList.toggle('narrow', width > 0 && width < NARROW_WIDTH);
		this.paneContainer.classList.toggle('compact-header', width > 0 && width < 760);
	}

	//#region Composer (chatInput)

	/**
	 * The composer of the New Session page, with its pickers and toolbar, in a draft slot of its own so it never takes
	 * or replaces the main composer's draft. Each request goes to the /automate skill, and the started chat opens.
	 */
	private renderComposer(container: HTMLElement): void {
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
		AutomationsLayoutComposerContext.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this._register(markOnboardingTarget(container, 'sessions.automations.create'));
		const slot = this.sessionsManagementService.createNewSessionSlot({ readoptOnFailure: () => !this._store.isDisposed });
		const input = new ComposerInputSnapshot();
		const view = this.composerView = this._register(this.chatViewFactory.createNewChatView(false, {
			newSessionDraft: {
				slot,
				input,
				openStartedSession: session => this.sessionsService.openSession(session.resource),
				// The management service leaves the failures of an independent slot's background sends to its host.
				trackBackgroundSend: send => {
					const sent = input.get().attempt?.input ?? { inputText: send.query, attachments: send.attachedContext ?? [] };
					return trackNewSessionRequestEnd(this.sessionsManagementService, slot, send.session, event => {
						if (event.started || !event.error || isCancellationError(event.error) || event.error instanceof WorkspaceNotTrustedError) {
							return;
						}
						const restored = send.isLatest() && input.restore(sent);
						this.notificationService.notify({
							severity: Severity.Error,
							message: localize('automationsLayout.backgroundSendFailed', "Couldn't start the chat for this automation: {0}", toErrorMessage(event.error)),
							actions: restored ? undefined : { primary: [toAction({ id: 'automationsLayout.copyPrompt', label: localize('automationsLayout.copyPrompt', "Copy Prompt"), run: () => this.clipboardService.writeText(sent.inputText) })] },
						});
					});
				},
			},
			renderChatPet: false,
			renderAquarium: false,
			newSessionCustomization: {
				placeholder: localize('automationsLayout.composerPlaceholder', "Describe an automation, like: Every Friday at 8 AM, summarize new experiment findings"),
				composerOnly: true,
				prepareRequest: request => this.actions.prepareAutomationRequest(request),
			},
		}, scopedInstantiationService));
		// After the view, so the composer is gone before its slot discards the draft.
		this._register(slot);
		container.appendChild(view.element);
		view.setVisible(true);
		// The started chat of a request sent in the foreground opens; Send in Background stays on the page.
		this._register(this.sessionsManagementService.onDidAcceptNewSessionRequest(accepted => {
			if (accepted.owner !== slot || accepted.background) {
				return;
			}
			this._register(trackNewSessionRequestEnd(this.sessionsManagementService, slot, accepted.session, ended => {
				if (ended.started && !this._store.isDisposed) {
					this.sessionsService.openSession(ended.session.resource).catch(onUnexpectedError);
				}
			}));
		}));
		// The composer is as tall as its content: the view is laid out to the height it measures.
		const content = view.inputContentElement;
		let laidOut: { width: number; height: number } | undefined;
		const layoutComposer = () => {
			const width = container.clientWidth;
			const height = Math.ceil(content?.getBoundingClientRect().height ?? 0);
			if (width > 0 && (laidOut?.width !== width || laidOut.height !== height)) {
				laidOut = { width, height };
				container.style.height = `${height}px`;
				view.layout(width, height, 0, 0);
			}
		};
		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AutomationsLayoutComposer', layoutComposer, DOM.getWindow(container)));
		this._register(resizeObserver.observe(container));
		if (content) {
			this._register(resizeObserver.observe(content));
		}
	}
	//#endregion

	//#region Navigation

	private renderNavItems(): void {
		for (const id of AUTOMATIONS_NAV_IDS) {
			const element = DOM.append(this.navContainer, $('.automations-layout-nav-item', { role: 'tab', 'aria-controls': this.paneContainer.id }));
			element.classList.toggle('separator-before', id === 'runs');
			element.dataset.nav = id;
			const label = DOM.append(element, $('span.automations-layout-nav-label', undefined, getNavLabel(id)));
			label.id = `${this.idPrefix}-nav-${id}`;
			const warning = DOM.append(element, renderIcon(Codicon.warning));
			warning.classList.add('automations-layout-nav-warning');
			warning.setAttribute('aria-hidden', 'true');
			const count = DOM.append(element, $('span.automations-layout-nav-count', { 'aria-hidden': 'true' }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => this.setSelectedNav(id)));
			if (id === 'examples') {
				this._register(markOnboardingTarget(element, 'sessions.automations.templates', { open: () => this.setSelectedNav('examples') }));
			}
			this.navItems.push({ id, element, label, warning, count });
		}
		this._register(DOM.addDisposableListener(this.navContainer, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			const vertical = this.options.variant === 'modal';
			const next = vertical ? KeyCode.DownArrow : KeyCode.RightArrow;
			const previous = vertical ? KeyCode.UpArrow : KeyCode.LeftArrow;
			const index = AUTOMATIONS_NAV_IDS.indexOf(this.selectedNav.get());
			let target: number | undefined;
			if (keyboardEvent.equals(next)) {
				target = Math.min(AUTOMATIONS_NAV_IDS.length - 1, index + 1);
			} else if (keyboardEvent.equals(previous)) {
				target = Math.max(0, index - 1);
			} else if (keyboardEvent.equals(KeyCode.Home)) {
				target = 0;
			} else if (keyboardEvent.equals(KeyCode.End)) {
				target = AUTOMATIONS_NAV_IDS.length - 1;
			} else if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				this.focusFirstContentItem();
				return;
			}
			if (target !== undefined) {
				DOM.EventHelper.stop(event, true);
				this.setSelectedNav(AUTOMATIONS_NAV_IDS[target]);
				this.navItems[target].element.focus();
			}
		}));
	}

	/** Create manually in the modal: the form replaces this pane's content instead of opening a second modal on top. */
	private async createManuallyInPane(): Promise<void> {
		if (this.inlineCreation) {
			return;
		}
		this.hideDetails();
		const cancellation = this.inlineCreation = new CancellationTokenSource();
		const host = DOM.append(this.paneContainer, $('.automations-layout-inline-create'));
		this.paneContainer.classList.add('creating');
		try {
			await this.actions.createManually('', { container: host, token: cancellation.token });
		} finally {
			cancellation.dispose();
			this.inlineCreation = undefined;
			host.remove();
			this.paneContainer.classList.remove('creating');
		}
	}

	private setSelectedNav(nav: AutomationsNavId): void {
		this.inlineCreation?.cancel();
		this.hideDetails();
		if (this.selectedNav.get() === nav) {
			return;
		}
		this.selectedNav.set(nav, undefined);
		this.storageService.store(SELECTED_NAV_STORAGE_KEY, nav, StorageScope.PROFILE, StorageTarget.USER);
		this.scrollContainer.scrollTop = 0;
	}

	private updateNav(selected: AutomationsNavId, rows: readonly IAutomationLayoutRow[], runs: readonly IAutomationLayoutRun[], examples: readonly IAutomationLayoutExample[], warnings: readonly IAutomationLayoutWarning[]): void {
		const counts = getAutomationNavCounts(rows, runs, examples);
		for (const item of this.navItems) {
			const isSelected = item.id === selected;
			item.element.classList.toggle('selected', isSelected);
			item.element.setAttribute('aria-selected', String(isSelected));
			item.element.tabIndex = isSelected ? 0 : -1;
			const count = counts[item.id];
			item.count.textContent = count > 0 ? String(count) : '';
			item.count.classList.toggle('unread', item.id === 'runs' && count > 0);
			const itemWarnings = getAutomationNavWarnings(warnings, item.id);
			item.warning.style.display = itemWarnings.length > 0 ? '' : 'none';
			item.element.setAttribute('aria-label', itemWarnings.length > 0
				? `${getNavAriaLabel(item.id, count, itemWarnings.length)}. ${itemWarnings.map(warning => warning.reason).join(' ')}`
				: getNavAriaLabel(item.id, count, 0));
			this.updateNavHover(item, itemWarnings);
		}
	}

	private updateNavHover(item: INavItem, warnings: readonly IAutomationLayoutWarning[]): void {
		const key = warnings.map(warning => warning.reason).join('\n');
		const current = this.navHovers.get(item.id);
		if (current?.key === key) {
			return;
		}
		current?.disposable.dispose();
		this.navHovers.delete(item.id);
		if (!warnings.length) {
			return;
		}
		const content = new MarkdownString(undefined, { isTrusted: { enabledCommands: [OPEN_REMOTES_EDITOR_COMMAND_ID] } });
		content.appendText(warnings.map(warning => warning.reason).join('\n\n'));
		if (warnings.some(warning => warning.disconnected) && this.canManageRemotes()) {
			content.appendMarkdown(`\n\n[${localize('automationsLayout.manageRemotes', "Manage Remotes")}](command:${OPEN_REMOTES_EDITOR_COMMAND_ID})`);
		}
		const disposable = this.hoverService.setupDelayedHover(item.element, { content, style: HoverStyle.Pointer, position: { hoverPosition: this.options.variant === 'modal' ? HoverPosition.RIGHT : HoverPosition.BELOW } }, { groupId: 'automations-layout-nav', setupKeyboardEvents: true });
		this.navHovers.set(item.id, { key, disposable });
	}

	private canManageRemotes(): boolean {
		return !!this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
			&& !!this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)
			&& !!this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
	}

	//#endregion

	//#region Toolbar, search and filters

	private updateChrome(nav: AutomationsNavId, sample: boolean, filters: IAutomationsLayoutFilters): void {
		const listPane = nav === 'all' || nav === 'personal' || nav === 'cloud' || nav === 'repository';
		if (this.paneTitle && this.paneDescription) {
			this.paneTitle.textContent = getNavLabel(nav);
			this.paneDescription.textContent = getNavDescription(nav);
		}
		if (this.filterBar) {
			this.filterBar.style.display = listPane ? '' : 'none';
		}
		for (const [kind, { button, label }] of this.filterPickers) {
			const values = filters[kind];
			const value = values[0];
			label.textContent = values.length === 0 ? FILTER_LABELS[kind]
				: values.length > 1 ? localize('automationsLayout.filter.selected', "{0} selected", values.length)
					: kind === 'hosts' ? this.model.rows.get().find(row => row.hostKey === value)?.hostLabel ?? value
						: kind === 'statuses' ? STATUS_FILTER_LABELS[filters.statuses[0]] : value;
			button.element.classList.toggle('active', values.length > 0);
			button.element.setAttribute('aria-label', `${FILTER_LABELS[kind]}: ${label.textContent}`);
		}
		if (this.createButtons) {
			this.createButtons.style.display = listPane ? '' : 'none';
		}
		this.sampleLabel.style.display = sample ? '' : 'none';
		this.filterButton.element.style.display = listPane && !this.filterBar ? '' : 'none';
		this.markAllButton.element.style.display = nav === 'runs' ? '' : 'none';
		const active = isAutomationsFilterActive(filters);
		this.filterButton.label = `$(${active ? Codicon.filterFilled.id : Codicon.filter.id})`;
		this.filterButton.element.classList.toggle('active', active);
		this.filterTitle = active ? localize('automationsLayout.filterActive', "Filter (filters applied)") : localize('automationsLayout.filterTitle', "Filter");
		const placeholder = nav === 'runs'
			? localize('automationsLayout.searchRuns', "Search runs")
			: nav === 'examples' ? localize('automationsLayout.searchExamples', "Search examples") : localize('automationsLayout.searchPlaceholder', "Search automations");
		this.searchBox.setPlaceHolder(placeholder);
		this.searchBox.setAriaLabel(placeholder);
	}

	private showFilterMenu(kind?: keyof IAutomationsLayoutFilters): void {
		const rows = this.model.rows.get();
		const filters = this.filters.get();
		const hosts = new Map<string, string>();
		for (const row of [...rows].sort((a, b) => hostOrder(a.hostKey) - hostOrder(b.hostKey) || a.hostLabel.localeCompare(b.hostLabel))) {
			hosts.set(row.hostKey, row.hostLabel);
		}
		const workspaces = [...new Set(rows.map(row => row.workspace).filter((workspace): workspace is string => !!workspace))].sort((a, b) => a.localeCompare(b));
		const toggle = <K extends keyof IAutomationsLayoutFilters>(kind: K, value: IAutomationsLayoutFilters[K][number]) => {
			const current = this.filters.get()[kind] as readonly string[];
			const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
			this.setFilters({ ...this.filters.get(), [kind]: next });
		};
		const groups: Record<keyof IAutomationsLayoutFilters, IAction[]> = {
			hosts: [...hosts].map(([key, label]) => toAction({
				id: `automationsLayout.filter.host.${key}`, label, checked: filters.hosts.includes(key), run: () => toggle('hosts', key),
			})),
			statuses: (['on', 'off', 'failed'] as const).map(status => toAction({
				id: `automationsLayout.filter.status.${status}`, label: STATUS_FILTER_LABELS[status], checked: filters.statuses.includes(status), run: () => toggle('statuses', status),
			})),
			workspaces: workspaces.map(workspace => toAction({
				id: `automationsLayout.filter.workspace.${workspace}`, label: workspace, checked: filters.workspaces.includes(workspace), run: () => toggle('workspaces', workspace),
			})),
		};
		const actions: IAction[] = kind ? [
			...groups[kind],
			...(groups[kind].length ? [new Separator()] : []),
			toAction({ id: 'automationsLayout.filter.reset', label: FILTER_LABELS[kind], checked: filters[kind].length === 0, run: () => this.setFilters({ ...this.filters.get(), [kind]: [] }) }),
		] : [
			new SubmenuAction('automationsLayout.filter.hosts', localize('automationsLayout.filter.runsOn', "Runs on"), groups.hosts),
			new SubmenuAction('automationsLayout.filter.statuses', localize('automationsLayout.filter.status', "Status"), groups.statuses),
			new SubmenuAction('automationsLayout.filter.workspaces', localize('automationsLayout.filter.workspace', "Workspace"), groups.workspaces),
			new Separator(),
			toAction({ id: 'automationsLayout.filter.reset', label: localize('automationsLayout.filter.reset', "Reset filters"), enabled: isAutomationsFilterActive(filters), run: () => this.setFilters(EMPTY_AUTOMATIONS_LAYOUT_FILTERS) }),
		];
		const anchor = kind ? this.filterPickers.get(kind)!.button.element : this.filterButton.element;
		anchor.setAttribute('aria-expanded', 'true');
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => anchor.setAttribute('aria-expanded', 'false'),
		});
	}

	private setFilters(filters: IAutomationsLayoutFilters): void {
		this.filters.set(filters, undefined);
		this.storageService.store(FILTERS_STORAGE_KEY, JSON.stringify(filters), StorageScope.PROFILE, StorageTarget.USER);
	}

	private readFilters(): IAutomationsLayoutFilters {
		try {
			const parsed: unknown = JSON.parse(this.storageService.get(FILTERS_STORAGE_KEY, StorageScope.PROFILE) ?? '{}');
			const read = (key: keyof IAutomationsLayoutFilters): string[] => {
				const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[key] : undefined;
				return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
			};
			return {
				hosts: read('hosts'),
				statuses: read('statuses').filter((value): value is AutomationStatusFilter => value === 'on' || value === 'off' || value === 'failed'),
				workspaces: read('workspaces'),
			};
		} catch {
			return EMPTY_AUTOMATIONS_LAYOUT_FILTERS;
		}
	}

	private readOpenSections(): Readonly<Record<string, boolean>> {
		try {
			const parsed: unknown = JSON.parse(this.storageService.get(OPEN_SECTIONS_STORAGE_KEY, StorageScope.PROFILE) ?? '{}');
			const result: Record<string, boolean> = { ...DEFAULT_OPEN_SECTIONS };
			if (parsed && typeof parsed === 'object') {
				for (const [key, value] of Object.entries(parsed)) {
					if (typeof value === 'boolean') {
						result[key] = value;
					}
				}
			}
			return result;
		} catch {
			return DEFAULT_OPEN_SECTIONS;
		}
	}

	private toggleSection(key: string): void {
		const next = { ...this.openSections.get(), [key]: !this.isSectionOpen(key) };
		this.openSections.set(next, undefined);
		this.storageService.store(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(next), StorageScope.PROFILE, StorageTarget.USER);
	}

	private isSectionOpen(key: string, openSections = this.openSections.get()): boolean {
		return openSections[key] ?? DEFAULT_OPEN_SECTIONS[key.split(':').pop() as AutomationsSectionId] ?? true;
	}

	//#endregion

	//#region Panes

	private renderPane(nav: AutomationsNavId, rows: readonly IAutomationLayoutRow[], runs: readonly IAutomationLayoutRun[], examples: readonly IAutomationLayoutExample[], query: string, filters: IAutomationsLayoutFilters, openSections: Readonly<Record<string, boolean>>, catalogueState: AutomationCatalogueState): void {
		const focused = this.getFocusedContent();
		const scrollTop = this.scrollContainer.scrollTop;
		this.contentDisposables.clear();
		this.rovingItems = [];
		this.rowSwitches.clear();
		DOM.clearNode(this.content);
		this.content.dataset.nav = nav;
		this.paneContainer.setAttribute('aria-labelledby', `${this.idPrefix}-nav-${nav}`);

		let resultMessage = '';
		switch (nav) {
			case 'runs': {
				const shown = filterAutomationRuns(runs, query);
				resultMessage = query.trim() ? formatResultCount(shown.length, 'runs') : '';
				this.renderRuns(shown, runs.some(run => run.unread));
				break;
			}
			case 'examples': {
				const shown = filterAutomationExamples(examples, query);
				resultMessage = query.trim() ? formatResultCount(shown.length, 'examples') : '';
				this.renderExampleList(this.content, shown);
				break;
			}
			default: {
				const shown = filterAutomationRows(rows, query, filters);
				const searching = !!query.trim() || isAutomationsFilterActive(filters);
				const sections = getAutomationLayoutSections(shown, nav);
				const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
				resultMessage = searching ? formatResultCount(total, 'automations') : '';
				if (rows.length === 0 && !searching) {
					this.renderEmptyState(nav, catalogueState, examples);
				} else {
					this.renderAutomationSections(nav, sections, getSharedRepositoryLabel(rows), openSections, searching);
				}
			}
		}
		if (this.resultCount.textContent !== resultMessage) {
			this.resultCount.textContent = resultMessage;
		}
		this.resultCount.style.display = resultMessage ? '' : 'none';
		this.scrollContainer.scrollTop = scrollTop;
		this.restoreContentFocus(focused);
	}

	private renderAutomationSections(nav: AutomationsNavId, sections: readonly IAutomationLayoutSection[], repository: string | undefined, openSections: Readonly<Record<string, boolean>>, searching: boolean): void {
		const table = DOM.append(this.content, $('.automations-layout-table'));
		const columns = DOM.append(table, $('.automations-layout-columns', { 'aria-hidden': 'true' }));
		for (const [id, label] of [
			['name', localize('automationsLayout.column.name', "Name")],
			['schedule', localize('automationsLayout.column.schedule', "Schedule")],
			['place', localize('automationsLayout.column.runsOn', "Runs on")],
			['last-run', localize('automationsLayout.column.lastRun', "Last run")],
			['actions', ''],
			['switch', localize('automationsLayout.column.on', "On")],
		]) {
			DOM.append(columns, $(`span.automations-layout-column.automations-layout-column-${id}`, undefined, label));
		}
		if (nav === 'repository') {
			const caption = DOM.append(table, $('.automations-layout-caption'));
			caption.append(repository ? localize('automationsLayout.sharedIn', "Shared in {0}", repository) : localize('automationsLayout.sharedRepositories', "Shared in your repositories"));
			const info = DOM.append(caption, renderIcon(Codicon.info));
			info.setAttribute('aria-hidden', 'true');
			this.contentDisposables.add(this.hoverService.setupDelayedHover(caption, { content: REPOSITORY_DESCRIPTION, style: HoverStyle.Pointer }));
			caption.setAttribute('aria-label', `${caption.textContent ?? ''}. ${REPOSITORY_DESCRIPTION}`);
		}
		if (sections.length === 0) {
			DOM.append(table, $('p.automations-layout-quiet', undefined, searching
				? localize('automationsLayout.noMatches', "No automations match.")
				: getEmptyGroupMessage(nav)));
			return;
		}
		for (const section of sections) {
			// Group panes list their own automations directly; only All automations and Disabled get headers.
			const headed = nav === 'all' || section.id === 'disabled';
			const key = `${nav}:${section.id}`;
			const open = !headed || searching || this.isSectionOpen(key, openSections);
			const sectionElement = DOM.append(table, $('section.automations-layout-section'));
			sectionElement.dataset.section = section.id;
			let labelId: string | undefined;
			if (headed) {
				const header = DOM.append(sectionElement, $<HTMLButtonElement>('button.automations-layout-section-header', { type: 'button', 'aria-expanded': String(open), tabindex: '-1' }));
				this.rovingItems.push(header);
				header.dataset.key = `section:${key}`;
				DOM.append(header, renderIcon(open ? Codicon.chevronDown : Codicon.chevronRight)).setAttribute('aria-hidden', 'true');
				const title = DOM.append(header, $('span.automations-layout-section-title', undefined, getSectionLabel(section.id, repository)));
				labelId = title.id = `${this.idPrefix}-section-${key.replace(':', '-')}`;
				DOM.append(header, $('span.automations-layout-section-count', undefined, String(section.rows.length)));
				if (section.id === 'repository') {
					const info = DOM.append(header, renderIcon(Codicon.info));
					info.classList.add('automations-layout-section-info');
					info.setAttribute('aria-hidden', 'true');
					header.setAttribute('aria-description', REPOSITORY_DESCRIPTION);
					this.contentDisposables.add(this.hoverService.setupDelayedHover(info, { content: REPOSITORY_DESCRIPTION, style: HoverStyle.Pointer }));
				}
				this.contentDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => this.toggleSection(key)));
			}
			if (!open) {
				continue;
			}
			const list = DOM.append(sectionElement, $('.automations-layout-rows', { role: 'list' }));
			if (labelId) {
				list.setAttribute('aria-labelledby', labelId);
			} else {
				list.setAttribute('aria-label', getNavLabel(nav));
			}
			for (const row of section.rows) {
				this.renderAutomationRow(list, row);
			}
		}
	}

	private renderAutomationRow(list: HTMLElement, row: IAutomationLayoutRow): void {
		const element = DOM.append(list, $('.automations-layout-row', { role: 'listitem', tabindex: '-1' }));
		this.rovingItems.push(element);
		element.dataset.key = `row:${row.id}`;
		element.classList.toggle('disabled', !row.enabled);
		this.updateDetailsRowState(element, row.id);
		const store = this.contentDisposables;

		const name = DOM.append(element, $('span.automations-layout-cell.automations-layout-name'));
		DOM.append(name, renderIcon(Codicon.calendar)).setAttribute('aria-hidden', 'true');
		DOM.append(name, $('span.automations-layout-name-label', undefined, row.name));
		const meta = DOM.append(element, $('.automations-layout-meta'));
		DOM.append(meta, $('span.automations-layout-cell.automations-layout-schedule', undefined, row.schedule.label));
		const place = getAutomationRowPlace(row);
		DOM.append(meta, $('span.automations-layout-cell.automations-layout-place', undefined, place));
		const lastRun = DOM.append(meta, $('span.automations-layout-cell.automations-layout-last-run'));
		if (row.lastRun) {
			const icon = getRunStateIcon(row.lastRun.state);
			if (icon) {
				const iconElement = DOM.append(lastRun, renderIcon(icon));
				iconElement.classList.add(`state-${row.lastRun.state}`);
				iconElement.setAttribute('aria-hidden', 'true');
			}
			DOM.append(lastRun, $('span', undefined, getRunStateLabel(row.lastRun.state, row.lastRun.time)));
		} else {
			lastRun.classList.add('never');
			lastRun.textContent = localize('automationsLayout.notRunYet', "Not run yet");
		}

		const actions = DOM.append(element, $('.automations-layout-cell.automations-layout-actions'));
		const controls: HTMLElement[] = [];
		if (!row.eventTriggered) {
			const runButton = store.add(new Button(actions, { supportIcons: true, ariaLabel: localize('automationsLayout.runNowNamed', "Run {0} now", row.name), title: localize('automationsLayout.runNow', "Run now") }));
			runButton.label = `$(${Codicon.play.id})`;
			runButton.element.classList.add('automations-layout-icon-button');
			runButton.element.dataset.control = 'run';
			runButton.enabled = row.canRun;
			runButton.element.tabIndex = -1;
			store.add(runButton.onDidClick(event => {
				event?.stopPropagation();
				this.runRow(row);
			}));
			controls.push(runButton.element);
		} else {
			DOM.append(actions, $('span.automations-layout-icon-placeholder'));
		}
		const moreButton = store.add(new Button(actions, { supportIcons: true, ariaLabel: localize('automationsLayout.moreNamed', "More actions for {0}", row.name), title: localize('automationsLayout.more', "More actions") }));
		moreButton.label = `$(${Codicon.kebabVertical.id})`;
		moreButton.element.classList.add('automations-layout-icon-button');
		moreButton.element.dataset.control = 'more';
		moreButton.element.setAttribute('aria-haspopup', 'menu');
		moreButton.element.tabIndex = -1;
		store.add(moreButton.onDidClick(event => {
			event?.stopPropagation();
			this.showRowMenu(row, element, moreButton.element);
		}));
		controls.push(moreButton.element);

		const switchCell = DOM.append(element, $('.automations-layout-cell.automations-layout-switch'));
		const toggle = store.add(new Switch({
			ariaLabel: localize('automationsLayout.switchAria', "{0} on", row.name),
			title: row.enabled ? localize('automationsLayout.switchOn', "On") : localize('automationsLayout.switchOff', "Off"),
			checked: this.pendingToggles.get(row.id) ?? row.enabled,
			disabled: !row.canUpdate,
		}));
		this.rowSwitches.set(row.id, toggle);
		toggle.domNode.dataset.control = 'enabled';
		toggle.domNode.tabIndex = -1;
		switchCell.appendChild(toggle.domNode);
		store.add(DOM.addDisposableListener(switchCell, DOM.EventType.CLICK, event => event.stopPropagation()));
		store.add(toggle.onChange(checked => this.setRowEnabled(row, checked, toggle)));
		controls.push(toggle.domNode);
		element.dataset.controls = String(controls.length);
		controlElements.set(element, controls);

		const stateDescription = getRunStateDescription(row.lastRun?.state);
		const lastRunText = row.lastRun
			? stateDescription
				? localize('automationsLayout.rowAria.lastRunState', "last run {0}, {1}", fromNow(row.lastRun.time, true), stateDescription)
				: localize('automationsLayout.rowAria.lastRun', "last run {0}", fromNow(row.lastRun.time, true))
			: localize('automationsLayout.rowAria.notRun', "not run yet");
		element.setAttribute('aria-label', localize('automationsLayout.rowAria', "{0}, {1}, runs on {2}, {3}, {4}", row.name, row.schedule.label, place, lastRunText,
			row.enabled ? localize('automationsLayout.rowAria.on', "on") : localize('automationsLayout.rowAria.off', "off")));

		store.add(this.hoverService.setupDelayedHover(element, () => {
			const content = $('.automations-layout-row-hover');
			DOM.append(content, $('p.automations-layout-row-hover-prompt', undefined, row.prompt));
			if (row.schedule.cronExpression) {
				DOM.append(content, $('p.automations-layout-row-hover-cron', undefined, localize('automationsLayout.cron', "Cron: {0}", row.schedule.cronExpression)));
			}
			return { content, style: HoverStyle.Pointer, position: { hoverPosition: HoverPosition.BELOW } };
		}, { groupId: 'automations-layout-rows' }));

		store.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, event => {
			// Run now and More actions handle their own clicks, and the switch's cell stops them.
			if (DOM.isHTMLElement(event.target) && actions.contains(event.target)) {
				return;
			}
			this.openDetails(row.id);
		}));
		store.add(DOM.addDisposableListener(element, DOM.EventType.CONTEXT_MENU, event => {
			DOM.EventHelper.stop(event, true);
			this.showRowMenu(row, element, moreButton.element);
		}));
		store.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.target !== element) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				this.openDetails(row.id);
			}
		}));
	}

	private renderRuns(runs: readonly IAutomationLayoutRun[], hasUnread: boolean): void {
		this.markAllButton.enabled = hasUnread;
		if (runs.length === 0) {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, localize('automationsLayout.noRuns', "No runs yet.")));
			return;
		}
		for (const group of groupAutomationRunsByDay(runs, this.model.now.get())) {
			const section = DOM.append(this.content, $('section.automations-layout-run-group'));
			const title = DOM.append(section, $('h3.automations-layout-day', undefined, group.label));
			title.id = `${this.idPrefix}-day-${group.key}`;
			const list = DOM.append(section, $('.automations-layout-run-rows', { role: 'list', 'aria-labelledby': title.id }));
			for (const run of group.runs) {
				this.renderRunRow(list, run);
			}
		}
	}

	private renderRunRow(list: HTMLElement, run: IAutomationLayoutRun): void {
		const element = DOM.append(list, $('.automations-layout-run-row', { role: 'listitem', tabindex: '-1' }));
		this.rovingItems.push(element);
		element.dataset.key = `run:${run.id}`;
		element.classList.toggle('unread', run.unread);
		const icon = getRunStateIcon(run.state);
		const iconElement = DOM.append(element, renderIcon(icon ?? Codicon.circleOutline));
		iconElement.classList.add('automations-layout-run-icon', `state-${run.state}`);
		iconElement.setAttribute('aria-hidden', 'true');
		DOM.append(element, $('span.automations-layout-run-title', undefined, run.title));
		DOM.append(element, $('span.automations-layout-run-automation', undefined, run.title !== run.automationName ? run.automationName : ''));
		DOM.append(element, $('span.automations-layout-run-time', undefined, run.state === 'running' || run.state === 'needsInput' ? getRunStateLabel(run.state, run.time) : fromNow(run.time, true)));
		DOM.append(element, $('span.automations-layout-run-unread', { 'aria-hidden': 'true' }));
		const parts = [run.title];
		if (run.title !== run.automationName) {
			parts.push(run.automationName);
		}
		parts.push(getRunStateDescription(run.state) ?? '', fromNow(run.time, true));
		if (run.unread) {
			parts.push(localize('automationsLayout.runAria.unread', "unread"));
		}
		element.setAttribute('aria-label', parts.filter(Boolean).join(', '));
		const open = () => {
			if (run.isSample) {
				this.actions.showSampleNotice();
				return;
			}
			void this.openRun(run);
		};
		this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, open));
		this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				open();
			}
		}));
	}

	private renderExampleList(parent: HTMLElement, examples: readonly IAutomationLayoutExample[]): void {
		if (examples.length === 0) {
			DOM.append(parent, $('p.automations-layout-quiet', undefined, localize('automationsLayout.noExamples', "No examples match.")));
			return;
		}
		const list = DOM.append(parent, $('.automations-layout-example-rows', { role: 'list', 'aria-label': localize('automationsLayout.examplesAria', "Examples") }));
		for (const example of examples) {
			const element = DOM.append(list, $('.automations-layout-example-row', { role: 'listitem', tabindex: '-1' }));
			this.rovingItems.push(element);
			element.dataset.key = `example:${example.template.id}`;
			DOM.append(element, $('span.automations-layout-example-name', undefined, example.template.name));
			DOM.append(element, $('span.automations-layout-example-schedule', undefined, example.schedule.label));
			const source = example.source
				? localize('automationsLayout.fromSource', "From {0}", example.source)
				: localize('automationsLayout.builtIn', "Built in");
			DOM.append(element, $('span.automations-layout-example-source', undefined, source));
			const use = this.contentDisposables.add(new Button(element, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.useNamed', "Use {0}", example.template.name) }));
			use.label = localize('automationsLayout.use', "Use");
			use.element.classList.add('automations-layout-use-button');
			use.element.dataset.control = 'use';
			use.element.tabIndex = -1;
			controlElements.set(element, [use.element]);
			const useExample = () => void this.actions.createFromTemplate(example.template);
			this.contentDisposables.add(use.onDidClick(event => {
				event?.stopPropagation();
				useExample();
			}));
			element.setAttribute('aria-label', localize('automationsLayout.exampleAria', "{0}, {1}, {2}. {3}", example.template.name, example.schedule.label, source, example.template.description));
			this.contentDisposables.add(this.hoverService.setupDelayedHover(element, { content: example.template.description, style: HoverStyle.Pointer, position: { hoverPosition: HoverPosition.BELOW } }, { groupId: 'automations-layout-examples' }));
			this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, useExample));
			this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
				if (event.target === element && new StandardKeyboardEvent(event).equals(KeyCode.Enter)) {
					DOM.EventHelper.stop(event, true);
					useExample();
				}
			}));
		}
	}

	private renderEmptyState(nav: AutomationsNavId, catalogueState: AutomationCatalogueState, examples: readonly IAutomationLayoutExample[]): void {
		if (catalogueState === 'loading') {
			const loading = DOM.append(this.content, $('p.automations-layout-quiet'));
			DOM.append(loading, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'))).setAttribute('aria-hidden', 'true');
			loading.append(localize('automationsLayout.loading', "Loading automations..."));
			return;
		}
		if (catalogueState === 'error') {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, localize('automationsLayout.loadError', "Unable to load automations. Try again later.")));
			return;
		}
		if (nav !== 'all') {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, getEmptyGroupMessage(nav)));
			return;
		}
		const empty = DOM.append(this.content, $('.automations-layout-empty'));
		DOM.append(empty, $('h3.automations-layout-empty-title', undefined, localize('automationsLayout.empty', "No automations yet")));
		if (examples.length > 0) {
			DOM.append(empty, $('p.automations-layout-empty-subtitle', undefined, localize('automationsLayout.emptyExamples', "Start from an example:")));
			this.renderExampleList(empty, examples.slice(0, 3));
			const seeAll = DOM.append(empty, $<HTMLButtonElement>('button.automations-layout-link', { type: 'button', tabindex: '-1' }, localize('automationsLayout.seeAllExamples', "See all examples")));
			this.rovingItems.push(seeAll);
			seeAll.dataset.key = 'link:examples';
			this.contentDisposables.add(DOM.addDisposableListener(seeAll, DOM.EventType.CLICK, () => this.setSelectedNav('examples')));
		}
	}

	//#endregion

	//#region Row actions

	private editRow(row: IAutomationLayoutRow): void {
		if (row.isSample || !row.automation) {
			this.actions.showSampleNotice();
			return;
		}
		if (row.canUpdate) {
			void this.actions.edit(row.automation);
		}
	}

	private runRow(row: IAutomationLayoutRow): void {
		if (row.isSample || !row.automation) {
			this.actions.showSampleNotice();
			return;
		}
		void this.actions.runNow(row.automation);
	}

	private setRowEnabled(row: IAutomationLayoutRow, enabled: boolean, toggle: Switch): void {
		if (row.isSample || !row.automation) {
			toggle.checked = row.enabled;
			this.actions.showSampleNotice();
			return;
		}
		// One save per automation at a time: a toggle while one is saving is ignored, so the later request
		// can't race the earlier one and leave the automation in the wrong state.
		const pending = this.pendingToggles.get(row.id);
		if (pending !== undefined) {
			toggle.checked = pending;
			return;
		}
		this.pendingToggles.set(row.id, enabled);
		void this.actions.setEnabled(row.automation, enabled).finally(() => {
			this.pendingToggles.delete(row.id);
			const current = this.rowSwitches.get(row.id);
			if (!this._store.isDisposed && current) {
				current.checked = this.automationService.getAutomation(row.id)?.enabled ?? row.enabled;
			}
		});
	}

	private showRowMenu(row: IAutomationLayoutRow, rowElement: HTMLElement, anchor: HTMLElement): void {
		rowElement.classList.add('menu-open');
		const onHide = () => rowElement.classList.remove('menu-open');
		const automation = row.automation;
		if (row.isSample || !automation) {
			const notice = () => this.actions.showSampleNotice();
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => [
					toAction({ id: 'automationsLayout.sample.edit', label: localize('automationsLayout.sample.edit', "Edit"), run: notice }),
					toAction({ id: 'automationsLayout.sample.toggle', label: row.enabled ? localize('automationsLayout.sample.disable', "Disable") : localize('automationsLayout.sample.enable', "Enable"), run: notice }),
					new Separator(),
					toAction({ id: 'automationsLayout.sample.delete', label: localize('automationsLayout.sample.delete', "Delete..."), run: notice }),
				],
				onHide,
			});
			return;
		}
		const scoped = this.contextKeyService.createScoped(rowElement);
		AutomationCardCanDeleteContext.bindTo(scoped).set(this.automationService.canDeleteAutomation(automation.id));
		AutomationCardCanUpdateContext.bindTo(scoped).set(this.automationService.canUpdateAutomation(automation.id));
		AutomationCardHasExternalResourceContext.bindTo(scoped).set(automation.externalResource !== undefined);
		AutomationCardEnabledContext.bindTo(scoped).set(automation.enabled);
		AutomationCardHasLimitsContext.bindTo(scoped).set(getAutomationAfterDate(automation.disableConditions) !== undefined);
		AutomationCardIsCloudContext.bindTo(scoped).set(automation.cloudTrigger !== undefined || automation.ownership !== undefined);
		AutomationCardHasEventTriggerContext.bindTo(scoped).set(hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {}));
		this.contextMenuService.showContextMenu({
			menuId: AgentsWindowMenus.AutomationCardContext,
			menuActionOptions: { shouldForwardArgs: true, arg: automation },
			getAnchor: () => anchor,
			contextKeyService: scoped,
			onHide: () => {
				onHide();
				scoped.dispose();
			},
		});
	}

	private async openRun(run: IAutomationLayoutRun): Promise<void> {
		if (this.options.variant === 'modal') {
			await this.options.close?.();
		}
		await this.actions.openRun(run.sessionResource, run.externalResource);
	}

	private markAllRunsRead(): void {
		const sampleRuns = this.model.runs.get().filter(run => run.isSample);
		if (sampleRuns.length > 0) {
			sampleAutomationRunsRead.set(new Set([...sampleAutomationRunsRead.get(), ...sampleRuns.map(run => run.id)]), undefined);
		}
		if (this.model.runs.get().some(run => !run.isSample && run.unread)) {
			void this.actions.markAllRunsRead();
		}
		status(localize('automationsLayout.markedAllRead', "Marked all runs as read"));
	}

	private async startNewAutomation(): Promise<void> {
		await this.options.close?.();
		await this.actions.startAutomationChat();
	}

	/** Explains Create with agent the first time the modal shows, once the modal has laid the button out. */
	private showCreateWithAgentSpotlightOnce(target: HTMLElement): void {
		if (this.storageService.getBoolean(CREATE_SPOTLIGHT_SHOWN_STORAGE_KEY, StorageScope.PROFILE, false)) {
			return;
		}
		const targetWindow = DOM.getWindow(target);
		const waiting = new DisposableStore();
		this.createSpotlight.value = waiting;
		const pending = waiting.add(new MutableDisposable());
		const observer = waiting.add(new DOM.DisposableResizeObserver('automationsLayout.createSpotlight', () => {
			pending.value ??= DOM.scheduleAtNextAnimationFrame(targetWindow, () => {
				pending.clear();
				this.showCreateWithAgentSpotlight(target);
			});
		}, targetWindow));
		waiting.add(observer.observe(target));
	}

	private showCreateWithAgentSpotlight(target: HTMLElement): void {
		if (this.storageService.getBoolean(CREATE_SPOTLIGHT_SHOWN_STORAGE_KEY, StorageScope.PROFILE, false)) {
			this.createSpotlight.clear();
			return;
		}
		const rect = target.getBoundingClientRect();
		if (!target.isConnected || rect.width === 0 || rect.height === 0) {
			return;
		}
		this.storageService.store(CREATE_SPOTLIGHT_SHOWN_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		const store = new DisposableStore();
		this.createSpotlight.value = store;
		// The workbench container, like the onboarding spotlight, so the overlay sits above the modal.
		const overlay = store.add(new SpotlightOverlay(target.closest<HTMLElement>('.monaco-workbench') ?? this.element));
		const dismiss = () => {
			if (this.createSpotlight.value === store) {
				this.createSpotlight.clear();
			}
		};
		store.add(overlay.onDidClickNext(dismiss));
		store.add(overlay.onDidSkip(dismiss));
		store.add(overlay.onDidLoseTarget(dismiss));
		overlay.show(target, {
			title: localize('automationsLayout.createSpotlight.title', "Create with Agent"),
			description: localize('automationsLayout.createSpotlight.description', "Closes Automations and starts a new session. Describe what you want automated and the agent sets it up."),
			nextButtonLabel: localize('automationsLayout.createSpotlight.gotIt', "Got it"),
			stepIndex: 0,
			stepCount: 1,
			canGoBack: false,
			isLastStep: true,
		}, { placement: 'below' });
	}

	//#endregion

	//#region Details

	/** Opens details beside the list without recreating its rows or changing its filters. */
	protected openDetails(rowId: string, options?: { readonly focus?: boolean }): void {
		this.inlineCreation?.cancel();
		this.hoverService.hideHover(true);
		this.createSpotlight.clear();
		const wasOpen = !!this.detailsView;
		const store = new DisposableStore();
		this.details.value = store;
		const view = this.detailsView = this.createDetailsView(rowId, store);
		store.add(toDisposable(() => {
			if (this.detailsView === view) {
				this.detailsView = undefined;
			}
			const row = this.getRovingItems().find(item => item.dataset.key === `row:${rowId}`);
			if (row) {
				this.updateDetailsRowState(row, rowId);
			}
		}));
		const row = this.getRovingItems().find(item => item.dataset.key === `row:${rowId}`);
		if (row) {
			this.updateDetailsRowState(row, rowId);
		}
		store.add(autorun(reader => {
			const row = this.model.rows.read(reader).find(candidate => candidate.id === rowId);
			const runs = this.model.runs.read(reader);
			const now = this.model.now.read(reader);
			if (!row) {
				// Removed while its details were open: close them after this update, unless they close first.
				store.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
					if (this.details.value === store) {
						this.closeDetails();
					}
				}));
				return;
			}
			this.renderDetails(view, row, getAutomationLayoutDetails(runs, row.id), now);
		}));
		if (!wasOpen && options?.focus !== false) {
			this.animateDetailsLayout();
		}
		this.layoutPane(this.paneDimension.width, this.paneDimension.height);
		if (options?.focus !== false) {
			view.panel.focus({ preventScroll: true });
		}
	}

	private updateDetailsRowState(element: HTMLElement, rowId: string): void {
		const selected = this.detailsView?.rowId === rowId;
		element.classList.toggle('details-open', selected);
		element.setAttribute('aria-current', String(selected));
		if (selected) {
			element.setAttribute('aria-controls', `${this.idPrefix}-details`);
		} else {
			element.removeAttribute('aria-controls');
		}
	}

	/** Closes the details and puts focus back on the automation's row. Returns whether they were open. */
	closeDetails(): boolean {
		const view = this.detailsView;
		if (!view) {
			return false;
		}
		this.animateDetailsLayout();
		this.hideDetails();
		const items = this.getRovingItems();
		const row = items.find(item => item.dataset.key === `row:${view.rowId}`) ?? items[0];
		if (!row) {
			this.focus();
			return true;
		}
		for (const item of items) {
			item.tabIndex = item === row ? 0 : -1;
		}
		row.focus({ preventScroll: true });
		return true;
	}

	/** Closes the details without moving focus, when the pane changes under them. */
	private hideDetails(): void {
		this.details.clear();
		this.layoutPane(this.paneDimension.width, this.paneDimension.height);
	}

	private createDetailsView(rowId: string, store: DisposableStore): IDetailsView {
		this.detailsOpen.set(true);
		store.add(toDisposable(() => this.detailsOpen.reset()));

		const panel = DOM.append(this.detailsContainer, $('section.automations-layout-details', { role: 'region', tabindex: '-1', id: `${this.idPrefix}-details` }));
		store.add(toDisposable(() => panel.remove()));
		const header = DOM.append(panel, $('.automations-layout-details-header'));
		DOM.append(header, renderIcon(Codicon.calendar)).setAttribute('aria-hidden', 'true');
		const title = DOM.append(header, $('h2.automations-layout-details-title'));
		const source = DOM.append(header, $('span.automations-layout-details-source'));
		title.id = `${this.idPrefix}-details-title`;
		panel.setAttribute('aria-labelledby', title.id);
		const sampleLabel = DOM.append(header, $('span.automations-layout-sample-label', { tabindex: '0' }, localize('automationsLayout.sampleData', "Sample data")));
		store.add(this.hoverService.setupDelayedHover(sampleLabel, {
			content: localize('automationsLayout.sampleDataHover', "Prototype only. These automations aren't real."),
			style: HoverStyle.Pointer,
		}, { setupKeyboardEvents: true }));
		const close = store.add(new Button(header, { supportIcons: true, ariaLabel: localize('automationsLayout.details.closeAria', "Close details"), title: localize('automationsLayout.details.close', "Close") }));
		close.label = `$(${Codicon.close.id})`;
		close.element.classList.add('automations-layout-icon-button', 'automations-layout-details-close');
		store.add(close.onDidClick(() => this.closeDetails()));
		const body = DOM.append(panel, $('.automations-layout-details-body'));
		// Native buttons swallow Escape before window keybindings, including those in the adjacent list.
		// Leave search and menu dismissal to their own handlers.
		store.add(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.defaultPrevented || !new StandardKeyboardEvent(event).equals(KeyCode.Escape) || this.contextKeyService.getContextKeyValue<boolean>('contextMenuVisible')) {
				return;
			}
			const target = event.target;
			if (DOM.isHTMLElement(target) && (panel.contains(target) || target.closest('.monaco-button'))) {
				DOM.EventHelper.stop(event, true);
				this.closeDetails();
			}
		}, true));
		return { rowId, panel, title, source, sampleLabel, body, content: store.add(new DisposableStore()), keyed: new Map(), activeRun: undefined };
	}

	/** Marks an element of the details that can have focus, so a later render can give it focus back. */
	private setDetailsKey(view: IDetailsView, element: HTMLElement, key: string): void {
		element.dataset.detailsKey = key;
		view.keyed.set(key, element);
	}

	private renderDetails(view: IDetailsView, row: IAutomationLayoutRow, details: IAutomationLayoutDetails, now: number): void {
		const active = DOM.getActiveElement();
		const focusedKey = DOM.isHTMLElement(active) && view.body.contains(active)
			? [...view.keyed].find(([, element]) => element === active || element.contains(active))?.[0] ?? ''
			: undefined;
		const scrollTop = view.body.scrollTop;
		view.content.clear();
		view.keyed.clear();
		DOM.clearNode(view.body);
		view.title.textContent = row.name;
		view.source.textContent = getAutomationRowPlace(row);
		view.sampleLabel.style.display = row.isSample ? '' : 'none';

		// What it is: its purpose, when and where it runs, and what can be done with it.
		DOM.append(view.body, $('p.automations-layout-details-prompt', undefined, row.prompt));
		const facts = DOM.append(view.body, $('dl.automations-layout-details-facts'));
		for (const fact of getAutomationDetailsFacts(row, now)) {
			DOM.append(facts, $('dt', undefined, fact.term));
			DOM.append(facts, $('dd', undefined, fact.description));
		}
		this.renderDetailsActions(view, row);

		// How it's going: its latest run, the latest thing it produced, and every run.
		this.renderDetailsLatestRun(view.body, details);
		if (details.runs.length > 0) {
			this.renderDetailsResult(view, details);
			this.renderDetailsRuns(view, row, details);
		}

		view.body.scrollTop = scrollTop;
		if (focusedKey !== undefined) {
			(view.keyed.get(focusedKey) ?? view.panel).focus({ preventScroll: true });
		}
	}

	private renderDetailsActions(view: IDetailsView, row: IAutomationLayoutRow): void {
		const actions = DOM.append(view.body, $('.automations-layout-details-actions'));
		if (!row.eventTriggered) {
			const runButton = view.content.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('automationsLayout.runNowNamed', "Run {0} now", row.name) }));
			runButton.label = `$(${Codicon.play.id}) ${localize('automationsLayout.runNow', "Run now")}`;
			runButton.enabled = row.canRun;
			this.setDetailsKey(view, runButton.element, 'run');
			view.content.add(runButton.onDidClick(() => this.runRow(row)));
		}
		const editButton = view.content.add(new Button(actions, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.editNamed', "Edit {0}", row.name) }));
		editButton.label = localize('automationsLayout.edit', "Edit");
		editButton.enabled = row.canUpdate;
		this.setDetailsKey(view, editButton.element, 'edit');
		view.content.add(editButton.onDidClick(() => this.editRow(row)));
	}

	private renderDetailsLatestRun(parent: HTMLElement, details: IAutomationLayoutDetails): void {
		const section = this.appendDetailsSection(parent, localize('automationsLayout.details.latestRun', "Latest run"));
		const run = details.latestRun;
		const state = DOM.append(section, $('.automations-layout-details-state'));
		if (!run) {
			state.textContent = localize('automationsLayout.details.notRunYet', "Not run yet.");
			return;
		}
		const icon = DOM.append(state, renderIcon(getRunStateIcon(run.state) ?? Codicon.circleOutline));
		icon.classList.add(`state-${run.state}`);
		icon.setAttribute('aria-hidden', 'true');
		DOM.append(state, $('span', undefined, getLatestRunText(run)));
		if (run.outcome) {
			DOM.append(section, $('p.automations-layout-details-outcome', undefined, run.outcome));
		}
	}

	private renderDetailsResult(view: IDetailsView, details: IAutomationLayoutDetails): void {
		const section = this.appendDetailsSection(view.body, localize('automationsLayout.details.latestResult', "Latest result"));
		const latest = details.latestResult;
		if (!latest) {
			DOM.append(section, $('p.automations-layout-details-quiet', undefined, localize('automationsLayout.details.noResult', "No results to show yet.")));
			return;
		}
		const run = latest.run;
		const card = DOM.append(section, $('.automations-layout-details-result'));
		this.setDetailsKey(view, card, 'result');
		const preview = getResultPreview(run.result);
		if (preview) {
			this.appendResultPreview(card, preview);
		}
		const summary = getRunSummary(run);
		if (summary) {
			DOM.append(card, $('p.automations-layout-details-result-summary', undefined, summary));
		}
		const changes = run.result?.changes;
		if (run.result?.artifacts.length && changes && changes.files > 0) {
			DOM.append(card, $('p.automations-layout-details-result-changes', undefined, formatChanges(changes.files, changes.additions, changes.deletions)));
		}
		const source = getResultSourceText(details) ?? '';
		DOM.append(card, $('p.automations-layout-details-result-source', undefined, source));
		if (run.isSample || getAutomationRunDestination(run).kind !== 'none') {
			card.classList.add('can-open');
			card.tabIndex = 0;
			card.setAttribute('role', 'button');
			card.setAttribute('aria-label', joinSentences([localize('automationsLayout.details.latestResult', "Latest result"), preview && formatResultPreview(preview), summary, source, getRunDestinationText(run)]));
			this.addDetailsActivation(view, card, () => this.openDetailsRun(run));
		}
	}

	private renderDetailsRuns(view: IDetailsView, row: IAutomationLayoutRow, details: IAutomationLayoutDetails): void {
		const section = this.appendDetailsSection(view.body, localize('automationsLayout.details.runs', "Runs"), String(details.runs.length));
		const list = DOM.append(section, $('.automations-layout-details-runs', { role: 'list', 'aria-label': localize('automationsLayout.details.runsAria', "Runs of {0}, newest first", row.name) }));
		const items = details.runs.map(run => this.renderDetailsRun(view, list, run));
		// One tab stop in the list, like the automation list: the run that last had focus, or the newest.
		const tabStop = items.find(item => item.dataset.detailsKey === view.activeRun) ?? items[0];
		for (const item of items) {
			item.tabIndex = item === tabStop ? 0 : -1;
		}
		view.content.add(DOM.addDisposableListener(list, DOM.EventType.FOCUS_IN, (event: FocusEvent) => {
			const target = items.find(item => item === event.target);
			if (target) {
				view.activeRun = target.dataset.detailsKey;
				for (const item of items) {
					item.tabIndex = item === target ? 0 : -1;
				}
			}
		}));
		view.content.add(DOM.addDisposableListener(list, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const index = items.findIndex(item => item === event.target);
			if (index < 0) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			let target: HTMLElement | undefined;
			if (keyboardEvent.equals(KeyCode.DownArrow)) {
				target = items[Math.min(items.length - 1, index + 1)];
			} else if (keyboardEvent.equals(KeyCode.UpArrow)) {
				target = items[Math.max(0, index - 1)];
			} else if (keyboardEvent.equals(KeyCode.Home)) {
				target = items[0];
			} else if (keyboardEvent.equals(KeyCode.End)) {
				target = items[items.length - 1];
			}
			if (target) {
				DOM.EventHelper.stop(event, true);
				target.focus();
			}
		}));
	}

	private renderDetailsRun(view: IDetailsView, list: HTMLElement, run: IAutomationLayoutRun): HTMLElement {
		const destination = getAutomationRunDestination(run);
		// Sample runs respond like the sample runs on Runs: they say they're samples.
		const canOpen = run.isSample || destination.kind !== 'none';
		const element = DOM.append(list, $('.automations-layout-details-run', { role: 'listitem', tabindex: '-1' }));
		this.setDetailsKey(view, element, `run:${run.id}`);
		element.classList.toggle('can-open', canOpen);
		const icon = DOM.append(element, renderIcon(getRunStateIcon(run.state) ?? Codicon.circleOutline));
		icon.classList.add('automations-layout-details-run-icon', `state-${run.state}`);
		icon.setAttribute('aria-hidden', 'true');
		const main = DOM.append(element, $('.automations-layout-details-run-main'));
		const heading = DOM.append(main, $('.automations-layout-details-run-heading'));
		DOM.append(heading, $('span.automations-layout-details-run-state', undefined, getRunStateTitle(run.state)));
		const trigger = getRunTriggerLabel(run.trigger);
		DOM.append(heading, $('span.automations-layout-details-run-time', undefined, trigger ? `${getDetailsRunTime(run)} \u00B7 ${trigger}` : getDetailsRunTime(run)));
		const description = getDetailsRunDescription(run);
		if (description) {
			DOM.append(main, $('p.automations-layout-details-run-description', undefined, description));
		}
		const preview = getResultPreview(run.result);
		if (preview) {
			this.appendResultPreview(main, preview);
		}
		const reason = getRunNotOpenableReason(run);
		if (reason) {
			DOM.append(main, $('p.automations-layout-details-run-note', undefined, reason));
		}
		const opens = DOM.append(element, $('span.automations-layout-details-run-opens', { 'aria-hidden': 'true' }));
		// Only runs that really open something show where they go; sample runs say they're samples, like on Runs.
		if (destination.kind !== 'none') {
			opens.appendChild(renderIcon(destination.kind === 'external' ? Codicon.linkExternal : Codicon.chevronRight));
		}
		if (canOpen) {
			this.addDetailsActivation(view, element, () => this.openDetailsRun(run));
		}
		element.setAttribute('aria-label', getDetailsRunText(run));
		return element;
	}

	private appendDetailsSection(parent: HTMLElement, title: string, count?: string): HTMLElement {
		const section = DOM.append(parent, $('section.automations-layout-details-section'));
		const heading = DOM.append(section, $('h3.automations-layout-details-heading', undefined, title));
		if (count) {
			// The space keeps the heading's name "Runs 4"; the flex layout doesn't render it.
			heading.append(' ');
			DOM.append(heading, $('span.automations-layout-details-count', undefined, count));
		}
		return section;
	}

	private appendResultPreview(parent: HTMLElement, preview: IResultPreview): void {
		const line = DOM.append(parent, $('.automations-layout-details-preview'));
		DOM.append(line, renderIcon(preview.icon)).setAttribute('aria-hidden', 'true');
		DOM.append(line, $('span.automations-layout-details-preview-label', undefined, preview.label));
		if (preview.more > 0) {
			DOM.append(line, $('span.automations-layout-details-preview-more', undefined, localize('automationsLayout.details.more', "+{0} more", preview.more)));
		}
	}

	/** Click, Enter and Space open the run of an item in the details. */
	private addDetailsActivation(view: IDetailsView, element: HTMLElement, activate: () => void): void {
		view.content.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, activate));
		view.content.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (event.target === element && (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space))) {
				DOM.EventHelper.stop(event, true);
				activate();
			}
		}));
	}

	/** Opens a run's own session, or its page on GitHub, with the same helper as Runs; sample runs only say they're samples. */
	private openDetailsRun(run: IAutomationLayoutRun): void {
		if (run.isSample) {
			this.actions.showSampleNotice();
			return;
		}
		if (getAutomationRunDestination(run).kind !== 'none') {
			void this.openRun(run);
		}
	}

	private getDetailsAccessibleContent(row: IAutomationLayoutRow, details: IAutomationLayoutDetails): string {
		const lines = [localize('automationsLayout.accessible.details', "Details of {0}", row.name)];
		if (row.isSample) {
			lines.push(localize('automationsLayout.accessible.sample', "Sample data is on. Sample automations are prototype only and aren't real."));
		}
		lines.push('', localize('automationsLayout.accessible.prompt', "Prompt: {0}", row.prompt));
		for (const fact of getAutomationDetailsFacts(row, Date.now(), ', ')) {
			lines.push(`${fact.term}: ${fact.description}`);
		}
		const latest = details.latestRun;
		lines.push('', localize('automationsLayout.accessible.latestRun', "Latest run: {0}", latest
			? joinSentences([getLatestRunText(latest), latest.outcome])
			: localize('automationsLayout.details.notRunYet', "Not run yet.")));
		if (latest) {
			const result = details.latestResult;
			const preview = result && getResultPreview(result.run.result);
			const summary = result && getRunSummary(result.run);
			lines.push(localize('automationsLayout.accessible.latestResult', "Latest result: {0}", result
				? joinSentences([preview && formatResultPreview(preview), summary, getResultSourceText(details)])
				: localize('automationsLayout.details.noResult', "No results to show yet.")));
			lines.push('', localize('automationsLayout.accessible.runs', "Runs, newest first:"));
			for (const run of details.runs) {
				lines.push(getDetailsRunText(run));
			}
		}
		lines.push('', localize('automationsLayout.accessible.closeDetails', "Escape closes the details and returns to the automation's row."));
		return lines.join('\n');
	}

	//#endregion

	//#region Keyboard

	private getRovingItems(): HTMLElement[] {
		return this.rovingItems;
	}

	private findRovingItem(element: HTMLElement): HTMLElement | undefined {
		return this.rovingItems.find(item => item === element || item.contains(element));
	}

	private focusFirstContentItem(): void {
		const items = this.getRovingItems();
		const target = items.find(item => item.tabIndex === 0) ?? items[0];
		target?.focus();
	}

	private onContentFocus(event: FocusEvent): void {
		const target = DOM.isHTMLElement(event.target) ? this.findRovingItem(event.target) : undefined;
		if (!target) {
			return;
		}
		for (const item of this.getRovingItems()) {
			item.tabIndex = item === target ? 0 : -1;
		}
	}

	private onContentKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		const active = DOM.getActiveElement();
		if (!DOM.isHTMLElement(active)) {
			return;
		}
		const item = this.findRovingItem(active);
		if (!item) {
			return;
		}
		const items = this.getRovingItems();
		const index = items.indexOf(item);
		const controls = controlElements.get(item) ?? [];
		const controlIndex = controls.indexOf(active);
		let target: HTMLElement | undefined;
		if (keyboardEvent.equals(KeyCode.DownArrow)) {
			target = items[Math.min(items.length - 1, index + 1)];
		} else if (keyboardEvent.equals(KeyCode.UpArrow)) {
			target = index > 0 ? items[index - 1] : undefined;
			if (!target && this.options.variant === 'chatInput') {
				target = this.navItems.find(navItem => navItem.id === this.selectedNav.get())?.element;
			}
		} else if (keyboardEvent.equals(KeyCode.Home)) {
			target = items[0];
		} else if (keyboardEvent.equals(KeyCode.End)) {
			target = items[items.length - 1];
		} else if (keyboardEvent.equals(KeyCode.RightArrow) && controls.length > 0) {
			target = controls[Math.min(controls.length - 1, controlIndex + 1)];
		} else if (keyboardEvent.equals(KeyCode.LeftArrow) && controlIndex >= 0) {
			target = controlIndex > 0 ? controls[controlIndex - 1] : item;
		} else if ((keyboardEvent.equals(KeyMod.Shift | KeyCode.F10) || keyboardEvent.keyCode === KeyCode.ContextMenu) && item.dataset.key?.startsWith('row:')) {
			DOM.EventHelper.stop(event, true);
			item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return;
		}
		if (target) {
			DOM.EventHelper.stop(event, true);
			target.focus();
		}
	}

	/** The focused list item, and which of its controls has focus (-1 for the item itself). */
	private getFocusedContent(): IFocusedContent | undefined {
		const active = DOM.getActiveElement();
		if (!DOM.isHTMLElement(active) || !this.content.contains(active)) {
			return undefined;
		}
		const item = this.findRovingItem(active);
		const key = item?.dataset.key;
		if (!item || !key) {
			return undefined;
		}
		const controls = controlElements.get(item) ?? [];
		return { key, control: controls.find(control => control === active || control.contains(active))?.dataset.control };
	}

	/** Puts focus back on the same item and control after a re-render, so Enter keeps doing the same thing. */
	private restoreContentFocus(focused: IFocusedContent | undefined): void {
		const items = this.getRovingItems();
		const target = focused ? items.find(item => item.dataset.key === focused.key) : undefined;
		const tabStop = target ?? items[0];
		for (const item of items) {
			item.tabIndex = item === tabStop ? 0 : -1;
		}
		if (!focused) {
			return;
		}
		// By name rather than position, so a row that gains or loses Run now keeps focus on the same control.
		const control = target && focused.control ? controlElements.get(target)?.find(candidate => candidate.dataset.control === focused.control) : undefined;
		if (target && control) {
			// A row's actions are hidden until the row has focus; show them while focus moves to one of them.
			target.classList.add('restoring-focus');
			control.focus();
			target.classList.remove('restoring-focus');
		}
		if (!control || DOM.getActiveElement() !== control) {
			(target ?? items[0])?.focus();
		}
	}

	//#endregion
}


/** When a run last changed: its latest update while it's running, otherwise when it finished. NaN when unknown. */
function getRunTime(run: IAutomationRun, state: AutomationRunState): number {
	return Date.parse(state === 'running' || state === 'needsInput'
		? run.updatedAt ?? run.startedAt
		: run.completedAt ?? run.updatedAt ?? run.startedAt);
}

/** The host's words about a run: why it failed, how it ended, or what its session is doing now. */
function getRunOutcome(run: IAutomationRun, state: AutomationRunState, session: ISession | undefined, reader: IReader): string | undefined {
	switch (state) {
		case 'failed':
			return run.errorMessage || run.statusDescription || undefined;
		case 'completed':
			return run.statusDescription || undefined;
		default: {
			const live = session && isActiveSessionStatus(session.status.read(reader)) ? session.description.read(reader) : undefined;
			return (live && renderAsPlaintext(live, { omitMarkdownSyntax: true }).trim()) || run.statusDescription || undefined;
		}
	}
}

function hostOrder(hostKey: string): number {
	return hostKey === LOCAL_AUTOMATION_HOST ? 0 : hostKey === CLOUD_AUTOMATION_HOST ? 2 : 1;
}

function formatResultCount(count: number, kind: 'automations' | 'runs' | 'examples'): string {
	switch (kind) {
		case 'automations':
			return count === 0 ? localize('automationsLayout.found.noAutomations', "No automations found")
				: count === 1 ? localize('automationsLayout.found.oneAutomation', "1 automation found")
					: localize('automationsLayout.found.automations', "{0} automations found", count);
		case 'runs':
			return count === 0 ? localize('automationsLayout.found.noRuns', "No runs found")
				: count === 1 ? localize('automationsLayout.found.oneRun', "1 run found")
					: localize('automationsLayout.found.runs', "{0} runs found", count);
		case 'examples':
			return count === 0 ? localize('automationsLayout.found.noExamples', "No examples found")
				: count === 1 ? localize('automationsLayout.found.oneExample', "1 example found")
					: localize('automationsLayout.found.examples', "{0} examples found", count);
	}
}

function getEmptyGroupMessage(nav: AutomationsNavId): string {
	switch (nav) {
		case 'personal': return localize('automationsLayout.empty.personal', "No personal automations yet.");
		case 'cloud': return localize('automationsLayout.empty.cloud', "No cloud automations yet.");
		case 'repository': return localize('automationsLayout.empty.repository', "No shared automations yet.");
		default: return localize('automationsLayout.empty.all', "No automations yet.");
	}
}
