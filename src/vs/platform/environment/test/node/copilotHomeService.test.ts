/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join, resolve } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { INativeEnvironmentService } from '../../common/environment.js';
import { CopilotHomeService } from '../../node/copilotHomeService.js';

suite('CopilotHomeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const override of [undefined, '', '/configured/copilot', 'relative-copilot']) {
		test(`resolves and retains the ${override ? 'configured ' + override : 'default'} home`, () => {
			const previous = process.env.COPILOT_HOME;
			try {
				if (override === undefined) {
					delete process.env.COPILOT_HOME;
				} else {
					process.env.COPILOT_HOME = override;
				}
				const userHome = URI.file('/test-user');
				const instantiationService = store.add(new TestInstantiationService());
				instantiationService.stub(INativeEnvironmentService, upcastPartial<INativeEnvironmentService>({ userHome }));
				const service = instantiationService.createInstance(CopilotHomeService);

				process.env.COPILOT_HOME = '/changed-after-construction';
				assert.deepStrictEqual({ home: service.home, source: service.source }, {
					home: URI.file(resolve(override || join(userHome.fsPath, '.copilot'))),
					source: override ? 'environment' : 'userHome',
				});
			} finally {
				if (previous === undefined) {
					delete process.env.COPILOT_HOME;
				} else {
					process.env.COPILOT_HOME = previous;
				}
			}
		});
	}
});
