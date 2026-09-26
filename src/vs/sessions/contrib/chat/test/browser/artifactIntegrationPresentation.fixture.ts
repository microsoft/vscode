/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { IHoverLifecycleOptions, IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ArtifactAutomationOption, ArtifactAvailability, ArtifactContributionSnapshot, ArtifactDetails, ArtifactRecord, ArtifactRun, ArtifactSectionPresentation, ArtifactSnapshot, IArtifactDetailsModel, IArtifactModel, isArtifactOptionEnabled } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { artifactBindingId } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationStore.js';
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
import { ChatPillsRow, ChatPillsWidget, IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import '../../../../../workbench/browser/media/style.css';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ArtifactIntegrationPresentation } from '../../browser/artifactIntegrationPresentation.js';

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

	async invoke(integrationId: string, actionId: string, destination: string, requestId: string): Promise<ArtifactRun> {
		const action = this.getContribution(integrationId).actions.find(action => action.id === actionId);
		if (!action) {
			throw new Error(`Unknown preview action: ${actionId}`);
		}
		const snapshot = this.snapshot.get();
		const run: ArtifactRun = {
			id: requestId, requestId, bindingId: artifactBindingId(snapshot.authority.id, snapshot.session, snapshot.artifact.id, integrationId),
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
		: state === 'unavailable' ? { kind: 'authenticationRequired', reason: 'Sign in to refresh pull request status and enable actions.', observedAt }
			: { kind: 'available', observedAt };
	const labels: Record<PullRequestState, string> = {
		draft: 'Draft', failing: 'Changes requested', ready: 'Ready to merge', merged: 'Merged', loading: 'Loading status', unavailable: 'Sign in required',
	};
	const mainIcon = state === 'draft' ? Codicon.gitPullRequestDraft : state === 'merged' ? Codicon.gitMerge : Codicon.gitPullRequest;
	const mainColor = state === 'merged' ? chartsPurple : state === 'draft' || !available ? chartsForeground : chartsGreen;
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
		unavailable: [section('availability', 'Sign in required', Codicon.lock, chartsYellow)],
	};
	const automationOptions: readonly ArtifactAutomationOption[] = [
		{ id: 'fixChecks', kind: 'boolean', label: 'Fix automatically when checks fail', description: 'Send a repair prompt to the original chat when a check fails.', actionIds: ['fixChecks'], maxAttempts: 3, defaultValue: false },
		...sharedLanding ? [
			{ id: 'land', kind: 'boolean', label: 'Mark ready and merge automatically when checks pass', description: 'Mark the pull request ready for review, then merge it once all merge requirements are satisfied.', actionIds: ['markReady', 'merge'], maxAttempts: 1, defaultValue: false },
		] satisfies ArtifactAutomationOption[] : [
			{ id: 'markReady', kind: 'boolean', label: 'Mark ready automatically when checks pass', description: 'Mark ready after checks pass and review comments are resolved.', actionIds: ['markReady'], maxAttempts: 1, defaultValue: false },
			{ id: 'merge', kind: 'boolean', label: 'Merge automatically when ready', description: 'Merge once all merge requirements are satisfied.', actionIds: ['merge'], maxAttempts: 1, defaultValue: false },
		] satisfies ArtifactAutomationOption[],
	];
	const contribution: ArtifactContributionSnapshot = {
		integrationId, label: 'Pull request (demo)',
		actions: [
			{ id: 'markReady', label: 'Mark Ready', iconId: Codicon.gitPullRequest.id, kind: 'code' },
			{ id: 'fixChecks', label: 'Fix Failing Checks', iconId: Codicon.tools.id, kind: 'prompt' },
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
			stateActions: state === 'merged' ? [] : [
				...state === 'draft' ? [{ id: 'markReady', enabled: true }] : [],
				...state === 'failing' ? [{ id: 'fixChecks', enabled: true }, { id: 'addressComments', enabled: true }] : [],
				{
					id: 'merge', enabled: state === 'ready',
					disabledReason: state === 'ready' ? undefined : state === 'loading' ? 'Waiting for the pull request status.' : state === 'unavailable' ? 'Sign in to merge.' : 'Checks must pass and reviews must be resolved before merging.',
				},
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
			availability, title: 'Preserve keyboard focus between chats', description: 'Keep the focused control stable when a session receives new activity.',
			facts: [{ id: 'branches', label: 'Branches', value: 'fix/chat-focus into main' }],
			links: [], items: [], completeness: 'complete',
		},
		checks: {
			availability, title: 'Continuous integration', description: state === 'failing' ? '3 passed, 2 running' : undefined,
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
			availability, title: 'Review feedback', description: state === 'failing' ? 'Two threads still need attention.' : state === 'draft' ? 'Review has not started.' : 'All review threads are resolved.',
			links: state === 'failing' ? [{ kind: 'action', actionId: 'addressComments' }] : [],
			items: state === 'failing' ? [
				{ id: 'focus', label: 'Restore focus after dismissal', icon: { id: Codicon.commentDiscussion.id }, description: 'Return focus to the control that opened the details.', resource: `${resource}#discussion-focus` },
				{ id: 'coverage', label: 'Cover keyboard navigation', icon: { id: Codicon.commentDiscussion.id }, description: 'Add a regression test for switching between sections.', resource: `${resource}#discussion-coverage` },
			] : [],
			completeness: 'complete',
		},
		availability: { availability, title: 'Pull request status', description: 'The resource link remains available while integration status is unavailable.', links: [], items: [], completeness: 'complete' },
	};
	const attempts = autoFix === 'paused' ? 3 : autoFix === 'running' ? 1 : 0;
	const bindingId = artifactBindingId(authority, session, artifactId, integrationId);
	const runs = Array.from({ length: attempts }, (_, index): ArtifactRun => ({
		id: `fixture-run-${index + 1}`, requestId: `fixture-request-${index + 1}`, bindingId, actionId: 'fixChecks', actionKind: 'prompt', actionConsent: 'fixture',
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

async function render(context: ComponentFixtureContext, data: IArtifactFixtureData, options: IArtifactFixtureOptions = {}): Promise<void> {
	const { container, disposableStore, theme, fileIconTheme } = context;
	const { openDetails } = options;
	let rendering = true;
	const width = 720;
	const height = 460;
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
				override readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
				override readonly activeContainerOffset = { top: 0, quickPickTop: 0 };
				override readonly onDidLayoutMainContainer = Event.None;
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidLayoutActiveContainer = Event.None;
				override readonly onDidAddContainer = Event.None;
				override readonly onDidChangeActiveContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
				override whenContainerStylesLoaded(): undefined { return undefined; }
				override focus(): void { container.querySelector<HTMLElement>('.chat-pill-button')?.focus(); }
			}());
			registration.define(IHoverService, class extends HoverService {
				private readonly initialHover = this._register(new MutableDisposable<IHoverWidget>());

				override showDelayedHover(options: IHoverOptions, lifecycleOptions: IHoverLifecycleOptions): IHoverWidget | undefined {
					if (rendering) {
						this.initialHover.value = this.showInstantHover(options, false);
						return this.initialHover.value;
					}
					return super.showDelayedHover(options, lifecycleOptions);
				}

				override showInstantHover(options: IHoverOptions, focus?: boolean, skipLastFocusedUpdate?: boolean, dontShow?: boolean): IHoverWidget | undefined {
					return super.showInstantHover({
						...options, container,
						position: { ...options.position, hoverPosition: HoverPosition.BELOW, forcePosition: true },
						appearance: { ...options.appearance, maxHeightRatio: 1 },
					}, rendering && !context.overrideFocus ? false : focus, skipLastFocusedUpdate, dontShow);
				}
			});
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
	const model = new FixtureArtifactModel(data);
	const presentation = disposableStore.add(instantiationService.createInstance(ArtifactIntegrationPresentation, model, () => chat));
	const copyLink = disposableStore.add(new Action('fixture.copyLink', 'Copy Link', ThemeIcon.asClassName(Codicon.copy), true, async () => previewOperation('the link was not copied to your clipboard.')));
	const entry: IChatPillEntry = {
		id: data.artifact.id, label: data.artifact.label, icon: Codicon.link, toolbarActions: [copyLink],
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
	const row = disposableStore.add(new ChatPillsRow('ArtifactIntegrationFixture', { compact: options.compact }));
	row.content.appendChild(widget.element);
	container.appendChild(row.element);
	if (openDetails) {
		const sectionIndex = data.contribution.view.sections.findIndex(section => section.detailsId === openDetails);
		const button = openDetails === 'actions' ? widget.element.querySelector<HTMLElement>('.artifact-integration-pill > .chat-pill-button')
			: widget.element.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')[sectionIndex];
		if (!button) {
			throw new Error(`Missing artifact details control: ${openDetails}`);
		}
		if (openDetails === 'actions') {
			button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		} else {
			button.click();
		}
		await Promise.resolve();
		const detailsId = openDetails === 'actions' ? data.contribution.view.main?.detailsId : openDetails;
		const expectedDetails = detailsId ? data.details[detailsId] : undefined;
		const panel = container.querySelector('.artifact-integration-panel');
		if (!expectedDetails || panel?.getAttribute('aria-label') !== expectedDetails.title
			|| expectedDetails.items.some(item => !panel.textContent?.includes(item.label))) {
			throw new Error(`The artifact details did not render: ${openDetails}`);
		}
	}
	rendering = false;
}

export default defineThemedFixtureGroup({ path: 'sessions/artifactIntegrations' }, {
	ExistingPillComparison: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { compare: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	SinglePartComparison: defineComponentFixture({ render: context => render(context, pullRequest('draft', { mainOnly: true }), { compare: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	CompactPillComparison: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { compare: true, compact: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	MainOnly: defineComponentFixture({ render: context => render(context, pullRequest('draft', { mainOnly: true })) }),
	PullRequestDraft: defineComponentFixture({ render: context => render(context, pullRequest('draft')) }),
	PullRequestChecksFailing: defineComponentFixture({ render: context => render(context, pullRequest('failing')), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestReadyToMerge: defineComponentFixture({ render: context => render(context, pullRequest('ready')) }),
	PullRequestMerged: defineComponentFixture({ render: context => render(context, pullRequest('merged')) }),
	Loading: defineComponentFixture({ render: context => render(context, pullRequest('loading')) }),
	AuthenticationRequired: defineComponentFixture({ render: context => render(context, pullRequest('unavailable')) }),
	PullRequestChecksDetails: defineComponentFixture({ render: context => render(context, pullRequest('failing'), { openDetails: 'checks' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestFixRunning: defineComponentFixture({ render: context => render(context, pullRequest('failing', { autoFix: 'running' }), { openDetails: 'checks' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	PullRequestActions: defineComponentFixture({ render: context => render(context, pullRequest('ready'), { openDetails: 'actions' }) }),
	PullRequestSharedAutomation: defineComponentFixture({ render: context => render(context, pullRequest('draft', { sharedLanding: true }), { openDetails: 'actions' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	AutomationPaused: defineComponentFixture({ render: context => render(context, pullRequest('failing', { autoFix: 'paused' }), { openDetails: 'checks' }) }),
	AuthenticationRequiredDetails: defineComponentFixture({ render: context => render(context, pullRequest('unavailable', { autoFix: 'on' }), { openDetails: 'actions' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ExperimentRunning: defineComponentFixture({ render: context => render(context, experiment(false)) }),
	ExperimentScorecardReady: defineComponentFixture({ render: context => render(context, experiment(true)) }),
	ExperimentScorecardDetails: defineComponentFixture({ render: context => render(context, experiment(true), { openDetails: 'scorecard' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ExperimentAnalysisSchedule: defineComponentFixture({ render: context => render(context, experiment(true), { openDetails: 'analysis' }) }),
});
