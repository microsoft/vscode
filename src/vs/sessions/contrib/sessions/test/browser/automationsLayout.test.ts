/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { IAction } from '../../../../../base/common/actions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { IAutomationDescriptor, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionArtifact, SessionArtifactKind } from '../../../../../workbench/services/sessions/common/session.js';
import { AUTOMATIONS_NAV_IDS, classifyAutomation, EMPTY_AUTOMATIONS_LAYOUT_FILTERS, filterAutomationRows, filterAutomationRuns, getAutomationLayoutDetails, getAutomationLayoutSections, getAutomationNavCounts, getAutomationNavWarnings, getAutomationRunArtifacts, getAutomationRunDestination, getThisMachineLabel, groupAutomationRunsByDay, hasAutomationRunResult, IAutomationLayoutRun, LOCAL_AUTOMATION_HOST } from '../../browser/views/automationsLayoutModel.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentSkill, IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { AutomationsLayoutActions } from '../../browser/views/automationsLayoutActions.js';
import { AutomationsLayoutWidget } from '../../browser/views/automationsLayoutWidget.js';
import { getAutomationsSampleData } from '../../browser/views/automationsLayoutSampleData.js';
import { describeAutomationSchedule, describeCronExpression, formatAutomationTime } from '../../browser/views/automationsLayoutSchedule.js';
import { SESSIONS_AUTOMATIONS_SHOW_SHARED_BY_OTHERS_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { AutomationDisableConditionKind } from '../../../../../platform/agentHost/common/state/protocol/channels-automation/state.js';
import { IEditorPaneRegistry } from '../../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { AutomationsManagementEditorInput, openAutomations } from '../../browser/views/automationsManagementEditor.js';

function schedule(interval: IAutomationSchedule['interval'], scheduleHour = 9, scheduleMinute = 0, scheduleDay = 0, cronExpression?: string): IAutomationSchedule {
	return { interval, scheduleHour, scheduleMinute, scheduleDay, ...(cronExpression ? { cronExpression } : {}) };
}

function automation(id: string, overrides: Partial<IAutomationDescriptor> = {}): IAutomationDescriptor {
	return {
		id,
		name: id,
		prompt: '',
		schedule: schedule('daily'),
		target: { kind: 'workspace', folderUri: URI.file('/repo'), providerId: 'local-agent-host', isolation: { kind: 'default' } },
		enabled: true,
		createdAt: '2026-11-01T00:00:00.000Z',
		updatedAt: '2026-11-01T00:00:00.000Z',
		...overrides,
	};
}

suite('Automations layout schedules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('one-time schedules show their absolute scheduled time', () => {
		const runAt = '2027-01-01T10:00:00.000Z';
		assert.strictEqual(describeAutomationSchedule({ ...schedule('once'), runAt }).label, `Once: ${new Date(runAt).toLocaleString()}`);
	});

	test('describes schedules in plain words', () => {
		const nine = formatAutomationTime(9, 0);
		const eight = formatAutomationTime(8, 0);
		assert.deepStrictEqual([
			describeAutomationSchedule(schedule('manual')),
			describeAutomationSchedule(schedule('hourly')),
			describeAutomationSchedule(schedule('daily')),
			describeAutomationSchedule(schedule('weekdays')),
			describeAutomationSchedule(schedule('weekly', 8, 0, 5)),
		], [
			{ label: 'Manual' },
			{ label: 'Every hour' },
			{ label: `Every day at ${nine}` },
			{ label: `Weekdays at ${nine}` },
			{ label: `Fridays at ${eight}` },
		]);
	});

	test('describes cron expressions that have plain words', () => {
		assert.deepStrictEqual([
			'*/15 * * * *',
			'0 * * * *',
			'0 */2 * * *',
			'0 9 * * *',
			'0 9 * * 1-5',
			'0 8 * * 5',
			'0 8 * * 1,4',
			'0 8 * * MON,WED,FRI',
			'0 9 15 * *',
			'30 9 1 * *',
			'0 9 * * 0-6',
		].map(describeCronExpression), [
			'Every 15 minutes',
			'Every hour',
			'Every 2 hours',
			`Every day at ${formatAutomationTime(9, 0)}`,
			`Weekdays at ${formatAutomationTime(9, 0)}`,
			`Fridays at ${formatAutomationTime(8, 0)}`,
			`Mondays and Thursdays at ${formatAutomationTime(8, 0)}`,
			`Mondays, Wednesdays and Fridays at ${formatAutomationTime(8, 0)}`,
			`Monthly on the 15th at ${formatAutomationTime(9, 0)}`,
			`Monthly on the 1st at ${formatAutomationTime(9, 30)}`,
			`Every day at ${formatAutomationTime(9, 0)}`,
		]);
	});

	test('falls back to a custom schedule with the cron expression', () => {
		assert.deepStrictEqual([
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '15 7 1,15 * *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 9 * 1 *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 9 1 * 1')),
			// Steps that don't divide the hour or day run at uneven intervals.
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '*/45 * * * *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 */5 * * *')),
			describeAutomationSchedule(schedule('custom')),
		], [
			{ label: 'Custom schedule', cronExpression: '15 7 1,15 * *' },
			{ label: 'Custom schedule', cronExpression: '0 9 * 1 *' },
			{ label: 'Custom schedule', cronExpression: '0 9 1 * 1' },
			{ label: 'Custom schedule', cronExpression: '*/45 * * * *' },
			{ label: 'Custom schedule', cronExpression: '0 */5 * * *' },
			{ label: 'Custom schedule' },
		]);
	});
});

suite('Automations layout model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const now = new Date(2026, 10, 10, 15, 0).getTime();
	const sample = getAutomationsSampleData(now, new Set());

	test('classifies automations by who owns them and where they run', () => {
		const isCloudProvider = (providerId: string | undefined) => providerId === 'cloud';
		assert.deepStrictEqual([
			automation('local'),
			automation('remote', { target: { kind: 'quickChat', providerId: 'agenthost-devbox', sessionTypeId: 'copilotcli' } }),
			automation('cloud', { target: { kind: 'workspace', folderUri: URI.file('/repo'), providerId: 'cloud', isolation: { kind: 'default' } } }),
			automation('mine', { ownership: 'user' }),
			automation('shared', { ownership: 'repository' }),
			automation('event', { cloudTrigger: { triggers: { pull_request_opened: { types: ['opened'] } } } }),
		].map(item => classifyAutomation(item, isCloudProvider)), ['personal', 'personal', 'cloud', 'cloud', 'repository', 'cloud']);
	});

	test('sample automations on this machine show the label real local automations show', () => {
		assert.deepStrictEqual([...new Set(sample.rows.filter(row => row.hostKey === LOCAL_AUTOMATION_HOST).map(row => row.hostLabel))], [getThisMachineLabel()]);
	});

	test('counts include saved off automations, and Runs counts unread runs', () => {
		const counts = getAutomationNavCounts(sample.rows, sample.runs, []);
		assert.deepStrictEqual(AUTOMATIONS_NAV_IDS.map(id => `${id}: ${counts[id]}, ${getAutomationNavWarnings(sample.warnings, id).length} warnings`), [
			'all: 3, 1 warnings',
			'personal: 2, 1 warnings',
			'cloud: 1, 0 warnings',
			'repository: 0, 0 warnings',
			'runs: 2, 0 warnings',
			'examples: 0, 0 warnings',
		]);
		const off = { ...sample.rows[0], id: 'off', enabled: false };
		assert.strictEqual(getAutomationNavCounts([...sample.rows, off], [], []).personal, 3);
	});

	test('All automations keeps off entries in their group after on entries', () => {
		const off = { ...sample.rows[0], id: 'off', name: 'Off automation', enabled: false };
		const sharedOff = { ...off, id: 'shared-off', group: 'repository' as const };
		assert.deepStrictEqual(getAutomationLayoutSections([off, ...sample.rows, sharedOff], 'all').map(section => [section.id, section.rows.map(row => row.name)]), [
			['personal', ['Morning inbox triage', 'Nightly variation lab', 'Off automation']],
			['cloud', ['PR review summary']],
			['repository', ['Off automation']],
		]);
		assert.deepStrictEqual(getAutomationLayoutSections([off, ...sample.rows, sharedOff], 'all', false).map(section => [section.id, section.rows.map(row => row.id)]), [
			['personal', ['sample.inboxTriage', 'sample.variationLab']],
			['cloud', ['sample.prReviewSummary']],
			['repository', ['shared-off']],
		]);
		assert.deepStrictEqual(getAutomationLayoutSections(sample.rows, 'all').map(section => [section.id, section.rows.map(row => row.name)]), [
			['personal', ['Morning inbox triage', 'Nightly variation lab']],
			['cloud', ['PR review summary']],
		]);
	});

	test('a group pane retains its ownership and hides empty sections', () => {
		assert.deepStrictEqual({
			personal: getAutomationLayoutSections(sample.rows, 'personal').map(section => [section.id, section.rows.length]),
			repository: getAutomationLayoutSections(sample.rows, 'repository').map(section => [section.id, section.rows.length]),
			cloud: getAutomationLayoutSections(sample.rows, 'cloud').map(section => [section.id, section.rows.length]),
		}, {
			personal: [['personal', 2]],
			repository: [],
			cloud: [['cloud', 1]],
		});
	});

	test('search matches names and prompts, and filters combine', () => {
		const names = (query: string, filters = EMPTY_AUTOMATIONS_LAYOUT_FILTERS) => filterAutomationRows(sample.rows, query, filters).map(row => row.name);
		assert.deepStrictEqual({
			name: names('triage'),
			prompt: names('careful review'),
			host: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, hosts: ['sample:devbox1'] }),
			off: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, statuses: ['off'] }),
			failed: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, statuses: ['failed'] }),
			workspace: names('summary', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, workspaces: ['microsoft/vscode'] }),
			none: names('nothing matches this'),
		}, {
			name: ['Morning inbox triage'],
			prompt: ['PR review summary'],
			host: ['Nightly variation lab'],
			off: [],
			failed: ['Nightly variation lab'],
			workspace: ['PR review summary'],
			none: [],
		});
	});

	test('runs are grouped by day and searched by title and automation name', () => {
		const run = (id: string, title: string, automationName: string, time: number): IAutomationLayoutRun => ({
			id, automationId: id, automationName, title, state: 'completed', time, startTime: time, trigger: 'schedule', outcome: undefined, result: undefined, unread: false, isSample: false, sessionResource: undefined, externalResource: undefined,
		});
		const hour = 60 * 60 * 1000;
		const runs = [
			run('a', 'Fix flaky test', 'Find bugs', now - hour),
			run('b', 'Weekly digest', 'Research digest', now - 26 * hour),
			run('c', 'Triage', 'Issue triage', now - 4 * 24 * hour),
		];
		assert.deepStrictEqual({
			groups: groupAutomationRunsByDay(runs, now).map(group => [group.label, group.runs.map(item => item.id)]),
			search: filterAutomationRuns(runs, 'digest').map(item => item.id),
			byAutomation: filterAutomationRuns(runs, 'bugs').map(item => item.id),
		}, {
			groups: [['Today', ['a']], ['Yesterday', ['b']], ['Last week', ['c']]],
			search: ['b'],
			byAutomation: ['a'],
		});
	});
});

suite('Automations layout details', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const hour = 60 * 60 * 1000;
	const pullRequest = { kind: SessionArtifactKind.PullRequest, label: '#12 Skip flaky tests' };

	function run(id: string, overrides: Partial<IAutomationLayoutRun> = {}): IAutomationLayoutRun {
		return {
			id, automationId: 'automation', automationName: 'Automation', title: 'Automation', state: 'completed', time: 0, startTime: 0, trigger: 'schedule',
			outcome: undefined, result: undefined, unread: false, isSample: false, sessionResource: undefined, externalResource: undefined, ...overrides,
		};
	}

	test('lists only the automation\'s runs, newest first by when they started', () => {
		const runs = [
			run('older', { startTime: 1 * hour, time: 2 * hour }),
			// Started before `newer` but still going, so it changed last.
			run('long', { state: 'running', startTime: 3 * hour, time: 9 * hour }),
			run('other', { automationId: 'other', startTime: 8 * hour, time: 8 * hour }),
			run('newer', { startTime: 5 * hour, time: 6 * hour }),
			run('tie-b', { startTime: 4 * hour, time: 4 * hour }),
			run('tie-a', { startTime: 4 * hour, time: 4 * hour }),
		];
		assert.deepStrictEqual(getAutomationLayoutDetails(runs, 'automation').runs.map(item => item.id), ['newer', 'tie-a', 'tie-b', 'long', 'older']);
	});

	test('the latest result is the newest successful run with a result, and says when it is not the latest run', () => {
		const succeeded = run('succeeded', { startTime: 1 * hour, result: { artifacts: [pullRequest] } });
		const latestResult = (latest: Partial<IAutomationLayoutRun>) => {
			const details = getAutomationLayoutDetails([succeeded, run('latest', { startTime: 2 * hour, ...latest })], 'automation');
			return { latest: details.latestRun?.id, result: details.latestResult?.run.id, fromLatestRun: details.latestResult?.fromLatestRun };
		};
		assert.deepStrictEqual({
			succeededWithResult: latestResult({ result: { artifacts: [], summary: 'Sorted 9 notifications.' } }),
			failed: latestResult({ state: 'failed', outcome: 'Lost the connection.' }),
			// What a failed or unfinished run recorded is never shown as the latest result.
			failedWithArtifact: latestResult({ state: 'failed', result: { artifacts: [pullRequest] } }),
			running: latestResult({ state: 'running', result: { artifacts: [pullRequest] } }),
			needsInput: latestResult({ state: 'needsInput' }),
			succeededWithNothing: latestResult({ result: { artifacts: [], changes: { files: 0, additions: 0, deletions: 0 } } }),
		}, {
			succeededWithResult: { latest: 'latest', result: 'latest', fromLatestRun: true },
			failed: { latest: 'latest', result: 'succeeded', fromLatestRun: false },
			failedWithArtifact: { latest: 'latest', result: 'succeeded', fromLatestRun: false },
			running: { latest: 'latest', result: 'succeeded', fromLatestRun: false },
			needsInput: { latest: 'latest', result: 'succeeded', fromLatestRun: false },
			succeededWithNothing: { latest: 'latest', result: 'succeeded', fromLatestRun: false },
		});
	});

	test('missing metadata shows nothing rather than a guess', () => {
		const artifact = (id: string, kind: SessionArtifactKind, isArtifact: boolean): ISessionArtifact => ({ id, kind, label: id, isArtifact });
		// Unknown because the session isn't available: no result, and no earlier one to stand in for it.
		const unknown = getAutomationLayoutDetails([run('unknown', { result: undefined })], 'automation');
		assert.deepStrictEqual({
			unknown: { latest: unknown.latestRun?.id, result: unknown.latestResult },
			noRuns: getAutomationLayoutDetails([run('other', { automationId: 'other', result: { artifacts: [pullRequest] } })], 'automation'),
			hasResult: [undefined, { artifacts: [] }, { artifacts: [], changes: { files: 0, additions: 0, deletions: 0 } }, { artifacts: [], changes: { files: 2, additions: 4, deletions: 1 } }].map(result => hasAutomationRunResult(result)),
			// References the session only pointed at are not results; artifacts keep the Agents window's order.
			artifacts: getAutomationRunArtifacts([
				artifact('notes.md', SessionArtifactKind.File, true),
				artifact('#3 Bug', SessionArtifactKind.Issue, false),
				artifact('#4 Fix', SessionArtifactKind.PullRequest, true),
				artifact('abc123', SessionArtifactKind.Commit, true),
			]).map(item => item.label),
		}, {
			unknown: { latest: 'unknown', result: undefined },
			noRuns: { runs: [], latestRun: undefined, latestResult: undefined },
			hasResult: [false, false, false, true],
			artifacts: ['#4 Fix', 'abc123', 'notes.md'],
		});
	});

	test('each run opens its own session, or its page on GitHub, or says why it can\'t', () => {
		const first = URI.parse('agent-host-copilotcli:/run-1');
		const second = URI.parse('agent-host-copilotcli:/run-2');
		const github = URI.parse('https://github.com/owner/repo/actions/runs/7');
		const runs = [
			run('second', { startTime: 2 * hour, sessionResource: second }),
			run('first', { startTime: 1 * hour, sessionResource: first, externalResource: github }),
			run('cloud', { startTime: 3 * hour, externalResource: github }),
			run('starting', { startTime: 4 * hour, state: 'running' }),
			run('unlinked', { startTime: 0 }),
			run('sample', { startTime: 5 * hour, isSample: true, sessionResource: second }),
		];
		assert.deepStrictEqual(getAutomationLayoutDetails(runs, 'automation').runs.map(item => {
			const destination = getAutomationRunDestination(item);
			return [item.id, destination.kind === 'none' ? destination.reason : destination.resource.toString()];
		}), [
			['sample', 'sample'],
			['starting', 'notLinked'],
			['cloud', github.toString()],
			['second', second.toString()],
			// An older run opens its own session, ahead of its GitHub page, not the newest one.
			['first', first.toString()],
			['unlinked', 'noSession'],
		]);
	});
});

suite('Automations layout composer requests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const skillUri = FileAccess.asFileUri('vs/sessions/skills/automate/SKILL.md');
	const skill = upcastPartial<IAgentSkill>({ name: 'automate', storage: PromptsStorage.builtIn, uri: skillUri });

	function createActions(disabled: readonly URI[] = []): AutomationsLayoutActions {
		return Object.assign(Object.create(AutomationsLayoutActions.prototype) as AutomationsLayoutActions, {
			promptsService: upcastPartial<IPromptsService>({ findAgentSkills: async () => [skill], getDisabledPromptFiles: () => new ResourceSet(disabled) }),
			logService: new NullLogService(),
		});
	}

	test('sends a description to /automate with the built-in skill attached once', async () => {
		const actions = createActions();
		const reference = { ...toFileVariableEntry(URI.file('/notes.md')), range: { start: 6, endExclusive: 15 } };
		const typed = await actions.prepareAutomationRequest({ query: 'Every Friday at 4 PM, draft release notes', attachedContext: [] });
		const withReference = await actions.prepareAutomationRequest({ query: 'Using #notes.md, draft release notes', attachedContext: [reference] });
		const prefixed = await actions.prepareAutomationRequest({ query: '/automate Daily digest', attachedContext: typed.attachedContext });
		const withoutSkill = await createActions([skillUri]).prepareAutomationRequest({ query: 'Daily digest', attachedContext: [] });
		const referenced = withReference.attachedContext[0];
		assert.deepStrictEqual({
			typed: { query: typed.query, attachments: typed.attachedContext.map(entry => URI.isUri(entry.value) ? entry.value.toString() : entry.value) },
			reference: { text: referenced.range && withReference.query.slice(referenced.range.start, referenced.range.endExclusive), attachments: withReference.attachedContext.length },
			prefixed: { query: prefixed.query, attachments: prefixed.attachedContext.length },
			withoutSkill: { query: withoutSkill.query, attachments: withoutSkill.attachedContext.length },
		}, {
			typed: { query: '/automate Every Friday at 4 PM, draft release notes', attachments: [skillUri.toString()] },
			reference: { text: '#notes.md', attachments: 2 },
			prefixed: { query: '/automate Daily digest', attachments: 1 },
			withoutSkill: { query: '/automate Daily digest', attachments: 0 },
		});
	});
});

suite('Automations layout details panel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a package without the modal editor keeps the baseline page for a synced modal setting', async () => {
		store.add(AutomationsManagementEditorInput.getOrCreate());
		const registry = Registry.as<IEditorPaneRegistry | null>(EditorExtensions.EditorPane);
		const descriptor = registry ? sinon.stub(registry, 'getEditorPane').returns(undefined) : undefined;
		let opened = 0;
		let shown: string | undefined;
		try {
			await openAutomations(
				new TestConfigurationService({ chat: { automations: { layout: 'modal' } } }),
				upcastPartial<IEditorService>({ openEditor: async () => { opened++; return undefined; } }),
				upcastPartial<ICustomViewService>({ showCustomView: id => { shown = id; } }),
			);
			assert.deepStrictEqual({ opened, shown }, { opened: 0, shown: AUTOMATIONS_CUSTOM_VIEW_ID });
		} finally {
			descriptor?.restore();
		}
	});

	function createWidget(
		contextMenuVisible = false,
		showContextMenu: IContextMenuService['showContextMenu'] = () => { },
		model?: { readonly automations: IObservable<readonly IAutomationDescriptor[]>; readonly configurationService?: TestConfigurationService; readonly storageService?: IStorageService },
	): AutomationsLayoutWidget {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = model?.configurationService ?? new TestConfigurationService({ chat: { automations: { sampleData: !model } } });
		const automations = model?.automations ?? constObservable<readonly IAutomationDescriptor[]>([]);
		const storageService = model?.storageService ?? store.add(new InMemoryStorageService());
		storageService.store('sessions.automations.layout.createSpotlightShown', true, StorageScope.PROFILE, StorageTarget.USER);
		instantiationService.stubInstance(AutomationsLayoutActions, {});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		contextKeyService.createKey('contextMenuVisible', contextMenuVisible);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IContextMenuService, { showContextMenu });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IClipboardService, {});
		instantiationService.stub(IChatViewFactory, {});
		instantiationService.stub(ISessionsService, {});
		instantiationService.stub(ISessionsManagementService, { onDidChangeSessions: Event.None });
		instantiationService.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None });
		instantiationService.stub(IChatService, { chatModels: constObservable([]) });
		instantiationService.stub(IAgentPluginService, { plugins: constObservable([]) });
		instantiationService.stub(IAutomationService, {
			automations,
			canRunAutomation: () => true,
			canUpdateAutomation: () => true,
			canDeleteAutomation: () => true,
			getAutomation: id => automations.get().find(automation => automation.id === id),
			runs: constObservable([]),
			catalogueState: constObservable<AutomationCatalogueState>('ready'),
			availableProviders: constObservable([]),
			unavailableProviders: constObservable([]),
			refresh: async () => { },
		});
		const widget = store.add(instantiationService.createInstance(AutomationsLayoutWidget, { variant: 'modal' }));
		widget.element.style.width = '1200px';
		mainWindow.document.body.appendChild(widget.element);
		store.add(toDisposable(() => widget.element.remove()));
		widget.layout(1200, 760);
		return widget;
	}

	function element(widget: AutomationsLayoutWidget, selector: string): HTMLElement {
		const result = widget.element.querySelector<HTMLElement>(selector);
		assert.ok(result, selector);
		return result;
	}

	test('off automations stay in their group and the remembered switch only hides personal off entries', () => {
		const storageService = store.add(new InMemoryStorageService());
		const automations = constObservable([
			automation('off', { enabled: false }),
			automation('on'),
			automation('shared-off', { enabled: false, ownership: 'repository', isCreatedByCurrentUser: true }),
		]);
		const widget = createWidget(false, undefined, { automations, storageService });
		widget.select('personal');
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 1);
		assert.strictEqual(element(widget, '[data-nav="all"] .automations-layout-nav-count').textContent, '3');
		element(widget, '.automations-layout-show-off [role="checkbox"]').click();
		assert.deepStrictEqual(Array.from(widget.element.querySelectorAll<HTMLElement>('.automations-layout-row'), row => row.dataset.key), ['row:on', 'row:off']);
		assert.strictEqual(widget.element.querySelector('[data-section="disabled"]'), null);
		widget.select('repository');
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 1);
		assert.strictEqual(element(widget, '.automations-layout-show-off').style.display, 'none');
		const reopened = createWidget(false, undefined, { automations, storageService });
		reopened.select('personal');
		assert.strictEqual(reopened.element.querySelectorAll('.automations-layout-row').length, 2);
		element(reopened, '.automations-layout-show-off [role="checkbox"]').click();
		assert.strictEqual(reopened.element.querySelectorAll('.automations-layout-row').length, 1);
	});

	test('hiding the last visible automation returns keyboard focus to the show-off control', () => {
		const item = automation('last');
		const automations = observableValue<readonly IAutomationDescriptor[]>('catalogue', [item]);
		const widget = createWidget(false, undefined, { automations });
		widget.select('personal');
		const row = element(widget, '[data-key="row:last"]');
		row.focus();
		element(widget, '[data-key="row:last"] [data-control="enabled"]').focus();
		automations.set([{ ...item, enabled: false }], undefined);
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 0);
		assert.strictEqual(DOM.getActiveElement(), element(widget, '.automations-layout-show-off [role="checkbox"]'));
	});

	test('shared creators follow the same opt-in preference as current Automations', async () => {
		const configurationService = new TestConfigurationService();
		const automations = constObservable([
			automation('mine', { ownership: 'repository', isCreatedByCurrentUser: true }),
			automation('other', { ownership: 'repository', isCreatedByCurrentUser: false }),
			automation('unknown', { ownership: 'repository' }),
		]);
		const widget = createWidget(false, undefined, { automations, configurationService });
		widget.select('repository');
		assert.deepStrictEqual(Array.from(widget.element.querySelectorAll<HTMLElement>('.automations-layout-row'), row => row.dataset.key), ['row:mine']);
		await configurationService.setUserConfiguration(SESSIONS_AUTOMATIONS_SHOW_SHARED_BY_OTHERS_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SESSIONS_AUTOMATIONS_SHOW_SHARED_BY_OTHERS_SETTING,
			affectedKeys: new Set([SESSIONS_AUTOMATIONS_SHOW_SHARED_BY_OTHERS_SETTING]),
			change: { keys: [SESSIONS_AUTOMATIONS_SHOW_SHARED_BY_OTHERS_SETTING], overrides: [] },
			source: ConfigurationTarget.USER,
		});
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 3);
	});

	test('pending scheduled chats follow Send Later visibility without changing the saved catalogue', async () => {
		const once = { ...schedule('once'), runAt: '2027-01-01T10:00:00.000Z' };
		const pending = automation('pending', { purpose: 'scheduledChat', schedule: once });
		const automations = observableValue<readonly IAutomationDescriptor[]>('catalogue', [
			pending,
			automation('dispatched', { purpose: 'scheduledChat', schedule: once, oneTimeDispatchedAt: once.runAt }),
			automation('ordinary-once', { schedule: once }),
			automation('recurring'),
		]);
		const configurationService = new TestConfigurationService();
		const widget = createWidget(false, undefined, { automations, configurationService });
		const count = () => widget.element.querySelectorAll('.automations-layout-row').length;
		const setEnabled = async (value: boolean) => {
			await configurationService.setUserConfiguration(SESSIONS_SEND_LATER_ENABLED_SETTING, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === SESSIONS_SEND_LATER_ENABLED_SETTING,
				affectedKeys: new Set([SESSIONS_SEND_LATER_ENABLED_SETTING]),
				change: { keys: [SESSIONS_SEND_LATER_ENABLED_SETTING], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		};
		assert.strictEqual(count(), 4);
		await setEnabled(true);
		assert.strictEqual(count(), 3);
		assert.strictEqual(widget.element.querySelector('[data-key="row:pending"]'), null);
		assert.strictEqual(element(widget, '[data-nav="all"] .automations-layout-nav-count').textContent, '3');
		await setEnabled(false);
		assert.strictEqual(count(), 4);
		await setEnabled(true);
		automations.set(automations.get().map(item => item === pending ? { ...item, oneTimeDispatchedAt: once.runAt } : item), undefined);
		assert.strictEqual(count(), 4);
		assert.strictEqual(automations.get().length, 4);
	});

	test('real-row menus retain the upstream end-date context', () => {
		const values: (boolean | undefined)[] = [];
		const items = constObservable([
			automation('limited', { disableConditions: [{ kind: AutomationDisableConditionKind.AfterDate, date: '2099-01-01T00:00:00Z' }] }),
			automation('unlimited'),
		]);
		const widget = createWidget(false, delegate => {
			const menu: Pick<IContextMenuMenuDelegate, 'contextKeyService' | 'onHide'> = delegate;
			values.push(menu.contextKeyService?.getContextKeyValue<boolean>('sessionsAutomationCardHasLimits'));
			delegate.onHide?.(false);
		}, { automations: items });
		element(widget, '[data-key="row:limited"] [data-control="more"]').click();
		element(widget, '[data-key="row:unlimited"] [data-control="more"]').click();
		assert.deepStrictEqual(values, [true, false]);
	});

	test('context filters use the existing row filters and reset independently', async () => {
		let actions: readonly IAction[] = [];
		const widget = createWidget(false, delegate => {
			assert.ok(delegate.getActions);
			actions = delegate.getActions();
		});
		const choose = async (filter: string, label: string) => {
			element(widget, `[data-filter="${filter}"]`).click();
			const action = actions.find(action => action.label === label);
			assert.ok(action, label);
			await action.run();
		};
		await choose('hosts', 'DevBox1');
		await choose('statuses', 'Last run failed');
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 1);
		assert.ok(widget.element.querySelector('[data-key="row:sample.variationLab"]'));
		await choose('hosts', 'All locations');
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 1);
		assert.strictEqual(element(widget, '[data-filter="statuses"] .automations-layout-context-label').textContent, 'Last run failed');
		await choose('statuses', 'Any status');
		assert.strictEqual(widget.element.querySelectorAll('.automations-layout-row').length, 3);
	});

	test('keeps compact table rows and a flush details header when the list narrows', () => {
		const widget = createWidget();
		const row = element(widget, '[data-key="row:sample.inboxTriage"]');
		const columns = element(widget, '.automations-layout-columns');
		const schedule = element(widget, '.automations-layout-column-schedule');
		const titleRow = element(widget, '.automations-layout-pane-title-row');
		assert.ok(titleRow.contains(element(widget, '.automations-layout-toolbar')));
		assert.notStrictEqual(mainWindow.getComputedStyle(schedule).display, 'none');
		row.click();
		const details = element(widget, '.automations-layout-details');
		const header = element(widget, '.automations-layout-details-header');
		assert.notStrictEqual(mainWindow.getComputedStyle(columns).display, 'none');
		assert.strictEqual(mainWindow.getComputedStyle(schedule).display, 'none');
		assert.ok(row.getBoundingClientRect().height <= 26);
		assert.strictEqual(header.getBoundingClientRect().top, details.getBoundingClientRect().top);
		assert.ok(header.getBoundingClientRect().height <= 36);
		widget.closeDetails();
		assert.notStrictEqual(mainWindow.getComputedStyle(schedule).display, 'none');
		assert.strictEqual(element(widget, '[data-key="row:sample.inboxTriage"]'), row);
	});

	test('shares space with the interactive list and switches details without recreating rows', () => {
		const widget = createWidget();
		const pane = element(widget, '.automations-layout-pane');
		const before = pane.getBoundingClientRect().width;
		const first = element(widget, '[data-key="row:sample.inboxTriage"]');
		const second = element(widget, '[data-key="row:sample.variationLab"]');
		first.click();
		const firstState = {
			narrowed: pane.getBoundingClientRect().width < before,
			overlaps: pane.getBoundingClientRect().right > element(widget, '.automations-layout-details').getBoundingClientRect().left,
			inert: !!pane.querySelector('[inert]') || pane.inert,
			backdrop: !!widget.element.querySelector('.automations-layout-details-backdrop'),
		};
		second.click();
		assert.deepStrictEqual({
			firstState,
			sameRows: first === element(widget, '[data-key="row:sample.inboxTriage"]') && second === element(widget, '[data-key="row:sample.variationLab"]'),
			title: element(widget, '.automations-layout-details-title').textContent,
			current: [first.getAttribute('aria-current'), second.getAttribute('aria-current')],
		}, {
			firstState: { narrowed: true, overlaps: false, inert: false, backdrop: false },
			sameRows: true,
			title: 'Nightly variation lab',
			current: ['false', 'true'],
		});
	});

	test('Escape from a details control preserves search and restores focus to the row', () => {
		const widget = createWidget();
		const search = widget.element.querySelector<HTMLInputElement>('.automations-layout-search input')!;
		search.value = 'lab';
		search.dispatchEvent(new mainWindow.Event('input'));
		const row = element(widget, '[data-key="row:sample.variationLab"]');
		row.click();
		const close = element(widget, '.automations-layout-details-close');
		close.focus();
		const escape = new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
		close.dispatchEvent(escape);
		assert.deepStrictEqual({
			closed: !widget.element.querySelector('.automations-layout-details'),
			focused: DOM.getActiveElement() === row,
			search: search.value,
			sameRow: row === element(widget, '[data-key="row:sample.variationLab"]'),
			consumed: escape.defaultPrevented,
		}, { closed: true, focused: true, search: 'lab', sameRow: true, consumed: true });
	});

	test('Escape from adjacent list controls preserves search and restores focus to the row', () => {
		const widget = createWidget();
		const search = widget.element.querySelector<HTMLInputElement>('.automations-layout-search input')!;
		search.value = 'lab';
		search.dispatchEvent(new mainWindow.Event('input'));
		const row = element(widget, '[data-key="row:sample.variationLab"]');
		const controls = row.querySelectorAll<HTMLElement>('.monaco-button:not(.disabled)');
		assert.ok(controls.length > 0);
		for (const control of controls) {
			row.click();
			row.focus();
			control.focus();
			assert.strictEqual(DOM.getActiveElement(), control);
			control.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			assert.deepStrictEqual({
				closed: !widget.element.querySelector('.automations-layout-details'),
				focused: DOM.getActiveElement() === row,
				search: search.value,
			}, { closed: true, focused: true, search: 'lab' });
		}
	});

	test('Escape in a non-empty search clears it before closing details', () => {
		const widget = createWidget();
		const search = widget.element.querySelector<HTMLInputElement>('.automations-layout-search input')!;
		search.value = 'lab';
		search.dispatchEvent(new mainWindow.Event('input'));
		element(widget, '[data-key="row:sample.variationLab"]').click();
		search.focus();
		search.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		assert.strictEqual(search.value, '');
		assert.ok(widget.element.querySelector('.automations-layout-details'));
		assert.strictEqual(DOM.getActiveElement(), search);
	});

	test('Escape leaves context-menu dismissal ahead of closing details', () => {
		const widget = createWidget(true);
		element(widget, '[data-key="row:sample.inboxTriage"]').click();
		const control = element(widget, '.automations-layout-row .monaco-button:not(.disabled)');
		control.closest<HTMLElement>('.automations-layout-row')!.focus();
		control.focus();
		control.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		assert.ok(widget.element.querySelector('.automations-layout-details'));
	});

	test('narrow layouts show details alone and restore the split and list on the same instance', () => {
		const widget = createWidget();
		const row = element(widget, '[data-key="row:sample.inboxTriage"]');
		row.click();
		const panel = element(widget, '.automations-layout-details');
		const initialWidth = panel.getBoundingClientRect().width;
		widget.element.style.width = '760px';
		widget.layout(760, 760);
		const narrow = {
			detailsOnly: element(widget, '.automations-layout-pane-split').classList.contains('details-only'),
			fullWidth: panel.getBoundingClientRect().width === element(widget, '.automations-layout-pane-split').getBoundingClientRect().width,
			listHidden: element(widget, '.automations-layout-pane').getBoundingClientRect().width === 0,
		};
		widget.element.style.width = '1200px';
		widget.layout(1200, 760);
		const wide = {
			detailsOnly: element(widget, '.automations-layout-pane-split').classList.contains('details-only'),
			panelWidthRestored: panel.getBoundingClientRect().width === initialWidth,
			listVisible: element(widget, '.automations-layout-pane').getBoundingClientRect().width > 0,
		};
		widget.closeDetails();
		assert.deepStrictEqual({
			narrow,
			wide,
			sameRow: row === element(widget, '[data-key="row:sample.inboxTriage"]'),
			focused: DOM.getActiveElement() === row,
		}, {
			narrow: { detailsOnly: true, fullWidth: true, listHidden: true },
			wide: { detailsOnly: false, panelWidthRestored: true, listVisible: true },
			sameRow: true,
			focused: true,
		});
	});
});
