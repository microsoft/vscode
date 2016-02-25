/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/html/common/html.contribution';
import * as assert from 'assert';
import {createMockModeService} from 'vs/editor/test/common/servicesTestUtils';

suite('Editor Modes - Modes Registry', () => {
	test('Bug 12104: [f12] createModel not successfully handling mime type list?', () => {
		let modeService = createMockModeService();
		assert.equal(modeService.getModeId('text/html,text/plain'), 'html');
	});
});

