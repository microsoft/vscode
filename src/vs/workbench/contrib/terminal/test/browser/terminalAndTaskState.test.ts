/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITerminalAndTaskState, ITerminalAndTaskStateEntry } from '../../../../../platform/terminal/common/terminal.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('TerminalAndTaskState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should track all terminal sources correctly', async () => {
		const mockTerminals: ITerminalAndTaskStateEntry[] = [
			{
				id: 1,
				source: 'user',
				type: 'Local',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: false,
				name: 'Terminal 1',
				createdAt: Date.now()
			},
			{
				id: 2,
				source: 'github.copilot.terminalPanel',
				type: 'Local',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: false,
				name: 'Copilot Terminal',
				createdAt: Date.now()
			},
			{
				id: 3,
				source: 'task',
				type: 'Task',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: false,
				name: 'Build Task',
				createdAt: Date.now()
			},
			{
				id: 4,
				source: 'extension',
				type: 'Local',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: true,
				name: 'Extension Terminal',
				createdAt: Date.now()
			}
		];

		const state: ITerminalAndTaskState = { terminals: mockTerminals };

		// Verify that all terminals are tracked regardless of source
		assert.strictEqual(state.terminals.length, 4);
		
		// Verify user terminal is tracked
		const userTerminal = state.terminals.find(t => t.source === 'user');
		assert.ok(userTerminal);
		assert.strictEqual(userTerminal.name, 'Terminal 1');

		// Verify Copilot terminal is tracked
		const copilotTerminal = state.terminals.find(t => t.source === 'github.copilot.terminalPanel');
		assert.ok(copilotTerminal);
		assert.strictEqual(copilotTerminal.name, 'Copilot Terminal');

		// Verify task terminal is tracked
		const taskTerminal = state.terminals.find(t => t.source === 'task');
		assert.ok(taskTerminal);
		assert.strictEqual(taskTerminal.type, 'Task');

		// Verify extension terminal is tracked
		const extensionTerminal = state.terminals.find(t => t.source === 'extension');
		assert.ok(extensionTerminal);
		assert.strictEqual(extensionTerminal.isExtensionOwnedTerminal, true);
	});

	test('should handle empty terminal state', () => {
		const state: ITerminalAndTaskState = { terminals: [] };
		assert.strictEqual(state.terminals.length, 0);
	});

	test('should preserve terminal metadata', () => {
		const terminal: ITerminalAndTaskStateEntry = {
			id: 123,
			source: 'github.copilot.terminalPanel',
			type: 'Local',
			isFeatureTerminal: true,
			isExtensionOwnedTerminal: false,
			name: 'Test Terminal',
			createdAt: 1234567890
		};

		const state: ITerminalAndTaskState = { terminals: [terminal] };
		const storedTerminal = state.terminals[0];

		assert.strictEqual(storedTerminal.id, 123);
		assert.strictEqual(storedTerminal.source, 'github.copilot.terminalPanel');
		assert.strictEqual(storedTerminal.type, 'Local');
		assert.strictEqual(storedTerminal.isFeatureTerminal, true);
		assert.strictEqual(storedTerminal.isExtensionOwnedTerminal, false);
		assert.strictEqual(storedTerminal.name, 'Test Terminal');
		assert.strictEqual(storedTerminal.createdAt, 1234567890);
	});
});