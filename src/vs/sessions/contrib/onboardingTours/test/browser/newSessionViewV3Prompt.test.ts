/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposerService, INewSessionPromptOptionsController, NewSessionPromptOptionsState } from '../../../chat/browser/newSessionComposerService.js';
import { GitHubAuthenticationError } from '../../../github/browser/githubApiClient.js';
import { IGitHubRecentUserWork } from '../../../github/browser/fetchers/githubRecentUserWorkFetcher.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { NewSessionViewV3PromptRunner, selectNewSessionViewV3GitHubCandidate } from '../../browser/newSessionViewV3Prompt.js';
import { NEW_SESSION_VIEW_V3_TOUR_ID } from '../../browser/tours/newSessionViewV3Tour.js';

class TestAssignmentService extends NullWorkbenchAssignmentService {
	constructor(private readonly _treatments: Partial<Record<string, string>>) {
		super();
	}

	override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		return this._treatments[name] as T | undefined;
	}
}

type TestTelemetryData = { readonly [key: string]: string | number | boolean | undefined };
type TestTelemetryEvent = { readonly name: string; readonly data: TestTelemetryData | undefined };

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: TestTelemetryEvent[] = [];

	override publicLog2(name?: string, data?: object): void {
		if (name) {
			this.events.push({ name, data: data as TestTelemetryData | undefined });
		}
	}
}

class MissingFileService extends mock<IFileService>() {
	override stat(_resource: URI): ReturnType<IFileService['stat']> {
		return Promise.reject(new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND));
	}
}

type TestGitHubRequest =
	| { readonly kind: 'issues'; readonly owner: string; readonly repo: string }
	| { readonly kind: 'pullRequests'; readonly owner: string; readonly repo: string }
	| { readonly kind: 'reviews'; readonly owner: string; readonly repo: string; readonly pullRequestNumber: number }
	| { readonly kind: 'issueLinkage'; readonly owner: string; readonly repo: string; readonly issueNumbers: readonly number[] };

/** The stage duration fields, which {@link summarizeTelemetry} normalizes because they vary per run. */
const LOOKUP_DURATIONS = {
	lookupDurationMs: '<duration>',
	repositoryMs: '<duration>',
	issueSummaryMs: '<duration>',
	issueLinkageMs: '<duration>',
	prSummaryMs: '<duration>',
	prReviewMs: '<duration>',
};

/** Reported by the variations that never run a GitHub prompt-option lookup. */
const NO_LOOKUP_TELEMETRY = {
	...LOOKUP_DURATIONS,
	gitHubOptionCount: 0,
	candidatesFound: 0,
	issueSummaryOutcome: 'notRun',
	issueLinkageOutcome: 'notRun',
	prSummaryOutcome: 'notRun',
	prReviewOutcome: 'notRun',
	timedOutStage: 'none',
};

const STANDARD_OPTIONS = [
	{ title: 'Implement a feature', description: 'Describe what you want to build', icon: { id: 'lightbulb-sparkle-autofix', color: undefined } },
	{ title: 'Fix a bug', description: 'Describe the unexpected behavior', icon: { id: 'bug', color: undefined } },
	{ title: 'Fix CI', description: 'Describe a failing check or paste a link', icon: { id: 'run-errors', color: undefined } },
];

suite('NewSessionViewV3Prompt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects the newest actionable pull request and prioritizes conflicts on the same pull request', () => {
		const reviewPullRequest = pullRequest('Review', '2026-08-07T12:00:00Z', undefined, '2026-08-07T09:00:00Z', '2026-08-07T10:00:00Z');
		const recentFailure = pullRequest('Recent failure', '2026-08-07T11:00:00Z', 'FAILURE');
		const olderFailure = pullRequest('Older failure', '2026-08-07T10:00:00Z', 'ERROR');
		const conflictedFailure = pullRequest('Conflicted failure', '2026-08-07T13:00:00Z', 'FAILURE', undefined, undefined, 2, true);
		const recentIssue = issue('Recent issue', '2026-08-07T13:00:00Z');
		const olderIssue = issue('Older issue', '2026-08-07T08:00:00Z');

		assert.deepStrictEqual({
			conflict: selectNewSessionViewV3GitHubCandidate({ pullRequests: [recentFailure, conflictedFailure], issues: [] }),
			reviewOverCi: selectNewSessionViewV3GitHubCandidate({ pullRequests: [olderFailure, reviewPullRequest, recentFailure], issues: [recentIssue] }),
			review: selectNewSessionViewV3GitHubCandidate({ pullRequests: [reviewPullRequest], issues: [recentIssue] }),
			issue: selectNewSessionViewV3GitHubCandidate({ pullRequests: [], issues: [olderIssue, recentIssue] }),
			none: selectNewSessionViewV3GitHubCandidate({ pullRequests: [pullRequest('Addressed', '2026-08-07T14:00:00Z', undefined, '2026-08-07T11:00:00Z', '2026-08-07T10:00:00Z')], issues: [] }),
		}, {
			conflict: { number: 2, title: 'Conflicted failure', url: 'https://github.com/o/r/pull/Conflicted%20failure', strategy: 'githubMergeConflict' },
			reviewOverCi: { number: 1, title: 'Review', url: 'https://github.com/o/r/pull/Review', strategy: 'githubReviewComments' },
			review: { number: 1, title: 'Review', url: 'https://github.com/o/r/pull/Review', strategy: 'githubReviewComments' },
			issue: { number: 1, title: 'Recent issue', url: 'https://github.com/o/r/issues/Recent%20issue', strategy: 'githubIssue' },
			none: undefined,
		});
	});

	test('uses prompt treatments only as a complete pair and permits literal prompts', async () => {
		const complete = await runPrompt({
			'onb.newSessionViewV3.variation': 'prompt',
			'onb.newSessionViewV3.promptTemplate': 'Inspect this project and suggest the next task.',
			'onb.newSessionViewV3.placeholder': '[custom task]',
		});
		const incomplete = await runPrompt({
			'onb.newSessionViewV3.variation': 'prompt',
			'onb.newSessionViewV3.promptTemplate': 'Please complete {0}.',
		});

		assert.deepStrictEqual({
			complete: complete.animation,
			incomplete: incomplete.animation,
		}, {
			complete: { prompt: 'Inspect this project and suggest the next task.', durationMs: 2_500, placeholder: '[custom task]' },
			incomplete: {
				prompt: 'Help me complete [describe the coding task] in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.',
				durationMs: 2_500,
				placeholder: '[describe the coding task]',
			},
		});
	});

	test('uses prompt options as the default variation', async () => {
		const result = await runPrompt({});

		assert.deepStrictEqual({
			animation: result.animation,
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			animation: undefined,
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'noCandidate',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 0,
					candidatesFound: 0,
					issueSummaryOutcome: 'success',
					issueLinkageOutcome: 'skipped',
					prSummaryOutcome: 'success',
					prReviewOutcome: 'skipped',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('uses concise task-specific standard prompts', async () => {
		const result = await runPrompt({});
		const resolvedState = result.promptOptionStates.find(state => state.kind === 'resolved');

		assert.deepStrictEqual(resolvedState?.options.map(option => ({
			prompt: option.prompt,
			placeholder: option.placeholder,
		})), [
			{
				prompt: 'Help me implement [describe the feature] in this project. Ask me questions if anything is unclear regarding the intended behaviour.',
				placeholder: '[describe the feature]',
			},
			{
				prompt: 'Help me fix [describe the bug] in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.',
				placeholder: '[describe the bug]',
			},
			{
				prompt: 'Help me fix the failing CI for [describe the CI failure or paste a link] in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.',
				placeholder: '[describe the CI failure or paste a link]',
			},
		]);
	});

	test('developer override selects a GitHub CI prompt and reports telemetry', async () => {
		const result = await runPrompt({
			'onb.newSessionViewV3.variation': 'prompt',
		}, {
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: true },
			[ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: 'githubPrompt' },
		}, {
			pullRequests: [pullRequest('Fix CI', '2026-08-07T12:00:00Z', 'FAILURE')],
			issues: [],
		});

		assert.deepStrictEqual({
			animation: result.animation,
			telemetry: result.telemetry,
		}, {
			animation: {
				prompt: 'The following pull request has failing CI checks: "Fix CI" (https://github.com/o/r/pull/Fix%20CI). Investigate the failures and resolve them.',
				durationMs: 2_500,
				placeholder: '',
			},
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'githubPrompt',
					effectiveStrategy: 'githubCiFailure',
					fallbackReason: 'none',
					shown: true,
					...NO_LOOKUP_TELEMETRY,
				},
			}],
		});
	});

	test('developer override classifies a conflicted PR separately from failing CI', async () => {
		const result = await runPrompt({
			'onb.newSessionViewV3.variation': 'prompt',
		}, {
			[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: true },
			[ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { [NEW_SESSION_VIEW_V3_TOUR_ID]: 'githubPrompt' },
		}, {
			pullRequests: [pullRequest('Resolve me', '2026-08-07T12:00:00Z', 'FAILURE', undefined, undefined, 42, true)],
			issues: [],
		});

		assert.deepStrictEqual({
			animation: result.animation,
			telemetry: result.telemetry,
		}, {
			animation: {
				prompt: 'The following pull request has merge conflicts: "Resolve me" (https://github.com/o/r/pull/Resolve%20me). Resolve the conflicts and update the pull request.',
				durationMs: 2_500,
				placeholder: '',
			},
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'githubPrompt',
					effectiveStrategy: 'githubMergeConflict',
					fallbackReason: 'none',
					shown: true,
					...NO_LOOKUP_TELEMETRY,
				},
			}],
		});
	});

	test('falls back to the prompt variation when silent GitHub authentication is unavailable', async () => {
		const result = await runPrompt({
			'onb.newSessionViewV3.variation': 'githubPrompt',
		}, {}, new GitHubAuthenticationError());

		assert.deepStrictEqual({
			animation: result.animation,
			telemetry: result.telemetry,
		}, {
			animation: {
				prompt: 'Help me complete [describe the coding task] in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.',
				durationMs: 2_500,
				placeholder: '[describe the coding task]',
			},
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'githubPrompt',
					effectiveStrategy: 'prompt',
					fallbackReason: 'noAuthentication',
					shown: true,
					...NO_LOOKUP_TELEMETRY,
				},
			}],
		});
	});

	test('shows loading skeletons and resolves issue-first GitHub prompt options', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{
				issues: [
					issue('Older assigned issue', '2026-08-07T11:00:00Z', 12),
					issue('Newest assigned issue', '2026-08-07T14:00:00Z', 14),
					issue('Third assigned issue', '2026-08-07T10:00:00Z', 10),
				],
				pullRequests: [
					pullRequest('Conflicted PR', '2026-08-07T14:30:00Z', 'FAILURE', undefined, undefined, 20, true),
					pullRequest('CI is failing', '2026-08-07T13:00:00Z', 'FAILURE', undefined, undefined, 21),
					pullRequest('Review feedback', '2026-08-07T12:00:00Z', undefined, '2026-08-07T09:00:00Z', '2026-08-07T10:00:00Z', 22),
				],
			},
		);

		assert.deepStrictEqual({
			animation: result.animation,
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			animation: undefined,
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{
					kind: 'resolved',
					options: [
						{ title: 'Tackle issue #14', description: 'Newest assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						{ title: 'Tackle issue #12', description: 'Older assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						STANDARD_OPTIONS[0],
					],
				},
				{
					kind: 'resolved',
					options: [
						{ title: 'Tackle issue #14', description: 'Newest assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						{ title: 'Tackle issue #12', description: 'Older assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						{ title: 'Resolve conflicts #20', description: 'Conflicted PR', icon: { id: 'git-pull-request-error', color: 'charts.orange' } },
					],
				},
				{
					kind: 'resolved',
					options: [
						{ title: 'Tackle issue #14', description: 'Newest assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						{ title: 'Tackle issue #12', description: 'Older assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						{ title: 'Resolve conflicts #20', description: 'Conflicted PR', icon: { id: 'git-pull-request-error', color: 'charts.orange' } },
					],
				},
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'none',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 3,
					candidatesFound: 4,
					issueSummaryOutcome: 'success',
					issueLinkageOutcome: 'success',
					prSummaryOutcome: 'success',
					prReviewOutcome: 'skipped',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('reports privacy-safe prompt option selections and closure', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{
				issues: [issue('Private issue title', '2026-08-07T14:00:00Z', 14)],
				pullRequests: [
					pullRequest('Private CI title', '2026-08-07T13:00:00Z', 'FAILURE', undefined, undefined, 21),
					pullRequest('Private review title', '2026-08-07T12:00:00Z', undefined, '2026-08-07T09:00:00Z', '2026-08-07T10:00:00Z', 22),
				],
			},
			{ promptOptionInteractions: [0, 1, 2, 'close'] },
		);

		assert.deepStrictEqual(result.telemetry.filter(event => event.name === 'onboarding.promptOptionInteraction'), [
			{
				name: 'onboarding.promptOptionInteraction',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					interaction: 'selected',
					option: 'githubIssue',
					optionIndex: 0,
					optionKindsShown: 'githubIssue,githubPRCI,githubPRComments',
				},
			},
			{
				name: 'onboarding.promptOptionInteraction',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					interaction: 'selected',
					option: 'githubPRCI',
					optionIndex: 1,
					optionKindsShown: 'githubIssue,githubPRCI,githubPRComments',
				},
			},
			{
				name: 'onboarding.promptOptionInteraction',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					interaction: 'selected',
					option: 'githubPRComments',
					optionIndex: 2,
					optionKindsShown: 'githubIssue,githubPRCI,githubPRComments',
				},
			},
			{
				name: 'onboarding.promptOptionInteraction',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					interaction: 'closed',
					option: 'none',
					optionIndex: -1,
					optionKindsShown: 'githubIssue,githubPRCI,githubPRComments',
				},
			},
		]);
	});

	test('joins the strategy and interaction events of one impression', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [issue('Ready issue', '2026-08-07T13:00:00Z', 7)] },
			{ promptOptionInteractions: [0, 'close'] },
		);
		const impressionIds = getImpressionIds(result.rawTelemetry);

		assert.deepStrictEqual({
			eventNames: result.rawTelemetry.map(event => event.name),
			sharedImpressionIds: new Set(impressionIds).size,
			isGuid: /^[0-9a-f-]{36}$/.test(impressionIds[0]),
		}, {
			eventNames: ['onboarding.promptStrategy', 'onboarding.promptOptionInteraction', 'onboarding.promptOptionInteraction'],
			sharedImpressionIds: 1,
			isGuid: true,
		});
	});

	test('fills missing prompt options from the fixed standard order after a partial timeout', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [issue('Ready issue', '2026-08-07T13:00:00Z', 7)] },
			{ pullRequestLookupNeverResolves: true },
		);

		assert.deepStrictEqual({
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{
					kind: 'resolved',
					options: [
						{ title: 'Tackle issue #7', description: 'Ready issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						STANDARD_OPTIONS[0],
						STANDARD_OPTIONS[1],
					],
				},
				{
					kind: 'resolved',
					options: [
						{ title: 'Tackle issue #7', description: 'Ready issue', icon: { id: 'issue-opened', color: 'charts.green' } },
						STANDARD_OPTIONS[0],
						STANDARD_OPTIONS[1],
					],
				},
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'timeout',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 1,
					candidatesFound: 1,
					issueSummaryOutcome: 'success',
					issueLinkageOutcome: 'success',
					prSummaryOutcome: 'timeout',
					prReviewOutcome: 'notRun',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('renders standard prompt options before the GitHub lookup and streams partial results into their slots', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{
				issues: [issue('Assigned issue', '2026-08-07T14:00:00Z', 14)],
				pullRequests: [
					pullRequest('CI is failing', '2026-08-07T13:00:00Z', 'FAILURE', undefined, undefined, 21),
					pullRequest('Awaiting review threads', '2026-08-07T12:00:00Z', undefined, '2026-08-07T09:00:00Z', '2026-08-07T10:00:00Z', 22),
				],
			},
			{ reviewLookupNeverResolves: true },
		);
		const issueOption = { title: 'Tackle issue #14', description: 'Assigned issue', icon: { id: 'issue-opened', color: 'charts.green' } };
		const ciOption = { title: 'Fix CI #21', description: 'CI is failing', icon: { id: 'git-pull-request-error', color: 'charts.orange' } };

		assert.deepStrictEqual({
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{ kind: 'resolved', options: [issueOption, STANDARD_OPTIONS[0], STANDARD_OPTIONS[1]] },
				{ kind: 'resolved', options: [issueOption, ciOption, STANDARD_OPTIONS[0]] },
				{ kind: 'resolved', options: [issueOption, ciOption, STANDARD_OPTIONS[0]] },
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'timeout',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 2,
					candidatesFound: 2,
					issueSummaryOutcome: 'success',
					issueLinkageOutcome: 'success',
					prSummaryOutcome: 'success',
					prReviewOutcome: 'timeout',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('repaints standard prompt options when the composer resolves again after a workspace change', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [] },
			{ refreshPromptOptionsAgain: true },
		);

		assert.deepStrictEqual(summarizePromptOptionStates(result.promptOptionStates), [
			{ kind: 'loading' },
			{ kind: 'resolved', options: STANDARD_OPTIONS },
			{ kind: 'resolved', options: STANDARD_OPTIONS },
			{ kind: 'loading' },
			{ kind: 'resolved', options: STANDARD_OPTIONS },
			{ kind: 'resolved', options: STANDARD_OPTIONS },
		]);
	});

	test('reports the options the composer rendered when it refuses later updates', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [issue('Assigned issue', '2026-08-07T14:00:00Z', 14)] },
			{ suppressPromptOptionUpdatesAfter: 1, promptOptionInteractions: [0] },
		);

		assert.deepStrictEqual({
			states: summarizePromptOptionStates(result.promptOptionStates),
			interaction: result.telemetry.filter(event => event.name === 'onboarding.promptOptionInteraction'),
		}, {
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
			],
			interaction: [{
				name: 'onboarding.promptOptionInteraction',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					interaction: 'selected',
					option: 'implementFeature',
					optionIndex: 0,
					optionKindsShown: 'implementFeature,fixBug,fixCI',
				},
			}],
		});
	});

	test('publishes assigned issues before the linkage lookup can hide them', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [issue('Unknown linkage', '2026-08-07T13:00:00Z', 9)] },
			{ issueLinkageLookupNeverResolves: true },
		);
		const issueOption = { title: 'Tackle issue #9', description: 'Unknown linkage', icon: { id: 'issue-opened', color: 'charts.green' } };

		assert.deepStrictEqual({
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{ kind: 'resolved', options: [issueOption, STANDARD_OPTIONS[0], STANDARD_OPTIONS[1]] },
				{ kind: 'resolved', options: [issueOption, STANDARD_OPTIONS[0], STANDARD_OPTIONS[1]] },
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'noCandidate',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 1,
					candidatesFound: 1,
					issueSummaryOutcome: 'success',
					issueLinkageOutcome: 'timeout',
					prSummaryOutcome: 'success',
					prReviewOutcome: 'skipped',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('reports the stage that consumed the total lookup budget', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			{ pullRequests: [], issues: [issue('Ready issue', '2026-08-07T13:00:00Z', 7)] },
			{ pullRequestLookupNeverResolves: true, totalMs: 10, summaryMs: 30 },
		);
		// Let the pull request lookup that outlived the total budget unwind and dispose its sources.
		await timeout(80);

		assert.deepStrictEqual(result.telemetry, [{
			name: 'onboarding.promptStrategy',
			data: {
				scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
				impressionId: '<impressionId>',
				configuredVariation: 'options',
				effectiveStrategy: 'options',
				fallbackReason: 'timeout',
				shown: true,
				...LOOKUP_DURATIONS,
				gitHubOptionCount: 1,
				candidatesFound: 1,
				issueSummaryOutcome: 'success',
				issueLinkageOutcome: 'success',
				prSummaryOutcome: 'notRun',
				prReviewOutcome: 'notRun',
				timedOutStage: 'prSummary',
			},
		}]);
	});

	test('uses all standard prompt options when GitHub authentication is unavailable', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'options' },
			{},
			new GitHubAuthenticationError(),
		);

		assert.deepStrictEqual({
			states: summarizePromptOptionStates(result.promptOptionStates),
			telemetry: result.telemetry,
		}, {
			states: [
				{ kind: 'loading' },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
				{ kind: 'resolved', options: STANDARD_OPTIONS },
			],
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'options',
					effectiveStrategy: 'options',
					fallbackReason: 'noAuthentication',
					shown: true,
					...LOOKUP_DURATIONS,
					gitHubOptionCount: 0,
					candidatesFound: 0,
					issueSummaryOutcome: 'noAuthentication',
					issueLinkageOutcome: 'skipped',
					prSummaryOutcome: 'noAuthentication',
					prReviewOutcome: 'notRun',
					timedOutStage: 'none',
				},
			}],
		});
	});

	test('uses an issue when the pull request summary lookup times out', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Ready issue', '2026-08-07T13:00:00Z')] },
			{ pullRequestLookupNeverResolves: true },
		);

		assert.deepStrictEqual({
			animation: result.animation,
			telemetry: result.telemetry,
		}, {
			animation: {
				prompt: 'Tackle the following issue and create a pull request for it: "Ready issue" (https://github.com/o/r/issues/Ready%20issue).',
				durationMs: 2_500,
				placeholder: '',
			},
			telemetry: [{
				name: 'onboarding.promptStrategy',
				data: {
					scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
					impressionId: '<impressionId>',
					configuredVariation: 'githubPrompt',
					effectiveStrategy: 'githubIssue',
					fallbackReason: 'none',
					shown: true,
					...NO_LOOKUP_TELEMETRY,
				},
			}],
		});
	});

	test('uses an assigned issue when its pull request linkage lookup times out', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Unknown linkage', '2026-08-07T13:00:00Z')] },
			{ issueLinkageLookupNeverResolves: true },
		);

		assert.deepStrictEqual(result.animation, {
			prompt: 'Tackle the following issue and create a pull request for it: "Unknown linkage" (https://github.com/o/r/issues/Unknown%20linkage).',
			durationMs: 2_500,
			placeholder: '',
		});
	});

	test('resolves the repository from a cloud GitHub workspace URI', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Cloud issue', '2026-08-07T13:00:00Z')] },
			{
				workspaceUri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/cloud/repository/HEAD' }),
				includeGitHubInfo: false,
			},
		);

		assert.deepStrictEqual({
			animation: result.animation,
			gitHubRequests: result.gitHubRequests,
		}, {
			animation: {
				prompt: 'Tackle the following issue and create a pull request for it: "Cloud issue" (https://github.com/o/r/issues/Cloud%20issue).',
				durationMs: 2_500,
				placeholder: '',
			},
			gitHubRequests: [
				{ kind: 'issues', owner: 'cloud', repo: 'repository' },
				{ kind: 'pullRequests', owner: 'cloud', repo: 'repository' },
				{ kind: 'issueLinkage', owner: 'cloud', repo: 'repository', issueNumbers: [1] },
			],
		});
	});

	test('resolves the repository from a local GitHub remote', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Local issue', '2026-08-07T13:00:00Z')] },
			{
				includeGitHubInfo: false,
				gitRemoteUrl: 'git@github.com:local/repository.git',
			},
		);

		assert.deepStrictEqual(result.gitHubRequests, [
			{ kind: 'issues', owner: 'local', repo: 'repository' },
			{ kind: 'pullRequests', owner: 'local', repo: 'repository' },
			{ kind: 'issueLinkage', owner: 'local', repo: 'repository', issueNumbers: [1] },
		]);
	});

	test('resolves the repository from a configured GitHub Enterprise remote', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Enterprise issue', '2026-08-07T13:00:00Z', 7)] },
			{
				includeGitHubInfo: false,
				gitRemoteUrl: 'git@ghe.example.com:enterprise/project.git',
				enterpriseHost: 'ghe.example.com',
			},
		);

		assert.deepStrictEqual(result.gitHubRequests, [
			{ kind: 'issues', owner: 'enterprise', repo: 'project' },
			{ kind: 'pullRequests', owner: 'enterprise', repo: 'project' },
			{ kind: 'issueLinkage', owner: 'enterprise', repo: 'project', issueNumbers: [7] },
		]);
	});

	test('does not query hostless metadata or github.com remotes through GitHub Enterprise', async () => {
		const result = await runPrompt(
			{ 'onb.newSessionViewV3.variation': 'githubPrompt' },
			{},
			{ pullRequests: [], issues: [issue('Public issue', '2026-08-07T13:00:00Z')] },
			{
				gitRemoteUrl: 'git@github.com:public/project.git',
				enterpriseHost: 'ghe.example.com',
			},
		);

		assert.deepStrictEqual(result.gitHubRequests, []);
	});

	test('waits for Agent Host git metadata instead of requiring the Git extension', async () => {
		const workspace = observableValue('workspace', createWorkspace(URI.file('C:\\repo'), 'r', false));
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly providerId = 'local-agent-host';
			override readonly sessionType = 'copilotcli';
			override readonly isCreated = constObservable(false);
			override readonly workspace = workspace;
		}();
		let gitServiceCalled = false;
		let prompt: string | undefined;
		const runner = new NewSessionViewV3PromptRunner(
			new TestAssignmentService({ 'onb.newSessionViewV3.variation': 'githubPrompt' }),
			new TestConfigurationService(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
			}(),
			new class extends mock<INewSessionComposerService>() {
				override readonly activeComposer = constObservable({
					animatePrompt: async (text: string) => {
						prompt = text;
						return true;
					},
					showPromptOptions: () => true,
				});
			}(),
			new class extends mock<IGitService>() {
				override async openRepository(): Promise<IGitRepository | undefined> {
					gitServiceCalled = true;
					return undefined;
				}
			}(),
			new MissingFileService(),
			new class extends mock<IGitHubService>() {
				override async getRecentAssignedIssues() {
					return [issue('Metadata issue', '2026-08-07T14:00:00Z')];
				}
				override async getRecentAuthoredPullRequests() { return []; }
				override async getPullRequestReviewThreads() { return []; }
				override async getIssuesWithLinkedPullRequests() { return new Set<number>(); }
			}(),
			new TestTelemetryService(),
			new NullLogService(),
			{ totalMs: 1_000, summaryMs: 100, linkageMs: 100, reviewMs: 100 },
		);

		const run = runner.run(CancellationToken.None);
		await timeout(0);
		workspace.set(createWorkspace(URI.file('C:\\repo'), 'r', true), undefined);
		await run;

		assert.deepStrictEqual({
			gitServiceCalled,
			prompt,
		}, {
			gitServiceCalled: false,
			prompt: 'Tackle the following issue and create a pull request for it: "Metadata issue" (https://github.com/o/r/issues/Metadata%20issue).',
		});
	});

	test('discards a result when the selected workspace changes during the request', async () => {
		const firstWorkspace = createWorkspace(URI.file('C:\\first'), 'first');
		const secondWorkspace = createWorkspace(URI.file('C:\\second'), 'second');
		const firstSession = createSession(firstWorkspace);
		const secondSession = createSession(secondWorkspace);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', firstSession);
		const requests: { owner: string; repo: string }[] = [];
		let prompt: string | undefined;
		const runner = new NewSessionViewV3PromptRunner(
			new TestAssignmentService({ 'onb.newSessionViewV3.variation': 'githubPrompt' }),
			new TestConfigurationService(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
			}(),
			new class extends mock<INewSessionComposerService>() {
				override readonly activeComposer = constObservable({
					animatePrompt: async (text: string) => {
						prompt = text;
						return true;
					},
					showPromptOptions: () => true,
				});
			}(),
			new class extends mock<IGitService>() { }(),
			new MissingFileService(),
			new class extends mock<IGitHubService>() {
				override async getRecentAssignedIssues(_owner: string, repo: string) {
					return [issue(repo === 'first' ? 'Stale issue' : 'Current issue', '2026-08-07T14:00:00Z')];
				}
				override async getRecentAuthoredPullRequests(owner: string, repo: string) {
					requests.push({ owner, repo });
					if (requests.length === 1) {
						activeSession.set(secondSession, undefined);
					}
					return [];
				}
				override async getPullRequestReviewThreads() {
					return [];
				}
				override async getIssuesWithLinkedPullRequests() {
					return new Set<number>();
				}
			}(),
			new TestTelemetryService(),
			new NullLogService(),
		);

		await runner.run(CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			prompt,
		}, {
			requests: [{ owner: 'o', repo: 'first' }, { owner: 'o', repo: 'second' }],
			prompt: 'Tackle the following issue and create a pull request for it: "Current issue" (https://github.com/o/r/issues/Current%20issue).',
		});
	});
});

async function runPrompt(
	treatments: Partial<Record<string, string>>,
	configuration: Record<string, object> = {},
	gitHubResult: IGitHubRecentUserWork | Error = { pullRequests: [], issues: [] },
	options: {
		readonly workspaceUri?: URI;
		readonly includeGitHubInfo?: boolean;
		readonly gitRemoteUrl?: string;
		readonly enterpriseHost?: string;
		readonly pullRequestLookupNeverResolves?: boolean;
		readonly issueLinkageLookupNeverResolves?: boolean;
		readonly reviewLookupNeverResolves?: boolean;
		readonly totalMs?: number;
		readonly summaryMs?: number;
		readonly suppressPromptOptionUpdatesAfter?: number;
		readonly refreshPromptOptionsAgain?: boolean;
		readonly promptOptionInteractions?: readonly (number | 'close')[];
	} = {},
): Promise<{
	readonly animation: { readonly prompt: string; readonly durationMs: number; readonly placeholder: string } | undefined;
	readonly promptOptionStates: readonly NewSessionPromptOptionsState[];
	readonly telemetry: readonly TestTelemetryEvent[];
	readonly rawTelemetry: readonly TestTelemetryEvent[];
	readonly gitHubRequests: readonly TestGitHubRequest[];
}> {
	let animation: { prompt: string; durationMs: number; placeholder: string } | undefined;
	const promptOptionStates: NewSessionPromptOptionsState[] = [];
	let promptOptionsController: INewSessionPromptOptionsController | undefined;
	let acceptedUpdates = 0;
	// Mimics the composer refusing late updates once the user acts on the options on screen.
	const suppressUpdate = () => options.suppressPromptOptionUpdatesAfter !== undefined
		&& acceptedUpdates >= options.suppressPromptOptionUpdatesAfter;
	const workspaceUri = options.workspaceUri ?? URI.file('C:\\repo');
	const workspace = createWorkspace(workspaceUri, 'r', options.includeGitHubInfo !== false);
	const activeSession = createSession(workspace);
	const sessionsService = new class extends mock<ISessionsService>() {
		override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
	}();
	const composerService = new class extends mock<INewSessionComposerService>() {
		override readonly activeComposer = constObservable({
			animatePrompt: async (prompt: string, durationMs: number, placeholder: string) => {
				animation = { prompt, durationMs, placeholder };
				return true;
			},
			showPromptOptions: (state: NewSessionPromptOptionsState | undefined) => {
				if (state) {
					promptOptionStates.push(state);
				}
				return true;
			},
			setPromptOptionsController: (controller: INewSessionPromptOptionsController) => promptOptionsController = controller,
			refreshPromptOptions: async (token: CancellationToken) => {
				const controller = promptOptionsController;
				if (!controller) {
					return false;
				}
				promptOptionStates.push({ kind: 'loading' });
				const state = await controller.resolve(token, progressState => {
					if (suppressUpdate()) {
						return false;
					}
					acceptedUpdates++;
					promptOptionStates.push(progressState);
					return true;
				});
				if (!suppressUpdate()) {
					promptOptionStates.push(state);
				}
				return true;
			},
		});
	}();
	const gitHubService = new class extends mock<IGitHubService>() {
		readonly requests: TestGitHubRequest[] = [];
		override readonly enterpriseHost = options.enterpriseHost;
		override async getRecentAssignedIssues(owner: string, repo: string) {
			this.requests.push({ kind: 'issues', owner, repo });
			if (gitHubResult instanceof Error) {
				throw gitHubResult;
			}
			return gitHubResult.issues;
		}
		override async getRecentAuthoredPullRequests(owner: string, repo: string) {
			this.requests.push({ kind: 'pullRequests', owner, repo });
			if (options.pullRequestLookupNeverResolves) {
				return new Promise<never>(() => { });
			}
			if (gitHubResult instanceof Error) {
				throw gitHubResult;
			}
			return gitHubResult.pullRequests;
		}
		override async getPullRequestReviewThreads(owner: string, repo: string, pullRequestNumber: number) {
			this.requests.push({ kind: 'reviews', owner, repo, pullRequestNumber });
			if (options.reviewLookupNeverResolves) {
				return new Promise<never>(() => { });
			}
			if (gitHubResult instanceof Error) {
				throw gitHubResult;
			}
			return gitHubResult.pullRequests.find(pullRequest => pullRequest.number === pullRequestNumber)?.reviewThreads ?? [];
		}
		override async getIssuesWithLinkedPullRequests(owner: string, repo: string, issueNumbers: readonly number[]) {
			this.requests.push({ kind: 'issueLinkage', owner, repo, issueNumbers });
			if (options.issueLinkageLookupNeverResolves) {
				return new Promise<never>(() => { });
			}
			return new Set<number>();
		}
	}();
	const telemetryService = new TestTelemetryService();
	const gitService = new class extends mock<IGitService>() {
		override async openRepository(): Promise<IGitRepository | undefined> {
			if (!options.gitRemoteUrl) {
				return undefined;
			}
			return new class extends mock<IGitRepository>() {
				override readonly rootUri = workspaceUri;
				override readonly state = constObservable({
					remotes: [{ name: 'origin', fetchUrl: options.gitRemoteUrl, isReadOnly: false }],
					mergeChanges: [],
					indexChanges: [],
					workingTreeChanges: [],
					untrackedChanges: [],
				});
			}();
		}
	}();
	const runner = new NewSessionViewV3PromptRunner(
		new TestAssignmentService(treatments) as IWorkbenchAssignmentService,
		new TestConfigurationService(configuration),
		sessionsService,
		composerService,
		gitService,
		new MissingFileService(),
		gitHubService,
		telemetryService,
		new NullLogService(),
		{ totalMs: options.totalMs ?? 100, summaryMs: options.summaryMs ?? 20, linkageMs: 20, reviewMs: 20 },
	);

	await runner.run(CancellationToken.None);
	if (options.refreshPromptOptionsAgain) {
		// The composer resolves again on refresh, for example when the selected workspace changes.
		await composerService.activeComposer.get().refreshPromptOptions(CancellationToken.None);
	}
	if (options.promptOptionInteractions?.length) {
		const controller = promptOptionsController;
		const resolvedState = [...promptOptionStates].reverse().find(state => state.kind === 'resolved');
		if (!controller || !resolvedState) {
			throw new Error('Prompt option interactions require resolved prompt options.');
		}
		for (const interaction of options.promptOptionInteractions) {
			if (interaction === 'close') {
				controller.onDidClose();
				continue;
			}
			const option = resolvedState.options[interaction];
			if (!option) {
				throw new Error(`Prompt option ${interaction} was not resolved.`);
			}
			controller.onDidSelectOption(option);
		}
	}
	return { animation, promptOptionStates, telemetry: summarizeTelemetry(telemetryService.events), rawTelemetry: telemetryService.events, gitHubRequests: gitHubService.requests };
}

function pullRequest(title: string, updatedAt: string, statusCheckRollupState?: string, latestCommitAt?: string, latestCommentAt?: string, number = 1, hasMergeConflicts = false) {
	return {
		number,
		title,
		url: `https://github.com/o/r/pull/${encodeURIComponent(title)}`,
		updatedAt,
		hasMergeConflicts,
		statusCheckRollupState,
		latestCommitAt,
		reviewThreads: latestCommentAt ? [{ isResolved: false, latestCommentAt }] : [],
	};
}

function issue(title: string, updatedAt: string, number = 1) {
	return {
		number,
		title,
		url: `https://github.com/o/r/issues/${encodeURIComponent(title)}`,
		updatedAt,
	};
}

function createWorkspace(uri: URI, repo: string, includeGitHubInfo = true): ISessionWorkspace {
	return {
		uri,
		label: repo,
		icon: Codicon.repo,
		folders: [{
			root: uri,
			workingDirectory: uri,
			name: repo,
			description: undefined,
			gitRepository: {
				uri,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable(includeGitHubInfo ? { owner: 'o', repo } : undefined),
			},
		}],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: uri.scheme === GITHUB_REMOTE_FILE_SCHEME,
	};
}

function createSession(workspace: ISessionWorkspace): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly providerId = 'test';
		override readonly sessionType = 'test';
		override readonly isCreated = constObservable(false);
		override readonly workspace = constObservable(workspace);
	}();
}

function summarizePromptOptionStates(states: readonly NewSessionPromptOptionsState[]): object[] {
	return states.map(state => state.kind === 'loading'
		? { kind: state.kind }
		: {
			kind: state.kind,
			options: state.options.map(option => ({
				title: option.titleDetail ? `${option.title} ${option.titleDetail}` : option.title,
				description: option.description,
				icon: option.icon ? { id: option.icon.id, color: option.icon.color?.id } : undefined,
			})),
		});
}

/** Replaces the values that legitimately vary between runs so telemetry can be asserted as a snapshot. */
function summarizeTelemetry(events: readonly TestTelemetryEvent[]): TestTelemetryEvent[] {
	return events.map(event => ({
		name: event.name,
		data: event.data && Object.fromEntries(Object.entries(event.data).map(([key, value]) => {
			if (key === 'impressionId') {
				return [key, typeof value === 'string' && value.length > 0 ? '<impressionId>' : value];
			}
			if (key.endsWith('Ms') && typeof value === 'number') {
				return [key, '<duration>'];
			}
			return [key, value];
		})),
	}));
}

function getImpressionIds(events: readonly TestTelemetryEvent[]): string[] {
	return events.map(event => String(event.data?.impressionId ?? ''));
}
