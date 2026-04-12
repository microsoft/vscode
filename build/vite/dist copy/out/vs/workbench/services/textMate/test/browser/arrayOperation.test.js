/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MonotonousIndexTransformer } from '../../browser/indexTransformer.js';
import { LengthEdit, LengthReplacement } from '../../../../../editor/common/core/edits/lengthEdit.js';
suite('array operation', () => {
    function seq(start, end) {
        const result = [];
        for (let i = start; i < end; i++) {
            result.push(i);
        }
        return result;
    }
    test('simple', () => {
        const edit = LengthEdit.create([
            LengthReplacement.create(4, 7, 2),
            LengthReplacement.create(8, 8, 2),
            LengthReplacement.create(9, 11, 0),
        ]);
        const arr = seq(0, 15).map(x => `item${x}`);
        const newArr = edit.applyArray(arr, undefined);
        assert.deepStrictEqual(newArr, [
            'item0',
            'item1',
            'item2',
            'item3',
            undefined,
            undefined,
            'item7',
            undefined,
            undefined,
            'item8',
            'item11',
            'item12',
            'item13',
            'item14',
        ]);
        const transformer = new MonotonousIndexTransformer(edit);
        assert.deepStrictEqual(seq(0, 15).map((x) => {
            const t = transformer.transform(x);
            let r = `arr[${x}]: ${arr[x]} -> `;
            if (t !== undefined) {
                r += `newArr[${t}]: ${newArr[t]}`;
            }
            else {
                r += 'undefined';
            }
            return r;
        }), [
            'arr[0]: item0 -> newArr[0]: item0',
            'arr[1]: item1 -> newArr[1]: item1',
            'arr[2]: item2 -> newArr[2]: item2',
            'arr[3]: item3 -> newArr[3]: item3',
            'arr[4]: item4 -> undefined',
            'arr[5]: item5 -> undefined',
            'arr[6]: item6 -> undefined',
            'arr[7]: item7 -> newArr[6]: item7',
            'arr[8]: item8 -> newArr[9]: item8',
            'arr[9]: item9 -> undefined',
            'arr[10]: item10 -> undefined',
            'arr[11]: item11 -> newArr[10]: item11',
            'arr[12]: item12 -> newArr[11]: item12',
            'arr[13]: item13 -> newArr[12]: item13',
            'arr[14]: item14 -> newArr[13]: item14',
        ]);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJyYXlPcGVyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS90ZXN0L2Jyb3dzZXIvYXJyYXlPcGVyYXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRXRHLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsU0FBUyxHQUFHLENBQUMsS0FBYSxFQUFFLEdBQVc7UUFDdEMsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtRQUNuQixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO1lBQzlCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO1lBQzlCLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxTQUFTO1lBQ1QsU0FBUztZQUNULE9BQU87WUFDUCxTQUFTO1lBQ1QsU0FBUztZQUNULE9BQU87WUFDUCxRQUFRO1lBQ1IsUUFBUTtZQUNSLFFBQVE7WUFDUixRQUFRO1NBQ1IsQ0FBQyxDQUFDO1FBRUgsTUFBTSxXQUFXLEdBQUcsSUFBSSwwQkFBMEIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsZUFBZSxDQUNyQixHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3BCLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbkMsSUFBSSxDQUFDLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3JCLENBQUMsSUFBSSxVQUFVLENBQUMsTUFBTSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsQ0FBQyxJQUFJLFdBQVcsQ0FBQztZQUNsQixDQUFDO1lBQ0QsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDLENBQUMsRUFDRjtZQUNDLG1DQUFtQztZQUNuQyxtQ0FBbUM7WUFDbkMsbUNBQW1DO1lBQ25DLG1DQUFtQztZQUNuQyw0QkFBNEI7WUFDNUIsNEJBQTRCO1lBQzVCLDRCQUE0QjtZQUM1QixtQ0FBbUM7WUFDbkMsbUNBQW1DO1lBQ25DLDRCQUE0QjtZQUM1Qiw4QkFBOEI7WUFDOUIsdUNBQXVDO1lBQ3ZDLHVDQUF1QztZQUN2Qyx1Q0FBdUM7WUFDdkMsdUNBQXVDO1NBQ3ZDLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9