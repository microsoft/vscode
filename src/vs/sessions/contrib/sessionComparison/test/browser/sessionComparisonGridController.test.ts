/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsPartService, SessionGridLayout } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonGridController } from '../../browser/sessionComparisonGridController.js';

suite('Session comparison grid controller', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(initialLayout: SessionGridLayout = 'grid') {
		const judge = upcastPartial<IActiveSession>({ sessionId: 'judge', resource: URI.parse('test:///judge') });
		const attempt = upcastPartial<IActiveSession>({ sessionId: 'attempt', resource: URI.parse('test:///attempt') });
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
			}],
		};
		const focused = store.add(new Emitter<string>());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', judge);
		const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', [judge, attempt]);
		const sessionGridLayout = observableValue<SessionGridLayout>('sessionGridLayout', initialLayout);
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const closed: Array<string | undefined> = [];
		const hiddenParts: Array<{ hidden: boolean; part: Parts }> = [];
		const partVisibility = new Map<Parts, boolean>([
			[Parts.EDITOR_PART, true],
			[Parts.AUXILIARYBAR_PART, true],
		]);
		const onDidChangePartVisibility = store.add(new Emitter<{ partId: Parts; visible: boolean }>());
		let resetCount = 0;
		const instantiationService = store.add(new TestInstantiationService());
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
		return { focused, visibleSessions, sessionGridLayout, closed, hiddenParts, partVisibility, onDidChangePartVisibility, get resetCount() { return resetCount; } };
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

	test('ignores the initial grid focus and closes other panes on a later Judge focus', async () => {
		const fixture = setup();

		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, { closed: [], resetCount: 0 });
		fixture.focused.fire('judge');
		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, { closed: [], resetCount: 0 });
		await Promise.resolve();
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, {
			closed: ['attempt'],
			resetCount: 1,
		});

		fixture.partVisibility.set(Parts.EDITOR_PART, true);
		fixture.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.deepStrictEqual(fixture.hiddenParts.at(-1), { hidden: true, part: Parts.EDITOR_PART });
	});

	test('does not collapse when a tiled attempt receives focus', async () => {
		const fixture = setup();
		await Promise.resolve();
		fixture.focused.fire('attempt');

		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, { closed: [], resetCount: 0 });
	});

	test('does not collapse an ordinary multi-session columns layout', () => {
		const fixture = setup('columns');
		fixture.focused.fire('judge');

		assert.deepStrictEqual({ closed: fixture.closed, resetCount: fixture.resetCount }, { closed: [], resetCount: 0 });
	});
});
