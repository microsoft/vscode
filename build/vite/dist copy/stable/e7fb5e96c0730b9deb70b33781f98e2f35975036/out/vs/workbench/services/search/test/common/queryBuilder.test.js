/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as glob from '../../../../../base/common/glob.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { escapeGlobPattern, resolveResourcesForSearchIncludes } from '../../common/queryBuilder.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
suite('QueryBuilderCommon', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let context;
    setup(() => {
        const workspace = testWorkspace(URI.file(isWindows ? 'C:\\testWorkspace' : '/testWorkspace'));
        context = new TestContextService(workspace);
    });
    test('resolveResourcesForSearchIncludes passes through paths without special glob characters', () => {
        const actual = resolveResourcesForSearchIncludes([URI.file(isWindows ? 'C:\\testWorkspace\\pages\\blog' : '/testWorkspace/pages/blog')], context);
        assert.deepStrictEqual(actual, ['./pages/blog']);
    });
    test('resolveResourcesForSearchIncludes escapes paths with special characters', () => {
        const actual = resolveResourcesForSearchIncludes([URI.file(isWindows ? 'C:\\testWorkspace\\pages\\blog\\[postId]' : '/testWorkspace/pages/blog/[postId]')], context);
        assert.deepStrictEqual(actual, ['./pages/blog/[[]postId[]]']);
    });
    test('escapeGlobPattern properly escapes square brackets for literal matching', () => {
        // This test verifies the fix for issue #233049 where files with square brackets in names
        // were not found when using "Search Only in Open Editors"
        // Test file name with square brackets
        const fileName = 'file[test].txt';
        // Without escaping, the pattern treats [test] as a character class
        const unescapedResult = glob.match(fileName, fileName);
        assert.strictEqual(unescapedResult, false, 'Unescaped pattern should not match due to character class interpretation');
        // With escaping, the pattern matches literally
        const escapedPattern = escapeGlobPattern(fileName);
        const escapedResult = glob.match(escapedPattern, fileName);
        assert.strictEqual(escapedResult, true, 'Escaped pattern should match literally');
        assert.strictEqual(escapedPattern, 'file[[]test[]].txt', 'Pattern should have escaped brackets');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVlcnlCdWlsZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3QvY29tbW9uL3F1ZXJ5QnVpbGRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3BHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXRGLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsdUNBQXVDLEVBQUUsQ0FBQztJQUMxQyxJQUFJLE9BQWlDLENBQUM7SUFFdEMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUM5RixPQUFPLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM3QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3RkFBd0YsRUFBRSxHQUFHLEVBQUU7UUFDbkcsTUFBTSxNQUFNLEdBQUcsaUNBQWlDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNsSixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUVBQXlFLEVBQUUsR0FBRyxFQUFFO1FBQ3BGLE1BQU0sTUFBTSxHQUFHLGlDQUFpQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLDBDQUEwQyxDQUFDLENBQUMsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDckssTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUVBQXlFLEVBQUUsR0FBRyxFQUFFO1FBQ3BGLHlGQUF5RjtRQUN6RiwwREFBMEQ7UUFFMUQsc0NBQXNDO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDO1FBRWxDLG1FQUFtRTtRQUNuRSxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxLQUFLLEVBQUUsMEVBQTBFLENBQUMsQ0FBQztRQUV2SCwrQ0FBK0M7UUFDL0MsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztJQUNsRyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=