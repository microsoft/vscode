/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionGridLayout } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonEditorInput } from '../../browser/sessionComparisonEditorInput.js';
import { SessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';

suite('Session comparison WIP chat grid', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const statuses = ['a', 'b'].map(id => observableValue<SessionStatus>(id, SessionStatus.InProgress));
		const sessions = statuses.map((status, index) => upcastPartial<IActiveSession>({
			sessionId: String.fromCharCode(97 + index),
			resource: URI.parse(`test:///${String.fromCharCode(97 + index)}`),
			status,
		}));
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			prompt: 'Implement',
			createdAt: 0,
			workspace: URI.file('/repo'),
			participants: sessions.map(session => ({
				id: session.sessionId,
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: session.resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: session.sessionId },
			})),
		};
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const layout = observableValue<SessionGridLayout>('layout', 'columns');
		const opened: string[][] = [];
		const editors: string[] = [];
		let resets = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override getComparison(id: string) { return comparisons.get().find(comparison => comparison.id === id); }
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined {
				return sessions.find(session => session.resource.toString() === resource.toString());
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override sessionGridLayout = layout;
			override async openSessionsInGrid(targets: readonly ISession[]): Promise<void> {
				opened.push(targets.map(session => session.sessionId));
				layout.set('grid', undefined);
			}
			override resetSessionGridLayout(): void {
				resets++;
				layout.set('columns', undefined);
			}
		}());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(input: EditorInput | IUntypedEditorInput) {
				if (input instanceof SessionComparisonEditorInput) {
					editors.push(input.comparisonId);
					store.add(input);
				}
				return undefined;
			}
		}());
		const service = store.add(instantiationService.createInstance(SessionComparisonViewService));
		return { service, sessions, statuses, comparisons, layout, opened, editors, getResets: () => resets };
	}

	test('opens existing attempt sessions in a tiled grid while work is in progress', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		assert.deepStrictEqual({ opened: fixture.opened, editors: fixture.editors, layout: fixture.layout.get() }, {
			opened: [['a', 'b']],
			editors: [],
			layout: 'grid',
		});
	});

	test('opens Megan result editor directly when attempts are already terminal', async () => {
		const fixture = setup();
		fixture.statuses.forEach(status => status.set(SessionStatus.Completed, undefined));
		await fixture.service.open('comparison');
		assert.deepStrictEqual({ opened: fixture.opened, editors: fixture.editors, resets: fixture.getResets() }, {
			opened: [],
			editors: ['comparison'],
			resets: 1,
		});
	});

	test('hands off from the live grid to Megan results when all attempts finish', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		fixture.statuses.forEach(status => status.set(SessionStatus.Completed, undefined));
		await timeout(0);
		assert.deepStrictEqual({ editors: fixture.editors, resets: fixture.getResets(), layout: fixture.layout.get() }, {
			editors: ['comparison'],
			resets: 1,
			layout: 'columns',
		});
	});

	test('does not steal navigation after the user leaves the live grid', async () => {
		const fixture = setup();
		await fixture.service.open('comparison');
		fixture.layout.set('columns', undefined);
		await timeout(0);
		fixture.statuses.forEach(status => status.set(SessionStatus.Completed, undefined));
		await timeout(0);
		assert.deepStrictEqual({ editors: fixture.editors, resets: fixture.getResets() }, { editors: [], resets: 0 });
	});

	test('uses Megan results when no attempt session is available', async () => {
		const fixture = setup();
		fixture.comparisons.set([{
			...fixture.comparisons.get()[0],
			participants: [{
				id: 'failed',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'failed' },
				launchError: 'Failed to start',
			}],
		}], undefined);
		await fixture.service.open('comparison');
		assert.deepStrictEqual({ opened: fixture.opened, editors: fixture.editors }, { opened: [], editors: ['comparison'] });
	});
});
