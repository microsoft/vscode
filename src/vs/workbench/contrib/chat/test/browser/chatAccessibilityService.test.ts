/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatAccessibilityService } from '../../browser/chatAccessibilityService.js';
import { IChatAccessibilityService } from '../../browser/chat.js';

suite('ChatAccessibilityService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatAccessibilityService: IChatAccessibilityService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		chatAccessibilityService = store.add(instantiationService.createInstance(ChatAccessibilityService));
	});

	test('service is created', () => {
		assert.ok(chatAccessibilityService);
	});
});
