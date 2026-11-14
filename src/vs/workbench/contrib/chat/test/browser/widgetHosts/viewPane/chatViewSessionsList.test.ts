/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatViewSessionsListService, IChatViewSessionsList } from '../../../../browser/widgetHosts/viewPane/chatViewSessionsList.js';

suite('ChatViewSessionsListService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports whether the Chat view shows only the sessions of the provided list it shows, and not once it no longer shows that list', () => {
		const service = new ChatViewSessionsListService();
		const sessionsOnly = observableValue('sessionsOnly', true);
		const steps: boolean[] = [service.sessionsOnly.get()];

		const active = service.setActiveList(upcastPartial<IChatViewSessionsList>({ sessionsOnly }));
		steps.push(service.sessionsOnly.get());
		sessionsOnly.set(false, undefined);
		steps.push(service.sessionsOnly.get());
		sessionsOnly.set(true, undefined);
		active.dispose();
		steps.push(service.sessionsOnly.get());

		assert.deepStrictEqual(steps, [false, true, false, false]);
	});
});
