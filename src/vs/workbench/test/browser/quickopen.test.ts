/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import 'vs/workbench/browser/parts/editor/editor.contribution'; // make sure to load all contributed editor things into tests
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { Event } from 'vs/base/common/event';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { Registry } from 'vs/platform/registry/common/platform';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenAction, QuickOpenHandler } from 'vs/workbench/browser/quickopen';

export class TestQuickOpenService implements IQuickOpenService {
	public _serviceBrand: any;

	private callback: (prefix: string) => void;

	constructor(callback?: (prefix: string) => void) {
		this.callback = callback;
	}

	pick(arg: any, options?: any, token?: any): Promise {
		return TPromise.as(null);
	}

	input(options?: any, token?: any): Promise {
		return TPromise.as(null);
	}

	accept(): void {
	}

	focus(): void {
	}

	close(): void {
	}

	show(prefix?: string, options?: any): Promise {
		if (this.callback) {
			this.callback(prefix);
		}

		return TPromise.as(true);
	}

	get onShow(): Event<void> {
		return null;
	}

	get onHide(): Event<void> {
		return null;
	}

	public dispose() { }
	public navigate(): void { }
}

suite('Workbench QuickOpen', () => {

	class TestHandler extends QuickOpenHandler {

	}

	test('QuickOpen Handler and Registry', () => {
		let registry = (Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen));
		let handler = new QuickOpenHandlerDescriptor(
			TestHandler,
			'testhandler',
			',',
			'Handler',
			null
		);

		registry.registerQuickOpenHandler(handler);

		assert(registry.getQuickOpenHandler(',') === handler);

		let handlers = registry.getQuickOpenHandlers();
		assert(handlers.some((handler: QuickOpenHandlerDescriptor) => handler.prefix === ','));
	});

	test('QuickOpen Action', () => {
		let defaultAction = new QuickOpenAction('id', 'label', void 0, new TestQuickOpenService((prefix: string) => assert(!prefix)));
		let prefixAction = new QuickOpenAction('id', 'label', ',', new TestQuickOpenService((prefix: string) => assert(!!prefix)));

		defaultAction.run();
		prefixAction.run();
	});
});