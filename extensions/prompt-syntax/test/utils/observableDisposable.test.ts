/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { wait, waitRandom } from '../../src/utils/wait';
import {
	assertNotDisposed,
	ObservableDisposable,
} from '../../src/utils/vscode/observableDisposable';

suite('ObservableDisposable', () => {
	test('tracks `disposed` state', () => {
		// this is an abstract class, so we have to create
		// an anonymous class that extends it
		const object = new (class extends ObservableDisposable {})();
		assert(
			object instanceof ObservableDisposable,
			'Object must be instance of ObservableDisposable.'
		);
		assert(!object.disposed, 'Object must not be disposed yet.');
		object.dispose();
		assert(object.disposed, 'Object must be disposed.');
	});

	suite('onDispose', () => {
		test('fires the event on dispose', async () => {
			// this is an abstract class, so we have to create
			// an anonymous class that extends it
			const object = new (class extends ObservableDisposable {})();
			assert(!object.disposed, 'Object must not be disposed yet.');
			const onDisposeSpy = spy(() => {
				return undefined;
			});
			object.onDispose(onDisposeSpy);
			assert(onDisposeSpy.notCalled, '`onDispose` callback must not be called yet.');
			await waitRandom(10);
			assert(onDisposeSpy.notCalled, '`onDispose` callback must not be called yet.');
			// dispose object and wait for the event to be fired/received
			object.dispose();
			await wait(1);
			/**
			 * Validate that the callback was called.
			 */
			assert(object.disposed, 'Object must be disposed.');
			assert(onDisposeSpy.calledOnce, '`onDispose` callback must be called.');
			/**
			 * Validate that the callback is not called again.
			 */
			object.dispose();
			object.dispose();
			await waitRandom(10);
			object.dispose();
			assert(onDisposeSpy.calledOnce, '`onDispose` callback must not be called again.');
			assert(object.disposed, 'Object must be disposed.');
		});

		test('executes callback immediately if already disposed', async () => {
			// this is an abstract class, so we have to create
			// an anonymous class that extends it
			const object = new (class extends ObservableDisposable {})();
			// dispose object and wait for the event to be fired/received
			object.dispose();
			await wait(1);
			const onDisposeSpy = spy(() => {
				return undefined;
			});
			object.onDispose(onDisposeSpy);
			assert(onDisposeSpy.calledOnce, '`onDispose` callback must be called immediately.');
			await waitRandom(10);
			object.onDispose(onDisposeSpy);
			assert(
				onDisposeSpy.calledTwice,
				'`onDispose` callback must be called immediately the second time.'
			);
			// dispose object and wait for the event to be fired/received
			object.dispose();
			await wait(1);
			assert(onDisposeSpy.calledTwice, '`onDispose` callback must not be called again on dispose.');
		});
	});

	suite('asserts', () => {
		test('not disposed (method)', async () => {
			// this is an abstract class, so we have to create
			// an anonymous class that extends it
			const object: ObservableDisposable = new (class extends ObservableDisposable {})();
			assert.doesNotThrow(() => {
				object.assertNotDisposed('Object must not be disposed.');
			});
			await waitRandom(10);
			assert.doesNotThrow(() => {
				object.assertNotDisposed('Object must not be disposed.');
			});
			// dispose object and wait for the event to be fired/received
			object.dispose();
			await wait(1);
			assert.throws(() => {
				object.assertNotDisposed('Object must not be disposed.');
			});
			await waitRandom(10);
			assert.throws(() => {
				object.assertNotDisposed('Object must not be disposed.');
			});
		});

		test('not disposed (function)', async () => {
			// this is an abstract class, so we have to create
			// an anonymous class that extends it
			const object: ObservableDisposable = new (class extends ObservableDisposable {})();
			assert.doesNotThrow(() => {
				assertNotDisposed(object, 'Object must not be disposed.');
			});
			await waitRandom(10);
			assert.doesNotThrow(() => {
				assertNotDisposed(object, 'Object must not be disposed.');
			});
			// dispose object and wait for the event to be fired/received
			object.dispose();
			await wait(1);
			assert.throws(() => {
				assertNotDisposed(object, 'Object must not be disposed.');
			});
			await waitRandom(10);
			assert.throws(() => {
				assertNotDisposed(object, 'Object must not be disposed.');
			});
		});
	});
});
