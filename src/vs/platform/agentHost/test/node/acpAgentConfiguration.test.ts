/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { parseAcpAgentConfigurations } from '../../node/acp/acpAgentConfiguration.js';

suite('AcpAgentConfiguration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses valid launch configurations and skips invalid entries', () => {
		const logService = disposables.add(new NullLogService());
		const configurations = parseAcpAgentConfigurations(JSON.stringify([
			{
				id: 'opencode',
				name: 'OpenCode',
				command: '/usr/local/bin/opencode',
				args: ['acp'],
				env: { OPENCODE_PROFILE: 'work' },
			},
			{ id: 'OpenCode', command: 'invalid-id' },
			{ id: 'opencode', command: 'duplicate' },
			{ id: 'invalid-args', command: 'invalid-args', args: ['--acp', 1] },
			{ id: 'invalid-env', command: 'invalid-env', env: { TOKEN: 1 } },
			{ id: 'qwen', command: 'qwen', args: ['--acp'] },
		]), logService);

		assert.deepStrictEqual(configurations, [
			{
				id: 'opencode',
				name: 'OpenCode',
				command: '/usr/local/bin/opencode',
				args: ['acp'],
				env: { OPENCODE_PROFILE: 'work' },
			},
			{
				id: 'qwen',
				command: 'qwen',
				args: ['--acp'],
				env: undefined,
				name: undefined,
			},
		]);
	});
});
