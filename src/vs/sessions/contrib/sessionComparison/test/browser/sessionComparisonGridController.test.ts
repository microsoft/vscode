/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsPartService, SessionGridLayout } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonGridController } from '../../browser/sessionComparisonGridController.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../../common/sessionComparison.js';

suite('Session comparison grid controller', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(initialLayout: SessionGridLayout = 'grid', options?: { readonly attemptsOnly?: boolean; readonly hideInactiveInputs?: boolean }) {
		const judge = upcastPartial<IActiveSession>({ sessionId: 'judge', resource: URI.parse('test:///judge') });
		const attempt = upcastPartial<IActiveSession>({ sessionId: 'attempt', resource: URI.parse('test:///attempt') });
		const attempt2 = upcastPartial<IActiveSession>({ sessionId: 'attempt-2', resource: URI.parse('test:///attempt-2') });
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			prompt: 'Implement',
			createdAt: 0,
			workspace: URI.file('/repo'),
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
			}],
		};
		const focused = store.add(new Emitter<string>());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', attempt);
		const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', options?.attemptsOnly ? [attempt, attempt2] : [judge, attempt]);
		const sessionGridLayout = observableValue<SessionGridLayout>('sessionGridLayout', initialLayout);
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const closed: Array<string | undefined> = [];
		const shownOnly: string[] = [];
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
		let resetCount = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override readonly onDidFocusSession = focused.event;
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly visibleSessions = visibleSessions;
			override readonly sessionGridLayout = sessionGridLayout;
			override closeSession(session: ISession | undefined): void {
				closed.push(session?.sessionId);
				visibleSessions.set(visibleSessions.get().filter(candidate => candidate.sessionId !== session?.sessionId), undefined);
			}
			override resetSessionGridLayout(): void {
				resetCount++;
				sessionGridLayout.set('columns', undefined);
			}
			override showOnlySession(session: ISession): void {
				shownOnly.push(session.sessionId);
				visibleSessions.set([session as IActiveSession], undefined);
				activeSession.set(session as IActiveSession, undefined);
				sessionGridLayout.set('columns', undefined);
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
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
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
		}());
		store.add(instantiationService.createInstance(SessionComparisonGridController));
		return { judge, attempt, attempt2, focused, activeSession, visibleSessions, sessionGridLayout, comparisons, closed, shownOnly, hiddenParts, partVisibility, onDidChangePartVisibility, mainContainer, configurationService, get resetCount() { return resetCount; } };
	}

	test('keeps the whole side pane hidden while an attempt comparison grid is visible', () => {
		const fixture = setup();
		assert.deepStrictEqual(fixture.hiddenParts, [
			{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			{ hidden: true, part: Parts.EDITOR_PART },
		]);

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual(fixture.hiddenParts.at(-1), { hidden: true, part: Parts.EDITOR_PART });
	});

	test('closes other panes on the first Judge focus', () => {
		const fixture = setup();

		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, { closed: [], resetCount: 0 });
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed, resetCount: fixture.resetCount }, {
			shownOnly: ['judge'],
			closed: [],
			resetCount: 0,
		});

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.deepStrictEqual(fixture.hiddenParts.at(-1), { hidden: true, part: Parts.EDITOR_PART });
	});

	test('closes other panes when Judge becomes active without a focus event', async () => {
		const fixture = setup();

		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed, resetCount: fixture.resetCount }, {
			shownOnly: ['judge'],
			closed: [],
			resetCount: 0,
		});
	});

	test('does not collapse when a tiled attempt receives focus', async () => {
		const fixture = setup();
		await Promise.resolve();
		fixture.focused.fire('attempt');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed, resetCount: fixture.resetCount }, { shownOnly: [], closed: [], resetCount: 0 });
	});

	test('collapses a comparison Judge from an ordinary multi-session columns layout', () => {
		const fixture = setup('columns');
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed, resetCount: fixture.resetCount }, {
			shownOnly: ['judge'],
			closed: [],
			resetCount: 0,
		});
	});

	test('does not collapse unrelated multi-session columns', async () => {
		const fixture = setup('columns');
		fixture.comparisons.set([], undefined);
		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly, closed: fixture.closed, resetCount: fixture.resetCount }, { shownOnly: [], closed: [], resetCount: 0 });
	});

	test('marks only enabled attempt grids for inactive input hiding', async () => {
		const attemptGrid = setup('grid', { attemptsOnly: true });
		const mixedGrid = setup('grid', { hideInactiveInputs: true });
		const className = 'session-comparison-hide-inactive-inputs';
		const before = attemptGrid.mainContainer.classList.contains(className);

		await attemptGrid.configurationService.setUserConfiguration(HIDE_INACTIVE_COMPARISON_INPUTS_SETTING, true);
		attemptGrid.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === HIDE_INACTIVE_COMPARISON_INPUTS_SETTING,
		}));
		const enabled = attemptGrid.mainContainer.classList.contains(className);
		attemptGrid.sessionGridLayout.set('columns', undefined);
		const afterLeavingGrid = attemptGrid.mainContainer.classList.contains(className);

		assert.deepStrictEqual({
			before,
			enabled,
			afterLeavingGrid,
			mixedGrid: mixedGrid.mainContainer.classList.contains(className),
		}, {
			before: false,
			enabled: true,
			afterLeavingGrid: false,
			mixedGrid: false,
		});
	});
});
