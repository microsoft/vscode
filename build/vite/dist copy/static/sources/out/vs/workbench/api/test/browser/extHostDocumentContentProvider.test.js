/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostDocumentContentProvider } from '../../common/extHostDocumentContentProviders.js';
import { Emitter } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
suite('ExtHostDocumentContentProvider', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const resource = URI.parse('foo:bar');
    let documentContentProvider;
    let mainThreadContentProvider;
    const changes = [];
    setup(() => {
        changes.length = 0;
        mainThreadContentProvider = new class {
            $registerTextContentProvider(handle, scheme) {
            }
            $unregisterTextContentProvider(handle) {
            }
            async $onVirtualDocumentChange(uri, value) {
                await timeout(10);
                changes.push([uri, value]);
            }
            dispose() {
                throw new Error('Method not implemented.');
            }
        };
        const ehContext = SingleProxyRPCProtocol(mainThreadContentProvider);
        const documentsAndEditors = new ExtHostDocumentsAndEditors(ehContext, new NullLogService());
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
        documentContentProvider = new ExtHostDocumentContentProvider(ehContext, documentsAndEditors, new NullLogService());
    });
    test('TextDocumentContentProvider drops onDidChange events when they happen quickly #179711', async () => {
        await runWithFakedTimers({}, async function () {
            const emitter = new Emitter();
            const contents = ['X', 'Y'];
            let counter = 0;
            let stack = 0;
            const d = documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
                onDidChange: emitter.event,
                async provideTextDocumentContent(_uri) {
                    assert.strictEqual(stack, 0);
                    stack++;
                    try {
                        await timeout(0);
                        return contents[counter++ % contents.length];
                    }
                    finally {
                        stack--;
                    }
                }
            });
            emitter.fire(resource);
            emitter.fire(resource);
            await timeout(100);
            assert.strictEqual(changes.length, 2);
            assert.strictEqual(changes[0][1], 'X');
            assert.strictEqual(changes[1][1], 'Y');
            d.dispose();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUV6RixLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBRTVDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0QyxJQUFJLHVCQUF1RCxDQUFDO0lBQzVELElBQUkseUJBQWtFLENBQUM7SUFDdkUsTUFBTSxPQUFPLEdBQTBDLEVBQUUsQ0FBQztJQUUxRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBRVYsT0FBTyxDQUFD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