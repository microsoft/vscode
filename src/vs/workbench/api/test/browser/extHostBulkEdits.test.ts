/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as extHostTypes from '../../common/extHostTypes.js';
import { MainContext, IWorkspaceEditDto, MainThreadBulkEditsShape, IWorkspaceTextEditDto } from '../../common/extHost.protocol.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostBulkEdits } from '../../common/extHostBulkEdits.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';

suite('ExtHostBulkEdits.applyWorkspaceEdit', () => {

	const resource = URI.parse('foo:bar');
	let bulkEdits: ExtHostBulkEdits;
	let workspaceResourceEdits: IWorkspaceEditDto;

	setup(() => {
		workspaceResourceEdits = null!;

		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadBulkEdits, new class extends mock<MainThreadBulkEditsShape>() {
			override $tryApplyWorkspaceEdit(_workspaceResourceEdits: SerializableObjectWithBuffers<IWorkspaceEditDto>): Promise<boolean> {
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
		assert.strictEqual((<IWorkspaceTextEditDto>first).versionId, 1337);
	});

	test('does not use version id if document is not available', async () => {
		const edit = new extHostTypes.WorkspaceEdit();
		edit.replace(URI.parse('foo:bar2'), new extHostTypes.Range(0, 0, 0, 0), 'hello');
		await bulkEdits.applyWorkspaceEdit(edit, nullExtensionDescription, undefined);
		assert.strictEqual(workspaceResourceEdits.edits.length, 1);
		const [first] = workspaceResourceEdits.edits;
		assert.ok(typeof (<IWorkspaceTextEditDto>first).versionId === 'undefined');
	});

});
