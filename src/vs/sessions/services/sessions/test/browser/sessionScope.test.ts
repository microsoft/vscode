/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IContentPart, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveSessionHost, ISessionHost, SessionHostKind } from '../../browser/sessionHost.js';
import { ActiveSessionScope, getFocusedWindowSession, ISessionScope } from '../../browser/sessionScope.js';
import { MainWindowSessionHost } from '../../browser/sessionHostService.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
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

	test('the session of the window with focus is that of the chat window with focus, from its own scope, even before it is the active session', () => {
		const active = upcastPartial<IActiveSession>({ sessionId: 'main' });
		const ofWindow = upcastPartial<IActiveSession>({ sessionId: 'chat-window' });
		const mainPart = upcastPartial<IContentPart>({});
		const instantiationService = disposables.add(new TestInstantiationService());
		const windowInstantiationService = disposables.add(instantiationService.createChild(new ServiceCollection([ISessionScope, upcastPartial<ISessionScope>({ session: constObservable(ofWindow) })])));
		let focusedWindow: IChatWindow | undefined = upcastPartial<IChatWindow>({ mainPart });
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ activeSession: constObservable<IActiveSession | undefined>(active) }));
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({ get activeWindow() { return focusedWindow; } }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ getScopedInstantiationService: (part): IInstantiationService => part === mainPart ? windowInstantiationService : instantiationService }));

		const inChatWindow = instantiationService.invokeFunction(getFocusedWindowSession)?.sessionId;
		focusedWindow = undefined;
		const inMainWindow = instantiationService.invokeFunction(getFocusedWindowSession)?.sessionId;

		assert.deepStrictEqual({ inChatWindow, inMainWindow }, { inChatWindow: 'chat-window', inMainWindow: 'main' });
	});
});
