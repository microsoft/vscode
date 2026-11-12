/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { localModelErrorActions } from '../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService, OpenOptions } from '../../../../../../platform/opener/common/opener.js';
import { ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { getLocalModelErrorActionLabel, runLocalModelErrorAction } from '../../../browser/agentSessions/agentHost/localModelErrorActions.js';

suite('localModelErrorActions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('every fix has one label and runs the same wherever the error shows; Get llama.cpp opens the directions in the browser', async () => {
		const calls: string[] = [];
		const connection = upcastPartial<IAgentConnection>({});
		const context = {
			connection,
			localModelService: upcastPartial<ILocalModelService>({
				retry: (_connection, operationId) => { calls.push(`retry:${operationId}`); return true; },
				start: () => { calls.push('start'); return true; },
				stopPrevious: () => { calls.push('stopPrevious'); return true; },
			}),
			commandService: upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { calls.push(`command:${id}:${args.join(',')}`); return undefined; } }),
			openerService: upcastPartial<IOpenerService>({ open: async (target: URI | string, options?: OpenOptions) => { calls.push(`open:${target.toString()}:${!!options?.openExternal}`); return true; } }),
		};
		await runLocalModelErrorAction('retry', 'op-1', context);
		await runLocalModelErrorAction('retry', undefined, context);
		await runLocalModelErrorAction('stopPrevious', undefined, context);
		await runLocalModelErrorAction('openSettings', undefined, context);
		await runLocalModelErrorAction('getLlamaCpp', undefined, context);
		assert.deepStrictEqual({ labels: localModelErrorActions.map(getLocalModelErrorActionLabel), calls }, {
			labels: ['Retry', 'Stop Previous Server', 'Open Settings', 'Get llama.cpp'],
			calls: [
				'retry:op-1',
				// An error of the active model's server has no operation: Retry loads it again, finding a llama.cpp installed since.
				'start',
				'stopPrevious',
				'command:workbench.action.openSettings:@id:chat.copilot.localModel.llamaServerPath',
				'open:https://github.com/ggml-org/llama.cpp/releases:true',
			],
		});
	});
});
