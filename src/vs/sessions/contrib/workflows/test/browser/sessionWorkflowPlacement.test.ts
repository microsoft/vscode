/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { WorkflowProgress } from '../../../../../platform/workflow/common/workflow.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionListModelChangeEvent, ISessionsListModelService, SessionListModelChangeKind } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionWorkflowPlacement } from '../../browser/sessionWorkflowPlacement.js';

suite('SessionWorkflowPlacement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('pins and archive win, summaries do not load chats, and only completion order is passed as placement identity', () => {
		const workflow = observableValue<WorkflowProgress | undefined>('workflow', undefined);
		const archived = observableValue('archived', false);
		const session = upcastPartial<ISession>({
			sessionId: 'session', workflow, isArchived: archived,
			get chats(): never { throw new Error('Placement must not load chats'); },
		});
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const deleted = store.add(new Emitter<ISession>());
		const listChanged = store.add(new Emitter<ISessionListModelChangeEvent>());
		const calls: { group: string; runId: string; revision: number }[] = [];
		let pinned = true;
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSessions() { return [session]; }
			override onDidChangeSessions = sessionsChanged.event;
			override onDidDeleteSession = deleted.event;
		}());
		instantiation.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
			override isSessionPinned() { return pinned; }
			override onDidChange = listChanged.event;
		}());
		instantiation.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
			override applyWorkflowGroup(_session: ISession, group: string, runId: string, revision: number) {
				calls.push({ group, runId, revision });
				return true;
			}
		}());
		store.add(instantiation.createInstance(SessionWorkflowPlacement));
		workflow.set({
			runId: 'run', label: 'Feature', checkpointId: 'experiment', checkpointLabel: 'Experiment started',
			position: 9, total: 10, completed: 8, status: 'waiting', needsAttention: false,
			group: 'Experiments', revision: 42, activityAt: 100,
		}, undefined);
		pinned = false;
		listChanged.fire({ changes: [{ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned }] });
		archived.set(true, undefined);
		workflow.set({ ...workflow.get()!, revision: 43 }, undefined);
		deleted.fire(session);
		archived.set(false, undefined);

		assert.deepStrictEqual(calls, [{ group: 'Experiments', runId: 'run', revision: 8 }]);
	});
});
