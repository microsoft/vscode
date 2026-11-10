/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';
import { ITestSessionWithChat } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

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
		const sessions = roles.map((role, index) => upcastPartial<ITestSessionWithChat>({
			sessionId: `${role}-${index}`,
			resource: URI.parse(`test:///${role}-${index}`),
			status: statuses[index],
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse(`test-chat:/${role}-${index}`) })),
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
		const openedChats: string[][] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override getComparison(id: string) { return comparisons.get().find(comparison => comparison.id === id); }
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ITestSessionWithChat | undefined {
				return sessions.find(session => session.resource.toString() === resource.toString());
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openSession(resource: URI): Promise<void> {
				openedSessions.push(sessions.find(session => session.resource.toString() === resource.toString())!.sessionId);
			}
			override async openSessionsInGrid(targets: readonly ITestSessionWithChat[]): Promise<void> {
				openedGrids.push(targets.map(session => session.sessionId));
			}
			override async openChatsInGrid(targets: readonly { session: ISession; chatResource: URI }[]): Promise<void> {
				openedChats.push(targets.map(target => target.chatResource.toString()));
			}
		}());
		const service = instantiationService.createInstance(SessionComparisonViewService);
		return { service, comparisons, statuses, openedSessions, openedGrids, openedChats, sessions };
	}

	test('opens distinct nested attempts of one parent without opening the Judge', async () => {
		const fixture = setup();
		const parent = fixture.sessions[0];
		const chats = ['attempt-0', 'attempt-1', 'judge'].map(id => upcastPartial<IChat>({ resource: URI.parse(`test-chat:/parent#${id}`) }));
		fixture.sessions[0] = { ...parent, chats: constObservable(chats) };
		const comparison = fixture.comparisons.get()[0];
		fixture.comparisons.set([{
			...comparison,
			sessionResource: parent.resource,
			participants: comparison.participants.slice(0, 3).map((participant, index) => ({
				...participant, sessionResource: parent.resource, chatResource: chats[index].resource,
			})),
		}], undefined);
		await fixture.service.open(comparison.id);
		assert.deepStrictEqual({ grids: fixture.openedGrids, chats: fixture.openedChats }, {
			grids: [], chats: [['test-chat:/parent#attempt-0', 'test-chat:/parent#attempt-1']],
		});
	});

	test('opens attempts in the grid when the Judge is available', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			openedSessions: [],
			openedGrids: [['attempt-0', 'attempt-1']],
		});
	});

	test('keeps main-chat attempts in ordinary session slots even with explicit chat identities', async () => {
		const fixture = setup();
		for (let index = 0; index < fixture.sessions.length; index++) {
			const session = fixture.sessions[index];
			fixture.sessions[index] = { ...session, chats: constObservable([session.mainChat.get()]) };
		}
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants.map((participant, index) => ({
				...participant, chatResource: fixture.sessions[index].mainChat.get().resource,
			})),
		}], undefined);
		await fixture.service.open('comparison');
		assert.deepStrictEqual({ grids: fixture.openedGrids, chats: fixture.openedChats }, {
			grids: [['attempt-0', 'attempt-1']], chats: [],
		});
	});

	test('opens attempts in the grid when synthesis is running', async () => {
		const fixture = setup();
		fixture.statuses[3].set(SessionStatus.InProgress, undefined);
		await fixture.service.open('comparison');
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			openedSessions: [],
			openedGrids: [['attempt-0', 'attempt-1']],
		});
	});

	test('opens only available attempts in the grid', async () => {
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
		}, {
			openedSessions: [],
			openedGrids: [['attempt-0']],
		});
	});

	test('reports when no attempt session is available', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: fixture.comparisons.get()[0].participants.map(participant => ({
				...participant,
				sessionResource: undefined,
			})),
		}], undefined);
		await assert.rejects(() => fixture.service.open('comparison'), /No comparison attempts are available/);
		assert.deepStrictEqual({
			openedSessions: fixture.openedSessions,
			openedGrids: fixture.openedGrids,
		}, {
			openedSessions: [],
			openedGrids: [],
		});
	});

});
