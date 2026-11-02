/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IView } from '../../../../../workbench/common/views.js';
import { ISpotlightPayload, ISpotlightStep } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { WorkspaceHistoryLoadState } from '../../../../common/workspaceSelection.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IOpenNewSessionResult, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionChangesSummary } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { SessionsList } from '../../../sessions/browser/views/sessionsList.js';
import { SessionsView } from '../../../sessions/browser/views/sessionsView.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { GetStartedItemId } from '../../common/getStartedChecklist.js';
import { GetStartedTourRunner } from '../../browser/getStartedTourRunner.js';

interface IRunnerScenario {
	readonly sessions: readonly ISession[];
	/** The session shown in the window, or none for the new-session view. */
	readonly active?: ISession;
	/** What the Changes view reports for the active session. */
	readonly activeChanges?: ISessionChangesSummary;
	readonly recents?: readonly { readonly label: string; readonly source: IRecentWorkspace['source'] }[];
	readonly historyLoadState?: IObservable<WorkspaceHistoryLoadState>;
}

function changes(files: number): ISessionChangesSummary {
	return { files, additions: files * 3, deletions: 0 };
}

/** A session last updated the given number of minutes ago, so the tours see a stable order. */
function testSession(title: string, minutesAgo: number, options: Parameters<typeof createTestSession>[1]): ISession {
	return { ...createTestSession(title, options).session, updatedAt: constObservable(new Date(Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60_000)) };
}

suite('GetStartedTourRunner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function toActiveSession(session: ISession): IActiveSession {
		return new class extends mock<IActiveSession>() {
			override readonly resource = session.resource;
			override readonly isCreated = constObservable(true);
			override readonly isArchived = session.isArchived;
			override readonly changesSummary = session.changesSummary;
		}();
	}

	/** Runs an item's tour, resolving its steps like the spotlight presentation does when the tour starts. */
	async function runTour(item: GetStartedItemId, scenario: IRunnerScenario) {
		const events: string[] = [];
		let steps: readonly ISpotlightStep[] = [];
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', scenario.active && toActiveSession(scenario.active));
		const list = new class extends mock<SessionsList>() {
			override revealSessionWorkspaceForOnboarding(session: ISession): IDisposable & { readonly targetId: string } {
				events.push(`reveal ${session.title.get()}`);
				return { targetId: `sessions.section.workspace:${session.workspace.get()?.label}`, dispose: () => events.push('release reveal') };
			}
		}();
		const view = new class extends mock<SessionsView>() {
			override sessionsControl = list;
			override setExpanded(): boolean { return true; }
		}();

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IOnboardingScenarioService, new class extends mock<IOnboardingScenarioService>() {
			override async runScenario(id: string): Promise<OnboardingOutcome> {
				const registered = onboardingScenarioRegistry.getScenario(id) as IOnboardingScenario<ISpotlightPayload> | undefined;
				steps = await registered?.presentation.payload.resolveSteps?.() ?? [];
				for (const step of steps) {
					await step.onBeforeShow?.();
				}
				return OnboardingOutcome.Completed;
			}
		}());
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override async openView<T extends IView>(): Promise<T | null> {
				return view as unknown as T;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override async openSession(resource: URI): Promise<void> {
				events.push(`open session ${resource.authority}`);
				const opened = scenario.sessions.find(candidate => extUri.isEqual(candidate.resource, resource));
				activeSession.set(opened && toActiveSession(opened), undefined);
			}
			override async openNewSession(): Promise<IOpenNewSessionResult> {
				events.push('open new session');
				activeSession.set(undefined, undefined);
				return { session: undefined, trustDeclined: false };
			}
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSessions(): ISession[] { return [...scenario.sessions]; }
		}());
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesSummaryObs = constObservable(scenario.activeChanges);
		}());
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(id: string): Promise<R | undefined> {
				events.push(`run ${id}`);
				return undefined;
			}
		}());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditorPane = undefined;
		}());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override isVisible(): boolean { return true; }
		}());
		instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
			override hideCustomView(): void { }
			override showCustomView(id: string): void { events.push(`show ${id}`); }
		}());
		instantiationService.stub(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly historyLoadState = scenario.historyLoadState ?? constObservable<WorkspaceHistoryLoadState>('loaded');
			override getRecentWorkspaces(): IRecentWorkspace[] {
				return (scenario.recents ?? []).map(({ label, source }) => ({
					workspace: { uri: URI.file(`/projects/${label}`), label, icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false },
					providerId: 'local',
					checked: false,
					source,
				}));
			}
		}());
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		}());

		const runner = disposables.add(instantiationService.createInstance(GetStartedTourRunner));
		const outcome = await runner.run(item);
		return {
			outcome,
			steps: steps.map(step => `${step.id}: ${typeof step.description === 'string' ? step.description : step.description.value}`),
			events,
			registered: !!onboardingScenarioRegistry.getScenario(`sessions.getStarted.showMe.${item}`),
		};
	}

	test('the second-project tour names the current project, and suggests other recent projects from the editor window first', async () => {
		const sessions = [
			testSession('Add tests', 30, { workspaceLabel: 'todo-app' }),
			testSession('Fix login', 5, { workspaceLabel: 'todo-app' }),
		];
		assert.deepStrictEqual({
			editorProjects: await runTour(GetStartedItemId.SecondProject, {
				sessions,
				active: sessions[0],
				recents: [
					{ label: 'todo-app', source: 'agents' },
					{ label: 'notes-app', source: 'agents' },
					{ label: 'weather-api', source: 'vscode' },
					{ label: 'docs-site', source: 'vscodeWorkspace' },
					{ label: 'todo-app', source: 'vscode' },
					{ label: 'recipes', source: 'vscode' },
				],
			}),
			agentsWindowProjectsOnly: (await runTour(GetStartedItemId.SecondProject, { sessions, recents: [{ label: 'todo-app', source: 'agents' }, { label: 'notes-app', source: 'agents' }] })).steps,
			noSessions: (await runTour(GetStartedItemId.SecondProject, { sessions: [] })).steps,
		}, {
			editorProjects: {
				outcome: OnboardingOutcome.Completed,
				steps: [
					'currentProject: You\'ve worked in **todo-app** from this window. The sessions of every project you work on show up in this list.',
					'workspacePicker: You can work on **weather-api** or **docs-site** from here too, without opening another window.',
				],
				events: ['reveal Fix login', 'open new session', 'release reveal'],
				registered: false,
			},
			agentsWindowProjectsOnly: [
				'currentProject: You\'ve worked in **todo-app** from this window. The sessions of every project you work on show up in this list.',
				'workspacePicker: You can work on **notes-app** from here too, without opening another window.',
			],
			noSessions: ['workspacePicker: Pick any folder or repository for your next session, without opening another window.'],
		});
	});

	test('the second-project tour waits a moment for the recent projects of the editor window', () => runWithFakedTimers({}, async () => {
		const historyLoadState = observableValue<WorkspaceHistoryLoadState>('history', 'loading');
		const tour = runTour(GetStartedItemId.SecondProject, { sessions: [], historyLoadState, recents: [{ label: 'weather-api', source: 'vscode' }] });
		await timeout(500);
		historyLoadState.set('loaded', undefined);
		assert.deepStrictEqual((await tour).steps, ['workspacePicker: You can work on **weather-api** from here too, without opening another window.']);
	}));

	test('the keep-changes tour reviews the active session, or else the most recent session with changes', async () => {
		const plan = testSession('Plan release', 1, { workspaceLabel: 'todo-app' });
		const login = testSession('Fix login', 10, { workspaceLabel: 'todo-app', changesSummary: changes(2) });
		const docs = testSession('Update docs', 60, { workspaceLabel: 'docs-site', changesSummary: changes(5) });
		const viewChanges = 'run workbench.agentSessions.action.viewChanges';
		assert.deepStrictEqual({
			activeWithChanges: await runTour(GetStartedItemId.KeepChanges, { sessions: [plan, login, docs], active: docs, activeChanges: changes(1) }),
			activeWithoutChanges: await runTour(GetStartedItemId.KeepChanges, { sessions: [plan, login, docs], active: plan }),
			noChanges: await runTour(GetStartedItemId.KeepChanges, { sessions: [plan], active: plan }),
		}, {
			activeWithChanges: {
				outcome: OnboardingOutcome.Completed,
				steps: [
					'changesPill: This session changed 1 file. Select the changes to review them.',
					'changesEditor: Review each change in the diff editor you know from VS Code. You can edit the files, or comment on a line to give the agent feedback.',
					'keepChanges: When the changes look good, merge, commit or create a pull request to keep them.',
				],
				events: [viewChanges],
				registered: false,
			},
			activeWithoutChanges: {
				outcome: OnboardingOutcome.Completed,
				steps: [
					'changesPill: This session changed 2 files. Select the changes to review them.',
					'changesEditor: Review each change in the diff editor you know from VS Code. You can edit the files, or comment on a line to give the agent feedback.',
					'keepChanges: When the changes look good, merge, commit or create a pull request to keep them.',
				],
				events: ['open session Fix login', viewChanges],
				registered: false,
			},
			noChanges: {
				outcome: OnboardingOutcome.Completed,
				steps: [
					'newSession: Select New to start a session that changes some code.',
					'prompt: Ask an agent to change some code. When it\'s done, you can review its changes in the editor and keep the ones you want.',
				],
				events: ['open new session'],
				registered: false,
			},
		});
	});

	test('the automation tour opens Automations for its templates and create steps', async () => {
		assert.deepStrictEqual((await runTour(GetStartedItemId.Automation, { sessions: [] })).events, [
			'show sessions.customView.automations',
			'show sessions.customView.automations',
		]);
	});
});
