/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, ISessionChangeset } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ICodeReviewService, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';
import { ChangesViewService } from '../../browser/changesViewService.js';

suite('ChangesViewService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string): IActiveSession {
		return upcastPartial<IActiveSession>({
			resource: URI.from({ scheme: 'test-session', path: `/${id}` }),
			sessionType: 'test',
			loading: constObservable(false),
			changesets: constObservable<readonly ISessionChangeset[]>([]),
		});
	}

	function createHarness(initialSession: IActiveSession) {
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', initialSession);
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const onDidDeleteSession = disposables.add(new Emitter<ISession>());
		const onDidDiscardNewSession = disposables.add(new Emitter<ISession>());
		const onDidReplaceNewDraftSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override readonly onDidDeleteSession = onDidDeleteSession.event;
			override readonly onDidDiscardNewSession = onDidDiscardNewSession.event;
			override readonly onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
		}();
		const agentFeedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly activeFeedbackSessionResource = constObservable(URI.from({ scheme: 'test-feedback' }));
			override getFeedback() { return []; }
		}();
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState() {
				return constObservable({ kind: PRReviewStateKind.None } as const);
			}
		}();
		const service = disposables.add(new ChangesViewService(
			agentFeedbackService,
			codeReviewService,
			disposables.add(new MockContextKeyService()),
			sessionsService,
			disposables.add(new TestStorageService()),
			sessionsManagementService,
		));

		return { activeSession, onDidDeleteSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, onDidReplaceSession, service };
	}

	test('restores section collapse state independently per session', () => {
		const sessionA = createSession('a');
		const sessionB = createSession('b');
		const { activeSession, service } = createHarness(sessionA);

		const states = [service.activeSessionSectionCollapseStateObs.get()];
		service.setSectionCollapsed(sessionA.resource, 'otherFiles', true);
		service.setSectionCollapsed(sessionA.resource, 'checks', true);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		activeSession.set(sessionB, undefined);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		service.setSectionCollapsed(sessionB.resource, 'checks', true);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		activeSession.set(sessionA, undefined);
		states.push(service.activeSessionSectionCollapseStateObs.get());

		assert.deepStrictEqual(states, [
			{ otherFiles: false, checks: false },
			{ otherFiles: true, checks: true },
			{ otherFiles: false, checks: false },
			{ otherFiles: false, checks: true },
			{ otherFiles: true, checks: true },
		]);
	});

	test('transfers collapse state on replacement and removes it on deletion', () => {
		const draft = createSession('draft');
		const committed = createSession('committed');
		const { activeSession, onDidDeleteSession, onDidReplaceSession, service } = createHarness(draft);

		service.setSectionCollapsed(draft.resource, 'otherFiles', true);
		activeSession.set(committed, undefined);
		onDidReplaceSession.fire({ from: draft, to: committed });
		const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
		onDidDeleteSession.fire(committed);
		const afterDeletion = service.activeSessionSectionCollapseStateObs.get();

		assert.deepStrictEqual({ afterReplacement, afterDeletion }, {
			afterReplacement: { otherFiles: true, checks: false },
			afterDeletion: { otherFiles: false, checks: false },
		});
	});

	test('removes collapse state when a draft is discarded or replaced by another draft', () => {
		const firstDraft = createSession('first-draft');
		const secondDraft = createSession('second-draft');
		const { activeSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, service } = createHarness(firstDraft);

		service.setSectionCollapsed(firstDraft.resource, 'checks', true);
		activeSession.set(secondDraft, undefined);
		onDidReplaceNewDraftSession.fire({ from: firstDraft, to: secondDraft });
		const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
		service.setSectionCollapsed(secondDraft.resource, 'otherFiles', true);
		onDidDiscardNewSession.fire(secondDraft);
		const afterDiscard = service.activeSessionSectionCollapseStateObs.get();

		assert.deepStrictEqual({ afterReplacement, afterDiscard }, {
			afterReplacement: { otherFiles: false, checks: false },
			afterDiscard: { otherFiles: false, checks: false },
		});
	});
});
