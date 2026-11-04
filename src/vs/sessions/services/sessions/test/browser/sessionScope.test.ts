/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveSessionHost, ISessionHost, SessionHostKind } from '../../browser/sessionHost.js';
import { ActiveSessionScope, ISessionScope } from '../../browser/sessionScope.js';
import { MainWindowSessionHost } from '../../browser/sessionHostService.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

suite('ActiveSessionScope', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('at root, follows the session of the main window through the delayed main window host', () => {
		const main = upcastPartial<IActiveSession>({ sessionId: 'main' });
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ISessionsService, upcastPartial<ISessionsService>({ mainWindowActiveSession: constObservable<IActiveSession | undefined>(main) })],
			[IContextKeyService, upcastPartial<IContextKeyService>({})],
			[ISessionHost, new SyncDescriptor(MainWindowSessionHost, [], true)],
			[ISessionScope, new SyncDescriptor(ActiveSessionScope, [], true)],
		)));
		assert.strictEqual(instantiationService.invokeFunction(accessor => accessor.get(ISessionScope).session.get())?.sessionId, 'main');
	});

	test('follows the session of the window host, also from a pane nested in it', () => {
		const main = upcastPartial<IActiveSession>({ sessionId: 'main' });
		const pane = upcastPartial<IActiveSession>({ sessionId: 'pane' });
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const mainHost = new ActiveSessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: constObservable<IActiveSession | undefined>(main), contextKeyService });
		const paneHost = new ActiveSessionHost({ kind: SessionHostKind.Pane, parent: mainHost, session: constObservable<IActiveSession | undefined>(pane), contextKeyService });
		assert.strictEqual(new ActiveSessionScope(paneHost).session.get(), main);
	});

});
