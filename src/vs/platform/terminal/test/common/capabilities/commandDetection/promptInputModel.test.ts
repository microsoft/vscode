/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('RequestStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, new LogService(new ConsoleLogger()));
	});
});
