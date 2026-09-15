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
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';

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
		const hiddenParts: Array<{ hidden: boolean; part: Parts }> = [];
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
				openedSessions.push(sessions.find(session => session.resource.toString() === resource.toString())!.sessionId);
			}
			override async openSessionsInGrid(targets: readonly IActiveSession[]): Promise<void> {
				openedGrids.push(targets.map(session => session.sessionId));
			}
		}());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override setPartHidden(hidden: boolean, part: Parts): void {
				hiddenParts.push({ hidden, part });
			}
		}());
		const service = instantiationService.createInstance(SessionComparisonViewService);
		return { service, comparisons, statuses, openedSessions, openedGrids, hiddenParts };
	}

	test('opens the Judge when it is available and synthesis is not running', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
			hiddenParts: fixture.hiddenParts,
		}, {
			openedSessions: ['judge-2'],
			openedGrids: [],
			hiddenParts: [
				{ hidden: true, part: Parts.EDITOR_PART },
				{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			],
		});
	});

	test('opens a running synthesis ahead of the Judge', async () => {
		const fixture = setup();
		fixture.statuses[3].set(SessionStatus.InProgress, undefined);
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			openedSessions: ['synthesis-3'],
			openedGrids: [],
		});
	});

	test('opens available attempts in the grid before the Judge exists', async () => {
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
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
			hiddenParts: fixture.hiddenParts,
		}, {
			openedSessions: [],
			openedGrids: [['attempt-0']],
			hiddenParts: [
				{ hidden: true, part: Parts.EDITOR_PART },
				{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			],
		});
	});

	test('reports when no participant session is available', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants.map(participant => ({
				...participant,
				sessionResource: undefined,
			})),
		}], undefined);
		await assert.rejects(() => fixture.service.open('comparison'), /No comparison sessions are available/);
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
			hiddenParts: fixture.hiddenParts,
		}, {
			openedSessions: [],
			openedGrids: [],
			hiddenParts: [],
		});
	});
});
