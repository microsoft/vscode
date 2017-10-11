/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { FileDecorationsService } from 'vs/workbench/services/decorations/browser/decorationsService';
import { IDecorationsProvider, IResourceDecoration } from 'vs/workbench/services/decorations/browser/decorations';
import URI from 'vs/base/common/uri';
import Event, { toPromise } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';

suite('DecorationsService', function () {

	let service: FileDecorationsService;

	setup(function () {
		service = new FileDecorationsService();
	});

	test('Async provider, async/evented result', function () {

		let uri = URI.parse('foo:bar');
		let callCounter = 0;

		service.registerDecortionsProvider(new class implements IDecorationsProvider {
			readonly label: string = 'Test';
			readonly onDidChange: Event<URI[]> = Event.None;
			provideDecorations(uri: URI) {
				callCounter += 1;
				return new Promise<IResourceDecoration>(resolve => {
					setTimeout(() => resolve({
						severity: Severity.Info,
						color: 'someBlue'
					}));
				});
			}
		});

		// trigger -> async
		assert.equal(service.getTopDecoration(uri, false), undefined);
		assert.equal(callCounter, 1);

		// event when result is computed
		return toPromise(service.onDidChangeDecorations).then(e => {
			assert.equal(e.affectsResource(uri), true);

			// sync result
			assert.deepEqual(service.getTopDecoration(uri, false), { severity: Severity.Info, color: 'someBlue' });
			assert.equal(callCounter, 1);
		});
	});

	test('Sync provider, sync result', function () {

		let uri = URI.parse('foo:bar');
		let callCounter = 0;

		service.registerDecortionsProvider(new class implements IDecorationsProvider {
			readonly label: string = 'Test';
			readonly onDidChange: Event<URI[]> = Event.None;
			provideDecorations(uri: URI) {
				callCounter += 1;
				return { severity: Severity.Info, color: 'someBlue' };
			}
		});

		// trigger -> sync
		assert.deepEqual(service.getTopDecoration(uri, false), { severity: Severity.Info, color: 'someBlue' });
		assert.equal(callCounter, 1);
	});

	test('Clear decorations on provider dispose', function () {
		let uri = URI.parse('foo:bar');
		let callCounter = 0;

		let reg = service.registerDecortionsProvider(new class implements IDecorationsProvider {
			readonly label: string = 'Test';
			readonly onDidChange: Event<URI[]> = Event.None;
			provideDecorations(uri: URI) {
				callCounter += 1;
				return { severity: Severity.Info, color: 'someBlue' };
			}
		});

		// trigger -> sync
		assert.deepEqual(service.getTopDecoration(uri, false), { severity: Severity.Info, color: 'someBlue' });
		assert.equal(callCounter, 1);

		// un-register -> ensure good event
		let didSeeEvent = false;
		service.onDidChangeDecorations(e => {
			assert.equal(e.affectsResource(uri), true);
			assert.deepEqual(service.getTopDecoration(uri, false), undefined);
			assert.equal(callCounter, 1);
			didSeeEvent = true;
		});
		reg.dispose();
		assert.equal(didSeeEvent, true);
	});
});
