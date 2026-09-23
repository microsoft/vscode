/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatSessionFileChange } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionChangeset } from '../../../../services/sessions/common/session.js';
import { ChangesetReviewAction } from '../../browser/changesetReviewActions.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('ChangesetReviewAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ISetReviewStateCall {
		readonly resources: readonly URI[];
		readonly reviewed: boolean;
	}

	function createInstantiationService(changes: readonly IChatSessionFileChange[], setReviewStateCalls: ISetReviewStateCall[]): TestInstantiationService {
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesetObs = constObservable(upcastPartial<ISessionChangeset>({ capabilities: { review: true } }));
			override readonly activeSessionChangesObs = constObservable(changes);
			override setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean): void {
				setReviewStateCalls.push({ resources, reviewed });
			}
		}();
		const editorService = new class extends mock<IEditorService>() {
			override readonly activeEditorPane = undefined;
		}();
		return disposables.add(new TestInstantiationService(new ServiceCollection(
			[IChangesViewService, changesViewService],
			[IEditorService, editorService],
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

		assert.deepStrictEqual(setReviewStateCalls, [{ resources: [resource], reviewed: true }]);
	});
});
