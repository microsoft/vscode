/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActiveSession } from '../../common/sessionsManagement.js';
import { resolveSessionActionTarget } from '../../browser/sessionActionTarget.js';
import { ISessionsService } from '../../browser/sessionsService.js';

suite('sessionActionTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(name: string): IActiveSession {
		return upcastPartial<IActiveSession>({ sessionId: name, resource: URI.parse(`test:///${name}`) });
	}

	function resolve(arg: unknown, active: IActiveSession | undefined) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsService, { activeSession: constObservable(active) });
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

	test('resolves the active session resource only', () => {
		const active = createSession('active');
		assert.strictEqual(resolve(active.resource, active), active);
		assert.strictEqual(resolve(URI.parse('test:///other'), active), undefined);
	});
});
