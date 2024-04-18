/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import type { PromptInputModel } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';

suite('RequestStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let promptInputModel: PromptInputModel;

	setup(() => {

	});
});
