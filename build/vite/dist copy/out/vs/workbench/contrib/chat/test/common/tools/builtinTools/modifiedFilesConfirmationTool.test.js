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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2wudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL21vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUU3SSxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBQzNDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlDQUFpQyxDQUFDLEVBQUUsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sQ0FBQyxFQUFFLENBQUMsaUNBQWlDLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQ0FBaUMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUNsSSxNQUFNLENBQUMsRUFBRSxDQUFDLGlDQUFpQyxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDOUUsTUFBTSxDQUFD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