/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range, TextSearchMatch2 } from '../../common/searchExtTypes.js';
import { NativeTextSearchManager } from '../../node/textSearchManager.js';
suite('NativeTextSearchManager', () => {
    test('fixes encoding', async () => {
        let correctEncoding = false;
        const provider = {
            provideTextSearchResults(query, options, progress, token) {
                correctEncoding = options.folderOptions[0].encoding === 'windows-1252';
                return null;
            }
        };
        const query = {
            type: 2 /* QueryType.Text */,
            contentPattern: {
                pattern: 'a'
            },
            folderQueries: [{
                    folder: URI.file('/some/folder'),
                    fileEncoding: 'windows1252'
                }]
        };
        const m = new NativeTextSearchManager(query, provider);
        await m.search(() => { }, CancellationToken.None);
        assert.ok(correctEncoding);
    });
    test('handles result from unmatched folder gracefully via optional chaining', async () => {
        let receivedResults = 0;
        const provider = {
            provideTextSearchResults(query, options, progress, token) {
                const range = new Range(0, 0, 0, 5);
                // Report a result from a folder that IS in the query - should be received
                progress.report(new TextSearchMatch2(URI.file('/folder1/test.txt'), [{ sourceRange: range, previewRange: range }], 'test match'));
                // Report a result from a folder that is NOT in the query
                // This exercises: folderQuery?.folder?.scheme where folderQuery is undefined
                // The optional chaining should handle this gracefully without throwing
                progress.report(new TextSearchMatch2(URI.file('/unknown/folder/file.txt'), [{ sourceRange: range, previewRange: range }], 'unmatched result'));
                return null;
            }
        };
        const query = {
            type: 2 /* QueryType.Text */,
            contentPattern: {
                pattern: 'a'
            },
            folderQueries: [
                { folder: URI.file('/folder1') }
            ]
        };
        const m = new NativeTextSearchManager(query, provider);
        // This should not throw even though a result from an unmatched folder was reported
        await m.search((results) => {
            receivedResults += results.length;
        }, CancellationToken.None);
        // Should only receive 1 result (the one from /folder1)
        // The result from /unknown/folder should be silently ignored
        assert.strictEqual(receivedResults, 1);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaE1hbmFnZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL3RleHRTZWFyY2hNYW5hZ2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUduRyxPQUFPLEVBQWtCLEtBQUssRUFBdUIsZ0JBQWdCLEVBQXVGLE1BQU0sZ0NBQWdDLENBQUM7QUFDbk0sT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUUsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUNyQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDakMsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO1FBQzVCLE1BQU0sUUFBUSxHQUF3QjtZQUNyQyx3QkFBd0IsQ0FBQyxLQUF1QixFQUFFLE9BQWtDLEVBQUUsUUFBcUMsRUFBRSxLQUF3QjtnQkFDcEosZUFBZSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLGNBQWMsQ0FBQztnQkFFdkUsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1NBQ0QsQ0FBQztRQUVGLE1BQU0sS0FBSyxHQUFlO1lBQ3pCLElBQUksd0JBQWdCO1lBQ3BCLGNBQWMsRUFBRTtnQkFDZixPQUFPLEVBQUUsR0FBRzthQUNaO1lBQ0QsYUFBYSxFQUFFLENBQUM7b0JBQ2YsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO29CQUNoQyxZQUFZLEVBQUUsYUFBYTtpQkFDM0IsQ0FBQztTQUNGLENBQUM7UUFFRixNQUFNLENBQUMsR0FBRyxJQUFJLHVCQUF1QixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWxELE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDNUIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUVBQXVFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEYsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLE1BQU0sUUFBUSxHQUF3QjtZQUNyQyx3QkFBd0IsQ0FBQyxLQUF1QixFQUFFLE9BQWtDLEVBQUUsUUFBcUMsRUFBRSxLQUF3QjtnQkFDcEosTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBRXBDLDBFQUEwRTtnQkFDMUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUNuQyxHQUFHLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEVBQzdCLENBQUMsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUM3QyxZQUFZLENBQ1osQ0FBQyxDQUFDO2dCQUVILHlEQUF5RDtnQkFDekQsNkVBQTZFO2dCQUM3RSx1RUFBdUU7Z0JBQ3ZFLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FDbkMsR0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxFQUNwQyxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFDN0Msa0JBQWtCLENBQ2xCLENBQUMsQ0FBQztnQkFFSCxPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7U0FDRCxDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQWU7WUFDekIsSUFBSSx3QkFBZ0I7WUFDcEIsY0FBYyxFQUFFO2dCQUNmLE9BQU8sRUFBRSxHQUFHO2FBQ1o7WUFDRCxhQUFhLEVBQUU7Z0JBQ2QsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTthQUNoQztTQUNELENBQUM7UUFFRixNQUFNLENBQUMsR0FBRyxJQUFJLHVCQUF1QixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RCxtRkFBbUY7UUFDbkYsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDMUIsZUFBZSxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUM7UUFDbkMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTNCLHVEQUF1RDtRQUN2RCw2REFBNkQ7UUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEMsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0FBQzNDLENBQUMsQ0FBQyxDQUFDIn0=