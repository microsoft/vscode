/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../../../../../base/browser/ui/codicons/codicon/codicon-modifiers.css';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Color } from '../../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionFactoryRun, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus, withSessionFactoryRuns } from '../../../../../../platform/agentHost/common/sessionFactoryRuns.js';
import { buildSubagentChatUri, ComponentToState, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { asCssVariableName, chartsGreen, chartsYellow, descriptionForeground, editorBackground, errorForeground, foreground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorGroup } from '../../../../../services/editor/common/editorGroupsService.js';
import { ColorThemeData } from '../../../../../services/themes/common/colorThemeData.js';
import { AgentHostFactoryRunEditor, resolveFactoryRunAgentChats } from '../../../browser/agentSessions/agentHost/agentHostFactoryRunEditor.js';
import { AgentHostFactoryRunEditorInput, AgentHostFactoryRunEditorInputSerializer } from '../../../browser/agentSessions/agentHost/agentHostFactoryRunEditorInput.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../common/constants.js';

suite('AgentHostFactoryRunEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const backendSession = URI.parse('copilot:/session');
	const run: ISessionFactoryRun = {
		runId: 'run-1',
		factoryName: 'review-changed',
		description: '',
		status: SessionFactoryRunStatus.Running,
		revision: 1,
		createdAt: 1,
		updatedAt: 2,
		liveAgentCount: 1,
		totalSpawnedAgentCount: 3,
		usage: { activeMs: 0, subagents: 3, aiCredits: 0 },
		limits: {},
		phases: [],
		agents: [
			{ agentId: 'with-chat', toolCallId: 'with-chat', label: 'Reviewer', agentType: 'task', status: 'running', activeMs: 0 },
			{ agentId: 'without-chat', toolCallId: 'without-chat', label: 'Planner', agentType: 'task', status: 'completed', activeMs: 0 },
			{ agentId: 'legacy', label: 'Legacy', agentType: 'task', status: 'completed', activeMs: 0 },
		],
		progress: [],
	};

	const phasedRun: ISessionFactoryRun = {
		...run,
		currentPhaseId: 'availability',
		limits: { maxConcurrentSubagents: 4 },
		phases: ['Availability', 'Mode state', 'Mode UI', 'Gating', 'Migration', 'Telemetry', 'Tests', 'Verification'].map((title, ordinal) => ({
			id: title.toLowerCase().replaceAll(' ', '-'),
			title,
			ordinal,
			status: ordinal === 0 ? SessionFactoryRunPhaseStatus.Active : SessionFactoryRunPhaseStatus.Pending,
			activeMs: ordinal === 0 ? 1000 : 0,
			totalAgentCount: 0,
			liveAgentCount: 0,
		})),
		agents: [],
	};

	async function createEditor(initialRun: ISessionFactoryRun = phasedRun, commandService: ICommandService = new class extends mock<ICommandService>() { }()) {
		const changed = store.add(new Emitter<SessionState>());
		const values: Partial<ComponentToState> = {
			[StateComponents.Session]: upcastPartial<SessionState>({ _meta: withSessionFactoryRuns(undefined, [initialRun]) }),
			[StateComponents.Chat]: upcastPartial<ComponentToState[StateComponents.Chat]>({}),
		};
		const events: { [K in StateComponents]?: Event<ComponentToState[K]> } = {
			[StateComponents.Session]: changed.event,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T extends StateComponents>(kind: T) {
				return {
					object: {
						get value() { return values[kind]; },
						get verifiedValue() { return values[kind]; },
						onDidChange: events[kind] ?? Event.None,
						onWillApplyAction: Event.None,
						onDidApplyAction: Event.None,
					},
					dispose: () => { },
				};
			}
		}();
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = Event.None;
			override resolveSessionResource() { return { connection, connectionAuthority: 'local', backendSession }; }
		}();
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const editor = store.add(new AgentHostFactoryRunEditor(
			new class extends mock<IEditorGroup>() { }(),
			NullTelemetryService,
			new TestThemeService(),
			store.add(new InMemoryStorageService()),
			connectionsService,
			commandService,
		));
		editor.create(parent);
		const sessionResource = URI.parse('agent-host-copilot:/session');
		await editor.setInput(store.add(new AgentHostFactoryRunEditorInput(sessionResource, initialRun.runId, initialRun.factoryName)), undefined, {}, CancellationToken.None);
		return {
			editor,
			parent,
			update: (next: ISessionFactoryRun) => {
				const state = upcastPartial<SessionState>({ _meta: withSessionFactoryRuns(undefined, [next]) });
				values[StateComponents.Session] = state;
				changed.fire(state);
			},
		};
	}

	test('renders a compact phase table with inline details and no metrics for pending work', async () => {
		const { parent } = await createEditor();
		assert.deepStrictEqual({
			headers: Array.from(parent.querySelectorAll('thead th'), cell => cell.textContent),
			rows: parent.querySelectorAll('.agent-host-factory-run-phase-row').length,
			expanded: parent.querySelector('[aria-expanded="true"] .agent-host-factory-run-phase-title')?.textContent,
			pendingMetrics: parent.querySelectorAll('.status-pending .agent-host-factory-run-duration').length,
			activeMetrics: parent.querySelector('.status-active .agent-host-factory-run-duration')?.textContent,
			usageCards: parent.querySelectorAll('.agent-host-factory-run-usage-card').length,
			concurrency: parent.querySelector('.agent-host-factory-run-usage-card:last-child dd')?.textContent,
			detailsCollapsed: !parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-details')?.open,
			following: parent.querySelector('.agent-host-factory-run-follow')?.getAttribute('aria-pressed'),
		}, {
			headers: ['Phase', 'Agents', 'Duration'],
			rows: 8,
			expanded: '1 · Availability',
			pendingMetrics: 0,
			activeMetrics: '1s',
			usageCards: 4,
			concurrency: '1 / 4',
			detailsCollapsed: true,
			following: 'true',
		});
	});

	test('honors the effective workbench reduced-motion preference', async () => {
		const { parent } = await createEditor();
		const spinner = parent.querySelector<HTMLElement>('.status-active .codicon-modifier-spin')!;
		const normal = mainWindow.getComputedStyle(spinner).animationName;
		parent.classList.add('monaco-reduce-motion');
		const reduced = mainWindow.getComputedStyle(spinner).animationName;
		parent.classList.remove('monaco-reduce-motion');
		const restored = mainWindow.getComputedStyle(spinner).animationName;

		assert.deepStrictEqual({ normal, reduced, restored }, { normal: 'codicon-spin', reduced: 'none', restored: 'codicon-spin' });
	});

	test('hides phase announcements but retains real progress even when it repeats a phase title', async () => {
		const initial: ISessionFactoryRun = {
			...phasedRun,
			progress: [{ seq: 1, phaseId: 'availability', recordedAt: 1, kind: 'phase', text: 'Availability' }],
		};
		const { parent, update } = await createEditor(initial);
		const phaseOnlyHidden = !parent.querySelector('.agent-host-factory-run-progress-details');
		update({
			...initial,
			revision: 2,
			progress: [
				...initial.progress,
				{ seq: 2, phaseId: 'availability', recordedAt: 2, kind: 'log', text: 'Availability' },
				{ seq: 3, phaseId: 'mode-ui', recordedAt: 3, kind: 'log', text: 'Not in this phase' },
			],
		});
		assert.deepStrictEqual({
			phaseOnlyHidden,
			label: parent.querySelector('.agent-host-factory-run-progress-details summary')?.textContent,
			entries: Array.from(parent.querySelectorAll('.agent-host-factory-run-progress li'), line => line.textContent),
		}, { phaseOnlyHidden: true, label: 'Progress (1)', entries: ['Availability'] });
	});

	test('aligns duration values with their header at wide and narrow editor widths', async () => {
		const { parent } = await createEditor();
		parent.style.fontSize = '13px';
		for (const [token, value] of [['spacing-size60', '6px'], ['spacing-size100', '10px'], ['spacing-size120', '12px'], ['spacing-size320', '32px'], ['spacing-size400', '40px'], ['fontSize-body1', '13px']]) {
			parent.style.setProperty(`--vscode-${token}`, value);
		}
		const header = parent.querySelector<HTMLElement>('thead th:last-child')!;
		const value = parent.querySelector<HTMLElement>('.agent-host-factory-run-duration-value')!;
		const track = parent.querySelector<HTMLElement>('.agent-host-factory-run-duration-track')!;
		const measurements = [];
		for (const width of [900, 420]) {
			parent.style.width = `${width}px`;
			const headerStart = header.getBoundingClientRect().left + parseFloat(mainWindow.getComputedStyle(header).paddingLeft);
			measurements.push({
				width,
				aligned: Math.abs(value.getBoundingClientRect().left - headerStart) < 1,
				valueFirst: value.parentElement?.firstElementChild === value,
				trackVisible: mainWindow.getComputedStyle(track).display !== 'none',
				noOverflow: parent.scrollWidth <= parent.clientWidth,
			});
		}
		assert.deepStrictEqual(measurements, [
			{ width: 900, aligned: true, valueFirst: true, trackVisible: true, noOverflow: true },
			{ width: 420, aligned: true, valueFirst: true, trackVisible: false, noOverflow: true },
		]);
	});

	test('renders status colors from shared theme tokens without Testing extension colors', async () => {
		const initial: ISessionFactoryRun = {
			...phasedRun,
			currentPhaseId: 'mode-state',
			phases: phasedRun.phases.map((phase, index) => ({ ...phase, status: index === 0 ? SessionFactoryRunPhaseStatus.Completed : index === 1 ? SessionFactoryRunPhaseStatus.Active : phase.status })),
			agents: run.agents.map(agent => ({ ...agent, phaseId: 'mode-state' })),
		};
		const { parent } = await createEditor(initial);
		const results = [];
		for (const type of [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_LIGHT, ColorScheme.HIGH_CONTRAST_DARK]) {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(type);
			for (const id of [chartsGreen, chartsYellow, foreground, editorBackground, errorForeground, descriptionForeground]) {
				const color = theme.getColor(id);
				assert.ok(color, `Shared color ${id} must be available in ${type}`);
				parent.style.setProperty(asCssVariableName(id), color.toString());
			}
			const colorOf = (selector: string) => mainWindow.getComputedStyle(parent.querySelector<HTMLElement>(selector)!);
			results.push({
				type,
				successIcon: colorOf('.status-completed .agent-host-factory-run-phase > .codicon-check').color === Color.Format.CSS.formatRGB(theme.getColor(chartsGreen)!),
				successBar: colorOf('.status-completed .agent-host-factory-run-duration-bar').backgroundColor === Color.Format.CSS.formatRGB(theme.getColor(chartsGreen)!),
				activeBar: colorOf('.status-active .agent-host-factory-run-duration-bar').backgroundColor === Color.Format.CSS.formatRGB(theme.getColor(chartsYellow)!),
				agentBadge: colorOf('[data-status="completed"] .agent-host-factory-run-agent-state').backgroundColor !== 'rgba(0, 0, 0, 0)',
				runBadge: colorOf('.agent-host-factory-run-status').backgroundColor !== 'rgba(0, 0, 0, 0)',
			});
		}
		assert.deepStrictEqual(results, [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_LIGHT, ColorScheme.HIGH_CONTRAST_DARK].map(type => ({
			type, successIcon: true, successBar: true, activeBar: true, agentBadge: true, runBadge: true,
		})));
	});

	test('shows an interrupted phase inline with honest unreached states and proportional durations', async () => {
		const stopped: ISessionFactoryRun = {
			...phasedRun,
			status: SessionFactoryRunStatus.Halted,
			currentPhaseId: 'mode-ui',
			liveAgentCount: 0,
			totalSpawnedAgentCount: 3,
			usage: { activeMs: 1_354_000, aiCredits: 738, subagents: 3 },
			outcome: { reason: 'Server shut down mid-phase' },
			phases: phasedRun.phases.map((phase, index) => ({
				...phase,
				status: index < 2 ? SessionFactoryRunPhaseStatus.Completed : index === 2 ? SessionFactoryRunPhaseStatus.Active : SessionFactoryRunPhaseStatus.Pending,
				activeMs: [446_000, 509_000, 399_000][index] ?? 0,
				totalAgentCount: index < 3 ? 1 : 0,
			})),
			agents: [{
				agentId: 'mode-ui', toolCallId: 'mode-ui', phaseId: 'mode-ui',
				label: 'mode-ui-accessibility', agentType: 'task', model: 'gpt-5.6-sol',
				status: 'cancelled', activeMs: 399_000, completedAt: 2,
				activity: 'Build accessible mode controls and adapt Search UI',
			}],
		};
		const { parent } = await createEditor(stopped);
		assert.deepStrictEqual({
			summary: parent.querySelector('.agent-host-factory-run-summary')?.textContent?.startsWith('3 of 8 phases reached · 3 agents · 22m 34s · 738 credits'),
			reason: parent.querySelector('.agent-host-factory-run-interruption .agent-host-factory-run-outcome-message')?.textContent,
			counts: parent.querySelector('.agent-host-factory-run-interruption .agent-host-factory-run-outcome-note')?.textContent,
			partial: parent.querySelector('.status-partial button[aria-expanded="true"]')?.getAttribute('aria-label'),
			unreached: Array.from(parent.querySelectorAll('.status-unreached .agent-host-factory-run-unreached'), cell => cell.textContent),
			bars: Array.from(parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-duration-bar'), bar => Math.round(parseFloat(bar.style.width))),
			liveSpinners: parent.querySelectorAll('.agent-host-factory-run-table .codicon-modifier-spin').length,
			activity: parent.querySelector('.agent-host-factory-run-agent-activity')?.textContent,
			hasTrace: !!parent.querySelector('button.agent-host-factory-run-agent-trace'),
		}, {
			summary: true,
			reason: 'Server shut down mid-phase',
			counts: '1 agent cancelled · 5 phases not reached',
			partial: '3. Mode UI, Partial',
			unreached: Array(5).fill('Not reached — run halted'),
			bars: [88, 100, 78],
			liveSpinners: 0,
			activity: 'Build accessible mode controls and adapt Search UIView Trace',
			hasTrace: true,
		});
	});

	test('does not keep showing active or pending execution after terminal states', async () => {
		const results = [];
		for (const status of [SessionFactoryRunStatus.Halted, SessionFactoryRunStatus.Cancelled, SessionFactoryRunStatus.Error]) {
			const { parent } = await createEditor({ ...phasedRun, status });
			results.push({
				banner: !!parent.querySelector('.agent-host-factory-run-interruption'),
				partial: parent.querySelectorAll('.status-partial').length,
				unreached: parent.querySelector('.agent-host-factory-run-unreached')?.textContent,
				unreachedMetrics: parent.querySelectorAll('.status-unreached .agent-host-factory-run-duration').length,
			});
		}
		assert.deepStrictEqual(results, [
			{ banner: true, partial: 1, unreached: 'Not reached — run halted', unreachedMetrics: 0 },
			{ banner: true, partial: 1, unreached: 'Not reached — run cancelled', unreachedMetrics: 0 },
			{ banner: true, partial: 1, unreached: 'Not reached — run failed', unreachedMetrics: 0 },
		]);
	});

	test('keeps collapsed rows collapsed across live updates and handles zero durations', async () => {
		const zeroRun: ISessionFactoryRun = { ...phasedRun, phases: phasedRun.phases.map(phase => ({ ...phase, activeMs: 0 })) };
		const { parent, update } = await createEditor(zeroRun);
		parent.querySelector<HTMLElement>('.agent-host-factory-run-phase[aria-expanded="true"]')!.click();
		update({ ...zeroRun, revision: 2 });
		assert.deepStrictEqual({
			expanded: parent.querySelectorAll('.agent-host-factory-run-phase[aria-expanded="true"]').length,
			details: parent.querySelectorAll('.agent-host-factory-run-phase-detail').length,
			bars: Array.from(parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-duration-bar'), bar => bar.style.width),
		}, { expanded: 0, details: 0, bars: ['0%'] });
	});

	test('preserves open disclosures even when a live update precedes the native toggle event', async () => {
		const initial: ISessionFactoryRun = {
			...phasedRun,
			progress: [{ seq: 1, phaseId: 'availability', recordedAt: 1, kind: 'log', text: 'Reading settings' }],
		};
		const { parent, update } = await createEditor(initial);
		parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-details')!.open = true;
		parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-progress-details')!.open = true;
		update({ ...initial, revision: 2 });
		const expanded = [
			parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-details')?.open,
			parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-progress-details')?.open,
		];
		parent.querySelector<HTMLElement>('.agent-host-factory-run-phase[aria-expanded="true"]')!.click();
		parent.querySelector<HTMLElement>('.agent-host-factory-run-phase')!.click();
		assert.deepStrictEqual({
			expanded,
			progressReopened: parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-progress-details')?.open,
		}, { expanded: [true, true], progressReopened: true });
	});

	test('does not expand a phase automatically before any phase is reached', async () => {
		const { parent } = await createEditor({
			...phasedRun,
			status: SessionFactoryRunStatus.Pending,
			currentPhaseId: undefined,
			phases: phasedRun.phases.map(phase => ({ ...phase, status: SessionFactoryRunPhaseStatus.Pending, activeMs: 0 })),
		});
		assert.deepStrictEqual({
			rows: parent.querySelectorAll('.agent-host-factory-run-phase-row').length,
			expanded: parent.querySelectorAll('.agent-host-factory-run-phase[aria-expanded="true"]').length,
			bars: parent.querySelectorAll('.agent-host-factory-run-duration-bar').length,
		}, { rows: 8, expanded: 0, bars: 0 });
	});

	test('supports arrow and boundary navigation and keeps focus through live updates', async () => {
		const { parent, update } = await createEditor();
		const expanded = () => parent.querySelector<HTMLElement>('.agent-host-factory-run-phase[aria-expanded="true"]')!;
		expanded().focus();
		expanded().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[1].click();
		update({ ...phasedRun, revision: 2, updatedAt: 3 });
		const afterUpdate = {
			title: expanded().getAttribute('aria-label'),
			focused: mainWindow.document.activeElement === expanded(),
			tabStops: Array.from(parent.querySelectorAll<HTMLButtonElement>('.agent-host-factory-run-phase')).filter(button => button.tabIndex === 0).length,
			panelLabel: parent.querySelector('[role="region"]')?.getAttribute('aria-labelledby') === expanded().id,
		};
		const press = (key: string) => mainWindow.document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		press('End');
		const last = mainWindow.document.activeElement?.getAttribute('aria-label');
		press('ArrowDown');
		const wrapped = mainWindow.document.activeElement?.getAttribute('aria-label');
		press('ArrowUp');
		press('Home');

		assert.deepStrictEqual({ afterUpdate, last, wrapped, first: mainWindow.document.activeElement?.getAttribute('aria-label') }, {
			afterUpdate: { title: '2. Mode state, Pending', focused: true, tabStops: 8, panelLabel: true },
			last: '8. Verification, Pending',
			wrapped: '1. Availability, Active',
			first: '1. Availability, Active',
		});
	});

	test('pins inspection until follow is resumed and disposes replaced controls', async () => {
		const { parent, update } = await createEditor();
		const originalFirst = parent.querySelector<HTMLElement>('.agent-host-factory-run-phase')!;
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[2].click();
		originalFirst.click();
		const pinned = parent.querySelector('[aria-expanded="true"]')?.getAttribute('aria-label');
		update({
			...phasedRun,
			revision: 2,
			currentPhaseId: 'mode-state',
			phases: phasedRun.phases.map((phase, index) => ({ ...phase, status: index === 0 ? SessionFactoryRunPhaseStatus.Completed : index === 1 ? SessionFactoryRunPhaseStatus.Active : phase.status })),
		});
		const afterUpdate = parent.querySelector('[aria-expanded="true"]')?.getAttribute('aria-label');
		parent.querySelector<HTMLElement>('.agent-host-factory-run-follow')!.click();

		assert.deepStrictEqual({
			pinned,
			afterUpdate,
			followed: parent.querySelector('[aria-expanded="true"] .agent-host-factory-run-phase-title')?.textContent,
			following: parent.querySelector('.agent-host-factory-run-follow')?.getAttribute('aria-pressed'),
		}, {
			pinned: '3. Mode UI, Pending',
			afterUpdate: '3. Mode UI, Pending',
			followed: '2 · Mode state',
			following: 'true',
		});
	});

	test('follows new active phases by default and resets inspection when opening another run', async () => {
		const { parent, editor, update } = await createEditor();
		const next = {
			...phasedRun,
			revision: 2,
			currentPhaseId: 'mode-ui',
			phases: phasedRun.phases.map((phase, index) => ({ ...phase, status: index < 2 ? SessionFactoryRunPhaseStatus.Completed : index === 2 ? SessionFactoryRunPhaseStatus.Active : phase.status })),
		};
		update(next);
		const followed = parent.querySelector('[aria-expanded="true"] .agent-host-factory-run-phase-title')?.textContent;
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[7].click();
		const otherRun = { ...next, runId: 'other-run', currentPhaseId: 'mode-state' };
		update(otherRun);
		await editor.setInput(store.add(new AgentHostFactoryRunEditorInput(URI.parse('agent-host-copilot:/session'), otherRun.runId, otherRun.factoryName)), undefined, {}, CancellationToken.None);
		assert.deepStrictEqual({
			followed,
			reopened: parent.querySelector('[aria-expanded="true"] .agent-host-factory-run-phase-title')?.textContent,
			following: parent.querySelector('.agent-host-factory-run-follow')?.getAttribute('aria-pressed'),
		}, {
			followed: '3 · Mode UI',
			reopened: '2 · Mode state',
			following: 'true',
		});
	});

	test('retains agent button focus and phase scoping when progress updates', async () => {
		const initial: ISessionFactoryRun = {
			...phasedRun,
			agents: run.agents.map(agent => ({ ...agent, phaseId: 'availability', activeMs: 12_000 })),
			progress: [{ seq: 1, recordedAt: 2, phaseId: 'availability', kind: 'log', text: 'Inspecting the settings' }],
		};
		const { parent, update } = await createEditor(initial);
		parent.querySelector<HTMLElement>('button.agent-host-factory-run-agent-trace')!.focus();
		update({
			...initial,
			revision: 2,
			progress: [...initial.progress, { seq: 2, recordedAt: 3, phaseId: 'availability', kind: 'log', text: 'Checking policy' }],
		});
		const focused = mainWindow.document.activeElement?.getAttribute('aria-label');
		const progress = parent.querySelector('.agent-host-factory-run-progress')?.textContent;
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[1].click();
		assert.deepStrictEqual({
			focused,
			progress,
			pendingAgents: parent.querySelectorAll('.agent-host-factory-run-agent').length,
			pendingProgress: parent.querySelectorAll('.agent-host-factory-run-progress').length,
		}, {
			focused: 'View Trace for Reviewer',
			progress: 'Inspecting the settingsChecking policy',
			pendingAgents: 0,
			pendingProgress: 0,
		});
	});

	test('distinguishes pending and skipped phases with explicit empty states', async () => {
		const { parent } = await createEditor({
			...phasedRun,
			phases: phasedRun.phases.map((phase, index) => index === 2 ? { ...phase, status: SessionFactoryRunPhaseStatus.Skipped } : phase),
		});
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[1].click();
		const pending = parent.querySelector('.agent-host-factory-run-empty-phase')?.textContent;
		parent.querySelectorAll<HTMLElement>('.agent-host-factory-run-phase')[2].click();
		assert.deepStrictEqual({
			pending,
			skipped: parent.querySelector('.agent-host-factory-run-empty-phase')?.textContent,
			skippedMetrics: parent.querySelector('.status-skipped .agent-host-factory-run-duration'),
			emptyProgressSections: parent.querySelectorAll('.agent-host-factory-run-phase-detail h4').length,
		}, {
			pending: 'This phase has not started. Agents and progress will appear here when it is reached.',
			skipped: 'This phase was skipped.',
			skippedMetrics: null,
			emptyProgressSections: 0,
		});
	});

	test('keeps agents, outcomes and progress available for runs without declared phases', async () => {
		const { parent, editor, update } = await createEditor({
			...run,
			outcome: { error: 'Verification failed', resultText: '{"checked":2}', resultTruncated: true },
			progress: [{ seq: 1, recordedAt: 2, kind: 'log', text: 'Checking the implementation' }],
		});
		const rendered = {
			agents: parent.querySelectorAll('.agent-host-factory-run-agent').length,
			openableAgents: parent.querySelectorAll('button.agent-host-factory-run-agent-trace').length,
			progressCollapsed: !parent.querySelector<HTMLDetailsElement>('.agent-host-factory-run-progress-details')?.open,
			progress: parent.querySelector('.agent-host-factory-run-progress')?.textContent,
			error: parent.querySelector('.agent-host-factory-run-outcome-message')?.textContent,
			result: parent.querySelector('.agent-host-factory-run-result')?.textContent,
		};
		editor.clearInput();
		update({ ...run, revision: 2 });
		assert.deepStrictEqual({ rendered, cleared: parent.textContent }, {
			rendered: {
				agents: 3,
				openableAgents: 2,
				progressCollapsed: true,
				progress: 'Checking the implementation',
				error: 'Verification failed',
				result: '{"checked":2}',
			},
			cleared: '',
		});
	});

	test('opens an inline agent trace through the shared Agents-window chat command', async () => {
		const opened = new DeferredPromise<{ commandId: string; args: unknown[] }>();
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand(commandId: string, ...args: unknown[]) {
				await opened.complete({ commandId, args });
				return undefined;
			}
		}();
		const { parent } = await createEditor(run, commandService);
		const trace = parent.querySelector<HTMLElement>('button.agent-host-factory-run-agent-trace')!;
		assert.strictEqual(trace.getAttribute('aria-label'), 'View Trace for Reviewer');
		trace.click();

		assert.deepStrictEqual(await opened.p, {
			commandId: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
			args: [{
				chatResource: buildSubagentChatUri(backendSession, 'with-chat'),
				parentSessionResource: 'agent-host-copilot:/session',
				title: 'Reviewer',
				agentType: 'task',
				modelId: undefined,
				startedAt: undefined,
				duration: undefined,
				isActive: true,
			}],
		});
	});

	test('maps every agent launched under a tool-call id to its subagent chat', () => {
		assert.deepStrictEqual([...resolveFactoryRunAgentChats(run, backendSession)], [
			['with-chat', buildSubagentChatUri(backendSession, 'with-chat')],
			['without-chat', buildSubagentChatUri(backendSession, 'without-chat')],
		]);
	});

	test('round-trips the editor input through its serializer', () => {
		const sessionResource = URI.parse('agent-host-copilot:/session?x=1#chat');
		const input = store.add(new AgentHostFactoryRunEditorInput(sessionResource, 'run-1', 'review-changed'));
		const serializer = new AgentHostFactoryRunEditorInputSerializer();
		const restored = serializer.deserialize(undefined!, serializer.serialize(input)!);
		if (restored) {
			store.add(restored);
		}

		assert.deepStrictEqual({
			canSerialize: serializer.canSerialize(input),
			matches: restored ? input.matches(restored) : undefined,
			name: restored?.getName(),
			resource: restored?.resource?.toString(),
			malformed: serializer.deserialize(undefined!, '{"runId":1}'),
		}, {
			canSerialize: true,
			matches: true,
			name: 'review-changed',
			resource: AgentHostFactoryRunEditorInput.buildResource(sessionResource, 'run-1').toString(),
			malformed: undefined,
		});
	});
});
