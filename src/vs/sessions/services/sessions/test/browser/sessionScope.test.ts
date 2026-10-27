/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActiveSessionScope } from '../../browser/sessionScope.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

suite('ActiveSessionScope', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('follows the session of the main window, not the one of a focused chat window', () => {
		const main = upcastPartial<IActiveSession>({ sessionId: 'main' });
		const focused = upcastPartial<IActiveSession>({ sessionId: 'chat-window' });
		const sessionsService = upcastPartial<ISessionsService>({
			activeSession: constObservable<IActiveSession | undefined>(focused),
			mainWindowActiveSession: constObservable<IActiveSession | undefined>(main),
		});
		assert.strictEqual(new ActiveSessionScope(sessionsService).session.get(), main);
	});
});
