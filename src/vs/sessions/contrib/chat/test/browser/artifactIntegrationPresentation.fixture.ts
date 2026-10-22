/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ArtifactAutomationOption, ArtifactAvailability, ArtifactContributionSnapshot, ArtifactDetails, ArtifactRecord, ArtifactRun, ArtifactSectionPresentation, ArtifactSnapshot, artifactBindingId, IArtifactDetailsModel, IArtifactModel, isArtifactOptionEnabled } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { chartsBlue, chartsForeground, chartsGreen, chartsPurple, chartsRed, chartsYellow } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { ChatPillsRow, ChatPillsWidget, IChatPillEntry, withChatPillHoverLabel } from '../../../../../workbench/browser/chatPills.js';
import '../../../../../workbench/browser/media/style.css';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ArtifactIntegrationPresentation } from '../../browser/artifactIntegrationPresentation.js';
import { ArtifactDetailsContextView } from '../../browser/artifactDetailsContextView.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

const observedAt = Date.UTC(2026, 0, 12, 9);
const chat = 'fixture-chat';
const authority = 'fixture-authority';
const session = 'fixture-session';

interface IArtifactFixtureData {
	readonly artifact: ArtifactRecord;
	readonly contribution: ArtifactContributionSnapshot;
	readonly details: Readonly<Record<string, ArtifactDetails>>;
	readonly runs?: readonly ArtifactRun[];
	readonly location?: 'host' | 'client';
}

interface IArtifactFixtureOptions {
	readonly openDetails?: string;
	readonly compare?: boolean;
	readonly compact?: boolean;
	readonly width?: number;
	readonly longContent?: boolean;
	readonly showListInfo?: number;
	readonly openQuickPick?: boolean;
}

class FixtureArtifactModel implements IArtifactModel {
	readonly snapshot: ISettableObservable<ArtifactSnapshot>;

	constructor(private readonly data: IArtifactFixtureData) {
		this.snapshot = observableValue<ArtifactSnapshot>(this, {
			authority: { id: authority, targetHost: 'fixture-host', location: data.location ?? 'host' },
			session,
			artifact: data.artifact,
			contributions: [data.contribution],
			mainIntegrationId: data.contribution.integrationId,
			runs: data.runs ?? [],
		});
	}

	async configure(integrationId: string, expectedRevision: number, values: Readonly<Record<string, boolean | string>>): Promise<void> {
		const snapshot = this.snapshot.get();
		const contribution = this.getContribution(integrationId);
		if (contribution.configuration.revision !== expectedRevision) {
			throw new Error('The preview configuration has changed.');
		}
		const generations = { ...contribution.configuration.generations };
		const disablements = { ...contribution.configuration.disablements };
		for (const [id, value] of Object.entries(values)) {
			const option = contribution.options.find(option => option.id === id);
			if (!option || (option.kind === 'boolean' ? typeof value !== 'boolean' : !option.choices.some(choice => choice.value === value))) {
				throw new Error(`Invalid preview option: ${id}`);
			}
			if (isArtifactOptionEnabled(option, value) && !isArtifactOptionEnabled(option, contribution.configuration.values[id])) {
				generations[id] = (generations[id] ?? 0) + 1;
				delete disablements[id];
			}
		}
		this.snapshot.set({
			...snapshot,
			contributions: [{
				...contribution,
				configuration: { revision: expectedRevision + 1, values: { ...contribution.configuration.values, ...values }, generations, disablements },
			}],
		}, undefined);
	}

	async requestAuthentication(integrationId: string): Promise<never> {
		this.getContribution(integrationId);
		throw new Error('Sign-in is not available in component previews.');
	}

	async invoke(integrationId: string, actionId: string, destination: string, requestId: string): Promise<ArtifactRun> {
		const action = this.getContribution(integrationId).actions.find(action => action.id === actionId);
		if (!action) {
			throw new Error(`Unknown preview action: ${actionId}`);
		}
		const snapshot = this.snapshot.get();
		const run: ArtifactRun = {
			id: requestId, requestId, bindingId: artifactBindingId(snapshot.authority.id, snapshot.session, snapshot.artifact.id, integrationId), integrationId,
			actionId, actionKind: action.kind, actionConsent: 'fixture',
			source: 'manual', state: 'skipped', createdAt: observedAt, updatedAt: observedAt,
			reason: 'Preview only: no code was executed and no chat message was sent.', chat: destination, dispatched: false,
		};
		this.snapshot.set({ ...snapshot, runs: [...snapshot.runs, run] }, undefined);
		return run;
	}

	async cancel(runId: string): Promise<void> {
		this.updateRun(runId, { state: 'cancelled', reason: 'Cancelled in this preview only.', indeterminate: false });
	}

	async reconcile(runId: string): Promise<void> {
		this.updateRun(runId, { state: 'skipped', reason: 'Preview only: there is no remote execution to reconcile.', indeterminate: false });
	}

	async getRuns(before?: string, limit = 20): Promise<{ runs: readonly ArtifactRun[]; next?: string }> {
		const runs = [...this.snapshot.get().runs].reverse();
		const cursor = before === undefined ? -1 : runs.findIndex(run => run.id === before);
		if (before !== undefined && cursor === -1) {
			throw new Error(`Unknown preview activity cursor: ${before}`);
		}
		const page = runs.slice(cursor + 1, cursor + 1 + limit);
		return { runs: page, next: cursor + 1 + page.length < runs.length ? page.at(-1)?.id : undefined };
	}

	async acquireDetails(integrationId: string, detailsId: string): Promise<IArtifactDetailsModel> {
		this.getContribution(integrationId);
		const details = this.data.details[detailsId];
		if (!details) {
			throw new Error(`Unknown preview details: ${detailsId}`);
		}
		return { details: constObservable(details), dispose: () => { } };
	}

	private getContribution(integrationId: string): ArtifactContributionSnapshot {
		const contribution = this.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId);
		if (!contribution) {
			throw new Error(`Unknown preview integration: ${integrationId}`);
		}
		return contribution;
	}

	private updateRun(runId: string, update: Partial<ArtifactRun>): void {
		const snapshot = this.snapshot.get();
		if (!snapshot.runs.some(run => run.id === runId)) {
			throw new Error(`Unknown preview activity: ${runId}`);
		}
		this.snapshot.set({ ...snapshot, runs: snapshot.runs.map(run => run.id === runId ? { ...run, ...update, updatedAt: observedAt } : run) }, undefined);
	}
}

function section(id: string, label: string, icon: ThemeIcon, colorId: string, description?: string): ArtifactSectionPresentation {
	return { id, label, description, icon: { id: icon.id, colorId }, detailsId: id };
}

type PullRequestState = 'draft' | 'failing' | 'ready' | 'merged' | 'loading' | 'unavailable';

interface IPullRequestFixtureOptions {
	readonly mainOnly?: boolean;
	/** Whether automatic check repair is off, on, repairing a failure, or was turned off after repeated failures. */
	readonly autoFix?: 'off' | 'on' | 'running' | 'paused';
	/** Replaces the separate Mark Ready and Merge automation with one option that permits both actions. */
	readonly sharedLanding?: boolean;
}

function pullRequest(state: PullRequestState, options: IPullRequestFixtureOptions = {}): IArtifactFixtureData {
	const { mainOnly, autoFix = 'off', sharedLanding } = options;
	const artifactId = 'fixture-pull-request';
	const integrationId = 'fixture.pullRequest';
	const resource = 'https://github.example.test/contoso/editor/pull/42';
	const available = state !== 'loading' && state !== 'unavailable';
	const availability: ArtifactAvailability = state === 'loading' ? { kind: 'loading' }
		: state === 'unavailable' ? { kind: 'authenticationRequired', reason: 'Sign in to GitHub to see the state of this pull request.', observedAt }
			: { kind: 'available', observedAt };
	const labels: Record<PullRequestState, string> = {
		draft: 'Draft', failing: 'Changes requested', ready: 'Ready to merge', merged: 'Merged', loading: 'Loading status', unavailable: 'Sign in required',
	};
	const mainIcon = state === 'draft' ? Codicon.gitPullRequestDraft : state === 'merged' ? Codicon.gitMerge : Codicon.gitPullRequest;
	const mainColor = state === 'merged' ? chartsPurple : state === 'draft' || !available ? 'descriptionForeground' : chartsGreen;
	const sections: Record<PullRequestState, readonly ArtifactSectionPresentation[]> = {
		draft: [section('checks', '0/6', Codicon.circleFilledCompact, chartsForeground, 'Checks queued; 0 of 6 passed'), section('reviews', '0', Codicon.commentDiscussion, chartsForeground, 'No review comments')],
		failing: [
			section('checks', '3/6', Codicon.errorCompact, chartsRed, '1 check failed'),
			section('reviews', '2', Codicon.commentDiscussion, chartsYellow, '2 unresolved review comments'),
		],
		ready: [
			section('checks', '6/6', Codicon.passFilledCompact, chartsGreen, 'All 6 checks passed'),
			section('reviews', '0', Codicon.commentDiscussion, chartsGreen, 'All review comments resolved'),
		],
		merged: [section('checks', '6/6', Codicon.passFilledCompact, chartsGreen, 'All 6 checks passed')],
		loading: [section('availability', 'Loading status', Codicon.sync, chartsForeground)],
		unavailable: [],
	};
	const automationOptions: readonly ArtifactAutomationOption[] = [
		{ id: 'fixChecks', kind: 'boolean', label: 'Fix automatically when checks fail', description: 'Send a repair prompt to the original chat when a check fails.', actionIds: ['fixChecks'], maxAttempts: 3, defaultValue: false },
		{ id: 'addressComments', kind: 'boolean', label: 'Address comments automatically', description: 'Send a review repair prompt to the original chat when a thread needs attention.', actionIds: ['addressComments'], maxAttempts: 3, defaultValue: false },
		...sharedLanding ? [
			{ id: 'land', kind: 'boolean', label: 'Mark ready and merge automatically when checks pass', description: 'Mark the pull request ready for review, then merge it once all merge requirements are satisfied.', actionIds: ['markReady', 'merge'], maxAttempts: 1, defaultValue: false },
		] satisfies ArtifactAutomationOption[] : [
			{ id: 'markReady', kind: 'boolean', label: 'Mark ready automatically when checks pass', description: 'Mark ready after checks pass and review comments are resolved.', actionIds: ['markReady'], maxAttempts: 1, defaultValue: false },
			{ id: 'merge', kind: 'boolean', label: 'Merge automatically when ready', description: 'Merge once all merge requirements are satisfied.', actionIds: ['merge'], maxAttempts: 1, defaultValue: false },
		] satisfies ArtifactAutomationOption[],
	];
	const contribution: ArtifactContributionSnapshot = {
		integrationId, label: 'Pull request (demo)',
		authentication: state === 'unavailable' ? { enabled: true } : undefined,
		actions: [
			{ id: 'markReady', label: 'Mark Ready', iconId: Codicon.gitPullRequest.id, kind: 'code' },
			{ id: 'fixChecks', label: 'Fix Checks', iconId: Codicon.tools.id, kind: 'prompt' },
			{ id: 'addressComments', label: 'Address Comments', iconId: Codicon.commentDiscussion.id, kind: 'prompt' },
			{ id: 'merge', label: 'Merge', iconId: Codicon.gitMerge.id, kind: 'code' },
			{ id: 'refresh', label: 'Refresh Status', iconId: Codicon.refresh.id, kind: 'code' },
		],
		options: automationOptions,
		configuration: {
			revision: 1,
			values: Object.fromEntries(automationOptions.map(option => [option.id, option.id === 'fixChecks' && (autoFix === 'on' || autoFix === 'running')])),
			generations: { fixChecks: autoFix === 'off' ? 0 : 1 },
			disablements: autoFix === 'paused' ? { fixChecks: { attempts: 3, lastRunId: 'fixture-run-3', reason: 'Paused after three unsuccessful repair attempts. Review the failure before enabling again.' } } : {},
		},
		view: {
			availability,
			main: { label: '#42', description: `Pull request #42: ${labels[state]}`, icon: { id: mainIcon.id, colorId: mainColor }, detailsId: 'overview' },
			sections: mainOnly ? [] : sections[state],
			lists: mainOnly || state === 'unavailable' ? [] : [
				{ id: 'checks', label: 'Checks', detailsId: 'checks' },
				{ id: 'reviews', label: 'Comments', detailsId: 'reviews' },
			],
			stateActions: state === 'merged' ? [] : [
				...state === 'draft' ? [{ id: 'markReady', enabled: true }] : [],
				...state === 'failing' ? [{ id: 'fixChecks', enabled: true }, { id: 'addressComments', enabled: true }] : [],
				...state !== 'draft' ? [{
					id: 'merge', enabled: state === 'ready',
					disabledReason: state === 'ready' ? undefined : state === 'loading' ? 'Waiting for the pull request status.' : state === 'unavailable' ? 'Sign in to merge.' : 'Checks must pass and reviews must be resolved before merging.',
				}] : [],
			],
			generalActions: [{ id: 'refresh', enabled: available, disabledReason: available ? undefined : 'Waiting for a connection and authentication.' }],
			automationAvailability: automationOptions.map(option => ({
				id: option.id, available: available && state !== 'merged',
				unavailableReason: state === 'merged' ? 'The pull request is already merged.' : state === 'loading' ? 'Waiting for the pull request status.' : state === 'unavailable' ? 'Sign in to run automation.' : undefined,
			})),
		},
	};
	const details: Record<string, ArtifactDetails> = {
		overview: {
			availability, title: 'Preserve keyboard focus between chats',
			description: 'Keep the focused control stable when a session receives new activity. This change preserves the selected artifact, list position, and keyboard destination while background checks complete.\n\nThe details panel shares the composer width and leaves the conversation and draft in place. It also restores focus after dismissal and supports narrow windows.',
			facts: [{ id: 'branches', label: 'Branches', value: 'fix/chat-focus into main' }],
			links: [], items: [], completeness: 'complete',
		},
		checks: {
			availability, title: `Checks (${sections[state].find(section => section.id === 'checks')?.label ?? '0/0'})`, description: 'Shows required and optional CI checks for the current pull request revision.',
			links: [
				{ kind: 'automation', optionId: 'fixChecks' },
				...state === 'failing' ? [{ kind: 'action' as const, actionId: 'fixChecks' }] : [],
			],
			items: available ? [
				{ id: 'lint', label: 'Lint' },
				{ id: 'linux', label: 'Linux tests' },
				{ id: 'windows', label: 'Windows tests' },
				{ id: 'macos', label: 'macOS tests' },
				{ id: 'types', label: 'Type check' },
				{ id: 'build', label: 'Build' },
			].map((check, index) => {
				const failed = state === 'failing' && index === 0;
				const running = state === 'failing' && (index === 1 || index === 2);
				const queued = state === 'draft';
				return {
					...check,
					icon: {
						id: failed ? Codicon.errorCompact.id : running || queued ? Codicon.circleFilledCompact.id : Codicon.passFilledCompact.id,
						colorId: failed ? chartsRed : running ? chartsYellow : queued ? chartsForeground : chartsGreen,
					},
					description: failed ? 'Failed: an unused import needs to be removed.' : running ? 'In progress' : queued ? 'Queued' : 'Passed',
					resource: `${resource}/checks/${check.id}`,
				};
			}) : [],
			completeness: 'complete',
		},
		reviews: {
			availability, title: `Comments (${state === 'failing' ? 2 : 0})`, description: 'Shows unresolved review comments from repository contributors with owner, member, or collaborator access, and from Copilot.',
			links: [{ kind: 'automation', optionId: 'addressComments' }, ...state === 'failing' ? [{ kind: 'action' as const, actionId: 'addressComments' }] : []],
			items: state === 'failing' ? [
				{ id: 'focus', label: 'Please restore focus to the control that opened these details, including after live checks refresh or when switching between artifacts.', icon: { id: Codicon.commentDiscussion.id }, description: 'Reviewer - src/view.ts:42', resource: `${resource}#discussion-focus` },
				{ id: 'coverage', label: 'Cover keyboard navigation', icon: { id: Codicon.commentDiscussion.id }, description: 'Add a regression test for switching between sections.', resource: `${resource}#discussion-coverage` },
			] : [],
			completeness: 'complete',
		},
		availability: { availability, title: 'Pull request status', description: 'The resource link remains available while integration status is unavailable.', links: [], items: [], completeness: 'complete' },
	};
	const attempts = autoFix === 'paused' ? 3 : autoFix === 'running' ? 1 : 0;
	const bindingId = artifactBindingId(authority, session, artifactId, integrationId);
	const runs = Array.from({ length: attempts }, (_, index): ArtifactRun => ({
		id: `fixture-run-${index + 1}`, requestId: `fixture-request-${index + 1}`, bindingId, integrationId, actionId: 'fixChecks', actionKind: 'prompt', actionConsent: 'fixture',
		source: 'automation', optionId: 'fixChecks', configurationRevision: 1, generation: 1, occurrenceKey: 'fixture-check-failure',
		retryOf: index > 0 ? `fixture-run-${index}` : undefined,
		state: autoFix === 'paused' ? 'failed' : 'running', createdAt: observedAt, updatedAt: observedAt,
		reason: autoFix === 'paused' ? `Repair attempt ${index + 1} failed; lint still fails.` : 'Repairing the failing lint check in the originating chat.',
		chat, dispatched: true, receipt: { kind: 'turn', turnId: `fixture-turn-${index + 1}` },
	}));
	return {
		artifact: { id: artifactId, label: 'Preserve keyboard focus between chats', resource, origin: { chat } },
		contribution, details, runs,
	};
}

function experiment(scorecardReady: boolean): IArtifactFixtureData {
	const resource = 'https://experiments.example.test/experiments/faster-search';
	const availability: ArtifactAvailability = { kind: 'available', observedAt };
	return {
		artifact: { id: 'fixture-experiment', label: 'Faster search experiment', resource, origin: { chat } },
		location: 'client',
		contribution: {
			integrationId: 'fixture.experiment', label: 'Experiment (demo)',
			actions: [
				{ id: 'stop', label: 'Stop Experiment', iconId: Codicon.debugPause.id, kind: 'code' },
				{ id: 'analyse', label: 'Analyse Scorecard', iconId: Codicon.graph.id, kind: 'prompt' },
				{ id: 'refresh', label: 'Refresh Status', iconId: Codicon.refresh.id, kind: 'code' },
			],
			options: [
				{
					id: 'analyseScorecard', kind: 'boolean', label: 'Analyse automatically when a scorecard is ready', description: 'Send an analysis prompt to the original chat when a new scorecard is published.',
					actionIds: ['analyse'], maxAttempts: 1, defaultValue: false,
				},
				{
					id: 'analysisSchedule', kind: 'enum', label: 'Analyse on a schedule', description: 'Send an analysis prompt on the chosen schedule while the experiment is running.',
					actionIds: ['analyse'], maxAttempts: 1, defaultValue: 'off', disabledValue: 'off',
					choices: [{ value: 'off', label: 'Off' }, { value: 'monday', label: 'Every Monday' }, { value: 'daily', label: 'Every Day' }],
				},
			],
			configuration: { revision: 1, values: { analyseScorecard: false, analysisSchedule: 'monday' }, generations: { analysisSchedule: 1 }, disablements: {} },
			view: {
				availability,
				main: { label: 'Faster search', icon: { id: Codicon.beaker.id, colorId: chartsBlue }, detailsId: 'overview' },
				sections: [
					section('status', 'Running', Codicon.play, chartsGreen),
					section('scorecard', scorecardReady ? 'Scorecard ready' : 'Collecting data', scorecardReady ? Codicon.graph : Codicon.clock, scorecardReady ? chartsBlue : chartsYellow),
					section('analysis', scorecardReady ? 'Analysis needed' : 'Monday analysis', scorecardReady ? Codicon.sparkle : Codicon.calendar, scorecardReady ? chartsYellow : chartsForeground),
				],
				stateActions: [{ id: 'stop', enabled: true }, { id: 'analyse', enabled: scorecardReady, disabledReason: scorecardReady ? undefined : 'The scorecard is not available yet.' }],
				generalActions: [{ id: 'refresh', enabled: true }],
				automationAvailability: [{ id: 'analyseScorecard', available: true }, { id: 'analysisSchedule', available: true }],
			},
		},
		details: {
			overview: { availability, title: 'Faster search experiment', description: 'Compare the new search index against the existing implementation.', facts: [{ id: 'audience', label: 'Audience', value: '10% of Insiders' }], links: [], items: [], completeness: 'complete' },
			status: {
				availability, title: 'Experiment status', description: 'Started 7 days ago.', facts: [{ id: 'allocation', label: 'Allocation', value: '50% control / 50% treatment' }],
				links: [{ kind: 'action', actionId: 'stop' }], items: [], completeness: 'complete',
			},
			scorecard: {
				availability, title: 'Scorecard',
				description: scorecardReady ? 'The latest scorecard is ready for analysis. No rollout decision has been made.' : 'The first scorecard will appear after the minimum sample size is reached.',
				facts: scorecardReady ? [{ id: 'latency', label: 'Search latency', value: '-8.4%' }, { id: 'success', label: 'Successful searches', value: '+1.2%' }, { id: 'crashes', label: 'Crash rate', value: 'No significant change' }] : [],
				links: [{ kind: 'action', actionId: 'analyse' }, { kind: 'automation', optionId: 'analyseScorecard' }],
				items: scorecardReady ? [{ id: 'scorecard', label: 'Latest Scorecard', icon: { id: Codicon.graph.id, colorId: chartsBlue }, resource: `${resource}/scorecard` }] : [],
				completeness: 'complete',
			},
			analysis: {
				availability, title: 'Scorecard analysis', description: 'The next scheduled analysis runs on Monday at 09:00 on this computer.',
				links: [{ kind: 'action', actionId: 'analyse' }, { kind: 'automation', optionId: 'analyseScorecard' }, { kind: 'automation', optionId: 'analysisSchedule' }],
				items: [], completeness: 'complete',
			},
		},
	};
}

function expExperiment(): IArtifactFixtureData {
	const resourceId = 'a1234567-1111-4222-8333-123456789abc';
	const workspaceId = '00000000-1111-4222-8333-000000000001';
	const title = 'Faster search across large workspaces and remote repositories for Insiders';
	const availability: ArtifactAvailability = { kind: 'available', observedAt };
	const icon = { id: Codicon.play.id, colorId: chartsGreen };
	const description = `${title}: Running`;
	return {
		artifact: { id: 'fixture-exp-experiment', label: title, resource: `https://exp.microsoft.com/experiments/${resourceId}?workspaceId=${workspaceId}`, origin: { chat } },
		location: 'client',
		contribution: {
			integrationId: 'extension.ms-vscode.vscode-exp.exp', label: 'ExP',
			actions: [
				{ id: 'start', label: 'Start', iconId: Codicon.play.id, kind: 'code' },
				{ id: 'stop', label: 'Stop', iconId: Codicon.debugStop.id, kind: 'code' },
				{ id: 'analyze', label: 'Analyze', iconId: Codicon.graph.id, kind: 'prompt' },
				{ id: 'refresh', label: 'Refresh', iconId: Codicon.refresh.id, kind: 'code' },
			],
			options: [{ id: 'autoAnalyze', kind: 'boolean', label: 'Automatically Analyze in 7 Days', description: 'Send one configuration check-in to the original chat, seven days after enabling.', actionIds: ['analyze'], maxAttempts: 1, defaultValue: false }],
			configuration: { revision: 0, values: { autoAnalyze: false }, generations: {}, disablements: {} },
			view: {
				availability,
				main: { label: 'ExP a1234567', description, icon: { id: Codicon.beaker.id }, detailsId: 'main' },
				sections: [{ id: 'state', label: 'Running', description, icon, detailsId: 'state' }],
				stateActions: [
					{ id: 'stop', enabled: true },
					{ id: 'analyze', enabled: true },
				],
				generalActions: [{ id: 'refresh', enabled: true }],
				automationAvailability: [{ id: 'autoAnalyze', available: true }],
			},
		},
		details: {
			main: {
				availability, title, description: 'Compare the new workspace search index against the existing implementation for Insiders. The experiment measures whether incremental indexing improves search responsiveness across large local workspaces and remote repositories without increasing memory use.',
				facts: [{ id: 'resourceId', label: 'Resource ID', value: resourceId }, { id: 'workspaceId', label: 'Workspace ID', value: workspaceId }],
				links: [{ kind: 'action', actionId: 'refresh' }], items: [], completeness: 'complete',
			},
			state: {
				availability, title: 'Experiment state',
				description: 'Start and Stop change the experiment in ExP after confirmation. Start requires a single draft step; Stop requires a single running step.',
				facts: [{ id: 'synthetic-step', label: `${title} / Insiders rollout`, value: 'Running' }],
				links: [{ kind: 'action', actionId: 'stop' }, { kind: 'action', actionId: 'analyze' }, { kind: 'automation', optionId: 'autoAnalyze' }], items: [], completeness: 'complete',
			},
		},
	};
}

async function render(context: ComponentFixtureContext, data: IArtifactFixtureData, options: IArtifactFixtureOptions = {}): Promise<void> {
	const { container, disposableStore, theme, fileIconTheme } = context;
	const { openDetails } = options;
	const width = options.width ?? 760;
	const height = 820;
	container.classList.add('monaco-workbench');
	container.style.position = 'relative';
	container.style.boxSizing = 'border-box';
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.style.padding = 'var(--vscode-spacing-size160)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const caption = append(container, $('p', { role: 'status' }, options.compare
		? 'Existing chat pill (left) and artifact integration (right). Demo data only.'
		: 'Demo data. Actions and automation changes stay in this preview.'));
	caption.style.margin = '0 0 var(--vscode-spacing-size120)';
	caption.style.color = 'var(--vscode-descriptionForeground)';
	caption.style.fontSize = 'var(--vscode-fontSize-body2)';
	const previewOperation = (label: string) => { caption.textContent = `Preview only: ${label}`; };
	const activityChat = URI.parse('artifact-demo:/chat');
	const activeSession = new class extends mock<IActiveSession>() {
		override readonly activeChat = constObservable(new class extends mock<IChat>() { override readonly resource = activityChat; }());
	}();
	const activityWidget = new class extends mock<IChatWidget>() {
		override readonly onDidChangeViewModel = Event.None;
		override readonly viewModel = new class extends mock<IChatViewModel>() {
			override readonly sessionResource = activityChat;
			override readonly onDidChange = Event.None;
			override getItems() {
				return (data.runs ?? []).flatMap(run => {
					const receipt = run.receipt;
					if (!receipt) {
						return [];
					}
					const id = receipt.kind === 'turn' ? receipt.turnId : receipt.queuedMessageId;
					return [new class extends mock<IChatRequestViewModel>() {
						override readonly id = id;
						override readonly message = { text: run.reason, parts: [] };
					}()];
				});
			}
		}();
		override reveal(): void { previewOperation('the related chat message would be revealed.'); }
		override focus(): void { caption.tabIndex = -1; caption.focus(); }
	}();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IContextMenuService, ContextMenuService);
			registration.define(IContextViewService, ContextViewService);
			registration.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly containers = [container];
				override readonly mainContainerDimension = { width, height };
				override readonly activeContainerDimension = { width, height };
				override readonly mainContainerOffset = { top: 0, quickPickTop: options.openQuickPick ? 420 : 0 };
				override readonly activeContainerOffset = this.mainContainerOffset;
				override readonly onDidLayoutMainContainer = Event.None;
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidLayoutActiveContainer = Event.None;
				override readonly onDidAddContainer = Event.None;
				override readonly onDidChangeActiveContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
				override whenContainerStylesLoaded(): undefined { return undefined; }
				override focus(): void { container.querySelector<HTMLElement>('.chat-pill-button')?.focus(); }
			}());
			registration.define(IHoverService, HoverService);
			registration.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
				override readonly sentiment = { hidden: false };
				override readonly sentimentObs = constObservable(this.sentiment);
			}());
			registration.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override getSessionForChatResource(resource: URI) {
					return isEqual(resource, activityChat) ? { session: activeSession, chat: activeSession.activeChat.get() } : undefined;
				}
			}());
			registration.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable(activeSession);
				override async openChat(_session: ISession, _resource: URI): Promise<void> { }
			}());
			registration.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override readonly onDidAddWidget = Event.None;
				override readonly onDidRemoveWidget = Event.None;
				override getAllWidgets() { return [activityWidget]; }
				override getWidgetBySessionResource(resource: URI) { return isEqual(resource, activityChat) ? activityWidget : undefined; }
			}());
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.define(IListService, ListService);
			registration.define(IQuickInputService, QuickInputService);
			registration.defineInstance(IOpenerService, new class extends mock<IOpenerService>() {
				override async open(): Promise<boolean> {
					previewOperation('the resource was not opened.');
					return false;
				}
			}());
			registration.defineInstance(INotificationService, new class extends mock<INotificationService>() {
				override error(error: string | Error): void {
					throw new Error(String(error));
				}
			}());
		},
	});
	const input = append(container, $('div'));
	input.style.cssText = 'position:absolute;bottom:24px;left:16px;right:16px;height:100px;box-sizing:border-box;padding:12px;border:1px solid var(--vscode-input-border);border-radius:var(--vscode-cornerRadius-large);background:var(--vscode-input-background);color:var(--vscode-descriptionForeground);';
	input.textContent = 'Ask a question or describe what to build';
	const row = disposableStore.add(new ChatPillsRow('ArtifactIntegrationFixture', { compact: options.compact }));
	row.element.style.cssText = 'position:absolute;bottom:136px;left:16px;right:16px;width:auto;';
	container.appendChild(row.element);
	const controller = disposableStore.add(instantiationService.createInstance(ArtifactDetailsContextView, () => input, () => row.element, undefined));
	if (options.longContent) {
		data = {
			...data,
			details: Object.fromEntries(Object.entries(data.details).map(([id, details]) => [id, {
				...details,
				description: id === data.contribution.view.main?.detailsId ? details.description?.repeat(10) : details.description,
				items: details.items.length ? Array.from({ length: 35 }, (_, index) => ({ ...details.items[index % details.items.length], id: `item-${index}` })) : [],
			}])),
		};
	}
	const model = new FixtureArtifactModel(data);
	const presentation = disposableStore.add(instantiationService.createInstance(ArtifactIntegrationPresentation, model, () => chat, controller));
	const copyLink = disposableStore.add(new Action('fixture.copyLink', 'Copy Link', ThemeIcon.asClassName(Codicon.copy), true, async () => previewOperation('the link was not copied to your clipboard.')));
	const remove = withChatPillHoverLabel(disposableStore.add(new Action('fixture.remove', `Remove Artifact ${data.artifact.label} from Session`, ThemeIcon.asClassName(Codicon.close), true, async () => previewOperation('the artifact was not removed.'))), 'Remove Artifact');
	const entry: IChatPillEntry = {
		id: data.artifact.id, label: data.artifact.label, icon: Codicon.link, toolbarActions: [copyLink], promotedAction: remove,
		open: () => previewOperation('the resource was not opened.'),
	};
	const main = data.contribution.view.main;
	const reference = options.compare ? disposableStore.add(new Action('fixture.standardPill', main?.label ?? data.artifact.label,
		ThemeIcon.asClassName(main?.icon ?? Codicon.link), true, async () => previewOperation('the resource was not opened.'))) : undefined;
	const pills = derived(reader => {
		const decorated = presentation.decorate(entry, reader);
		if (!decorated.inlinePill) {
			throw new Error('Expected an integrated artifact pill.');
		}
		return reference ? [{ action: reference }, decorated.inlinePill] : [decorated.inlinePill];
	});
	const widget = disposableStore.add(instantiationService.createInstance(ChatPillsWidget, { pills }, { ariaLabel: 'Artifact preview' }));
	row.content.appendChild(widget.element);
	if (openDetails) {
		const sectionIndex = data.contribution.view.sections.findIndex(section => section.detailsId === openDetails);
		const button = openDetails === 'actions' ? widget.element.querySelector<HTMLElement>('.artifact-integration-pill > .chat-pill-button')
			: widget.element.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')[sectionIndex];
		if (!button) {
			throw new Error(`Missing artifact details control: ${openDetails}`);
		}
		button.click();
		await Promise.resolve();
		const detailsId = data.contribution.view.main?.detailsId;
		const expectedDetails = detailsId ? data.details[detailsId] : undefined;
		const availability = data.contribution.view.availability;
		const expectedTitle = availability.kind === 'authenticationRequired' ? data.artifact.label : expectedDetails?.title;
		const expectedContent = availability.kind === 'authenticationRequired' ? [availability.reason, 'Sign In'] : expectedDetails ? [expectedDetails.title] : undefined;
		const panel = container.querySelector('.artifact-integration-panel');
		if (!expectedTitle || !expectedContent || panel?.querySelector('h2')?.textContent !== expectedTitle
			|| expectedContent.some(text => !panel.textContent?.includes(text))) {
			throw new Error(`The artifact details did not render: ${openDetails}`);
		}
		if (options.showListInfo !== undefined) {
			const info = panel.querySelectorAll<HTMLElement>('.artifact-list-tab-info')[options.showListInfo];
			if (!info || info.hidden) {
				throw new Error('Expected a provider-supplied list description.');
			}
			info.click();
		}
		if (options.openQuickPick) {
			panel.querySelector<HTMLElement>('.artifact-autopilot-group .artifact-card-disclosure')?.click();
			const picker = panel.querySelector<HTMLElement>('.artifact-autopilot-policy');
			if (!picker) {
				throw new Error('Expected an enum automation picker.');
			}
			const quickInput = instantiationService.get(IQuickInputService);
			context.disposableStackStore.add(toDisposable(() => quickInput.currentQuickInput?.hide()));
			picker.click();
		}
	}
}

export async function renderArtifactDetails(context: ComponentFixtureContext, scenario: 'attention' | 'ready' | 'mixed' | 'narrow' | 'experiment' | 'delivery' | 'comments' | 'autopilotCollapsed' | 'autopilotExpanded' | 'narrowComments' | 'tabInfo' | 'deliveryRollouts' | 'titleHover' | 'tabFocus' | 'enumPolicy' | 'enumPolicyNarrow' | 'activitiesCollapsed' | 'activitiesExpanded' | 'activitiesNarrow'): Promise<void> {
	let data = scenario === 'experiment' ? expExperiment() : pullRequest(scenario === 'ready' ? 'ready' : 'failing');
	if (scenario === 'mixed') {
		const contribution = data.contribution;
		data = {
			...data, contribution: {
				...contribution,
				configuration: { ...contribution.configuration, values: { ...contribution.configuration.values, fixChecks: true } },
				view: {
					...contribution.view,
					automationAvailability: contribution.view.automationAvailability.map(option => option.id === 'addressComments'
						? { ...option, available: false, unavailableReason: 'Reconnect to enable comment automation.' } : option),
				},
			},
		};
	} else if (scenario === 'delivery' || scenario === 'deliveryRollouts') {
		const availability: ArtifactAvailability = { kind: 'available' };
		const resource = 'https://deployments.example.test/releases/search-index';
		data = {
			artifact: { id: 'delivery-preview', label: 'Search index release', resource, origin: { chat } },
			location: 'client',
			contribution: {
				integrationId: 'fixture.delivery', label: 'Delivery',
				configuration: { revision: 1, values: { retry: true, rollout: false, repair: false }, generations: { retry: 1 }, disablements: {} },
				actions: [
					{ id: 'retry', label: 'Retry Build', kind: 'code', iconId: 'refresh' },
					{ id: 'rollout', label: 'Continue Rollout', kind: 'code', iconId: 'play' },
					{ id: 'repair', label: 'Repair Release', kind: 'prompt', iconId: 'tools' },
				],
				options: [
					{ id: 'retry', label: 'Retry failed builds', description: 'Retry a failed build once.', kind: 'boolean', defaultValue: false, actionIds: ['retry'], maxAttempts: 1 },
					{ id: 'rollout', label: 'Continue healthy rollouts', description: 'Continue a rollout after health checks pass.', kind: 'boolean', defaultValue: false, actionIds: ['rollout'], maxAttempts: 1 },
					{ id: 'repair', label: 'Repair the release automatically', description: 'Repair build and rollout failures in the original chat.', kind: 'boolean', defaultValue: false, actionIds: ['retry', 'rollout', 'repair'], maxAttempts: 2 },
				],
				view: {
					availability, main: { label: 'Release 12', icon: { id: 'package', colorId: chartsBlue }, detailsId: 'main' },
					sections: [section('builds', '1 failed', Codicon.errorCompact, chartsRed), section('rollouts', '2/3', Codicon.cloudUpload, chartsBlue), section('health', 'Healthy', Codicon.passFilledCompact, chartsGreen)],
					lists: [{ id: 'builds', label: 'Builds', detailsId: 'builds' }, { id: 'rollouts', label: 'Rollouts', detailsId: 'rollouts' }, { id: 'health', label: 'Health', detailsId: 'health' }],
					stateActions: [{ id: 'retry', enabled: true }, { id: 'rollout', enabled: false, disabledReason: 'Waiting for a successful build.' }, { id: 'repair', enabled: true }],
					generalActions: [], automationAvailability: [{ id: 'retry', available: true }, { id: 'rollout', available: true }, { id: 'repair', available: true }],
				},
			},
			details: {
				main: { title: 'Search index release', description: 'Deploy the new index to the canary environment before expanding to production. Builds, rollout progress and health checks are independent signals.', availability, items: [], links: [], completeness: 'complete' },
				builds: {
					title: 'Builds (2)', availability, items: [
						{ id: 'canary', label: 'Canary bundle', icon: { id: 'error', colorId: chartsRed }, resource },
						{ id: 'assets', label: 'Static assets', icon: { id: 'pass', colorId: chartsGreen }, resource },
					], links: [{ kind: 'action', actionId: 'retry' }, { kind: 'action', actionId: 'repair' }, { kind: 'automation', optionId: 'retry' }, { kind: 'automation', optionId: 'repair' }], completeness: 'complete'
				},
				rollouts: {
					title: 'Rollouts (3)', availability, items: [
						{ id: 'west', label: 'West region - complete', icon: { id: 'pass', colorId: chartsGreen }, resource },
						{ id: 'east', label: 'East region - complete', icon: { id: 'pass', colorId: chartsGreen }, resource },
						{ id: 'global', label: 'Global - waiting', icon: { id: 'clock' }, resource },
					], links: [{ kind: 'action', actionId: 'rollout' }, { kind: 'action', actionId: 'repair' }, { kind: 'automation', optionId: 'rollout' }, { kind: 'automation', optionId: 'repair' }], completeness: 'complete'
				},
				health: { title: 'Health (1)', availability, items: [{ id: 'latency', label: 'Response latency normal', icon: { id: 'pass', colorId: chartsGreen }, resource }], links: [], completeness: 'complete' },
			},
		};
	}
	if (data.contribution.options.some(option => option.id === 'merge')) {
		data = {
			...data, contribution: {
				...data.contribution,
				options: data.contribution.options.map(option => option.id === 'merge' ? {
					...option, kind: 'enum', label: 'Merge Automatically When Ready', defaultValue: 'never', disabledValue: 'never',
					choices: [{ value: 'never', label: 'Off' }, { value: 'always', label: 'Always' }, { value: 'ifUnchanged', label: 'When No Changes Were Made' }],
				} : option),
				configuration: {
					...data.contribution.configuration,
					values: { ...data.contribution.configuration.values, merge: scenario === 'enumPolicy' || scenario === 'enumPolicyNarrow' ? 'ifUnchanged' : 'never' },
				},
			},
		};
	}
	if (scenario === 'activitiesCollapsed' || scenario === 'activitiesExpanded' || scenario === 'activitiesNarrow') {
		const run = (actionId: string, createdAt: number, values: Partial<ArtifactRun>): ArtifactRun => {
			const action = data.contribution.actions.find(action => action.id === actionId);
			if (!action) {
				throw new Error(`Missing preview action: ${actionId}`);
			}
			return {
				id: `${actionId}-${createdAt}`, requestId: `${actionId}-${createdAt}`,
				bindingId: artifactBindingId(authority, session, data.artifact.id, data.contribution.integrationId), integrationId: data.contribution.integrationId,
				actionId, actionKind: action.kind, actionConsent: 'preview', source: 'automation',
				state: 'completed', reason: '', createdAt, updatedAt: createdAt, dispatched: true,
				presentation: { version: 1, integrationLabel: data.contribution.label, source: 'automation', action: { label: action.label, iconId: action.iconId }, artifact: data.artifact, details: [] },
				...values,
			};
		};
		data = {
			...data, runs: [
				run('fixChecks', observedAt, { reason: 'Updated the lint configuration and fixed the failing imports.', chat: 'artifact-demo:/chat', receipt: { kind: 'turn', turnId: 'fix-checks-turn' } }),
				run('merge', observedAt + 60_000, { state: 'skipped', reason: 'Waiting for all required checks to pass.', dispatched: false }),
				run('addressComments', observedAt + 120_000, { state: 'blocked', reason: 'Waiting for the current chat turn to finish.', dispatched: false }),
				run('merge', observedAt + 180_000, { state: 'interrupted', reason: 'The connection was lost before the outcome was confirmed.', indeterminate: true }),
			]
		};
	}
	await render(context, data, {
		openDetails: scenario === 'comments' || scenario === 'narrowComments' ? 'reviews' : scenario === 'deliveryRollouts' ? 'rollouts' : 'actions',
		width: scenario === 'narrow' || scenario === 'narrowComments' || scenario === 'enumPolicyNarrow' || scenario === 'activitiesNarrow' ? 440 : 800,
	});
	if (scenario === 'activitiesExpanded' || scenario === 'activitiesNarrow') {
		const disclosure = context.container.querySelector<HTMLElement>('.artifact-activities .artifact-card-disclosure');
		if (!disclosure) {
			throw new Error('Expected an Activities disclosure.');
		}
		disclosure.click();
		await Promise.resolve();
	}
	if (scenario === 'autopilotCollapsed' || scenario === 'autopilotExpanded' || scenario === 'enumPolicy' || scenario === 'enumPolicyNarrow') {
		const disclosure = context.container.querySelector<HTMLElement>('.artifact-autopilot-group .artifact-card-disclosure');
		if (!disclosure) {
			throw new Error('Artifact details must provide an Autopilot disclosure.');
		}
		if (disclosure.getAttribute('aria-expanded') !== String(scenario !== 'autopilotCollapsed')) {
			disclosure.click();
		}
	}
	if (scenario === 'tabInfo') {
		const info = context.container.querySelectorAll<HTMLElement>('.artifact-list-tab-info')[1];
		if (!info || info.hidden) {
			throw new Error('Expected information for the inactive Comments tab.');
		}
		info.click();
	}
	if (scenario === 'titleHover') {
		const title = context.container.querySelector('.artifact-details-title-link');
		if (!title) {
			throw new Error('Expected a resource link in the artifact title.');
		}
		title.classList.add('hovered');
	}
	if (scenario === 'tabFocus') {
		const tab = context.container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
		if (!tab) {
			throw new Error('Expected a selected list tab.');
		}
		tab.classList.add('synthetic-focus');
		context.focus(tab);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/artifactIntegrations' }, {
	ExistingPillComparison: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { compare: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	SinglePartComparison: defineComponentFixture({ render: context => render(context, pullRequest('draft', { mainOnly: true }), { compare: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	CompactPillComparison: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { compare: true, compact: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	MainOnly: defineComponentFixture({ render: context => render(context, pullRequest('draft', { mainOnly: true })) }),
	PullRequestDraft: defineComponentFixture({ render: context => render(context, pullRequest('draft')) }),
	PullRequestDraftDetails: defineComponentFixture({ render: context => render(context, pullRequest('draft'), { openDetails: 'actions' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestChecksFailing: defineComponentFixture({ render: context => render(context, pullRequest('failing')), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestReadyToMerge: defineComponentFixture({ render: context => render(context, pullRequest('ready')) }),
	PullRequestMerged: defineComponentFixture({ render: context => render(context, pullRequest('merged')) }),
	Loading: defineComponentFixture({ render: context => render(context, pullRequest('loading')) }),
	AuthenticationRequired: defineComponentFixture({ render: context => render(context, pullRequest('unavailable')) }),
	PullRequestChecksDetails: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'checks' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestNarrowDetails: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'actions', width: 420 }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestCommentsInformation: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'actions', showListInfo: 1 }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestLongContent: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'actions', longContent: true }) }),
	PullRequestNarrowLongContent: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'actions', width: 420, longContent: true }) }),
	PullRequestFixRunning: defineComponentFixture({ render: context => render(context, pullRequest('failing', { autoFix: 'running' }), { openDetails: 'checks' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestActions: defineComponentFixture({ render: context => render(context, pullRequest('ready'), { openDetails: 'actions' }) }),
	PullRequestSharedAutomation: defineComponentFixture({ render: context => render(context, pullRequest('draft', { sharedLanding: true }), { openDetails: 'actions' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	AutomationPaused: defineComponentFixture({ render: context => render(context, pullRequest('failing', { autoFix: 'paused' }), { openDetails: 'checks' }) }),
	AuthenticationRequiredDetails: defineComponentFixture({ render: context => render(context, pullRequest('unavailable', { autoFix: 'on' }), { openDetails: 'actions' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ExperimentRunning: defineComponentFixture({ render: context => render(context, experiment(false)) }),
	ExperimentScorecardReady: defineComponentFixture({ render: context => render(context, experiment(true)) }),
	ExperimentScorecardDetails: defineComponentFixture({ render: context => render(context, experiment(true), { openDetails: 'scorecard' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ExperimentAnalysisSchedule: defineComponentFixture({ render: context => render(context, experiment(true), { openDetails: 'analysis' }) }),
	ExperimentAnalysisPicker: defineComponentFixture({ render: context => render(context, experiment(true), { openDetails: 'analysis', openQuickPick: true }) }),
	ExPExperimentRunning: defineComponentFixture({ render: context => render(context, expExperiment()) }),
	ExPExperimentStateDetails: defineComponentFixture({ render: context => render(context, expExperiment(), { openDetails: 'state' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ExPExperimentIdentityDetails: defineComponentFixture({ render: context => render(context, expExperiment(), { openDetails: 'actions' }) }),
});
