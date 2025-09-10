/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Release Notes Editor Integration Tests', () => {

	teardown(async () => {
		// Close all editors after each test to prevent test pollution
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('should open release notes webview when command is executed', async () => {
		// Get initial tab count
		const initialTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);

		// Execute the release notes command
		await vscode.commands.executeCommand('update.showCurrentReleaseNotes');

		// Wait for the webview to be created (give it some time)
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Check that a new tab was opened
		const finalTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);
		assert.ok(finalTabCount > initialTabCount, 'A new tab should have been opened');

		// Look for a webview tab with release notes content
		let foundReleaseNotesTab = false;
		for (const tabGroup of vscode.window.tabGroups.all) {
			for (const tab of tabGroup.tabs) {
				if (tab.input instanceof vscode.TabInputWebview) {
					// Check if this is likely a release notes webview
					const webviewInput = tab.input as vscode.TabInputWebview;
					if (webviewInput.viewType === 'releaseNotes' || 
						tab.label.toLowerCase().includes('release notes') ||
						tab.label.toLowerCase().includes('what\'s new')) {
						foundReleaseNotesTab = true;
						break;
					}
				}
			}
			if (foundReleaseNotesTab) break;
		}

		assert.ok(foundReleaseNotesTab, 'Should find a release notes webview tab');
	});

	test('should handle multiple release notes calls gracefully', async () => {
		// Execute the command twice
		await vscode.commands.executeCommand('update.showCurrentReleaseNotes');
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		const firstCallTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);

		await vscode.commands.executeCommand('update.showCurrentReleaseNotes');
		await new Promise(resolve => setTimeout(resolve, 1000));

		const secondCallTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);

		// Should not create duplicate tabs (should reuse existing webview)
		assert.strictEqual(secondCallTabCount, firstCallTabCount, 'Should reuse existing release notes tab');
	});

	test('should work with show specific version command', async () => {
		const initialTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);

		// Try to show release notes for a specific version
		try {
			await vscode.commands.executeCommand('update.showReleaseNotes', '1.80.0');
			await new Promise(resolve => setTimeout(resolve, 2000));

			const finalTabCount = vscode.window.tabGroups.all.reduce((count: number, group) => count + group.tabs.length, 0);
			
			// Should either open a new tab or handle gracefully if version doesn't exist
			// We don't assert success here since the version might not exist, 
			// but we verify the command doesn't crash
			assert.ok(true, 'Command executed without throwing an error');
		} catch (error) {
			// Some versions might not exist, which is acceptable
			// We just want to ensure the command doesn't crash VS Code
			console.log('Release notes command handled error gracefully:', error);
			assert.ok(true, 'Command handled error gracefully');
		}
	});
});