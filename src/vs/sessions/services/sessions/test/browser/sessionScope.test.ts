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
import { ActiveSessionScope, getFocusedWindowSession, ISessionScope } from '../../browser/sessionScope.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

suite('ActiveSessionScope', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('follows the session of the main window, not the one of a focused chat window', () => {
		const main = upcastPartial<IActiveSession>({ sessionId: 'main' });
		const focused = upcastPartial<IActiveSession>({ sessionId: 'chat-window' });
		const sessionsService = upcastPartial<ISessionsService>({
			activeSession: constObservable<IActiveSession | undefined>(focused),
			mainWindowActiveSession: constObservable<IActiveSession | undefined>(main),
		});
		assert.strictEqual(new ActiveSessionScope(sessionsService).session.get(), main);
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
