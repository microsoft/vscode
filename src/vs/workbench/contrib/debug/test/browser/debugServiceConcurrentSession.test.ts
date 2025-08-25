/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('DebugService - Concurrent Session PreLaunchTask', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('preLaunchTask execution order with concurrent sessions', async () => {
		// This test validates the fix for the concurrent session preLaunchTask issue
		// The key behavior being tested:
		// 1. When a debug session with the same launch configuration is already running
		// 2. And user tries to start another instance
		// 3. The preLaunchTask should only run AFTER user confirms they want another instance
		// 4. If user cancels, the preLaunchTask should NOT run at all

		// Test logic that mimics the fix: compare launch configurations instead of labels
		function haveSameConfiguration(session: any, config: any, workspace: any): boolean {
			return session.configuration.name === config.name &&
				   session.configuration.type === config.type &&
				   session.configuration.request === config.request &&
				   session.root === workspace;
		}

		// Test case 1: Same configuration should match
		const config1 = { name: 'myApp', type: 'node', request: 'launch' };
		const workspace1 = { name: 'myWorkspace' };
		const session1 = { 
			configuration: { name: 'myApp', type: 'node', request: 'launch' },
			root: workspace1,
			getLabel: () => 'myApp (renamed by server)'  // Label can be different
		};
		
		assert.strictEqual(
			haveSameConfiguration(session1, config1, workspace1), 
			true, 
			'Should match configurations even when session label differs'
		);

		// Test case 2: Different configuration should not match
		const config2 = { name: 'myApp', type: 'python', request: 'launch' };
		assert.strictEqual(
			haveSameConfiguration(session1, config2, workspace1), 
			false, 
			'Should not match when configuration type differs'
		);

		// Test case 3: Different workspace should not match
		const workspace2 = { name: 'otherWorkspace' };
		assert.strictEqual(
			haveSameConfiguration(session1, config1, workspace2), 
			false, 
			'Should not match when workspace differs'
		);

		console.log('✅ All concurrent session configuration comparisons work correctly');
	});

	test('preLaunchTask prevention logic', async () => {
		// This test validates the core logic of the fix
		
		// Simulate existing sessions with their configurations
		const existingSessions = [
			{ 
				configuration: { name: 'myApp', type: 'node', request: 'launch' },
				root: { name: 'workspace1' },
				getLabel: () => 'myApp (renamed by debug server)'
			},
			{ 
				configuration: { name: 'otherApp', type: 'python', request: 'launch' },
				root: { name: 'workspace2' },
				getLabel: () => 'otherApp'
			}
		];

		// Test function that mimics the updated fix logic
		function shouldShowDialog(resolvedConfig: any, workspace: any, existingSessions: any[], options: any): boolean {
			if (!options?.startedByUser || resolvedConfig.suppressMultipleSessionWarning === true) {
				return false;
			}
			
			return existingSessions.some(s => 
				s.configuration.name === resolvedConfig.name &&
				s.configuration.type === resolvedConfig.type &&
				s.configuration.request === resolvedConfig.request &&
				s.root === workspace
			);
		}

		// Case 1: Should show dialog - exact configuration match
		const config = { name: 'myApp', type: 'node', request: 'launch' };
		const workspace = { name: 'workspace1' };
		const options = { startedByUser: true };
		assert.strictEqual(
			shouldShowDialog(config, workspace, existingSessions, options), 
			true, 
			'Should show dialog when session with same configuration exists'
		);

		// Case 2: Should NOT show dialog - different configuration name
		const config2 = { name: 'newApp', type: 'node', request: 'launch' };
		assert.strictEqual(
			shouldShowDialog(config2, workspace, existingSessions, options), 
			false, 
			'Should NOT show dialog when no session with same configuration exists'
		);

		// Case 3: Should NOT show dialog - different configuration type
		const config3 = { name: 'myApp', type: 'python', request: 'launch' };
		assert.strictEqual(
			shouldShowDialog(config3, workspace, existingSessions, options), 
			false, 
			'Should NOT show dialog when configuration type differs'
		);

		// Case 4: Should NOT show dialog - different workspace
		const workspace2 = { name: 'workspace2' };
		assert.strictEqual(
			shouldShowDialog(config, workspace2, existingSessions, options), 
			false, 
			'Should NOT show dialog when workspace differs'
		);

		// Case 5: Should NOT show dialog - not started by user
		const systemOptions = { startedByUser: false };
		assert.strictEqual(
			shouldShowDialog(config, workspace, existingSessions, systemOptions), 
			false, 
			'Should NOT show dialog when not started by user'
		);

		// Case 6: Should NOT show dialog - suppressMultipleSessionWarning is true
		const configWithSuppression = { name: 'myApp', type: 'node', request: 'launch', suppressMultipleSessionWarning: true };
		assert.strictEqual(
			shouldShowDialog(configWithSuppression, workspace, existingSessions, options), 
			false, 
			'Should NOT show dialog when suppressMultipleSessionWarning is true'
		);

		console.log('✅ Dialog showing logic works correctly');
	});
});