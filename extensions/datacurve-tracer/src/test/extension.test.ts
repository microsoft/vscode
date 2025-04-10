import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	// Define workspace path at suite level so it's accessible to all tests
	const tempWorkspacePath = path.join(__dirname, '../../temp-test-workspace');
	const storagePath = path.join(tempWorkspacePath, '.vscode-test-storage');

	// Setup function - runs before all tests
	suiteSetup(async function () {
		this.timeout(30000); // Increase timeout significantly

		console.log('Setting up test workspace...');

		// Ensure workspace directory exists
		if (fs.existsSync(tempWorkspacePath)) {
			// Clean up any existing test workspace
			try {
				fs.rmSync(tempWorkspacePath, { recursive: true, force: true });
			} catch (error) {
				console.error(`Failed to remove existing workspace: ${error}`);
			}
		}

		// Create fresh workspace directory
		fs.mkdirSync(tempWorkspacePath, { recursive: true });

		// Create storage directory for test extension
		fs.mkdirSync(storagePath, { recursive: true });

		try {
			// Create a README file
			const readmePath = path.join(tempWorkspacePath, 'README.md');
			fs.writeFileSync(
				readmePath,
				'# Test Workspace\nThis is a temporary workspace for testing.',
			);

			// Create a Python file to ensure extension activation
			const defaultPyPath = path.join(tempWorkspacePath, 'default.py');
			fs.writeFileSync(
				defaultPyPath,
				'# Default Python file to trigger extension activation\n\ndef hello():\n    print("Hello from test workspace")\n',
			);

			console.log(
				'Created test files, attempting to register mock commands...',
			);

			// Register all required mock commands
			vscode.commands.registerCommand(
				'datacurve-tracer.recordPlan',
				(idea: string) => {
					console.log(`MOCK: Recording plan '${idea}'`);
					const tracesLog = path.join(storagePath, 'traces.log');
					const entry =
						JSON.stringify({
							action_id: 'recordPlan',
							event: { idea },
							timestamp: Date.now(),
						}) + '\n';

					if (!fs.existsSync(path.dirname(tracesLog))) {
						fs.mkdirSync(path.dirname(tracesLog), {
							recursive: true,
						});
					}

					fs.appendFileSync(tracesLog, entry);
					return Promise.resolve();
				},
			);

			vscode.commands.registerCommand(
				'datacurve-tracer.recordSearch',
				(term: string) => {
					console.log(`MOCK: Recording search '${term}'`);
					const tracesLog = path.join(storagePath, 'traces.log');
					const entry =
						JSON.stringify({
							action_id: 'recordSearch',
							event: { term },
							timestamp: Date.now(),
						}) + '\n';

					fs.appendFileSync(tracesLog, entry);
					return Promise.resolve();
				},
			);

			// Add mock for curveExplorer.stateChanged to prevent error messages
			vscode.commands.registerCommand(
				'curveExplorer.stateChanged',
				(...args: any[]) => {
					console.log('MOCK: curveExplorer.stateChanged called');
					return Promise.resolve();
				},
			);

			console.log('Mock commands registered');
			console.log(`Test workspace created at: ${tempWorkspacePath}`);
			console.log(`Storage path created at: ${storagePath}`);
		} catch (error) {
			console.error(`Workspace setup failed: ${error}`);
			throw error;
		}
	});

	// Teardown function - runs after all tests
	suiteTeardown(async function () {
		this.timeout(10000); // Give teardown plenty of time

		console.log('Cleaning up test workspace...');

		// Close all open editors
		await vscode.commands.executeCommand(
			'workbench.action.closeAllEditors',
		);

		// Close any open terminals
		vscode.window.terminals.forEach((terminal) => terminal.dispose());

		// Give VS Code time to close everything
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Remove test workspace directory
		try {
			if (fs.existsSync(tempWorkspacePath)) {
				fs.rmSync(tempWorkspacePath, { recursive: true, force: true });
				console.log('Test workspace cleanup complete');
			}
		} catch (error) {
			console.error(`Failed to clean up workspace: ${error}`);
		}
	});

	console.log('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Trace recording workflow', async function () {
		// Increase timeout for this test as it performs many operations
		this.timeout(30000);

		// Use temp workspace path directly instead of getting from workspace folders
		const workspaceFolder = tempWorkspacePath;
		assert.ok(workspaceFolder, 'No workspace folder found');

		// Define file paths for multiple related Python files
		const mainFilePath = path.join(workspaceFolder, 'main.py');
		const helperFilePath = path.join(workspaceFolder, 'helper.py');
		const modelFilePath = path.join(workspaceFolder, 'model.py');
		const nonExistentFilePath = path.join(
			workspaceFolder,
			'non-existent.py',
		);

		// Clean up any existing test files
		for (const filePath of [mainFilePath, helperFilePath, modelFilePath]) {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
		}

		try {
			// 1. Record an idea (using our mock command)
			await vscode.commands.executeCommand(
				'datacurve-tracer.recordPlan',
				'Create a Python application with multiple modules',
			);
			console.log('Recorded initial plan');

			// 2. Create multiple related Python files

			// helper.py - Utility functions
			fs.writeFileSync(
				helperFilePath,
				'# Helper functions\n\n' +
				'def format_output(value):\n' +
				"    '''Format a value for display'''\n" +
				"    return f'Result: {value}'\n\n" +
				'def process_data(data):\n' +
				"    '''Process some data'''\n" +
				'    return data.upper()\n',
			);

			// model.py - Class definition
			fs.writeFileSync(
				modelFilePath,
				'# Data model definition\n\n' +
				'class DataItem:\n' +
				'    def __init__(self, name, value):\n' +
				'        self.name = name\n' +
				'        self.value = value\n\n' +
				'    def __str__(self):\n' +
				"        return f'{self.name}: {self.value}'\n\n" +
				'    def process(self):\n' +
				"        '''Process this data item'''\n" +
				"        return f'processed_{self.value}'\n",
			);

			// main.py - Main script that imports the others
			fs.writeFileSync(
				mainFilePath,
				'# Main application file\n\n' +
				'import helper\n' +
				'from model import DataItem\n\n' +
				'def main():\n' +
				'    # Create a data item\n' +
				"    item = DataItem('test_item', 'test_value')\n" +
				'    \n' +
				'    # Process the item\n' +
				'    processed = item.process()\n' +
				'    \n' +
				'    # Use helper function\n' +
				'    formatted = helper.format_output(processed)\n' +
				'    \n' +
				'    print(formatted)\n' +
				'    return formatted\n\n' +
				"if __name__ == '__main__':\n" +
				'    main()\n',
			);

			// 3. Open the main file
			const mainDoc =
				await vscode.workspace.openTextDocument(mainFilePath);
			const mainEditor = await vscode.window.showTextDocument(mainDoc);

			// 4. Modify the main file
			await mainEditor.edit((editBuilder) => {
				editBuilder.insert(
					new vscode.Position(7, 0),
					"    # Added new functionality\n    extra_data = helper.process_data('test_value')\n    print(f'Extra: {extra_data}')\n\n",
				);
			});

			// Save the main file
			await mainDoc.save();

			// 5. Execute the main file via terminal
			const terminal = vscode.window.createTerminal('Python Execution');
			terminal.show();

			// Use python or python3 depending on the environment
			terminal.sendText(`python '${mainFilePath}'`);

			// Wait for execution to complete (approximate)
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// 6. Close the main file
			await vscode.commands.executeCommand(
				'workbench.action.closeActiveEditor',
			);

			// 7. Record another idea
			await vscode.commands.executeCommand(
				'datacurve-tracer.recordPlan',
				'Improve the helper module',
			);

			// 8. Open the helper file (simulating 'cat')
			const helperDoc =
				await vscode.workspace.openTextDocument(helperFilePath);
			await vscode.window.showTextDocument(helperDoc);

			// 9. Try to cat on a non-existent file (should fail gracefully)
			try {
				await vscode.workspace.openTextDocument(nonExistentFilePath);
			} catch (error) {
				// Expected error, we can continue
			}

			// 10. Open the model file
			const modelDoc =
				await vscode.workspace.openTextDocument(modelFilePath);
			const modelEditor = await vscode.window.showTextDocument(modelDoc);

			// 11. Select a code segment in the model file
			modelEditor.selection = new vscode.Selection(
				new vscode.Position(8, 0),
				new vscode.Position(10, 36),
			);

			// Wait for selection to be processed
			await new Promise((resolve) => setTimeout(resolve, 300));

			// 12. Record a search
			await vscode.commands.executeCommand(
				'datacurve-tracer.recordSearch',
				'test_value',
			);

			// 13. Open the main file again
			await vscode.workspace
				.openTextDocument(mainFilePath)
				.then((document) => vscode.window.showTextDocument(document));

			// 14. Find and replace a string which occurs multiple times across files
			await vscode.commands.executeCommand(
				'editor.action.startFindReplaceAction',
			);

			// Set find value and replace value
			const findInput = 'test_value';
			const replaceInput = 'PRODUCTION_DATA';

			// Configure find/replace in current file
			await vscode.commands.executeCommand(
				'editor.actions.findWithArgs',
				{
					searchString: findInput,
					replaceString: replaceInput,
					isRegex: false,
					isCaseSensitive: false,
					isWholeWord: false,
				},
			);

			// Perform replace all in current file
			await vscode.commands.executeCommand('editor.action.replaceAll');

			// Wait for replace to complete
			await new Promise((resolve) => setTimeout(resolve, 500));

			// 15. Save main file
			const currentDoc = vscode.window.activeTextEditor?.document;
			if (currentDoc) {
				await currentDoc.save();
			}

			// 16. Execute the updated main file again to see the changes
			terminal.show();
			terminal.sendText(`python '${mainFilePath}'`);

			// Wait for execution to complete (approximate)
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// 17. Close main file
			await vscode.commands.executeCommand(
				'workbench.action.closeActiveEditor',
			);

			// Verify the content was changed in main.py
			const updatedMainDoc =
				await vscode.workspace.openTextDocument(mainFilePath);
			const mainContent = updatedMainDoc.getText();
			assert.ok(
				mainContent.includes('PRODUCTION_DATA'),
				'Text replacement did not occur in main.py',
			);

			// Also open and modify the helper file to demonstrate working with multiple files
			const reopenHelperDoc =
				await vscode.workspace.openTextDocument(helperFilePath);
			const helperEditor =
				await vscode.window.showTextDocument(reopenHelperDoc);

			// Add a new function to helper.py
			await helperEditor.edit((editBuilder) => {
				editBuilder.insert(
					new vscode.Position(9, 0),
					"\ndef validate_data(data):\n    '''Validate input data'''\n    return len(data) > 0\n",
				);
			});

			// Save and close helper file
			await reopenHelperDoc.save();
			await vscode.commands.executeCommand(
				'workbench.action.closeActiveEditor',
			);

			// Finally update and use the new function in main.py
			const finalMainDoc =
				await vscode.workspace.openTextDocument(mainFilePath);
			const finalMainEditor =
				await vscode.window.showTextDocument(finalMainDoc);

			await finalMainEditor.edit((editBuilder) => {
				// Add code that uses the new validate function
				editBuilder.insert(
					new vscode.Position(11, 0),
					"    # Validate the data\n    if helper.validate_data(extra_data):\n        print('Data is valid')\n\n",
				);
			});

			// Save the final main file
			await finalMainDoc.save();

			// Execute the final version of the main file
			terminal.show();
			terminal.sendText(`python '${mainFilePath}'`);

			// Wait for execution to complete (approximate)
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Close terminal and editor
			terminal.dispose();
			await vscode.commands.executeCommand(
				'workbench.action.closeActiveEditor',
			);
		} finally {
			// Individual test cleanup - no need to remove files here as they will be removed
			// in the suite teardown, but we'll close resources for cleanliness

			// Close any remaining editors from this test
			await vscode.commands.executeCommand(
				'workbench.action.closeAllEditors',
			);

			// Close any open terminals from this test
			vscode.window.terminals.forEach((terminal) => terminal.dispose());
		}
	});
});
