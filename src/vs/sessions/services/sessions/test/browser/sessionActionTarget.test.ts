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

suite('sessionActionTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(name: string): IActiveSession {
		return upcastPartial<IActiveSession>({ sessionId: name, resource: URI.parse(`test:///${name}`) });
	}

	function resolve(arg: unknown, active: IActiveSession | undefined, visible: readonly (IActiveSession | undefined)[] = [], windows: readonly IActiveSession[] = []) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
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
