/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { resolve } from '../../../../../base/common/path.js';
import { env } from '../../../../../base/common/process.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IPathService } from '../../../../../platform/path/common/pathService.js';
import { TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { WorkbenchCopilotHomeService } from '../../common/copilotHomeService.js';

suite('WorkbenchCopilotHomeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const override of [undefined, '/configured/copilot']) {
		test(`resolves the ${override ? 'configured' : 'default'} local Copilot home`, () => {
			const previous = env.COPILOT_HOME;
			try {
				if (override === undefined) {
					delete env.COPILOT_HOME;
				} else {
					env.COPILOT_HOME = override;
				}
				const userHome = URI.file('/local/user');
				const instantiationService = store.add(new TestInstantiationService());
				instantiationService.stub(IPathService, new TestPathService(userHome));
				const service = instantiationService.createInstance(WorkbenchCopilotHomeService);

				assert.deepStrictEqual({ home: service.home, source: service.source }, {
					home: URI.file(resolve(override ?? URI.joinPath(userHome, '.copilot').fsPath)),
					source: override ? 'environment' : 'userHome',
				});
			} finally {
				if (previous === undefined) {
					delete env.COPILOT_HOME;
				} else {
					env.COPILOT_HOME = previous;
				}
			}
		});
	}
});
