/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { LastTurnChangesMultiDiffSourceResolver } from '../../browser/lastTurnChangesMultiDiffSourceResolver.js';

suite('LastTurnChangesMultiDiffSourceResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates the editor label when the turn completes', async () => {
		const chatResource = URI.parse('chat:test');
		const status = observableValue<SessionStatus>('status', SessionStatus.InProgress);
		const chat = new class extends mock<IChat>() {
			override readonly resource = chatResource;
			override readonly status = status;
		}();
		const session = new class extends mock<ISession>() { }();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource(resource: URI) {
				return isEqual(resource, chatResource) ? { session, chat } : undefined;
			}
		}();
		const multiDiffSourceResolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(_resolver: IMultiDiffSourceResolver) {
				return Disposable.None;
			}
		}();
		const resolver = disposables.add(new LastTurnChangesMultiDiffSourceResolver(sessionsManagementService, multiDiffSourceResolverService));
		const source = await resolver.resolveDiffSource(LastTurnChangesMultiDiffSourceResolver.getMultiDiffSourceUri(chatResource));
		const label = source.label;
		assert.ok(label);

		const labels = [label.value];
		disposables.add(label.onDidChange(() => labels.push(label.value)));
		status.set(SessionStatus.NeedsInput, undefined);
		status.set(SessionStatus.Completed, undefined);

		assert.deepStrictEqual(labels, [
			'Current Turn Changes',
			'Last Turn Changes',
		]);
	});
});
