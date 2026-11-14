/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatViewSessionsListService, IChatViewSessionsList, IChatViewSessionsListProvider } from '../../../../browser/widgetHosts/viewPane/chatViewSessionsList.js';

suite('ChatViewSessionsListService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports whether the Chat view shows only the sessions of the provided list it shows, and not once it no longer shows that list', () => {
		const service = store.add(new ChatViewSessionsListService());
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

	test('reports each change of the provider in use: as one registers, and as the one in use goes, not as another does, nor as the one in use registers again', () => {
		const service = store.add(new ChatViewSessionsListService());
		let changes = 0;
		store.add(service.onDidChangeProvider(() => changes++));
		const steps: number[] = [];
		const provider = upcastPartial<IChatViewSessionsListProvider>({});
		const first = service.registerProvider(provider);
		steps.push(changes);
		const second = service.registerProvider(upcastPartial<IChatViewSessionsListProvider>({}));
		steps.push(changes);
		first.dispose();
		steps.push(changes);
		second.dispose();
		steps.push(changes);
		// The same provider registering again, and one of its registrations going, change nothing
		const again = service.registerProvider(provider);
		const twice = service.registerProvider(provider);
		steps.push(changes);
		twice.dispose();
		steps.push(changes);
		again.dispose();
		steps.push(changes);

		assert.deepStrictEqual(steps, [1, 2, 2, 3, 4, 4, 5]);
	});
});
