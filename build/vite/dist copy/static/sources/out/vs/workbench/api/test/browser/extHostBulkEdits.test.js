/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as extHostTypes from '../../common/extHostTypes.js';
import { MainContext } from '../../common/extHost.protocol.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostBulkEdits } from '../../common/extHostBulkEdits.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostBulkEdits.applyWorkspaceEdit', () => {
    const resource = URI.parse('foo:bar');
    let bulkEdits;
    let workspaceResourceEdits;
    setup(() => {
        workspaceResourceEdits = null;
        const rpcProtocol = new TestRPCProtocol();
        rpcProtocol.set(MainContext.MainThreadBulkEdits, new class extends mock() {
            $tryApplyWorkspaceEdit(_workspaceResourceEdits) {
                workspaceResourceEdits = _workspaceResourceEdits.value;
                return Promise.resolve(true);
            }
        });
        const documentsAndEditors = new ExtHostDocumentsAndEditors(SingleProxyRPCProtocol(null), new NullLogService());
        documentsAndEditors.$acceptDocumentsAndEditorsDelta({
            addedDocuments: [{
                    isDirty: false,
                    languageId: 'foo',
                    uri: resource,
                    versionId: 1337,
                    lines: ['foo'],
                    EOL: '\n',
                    encoding: 'utf8'
                }]
        });
        bulkEdits = new ExtHostBulkEdits(rpcProtocol, documentsAndEditors);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('uses version id if document available', async () => {
        const edit = new extHostTypes.WorkspaceEdit();
        edit.replace(resource, new extHostTypes.Range(0, 0, 0, 0), 'hello');
        await bulkEdits.applyWorkspaceEdit(edit, nullExtensionDescription, undefined);
        assert.strictEqual(workspaceResourceEdits.edits.length, 1);
        const [first] = workspaceResourceEdits.edits;
        assert.strictEqual(first.versionId, 1337);
    });
    test('does not use version id if document is not available', async () => {
        const edit = new extHostTypes.WorkspaceEdit();
        edit.replace(URI.parse('foo:bar2'), new extHostTypes.Range(0, 0, 0, 0), 'hello');
        await bulkEdits.applyWorkspaceEdit(edit, nullExtensionDescription, undefined);
        assert.strictEqual(workspaceResourceEdits.edits.length, 1);
        const [first] = workspaceResourceEdits.edits;
        assert.ok(typeof first.versionId === 'undefined');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEJ1bGtFZGl0cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvZXh0SG9zdEJ1bGtFZGl0cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssWUFBWSxNQUFNLDhCQUE4QixDQUFDO0FBQzdELE9BQU8sRUFBRSxXQUFXLEVBQXNFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkksT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBR2hHLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7SUFFakQsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0QyxJQUFJLFNBQTJCLENBQUM7SUFDaEMsSUFBSSxzQkFBeUMsQ0FBQztJQUU5QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysc0JBQXNCLEdBQUcsSUFBSyxDQUFDO1FBRS9CLE1BQU0sV0FBVyxHQUFHLElB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