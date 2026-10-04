/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveCopilotConfigSlashSubmit } from '../../../browser/agentSessions/agentHost/copilotConfigSlashSubmitHandler.js';

suite('CopilotConfigSlashSubmitHandler', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves typed config slash commands', () => {
		assert.deepStrictEqual({
			yoloOn: resolveCopilotConfigSlashSubmit('/yolo on'),
			yoloOff: resolveCopilotConfigSlashSubmit('/yolo off'),
			yoloInvalid: resolveCopilotConfigSlashSubmit('/yolo onxxxcva'),
			planPrompt: resolveCopilotConfigSlashSubmit('/plan implement this'),
			unknown: resolveCopilotConfigSlashSubmit('/not-a-config-command'),
		}, {
			yoloOn: { applyConfig: { autoApprove: 'autoApprove' }, strippedPrompt: '' },
			yoloOff: { applyConfig: { autoApprove: 'default' }, strippedPrompt: '' },
			yoloInvalid: undefined,
			planPrompt: { applyConfig: { mode: 'plan' }, strippedPrompt: 'implement this' },
			unknown: undefined,
		});
	});
});
