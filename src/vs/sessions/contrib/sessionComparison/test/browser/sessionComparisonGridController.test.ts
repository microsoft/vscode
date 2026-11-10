/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsHostLayoutService } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { SessionComparisonGridController } from '../../browser/sessionComparisonGridController.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionComparisonConstants.js';
import { ITestSessionWithChat, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('Session comparison grid controller', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options?: {
		readonly attemptsOnly?: boolean;
		readonly attemptCount?: 2 | 3;
		readonly hideInactiveInputs?: boolean;
		readonly screenReaderOptimized?: boolean;
		readonly comparisonAvailable?: boolean;
		readonly comparisonArchived?: boolean;
	}) {
		const judgeChat = observableValue('judgeChat', upcastPartial<IChat>({ resource: URI.parse('test:///judge') }));
		const judge = upcastPartial<ITestSessionWithChat>({
			sessionId: 'judge', resource: URI.parse('test:///judge'),
			activeChat: judgeChat,
		});
		const attempt = upcastPartial<ITestSessionWithChat>({ sessionId: 'attempt', resource: URI.parse('test:///attempt') });
		const attempt2 = upcastPartial<ITestSessionWithChat>({ sessionId: 'attempt-2', resource: URI.parse('test:///attempt-2') });
		const attempt3 = upcastPartial<ITestSessionWithChat>({ sessionId: 'attempt-3', resource: URI.parse('test:///attempt-3') });
		const unrelated = upcastPartial<ITestSessionWithChat>({ sessionId: 'unrelated', resource: URI.parse('test:///unrelated') });
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			prompt: 'Implement',
			createdAt: 0,
			workspace: URI.file('/repo'),
			...(options?.comparisonArchived ? { archivedAt: 1 } : {}),
			participants: [{
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judge.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Judge' },
			}, {
				id: 'attempt',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Attempt' },
			}, {
				id: 'attempt-2',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt2.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Attempt 2' },
			}, {
				id: 'attempt-3',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt3.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Attempt 3' },
			}],
		};
		const focused = store.add(new Emitter<string>());
		const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', attempt);
		const visibleSessions = observableValue<readonly (ITestSessionWithChat | undefined)[]>('visibleSessions', options?.attemptsOnly
			? [attempt, attempt2, attempt3].slice(0, options.attemptCount ?? 2)
			: [judge, attempt]);
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', options?.comparisonAvailable === false ? [] : [comparison]);
		const closed: string[] = [];
		const shownOnly: string[] = [];
		const collapsedTo: Array<string | undefined> = [];
		const hiddenParts: Array<{ hidden: boolean; part: Parts }> = [];
		const partVisibility = new Map<Parts, boolean>([
			[Parts.EDITOR_PART, true],
			[Parts.AUXILIARYBAR_PART, true],
		]);
		const onDidChangePartVisibility = store.add(new Emitter<{ partId: Parts; visible: boolean }>());
		const mainContainer = mainWindow.document.createElement('div');
		const configurationService = new TestConfigurationService({
			[HIDE_INACTIVE_COMPARISON_INPUTS_SETTING]: options?.hideInactiveInputs ?? false,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const screenReaderOptimizedChanged = store.add(new Emitter<void>());
		let screenReaderOptimized = options?.screenReaderOptimized ?? false;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeScreenReaderOptimized = screenReaderOptimizedChanged.event;
			override isScreenReaderOptimized(): boolean {
				return screenReaderOptimized;
			}
		}());
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override readonly onDidFocusPane = focused.event;
		}());
		// The panes of the grid, one per session it shows: a detached pane shows one chat of its session. Its id is the chat it
		// shows of its own, else its session, else the new-session slot's.
		const paneObjects = new Map<ITestSessionWithChat | undefined, ISessionGridPane>();
		const paneOf = (session: ITestSessionWithChat | undefined) => {
			let pane = paneObjects.get(session);
			if (!pane) {
				pane = upcastPartial<ISessionGridPane>({
					id: session?.detachedChat?.toString() ?? session?.sessionId ?? 'new-session',
					kind: session?.detachedChat ? SessionGridPaneKind.Detached : SessionGridPaneKind.Slot,
					session: constObservable(session),
					chat: session ? session.activeChat : constObservable(undefined),
				});
				paneObjects.set(session, pane);
			}
			return pane;
		};
		const panes = derived(reader => visibleSessions.read(reader).map(paneOf));
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly gridShown = visibleSessions;
			override readonly slotPanes = testGridPanes(this.gridShown);
			override readonly panes = panes;
			override readonly activePane = derived(reader => {
				const active = activeSession.read(reader);
				return panes.read(reader).find(pane => pane.session.read(reader) === active);
			});
			override closePane(pane: ISessionGridPane): void {
				this.closeSession(pane.session.get());
			}
			override collapseToPane(pane: ISessionGridPane): void {
				this.collapseTo(pane.session.get() as ITestSessionWithChat | undefined);
			}
			override closeSession(session: ISession | undefined): void {
				if (session) {
					closed.push(session.sessionId);
					const remaining = visibleSessions.get().filter(candidate => candidate?.sessionId !== session.sessionId);
					transaction(tx => {
						visibleSessions.set(remaining, tx);
						if (activeSession.get()?.sessionId === session.sessionId) {
							activeSession.set(remaining[0], tx);
						}
					});
				}
			}
			override showSession(resource: URI): void {
				const session = [judge, attempt, attempt2, attempt3, unrelated].find(candidate => candidate.resource.toString() === resource.toString())!;
				shownOnly.push(session.sessionId);
				activeSession.set(session, undefined);
			}
			collapseTo(session: ITestSessionWithChat | undefined): void {
				collapsedTo.push(session?.sessionId);
				transaction(tx => {
					visibleSessions.set([session], tx);
					activeSession.set(session, tx);
				});
			}
		}());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override readonly comparisons = comparisons;
			override getComparisonForSession(resource: URI): ISessionComparison | undefined {
				return comparison.participants.some(participant => participant.sessionResource?.toString() === resource.toString())
					? comparison
					: undefined;
			}
		}());
		const agentLayoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event as IWorkbenchLayoutService['onDidChangePartVisibility'];
			override isVisible(part: Parts): boolean {
				return partVisibility.get(part) ?? false;
			}
			override setPartHidden(hidden: boolean, part: Parts): void {
				partVisibility.set(part, !hidden);
				hiddenParts.push({ hidden, part });
			}
			override suppressEditorPartAutoVisibility() {
				return toDisposable(() => { });
			}
		}();
		instantiationService.stub(IAgentWorkbenchLayoutService, agentLayoutService);
		instantiationService.stub(ISessionsHostLayoutService, agentLayoutService);
		store.add(instantiationService.createInstance(SessionComparisonGridController));
		return {
			judge,
			judgeChat,
			attempt,
			attempt2,
			attempt3,
			unrelated,
			comparison,
			focused,
			activeSession,
			visibleSessions,
			comparisons,
			closed,
			shownOnly,
			collapsedTo,
			hiddenParts,
			partVisibility,
			onDidChangePartVisibility,
			mainContainer,
			configurationService,
			setScreenReaderOptimized(value: boolean) {
				screenReaderOptimized = value;
				screenReaderOptimizedChanged.fire();
			},
		};
	}

	test('restores initially hidden parts and honors explicit opens', () => {
		const fixture = setup();
		assert.deepStrictEqual(fixture.hiddenParts, [
			{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			{ hidden: true, part: Parts.EDITOR_PART },
		]);

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		fixture.visibleSessions.set([fixture.attempt], undefined);

		assert.deepStrictEqual(fixture.hiddenParts, [
			{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			{ hidden: true, part: Parts.EDITOR_PART },
			{ hidden: false, part: Parts.AUXILIARYBAR_PART },
		]);
	});

	test('closes other panes on the first Judge focus', () => {
		const fixture = setup();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: [], closed: [] });
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: ['judge'], closed: ['attempt'] });

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.strictEqual(fixture.partVisibility.get(Parts.EDITOR_PART), true);
		fixture.judgeChat.set(upcastPartial<IChat>({ resource: fixture.judge.resource.with({ fragment: 'peer' }) }), undefined);
		assert.deepStrictEqual({
			editorVisible: fixture.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: fixture.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, { editorVisible: true, auxiliaryBarVisible: true });
	});

	test('closes other panes when Judge becomes active without a focus event', async () => {
		const fixture = setup();

		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: ['judge'], closed: ['attempt'] });
	});

	test('does not collapse when a tiled attempt receives focus', async () => {
		const fixture = setup();
		await Promise.resolve();
		fixture.focused.fire('attempt');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: [], closed: [] });
	});

	test('collapses a comparison Judge from a multi-session layout', () => {
		const fixture = setup();
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: ['judge'], closed: ['attempt'] });
	});

	test('distinguishes nested attempt and Judge panes sharing one session', async () => {
		const fixture = setup();
		const resource = URI.parse('test:/parent');
		const pane = (id: string) => upcastPartial<ITestSessionWithChat>({
			sessionId: 'parent', resource,
			detachedChat: resource.with({ fragment: id }),
			activeChat: constObservable(upcastPartial<IChat>({ resource: resource.with({ fragment: id }) })),
		});
		const attempt = pane('attempt');
		const judge = pane('judge');
		transaction(tx => {
			fixture.comparisons.set([{
				...fixture.comparison, sessionResource: resource,
				participants: fixture.comparison.participants.map(participant => ({
					...participant, sessionResource: resource, chatResource: resource.with({ fragment: participant.id }),
				})),
			}], tx);
			fixture.visibleSessions.set([attempt, judge], tx);
			fixture.activeSession.set(attempt, tx);
		});
		await Promise.resolve();
		const attemptPaneCount = fixture.visibleSessions.get().length;
		fixture.activeSession.set(judge, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			attemptPaneCount,
			chats: fixture.visibleSessions.get().map(session => session?.activeChat.get().resource.toString()),
			active: fixture.activeSession.get()?.activeChat.get().resource.toString(),
		}, { attemptPaneCount: 2, chats: ['test:/parent#judge'], active: 'test:/parent#judge' });
	});

	test('an active detached Judge pane of the session its parent pane shows is the collapse survivor and the judge', async () => {
		const fixture = setup();
		const resource = URI.parse('test:/parent');
		const chat = (id: string) => upcastPartial<IChat>({ resource: resource.with({ fragment: id }) });
		const parent = upcastPartial<ITestSessionWithChat>({ sessionId: 'parent', resource, activeChat: constObservable(chat('attempt')) });
		const judge = upcastPartial<ITestSessionWithChat>({
			sessionId: 'parent', resource, detachedChat: chat('judge').resource, activeChat: constObservable(chat('judge')),
		});
		transaction(tx => {
			fixture.comparisons.set([{
				...fixture.comparison, sessionResource: resource,
				participants: fixture.comparison.participants.map(participant => ({
					...participant, sessionResource: resource, chatResource: chat(participant.id).resource,
				})),
			}], tx);
			fixture.visibleSessions.set([parent, judge], tx);
			fixture.activeSession.set(parent, tx);
		});
		await Promise.resolve();
		const before = fixture.visibleSessions.get().length;
		fixture.activeSession.set(judge, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			before,
			survivors: fixture.visibleSessions.get().map(session => session === judge ? 'judge pane' : session === parent ? 'parent pane' : 'other'),
			active: fixture.activeSession.get() === judge ? 'judge pane' : 'other',
		}, { before: 2, survivors: ['judge pane'], active: 'judge pane' });
	});

	for (const nextChat of ['attempt-2', 'ordinary']) {
		test(`restores side panes when switching from an isolated nested Judge to ${nextChat}`, async () => {
			const fixture = setup();
			const resource = URI.parse('test:/parent');
			const chat = (id: string) => upcastPartial<IChat>({ resource: resource.with({ fragment: id }) });
			const currentChat = observableValue('chat', chat('attempt-2'));
			const parent = upcastPartial<ITestSessionWithChat>({ sessionId: 'parent', resource, activeChat: currentChat });
			const attempt = upcastPartial<ITestSessionWithChat>({
				sessionId: 'parent', resource, detachedChat: chat('attempt').resource, activeChat: constObservable(chat('attempt')),
			});
			transaction(tx => {
				fixture.comparisons.set([{
					...fixture.comparison, sessionResource: resource,
					participants: fixture.comparison.participants.map(participant => ({
						...participant, sessionResource: resource, chatResource: chat(participant.id).resource,
					})),
				}], tx);
				fixture.visibleSessions.set([attempt, parent], tx);
				fixture.activeSession.set(parent, tx);
			});
			await Promise.resolve();
			const before = fixture.visibleSessions.get().length;
			currentChat.set(chat('judge'), undefined);
			await Promise.resolve();
			const isolated = {
				paneCount: fixture.visibleSessions.get().length,
				activeChat: fixture.activeSession.get()?.activeChat.get().resource.toString(),
				editorVisible: fixture.partVisibility.get(Parts.EDITOR_PART),
				auxiliaryBarVisible: fixture.partVisibility.get(Parts.AUXILIARYBAR_PART),
			};
			currentChat.set(chat(nextChat), undefined);
			await Promise.resolve();
			assert.deepStrictEqual({
				before, isolated,
				editorVisible: fixture.partVisibility.get(Parts.EDITOR_PART),
				auxiliaryBarVisible: fixture.partVisibility.get(Parts.AUXILIARYBAR_PART),
			}, {
				before: 2,
				isolated: { paneCount: 1, activeChat: 'test:/parent#judge', editorVisible: false, auxiliaryBarVisible: false },
				editorVisible: true, auxiliaryBarVisible: true,
			});
		});
	}

	test('does not collapse unrelated multi-session layouts', async () => {
		const fixture = setup({ comparisonAvailable: false });
		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed }, { shownOnly: [], closed: [] });
	});

	test('ignores archived comparisons for layout and Judge isolation', async () => {
		const fixture = setup({ comparisonArchived: true });
		fixture.focused.fire('judge');
		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			shownOnly: fixture.shownOnly,
			closed: fixture.closed,
			gridActive: fixture.mainContainer.classList.contains('session-comparison-grid-active'),
			editorVisible: fixture.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: fixture.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			shownOnly: [],
			closed: [],
			gridActive: false,
			editorVisible: true,
			auxiliaryBarVisible: true,
		});
	});

	test('closes the comparison grid when an unrelated session replaces one attempt', async () => {
		const fixture = setup({ attemptsOnly: true, attemptCount: 3 });

		fixture.visibleSessions.set([fixture.attempt, fixture.attempt2, fixture.unrelated], undefined);
		fixture.activeSession.set(fixture.unrelated, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			visible: fixture.visibleSessions.get().map(session => session?.sessionId),
			active: fixture.activeSession.get()?.sessionId,
			closed: fixture.closed,
			shownOnly: fixture.shownOnly,
			collapsedTo: fixture.collapsedTo,
		}, {
			visible: ['unrelated'],
			active: 'unrelated',
			closed: [],
			shownOnly: [],
			collapsedTo: ['unrelated'],
		});
	});

	test('closes the comparison grid around a new-session replacement when its group is deleted', async () => {
		const fixture = setup({ attemptsOnly: true, attemptCount: 3 });

		fixture.comparisons.set([], undefined);
		fixture.visibleSessions.set([fixture.attempt, fixture.attempt2, undefined], undefined);
		fixture.activeSession.set(undefined, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			visible: fixture.visibleSessions.get().map(session => session?.sessionId),
			active: fixture.activeSession.get()?.sessionId,
			closed: fixture.closed,
			shownOnly: fixture.shownOnly,
			collapsedTo: fixture.collapsedTo,
		}, {
			visible: [undefined],
			active: undefined,
			closed: [],
			shownOnly: [],
			collapsedTo: [undefined],
		});
	});

	test('does not collapse when switching directly to another comparison', async () => {
		const fixture = setup({ attemptsOnly: true, attemptCount: 3 });
		const nextComparison = { ...fixture.comparison, id: 'next-comparison' };

		fixture.comparisons.set([], undefined);
		fixture.comparisons.set([nextComparison], undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			visible: fixture.visibleSessions.get().map(session => session?.sessionId),
			closed: fixture.closed,
			shownOnly: fixture.shownOnly,
		}, {
			visible: ['attempt', 'attempt-2', 'attempt-3'],
			closed: [],
			shownOnly: [],
		});
	});

	test('shows inputs by default and hides inactive inputs only in comparison grids with three or more panes', async () => {
		const defaultGrid = setup({ attemptsOnly: true, attemptCount: 3 });
		const twoAttemptGrid = setup({ attemptsOnly: true, attemptCount: 2, hideInactiveInputs: true });
		const enabledGrid = setup({ attemptsOnly: true, attemptCount: 3, hideInactiveInputs: true });
		const mixedGrid = setup({ hideInactiveInputs: true });
		const mixedThreePaneGrid = setup({ hideInactiveInputs: true });
		mixedThreePaneGrid.visibleSessions.set([mixedThreePaneGrid.judge, mixedThreePaneGrid.attempt, mixedThreePaneGrid.attempt2], undefined);
		const screenReaderGrid = setup({ attemptsOnly: true, attemptCount: 3, hideInactiveInputs: true, screenReaderOptimized: true });
		const className = 'session-comparison-hide-inactive-inputs';
		const activeClassName = 'session-comparison-grid-active';
		const shownByDefault = !defaultGrid.mainContainer.classList.contains(className);
		const hiddenWhenEnabled = enabledGrid.mainContainer.classList.contains(className);

		enabledGrid.setScreenReaderOptimized(true);
		const disabledForScreenReader = enabledGrid.mainContainer.classList.contains(className);
		enabledGrid.setScreenReaderOptimized(false);
		const restoredAfterScreenReader = enabledGrid.mainContainer.classList.contains(className);
		await enabledGrid.configurationService.setUserConfiguration(HIDE_INACTIVE_COMPARISON_INPUTS_SETTING, false);
		enabledGrid.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === HIDE_INACTIVE_COMPARISON_INPUTS_SETTING,
		}));
		const disabledBySetting = enabledGrid.mainContainer.classList.contains(className);
		enabledGrid.visibleSessions.set([enabledGrid.attempt], undefined);
		const afterLeavingGrid = enabledGrid.mainContainer.classList.contains(className);

		assert.deepStrictEqual({
			shownByDefault,
			hiddenWhenEnabled,
			twoAttemptGrid: twoAttemptGrid.mainContainer.classList.contains(className),
			disabledForScreenReader,
			restoredAfterScreenReader,
			disabledBySetting,
			afterLeavingGrid,
			mixedGrid: mixedGrid.mainContainer.classList.contains(className),
			mixedThreePaneGrid: mixedThreePaneGrid.mainContainer.classList.contains(className),
			screenReaderGrid: screenReaderGrid.mainContainer.classList.contains(className),
			defaultComparisonGrid: defaultGrid.mainContainer.classList.contains(activeClassName),
			mixedComparisonGrid: mixedGrid.mainContainer.classList.contains(activeClassName),
			afterLeavingComparisonGrid: enabledGrid.mainContainer.classList.contains(activeClassName),
		}, {
			shownByDefault: true,
			hiddenWhenEnabled: true,
			twoAttemptGrid: false,
			disabledForScreenReader: false,
			restoredAfterScreenReader: true,
			disabledBySetting: false,
			afterLeavingGrid: false,
			mixedGrid: false,
			mixedThreePaneGrid: true,
			screenReaderGrid: false,
			defaultComparisonGrid: true,
			mixedComparisonGrid: true,
			afterLeavingComparisonGrid: false,
		});
	});
});
