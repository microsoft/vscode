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
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonGridController } from '../../browser/sessionComparisonGridController.js';
import { HIDE_INACTIVE_COMPARISON_INPUTS_SETTING } from '../../common/sessionComparison.js';

suite('Session comparison grid controller', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options?: { readonly attemptsOnly?: boolean; readonly attemptCount?: 2 | 3; readonly hideInactiveInputs?: boolean; readonly screenReaderOptimized?: boolean }) {
		const judge = upcastPartial<IActiveSession>({ sessionId: 'judge', resource: URI.parse('test:///judge') });
		const attempt = upcastPartial<IActiveSession>({ sessionId: 'attempt', resource: URI.parse('test:///attempt') });
		const attempt2 = upcastPartial<IActiveSession>({ sessionId: 'attempt-2', resource: URI.parse('test:///attempt-2') });
		const attempt3 = upcastPartial<IActiveSession>({ sessionId: 'attempt-3', resource: URI.parse('test:///attempt-3') });
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
			}, {
				id: 'attempt-3',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt3.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Attempt 3' },
			}],
		};
		const focused = store.add(new Emitter<string>());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', attempt);
		const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', options?.attemptsOnly
			? [attempt, attempt2, attempt3].slice(0, options.attemptCount ?? 2)
			: [judge, attempt]);
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
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
			override readonly onDidFocusSession = focused.event;
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly visibleSessions = visibleSessions;
			override async openSessionsInGrid(sessions: readonly ISession[]): Promise<void> {
				shownOnly.push(...sessions.map(session => session.sessionId));
				visibleSessions.set(sessions as readonly IActiveSession[], undefined);
				activeSession.set(sessions[0] as IActiveSession, undefined);
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
		return {
			judge,
			attempt,
			attempt2,
			attempt3,
			focused,
			activeSession,
			visibleSessions,
			comparisons,
			shownOnly,
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
		fixture.comparisons.set([], undefined);

		assert.deepStrictEqual(fixture.hiddenParts, [
			{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			{ hidden: true, part: Parts.EDITOR_PART },
			{ hidden: false, part: Parts.AUXILIARYBAR_PART },
		]);
	});

	test('closes other panes on the first Judge focus', () => {
		const fixture = setup();

		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly }, {
			shownOnly: ['judge'],
		});

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.strictEqual(fixture.partVisibility.get(Parts.EDITOR_PART), true);
	});

	test('closes other panes when Judge becomes active without a focus event', async () => {
		const fixture = setup();

		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly }, {
			shownOnly: ['judge'],
		});
	});

	test('does not collapse when a tiled attempt receives focus', async () => {
		const fixture = setup();
		await Promise.resolve();
		fixture.focused.fire('attempt');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly }, { shownOnly: [] });
	});

	test('collapses a comparison Judge from a multi-session layout', () => {
		const fixture = setup();
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly }, {
			shownOnly: ['judge'],
		});
	});

	test('does not collapse unrelated multi-session layouts', async () => {
		const fixture = setup();
		fixture.comparisons.set([], undefined);
		fixture.activeSession.set(fixture.judge, undefined);
		await Promise.resolve();

		assert.deepStrictEqual({ shownOnly: fixture.shownOnly }, { shownOnly: [] });
	});

	test('shows inputs by default and hides inactive inputs only when enabled for three or more attempts', async () => {
		const defaultGrid = setup({ attemptsOnly: true, attemptCount: 3 });
		const twoAttemptGrid = setup({ attemptsOnly: true, attemptCount: 2, hideInactiveInputs: true });
		const enabledGrid = setup({ attemptsOnly: true, attemptCount: 3, hideInactiveInputs: true });
		const mixedGrid = setup({ hideInactiveInputs: true });
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
		enabledGrid.comparisons.set([], undefined);
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
			screenReaderGrid: false,
			defaultComparisonGrid: true,
			mixedComparisonGrid: true,
			afterLeavingComparisonGrid: false,
		});
	});
});
