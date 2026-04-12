/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostDocumentsAndEditors', () => {
    let editors;
    setup(function () {
        editors = new ExtHostDocumentsAndEditors(new TestRPCProtocol(), new NullLogService());
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('The value of TextDocument.isClosed is incorrect when a text document is closed, #27949', () => {
        editors.$acceptDocumentsAndEditorsDelta({
            addedDocuments: [{
                    EOL: '\n',
                    isDirty: true,
                    languageId: 'fooLang',
                    uri: URI.parse('foo:bar'),
                    versionId: 1,
                    lines: [
                        'first',
                        'second'
                    ],
                    encoding: 'utf8'
                }]
        });
        return new Promise((resolve, reject) => {
            const d = editors.onDidRemoveDocuments(e => {
                try {
                    for (const data of e) {
                        assert.strictEqual(data.document.isClosed, true);
                    }
                    resolve(undefined);
                }
                catch (e) {
                    reject(e);
                }
                finally {
                    d.dispose();
                }
            });
            editors.$acceptDocumentsAndEditorsDelta({
                removedDocuments: [URI.parse('foo:bar')]
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7SUFFeEMsSUFBSSxPQUFtQyxDQUFDO0lBRXhDLEtBQUssQ0FBQztRQUNMLE9BQU8sR0FBRyxJQUFJLDBCQUEwQixDQUFDLElBQUksZUFBZSxFQUFFLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZGLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsd0ZBQXdGLEVBQUUsR0FBRyxFQUFFO1FBRW5HLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQztZQUN2QyxjQUFjLEVBQUUsQ0FBQztvQkFDaEIsR0FBRyxFQUFFLElBQUk7b0JBQ1QsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLFNBQVM7b0JBQ3JCLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQztvQkFDekIsU0FBUyxFQUFFLENBQUM7b0JBQ1osS0FBSyxFQUFFO3dCQUNOLE9BQU87d0JBQ1AsUUFBUTtxQkFDUjtvQkFDRCxRQUFRLEVBQUUsTUFBTTtpQkFDaEIsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUVILE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFFdEMsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUMxQyxJQUFJLENBQUM7b0JBRUosS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDbEQsQ0FBQztvQkFDRCxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3BCLENBQUM7Z0JBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDWixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQzt3QkFBUyxDQUFDO29CQUNWLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFFSCxPQUFPLENBQUMsK0JBQStCLENBQUM7Z0JBQ3ZDLGdCQUFnQixFQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQzthQUN4QyxDQUFDLENBQUM7UUFFSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyxDQUFDLENBQUMifQ==