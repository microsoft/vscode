/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActiveSession } from '../../common/sessionsManagement.js';
import { findSessionByResource, resolveSessionActionTarget } from '../../browser/sessionActionTarget.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISessionScope } from '../../browser/sessionScope.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

suite('sessionActionTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(name: string): IActiveSession {
		return upcastPartial<IActiveSession>({ sessionId: name, resource: URI.parse(`test:///${name}`) });
	}

	function resolve(arg: unknown, active: IActiveSession | undefined, visible: readonly (IActiveSession | undefined)[] = [], windows: readonly IActiveSession[] = [], focusedChatWindowSession?: IActiveSession) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		// The chat window that has focus, whose own scope shows `focusedChatWindowSession`.
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({ activeWindow: focusedChatWindowSession ? upcastPartial<IChatWindow>({}) : undefined }));
		const windowScope = upcastPartial<ISessionScope>({ session: constObservable(focusedChatWindowSession) });
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			getScopedInstantiationService: () => upcastPartial<IInstantiationService>({ invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => fn(upcastPartial<ServicesAccessor>({ get: <T>() => windowScope as T }))) as IInstantiationService['invokeFunction'] }),
		}));
		instantiationService.stub(ISessionsService, { activeSession: constObservable(active), mainWindowActiveSession: constObservable<IActiveSession | undefined>(undefined), windowSessions: constObservable(windows), visibleSessions: constObservable(visible) });
		return instantiationService.invokeFunction(accessor => resolveSessionActionTarget(accessor, arg));
	}

	test('falls back to the active session without an argument', () => {
		const active = createSession('active');
		assert.strictEqual(resolve(undefined, active), active);
	});

	test('prefers an explicit non-active session', () => {
		const active = createSession('active');
		const other = createSession('other');
		assert.strictEqual(resolve(other, active), other);
		assert.strictEqual(resolve({ session: other }, active), other);
	});

	test('an explicit empty session context does not fall back', () => {
		assert.strictEqual(resolve({ session: undefined }, createSession('active')), undefined);
	});

	test('resolves the resource of the active or a visible session only', () => {
		const active = createSession('active');
		assert.strictEqual(resolve(active.resource, active), active);
		const visible = createSession('visible');
		assert.strictEqual(resolve(visible.resource, active, [undefined, visible]), visible);
		assert.strictEqual(resolve(URI.parse('test:///other'), active, [visible]), undefined);
	});

	test('resolves the resource of the session of a chat window', () => {
		const inWindow = createSession('window');
		assert.strictEqual(resolve(inWindow.resource, createSession('active'), [], [inWindow]), inWindow);
	});

	test('the resource of a session resolves to the session of the chat window that has focus when that window shows it, such as from its Changes toolbar before the active session follows the focus', () => {
		const mainWindow = createSession('shared');
		// Another wrapper of the same session, as a chat window showing another of its chats has.
		const inChatWindow = createSession('shared');
		const elsewhere = createSession('elsewhere');
		assert.deepStrictEqual({
			focusedWindowShowsIt: resolve(mainWindow.resource, mainWindow, [], [inChatWindow], inChatWindow) === inChatWindow,
			focusedWindowShowsAnother: resolve(mainWindow.resource, mainWindow, [], [inChatWindow], elsewhere) === mainWindow,
			noChatWindowFocused: resolve(mainWindow.resource, mainWindow, [], [inChatWindow]) === mainWindow,
		}, { focusedWindowShowsIt: true, focusedWindowShowsAnother: true, noChatWindowFocused: true });
	});

	test('an unresolvable explicit session never falls back to the active session', () => {
		const active = createSession('active');
		assert.strictEqual(resolve(URI.parse('test:///gone'), active), undefined);
		assert.strictEqual(resolve({ session: undefined }, active), undefined);
	});

	test('the lookup tracks visible sessions when read with a reader', () => {
		const visible = createSession('visible');
		const visibleObs = observableValue<readonly (IActiveSession | undefined)[]>('visible', []);
		const sessionsService = upcastPartial<ISessionsService>({ activeSession: constObservable(createSession('active')), visibleSessions: visibleObs, mainWindowActiveSession: constObservable<IActiveSession | undefined>(undefined), windowSessions: constObservable([]) });
		const found: (IActiveSession | undefined)[] = [];
		store.add(autorun(reader => found.push(findSessionByResource(sessionsService, visible.resource, reader))));
		visibleObs.set([visible], undefined);
		assert.deepStrictEqual(found, [undefined, visible]);
	});
});
