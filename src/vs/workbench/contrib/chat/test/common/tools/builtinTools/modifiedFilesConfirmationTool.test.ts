/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ModifiedFilesConfirmationTool, ModifiedFilesConfirmationToolData } from '../../../../common/tools/builtinTools/confirmationTool.js';

suite('ModifiedFilesConfirmationTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tool data exposes the expected schema', () => {
		assert.strictEqual(ModifiedFilesConfirmationToolData.id, 'vscode_get_modified_files_confirmation');
		assert.ok(ModifiedFilesConfirmationToolData.inputSchema);
		assert.deepStrictEqual(ModifiedFilesConfirmationToolData.inputSchema?.required, ['title', 'message', 'options', 'modifiedFiles']);
		assert.ok(ModifiedFilesConfirmationToolData.inputSchema?.properties?.options);
		assert.ok(ModifiedFilesConfirmationToolData.inputSchema?.properties?.modifiedFiles);
	});

	test('prepareToolInvocation parses file data and disables auto confirm', async () => {
		const tool = new ModifiedFilesConfirmationTool();

		const result = await tool.prepareToolInvocation({
			parameters: {
				title: 'Review modified files',
				message: 'Choose how to continue.',
				options: ['Copy Changes', 'Move Changes'],
				modifiedFiles: [{
					uri: 'file:///workspace/src/file1.ts',
					originalUri: 'file:///workspace/src/file1.original.ts',
					insertions: 10,
					deletions: 3,
					title: 'File 1'
				}]
			},
			toolCallId: 'call-1',
			chatSessionResource: URI.parse('vscode-chat://session'),
		}, CancellationToken.None);

		assert.ok(result);
		assert.strictEqual(result?.confirmationMessages?.allowAutoConfirm, false);
		assert.strictEqual(result?.toolSpecificData?.kind, 'modifiedFilesConfirmation');

		assert.deepStrictEqual(result.toolSpecificData.options, ['Copy Changes', 'Move Changes']);
		assert.strictEqual(URI.revive(result.toolSpecificData.modifiedFiles[0].uri).toString(), 'file:///workspace/src/file1.ts');
		assert.strictEqual(result.toolSpecificData.modifiedFiles[0].originalUri ? URI.revive(result.toolSpecificData.modifiedFiles[0].originalUri).toString() : undefined, 'file:///workspace/src/file1.original.ts');
		assert.strictEqual(result.toolSpecificData.modifiedFiles[0].insertions, 10);
		assert.strictEqual(result.toolSpecificData.modifiedFiles[0].deletions, 3);
	});

	test('invoke returns the selected option', async () => {
		const tool = new ModifiedFilesConfirmationTool();

		const result = await tool.invoke({
			callId: 'call-1',
			toolId: 'vscode_get_modified_files_confirmation',
			parameters: {},
			selectedCustomButton: 'Move Changes',
			context: undefined,
		}, async () => 0, { report: () => undefined }, CancellationToken.None);

		assert.deepStrictEqual(result.content, [{ kind: 'text', value: 'Move Changes' }]);
	});
});
