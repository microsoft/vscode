/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/html/common/html.contribution';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import * as assert from 'assert';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';

suite('Editor Modes - Modes Registry', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService= new TestInstantiationService();
		instantiationService.stub(IExtensionService);
	});

	test('Bug 12104: [f12] createModel not successfully handling mime type list?', () => {
		let modeService = instantiationService.createInstance(ModeServiceImpl);
		assert.equal(modeService.getModeId('text/html,text/plain'), 'html');
	});
});

