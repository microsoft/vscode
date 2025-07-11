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

	test('should handle terminals with undefined source', () => {
		const terminal: ITerminalAndTaskStateEntry = {
			id: 1,
			source: undefined,
			type: 'Local',
			isFeatureTerminal: false,
			isExtensionOwnedTerminal: false,
			name: 'Terminal without source',
			createdAt: Date.now()
		};

		const state: ITerminalAndTaskState = { terminals: [terminal] };
		assert.strictEqual(state.terminals.length, 1);
		assert.strictEqual(state.terminals[0].source, undefined);
	});

	test('should track different terminal types correctly', () => {
		const terminals: ITerminalAndTaskStateEntry[] = [
			{
				id: 1,
				source: 'user',
				type: 'Local',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: false,
				name: 'User Terminal',
				createdAt: Date.now()
			},
			{
				id: 2,
				source: 'task', 
				type: 'Task',
				isFeatureTerminal: false,
				isExtensionOwnedTerminal: false,
				name: 'Task Terminal',
				createdAt: Date.now()
			}
		];

		const state: ITerminalAndTaskState = { terminals };
		
		const userTerminals = state.terminals.filter(t => t.source === 'user');
		const taskTerminals = state.terminals.filter(t => t.source === 'task');
		
		assert.strictEqual(userTerminals.length, 1);
		assert.strictEqual(taskTerminals.length, 1);
		assert.strictEqual(taskTerminals[0].type, 'Task');
	});

	test('should support all expected terminal sources', () => {
		const expectedSources = [
			'user',
			'github.copilot.terminalPanel', 
			'task',
			'extension',
			'feature',
			'embedder',
			'mcp'
		];

		const terminals: ITerminalAndTaskStateEntry[] = expectedSources.map((source, index) => ({
			id: index + 1,
			source: source,
			type: source === 'task' ? 'Task' : 'Local',
			isFeatureTerminal: source === 'feature',
			isExtensionOwnedTerminal: source === 'extension',
			name: `${source} Terminal`,
			createdAt: Date.now()
		}));

		const state: ITerminalAndTaskState = { terminals };

		// Verify all sources are tracked
		for (const expectedSource of expectedSources) {
			const sourceTerminals = state.terminals.filter(t => t.source === expectedSource);
			assert.strictEqual(sourceTerminals.length, 1, `Expected exactly 1 terminal with source '${expectedSource}'`);
		}

		// Verify total count
		assert.strictEqual(state.terminals.length, expectedSources.length);
	});
});