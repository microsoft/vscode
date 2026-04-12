/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { TextDocumentSaveReason, TextEdit, Position, EndOfLine } from '../../common/extHostTypes.js';
import { ExtHostDocumentSaveParticipant } from '../../common/extHostDocumentSaveParticipant.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
function timeout(n) {
    return new Promise(resolve => setTimeout(resolve, n));
}
suite('ExtHostDocumentSaveParticipant', () => {
    const resource = URI.parse('foo:bar');
    const mainThreadBulkEdits = new class extends mock() {
    };
    let documents;
    const nullLogService = new NullLogService();
    setup(() => {
        const documentsAndEditors = new ExtHostDocumentsAndEditors(SingleProxyRPCProtocol(null), new NullLogService());
        documentsAndEditors.$acceptDocumentsAndEditorsDelta({
            addedDocuments: [{
                    isDirty: false,
                    languageId: 'foo',
                    uri: resource,
                    versionId: 1,
                    lines: ['foo'],
                    EOL: '\n',
                    encoding: 'utf8'
                }]
        });
        documents = new ExtHostDocuments(SingleProxyRPCProtocol(null), documentsAndEditors);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('no listeners, no problem', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => assert.ok(true));
    });
    test('event delivery', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        let event;
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            event = e;
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
            assert.ok(event);
            assert.strictEqual(event.reason, TextDocumentSaveReason.Manual);
            assert.strictEqual(typeof event.waitUntil, 'function');
        });
    });
    test('event delivery, immutable', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        let event;
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            event = e;
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
            assert.ok(event);
            // eslint-disable-next-line local/code-no-any-casts
            assert.throws(() => { event.document = null; });
        });
    });
    test('event delivery, bad listener', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            throw new Error('💀');
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(values => {
            sub.dispose();
            const [first] = values;
            assert.strictEqual(first, false);
        });
    });
    test('event delivery, bad listener doesn\'t prevent more events', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            throw new Error('💀');
        });
        let event;
        const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            event = e;
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub1.dispose();
            sub2.dispose();
            assert.ok(event);
        });
    });
    test('event delivery, in subscriber order', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        let counter = 0;
        const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            assert.strictEqual(counter++, 0);
        });
        const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            assert.strictEqual(counter++, 1);
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub1.dispose();
            sub2.dispose();
        });
    });
    test('event delivery, ignore bad listeners', async () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 1 });
        let callCount = 0;
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            callCount += 1;
            throw new Error('boom');
        });
        await participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */);
        await participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */);
        await participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */);
        await participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */);
        sub.dispose();
        assert.strictEqual(callCount, 2);
    });
    test('event delivery, overall timeout', async function () {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 20, errors: 5 });
        // let callCount = 0;
        const calls = [];
        const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            calls.push(1);
        });
        const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            calls.push(2);
            event.waitUntil(timeout(100));
        });
        const sub3 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            calls.push(3);
        });
        const values = await participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */);
        sub1.dispose();
        sub2.dispose();
        sub3.dispose();
        assert.deepStrictEqual(calls, [1, 2]);
        assert.strictEqual(values.length, 2);
    });
    test('event delivery, waitUntil', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            event.waitUntil(timeout(10));
            event.waitUntil(timeout(10));
            event.waitUntil(timeout(10));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
        });
    });
    test('event delivery, waitUntil must be called sync', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            event.waitUntil(new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        assert.throws(() => event.waitUntil(timeout(10)));
                        resolve(undefined);
                    }
                    catch (e) {
                        reject(e);
                    }
                }, 10);
            }));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
        });
    });
    test('event delivery, waitUntil will timeout', function () {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 3 });
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
            event.waitUntil(timeout(100));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(values => {
            sub.dispose();
            const [first] = values;
            assert.strictEqual(first, false);
        });
    });
    test('event delivery, waitUntil failure handling', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
        const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            e.waitUntil(Promise.reject(new Error('dddd')));
        });
        let event;
        const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            event = e;
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            assert.ok(event);
            sub1.dispose();
            sub2.dispose();
        });
    });
    test('event delivery, pushEdits sync', () => {
        let dto;
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
            $tryApplyWorkspaceEdit(_edits) {
                dto = _edits.value;
                return Promise.resolve(true);
            }
        });
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
            e.waitUntil(Promise.resolve([TextEdit.setEndOfLine(EndOfLine.CRLF)]));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
            assert.strictEqual(dto.edits.length, 2);
            assert.ok(dto.edits[0].textEdit);
            assert.ok(dto.edits[1].textEdit);
        });
    });
    test('event delivery, concurrent change', () => {
        let edits;
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
            $tryApplyWorkspaceEdit(_edits) {
                edits = _edits.value;
                return Promise.resolve(true);
            }
        });
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            // concurrent change from somewhere
            documents.$acceptModelChanged(resource, {
                changes: [{
                        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                        rangeOffset: undefined,
                        rangeLength: undefined,
                        text: 'bar'
                    }],
                eol: undefined,
                versionId: 2,
                isRedoing: false,
                isUndoing: false,
                detailedReason: undefined,
                isFlush: false,
                isEolChange: false,
            }, true);
            e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(values => {
            sub.dispose();
            assert.strictEqual(edits, undefined);
            assert.strictEqual(values[0], false);
        });
    });
    test('event delivery, two listeners -> two document states', () => {
        const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
            $tryApplyWorkspaceEdit(dto) {
                for (const edit of dto.value.edits) {
                    const uri = URI.revive(edit.resource);
                    const { text, range } = edit.textEdit;
                    documents.$acceptModelChanged(uri, {
                        changes: [{
                                range,
                                text,
                                rangeOffset: undefined,
                                rangeLength: undefined,
                            }],
                        eol: undefined,
                        versionId: documents.getDocumentData(uri).version + 1,
                        isRedoing: false,
                        isUndoing: false,
                        detailedReason: undefined,
                        isFlush: false,
                        isEolChange: false,
                    }, true);
                    // }
                }
                return Promise.resolve(true);
            }
        });
        const document = documents.getDocument(resource);
        const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            // the document state we started with
            assert.strictEqual(document.version, 1);
            assert.strictEqual(document.getText(), 'foo');
            e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
        });
        const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            // the document state AFTER the first listener kicked in
            assert.strictEqual(document.version, 2);
            assert.strictEqual(document.getText(), 'barfoo');
            e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(values => {
            sub1.dispose();
            sub2.dispose();
            // the document state AFTER eventing is done
            assert.strictEqual(document.version, 3);
            assert.strictEqual(document.getText(), 'barbarfoo');
        });
    });
    test('Log failing listener', function () {
        let didLogSomething = false;
        const participant = new ExtHostDocumentSaveParticipant(new class extends NullLogService {
            error(message, ...args) {
                didLogSomething = true;
            }
        }, documents, mainThreadBulkEdits);
        const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
            throw new Error('boom');
        });
        return participant.$participateInSave(resource, 1 /* SaveReason.EXPLICIT */).then(() => {
            sub.dispose();
            assert.strictEqual(didLogSomething, true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXJHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBR3RFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHaEcsU0FBUyxPQUFPLENBQUMsQ0FBUztJQUN6QixPQUFPLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZELENBQUM7QUFFRCxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBRTVDLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEMsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQTRCO0tBQUksQ0FBQztJQUNuRixJQUFJLFNBQTJCLENBQUM7SUFDaEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztJQUU1QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLDBCQUEwQixDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUMvRyxtQkFBbUIsQ0FBQywrQkFBK0IsQ0FBQztZQUNuRCxjQUFjLEVBQUUsQ0FBQztvQkFDaEIsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLEdBQUcsRUFBRSxRQUFRO29CQUNiLFNBQVMsRUFBRSxDQUFDO29CQUNaLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztvQkFDZCxHQUFHLEVBQUUsSUFBSTtvQkFDVCxRQUFRLEVBQUUsTUFBTTtpQkFDaEIsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUNILFNBQVMsR0FBRyxJQUFJLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDckYsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7UUFDckMsTUFBTSxXQUFXLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDdkcsT0FBTyxXQUFXLENBQUMsa0JBQWtCLENBQUMsUUFBUSw4QkFBc0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUMzQixNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUV2RyxJQUFJLEtBQXVDLENBQUM7UUFDNUMsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxDQUFDO1lBQzNGLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM5RSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sS0FBSyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN0QyxNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUV2RyxJQUFJLEtBQXVDLENBQUM7UUFDNUMsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxDQUFDO1lBQzNGLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM5RSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pCLG1EQUFtRDtZQUNuRCxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFJLEtBQUssQ0FBQyxRQUFnQixHQUFHLElBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1FBQ3pDLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRXZHLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUMzRixNQUFNLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxXQUFXLENBQUMsa0JBQWtCLENBQUMsUUFBUSw4QkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDbEYsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRWQsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUN2QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJEQUEyRCxFQUFFLEdBQUcsRUFBRTtRQUN0RSxNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUV2RyxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDNUYsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksS0FBdUMsQ0FBQztRQUM1QyxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDNUYsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNYLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxXQUFXLENBQUMsa0JBQWtCLENBQUMsUUFBUSw4QkFBc0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQzlFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVmLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxXQUFXLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFdkcsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFVBQVUsS0FBSztZQUNoRyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxLQUFLO1lBQ2hHLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDOUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkQsTUFBTSxXQUFXLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVsSSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxLQUFLO1lBQy9GLFNBQVMsSUFBSSxDQUFDLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxXQUFXLENBQUMsa0JBQWtCLENBQUMsUUFBUSw4QkFBc0IsQ0FBQztRQUNwRSxNQUFNLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDO1FBQ3BFLE1BQU0sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUM7UUFDcEUsTUFBTSxXQUFXLENBQUMsa0JBQWtCLENBQUMsUUFBUSw4QkFBc0IsQ0FBQztRQUVwRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLO1FBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkkscUJBQXFCO1FBQ3JCLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztRQUMzQixNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLEtBQUs7WUFDaEcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxLQUFLO1lBQ2hHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZCxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxLQUFLO1lBQ2hHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLE1BQU0sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUM7UUFDbkYsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRXZHLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFVBQVUsS0FBSztZQUUvRixLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM5RSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUVKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtRQUMxRCxNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUV2RyxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLEtBQUs7WUFFL0YsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBWSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDMUQsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDZixJQUFJLENBQUM7d0JBQ0osTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2xELE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDcEIsQ0FBQztvQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO3dCQUNaLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDWCxDQUFDO2dCQUVGLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNSLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM5RSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFO1FBRTlDLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbEksTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxLQUFLO1lBQy9GLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNsRixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsTUFBTSxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRXZHLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUM1RixDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUF1QyxDQUFDO1FBQzVDLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUM1RixLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDOUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFFM0MsSUFBSSxHQUFzQixDQUFDO1FBQzNCLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQThCO1lBQ3JJLHNCQUFzQixDQUFDLE1BQXdEO2dCQUM5RSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztnQkFDbkIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlCLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDM0YsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDOUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRWQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4QyxNQUFNLENBQUMsRUFBRSxDQUF5QixHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxFQUFFLENBQXlCLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFFOUMsSUFBSSxLQUF3QixDQUFDO1FBQzdCLE1BQU0sV0FBVyxHQUFHLElBQUksOEJBQThCLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQThCO1lBQ3JJLHNCQUFzQixDQUFDLE1BQXdEO2dCQUM5RSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztnQkFDckIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlCLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFFM0YsbUNBQW1DO1lBQ25DLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLEVBQUU7Z0JBQ3ZDLE9BQU8sRUFBRSxDQUFDO3dCQUNULEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUU7d0JBQzdFLFdBQVcsRUFBRSxTQUFVO3dCQUN2QixXQUFXLEVBQUUsU0FBVTt3QkFDdkIsSUFBSSxFQUFFLEtBQUs7cUJBQ1gsQ0FBQztnQkFDRixHQUFHLEVBQUUsU0FBVTtnQkFDZixTQUFTLEVBQUUsQ0FBQztnQkFDWixTQUFTLEVBQUUsS0FBSztnQkFDaEIsU0FBUyxFQUFFLEtBQUs7Z0JBQ2hCLGNBQWMsRUFBRSxTQUFTO2dCQUN6QixPQUFPLEVBQUUsS0FBSztnQkFDZCxXQUFXLEVBQUUsS0FBSzthQUNsQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBRVQsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLDhCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNsRixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsRUFBRTtRQUVqRSxNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUE4QjtZQUNySSxzQkFBc0IsQ0FBQyxHQUFxRDtnQkFFM0UsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUVwQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUF5QixJQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQy9ELE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQTJCLElBQUssQ0FBQyxRQUFRLENBQUM7b0JBQy9ELFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUU7d0JBQ2xDLE9BQU8sRUFBRSxDQUFDO2dDQUNULEtBQUs7Z0NBQ0wsSUFBSTtnQ0FDSixXQUFXLEVBQUUsU0FBVTtnQ0FDdkIsV0FBVyxFQUFFLFNBQVU7NkJBQ3ZCLENBQUM7d0JBQ0YsR0FBRyxFQUFFLFNBQVU7d0JBQ2YsU0FBUyxFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFFLENBQUMsT0FBTyxHQUFHLENBQUM7d0JBQ3RELFNBQVMsRUFBRSxLQUFLO3dCQUNoQixTQUFTLEVBQUUsS0FBSzt3QkFDaEIsY0FBYyxFQUFFLFNBQVM7d0JBQ3pCLE9BQU8sRUFBRSxLQUFLO3dCQUNkLFdBQVcsRUFBRSxLQUFLO3FCQUNsQixFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNULElBQUk7Z0JBQ0wsQ0FBQztnQkFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFakQsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLDhCQUE4QixDQUFDLHdCQUF3QixDQUFDLENBQUMsVUFBVSxDQUFDO1lBQzVGLHFDQUFxQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFOUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDNUYsd0RBQXdEO1lBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUVqRCxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2xGLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVmLDRDQUE0QztZQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFFSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRTtRQUM1QixJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFDNUIsTUFBTSxXQUFXLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxJQUFJLEtBQU0sU0FBUSxjQUFjO1lBQzdFLEtBQUssQ0FBQyxPQUF1QixFQUFFLEdBQUcsSUFBZTtnQkFDekQsZUFBZSxHQUFHLElBQUksQ0FBQztZQUN4QixDQUFDO1NBQ0QsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUduQyxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDM0YsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsOEJBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUM5RSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==