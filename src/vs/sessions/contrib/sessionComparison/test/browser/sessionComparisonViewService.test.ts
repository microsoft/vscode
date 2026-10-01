/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SESSION_COMPARISON_VIEW_ID, SessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';

suite('Session comparison navigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const roles = [
			SessionComparisonParticipantRole.Attempt,
			SessionComparisonParticipantRole.Attempt,
			SessionComparisonParticipantRole.Judge,
			SessionComparisonParticipantRole.Synthesis,
		];
		const statuses = roles.map((role, index) => observableValue(`${role}-${index}-status`, SessionStatus.Completed));
		const sessions = roles.map((role, index) => upcastPartial<IActiveSession>({
			sessionId: `${role}-${index}`,
			resource: URI.parse(`test:///${role}-${index}`),
			status: statuses[index],
		}));
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			prompt: 'Implement',
			createdAt: 0,
			workspace: URI.file('/repo'),
			participants: sessions.map((session, index) => ({
				id: session.sessionId,
				role: roles[index],
				sessionResource: session.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: session.sessionId },
			})),
		};
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const openedSessions: string[] = [];
		const openedGrids: string[][] = [];
		const activeCustomView = observableValue<ICustomViewDescriptor | undefined>('activeCustomView', undefined);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override getComparison(id: string) { return comparisons.get().find(comparison => comparison.id === id); }
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): IActiveSession | undefined {
				return sessions.find(session => session.resource.toString() === resource.toString());
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openSession(resource: URI): Promise<void> {
				activeCustomView.set(undefined, undefined);
				openedSessions.push(sessions.find(session => session.resource.toString() === resource.toString())!.sessionId);
			}
			override async openSessionsInGrid(targets: readonly IActiveSession[]): Promise<void> {
				openedGrids.push(targets.map(session => session.sessionId));
			}
		}());
		instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = activeCustomView;
			override showCustomView(id: string): void {
				activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id }), undefined);
			}
			override hideCustomView(): void {
				activeCustomView.set(undefined, undefined);
			}
		}());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		const service = store.add(instantiationService.createInstance(SessionComparisonViewService));
		return { service, comparisons, statuses, openedSessions, openedGrids, activeCustomView };
	}

	test('opens the comparison as one conversation instead of a grid', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			activeComparison: fixture.service.activeComparisonId.get(),
			customView: fixture.activeCustomView.get()?.id,
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			activeComparison: 'comparison',
			customView: SESSION_COMPARISON_VIEW_ID,
			openedSessions: [],
			openedGrids: [],
		});
	});

	test('reports a comparison that no longer exists', async () => {
		const fixture = setup();
		await assert.rejects(() => fixture.service.open('missing'), /no longer available/);
		assert.deepStrictEqual({ activeComparison: fixture.service.activeComparisonId.get(), customView: fixture.activeCustomView.get() }, { activeComparison: undefined, customView: undefined });
	});

	test('opening a participant leaves the comparison for its session', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		await fixture.service.openParticipant('comparison', 'judge-2');
		assert.deepStrictEqual({ openedSessions: fixture.openedSessions, customView: fixture.activeCustomView.get() }, { openedSessions: ['judge-2'], customView: undefined });
	});

	test('opens the runs side by side, including while synthesis is running', async () => {
		const fixture = setup();
		fixture.statuses[3].set(SessionStatus.InProgress, undefined);
		await fixture.service.openSideBySide('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			openedSessions: [],
			openedGrids: [['attempt-0', 'attempt-1']],
		});
	});

	test('opens only available runs side by side', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants
				.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt)
				.map((participant, index) => index === 1 ? {
					...participant,
					sessionResource: undefined,
					launchError: 'Failed to start',
				} : participant),
		}], undefined);
		await fixture.service.openSideBySide('comparison');
		assert.deepStrictEqual(fixture.openedGrids, [['attempt-0']]);
	});

	test('reports when no run session is available side by side', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants.map(participant => ({
				...participant,
				sessionResource: undefined,
			})),
		}], undefined);
		await assert.rejects(() => fixture.service.openSideBySide('comparison'), /No comparison runs are available/);
		assert.deepStrictEqual({ openedSessions: fixture.openedSessions, openedGrids: fixture.openedGrids }, { openedSessions: [], openedGrids: [] });
	});

});
