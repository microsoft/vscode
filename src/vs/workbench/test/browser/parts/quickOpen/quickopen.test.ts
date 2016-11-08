/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import 'vs/workbench/browser/parts/editor/editor.contribution'; // make sure to load all contributed editor things into tests
import { TestQuickOpenService } from 'vs/test/utils/servicesTestUtils';
import { Registry } from 'vs/platform/platform';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenAction } from 'vs/workbench/browser/quickopen';

suite('Workbench QuickOpen', () => {

	test('QuickOpen Handler and Registry', () => {
		let registry = (<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen));
		let handler = new QuickOpenHandlerDescriptor(
			'test',
			'TestHandler',
			',',
			'Handler'
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