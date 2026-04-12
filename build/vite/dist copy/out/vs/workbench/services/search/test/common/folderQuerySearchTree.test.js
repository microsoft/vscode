/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import assert from 'assert';
import { FolderQuerySearchTree } from '../../common/folderQuerySearchTree.js';
suite('FolderQuerySearchTree', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const fq1 = { folder: URI.parse('file:///folder1?query1#fragment1') };
    const fq2 = { folder: URI.parse('file:///folder2?query2#fragment2') };
    const fq3 = { folder: URI.parse('file:///folder3?query3#fragment3') };
    const fq4 = { folder: URI.parse('file:///folder3?query3') };
    const fq5 = { folder: URI.parse('file:///folder3') };
    const folderQueries = [
        fq1,
        fq2,
        fq3,
        fq4,
        fq5,
    ];
    const getFolderQueryInfo = (fq, i) => ({ folder: fq.folder, index: i });
    test('find query fragment aware substr correctly', () => {
        const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
        const result = tree.findQueryFragmentAwareSubstr(fq1.folder);
        const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1/foo/bar?query1#fragment1'));
        assert.deepStrictEqual(result, { folder: fq1.folder, index: 0 });
        assert.deepStrictEqual(result2, { folder: fq1.folder, index: 0 });
    });
    test('do not to URIs that do not have queries if the base has query', () => {
        const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
        const result = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1'));
        const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder1?query1'));
        assert.deepStrictEqual(result, undefined);
        assert.deepStrictEqual(result2, undefined);
    });
    test('match correct entry with query/fragment', () => {
        const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
        const result = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt?query3#fragment3'));
        assert.deepStrictEqual(result, { folder: fq3.folder, index: 2 });
        const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt?query3'));
        assert.deepStrictEqual(result2, { folder: fq4.folder, index: 3 });
        const result3 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/file.txt'));
        assert.deepStrictEqual(result3, { folder: fq5.folder, index: 4 });
    });
    test('can find substr of non-query/fragment URIs', () => {
        const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
        const result = tree.findQueryFragmentAwareSubstr(fq5.folder);
        const result2 = tree.findQueryFragmentAwareSubstr(URI.parse('file:///folder3/hello/world'));
        assert.deepStrictEqual(result, { folder: fq5.folder, index: 4 });
        assert.deepStrictEqual(result2, { folder: fq5.folder, index: 4 });
    });
    test('iterate over all folderQueryInfo correctly', () => {
        const tree = new FolderQuerySearchTree(folderQueries, getFolderQueryInfo);
        const results = [];
        tree.forEachFolderQueryInfo(info => results.push(info));
        assert.equal(results.length, 5);
        assert.deepStrictEqual(results, folderQueries.map((fq, i) => getFolderQueryInfo(fq, i)));
    });
    test('`/` as a path', () => {
        const trie = new FolderQuerySearchTree([{ folder: URI.parse('memfs:/?q=1') }], getFolderQueryInfo);
        assert.deepStrictEqual(trie.findQueryFragmentAwareSubstr(URI.parse('memfs:/file.txt?q=1')), { folder: URI.parse('memfs:/?q=1'), index: 0 });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGVyUXVlcnlTZWFyY2hUcmVlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3QvY29tbW9uL2ZvbGRlclF1ZXJ5U2VhcmNoVHJlZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHOUUsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNuQyx1Q0FBdUMsRUFBRSxDQUFDO0lBQzFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsRUFBRSxDQUFDO0lBQ3RFLE1BQU0sR0FBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsRUFBRSxDQUFDO0lBQ3RFLE1BQU0sR0FBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsRUFBRSxDQUFDO0lBQ3RFLE1BQU0sR0FBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsRUFBRSxDQUFDO0lBQzVELE1BQU0sR0FBRyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDO0lBRXJELE1BQU0sYUFBYSxHQUF3QjtRQUMxQyxHQUFHO1FBQ0gsR0FBRztRQUNILEdBQUc7UUFDSCxHQUFHO1FBQ0gsR0FBRztLQUNILENBQUM7SUFFRixNQUFNLGtCQUFrQixHQUFHLENBQUMsRUFBcUIsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVuRyxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELE1BQU0sSUFBSSxHQUFHLElBQUkscUJBQXFCLENBQUMsYUFBYSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLENBQUM7UUFDekcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtEQUErRCxFQUFFLEdBQUcsRUFBRTtRQUMxRSxNQUFNLElBQUksR0FBRyxJQUFJLHFCQUFxQixDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUMvRSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1FBQ3BELE1BQU0sSUFBSSxHQUFHLElBQUkscUJBQXFCLENBQUMsYUFBYSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO1FBQ3pHLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFakUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxDQUFDO1FBQ2hHLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbkUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELE1BQU0sSUFBSSxHQUFHLElBQUkscUJBQXFCLENBQUMsYUFBYSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLENBQUM7UUFDNUYsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxNQUFNLElBQUksR0FBRyxJQUFJLHFCQUFxQixDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sT0FBTyxHQUFVLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFGLENBQUMsQ0FBQyxDQUFDO0lBR0gsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFbkcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUM3SSxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=