/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { SessionsCustomizationHarnessService } from '../../browser/customizationHarnessService.js';

suite('SessionsCustomizationHarnessService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not register the Local harness', () => {
		const promptsService = new class extends mock<IPromptsService>() { }();
		const service = disposables.add(new SessionsCustomizationHarnessService(promptsService));

		assert.deepStrictEqual({
			availableHarnesses: service.availableHarnesses.get().map(harness => harness.id),
			localHarness: service.findHarnessById(SessionType.Local),
		}, {
			availableHarnesses: [],
			localHarness: undefined,
		});
	});
});
