/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as extHostTypes from '../../common/extHostTypes.js';
import { MainContext, IWorkspaceEditDto, IWorkspaceEditStepDto, MainThreadBulkEditsShape, IWorkspaceTextEditDto } from '../../common/extHost.protocol.js';
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
	let workspaceEditSequence: IWorkspaceEditStepDto[] | undefined;
	let lastUndoStopBefore: boolean | undefined;
	let lastUndoStopAfter: boolean | undefined;

	setup(() => {
		workspaceResourceEdits = null!;
		workspaceEditSequence = undefined;
		lastUndoStopBefore = undefined;
		lastUndoStopAfter = undefined;

		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadBulkEdits, new class extends mock<MainThreadBulkEditsShape>() {
			override $tryApplyWorkspaceEdit(_workspaceResourceEdits: SerializableObjectWithBuffers<IWorkspaceEditDto>, _undoRedoGroupId?: number, _isRefactoring?: boolean, undoStopBefore?: boolean, undoStopAfter?: boolean): Promise<boolean> {
				workspaceResourceEdits = _workspaceResourceEdits.value;
				lastUndoStopBefore = undoStopBefore;
				lastUndoStopAfter = undoStopAfter;
				return Promise.resolve(true);
			}
			override $tryApplyWorkspaceEditSequence(stepsDto: SerializableObjectWithBuffers<IWorkspaceEditStepDto[]>): Promise<boolean> {
				workspaceEditSequence = stepsDto.value;
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

	test('requires workspaceEditUndoStops proposal for undoStop metadata', async () => {
		const edit = new extHostTypes.WorkspaceEdit();
		edit.replace(resource, new extHostTypes.Range(0, 0, 0, 0), 'a');
		assert.throws(
			() => bulkEdits.applyWorkspaceEdit(edit, nullExtensionDescription, { undoStopBefore: false, undoStopAfter: false }),
			/workspaceEditUndoStops/
		);
	});

	test('forwards undoStopBefore and undoStopAfter when proposal is enabled', async () => {
		const edit = new extHostTypes.WorkspaceEdit();
		edit.replace(resource, new extHostTypes.Range(0, 0, 0, 0), 'a');
		const extension = { ...nullExtensionDescription, enabledApiProposals: ['workspaceEditUndoStops'] };
		await bulkEdits.applyWorkspaceEdit(edit, extension, { undoStopBefore: false, undoStopAfter: false });
		assert.strictEqual(lastUndoStopBefore, false);
		assert.strictEqual(lastUndoStopAfter, false);
	});

	test('applyWorkspaceEditSequence requires workspaceEditUndoStops proposal and forwards steps', async () => {
		const edit1 = new extHostTypes.WorkspaceEdit();
		edit1.replace(resource, new extHostTypes.Range(0, 0, 0, 0), 'a');
		const edit2 = new extHostTypes.WorkspaceEdit();
		edit2.replace(resource, new extHostTypes.Range(0, 1, 0, 1), ' ');

		assert.throws(
			() => bulkEdits.applyWorkspaceEditSequence([{ edit: edit1 }], nullExtensionDescription),
			/workspaceEditUndoStops/
		);

		const extension = { ...nullExtensionDescription, enabledApiProposals: ['workspaceEditUndoStops'] };
		await bulkEdits.applyWorkspaceEditSequence([
			{ edit: edit1, metadata: { undoStopBefore: false, undoStopAfter: false } },
			{ edit: edit2, metadata: { undoStopBefore: true, undoStopAfter: false } },
		], extension);
		assert.strictEqual(workspaceEditSequence?.length, 2);
		assert.strictEqual((<IWorkspaceTextEditDto>workspaceEditSequence![0].edit.edits[0]).versionId, 1337);
		assert.strictEqual((<IWorkspaceTextEditDto>workspaceEditSequence![1].edit.edits[0]).versionId, undefined);
		assert.strictEqual(workspaceEditSequence![0].undoStopBefore, false);
		assert.strictEqual(workspaceEditSequence![1].undoStopBefore, true);
	});

});
