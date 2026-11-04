/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionChangeset, ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ChangesetReviewAction } from '../../browser/changesetReviewActions.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChangesSessionObservables, IChangesViewService } from '../../common/changesViewService.js';

suite('ChangesetReviewAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ISetReviewStateCall {
		readonly resources: readonly URI[];
		readonly reviewed: boolean;
		readonly session?: IActiveSession;
	}

	const activeSession = upcastPartial<IActiveSession>({ sessionId: 'active', resource: URI.parse('agent-host:active') });

	function createInstantiationService(changes: readonly ISessionFileChange[], setReviewStateCalls: ISetReviewStateCall[], otherChanges: readonly ISessionFileChange[] = []): TestInstantiationService {
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesetObs = constObservable(upcastPartial<ISessionChangeset>({ capabilities: { review: true } }));
			override readonly activeSessionChangesObs = constObservable(changes);
			override getSessionChanges(sessionObs: IObservable<IActiveSession | undefined>): IChangesSessionObservables {
				return upcastPartial<IChangesSessionObservables>({
					changesetObs: constObservable(upcastPartial<ISessionChangeset>({ capabilities: { review: true } })),
					changesObs: constObservable(otherChanges),
				});
			}
			override setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean, session?: IActiveSession): void {
				setReviewStateCalls.push(session ? { resources, reviewed, session } : { resources, reviewed });
			}
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ sessionId: 'active', resource: URI.parse('agent-host:active') }));
			override readonly mainWindowActiveSession = this.activeSession;
			override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		}();
		const editorService = new class extends mock<IEditorService>() {
			override readonly activeEditorPane = undefined;
		}();
		return disposables.add(new TestInstantiationService(new ServiceCollection(
			[IChangesViewService, changesViewService],
			[IEditorService, editorService],
			[ISessionsService, sessionsService],
			[ILogService, new NullLogService()],
		)));
	}

	test('ignores a resource that is not part of the active changeset', () => {
		const setReviewStateCalls: ISetReviewStateCall[] = [];
		const instantiationService = createInstantiationService(
			[{ modifiedUri: URI.file('/workspace/current.ts'), insertions: 1, deletions: 0, reviewed: false }],
			setReviewStateCalls,
		);

		// A middle-click can forward a stale row's resource (e.g. mid session switch);
		// it must not be dispatched to a changeset it no longer belongs to.
		new ChangesetReviewAction().run(instantiationService, URI.file('/workspace/stale.ts'));

		assert.deepStrictEqual(setReviewStateCalls, []);
	});

	test('toggles the review state for a resource in the active changeset', () => {
		const resource = URI.file('/workspace/current.ts');
		const setReviewStateCalls: ISetReviewStateCall[] = [];
		const instantiationService = createInstantiationService(
			[{ modifiedUri: resource, insertions: 1, deletions: 0, reviewed: false }],
			setReviewStateCalls,
		);

		new ChangesetReviewAction().run(instantiationService, resource);

		assert.deepStrictEqual(setReviewStateCalls, [{ resources: [resource], reviewed: true, session: activeSession }]);
	});

	test('toggles a file of the session it is invoked for instead of the active one', () => {
		const resource = URI.file('/workspace/other.ts');
		const otherSession = upcastPartial<IActiveSession>({ sessionId: 'other', resource: URI.parse('agent-host:other') });
		const setReviewStateCalls: ISetReviewStateCall[] = [];
		const instantiationService = createInstantiationService(
			[{ modifiedUri: URI.file('/workspace/current.ts'), insertions: 1, deletions: 0, reviewed: false }],
			setReviewStateCalls,
			[{ modifiedUri: resource, insertions: 1, deletions: 0, reviewed: false }],
		);

		new ChangesetReviewAction().run(instantiationService, resource, otherSession);

		assert.deepStrictEqual(setReviewStateCalls, [{ resources: [resource], reviewed: true, session: otherSession }]);
	});

	test('does nothing when the session argument is empty instead of using the active session', () => {
		const resource = URI.file('/workspace/current.ts');
		const setReviewStateCalls: ISetReviewStateCall[] = [];
		const instantiationService = createInstantiationService(
			[{ modifiedUri: resource, insertions: 1, deletions: 0, reviewed: false }],
			setReviewStateCalls,
		);

		new ChangesetReviewAction().run(instantiationService, resource, { session: undefined });

		assert.deepStrictEqual(setReviewStateCalls, []);
	});

	test('toggles a deleted file using its file resource', () => {
		const fileResource = URI.file('/workspace/deleted.ts');
		const originalUri = URI.parse('git-blob:/workspace/deleted.ts');
		const setReviewStateCalls: ISetReviewStateCall[] = [];
		const instantiationService = createInstantiationService(
			[{ uri: fileResource, modifiedUri: undefined, originalUri, insertions: 0, deletions: 3, reviewed: true }],
			setReviewStateCalls,
		);

		new ChangesetReviewAction().run(instantiationService, originalUri);

		assert.deepStrictEqual(setReviewStateCalls, [{ resources: [fileResource], reviewed: false, session: activeSession }]);
	});
});
