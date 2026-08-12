/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AbstractCustomView, ICustomViewDescriptor } from '../../browser/customView.js';
import { CustomViewService } from '../../browser/customViewService.js';

class TestCustomView extends AbstractCustomView {
	readonly title: IObservable<string> = constObservable('test');
	render(): void { }
	layout(): void { }
}

suite('Sessions - CustomViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): CustomViewService {
		return disposables.add(new CustomViewService(new NullLogService()));
	}

	function descriptor(id: string): ICustomViewDescriptor {
		return { id, ctor: new SyncDescriptor(TestCustomView) };
	}

	test('shows, replaces and hides registered views', () => {
		const service = createService();
		const first = descriptor('first');
		const second = descriptor('second');
		disposables.add(service.registerCustomView(first));
		disposables.add(service.registerCustomView(second));

		const initial = service.activeCustomView.get();
		service.showCustomView('first');
		const shown = service.activeCustomView.get();
		service.showCustomView('second');
		const replaced = service.activeCustomView.get();
		service.hideCustomView();

		assert.deepStrictEqual({
			initial,
			shown,
			replaced,
			hidden: service.activeCustomView.get(),
		}, {
			initial: undefined,
			shown: first,
			replaced: second,
			hidden: undefined,
		});
	});

	test('ignores an unknown id and drops the active view when it is unregistered', () => {
		const service = createService();
		const registration = service.registerCustomView(descriptor('first'));

		service.showCustomView('unknown');
		const afterUnknown = service.activeCustomView.get();
		service.showCustomView('first');
		registration.dispose();

		assert.deepStrictEqual({
			afterUnknown,
			afterUnregister: service.activeCustomView.get(),
		}, {
			afterUnknown: undefined,
			afterUnregister: undefined,
		});
	});

	test('rejects a duplicate registration', () => {
		const service = createService();
		disposables.add(service.registerCustomView(descriptor('first')));

		assert.throws(() => service.registerCustomView(descriptor('first')));
	});
});
