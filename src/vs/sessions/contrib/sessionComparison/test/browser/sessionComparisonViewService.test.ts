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
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';

suite('Session comparison chat grid', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const roles = [
			SessionComparisonParticipantRole.Attempt,
			SessionComparisonParticipantRole.Attempt,
			SessionComparisonParticipantRole.Judge,
			SessionComparisonParticipantRole.Synthesis,
		];
		const sessions = roles.map((role, index) => upcastPartial<IActiveSession>({
			sessionId: `${role}-${index}`,
			resource: URI.parse(`test:///${role}-${index}`),
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
		const opened: string[][] = [];
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
			override async openSessionsInGrid(targets: readonly IActiveSession[]): Promise<void> {
				opened.push(targets.map(session => session.sessionId));
			}
		}());
		const service = instantiationService.createInstance(SessionComparisonViewService);
		return { service, comparisons, opened };
	}

	test('opens attempts, Judge, and synthesis in participant order', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		assert.deepStrictEqual(fixture.opened, [[
			'attempt-0',
			'attempt-1',
			'judge-2',
			'synthesis-3',
		]]);
	});

	test('skips participants without an available session', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants.map((participant, index) => index === 1 ? {
				...participant,
				sessionResource: undefined,
				launchError: 'Failed to start',
			} : participant),
		}], undefined);
		await fixture.service.open('comparison');
		assert.deepStrictEqual(fixture.opened, [[
			'attempt-0',
			'judge-2',
			'synthesis-3',
		]]);
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
		assert.deepStrictEqual(fixture.opened, []);
	});
});
