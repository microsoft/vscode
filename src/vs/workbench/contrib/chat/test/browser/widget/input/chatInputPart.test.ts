/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';

suite('ChatInputPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flushes and cancels pending synchronization before unbinding', () => {
		const operations: string[] = [];
		const input = Object.create(ChatInputPart.prototype) as ChatInputPart;
		Object.defineProperties(input, {
			_inputModel: { value: {}, writable: true },
			_inputModelSessionResource: { value: URI.parse('agent-host-copilot:/session'), writable: true },
			_unavailableCustomMode: { value: { id: 'file:///data.md', kind: 'agent' }, writable: true },
			_syncInputStateToModel: { value: () => operations.push('flush') },
			_syncTextDebounced: { value: { cancel: () => operations.push('cancel') } },
			_modelSyncDisposables: { value: { clear: () => operations.push('clearListeners') } },
			_currentSessionModelObservable: { value: { set: () => operations.push('clearSessionModel') } },
		});

		input.unbindInputModel();
		input.flushInputStateToModel();

		assert.deepStrictEqual(operations, ['flush', 'cancel', 'clearListeners', 'clearSessionModel']);
	});
});
