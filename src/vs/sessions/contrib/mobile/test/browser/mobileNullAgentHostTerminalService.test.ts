/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITerminalChatService, ITerminalInstance } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { MobileNullAgentHostTerminalService } from '../../browser/mobileNullAgentHostTerminalService.js';

suite('MobileNullAgentHostTerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports unknown command and directory state for terminals it does not own', () => {
		const service = store.add(new MobileNullAgentHostTerminalService(upcastPartial<ITerminalChatService>({})));
		const terminal = upcastPartial<ITerminalInstance>({ instanceId: 1 });
		service.markCommandPending(terminal);
		assert.deepStrictEqual({
			profiles: service.profiles.get(),
			address: service.getAgentHostAddress(terminal),
			executing: service.isCommandExecuting(terminal),
			cwd: service.getCwd(terminal),
		}, { profiles: [], address: undefined, executing: undefined, cwd: undefined });
	});
});
